drop function if exists public.update_all_tasks_from_template(uuid);

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
      perform public.update_all_tasks_from_template(new.id, false);
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
  v_template_id := coalesce(new.task_template_id, old.task_template_id);

  if v_template_id is not null then
    perform public.update_all_tasks_from_template(v_template_id, false);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
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
