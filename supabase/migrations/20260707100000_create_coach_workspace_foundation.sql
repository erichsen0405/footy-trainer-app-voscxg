create table if not exists public.coach_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  source text not null default 'personal_coach',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_accounts_name_not_blank_check check (btrim(name) <> ''),
  constraint coach_accounts_status_check check (status in ('active', 'inactive')),
  constraint coach_accounts_source_check check (source in ('personal_coach', 'club_bridge', 'migration'))
);

create table if not exists public.coach_memberships (
  id uuid primary key default gen_random_uuid(),
  coach_account_id uuid not null references public.coach_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  status text not null default 'active',
  added_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_memberships_role_check check (role in ('owner', 'admin', 'coach', 'assistant')),
  constraint coach_memberships_status_check check (status in ('active', 'inactive')),
  unique (coach_account_id, user_id)
);

create index if not exists coach_accounts_owner_user_id_idx
  on public.coach_accounts (owner_user_id);

create index if not exists coach_accounts_owner_status_idx
  on public.coach_accounts (owner_user_id, status);

create index if not exists coach_accounts_status_idx
  on public.coach_accounts (status);

create index if not exists coach_memberships_account_id_idx
  on public.coach_memberships (coach_account_id);

create index if not exists coach_memberships_user_id_idx
  on public.coach_memberships (user_id);

create index if not exists coach_memberships_account_role_status_idx
  on public.coach_memberships (coach_account_id, role, status);

create index if not exists coach_memberships_user_status_idx
  on public.coach_memberships (user_id, status);

create unique index if not exists coach_memberships_one_active_owner_uidx
  on public.coach_memberships (coach_account_id)
  where role = 'owner' and status = 'active';

drop trigger if exists update_coach_accounts_updated_at on public.coach_accounts;
create trigger update_coach_accounts_updated_at
before update on public.coach_accounts
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_coach_memberships_updated_at on public.coach_memberships;
create trigger update_coach_memberships_updated_at
before update on public.coach_memberships
for each row
execute function public.trigger_update_timestamp();

create or replace function public.prevent_coach_account_owner_change()
returns trigger
language plpgsql
as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'COACH_ACCOUNT_OWNER_IMMUTABLE';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_coach_account_owner_change on public.coach_accounts;
create trigger prevent_coach_account_owner_change
before update of owner_user_id on public.coach_accounts
for each row
execute function public.prevent_coach_account_owner_change();

create or replace function public.enforce_coach_membership_owner_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_user_id uuid;
begin
  if new.role = 'owner' then
    select ca.owner_user_id
      into v_owner_user_id
    from public.coach_accounts ca
    where ca.id = new.coach_account_id;

    if v_owner_user_id is null then
      raise exception 'COACH_ACCOUNT_NOT_FOUND';
    end if;

    if new.user_id <> v_owner_user_id then
      raise exception 'COACH_ACCOUNT_OWNER_MEMBERSHIP_MISMATCH';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and old.role = 'owner'
     and old.status = 'active'
     and (
       new.role <> 'owner'
       or new.status <> 'active'
       or new.user_id <> old.user_id
       or new.coach_account_id <> old.coach_account_id
     )
  then
    raise exception 'LAST_COACH_ACCOUNT_OWNER_GUARD';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_coach_membership_owner_rules on public.coach_memberships;
create trigger enforce_coach_membership_owner_rules
before insert or update on public.coach_memberships
for each row
execute function public.enforce_coach_membership_owner_rules();

create or replace function public.is_coach_account_member(
  p_coach_account_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_memberships cm
    where cm.coach_account_id = p_coach_account_id
      and cm.user_id = p_user_id
      and cm.status = 'active'
  );
$$;

create or replace function public.is_coach_account_admin(
  p_coach_account_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_memberships cm
    where cm.coach_account_id = p_coach_account_id
      and cm.user_id = p_user_id
      and cm.status = 'active'
      and cm.role in ('owner', 'admin')
  );
$$;

create or replace function public.has_coach_account_coach_access(
  p_coach_account_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.coach_memberships cm
    where cm.coach_account_id = p_coach_account_id
      and cm.user_id = p_user_id
      and cm.status = 'active'
      and cm.role in ('owner', 'admin', 'coach', 'assistant')
  );
$$;

