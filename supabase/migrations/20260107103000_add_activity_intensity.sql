alter table public.activities
  add column if not exists intensity integer;

alter table public.activities
  add constraint activities_intensity_valid
  check (
    intensity is null or (intensity >= 1 and intensity <= 10)
  );
