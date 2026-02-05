-- Allow external activities in task_template_self_feedback by replacing the FK
-- with a trigger that validates against activities OR events_external.

alter table public.task_template_self_feedback
  drop constraint if exists task_template_self_feedback_activity_id_fkey;

create or replace function public.validate_task_template_self_feedback_activity_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.activity_id is null then
    raise exception 'task_template_self_feedback.activity_id is required'
      using errcode = '23502';
  end if;

  if exists (select 1 from public.activities where id = new.activity_id) then
    return new;
  end if;

  if exists (select 1 from public.events_external where id = new.activity_id) then
    return new;
  end if;

  raise exception
    'task_template_self_feedback.activity_id must reference activities.id or events_external.id (got %)',
    new.activity_id
    using errcode = '23503';
end;
$$;

drop trigger if exists validate_task_template_self_feedback_activity_id on public.task_template_self_feedback;

create trigger validate_task_template_self_feedback_activity_id
before insert or update on public.task_template_self_feedback
for each row
execute function public.validate_task_template_self_feedback_activity_id();
