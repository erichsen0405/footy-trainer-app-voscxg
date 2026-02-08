-- Add task_instance_id to self feedback so duplicate templates don't collide.

alter table public.task_template_self_feedback
  add column if not exists task_instance_id uuid;

update public.task_template_self_feedback
set task_instance_id = task_template_id
where task_instance_id is null;

alter table public.task_template_self_feedback
  alter column task_instance_id set not null;

alter table public.task_template_self_feedback
  drop constraint if exists task_template_self_feedback_owner_key;
alter table public.task_template_self_feedback
  drop constraint if exists task_template_self_feedback_user_id_task_template_id_activity_id_key;
alter table public.task_template_self_feedback
  drop constraint if exists task_template_self_feedback_user_id_activity_id_task_template_id_key;

alter table public.task_template_self_feedback
  add constraint task_template_self_feedback_owner_instance_key
  unique (user_id, activity_id, task_instance_id);
