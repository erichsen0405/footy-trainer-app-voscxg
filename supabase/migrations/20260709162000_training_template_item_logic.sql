-- Issue #286 follow-up: align template items with the template being created.

alter table if exists public.training_templates
  add column if not exists default_activity_category_id uuid null references public.activity_categories(id) on delete set null,
  add column if not exists default_activity_category_name text null;

alter table if exists public.training_template_items
  drop constraint if exists training_template_items_type_check;

update public.training_template_items
   set item_type = 'exercise',
       config = coalesce(config, '{}'::jsonb) || jsonb_build_object('legacyItemType', 'activity')
 where item_type = 'activity';

alter table if exists public.training_template_items
  add constraint training_template_items_type_check
  check (item_type in ('task_template', 'exercise', 'session_template', 'note', 'focus', 'feedback_requirement'));

comment on column public.training_templates.default_activity_category_id is
  'Optional default category used when a session template is materialized as an activity.';

comment on column public.training_templates.default_activity_category_name is
  'Human-readable fallback category for session templates when a category id has not been selected yet.';

comment on table public.training_template_items is
  'Ordered reusable template contents. Session templates can contain task/exercise/focus/note/feedback items. Week templates can contain session/focus/note items. Task templates store task fields directly in training_templates.metadata.task.';
