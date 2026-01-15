-- Remove "Selvtræning" system exercises (and their assignments).
-- WARNING: This is destructive. Validate the rows first.

-- Optional sanity check:
-- select id, title, category_path from exercise_library
-- where is_system = true and category_path like 'selvtraening%';

delete from exercise_assignments
where exercise_id in (
  select id
  from exercise_library
  where is_system = true
    and category_path like 'selvtraening%'
);

delete from exercise_library
where is_system = true
  and category_path like 'selvtraening%';
