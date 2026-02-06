-- Dedupe and guard the "Ukendt" activity category
-- Ensures only one canonical row and reassigns all references.

DO $$
DECLARE
  v_canonical uuid;
  v_duplicates uuid[];
BEGIN
  -- Pick canonical: prefer system, otherwise oldest
  SELECT id
    INTO v_canonical
    FROM activity_categories
   WHERE lower(trim(name)) = 'ukendt'
   ORDER BY is_system DESC, created_at ASC
   LIMIT 1;

  IF v_canonical IS NULL THEN
    INSERT INTO activity_categories (name, color, emoji, is_system, user_id, team_id, player_id)
    VALUES ('Ukendt', '#9E9E9E', '?', TRUE, NULL, NULL, NULL)
    RETURNING id INTO v_canonical;
  ELSE
    UPDATE activity_categories
       SET is_system = TRUE,
           user_id   = NULL,
           team_id   = NULL,
           player_id = NULL,
           color     = COALESCE(color, '#9E9E9E'),
           emoji     = COALESCE(emoji, '?')
     WHERE id = v_canonical;
  END IF;

  -- Collect duplicate ids once for reuse below
  SELECT array_agg(id) INTO v_duplicates
    FROM activity_categories
   WHERE lower(trim(name)) = 'ukendt'
     AND id <> v_canonical;

  IF v_duplicates IS NULL OR array_length(v_duplicates, 1) = 0 THEN
    RETURN;
  END IF;

  -- Re-point foreign keys before deleting duplicates
  UPDATE activities SET category_id = v_canonical WHERE category_id = ANY (v_duplicates);

  UPDATE activity_series SET category_id = v_canonical WHERE category_id = ANY (v_duplicates);

  -- hidden_activity_categories has unique (user_id, category_id)
  DELETE FROM hidden_activity_categories h
   WHERE h.category_id = ANY (v_duplicates)
     AND EXISTS (
       SELECT 1 FROM hidden_activity_categories h2
        WHERE h2.user_id = h.user_id AND h2.category_id = v_canonical
     );

  UPDATE hidden_activity_categories h
     SET category_id = v_canonical
   WHERE h.category_id = ANY (v_duplicates)
     AND NOT EXISTS (
       SELECT 1 FROM hidden_activity_categories h2
        WHERE h2.user_id = h.user_id AND h2.category_id = v_canonical
     );

  -- task_template_categories has unique (task_template_id, category_id)
  DELETE FROM task_template_categories ttc
   WHERE ttc.category_id = ANY (v_duplicates)
     AND EXISTS (
       SELECT 1 FROM task_template_categories t2
        WHERE t2.task_template_id = ttc.task_template_id
          AND t2.category_id = v_canonical
     );

  UPDATE task_template_categories ttc
     SET category_id = v_canonical
   WHERE ttc.category_id = ANY (v_duplicates)
     AND NOT EXISTS (
       SELECT 1 FROM task_template_categories t2
        WHERE t2.task_template_id = ttc.task_template_id
          AND t2.category_id = v_canonical
     );

  UPDATE category_mappings
     SET internal_category_id = v_canonical
   WHERE internal_category_id = ANY (v_duplicates);

  UPDATE events_local_meta
     SET category_id = v_canonical
   WHERE category_id = ANY (v_duplicates);

  UPDATE local_event_meta
     SET category_id = v_canonical
   WHERE category_id = ANY (v_duplicates);

  DELETE FROM activity_categories WHERE id = ANY (v_duplicates);
END $$;

-- Hard guard: only one "Ukendt" row may exist going forward
CREATE UNIQUE INDEX IF NOT EXISTS activity_categories_ukendt_unique
  ON activity_categories ((lower(trim(name))))
  WHERE lower(trim(name)) = 'ukendt';
