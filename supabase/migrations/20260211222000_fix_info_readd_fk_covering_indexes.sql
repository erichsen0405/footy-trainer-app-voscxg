-- Issue #149 INFO cleanup correction
-- Re-add FK covering indexes required by linter.

create index if not exists idx_activity_categories_team_id
  on public.activity_categories (team_id);

create index if not exists idx_task_templates_team_id
  on public.task_templates (team_id);