-- Add configurable after-training feedback fields on task templates
alter table public.task_templates
    add column if not exists after_training_feedback_enable_score boolean not null default true;

alter table public.task_templates
    add column if not exists after_training_feedback_score_explanation text;

alter table public.task_templates
    add column if not exists after_training_feedback_enable_intensity boolean not null default false;

alter table public.task_templates
    add column if not exists after_training_feedback_enable_note boolean not null default true;

-- Store optional intensity score per submitted self feedback entry
alter table public.task_template_self_feedback
    add column if not exists intensity integer check (intensity between 1 and 10);
