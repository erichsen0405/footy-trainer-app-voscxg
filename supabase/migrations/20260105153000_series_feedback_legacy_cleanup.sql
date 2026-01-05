BEGIN;

-- Step 1: delete orphan template-backed activity tasks and their subtasks
DELETE FROM public.activity_task_subtasks ast
WHERE EXISTS (
  SELECT 1
  FROM public.activity_tasks at
  WHERE at.id = ast.activity_task_id
    AND at.task_template_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.task_templates tt
      WHERE tt.id = at.task_template_id
    )
);

DELETE FROM public.activity_tasks at
WHERE at.task_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.task_templates tt
    WHERE tt.id = at.task_template_id
  );

-- Step 2: delete orphan auto-after-training activity tasks (and subtasks)
DELETE FROM public.activity_task_subtasks ast
WHERE EXISTS (
  SELECT 1
  FROM public.activity_tasks at
  WHERE at.id = ast.activity_task_id
    AND at.task_template_id IS NULL
    AND at.description IS NOT NULL
    AND at.description LIKE '%[auto-after-training:%'
    AND at.description ~ '\[auto-after-training:[0-9a-fA-F-]{36}\]'
    AND NOT EXISTS (
      SELECT 1
      FROM public.task_templates tt
      WHERE tt.id = (
        SUBSTRING(at.description FROM '\[auto-after-training:([0-9a-fA-F-]{36})\]')::uuid
      )
    )
);

DELETE FROM public.activity_tasks at
WHERE at.task_template_id IS NULL
  AND at.description IS NOT NULL
  AND at.description LIKE '%[auto-after-training:%'
  AND at.description ~ '\[auto-after-training:[0-9a-fA-F-]{36}\]'
  AND NOT EXISTS (
    SELECT 1
    FROM public.task_templates tt
    WHERE tt.id = (
      SUBSTRING(at.description FROM '\[auto-after-training:([0-9a-fA-F-]{36})\]')::uuid
    )
  );

-- Step 3: delete orphan external event tasks referencing missing templates
DELETE FROM public.external_event_tasks eet
WHERE eet.task_template_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.task_templates tt
    WHERE tt.id = eet.task_template_id
  );

-- Step 4: self-heal by re-creating tasks per activity
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (SELECT id FROM public.activities)
  LOOP
    PERFORM public.create_tasks_for_activity(r.id);
  END LOOP;
END
$$;

COMMIT;
