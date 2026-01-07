-- Add after-training feedback configuration toggles for task templates
alter table if exists public.task_templates
  add column if not exists after_training_feedback_enable_score boolean not null default true;

alter table if exists public.task_templates
  add column if not exists after_training_feedback_score_explanation text null;

alter table if exists public.task_templates
  add column if not exists after_training_feedback_enable_intensity boolean not null default false;

alter table if exists public.task_templates
  add column if not exists after_training_feedback_enable_note boolean not null default true;
