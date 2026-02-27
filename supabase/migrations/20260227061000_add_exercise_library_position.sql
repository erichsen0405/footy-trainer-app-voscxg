alter table public.exercise_library
add column if not exists position text;

comment on column public.exercise_library.position is
  'Optional position label for exercise library entries.';
