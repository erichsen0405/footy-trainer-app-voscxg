alter table if exists public.activity_tasks
  add column if not exists template_sync_enabled boolean not null default true;

alter table if exists public.external_event_tasks
  add column if not exists template_sync_enabled boolean not null default true;

update public.activity_tasks at
   set template_sync_enabled = false
  from public.task_templates tt
 where at.task_template_id = tt.id
   and coalesce(tt.source_folder, '') = 'activity_local_task';

update public.external_event_tasks eet
   set template_sync_enabled = false
  from public.task_templates tt
 where eet.task_template_id = tt.id
   and coalesce(tt.source_folder, '') = 'activity_local_task';

create index if not exists activity_tasks_template_sync_idx
  on public.activity_tasks (task_template_id, template_sync_enabled)
  where task_template_id is not null;

create index if not exists external_event_tasks_template_sync_idx
  on public.external_event_tasks (task_template_id, template_sync_enabled)
  where task_template_id is not null;

create or replace function public.create_tasks_for_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_activity_user_id uuid;
  v_activity_player_id uuid;
  v_is_future boolean := false;
  v_template record;
  v_task_id uuid;
  v_subtask record;
  v_existing_task_id uuid;
  v_existing_sync_enabled boolean := true;
  v_reflection_user_id uuid;
  v_template_ids uuid[] := array[]::uuid[];
