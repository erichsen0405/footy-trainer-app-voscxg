alter table public.exercise_library
add column if not exists animation_spec_id text;

update public.exercise_library
set animation_spec_id = 'timing_late_run_8'
where id = '80dbfd79-87a5-45f0-be7b-1e8c9378dda9';
