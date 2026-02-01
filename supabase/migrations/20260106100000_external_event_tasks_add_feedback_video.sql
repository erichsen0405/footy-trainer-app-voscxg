alter table public.external_event_tasks
  add column if not exists feedback_template_id uuid;

alter table public.external_event_tasks
  add column if not exists video_url text;
