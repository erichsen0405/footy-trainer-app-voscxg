-- Issue #285 follow-up: materialize an entire multi-player program enrollment
-- in one transaction and repair legacy partial enrollments left by older Edge
-- Function versions.

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
as $program_enrollment$
declare
  v_player_plan jsonb;
  v_player_id uuid;
  v_items jsonb;
  v_item jsonb;
  v_activity jsonb;
  v_tasks jsonb;
  v_task jsonb;
  v_existing_enrollment_id uuid;
  v_existing_status text;
  v_existing_program_version_id uuid;
  v_enrollment_id uuid;
  v_enrollment_item_id uuid;
  v_activity_id uuid;
  v_existing_activity_task_id uuid;
  v_task_template_match_id uuid;
  v_training_template_match_id uuid;
  v_source_category_id uuid;
  v_player_category_id uuid;
  v_program_item_id uuid;
  v_task_template_id uuid;
  v_training_template_id uuid;
  v_scheduled_date date;
  v_item_type text;
  v_item_title text;
  v_snapshot jsonb;
  v_expected_count integer;
  v_actual_count integer;
  v_matched_count integer;
  v_expected_activity_count integer;
  v_linked_activity_count integer;
  v_expected_task_count integer;
  v_matched_task_count integer;
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
    where tp.id = p_program_id
      and tp.owner_account_id = p_owner_account_id
      and tp.status = 'published'
  ) then
    raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Published program was not found.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.program_versions pv
    where pv.id = p_program_version_id
      and pv.program_id = p_program_id
      and pv.owner_account_id = p_owner_account_id
  ) then
    raise exception 'PROGRAM_ENROLLMENT_PLAN_INVALID: Published program version was not found.'
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

    -- Serialize identical natural keys and process players in UUID order to
    -- avoid duplicate rows and lock-order deadlocks for overlapping team calls.
    perform pg_advisory_xact_lock(
      hashtextextended(
        p_program_id::text || ':' || v_player_id::text || ':' || p_start_date::text,
        0
      )
    );

    select pe.id, pe.status, pe.program_version_id
      into v_existing_enrollment_id, v_existing_status, v_existing_program_version_id
    from public.program_enrollments pe
    where pe.owner_account_id = p_owner_account_id
      and pe.program_id = p_program_id
      and pe.player_id = v_player_id
      and pe.start_date = p_start_date
    limit 1;

    if v_existing_enrollment_id is not null then
      if v_existing_program_version_id is distinct from p_program_version_id then
        raise exception 'PROGRAM_ENROLLMENT_EXISTS: Existing enrollment belongs to a different published program version.'
          using errcode = '23505';
      end if;

      v_expected_count := jsonb_array_length(v_items);

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
      where jsonb_typeof(planned.value -> 'activity') = 'object'
        and pei.activity_id is not null;

      select count(*)::integer
        into v_expected_task_count
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
        into v_matched_task_count
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
            and (
              nullif(expected_task.value ->> 'taskTemplateId', '') is null
              or activity_task.task_template_id::text = expected_task.value ->> 'taskTemplateId'
            )
            and (
              nullif(expected_task.value ->> 'trainingTemplateId', '') is null
              or activity_task.training_template_id::text = expected_task.value ->> 'trainingTemplateId'
            )
        );

      if v_actual_count = v_expected_count
         and v_matched_count = v_expected_count
         and v_linked_activity_count = v_expected_activity_count
         and v_matched_task_count = v_expected_task_count then
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

      if v_existing_status <> 'active' then
        raise exception 'PROGRAM_ENROLLMENT_EXISTS: A non-active incomplete enrollment already exists for this player and start date.'
          using errcode = '23505';
      end if;

      -- Delete only linked activities whose ownership and date still match
      -- this incomplete enrollment. Never remove an activity shared by a
      -- different enrollment.
      delete from public.activities activity
      using public.program_enrollment_items linked_item
      where linked_item.owner_account_id = p_owner_account_id
        and linked_item.enrollment_id = v_existing_enrollment_id
        and linked_item.activity_id = activity.id
        and activity.player_id = v_player_id
        and activity.user_id = v_player_id
        and activity.activity_date = linked_item.scheduled_date
        and not exists (
          select 1
          from public.program_enrollment_items other_item
          where other_item.activity_id = activity.id
            and other_item.enrollment_id <> v_existing_enrollment_id
        );

      -- The enrollment delete now cascades its remaining item rows.
      delete from public.program_enrollments pe
      where pe.owner_account_id = p_owner_account_id
        and pe.id = v_existing_enrollment_id;
    end if;

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

      v_activity := v_item -> 'activity';
      if jsonb_typeof(v_activity) = 'object' then
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

        for v_task in
          select task.value
          from jsonb_array_elements(v_tasks) as task(value)
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

          -- Activity creation can auto-add category tasks. Merge with an
          -- existing template instance instead of colliding with either
          -- partial unique index. Snapshot instances are detached from later
          -- template sync to preserve the published program version.
          if v_task_template_id is not null then
            select at.id
              into v_task_template_match_id
            from public.activity_tasks at
            where at.activity_id = v_activity_id
              and at.task_template_id = v_task_template_id
            order by at.created_at, at.id
            limit 1;
          end if;

          if v_training_template_id is not null then
            select at.id
              into v_training_template_match_id
            from public.activity_tasks at
            where at.activity_id = v_activity_id
              and at.training_template_id = v_training_template_id
            order by at.created_at, at.id
            limit 1;
          end if;

          -- The activity trigger may have created two partial matches for one
          -- planned task. They belong to this brand-new activity, so collapse
          -- them before applying both template identities to the survivor.
          if v_task_template_match_id is not null
             and v_training_template_match_id is not null
             and v_task_template_match_id <> v_training_template_match_id then
            delete from public.activity_tasks at
            where at.id = v_training_template_match_id;
            v_training_template_match_id := null;
          end if;

          v_existing_activity_task_id := coalesce(v_task_template_match_id, v_training_template_match_id);

          if v_existing_activity_task_id is not null then
            update public.activity_tasks at
            set title = btrim(v_task ->> 'title'),
                description = coalesce(v_task ->> 'description', ''),
                completed = false,
                reminder_minutes = nullif(v_task ->> 'reminderMinutes', '')::integer,
                task_template_id = coalesce(v_task_template_id, at.task_template_id),
                training_template_id = coalesce(v_training_template_id, at.training_template_id),
                training_template_type = nullif(v_task ->> 'trainingTemplateType', ''),
                exercise_timer = case
                  when jsonb_typeof(v_task -> 'exerciseTimer') = 'object' then v_task -> 'exerciseTimer'
                  else null
                end,
                template_sync_enabled = false,
                updated_at = now()
            where at.id = v_existing_activity_task_id;
          else
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
              template_sync_enabled
            ) values (
              v_activity_id,
              btrim(v_task ->> 'title'),
              coalesce(v_task ->> 'description', ''),
              false,
              nullif(v_task ->> 'reminderMinutes', '')::integer,
              v_task_template_id,
              v_training_template_id,
              nullif(v_task ->> 'trainingTemplateType', ''),
              case
                when jsonb_typeof(v_task -> 'exerciseTimer') = 'object' then v_task -> 'exerciseTimer'
                else null
              end,
              false
            );
          end if;

          v_existing_activity_task_id := null;
          v_task_template_match_id := null;
          v_training_template_match_id := null;
          v_task_template_id := null;
          v_training_template_id := null;
        end loop;

        update public.program_enrollment_items pei
        set activity_id = v_activity_id
        where pei.owner_account_id = p_owner_account_id
          and pei.id = v_enrollment_item_id;
        get diagnostics v_updated_count = row_count;
        if v_updated_count <> 1 then
          raise exception 'PROGRAM_ENROLLMENT_WRITE_FAILED: Could not link materialized activity.';
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
  end loop;

  return;
end;
$program_enrollment$;
