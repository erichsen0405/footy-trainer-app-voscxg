create table if not exists public.startup_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),
  user_id uuid null,
  device_install_id text not null,
  launch_id text not null,
  event_name text not null,
  status text null,
  route text null,
  metadata jsonb null default '{}'::jsonb
);

create index if not exists idx_startup_telemetry_events_created_at
  on public.startup_telemetry_events (created_at desc);

create index if not exists idx_startup_telemetry_events_launch_id
  on public.startup_telemetry_events (launch_id);

alter table public.startup_telemetry_events enable row level security;

drop policy if exists "startup_telemetry_no_direct_access" on public.startup_telemetry_events;
create policy "startup_telemetry_no_direct_access"
on public.startup_telemetry_events
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.log_startup_telemetry(
  p_device_install_id text,
  p_launch_id text,
  p_event_name text,
  p_status text default null,
  p_route text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_device_install_id), '') = '' then
    return;
  end if;

  if coalesce(trim(p_launch_id), '') = '' then
    return;
  end if;

  if coalesce(trim(p_event_name), '') = '' then
    return;
  end if;

  insert into public.startup_telemetry_events (
    occurred_at,
    user_id,
    device_install_id,
    launch_id,
    event_name,
    status,
    route,
    metadata
  ) values (
    coalesce(p_occurred_at, now()),
    auth.uid(),
    p_device_install_id,
    p_launch_id,
    p_event_name,
    p_status,
    p_route,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.log_startup_telemetry(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  timestamptz
) from public;

grant execute on function public.log_startup_telemetry(
  text,
  text,
  text,
  text,
  text,
  jsonb,
  timestamptz
) to anon, authenticated;
