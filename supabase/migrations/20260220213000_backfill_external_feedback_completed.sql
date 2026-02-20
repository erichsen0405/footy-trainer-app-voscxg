-- Backfill historical external feedback tasks that have answered self-feedback rows
-- but still remain marked as incomplete.

WITH answered_feedback AS (
  SELECT DISTINCT
    sf.user_id,
    sf.activity_id,
    sf.task_template_id
  FROM public.task_template_self_feedback sf
  WHERE sf.task_template_id IS NOT NULL
    AND (
      sf.rating IS NOT NULL
      OR NULLIF(BTRIM(COALESCE(sf.note, '')), '') IS NOT NULL
    )
),
external_feedback_candidates AS (
  SELECT DISTINCT
    eet.id
  FROM public.external_event_tasks eet
  JOIN public.events_local_meta elm
    ON elm.id = eet.local_meta_id
  JOIN answered_feedback af
    ON af.user_id = elm.user_id
   AND (
     af.activity_id = elm.id
     OR af.activity_id = elm.external_event_id
   )
  JOIN public.task_templates tt
    ON tt.id = af.task_template_id
  WHERE COALESCE(eet.completed, false) = false
    AND TRANSLATE(LOWER(COALESCE(eet.title, '')), 'åæø', 'aao') ~ '^\s*feedback\s+pa\s+'
    AND (
      eet.task_template_id = af.task_template_id
      OR (
        eet.task_template_id IS NULL
        AND REGEXP_REPLACE(
              REGEXP_REPLACE(
                TRANSLATE(LOWER(COALESCE(eet.title, '')), 'åæø', 'aao'),
                '^\s*feedback\s+pa\s*',
                '',
                'i'
              ),
              '[^a-z0-9]+',
              '',
              'g'
            ) = REGEXP_REPLACE(
                  TRANSLATE(LOWER(COALESCE(tt.title, '')), 'åæø', 'aao'),
                  '[^a-z0-9]+',
                  '',
                  'g'
                )
      )
    )
)
UPDATE public.external_event_tasks eet
SET
  completed = true,
  updated_at = NOW()
WHERE eet.id IN (SELECT id FROM external_feedback_candidates);
