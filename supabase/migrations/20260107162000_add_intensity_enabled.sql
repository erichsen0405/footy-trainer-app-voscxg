begin;

alter table public.activities
  add column if not exists intensity_enabled boolean not null default false;

update public.activities
set intensity_enabled = true
where intensity is not null;

alter table public.activity_series
  add column if not exists intensity_enabled boolean not null default false;

update public.activity_series
set intensity_enabled = true
where id in (
  select distinct series_id
  from public.activities
  where series_id is not null
    and intensity is not null
);

commit;
