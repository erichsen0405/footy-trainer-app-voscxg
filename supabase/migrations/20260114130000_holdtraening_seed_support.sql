-- Support holdtræning seeding by tracking difficulty and preventing duplicate system entries
alter table if exists public.exercise_library
  add column if not exists difficulty integer;

comment on column public.exercise_library.difficulty is '0-5 rating used for FootballCoach system exercises';

create unique index if not exists exercise_library_system_category_title_idx
  on public.exercise_library (coalesce(category_path, ''), title)
  where is_system = true;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'exercise_library_difficulty_range_chk'
  ) then
    alter table public.exercise_library
      add constraint exercise_library_difficulty_range_chk
      check (difficulty is null or (difficulty between 0 and 5));
  end if;
end $$;
