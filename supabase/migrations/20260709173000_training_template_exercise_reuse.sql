-- Issue #286 follow-up: reusable exercise templates and task/exercise item reuse.

alter table if exists public.training_templates
  drop constraint if exists training_templates_type_check;

alter table if exists public.training_templates
  add constraint training_templates_type_check
  check (template_type in ('task', 'exercise', 'session', 'week'));

comment on table public.training_templates is
  'Owner-scoped reusable training templates for tasks, exercises, sessions and weeks. Supabase is source of truth for mobile and Base44. Players and guardians must not be granted template-admin access.';

comment on table public.training_template_items is
  'Ordered reusable template contents. Session and week templates can link to saved task/exercise templates, create reusable task/exercise templates inline, or reference visible exercise_library rows.';
