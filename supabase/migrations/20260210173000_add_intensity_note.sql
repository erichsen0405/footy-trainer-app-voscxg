-- Add intensity note fields for internal and external activities
alter table if exists public.activities
  add column if not exists intensity_note text;

alter table if exists public.events_local_meta
  add column if not exists intensity_note text;