begin
  select
    category_id,
    user_id,
    player_id,
    public.is_internal_activity_future(activity_date, activity_time)
    into v_category_id, v_activity_user_id, v_activity_player_id, v_is_future
    from public.activities
   where id = p_activity_id;

  if not coalesce(v_is_future, false) then
    return;
  end if;

  if v_category_id is null or v_activity_user_id is null then
    return;
  end if;

  select coalesce(array_remove(array_agg(distinct tt.id), null), array[]::uuid[])
    into v_template_ids
    from public.task_templates tt
    join public.task_template_categories ttc on ttc.task_template_id = tt.id
   where ttc.category_id = v_category_id
     and tt.user_id = v_activity_user_id
     and tt.archived_at is null
     and tt.auto_add_to_activities is true;

  delete from public.activity_task_subtasks
   where activity_task_id in (
     select at.id
       from public.activity_tasks at
      where at.activity_id = p_activity_id
        and at.task_template_id is null
        and at.description is not null
        and at.description like '%[auto-after-training:%'
        and not exists (
          select 1
            from public.task_templates tt
           where tt.id = substring(at.description from '\[auto-after-training:([0-9a-fA-F-]+)\]')::uuid
             and (
               coalesce(tt.source_folder, '') = 'activity_local_task'
               or (tt.user_id = v_activity_user_id and tt.archived_at is null)
             )
        )
   );

  delete from public.activity_tasks at
   where at.activity_id = p_activity_id
     and at.task_template_id is null
     and at.description is not null
     and at.description like '%[auto-after-training:%'
     and not exists (
       select 1
         from public.task_templates tt
        where tt.id = substring(at.description from '\[auto-after-training:([0-9a-fA-F-]+)\]')::uuid
          and (
            coalesce(tt.source_folder, '') = 'activity_local_task'
            or (tt.user_id = v_activity_user_id and tt.archived_at is null)
          )
     );

  delete from public.activity_task_subtasks
   where activity_task_id in (
     select at.id
       from public.activity_tasks at
      where at.activity_id = p_activity_id
        and at.task_template_id is not null
        and coalesce(at.template_sync_enabled, true) is true
        and (
          coalesce(array_length(v_template_ids, 1), 0) = 0
          or not (at.task_template_id = any(v_template_ids))
        )
        and not exists (
          select 1
            from public.task_templates tt
           where tt.id = at.task_template_id
             and (
               coalesce(tt.source_folder, '') = 'activity_local_task'
               or (tt.user_id = v_activity_user_id and tt.archived_at is null)
             )
        )
   );

  delete from public.activity_tasks at
   where at.activity_id = p_activity_id
     and at.task_template_id is not null
     and coalesce(at.template_sync_enabled, true) is true
     and (
       coalesce(array_length(v_template_ids, 1), 0) = 0
       or not (at.task_template_id = any(v_template_ids))
     )
     and not exists (
       select 1
         from public.task_templates tt
        where tt.id = at.task_template_id
          and (
            coalesce(tt.source_folder, '') = 'activity_local_task'
            or (tt.user_id = v_activity_user_id and tt.archived_at is null)
          )
     );

  for v_template in
    select distinct tt.*
      from public.task_templates tt
     where tt.archived_at is null
       and (
         tt.id in (
           select at.task_template_id
             from public.activity_tasks at
            where at.activity_id = p_activity_id
              and at.task_template_id is not null
              and coalesce(at.template_sync_enabled, true) is true
         )
         or (
           tt.user_id = v_activity_user_id
           and tt.auto_add_to_activities is true
           and exists (
             select 1
               from public.task_template_categories ttc
              where ttc.task_template_id = tt.id
                and ttc.category_id = v_category_id
           )
         )
       )
  loop
    v_existing_task_id := null;
    v_existing_sync_enabled := true;

    select at.id, coalesce(at.template_sync_enabled, true)
      into v_existing_task_id, v_existing_sync_enabled
      from public.activity_tasks at
     where at.activity_id = p_activity_id
       and at.task_template_id = v_template.id
     limit 1;

    if v_existing_task_id is not null and not v_existing_sync_enabled then
      continue;
    end if;

    if v_existing_task_id is not null then
      update public.activity_tasks
         set title = v_template.title,
             description = v_template.description,
             reminder_minutes = v_template.reminder_minutes,
             video_urls = v_template.video_urls,
             after_training_enabled = coalesce(v_template.after_training_enabled, false),
             after_training_delay_minutes = case
               when coalesce(v_template.after_training_enabled, false)
               then v_template.after_training_delay_minutes
               else null
             end,
             task_duration_enabled = coalesce(v_template.task_duration_enabled, false),
             task_duration_minutes = case
               when coalesce(v_template.task_duration_enabled, false)
               then v_template.task_duration_minutes
               else null
             end,
             template_sync_enabled = true,
             updated_at = now()
       where id = v_existing_task_id;

      delete from public.activity_task_subtasks
       where activity_task_id = v_existing_task_id;

      for v_subtask in
        select *
          from public.task_template_subtasks
         where task_template_id = v_template.id
         order by sort_order
      loop
        insert into public.activity_task_subtasks (activity_task_id, title, sort_order)
        values (v_existing_task_id, v_subtask.title, v_subtask.sort_order);
      end loop;
    else
      insert into public.activity_tasks (
        activity_id,
        task_template_id,
        title,
        description,
        reminder_minutes,
        video_urls,
        after_training_enabled,
        after_training_delay_minutes,
        task_duration_enabled,
        task_duration_minutes,
        template_sync_enabled
      )
      values (
        p_activity_id,
        v_template.id,
        v_template.title,
        v_template.description,
        v_template.reminder_minutes,
        v_template.video_urls,
        coalesce(v_template.after_training_enabled, false),
        case
          when coalesce(v_template.after_training_enabled, false)
          then v_template.after_training_delay_minutes
          else null
        end,
        coalesce(v_template.task_duration_enabled, false),
        case
          when coalesce(v_template.task_duration_enabled, false)
          then v_template.task_duration_minutes
          else null
        end,
        true
      )
      returning id into v_task_id;

      for v_subtask in
        select *
          from public.task_template_subtasks
         where task_template_id = v_template.id
         order by sort_order
      loop
        insert into public.activity_task_subtasks (activity_task_id, title, sort_order)
        values (v_task_id, v_subtask.title, v_subtask.sort_order);
      end loop;
    end if;

    if coalesce(v_template.after_training_enabled, false) then
      v_reflection_user_id := coalesce(v_activity_player_id, v_activity_user_id);

      if v_reflection_user_id is not null then
        insert into public.training_reflections (activity_id, user_id, category_id, rating, note)
        values (p_activity_id, v_reflection_user_id, v_category_id, null, null)
        on conflict (activity_id) do nothing;
      end if;

      perform public.upsert_after_training_feedback_task(
        p_activity_id := p_activity_id,
        p_task_template_id := v_template.id,
        p_base_title := v_template.title
      );

      update public.activity_tasks
         set template_sync_enabled = true
       where activity_id = p_activity_id
         and feedback_template_id = v_template.id;
    end if;
  end loop;
end;
$$;

