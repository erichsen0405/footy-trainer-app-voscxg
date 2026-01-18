create extension if not exists "pgcrypto";

create table if not exists public.user_entitlements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement text not null,
  source text not null default 'complimentary',
  is_active boolean not null default true,
  expires_at timestamptz null,
  notes text null,
  created_at timestamptz not null default now(),
  constraint user_entitlements_entitlement_check
    check (entitlement = any (array['spiller_premium','træner_premium']))
);

create index if not exists user_entitlements_user_id_idx on public.user_entitlements (user_id);
create index if not exists user_entitlements_user_entitlement_idx on public.user_entitlements (user_id, entitlement);

alter table public.user_entitlements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_entitlements'
      and policyname = 'Users can read their own entitlements'
  ) then
    create policy "Users can read their own entitlements"
      on public.user_entitlements
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;
end$$;

create or replace function public.get_my_entitlements()
returns table (
  entitlement text,
  source text,
  expires_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select entitlement, source, expires_at
  from public.user_entitlements
  where user_id = auth.uid()
    and is_active
    and (expires_at is null or expires_at > now());
$$;

grant execute on function public.get_my_entitlements() to authenticated;
