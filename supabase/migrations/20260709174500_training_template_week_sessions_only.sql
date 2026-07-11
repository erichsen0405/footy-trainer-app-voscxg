-- Issue #286 follow-up: week templates are composed from saved session templates.

comment on table public.training_template_items is
  'Ordered reusable template contents. Session templates can link to saved task/exercise templates, create reusable task/exercise templates inline, or reference visible exercise_library rows. Week templates contain saved session templates only.';
