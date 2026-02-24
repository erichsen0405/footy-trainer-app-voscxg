alter table public.events_external
add column if not exists deleted_at_reason text null;
