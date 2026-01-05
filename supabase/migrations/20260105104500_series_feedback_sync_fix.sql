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
    where at.task_template_id = p_template_id;

  select coalesce(array_remove(array_agg(distinct a.series_id), null), array[]::uuid[])
    into v_series_ids
    from public.activity_tasks at
    join public.activities a on a.id = at.activity_id
    where at.task_template_id = p_template_id
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
    where eet.task_template_id = p_template_id;

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

drop trigger if exists update_tasks_on_template_change on public.task_templates;

create trigger update_tasks_on_template_change
  after update on public.task_templates
  for each row
  execute function public.trigger_update_tasks_on_template_change();

drop trigger if exists update_tasks_on_subtask_change on public.task_template_subtasks;

create trigger update_tasks_on_subtask_change
  after insert or update or delete on public.task_template_subtasks
  for each row
  execute function public.trigger_update_tasks_on_subtask_change();

create or replace function public.trigger_update_tasks_on_template_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_after_training_columns text[];
  v_column text;
  v_new jsonb;
  v_old jsonb;
begin
  select array_agg(column_name order by column_name)
    into v_after_training_columns
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'task_templates'
      and column_name like 'after_training%';

  if v_after_training_columns is null then
    return new;
  end if;

  v_new := to_jsonb(new);
  v_old := to_jsonb(old);

  foreach v_column in array v_after_training_columns loop
    if (v_new -> v_column) is distinct from (v_old -> v_column) then
      perform public.update_all_tasks_from_template(new.id);
      exit;
    end if;
  end loop;

  return new;
end;
$$;

create or replace function public.trigger_update_tasks_on_subtask_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_template_id uuid;
begin
  if tg_op = 'DELETE' then
    v_template_id := old.task_template_id;
  else
    v_template_id := new.task_template_id;
  end if;

  if v_template_id is not null then
    perform public.update_all_tasks_from_template(v_template_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;
