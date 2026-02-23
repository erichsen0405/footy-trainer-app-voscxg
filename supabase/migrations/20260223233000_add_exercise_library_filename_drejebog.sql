alter table if exists public.exercise_library
add column if not exists filename text,
add column if not exists drejebog text;
