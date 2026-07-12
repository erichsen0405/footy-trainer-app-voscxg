-- Issue #285 follow-up: complete standalone task/exercise materialization and
-- replace broad retry cleanup with a narrowly proven, in-place legacy repair.

create or replace function public.enroll_training_program_atomic(
  p_owner_account_id uuid,
  p_program_id uuid,
  p_program_version_id uuid,
  p_source_team_id uuid,
  p_start_date date,
  p_enrolled_by uuid,
  p_player_plans jsonb
)
returns table (
  enrollment_id uuid,
  player_id uuid,
  reused boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $safe_program_enrollment$
declare
  v_player_plan jsonb;
  v_player_id uuid;
  v_items jsonb;
  v_item jsonb;
  v_activity jsonb;
  v_standalone_task jsonb;
  v_tasks jsonb;
  v_task jsonb;
  v_subtasks jsonb;
  v_existing_enrollment_id uuid;
  v_existing_status text;
  v_existing_program_version_id uuid;
  v_existing_created_at timestamptz;
  v_existing_updated_at timestamptz;
  v_existing_paused_at timestamptz;
  v_existing_completed_at timestamptz;
  v_enrollment_id uuid;
  v_enrollment_item_id uuid;
  v_activity_id uuid;
  v_task_id uuid;
  v_activity_task_id uuid;
  v_task_template_match_id uuid;
  v_training_template_match_id uuid;
  v_source_category_id uuid;
  v_player_category_id uuid;
  v_player_category_ids uuid[];
  v_category_text text;
  v_program_item_id uuid;
  v_task_template_id uuid;
  v_training_template_id uuid;
  v_seen_task_template_ids uuid[];
  v_seen_training_template_ids uuid[];
  v_scheduled_date date;
  v_item_type text;
  v_item_title text;
  v_snapshot jsonb;
  v_expected_count integer;
  v_distinct_expected_count integer;
  v_actual_count integer;
  v_matched_count integer;
  v_expected_activity_count integer;
  v_linked_activity_count integer;
  v_expected_activity_task_count integer;
  v_matched_activity_task_count integer;
  v_expected_standalone_task_count integer;
  v_linked_standalone_task_count integer;
  v_legacy_item_timestamps integer;
  v_legacy_items_safe boolean;
  v_repair_legacy boolean;
  v_updated_count integer;
begin
  if p_owner_account_id is null
     or p_program_id is null
     or p_program_version_id is null
     or p_start_date is null
     or p_enrolled_by is null then
    raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Required enrollment identifiers are missing.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_player_plans) is distinct from 'array'
     or jsonb_array_length(p_player_plans) = 0 then
    raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: player plans must be a non-empty array.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.training_programs tp
    join public.program_versions pv
      on pv.owner_account_id = tp.owner_account_id
     and pv.program_id = tp.id
     and pv.version_number = tp.published_version
    where tp.id = p_program_id
      and tp.owner_account_id = p_owner_account_id
      and tp.status = 'published'
      and pv.id = p_program_version_id
  ) then
    raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Current published program version was not found.'
      using errcode = '22023';
  end if;

  if p_source_team_id is not null and not exists (
    select 1
    from public.owner_accounts oa
    join public.teams t on t.club_id = oa.club_id
    where oa.id = p_owner_account_id
      and t.id = p_source_team_id
  ) then
    raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Source team does not belong to this owner.'
      using errcode = '22023';
  end if;

  for v_player_plan in
    select plan.value
    from jsonb_array_elements(p_player_plans) as plan(value)
    order by plan.value ->> 'playerId'
  loop
    begin
      v_player_id := nullif(v_player_plan ->> 'playerId', '')::uuid;
    exception when others then
      raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: playerId must be a UUID.'
        using errcode = '22023';
    end;

    if v_player_id is null or not exists (
      select 1
      from public.owner_players op
      where op.owner_account_id = p_owner_account_id
        and op.player_id = v_player_id
        and op.status = 'active'
    ) then
      raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Every player must be active for this owner.'
        using errcode = '22023';
    end if;

    v_items := coalesce(v_player_plan -> 'items', '[]'::jsonb);
    if jsonb_typeof(v_items) is distinct from 'array'
       or jsonb_array_length(v_items) = 0 then
      raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Every player plan must contain program items.'
        using errcode = '22023';
    end if;

    v_expected_count := jsonb_array_length(v_items);
    select count(distinct planned.value ->> 'programItemId')::integer
      into v_distinct_expected_count
    from jsonb_array_elements(v_items) as planned(value);
    if v_distinct_expected_count <> v_expected_count then
      raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Program item IDs must be unique in every player plan.'
        using errcode = '22023';
    end if;

    perform pg_advisory_xact_lock(
      hashtextextended(
        p_program_id::text || ':' || v_player_id::text || ':' || p_start_date::text,
        0
      )
    );

    select
      pe.id,
      pe.status,
      pe.program_version_id,
      pe.created_at,
      pe.updated_at,
      pe.paused_at,
      pe.completed_at
      into
        v_existing_enrollment_id,
        v_existing_status,
        v_existing_program_version_id,
        v_existing_created_at,
        v_existing_updated_at,
        v_existing_paused_at,
        v_existing_completed_at
    from public.program_enrollments pe
    where pe.owner_account_id = p_owner_account_id
      and pe.program_id = p_program_id
      and pe.player_id = v_player_id
      and pe.start_date = p_start_date
    limit 1;

    v_repair_legacy := false;
    if v_existing_enrollment_id is not null then
      if v_existing_program_version_id is distinct from p_program_version_id then
        raise exception 'PROGRAM_ENROLLMENT_EXISTS: Existing enrollment belongs to a different published program version.'
          using errcode = '23505';
      end if;

      select count(*)::integer
        into v_actual_count
      from public.program_enrollment_items pei
      where pei.owner_account_id = p_owner_account_id
        and pei.enrollment_id = v_existing_enrollment_id;

      select count(*)::integer
        into v_matched_count
      from jsonb_array_elements(v_items) as planned(value)
      join public.program_enrollment_items pei
        on pei.owner_account_id = p_owner_account_id
       and pei.enrollment_id = v_existing_enrollment_id
       and pei.program_item_id::text = planned.value ->> 'programItemId'
       and pei.scheduled_date::text = planned.value ->> 'scheduledDate'
       and pei.item_type = planned.value ->> 'itemType'
       and pei.title = planned.value ->> 'title';

      select count(*)::integer
        into v_expected_activity_count
      from jsonb_array_elements(v_items) as planned(value)
      where jsonb_typeof(planned.value -> 'activity') = 'object';

      select count(*)::integer
        into v_linked_activity_count
      from jsonb_array_elements(v_items) as planned(value)
      join public.program_enrollment_items pei
        on pei.owner_account_id = p_owner_account_id
       and pei.enrollment_id = v_existing_enrollment_id
       and pei.program_item_id::text = planned.value ->> 'programItemId'
      join public.activities activity
        on activity.id = pei.activity_id
       and activity.user_id = v_player_id
       and activity.player_id = v_player_id
       and activity.activity_date::text = planned.value ->> 'scheduledDate'
      where jsonb_typeof(planned.value -> 'activity') = 'object';

      select count(*)::integer
        into v_expected_activity_task_count
      from jsonb_array_elements(v_items) as planned(value)
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(planned.value -> 'activity' -> 'tasks') = 'array'
            then planned.value -> 'activity' -> 'tasks'
          else '[]'::jsonb
        end
      ) as expected_task(value)
      where jsonb_typeof(planned.value -> 'activity') = 'object';

      select count(*)::integer
        into v_matched_activity_task_count
      from jsonb_array_elements(v_items) as planned(value)
      join public.program_enrollment_items pei
        on pei.owner_account_id = p_owner_account_id
       and pei.enrollment_id = v_existing_enrollment_id
       and pei.program_item_id::text = planned.value ->> 'programItemId'
       and pei.scheduled_date::text = planned.value ->> 'scheduledDate'
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(planned.value -> 'activity' -> 'tasks') = 'array'
            then planned.value -> 'activity' -> 'tasks'
          else '[]'::jsonb
        end
      ) as expected_task(value)
      where jsonb_typeof(planned.value -> 'activity') = 'object'
        and pei.activity_id is not null
        and exists (
          select 1
          from public.activity_tasks activity_task
          where activity_task.activity_id = pei.activity_id
            and activity_task.title = expected_task.value ->> 'title'
            and activity_task.is_feedback_task is not true
            and (
              nullif(expected_task.value ->> 'taskTemplateId', '') is null
              or activity_task.task_template_id::text = expected_task.value ->> 'taskTemplateId'
            )
            and (
              nullif(expected_task.value ->> 'trainingTemplateId', '') is null
              or activity_task.training_template_id::text = expected_task.value ->> 'trainingTemplateId'
            )
        );

      select count(*)::integer
        into v_expected_standalone_task_count
      from jsonb_array_elements(v_items) as planned(value)
      where jsonb_typeof(planned.value -> 'task') = 'object';

      select count(*)::integer
        into v_linked_standalone_task_count
      from jsonb_array_elements(v_items) as planned(value)
      join public.program_enrollment_items pei
        on pei.owner_account_id = p_owner_account_id
       and pei.enrollment_id = v_existing_enrollment_id
       and pei.program_item_id::text = planned.value ->> 'programItemId'
      join public.tasks standalone
        on standalone.id = pei.task_id
       and standalone.user_id = v_player_id
      where jsonb_typeof(planned.value -> 'task') = 'object';

      if v_actual_count = v_expected_count
         and v_matched_count = v_expected_count
         and v_linked_activity_count = v_expected_activity_count
         and v_matched_activity_task_count = v_expected_activity_task_count
         and v_linked_standalone_task_count = v_expected_standalone_task_count then
        if v_existing_status in ('completed', 'cancelled') then
          raise exception 'PROGRAM_ENROLLMENT_EXISTS: Enrollment history already exists for this player and start date.'
            using errcode = '23505';
        end if;

        enrollment_id := v_existing_enrollment_id;
        player_id := v_player_id;
        reused := true;
        return next;
        v_existing_enrollment_id := null;
        continue;
      end if;

      select
        coalesce(bool_and(
          pei.status = 'upcoming'
          and pei.activity_id is null
          and pei.task_id is null
          and pei.updated_at = pei.created_at
          and pei.created_at >= v_existing_created_at
          and pei.created_at <= v_existing_created_at + interval '2 minutes'
        ), false),
        count(distinct pei.created_at)::integer
        into v_legacy_items_safe, v_legacy_item_timestamps
      from public.program_enrollment_items pei
      where pei.owner_account_id = p_owner_account_id
        and pei.enrollment_id = v_existing_enrollment_id;

      v_repair_legacy :=
        v_existing_status = 'active'
        and v_existing_paused_at is null
        and v_existing_completed_at is null
        and v_existing_created_at < timestamptz '2026-07-12 19:59:48+00'
        and v_existing_updated_at = v_existing_created_at
        and v_actual_count = v_expected_count
        and v_matched_count = v_expected_count
        and v_expected_activity_count > 0
        and v_legacy_items_safe
        and v_legacy_item_timestamps = 1
        and not exists (
          select 1
          from jsonb_array_elements(v_items) as planned(value)
          join public.activities activity
            on activity.user_id = v_player_id
           and activity.player_id = v_player_id
           and activity.activity_date::text = planned.value ->> 'scheduledDate'
           and activity.title = planned.value -> 'activity' ->> 'title'
           and activity.created_at >= v_existing_created_at
          where jsonb_typeof(planned.value -> 'activity') = 'object'
        );

      if not v_repair_legacy then
        raise exception 'PROGRAM_ENROLLMENT_EXISTS: Existing enrollment is incomplete or has player progress and was preserved.'
          using errcode = '23505';
      end if;

      v_enrollment_id := v_existing_enrollment_id;
    else
      insert into public.program_enrollments (
        owner_account_id,
        program_id,
        program_version_id,
        player_id,
        source_team_id,
        start_date,
        status,
        enrolled_by
      ) values (
        p_owner_account_id,
        p_program_id,
        p_program_version_id,
        v_player_id,
        p_source_team_id,
        p_start_date,
        'active',
        p_enrolled_by
      )
      returning id into v_enrollment_id;
    end if;

    for v_item in
      select item.value
      from jsonb_array_elements(v_items) as item(value)
    loop
      begin
        v_program_item_id := nullif(v_item ->> 'programItemId', '')::uuid;
        v_scheduled_date := nullif(v_item ->> 'scheduledDate', '')::date;
      exception when others then
        raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Program item ID and scheduled date are required.'
          using errcode = '22023';
      end;
      v_item_type := nullif(btrim(v_item ->> 'itemType'), '');
      v_item_title := nullif(btrim(v_item ->> 'title'), '');
      v_snapshot := case
        when jsonb_typeof(v_item -> 'snapshot') = 'object' then v_item -> 'snapshot'
        else '{}'::jsonb
      end;

      if v_program_item_id is null
         or v_scheduled_date is null
         or v_item_type is null
         or v_item_title is null then
        raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Program item fields are incomplete.'
          using errcode = '22023';
      end if;

      if v_repair_legacy then
        v_enrollment_item_id := null;
        select pei.id
          into v_enrollment_item_id
        from public.program_enrollment_items pei
        where pei.owner_account_id = p_owner_account_id
          and pei.enrollment_id = v_enrollment_id
          and pei.program_item_id = v_program_item_id
          and pei.scheduled_date = v_scheduled_date
          and pei.item_type = v_item_type
          and pei.title = v_item_title
          and pei.status = 'upcoming'
          and pei.activity_id is null
          and pei.task_id is null
        limit 1;
        if v_enrollment_item_id is null then
          raise exception 'PROGRAM_ENROLLMENT_WRITE_FAILED: Legacy enrollment item could not be repaired.';
        end if;
      else
        insert into public.program_enrollment_items (
          owner_account_id,
          enrollment_id,
          program_item_id,
          player_id,
          scheduled_date,
          item_type,
          title,
          snapshot
        ) values (
          p_owner_account_id,
          v_enrollment_id,
          v_program_item_id,
          v_player_id,
          v_scheduled_date,
          v_item_type,
          v_item_title,
          v_snapshot
        )
        returning id into v_enrollment_item_id;
      end if;

      v_standalone_task := v_item -> 'task';
      if jsonb_typeof(v_standalone_task) = 'object' then
        if nullif(btrim(v_standalone_task ->> 'title'), '') is null then
          raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Standalone task title is required.'
            using errcode = '22023';
        end if;

        v_player_category_ids := array[]::uuid[];
        for v_category_text in
          select category.value
          from jsonb_array_elements_text(
            case
              when jsonb_typeof(v_standalone_task -> 'categoryIds') = 'array'
                then v_standalone_task -> 'categoryIds'
              else '[]'::jsonb
            end
          ) as category(value)
        loop
          begin
            v_source_category_id := v_category_text::uuid;
          exception when others then
            raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Standalone task category IDs must be UUIDs.'
              using errcode = '22023';
          end;
          v_player_category_id := public.ensure_player_category_copy(v_source_category_id, v_player_id);
          if v_player_category_id is not null and not (v_player_category_id = any(v_player_category_ids)) then
            v_player_category_ids := array_append(v_player_category_ids, v_player_category_id);
          end if;
        end loop;

        v_subtasks := case
          when jsonb_typeof(v_standalone_task -> 'subtasks') = 'array' then v_standalone_task -> 'subtasks'
          else '[]'::jsonb
        end;
        insert into public.tasks (
          user_id,
          title,
          description,
          completed,
          is_template,
          category_ids,
          reminder_minutes,
          subtasks
        ) values (
          v_player_id,
          btrim(v_standalone_task ->> 'title'),
          coalesce(v_standalone_task ->> 'description', ''),
          false,
          false,
          v_player_category_ids,
          nullif(v_standalone_task ->> 'reminderMinutes', '')::integer,
          v_subtasks
        )
        returning id into v_task_id;

        update public.program_enrollment_items pei
        set task_id = v_task_id,
            snapshot = v_snapshot
        where pei.owner_account_id = p_owner_account_id
          and pei.id = v_enrollment_item_id
          and pei.activity_id is null
          and pei.task_id is null;
        get diagnostics v_updated_count = row_count;
        if v_updated_count <> 1 then
          raise exception 'PROGRAM_ENROLLMENT_WRITE_FAILED: Could not link materialized standalone task.';
        end if;
      end if;

      v_activity := v_item -> 'activity';
      if jsonb_typeof(v_activity) = 'object' then
        if jsonb_typeof(v_standalone_task) = 'object' then
          raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: A program item cannot materialize both a task and an activity.'
            using errcode = '22023';
        end if;
        if nullif(btrim(v_activity ->> 'activityTime'), '') is null then
          raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: activityTime is required for materialized sessions.'
            using errcode = '22023';
        end if;

        begin
          v_source_category_id := nullif(v_activity ->> 'sourceCategoryId', '')::uuid;
        exception when others then
          raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: sourceCategoryId must be a UUID.'
            using errcode = '22023';
        end;
        v_player_category_id := public.ensure_player_category_copy(v_source_category_id, v_player_id);

        insert into public.activities (
          user_id,
          player_id,
          team_id,
          title,
          activity_date,
          activity_time,
          activity_end_time,
          location,
          category_id,
          intensity,
          intensity_enabled,
          intensity_note,
          is_external,
          source_activity_id,
          series_id,
          series_instance_date
        ) values (
          v_player_id,
          v_player_id,
          p_source_team_id,
          coalesce(nullif(btrim(v_activity ->> 'title'), ''), v_item_title),
          v_scheduled_date,
          (v_activity ->> 'activityTime')::time,
          nullif(v_activity ->> 'activityEndTime', ''),
          nullif(v_activity ->> 'location', ''),
          v_player_category_id,
          null,
          false,
          null,
          false,
          null,
          null,
          null
        )
        returning id into v_activity_id;

        v_tasks := coalesce(v_activity -> 'tasks', '[]'::jsonb);
        if jsonb_typeof(v_tasks) is distinct from 'array' then
          raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: activity tasks must be an array.'
            using errcode = '22023';
        end if;
        v_seen_task_template_ids := array[]::uuid[];
        v_seen_training_template_ids := array[]::uuid[];

        for v_task in
          select task.value
          from jsonb_array_elements(v_tasks) as task(value)
          order by coalesce((task.value ->> 'sortOrder')::integer, 0)
        loop
          if nullif(btrim(v_task ->> 'title'), '') is null then
            raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Materialized task title is required.'
              using errcode = '22023';
          end if;

          begin
            v_task_template_id := nullif(v_task ->> 'taskTemplateId', '')::uuid;
            v_training_template_id := nullif(v_task ->> 'trainingTemplateId', '')::uuid;
          exception when others then
            raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Materialized template IDs must be UUIDs.'
              using errcode = '22023';
          end;
          if v_task_template_id is not null and v_task_template_id = any(v_seen_task_template_ids) then
            raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Session task template identities must be unique.'
              using errcode = '22023';
          end if;
          if v_training_template_id is not null and v_training_template_id = any(v_seen_training_template_ids) then
            raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Session training template identities must be unique.'
              using errcode = '22023';
          end if;
          if v_task_template_id is not null then
            v_seen_task_template_ids := array_append(v_seen_task_template_ids, v_task_template_id);
          end if;
          if v_training_template_id is not null then
            v_seen_training_template_ids := array_append(v_seen_training_template_ids, v_training_template_id);
          end if;

          v_task_template_match_id := null;
          v_training_template_match_id := null;
          if v_task_template_id is not null then
            select at.id into v_task_template_match_id
            from public.activity_tasks at
            where at.activity_id = v_activity_id
              and at.task_template_id = v_task_template_id
            order by at.created_at, at.id
            limit 1;
          end if;
          if v_training_template_id is not null then
            select at.id into v_training_template_match_id
            from public.activity_tasks at
            where at.activity_id = v_activity_id
              and at.training_template_id = v_training_template_id
            order by at.created_at, at.id
            limit 1;
          end if;
          if v_task_template_match_id is not null
             and v_training_template_match_id is not null
             and v_task_template_match_id <> v_training_template_match_id then
            delete from public.activity_tasks at
            where at.id = v_training_template_match_id;
            v_training_template_match_id := null;
          end if;
          v_activity_task_id := coalesce(v_task_template_match_id, v_training_template_match_id);

          if v_activity_task_id is null then
            insert into public.activity_tasks (
              activity_id,
              title,
              description,
              completed,
              reminder_minutes,
              task_template_id,
              training_template_id,
              training_template_type,
              exercise_timer,
              video_urls,
              media_names,
              after_training_enabled,
              after_training_delay_minutes,
              task_duration_enabled,
              task_duration_minutes,
              feedback_template_id,
              is_feedback_task,
              template_sync_enabled
            ) values (
              v_activity_id,
              btrim(v_task ->> 'title'),
              coalesce(v_task ->> 'description', ''),
              false,
              nullif(v_task ->> 'reminderMinutes', '')::integer,
              null,
              v_training_template_id,
              nullif(v_task ->> 'trainingTemplateType', ''),
              case when jsonb_typeof(v_task -> 'exerciseTimer') = 'object' then v_task -> 'exerciseTimer' else null end,
              case when jsonb_typeof(v_task -> 'videoUrls') = 'array' then v_task -> 'videoUrls' else '[]'::jsonb end,
              array(select media.value from jsonb_array_elements_text(case when jsonb_typeof(v_task -> 'mediaNames') = 'array' then v_task -> 'mediaNames' else '[]'::jsonb end) as media(value)),
              coalesce((v_task ->> 'afterTrainingEnabled')::boolean, false),
              nullif(v_task ->> 'afterTrainingDelayMinutes', '')::integer,
              coalesce((v_task ->> 'taskDurationEnabled')::boolean, false),
              nullif(v_task ->> 'taskDurationMinutes', '')::integer,
              null,
              false,
              false
            )
            returning id into v_activity_task_id;
          end if;

          update public.activity_tasks at
          set title = btrim(v_task ->> 'title'),
              description = coalesce(v_task ->> 'description', ''),
              completed = false,
              reminder_minutes = nullif(v_task ->> 'reminderMinutes', '')::integer,
              task_template_id = v_task_template_id,
              training_template_id = v_training_template_id,
              training_template_type = nullif(v_task ->> 'trainingTemplateType', ''),
              exercise_timer = case when jsonb_typeof(v_task -> 'exerciseTimer') = 'object' then v_task -> 'exerciseTimer' else null end,
              video_urls = case when jsonb_typeof(v_task -> 'videoUrls') = 'array' then v_task -> 'videoUrls' else '[]'::jsonb end,
              media_names = array(select media.value from jsonb_array_elements_text(case when jsonb_typeof(v_task -> 'mediaNames') = 'array' then v_task -> 'mediaNames' else '[]'::jsonb end) as media(value)),
              after_training_enabled = coalesce((v_task ->> 'afterTrainingEnabled')::boolean, false),
              after_training_delay_minutes = nullif(v_task ->> 'afterTrainingDelayMinutes', '')::integer,
              task_duration_enabled = coalesce((v_task ->> 'taskDurationEnabled')::boolean, false),
              task_duration_minutes = nullif(v_task ->> 'taskDurationMinutes', '')::integer,
              feedback_template_id = null,
              is_feedback_task = false,
              template_sync_enabled = false,
              updated_at = now()
          where at.id = v_activity_task_id;

          delete from public.activity_task_subtasks ats
          where ats.activity_task_id = v_activity_task_id;
          v_subtasks := case when jsonb_typeof(v_task -> 'subtasks') = 'array' then v_task -> 'subtasks' else '[]'::jsonb end;
          insert into public.activity_task_subtasks (activity_task_id, title, completed, sort_order)
          select
            v_activity_task_id,
            btrim(subtask.value ->> 'title'),
            false,
            coalesce(nullif(subtask.value ->> 'sortOrder', '')::integer, subtask.ordinality::integer - 1)
          from jsonb_array_elements(v_subtasks) with ordinality as subtask(value, ordinality)
          where nullif(btrim(subtask.value ->> 'title'), '') is not null;

          if v_task_template_id is not null then
            delete from public.activity_tasks feedback
            where feedback.activity_id = v_activity_id
              and feedback.id <> v_activity_task_id
              and (
                feedback.feedback_template_id = v_task_template_id
                or (feedback.task_template_id is null and feedback.description like '%[auto-after-training:' || v_task_template_id::text || ']%')
              );
            if coalesce((v_task ->> 'afterTrainingEnabled')::boolean, false) then
              insert into public.activity_tasks (
                activity_id,
                task_template_id,
                feedback_template_id,
                is_feedback_task,
                title,
                description,
                completed,
                reminder_minutes,
                template_sync_enabled
              ) values (
                v_activity_id,
                null,
                v_task_template_id,
                true,
                'Feedback på ' || btrim(v_task ->> 'title'),
                'Del din feedback efter træningen direkte til træneren. [auto-after-training:' || v_task_template_id::text || ']',
                false,
                nullif(v_task ->> 'afterTrainingDelayMinutes', '')::integer,
                false
              );
            end if;
          end if;
        end loop;

        update public.program_enrollment_items pei
        set activity_id = v_activity_id,
            snapshot = v_snapshot
        where pei.owner_account_id = p_owner_account_id
          and pei.id = v_enrollment_item_id
          and pei.activity_id is null
          and pei.task_id is null;
        get diagnostics v_updated_count = row_count;
        if v_updated_count <> 1 then
          raise exception 'PROGRAM_ENROLLMENT_WRITE_FAILED: Could not link materialized activity.';
        end if;
      end if;

      if jsonb_typeof(v_standalone_task) is distinct from 'object'
         and jsonb_typeof(v_activity) is distinct from 'object'
         and v_repair_legacy then
        update public.program_enrollment_items pei
        set snapshot = v_snapshot
        where pei.owner_account_id = p_owner_account_id
          and pei.id = v_enrollment_item_id
          and pei.status = 'upcoming'
          and pei.activity_id is null
          and pei.task_id is null;
        get diagnostics v_updated_count = row_count;
        if v_updated_count <> 1 then
          raise exception 'PROGRAM_ENROLLMENT_WRITE_FAILED: Could not refresh legacy enrollment item snapshot.';
        end if;
      end if;
    end loop;

    enrollment_id := v_enrollment_id;
    player_id := v_player_id;
    reused := false;
    return next;

    v_existing_enrollment_id := null;
    v_existing_status := null;
    v_existing_program_version_id := null;
    v_existing_created_at := null;
    v_existing_updated_at := null;
    v_existing_paused_at := null;
    v_existing_completed_at := null;
    v_repair_legacy := false;
  end loop;

  return;
end;
$safe_program_enrollment$;