create or replace function public.is_last_active_coach_account_owner(
  p_coach_account_id uuid,
  p_membership_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with target_owner as (
    select cm.id
    from public.coach_memberships cm
    where cm.id = p_membership_id
      and cm.coach_account_id = p_coach_account_id
      and cm.status = 'active'
      and cm.role = 'owner'
  )
  select exists (
    select 1
    from target_owner
  )
  and not exists (
    select 1
    from public.coach_memberships cm
    where cm.coach_account_id = p_coach_account_id
      and cm.status = 'active'
      and cm.role = 'owner'
      and cm.id <> p_membership_id
  );
$$;

create or replace function public.get_default_coach_account_id(
  p_user_id uuid
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select ca.id
  from public.coach_accounts ca
  join public.coach_memberships cm
    on cm.coach_account_id = ca.id
   and cm.user_id = p_user_id
   and cm.status = 'active'
  where ca.owner_user_id = p_user_id
    and ca.status = 'active'
    and ca.source in ('personal_coach', 'migration')
  order by ca.created_at asc
  limit 1;
$$;

create or replace function public.ensure_default_coach_account(
  p_user_id uuid,
  p_account_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_account_id uuid;
  v_account_name text := nullif(btrim(coalesce(p_account_name, '')), '');
  v_profile_name text;
begin
  if p_user_id is null or v_auth_user_id is null or p_user_id <> v_auth_user_id then
    raise exception 'UNAUTHORIZED';
  end if;

  select public.get_default_coach_account_id(p_user_id)
    into v_account_id;

  if v_account_id is not null then
    insert into public.coach_memberships (
      coach_account_id,
      user_id,
      role,
      status,
      added_by
    )
    values (
      v_account_id,
      p_user_id,
      'owner',
      'active',
      p_user_id
    )
    on conflict (coach_account_id, user_id)
    do update
       set role = 'owner',
           status = 'active',
           updated_at = now();

    return v_account_id;
  end if;

  if v_account_name is null then
    select nullif(btrim(p.full_name), '')
      into v_profile_name
    from public.profiles p
    where p.user_id = p_user_id;

    v_account_name := coalesce(v_profile_name || '''s workspace', 'Coach workspace');
  end if;

  insert into public.coach_accounts (
    owner_user_id,
    name,
    status,
    source
  )
  values (
    p_user_id,
    v_account_name,
    'active',
    'personal_coach'
  )
  returning id
    into v_account_id;

  insert into public.coach_memberships (
    coach_account_id,
    user_id,
    role,
    status,
    added_by
  )
  values (
    v_account_id,
    p_user_id,
    'owner',
    'active',
    p_user_id
  );

  return v_account_id;
end;
$$;

alter table public.coach_accounts enable row level security;
alter table public.coach_memberships enable row level security;

drop policy if exists "Coach account members can view accounts" on public.coach_accounts;
create policy "Coach account members can view accounts"
  on public.coach_accounts
  for select
  using (public.is_coach_account_member(id, (select auth.uid())));

drop policy if exists "Authenticated users can create owned coach accounts" on public.coach_accounts;
create policy "Authenticated users can create owned coach accounts"
  on public.coach_accounts
  for insert
  with check (owner_user_id = (select auth.uid()));

drop policy if exists "Coach account admins can update accounts" on public.coach_accounts;
create policy "Coach account admins can update accounts"
  on public.coach_accounts
  for update
  using (public.is_coach_account_admin(id, (select auth.uid())))
  with check (public.is_coach_account_admin(id, (select auth.uid())));

drop policy if exists "Coach account owners can delete accounts" on public.coach_accounts;
create policy "Coach account owners can delete accounts"
  on public.coach_accounts
  for delete
  using (owner_user_id = (select auth.uid()));

drop policy if exists "Coach account members can view memberships" on public.coach_memberships;
create policy "Coach account members can view memberships"
  on public.coach_memberships
  for select
  using (public.is_coach_account_member(coach_account_id, (select auth.uid())));

drop policy if exists "Coach account admins can create memberships" on public.coach_memberships;
create policy "Coach account admins can create memberships"
  on public.coach_memberships
  for insert
  with check (
    public.is_coach_account_admin(coach_account_id, (select auth.uid()))
    or (
      user_id = (select auth.uid())
      and role = 'owner'
      and exists (
        select 1
        from public.coach_accounts ca
        where ca.id = coach_account_id
          and ca.owner_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Coach account admins can update memberships" on public.coach_memberships;
create policy "Coach account admins can update memberships"
  on public.coach_memberships
  for update
  using (public.is_coach_account_admin(coach_account_id, (select auth.uid())))
  with check (public.is_coach_account_admin(coach_account_id, (select auth.uid())));

grant select, insert, update, delete on public.coach_accounts to authenticated;
grant select, insert, update on public.coach_memberships to authenticated;
grant all on public.coach_accounts to service_role;
grant all on public.coach_memberships to service_role;

grant execute on function public.is_coach_account_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_coach_account_admin(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_coach_account_coach_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_last_active_coach_account_owner(uuid, uuid) to authenticated, service_role;
grant execute on function public.get_default_coach_account_id(uuid) to authenticated, service_role;
grant execute on function public.ensure_default_coach_account(uuid, text) to authenticated, service_role;

comment on table public.coach_accounts is
  'Top-level personal coach workspace. Future B2B coach features should reference coach_account_id instead of only user_id/trainer_id.';

comment on table public.coach_memberships is
  'Users with access to a coach account/workspace. Supports owner, admin, coach and assistant roles.';

comment on column public.coach_accounts.source is
  'personal_coach is the native B2B/B2B2C workspace; club_bridge is reserved for future links to club accounts; migration is reserved for backfilled legacy trainer workspaces.';