create or replace function public.create_tasks_for_external_event(p_local_meta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_user_id uuid;
  v_template record;
  v_base_task_id uuid;
  v_base_sync_enabled boolean := true;
  v_feedback_task_id uuid;
  v_template_ids uuid[] := array[]::uuid[];

  v_has_local_meta_id boolean := false;
  v_has_task_template_id boolean := false;
  v_has_title boolean := false;
  v_has_description boolean := false;
  v_has_reminder_minutes boolean := false;
  v_has_completed boolean := false;
  v_has_feedback_template_id boolean := false;
  v_has_is_feedback_task boolean := false;
  v_has_template_sync_enabled boolean := false;
  v_has_video_urls boolean := false;

  v_has_after_training_enabled boolean := false;
  v_has_after_training_delay_minutes boolean := false;

  v_should_create_feedback boolean := false;
  v_feedback_reminder_minutes integer := null;
begin
  if p_local_meta_id is null then
    return;
  end if;

  if not public.is_external_local_meta_future(p_local_meta_id) then
    return;
  end if;

  if to_regclass('public.external_event_tasks') is null
     or to_regclass('public.events_local_meta') is null
     or to_regclass('public.task_templates') is null
     or to_regclass('public.task_template_categories') is null then
    return;
  end if;

  select
    coalesce(bool_or(column_name = 'local_meta_id'), false),
    coalesce(bool_or(column_name = 'task_template_id'), false),
    coalesce(bool_or(column_name = 'title'), false),
    coalesce(bool_or(column_name = 'description'), false),
    coalesce(bool_or(column_name = 'reminder_minutes'), false),
    coalesce(bool_or(column_name = 'completed'), false),
    coalesce(bool_or(column_name = 'feedback_template_id'), false),
    coalesce(bool_or(column_name = 'is_feedback_task'), false),
    coalesce(bool_or(column_name = 'template_sync_enabled'), false),
    coalesce(bool_or(column_name = 'video_urls'), false)
  into
    v_has_local_meta_id,
    v_has_task_template_id,
    v_has_title,
    v_has_description,
    v_has_reminder_minutes,
    v_has_completed,
    v_has_feedback_template_id,
    v_has_is_feedback_task,
    v_has_template_sync_enabled,
    v_has_video_urls
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'external_event_tasks';

  if not (
    v_has_local_meta_id
    and v_has_task_template_id
    and v_has_title
    and v_has_description
    and v_has_reminder_minutes
    and v_has_completed
    and v_has_feedback_template_id
    and v_has_is_feedback_task
    and v_has_template_sync_enabled
  ) then
    return;
  end if;

  select
    coalesce(bool_or(column_name = 'after_training_enabled'), false),
    coalesce(bool_or(column_name = 'after_training_delay_minutes'), false)
  into
    v_has_after_training_enabled,
    v_has_after_training_delay_minutes
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'task_templates';

  select category_id, user_id
    into v_category_id, v_user_id
  from public.events_local_meta
  where id = p_local_meta_id;

  if v_category_id is null or v_user_id is null then
    return;
  end if;

  select coalesce(array_remove(array_agg(distinct tt.id), null), array[]::uuid[])
    into v_template_ids
    from public.task_templates tt
    join public.task_template_categories ttc on ttc.task_template_id = tt.id
   where ttc.category_id = v_category_id
     and tt.user_id = v_user_id
     and tt.archived_at is null
     and tt.auto_add_to_activities is true;

  delete from public.external_event_tasks eet
   where eet.local_meta_id = p_local_meta_id
     and eet.task_template_id is not null
     and coalesce(eet.template_sync_enabled, true) is true
     and (
       coalesce(array_length(v_template_ids, 1), 0) = 0
       or not (eet.task_template_id = any(v_template_ids))
     )
     and not exists (
       select 1
         from public.task_templates tt
        where tt.id = eet.task_template_id
          and (
            coalesce(tt.source_folder, '') = 'activity_local_task'
            or (tt.user_id = v_user_id and tt.archived_at is null)
          )
     );

  delete from public.external_event_tasks eet
   where eet.local_meta_id = p_local_meta_id
     and eet.feedback_template_id is not null
     and coalesce(eet.template_sync_enabled, true) is true
     and (
       coalesce(array_length(v_template_ids, 1), 0) = 0
       or not (eet.feedback_template_id = any(v_template_ids))
     )
     and not exists (
       select 1
         from public.task_templates tt
        where tt.id = eet.feedback_template_id
          and (
            coalesce(tt.source_folder, '') = 'activity_local_task'
            or (tt.user_id = v_user_id and tt.archived_at is null)
          )
     );

  for v_template in
    select distinct tt.*
      from public.task_templates tt
     where tt.archived_at is null
       and (
         tt.id in (
           select eet.task_template_id
             from public.external_event_tasks eet
            where eet.local_meta_id = p_local_meta_id
              and eet.task_template_id is not null
              and coalesce(eet.template_sync_enabled, true) is true
         )
         or (
           tt.user_id = v_user_id
           and tt.auto_add_to_activities is true
           and exists (
             select 1
               from public.task_template_categories ttc
              where ttc.task_template_id = tt.id
                and ttc.category_id = v_category_id
           )
         )
       )
  loop
    v_base_task_id := null;
    v_base_sync_enabled := true;

    select id, coalesce(template_sync_enabled, true)
      into v_base_task_id, v_base_sync_enabled
      from public.external_event_tasks
     where local_meta_id = p_local_meta_id
       and task_template_id = v_template.id
     limit 1;

    if v_base_task_id is not null and not v_base_sync_enabled then
      continue;
    end if;

    if v_base_task_id is null then
      if v_has_video_urls then
        insert into public.external_event_tasks (
          local_meta_id,
          task_template_id,
          title,
          description,
          reminder_minutes,
          completed,
          template_sync_enabled,
          video_urls
        )
        values (
          p_local_meta_id,
          v_template.id,
          v_template.title,
          v_template.description,
          v_template.reminder_minutes,
          false,
          true,
          v_template.video_urls
        )
        returning id into v_base_task_id;
      else
        insert into public.external_event_tasks (
          local_meta_id,
          task_template_id,
          title,
          description,
          reminder_minutes,
          completed,
          template_sync_enabled
        )
        values (
          p_local_meta_id,
          v_template.id,
          v_template.title,
          v_template.description,
          v_template.reminder_minutes,
          false,
          true
        )
        returning id into v_base_task_id;
      end if;
    else
      if v_has_video_urls then
        update public.external_event_tasks
           set title = v_template.title,
               description = v_template.description,
               reminder_minutes = v_template.reminder_minutes,
               completed = false,
               is_feedback_task = false,
               template_sync_enabled = true,
               video_urls = v_template.video_urls
         where id = v_base_task_id;
      else
        update public.external_event_tasks
           set title = v_template.title,
               description = v_template.description,
               reminder_minutes = v_template.reminder_minutes,
               completed = false,
               is_feedback_task = false,
               template_sync_enabled = true
         where id = v_base_task_id;
      end if;
    end if;

    if v_has_after_training_enabled then
      v_should_create_feedback := coalesce(v_template.after_training_enabled, false);
      v_feedback_reminder_minutes := null;

      if v_has_after_training_delay_minutes and coalesce(v_template.after_training_enabled, false) then
        v_feedback_reminder_minutes := coalesce(v_template.after_training_delay_minutes, 0);
      end if;
    else
      v_should_create_feedback := false;
      v_feedback_reminder_minutes := null;
    end if;

    if v_should_create_feedback then
      select id
        into v_feedback_task_id
      from public.external_event_tasks
      where local_meta_id = p_local_meta_id
        and feedback_template_id = v_template.id
      limit 1;

      if v_feedback_task_id is null then
        insert into public.external_event_tasks (
          local_meta_id,
          feedback_template_id,
          title,
          description,
          reminder_minutes,
          completed,
          is_feedback_task,
          template_sync_enabled
        )
        values (
          p_local_meta_id,
          v_template.id,
          'Feedback på ' || coalesce(v_template.title, 'opgaven'),
          'Del din feedback efter træningen direkte til træneren. [auto-after-training:' || v_template.id::text || ']',
          v_feedback_reminder_minutes,
          false,
          true,
          true
        );
      else
        update public.external_event_tasks
           set title = 'Feedback på ' || coalesce(v_template.title, 'opgaven'),
               description = 'Del din feedback efter træningen direkte til træneren. [auto-after-training:' || v_template.id::text || ']',
               reminder_minutes = v_feedback_reminder_minutes,
               completed = false,
               is_feedback_task = true,
               template_sync_enabled = true
         where id = v_feedback_task_id
           and coalesce(template_sync_enabled, true) is true;
      end if;
    end if;
  end loop;
end;
$$;

create or replace function public.update_all_tasks_from_template(
  p_template_id uuid,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_ids uuid[] := array[]::uuid[];
  v_series_ids uuid[] := array[]::uuid[];
  v_series_activity_ids uuid[] := array[]::uuid[];
  v_external_ids uuid[] := array[]::uuid[];
  v_activity_id uuid;
  v_local_meta_id uuid;
  v_direct_count integer := 0;
  v_series_count integer := 0;
  v_series_activity_count integer := 0;
  v_total_activity_updates integer := 0;
  v_external_count integer := 0;
  v_result jsonb;
begin
  if p_template_id is null then
    return jsonb_build_object(
      'templateId', null,
      'seriesCount', 0,
      'directActivityUpdates', 0,
      'seriesActivityUpdates', 0,
      'totalActivityUpdates', 0,
      'externalEventUpdates', 0,
      'dryRun', p_dry_run
    );
  end if;

  select coalesce(array_remove(array_agg(distinct candidate.id), null), array[]::uuid[])
    into v_activity_ids
    from (
      select at.activity_id as id
        from public.activity_tasks at
        join public.activities a on a.id = at.activity_id
       where (at.task_template_id = p_template_id or at.feedback_template_id = p_template_id)
         and coalesce(at.template_sync_enabled, true) is true
         and public.is_internal_activity_future(a.activity_date, a.activity_time)
      union
      select a.id
        from public.activities a
        join public.task_template_categories ttc on ttc.category_id = a.category_id
        join public.task_templates tt on tt.id = ttc.task_template_id
       where ttc.task_template_id = p_template_id
         and tt.auto_add_to_activities is true
         and coalesce(a.is_external, false) = false
         and public.is_internal_activity_future(a.activity_date, a.activity_time)
    ) candidate;

  select coalesce(array_remove(array_agg(distinct a.series_id), null), array[]::uuid[])
    into v_series_ids
    from public.activity_tasks at
    join public.activities a on a.id = at.activity_id
    where (at.task_template_id = p_template_id or at.feedback_template_id = p_template_id)
      and coalesce(at.template_sync_enabled, true) is true
      and a.series_id is not null;

  if coalesce(array_length(v_series_ids, 1), 0) > 0 then
    select coalesce(array_remove(array_agg(distinct a2.id), null), array[]::uuid[])
      into v_series_activity_ids
      from public.activities a2
      where a2.series_id = any(v_series_ids)
        and public.is_internal_activity_future(a2.activity_date, a2.activity_time)
        and not (a2.id = any(v_activity_ids));
  else
    v_series_activity_ids := array[]::uuid[];
  end if;

  select coalesce(array_remove(array_agg(distinct candidate.id), null), array[]::uuid[])
    into v_external_ids
    from (
      select eet.local_meta_id as id
        from public.external_event_tasks eet
       where (eet.task_template_id = p_template_id or eet.feedback_template_id = p_template_id)
         and coalesce(eet.template_sync_enabled, true) is true
         and public.is_external_local_meta_future(eet.local_meta_id)
      union
      select elm.id
        from public.events_local_meta elm
        join public.task_template_categories ttc on ttc.category_id = elm.category_id
        join public.task_templates tt on tt.id = ttc.task_template_id
       where ttc.task_template_id = p_template_id
         and tt.auto_add_to_activities is true
         and public.is_external_local_meta_future(elm.id)
    ) candidate;

  v_direct_count := coalesce(array_length(v_activity_ids, 1), 0);
  v_series_count := coalesce(array_length(v_series_ids, 1), 0);
  v_series_activity_count := coalesce(array_length(v_series_activity_ids, 1), 0);
  v_external_count := coalesce(array_length(v_external_ids, 1), 0);
  v_total_activity_updates := v_direct_count + v_series_activity_count;

  if not p_dry_run then
    foreach v_activity_id in array v_activity_ids loop
      perform public.create_tasks_for_activity(v_activity_id);
    end loop;

    foreach v_activity_id in array v_series_activity_ids loop
      perform public.create_tasks_for_activity(v_activity_id);
    end loop;

    foreach v_local_meta_id in array v_external_ids loop
      perform public.create_tasks_for_external_event(v_local_meta_id);
    end loop;

    raise notice '[SERIES_FEEDBACK_SYNC] template=% series=% future_activities=% future_external=%',
      p_template_id,
      v_series_count,
      v_total_activity_updates,
      v_external_count;
  end if;

  v_result := jsonb_build_object(
    'templateId', p_template_id,
    'seriesCount', v_series_count,
    'directActivityUpdates', v_direct_count,
    'seriesActivityUpdates', v_series_activity_count,
    'totalActivityUpdates', v_total_activity_updates,
    'externalEventUpdates', v_external_count,
    'dryRun', p_dry_run
  );

  return v_result;
end;
$$;
