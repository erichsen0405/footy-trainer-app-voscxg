alter table if exists public.task_templates
  add column if not exists media_names text[];

alter table if exists public.activity_tasks
  add column if not exists media_names text[];

alter table if exists public.external_event_tasks
  add column if not exists media_names text[];

create or replace function public.apply_task_template_media_names_to_activity_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_media_names text[];
begin
  if new.task_template_id is not null
     and coalesce(new.template_sync_enabled, true) is true then
    select tt.media_names
      into v_media_names
      from public.task_templates tt
     where tt.id = new.task_template_id;

    new.media_names := v_media_names;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_template_media_names_on_activity_task on public.activity_tasks;
create trigger apply_template_media_names_on_activity_task
  before insert or update of task_template_id, template_sync_enabled, video_urls, media_names
  on public.activity_tasks
  for each row
  execute function public.apply_task_template_media_names_to_activity_task();

drop trigger if exists apply_template_media_names_on_external_event_task on public.external_event_tasks;
create trigger apply_template_media_names_on_external_event_task
  before insert or update of task_template_id, template_sync_enabled, video_urls, media_names
  on public.external_event_tasks
  for each row
  execute function public.apply_task_template_media_names_to_activity_task();

update public.activity_tasks at
   set media_names = tt.media_names
  from public.task_templates tt
 where at.task_template_id = tt.id
   and coalesce(at.template_sync_enabled, true) is true
   and at.media_names is distinct from tt.media_names;

update public.external_event_tasks eet
   set media_names = tt.media_names
  from public.task_templates tt
 where eet.task_template_id = tt.id
   and coalesce(eet.template_sync_enabled, true) is true
   and eet.media_names is distinct from tt.media_names;

create or replace function public.trigger_update_tasks_on_template_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.title is distinct from old.title
     or new.description is distinct from old.description
     or new.reminder_minutes is distinct from old.reminder_minutes
     or new.video_url is distinct from old.video_url
     or new.video_urls is distinct from old.video_urls
     or new.media_names is distinct from old.media_names
     or new.after_training_enabled is distinct from old.after_training_enabled
     or new.after_training_delay_minutes is distinct from old.after_training_delay_minutes
     or new.after_training_feedback_enable_score is distinct from old.after_training_feedback_enable_score
     or new.after_training_feedback_score_explanation is distinct from old.after_training_feedback_score_explanation
     or new.after_training_feedback_enable_intensity is distinct from old.after_training_feedback_enable_intensity
     or new.after_training_feedback_enable_note is distinct from old.after_training_feedback_enable_note
     or new.task_duration_enabled is distinct from old.task_duration_enabled
     or new.task_duration_minutes is distinct from old.task_duration_minutes
     or new.auto_add_to_activities is distinct from old.auto_add_to_activities
  then
    perform public.update_all_tasks_from_template(new.id, false);
  end if;

  return new;
end;
$$;
