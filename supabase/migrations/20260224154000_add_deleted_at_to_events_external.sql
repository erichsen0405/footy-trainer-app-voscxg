alter table public.events_external
add column if not exists deleted_at timestamptz null;
