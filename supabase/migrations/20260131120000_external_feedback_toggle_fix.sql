alter table if exists public.task_templates
  add column if not exists after_training_enabled boolean not null default false,
  add column if not exists after_training_delay_minutes integer;

alter table if exists public.activity_tasks
  add column if not exists feedback_template_id uuid,
  add column if not exists is_feedback_task boolean not null default false;

alter table if exists public.external_event_tasks
  add column if not exists feedback_template_id uuid,
  add column if not exists is_feedback_task boolean not null default false;

create or replace function public.update_all_tasks_from_template(
    p_template_id uuid,
    p_dry_run boolean default false
) returns jsonb
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

  select coalesce(array_remove(array_agg(distinct at.activity_id), null), array[]::uuid[])
    into v_activity_ids
    from public.activity_tasks at
    where at.task_template_id = p_template_id
       or at.feedback_template_id = p_template_id;

  select coalesce(array_remove(array_agg(distinct a.series_id), null), array[]::uuid[])
    into v_series_ids
    from public.activity_tasks at
    join public.activities a on a.id = at.activity_id
    where (at.task_template_id = p_template_id
        or at.feedback_template_id = p_template_id)
      and a.series_id is not null;

  if coalesce(array_length(v_series_ids, 1), 0) > 0 then
    select coalesce(array_remove(array_agg(distinct a2.id), null), array[]::uuid[])
      into v_series_activity_ids
      from public.activities a2
      where a2.series_id = any(v_series_ids)
        and not (a2.id = any(v_activity_ids));
  else
    v_series_activity_ids := array[]::uuid[];
  end if;

  select coalesce(array_remove(array_agg(distinct eet.local_meta_id), null), array[]::uuid[])
    into v_external_ids
    from public.external_event_tasks eet
    where eet.task_template_id = p_template_id
       or eet.feedback_template_id = p_template_id;

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

    raise notice '[SERIES_FEEDBACK_SYNC] template=% series=% activities=% external=%',
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
  v_should_create_feedback boolean := false;
  v_base_task_id uuid;
  v_feedback_task_id uuid;
  v_has_is_feedback_task boolean := false;
begin
  if p_local_meta_id is null then
    return;
  end if;

  select category_id, user_id
    into v_category_id, v_user_id
  from public.events_local_meta
  where id = p_local_meta_id;

  if v_category_id is null or v_user_id is null then
    return;
  end if;

  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'external_event_tasks'
      and column_name = 'is_feedback_task'
  ) into v_has_is_feedback_task;

  for v_template in
    select distinct tt.*
    from public.task_templates tt
    join public.task_template_categories ttc on ttc.task_template_id = tt.id
    where ttc.category_id = v_category_id
      and tt.user_id = v_user_id
  loop
    select id
      into v_base_task_id
    from public.external_event_tasks
    where local_meta_id = p_local_meta_id
      and task_template_id = v_template.id
    limit 1;

    if v_base_task_id is null then
      insert into public.external_event_tasks (
        local_meta_id,
        task_template_id,
        title,
        description,
        reminder_minutes,
        completed
      )
      values (
        p_local_meta_id,
        v_template.id,
        v_template.title,
        v_template.description,
        v_template.reminder_minutes,
        false
      )
      returning id into v_base_task_id;
    else
      update public.external_event_tasks
      set title = v_template.title,
          description = v_template.description,
          reminder_minutes = v_template.reminder_minutes
      where id = v_base_task_id;
    end if;

    v_should_create_feedback := coalesce(v_template.after_training_enabled, false);

    if not v_should_create_feedback then
      delete from public.external_event_tasks
      where local_meta_id = p_local_meta_id
        and feedback_template_id = v_template.id;

      if v_has_is_feedback_task then
        delete from public.external_event_tasks
        where local_meta_id = p_local_meta_id
          and coalesce(is_feedback_task, false) = true
          and task_template_id is null
          and (feedback_template_id is null or feedback_template_id = v_template.id);
      end if;

      continue;
    end if;

    select id
      into v_feedback_task_id
    from public.external_event_tasks
    where local_meta_id = p_local_meta_id
      and feedback_template_id = v_template.id
    limit 1;

    if v_feedback_task_id is null then
      if v_has_is_feedback_task then
        insert into public.external_event_tasks (
          local_meta_id,
          task_template_id,
          feedback_template_id,
          title,
          description,
          reminder_minutes,
          completed,
          is_feedback_task
        )
        values (
          p_local_meta_id,
          null,
          v_template.id,
          'Feedback på ' || coalesce(v_template.title, 'opgave'),
          '',
          null,
          false,
          true
        )
        returning id into v_feedback_task_id;
      else
        insert into public.external_event_tasks (
          local_meta_id,
          task_template_id,
          feedback_template_id,
          title,
          description,
          reminder_minutes,
          completed
        )
        values (
          p_local_meta_id,
          null,
          v_template.id,
          'Feedback på ' || coalesce(v_template.title, 'opgave'),
          '',
          null,
          false
        )
        returning id into v_feedback_task_id;
      end if;
    else
      update public.external_event_tasks
      set title = 'Feedback på ' || coalesce(v_template.title, 'opgave'),
          description = '',
          reminder_minutes = null
      where id = v_feedback_task_id;
    end if;
  end loop;
end;
$$;
