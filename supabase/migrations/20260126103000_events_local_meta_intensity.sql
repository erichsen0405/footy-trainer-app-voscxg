begin;

alter table public.events_local_meta
  add column if not exists intensity integer;

-- Ensure legacy/invalid values respect the 1-10 window before adding constraint
update public.events_local_meta
set intensity = null
where intensity is not null
  and (intensity < 1 or intensity > 10);

-- Add the guard constraint only once
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.events_local_meta'::regclass
      AND conname = 'events_local_meta_intensity_valid'
  ) THEN
    ALTER TABLE public.events_local_meta
      ADD CONSTRAINT events_local_meta_intensity_valid
      CHECK (intensity IS NULL OR (intensity BETWEEN 1 AND 10));
  END IF;
END;
$$;

alter table public.events_local_meta
  add column if not exists intensity_enabled boolean not null default false;

update public.events_local_meta
set intensity_enabled = true
where intensity is not null;

create or replace function public.ensure_events_local_intensity_enabled()
returns trigger as $$
begin
  if new.intensity is not null then
    new.intensity_enabled := true;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists ensure_events_local_intensity_enabled on public.events_local_meta;

create trigger ensure_events_local_intensity_enabled
before insert or update on public.events_local_meta
for each row
execute function public.ensure_events_local_intensity_enabled();

commit;
