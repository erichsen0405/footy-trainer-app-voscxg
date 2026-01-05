-- Fix regression: trigger must react to template fields deterministically
create or replace function public.trigger_update_tasks_on_template_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.reminder_minutes is distinct from old.reminder_minutes
       or new.after_training_enabled is distinct from old.after_training_enabled
       or new.after_training_delay_minutes is distinct from old.after_training_delay_minutes then
      perform public.update_all_tasks_from_template(new.id, false);
    end if;
  end if;

  return new;
end;
$$;

-- Re-attach triggers so they point to the updated functions
drop trigger if exists update_tasks_on_template_change on public.task_templates;

create trigger update_tasks_on_template_change
  after update on public.task_templates
  for each row
  execute function public.trigger_update_tasks_on_template_change();
