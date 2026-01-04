begin;

alter table public.activity_series
  add column if not exists activity_end_time text;

alter table public.activities
  add column if not exists activity_end_time text;

notify pgrst, 'reload schema';

commit;
