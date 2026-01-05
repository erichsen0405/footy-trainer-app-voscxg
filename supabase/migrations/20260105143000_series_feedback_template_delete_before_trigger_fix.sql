begin;

create or replace function public.trigger_cleanup_tasks_on_template_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is not null then
    perform public.cleanup_tasks_for_template(old.user_id, old.id);
  end if;

  return old;
end;
$$;

drop trigger if exists cleanup_tasks_on_template_delete on public.task_templates;

create trigger cleanup_tasks_on_template_delete
  before delete on public.task_templates
  for each row
  execute function public.trigger_cleanup_tasks_on_template_delete();

create or replace function public.trigger_cleanup_tasks_on_template_hide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.task_template_id is not null then
    perform public.cleanup_tasks_for_template(new.user_id, new.task_template_id);
  end if;

  return new;
end;
$$;

drop trigger if exists cleanup_tasks_on_template_hide on public.hidden_task_templates;

create trigger cleanup_tasks_on_template_hide
  after insert on public.hidden_task_templates
  for each row
  execute function public.trigger_cleanup_tasks_on_template_hide();

commit;
