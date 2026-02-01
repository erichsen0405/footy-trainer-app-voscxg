alter table public.events_local_meta
  add column if not exists external_event_uid text;

create index if not exists events_local_meta_user_external_event_uid_idx
  on public.events_local_meta (user_id, external_event_uid);
