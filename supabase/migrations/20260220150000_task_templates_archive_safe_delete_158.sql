alter table if exists public.task_templates
  add column if not exists archived_at timestamptz;

create index if not exists idx_task_templates_archived_at
  on public.task_templates (archived_at)
  where archived_at is not null;
