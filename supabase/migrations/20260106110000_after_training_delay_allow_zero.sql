-- Allow 0-minute after-training delay (immediate reminder)

ALTER TABLE public.task_templates
  DROP CONSTRAINT IF EXISTS task_templates_after_training_delay_chk;

ALTER TABLE public.task_templates
  DROP CONSTRAINT IF EXISTS task_templates_after_training_delay_minutes_check;

ALTER TABLE public.task_templates
  ADD CONSTRAINT task_templates_after_training_delay_minutes_check
  CHECK (
    after_training_delay_minutes IS NULL
    OR (after_training_delay_minutes >= 0 AND after_training_delay_minutes <= 240)
  ) NOT VALID;

ALTER TABLE public.task_templates
  VALIDATE CONSTRAINT task_templates_after_training_delay_minutes_check;
