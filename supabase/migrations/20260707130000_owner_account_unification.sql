-- Issue #313: Unify clubs and private coach businesses under one owner account contract.

create table if not exists public.owner_accounts (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  name text not null,
  status text not null default 'active',
  source text not null default 'manual',
  coach_account_id uuid null unique references public.coach_accounts(id) on delete set null,
  club_id uuid null unique references public.clubs(id) on delete set null,
  owner_user_id uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_accounts_owner_type_check check (owner_type in ('club', 'private_coach_business')),
  constraint owner_accounts_status_check check (status in ('active', 'inactive')),
  constraint owner_accounts_source_check check (source in ('coach_account', 'club', 'manual', 'migration')),
  constraint owner_accounts_name_not_blank_check check (btrim(name) <> ''),
  constraint owner_accounts_single_legacy_source_check check (
    not (coach_account_id is not null and club_id is not null)
  )
);

create table if not exists public.owner_memberships (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text null,
  email text null,
  status text not null default 'active',
  source text not null default 'manual',
  added_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_memberships_status_check check (status in ('active', 'inactive')),
  constraint owner_memberships_source_check check (source in ('coach_membership', 'club_member', 'manual', 'migration')),
  constraint owner_memberships_email_lowercase_check check (email is null or email = lower(email)),
  unique (owner_account_id, user_id)
);

create table if not exists public.owner_membership_roles (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null,
  user_id uuid not null,
  role text not null,
  status text not null default 'active',
  source text not null default 'manual',
  added_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_membership_roles_membership_fkey foreign key (owner_account_id, user_id)
    references public.owner_memberships(owner_account_id, user_id)
    on delete cascade,
  constraint owner_membership_roles_role_check check (role in ('owner', 'admin', 'coach', 'assistant_coach', 'player')),
  constraint owner_membership_roles_status_check check (status in ('active', 'inactive')),
  constraint owner_membership_roles_source_check check (source in ('coach_membership', 'club_member', 'manual', 'migration')),
  unique (owner_account_id, user_id, role)
);

create table if not exists public.owner_players (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  source text not null default 'migration',
  linked_by uuid null references auth.users(id) on delete set null,
  coach_player_id uuid null references public.coach_players(id) on delete set null,
  club_member_id uuid null references public.club_members(id) on delete set null,
  club_id uuid null references public.clubs(id) on delete set null,
  first_linked_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_players_owner_player_key unique (owner_account_id, player_id),
  constraint owner_players_status_check check (status in ('active', 'pending', 'inactive', 'removed')),
  constraint owner_players_source_check check (
    source in ('coach_player', 'club_member', 'team_member', 'manual', 'migration')
  )
);

create table if not exists public.owner_player_guardians (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  relation text not null default 'parent',
  permissions jsonb not null default '{"read": true}'::jsonb,
  status text not null default 'active',
  invited_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_player_guardians_relation_check check (relation in ('parent', 'guardian')),
  constraint owner_player_guardians_status_check check (status in ('active', 'pending', 'inactive', 'removed')),
  unique (owner_account_id, player_id, guardian_user_id)
);

create index if not exists owner_accounts_owner_type_status_idx
  on public.owner_accounts (owner_type, status);

create index if not exists owner_accounts_owner_user_id_idx
  on public.owner_accounts (owner_user_id);

create index if not exists owner_memberships_owner_account_id_idx
  on public.owner_memberships (owner_account_id);

create index if not exists owner_memberships_user_id_idx
  on public.owner_memberships (user_id);

create index if not exists owner_memberships_user_status_idx
  on public.owner_memberships (user_id, status);

create index if not exists owner_membership_roles_owner_role_status_idx
  on public.owner_membership_roles (owner_account_id, role, status);

create index if not exists owner_membership_roles_user_status_idx
  on public.owner_membership_roles (user_id, status);

create index if not exists owner_players_owner_account_id_idx
  on public.owner_players (owner_account_id);

create index if not exists owner_players_player_id_idx
  on public.owner_players (player_id);

create index if not exists owner_players_owner_status_idx
  on public.owner_players (owner_account_id, status);

create index if not exists owner_players_club_id_idx
  on public.owner_players (club_id);

create index if not exists owner_player_guardians_owner_account_id_idx
  on public.owner_player_guardians (owner_account_id);

create index if not exists owner_player_guardians_player_id_idx
  on public.owner_player_guardians (player_id);

create index if not exists owner_player_guardians_guardian_user_id_idx
  on public.owner_player_guardians (guardian_user_id);

drop trigger if exists update_owner_accounts_updated_at on public.owner_accounts;
create trigger update_owner_accounts_updated_at
before update on public.owner_accounts
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_owner_memberships_updated_at on public.owner_memberships;
create trigger update_owner_memberships_updated_at
before update on public.owner_memberships
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_owner_membership_roles_updated_at on public.owner_membership_roles;
create trigger update_owner_membership_roles_updated_at
before update on public.owner_membership_roles
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_owner_players_updated_at on public.owner_players;
create trigger update_owner_players_updated_at
before update on public.owner_players
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_owner_player_guardians_updated_at on public.owner_player_guardians;
create trigger update_owner_player_guardians_updated_at
before update on public.owner_player_guardians
for each row
execute function public.trigger_update_timestamp();

create or replace function public.map_owner_membership_role(
  p_role text
)
returns text
language sql
immutable
as $$
  select case p_role
    when 'assistant' then 'assistant_coach'
    when 'assistant_coach' then 'assistant_coach'
    when 'owner' then 'owner'
    when 'admin' then 'admin'
    when 'coach' then 'coach'
    when 'player' then 'player'
    else null
  end;
$$;

create or replace function public.get_owner_account_id_for_coach_account(
  p_coach_account_id uuid
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select oa.id
  from public.owner_accounts oa
  where oa.coach_account_id = p_coach_account_id
  limit 1;
$$;

create or replace function public.get_owner_account_id_for_club(
  p_club_id uuid
)
returns uuid
language sql
security definer
set search_path = public
as $$
  select oa.id
  from public.owner_accounts oa
  where oa.club_id = p_club_id
  limit 1;
$$;

create or replace function public.ensure_owner_account_for_coach_account(
  p_coach_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.coach_accounts%rowtype;
  v_owner_account_id uuid;
begin
  if p_coach_account_id is null then
    return null;
  end if;

  select *
    into v_account
  from public.coach_accounts ca
  where ca.id = p_coach_account_id;

  if v_account.id is null then
    return null;
  end if;

  insert into public.owner_accounts (
    owner_type,
    name,
    status,
    source,
    coach_account_id,
    owner_user_id,
    created_at,
    updated_at
  )
  values (
    'private_coach_business',
    v_account.name,
    v_account.status,
    'coach_account',
    v_account.id,
    v_account.owner_user_id,
    v_account.created_at,
    v_account.updated_at
  )
  on conflict (coach_account_id)
  do update
     set owner_type = 'private_coach_business',
         name = excluded.name,
         status = excluded.status,
         source = 'coach_account',
         owner_user_id = excluded.owner_user_id,
         updated_at = now()
  returning id
    into v_owner_account_id;

  return v_owner_account_id;
end;
$$;

create or replace function public.ensure_owner_account_for_club(
  p_club_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs%rowtype;
  v_owner_user_id uuid;
  v_owner_account_id uuid;
begin
  if p_club_id is null then
    return null;
  end if;

  select *
    into v_club
  from public.clubs c
  where c.id = p_club_id;

  if v_club.id is null then
    return null;
  end if;

  select cm.user_id
    into v_owner_user_id
  from public.club_members cm
  where cm.club_id = p_club_id
    and cm.role = 'owner'
    and cm.status = 'active'
  order by cm.created_at asc
  limit 1;

  insert into public.owner_accounts (
    owner_type,
    name,
    status,
    source,
    club_id,
    owner_user_id,
    created_at,
    updated_at
  )
  values (
    'club',
    v_club.name,
    v_club.status,
    'club',
    v_club.id,
    v_owner_user_id,
    v_club.created_at,
    now()
  )
  on conflict (club_id)
  do update
     set owner_type = 'club',
         name = excluded.name,
         status = excluded.status,
         source = 'club',
         owner_user_id = coalesce(excluded.owner_user_id, public.owner_accounts.owner_user_id),
         updated_at = now()
  returning id
    into v_owner_account_id;

  return v_owner_account_id;
end;
$$;

create or replace function public.ensure_owner_membership(
  p_owner_account_id uuid,
  p_user_id uuid,
  p_full_name text default null,
  p_email text default null,
  p_status text default 'active',
  p_source text default 'manual',
  p_added_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_membership_id uuid;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_full_name text := nullif(btrim(coalesce(p_full_name, '')), '');
begin
  if p_owner_account_id is null or p_user_id is null then
    return null;
  end if;

  insert into public.owner_memberships (
    owner_account_id,
    user_id,
    full_name,
    email,
    status,
    source,
    added_by
  )
  values (
    p_owner_account_id,
    p_user_id,
    v_full_name,
    v_email,
    coalesce(p_status, 'active'),
    coalesce(p_source, 'manual'),
    p_added_by
  )
  on conflict (owner_account_id, user_id)
  do update
     set full_name = coalesce(public.owner_memberships.full_name, excluded.full_name),
         email = coalesce(public.owner_memberships.email, excluded.email),
         status = excluded.status,
         source = excluded.source,
         added_by = coalesce(public.owner_memberships.added_by, excluded.added_by),
         updated_at = now()
  returning id
    into v_membership_id;

  return v_membership_id;
end;
$$;

create or replace function public.upsert_owner_membership_role(
  p_owner_account_id uuid,
  p_user_id uuid,
  p_role text,
  p_status text default 'active',
  p_source text default 'manual',
  p_added_by uuid default null,
  p_full_name text default null,
  p_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.map_owner_membership_role(p_role);
  v_role_id uuid;
begin
  if p_owner_account_id is null or p_user_id is null or v_role is null then
    return null;
  end if;

  perform public.ensure_owner_membership(
    p_owner_account_id,
    p_user_id,
    p_full_name,
    p_email,
    coalesce(p_status, 'active'),
    coalesce(p_source, 'manual'),
    p_added_by
  );

  insert into public.owner_membership_roles (
    owner_account_id,
    user_id,
    role,
    status,
    source,
    added_by
  )
  values (
    p_owner_account_id,
    p_user_id,
    v_role,
    coalesce(p_status, 'active'),
    coalesce(p_source, 'manual'),
    p_added_by
  )
  on conflict (owner_account_id, user_id, role)
  do update
     set status = excluded.status,
         source = excluded.source,
         added_by = coalesce(public.owner_membership_roles.added_by, excluded.added_by),
         updated_at = now()
  returning id
    into v_role_id;

  return v_role_id;
end;
$$;

create or replace function public.upsert_owner_player_from_legacy(
  p_owner_account_id uuid,
  p_player_id uuid,
  p_status text default 'active',
  p_source text default 'migration',
  p_linked_by uuid default null,
  p_coach_player_id uuid default null,
  p_club_member_id uuid default null,
  p_club_id uuid default null,
  p_first_linked_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_player_id uuid;
begin
  if p_owner_account_id is null or p_player_id is null then
    return null;
  end if;

  insert into public.owner_players (
    owner_account_id,
    player_id,
    status,
    source,
    linked_by,
    coach_player_id,
    club_member_id,
    club_id,
    first_linked_at,
    last_synced_at
  )
  values (
    p_owner_account_id,
    p_player_id,
    coalesce(p_status, 'active'),
    coalesce(p_source, 'migration'),
    p_linked_by,
    p_coach_player_id,
    p_club_member_id,
    p_club_id,
    coalesce(p_first_linked_at, now()),
    now()
  )
  on conflict (owner_account_id, player_id)
  do update
     set status = case
           when excluded.status = 'active' then 'active'
           else public.owner_players.status
         end,
         linked_by = coalesce(public.owner_players.linked_by, excluded.linked_by),
         coach_player_id = coalesce(public.owner_players.coach_player_id, excluded.coach_player_id),
         club_member_id = coalesce(public.owner_players.club_member_id, excluded.club_member_id),
         club_id = coalesce(public.owner_players.club_id, excluded.club_id),
         first_linked_at = least(public.owner_players.first_linked_at, excluded.first_linked_at),
         last_synced_at = now()
  returning id
    into v_owner_player_id;

  return v_owner_player_id;
end;
$$;

with coach_owner_accounts as (
  select public.ensure_owner_account_for_coach_account(ca.id) as owner_account_id
  from public.coach_accounts ca
)
select count(*) from coach_owner_accounts;

with club_owner_accounts as (
  select public.ensure_owner_account_for_club(c.id) as owner_account_id
  from public.clubs c
)
select count(*) from club_owner_accounts;

with coach_roles as (
  select
    public.ensure_owner_account_for_coach_account(cm.coach_account_id) as owner_account_id,
    cm.user_id,
    cm.role,
    cm.status,
    cm.added_by
  from public.coach_memberships cm
)
select public.upsert_owner_membership_role(
  cr.owner_account_id,
  cr.user_id,
  cr.role,
  cr.status,
  'coach_membership',
  cr.added_by
)
from coach_roles cr
where cr.owner_account_id is not null;

with club_roles as (
  select
    public.ensure_owner_account_for_club(cm.club_id) as owner_account_id,
    cm.user_id,
    cm.role,
    cm.status,
    cm.full_name,
    cm.email,
    cm.id as club_member_id,
    cm.club_id,
    cm.created_at
  from public.club_members cm
)
select public.upsert_owner_membership_role(
  cr.owner_account_id,
  cr.user_id,
  cr.role,
  cr.status,
  'club_member',
  null,
  cr.full_name,
  cr.email
)
from club_roles cr
where cr.owner_account_id is not null;

with coach_player_links as (
  select
    public.ensure_owner_account_for_coach_account(cp.coach_account_id) as owner_account_id,
    cp.player_id,
    cp.status,
    cp.linked_by,
    cp.id as coach_player_id,
    cp.club_id,
    cp.first_linked_at
  from public.coach_players cp
)
select public.upsert_owner_player_from_legacy(
  cpl.owner_account_id,
  cpl.player_id,
  cpl.status,
  'coach_player',
  cpl.linked_by,
  cpl.coach_player_id,
  null,
  cpl.club_id,
  cpl.first_linked_at
)
from coach_player_links cpl
where cpl.owner_account_id is not null;

with club_player_links as (
  select
    public.ensure_owner_account_for_club(cm.club_id) as owner_account_id,
    cm.user_id as player_id,
    cm.status,
    cm.id as club_member_id,
    cm.club_id,
    cm.created_at
  from public.club_members cm
  where cm.role = 'player'
)
select public.upsert_owner_player_from_legacy(
  cpl.owner_account_id,
  cpl.player_id,
  cpl.status,
  'club_member',
  null,
  null,
  cpl.club_member_id,
  cpl.club_id,
  cpl.created_at
)
from club_player_links cpl
where cpl.owner_account_id is not null;

with team_player_links as (
  select
    public.ensure_owner_account_for_club(t.club_id) as owner_account_id,
    tm.player_id,
    'active'::text as status,
    t.admin_id as linked_by,
    t.club_id,
    tm.created_at
  from public.team_members tm
  join public.teams t
    on t.id = tm.team_id
  where t.club_id is not null
)
select public.upsert_owner_player_from_legacy(
  tpl.owner_account_id,
  tpl.player_id,
  tpl.status,
  'team_member',
  tpl.linked_by,
  null,
  null,
  tpl.club_id,
  tpl.created_at
)
from team_player_links tpl
where tpl.owner_account_id is not null;

create or replace function public.sync_owner_account_from_coach_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_owner_account_for_coach_account(new.id);
  return new;
end;
$$;

drop trigger if exists sync_owner_account_from_coach_account on public.coach_accounts;
create trigger sync_owner_account_from_coach_account
after insert or update of name, status, owner_user_id on public.coach_accounts
for each row
execute function public.sync_owner_account_from_coach_account();

create or replace function public.sync_owner_account_from_club()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_owner_account_for_club(new.id);
  return new;
end;
$$;

drop trigger if exists sync_owner_account_from_club on public.clubs;
create trigger sync_owner_account_from_club
after insert or update of name, status on public.clubs
for each row
execute function public.sync_owner_account_from_club();

create or replace function public.sync_owner_role_from_coach_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
begin
  v_owner_account_id := public.ensure_owner_account_for_coach_account(new.coach_account_id);

  perform public.upsert_owner_membership_role(
    v_owner_account_id,
    new.user_id,
    new.role,
    new.status,
    'coach_membership',
    new.added_by
  );

  return new;
end;
$$;

drop trigger if exists sync_owner_role_from_coach_membership on public.coach_memberships;
create trigger sync_owner_role_from_coach_membership
after insert or update of user_id, role, status, added_by on public.coach_memberships
for each row
execute function public.sync_owner_role_from_coach_membership();

create or replace function public.sync_owner_role_from_club_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
begin
  v_owner_account_id := public.ensure_owner_account_for_club(new.club_id);

  perform public.upsert_owner_membership_role(
    v_owner_account_id,
    new.user_id,
    new.role,
    new.status,
    'club_member',
    null,
    new.full_name,
    new.email
  );

  if new.role = 'player' then
    perform public.upsert_owner_player_from_legacy(
      v_owner_account_id,
      new.user_id,
      new.status,
      'club_member',
      null,
      null,
      new.id,
      new.club_id,
      coalesce(new.created_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_owner_role_from_club_member on public.club_members;
create trigger sync_owner_role_from_club_member
after insert or update of user_id, role, status, full_name, email on public.club_members
for each row
execute function public.sync_owner_role_from_club_member();

create or replace function public.sync_owner_player_from_coach_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
begin
  v_owner_account_id := public.ensure_owner_account_for_coach_account(new.coach_account_id);

  perform public.upsert_owner_player_from_legacy(
    v_owner_account_id,
    new.player_id,
    new.status,
    'coach_player',
    new.linked_by,
    new.id,
    null,
    new.club_id,
    coalesce(new.first_linked_at, new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists sync_owner_player_from_coach_player on public.coach_players;
create trigger sync_owner_player_from_coach_player
after insert or update of coach_account_id, player_id, status, linked_by, club_id on public.coach_players
for each row
execute function public.sync_owner_player_from_coach_player();

create or replace function public.sync_owner_player_from_team_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
  v_club_id uuid;
  v_linked_by uuid;
begin
  select t.club_id, t.admin_id
    into v_club_id, v_linked_by
  from public.teams t
  where t.id = new.team_id;

  if v_club_id is null then
    return new;
  end if;

  v_owner_account_id := public.ensure_owner_account_for_club(v_club_id);

  perform public.upsert_owner_player_from_legacy(
    v_owner_account_id,
    new.player_id,
    'active',
    'team_member',
    v_linked_by,
    null,
    null,
    v_club_id,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists sync_owner_player_from_team_member on public.team_members;
create trigger sync_owner_player_from_team_member
after insert or update of team_id, player_id on public.team_members
for each row
execute function public.sync_owner_player_from_team_member();

create or replace function public.get_owner_account_roles(
  p_owner_account_id uuid,
  p_user_id uuid
)
returns text[]
language sql
security definer
set search_path = public
as $$
  select coalesce(array_agg(omr.role order by omr.role), '{}'::text[])
  from public.owner_memberships om
  join public.owner_membership_roles omr
    on omr.owner_account_id = om.owner_account_id
   and omr.user_id = om.user_id
   and omr.status = 'active'
  where om.owner_account_id = p_owner_account_id
    and om.user_id = p_user_id
    and om.status = 'active';
$$;

create or replace function public.get_current_owner_account_roles(
  p_owner_account_id uuid
)
returns text[]
language sql
security definer
set search_path = public
as $$
  select public.get_owner_account_roles(p_owner_account_id, (select auth.uid()));
$$;

create or replace function public.has_owner_account_role(
  p_owner_account_id uuid,
  p_user_id uuid,
  p_roles text[]
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.owner_memberships om
    join public.owner_membership_roles omr
      on omr.owner_account_id = om.owner_account_id
     and omr.user_id = om.user_id
     and omr.status = 'active'
    where om.owner_account_id = p_owner_account_id
      and om.user_id = p_user_id
      and om.status = 'active'
      and omr.role = any(coalesce(p_roles, '{}'::text[]))
  );
$$;

create or replace function public.is_owner_account_member(
  p_owner_account_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.owner_memberships om
    join public.owner_membership_roles omr
      on omr.owner_account_id = om.owner_account_id
     and omr.user_id = om.user_id
     and omr.status = 'active'
    where om.owner_account_id = p_owner_account_id
      and om.user_id = p_user_id
      and om.status = 'active'
  );
$$;

create or replace function public.is_owner_account_admin(
  p_owner_account_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_owner_account_role(p_owner_account_id, p_user_id, array['owner', 'admin']);
$$;

create or replace function public.is_owner_account_owner(
  p_owner_account_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_owner_account_role(p_owner_account_id, p_user_id, array['owner']);
$$;

create or replace function public.has_owner_account_coach_access(
  p_owner_account_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_owner_account_role(
    p_owner_account_id,
    p_user_id,
    array['owner', 'admin', 'coach', 'assistant_coach']
  );
$$;

create or replace function public.can_owner_guardian_read_player(
  p_owner_account_id uuid,
  p_guardian_user_id uuid,
  p_player_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.owner_player_guardians opg
    where opg.owner_account_id = p_owner_account_id
      and opg.guardian_user_id = p_guardian_user_id
      and opg.player_id = p_player_id
      and opg.status = 'active'
      and coalesce((opg.permissions ->> 'read')::boolean, true)
  );
$$;

create or replace function public.can_guardian_read_player_scoped_data(
  p_guardian_user_id uuid,
  p_player_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.owner_player_guardians opg
    where opg.guardian_user_id = p_guardian_user_id
      and opg.player_id = p_player_id
      and opg.status = 'active'
      and coalesce((opg.permissions ->> 'read')::boolean, true)
  );
$$;

create or replace function public.can_owner_account_access_player(
  p_owner_account_id uuid,
  p_actor_user_id uuid,
  p_player_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(p_actor_user_id = p_player_id, false)
    or (
      public.has_owner_account_coach_access(p_owner_account_id, p_actor_user_id)
      and exists (
        select 1
        from public.owner_players op
        where op.owner_account_id = p_owner_account_id
          and op.player_id = p_player_id
          and op.status = 'active'
      )
    )
    or public.can_owner_guardian_read_player(
      p_owner_account_id,
      p_actor_user_id,
      p_player_id
    );
$$;

create or replace function public.assert_current_owner_account_admin(
  p_owner_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_owner_account_admin(p_owner_account_id, (select auth.uid())) is not true then
    raise exception 'FORBIDDEN'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_current_owner_account_coach_access(
  p_owner_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_owner_account_coach_access(p_owner_account_id, (select auth.uid())) is not true then
    raise exception 'FORBIDDEN'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.get_owner_account_unification_audit()
returns table (
  check_name text,
  issue_count bigint,
  sample_ids jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    'coach_accounts_without_owner_account'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select ca.id
        from public.coach_accounts ca
        where not exists (
          select 1
          from public.owner_accounts oa
          where oa.coach_account_id = ca.id
        )
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.coach_accounts ca
  where not exists (
    select 1
    from public.owner_accounts oa
    where oa.coach_account_id = ca.id
  )

  union all

  select
    'clubs_without_owner_account'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select c.id
        from public.clubs c
        where not exists (
          select 1
          from public.owner_accounts oa
          where oa.club_id = c.id
        )
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.clubs c
  where not exists (
    select 1
    from public.owner_accounts oa
    where oa.club_id = c.id
  )

  union all

  select
    'active_coach_memberships_without_owner_role'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select cm.id
        from public.coach_memberships cm
        join public.owner_accounts oa
          on oa.coach_account_id = cm.coach_account_id
        where cm.status = 'active'
          and not exists (
            select 1
            from public.owner_membership_roles omr
            where omr.owner_account_id = oa.id
              and omr.user_id = cm.user_id
              and omr.role = public.map_owner_membership_role(cm.role)
              and omr.status = 'active'
          )
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.coach_memberships cm
  join public.owner_accounts oa
    on oa.coach_account_id = cm.coach_account_id
  where cm.status = 'active'
    and not exists (
      select 1
      from public.owner_membership_roles omr
      where omr.owner_account_id = oa.id
        and omr.user_id = cm.user_id
        and omr.role = public.map_owner_membership_role(cm.role)
        and omr.status = 'active'
    )

  union all

  select
    'active_club_members_without_owner_role'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select cm.id
        from public.club_members cm
        join public.owner_accounts oa
          on oa.club_id = cm.club_id
        where cm.status = 'active'
          and not exists (
            select 1
            from public.owner_membership_roles omr
            where omr.owner_account_id = oa.id
              and omr.user_id = cm.user_id
              and omr.role = public.map_owner_membership_role(cm.role)
              and omr.status = 'active'
          )
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.club_members cm
  join public.owner_accounts oa
    on oa.club_id = cm.club_id
  where cm.status = 'active'
    and not exists (
      select 1
      from public.owner_membership_roles omr
      where omr.owner_account_id = oa.id
        and omr.user_id = cm.user_id
        and omr.role = public.map_owner_membership_role(cm.role)
        and omr.status = 'active'
    )

  union all

  select
    'coach_players_without_owner_player'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select cp.id
        from public.coach_players cp
        join public.owner_accounts oa
          on oa.coach_account_id = cp.coach_account_id
        where cp.status = 'active'
          and not exists (
            select 1
            from public.owner_players op
            where op.owner_account_id = oa.id
              and op.player_id = cp.player_id
              and op.status = 'active'
          )
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.coach_players cp
  join public.owner_accounts oa
    on oa.coach_account_id = cp.coach_account_id
  where cp.status = 'active'
    and not exists (
      select 1
      from public.owner_players op
      where op.owner_account_id = oa.id
        and op.player_id = cp.player_id
        and op.status = 'active'
    )

  union all

  select
    'owner_memberships_without_active_roles'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select om.id
        from public.owner_memberships om
        where om.status = 'active'
          and not exists (
            select 1
            from public.owner_membership_roles omr
            where omr.owner_account_id = om.owner_account_id
              and omr.user_id = om.user_id
              and omr.status = 'active'
          )
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.owner_memberships om
  where om.status = 'active'
    and not exists (
      select 1
      from public.owner_membership_roles omr
      where omr.owner_account_id = om.owner_account_id
        and omr.user_id = om.user_id
        and omr.status = 'active'
    );
end;
$$;

alter table public.owner_accounts enable row level security;
alter table public.owner_memberships enable row level security;
alter table public.owner_membership_roles enable row level security;
alter table public.owner_players enable row level security;
alter table public.owner_player_guardians enable row level security;

drop policy if exists "Owner members and linked users can view owner accounts" on public.owner_accounts;
create policy "Owner members and linked users can view owner accounts"
  on public.owner_accounts
  for select
  to authenticated
  using (
    public.is_owner_account_member(id, (select auth.uid()))
    or exists (
      select 1
      from public.owner_players op
      where op.owner_account_id = id
        and op.player_id = (select auth.uid())
        and op.status = 'active'
    )
    or exists (
      select 1
      from public.owner_player_guardians opg
      where opg.owner_account_id = id
        and opg.guardian_user_id = (select auth.uid())
        and opg.status = 'active'
    )
  );

drop policy if exists "Authenticated users can create owned private owner accounts" on public.owner_accounts;
create policy "Authenticated users can create owned private owner accounts"
  on public.owner_accounts
  for insert
  to authenticated
  with check (
    owner_type = 'private_coach_business'
    and owner_user_id = (select auth.uid())
    and status = 'active'
  );

drop policy if exists "Owner admins can update owner accounts" on public.owner_accounts;
create policy "Owner admins can update owner accounts"
  on public.owner_accounts
  for update
  to authenticated
  using (public.is_owner_account_admin(id, (select auth.uid())))
  with check (public.is_owner_account_admin(id, (select auth.uid())));

drop policy if exists "Owner users can delete owner accounts" on public.owner_accounts;
create policy "Owner users can delete owner accounts"
  on public.owner_accounts
  for delete
  to authenticated
  using (public.is_owner_account_owner(id, (select auth.uid())));

drop policy if exists "Owner members can view owner memberships" on public.owner_memberships;
create policy "Owner members can view owner memberships"
  on public.owner_memberships
  for select
  to authenticated
  using (public.is_owner_account_member(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can create owner memberships" on public.owner_memberships;
create policy "Owner admins can create owner memberships"
  on public.owner_memberships
  for insert
  to authenticated
  with check (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can update owner memberships" on public.owner_memberships;
create policy "Owner admins can update owner memberships"
  on public.owner_memberships
  for update
  to authenticated
  using (public.is_owner_account_admin(owner_account_id, (select auth.uid())))
  with check (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can delete owner memberships" on public.owner_memberships;
create policy "Owner admins can delete owner memberships"
  on public.owner_memberships
  for delete
  to authenticated
  using (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

drop policy if exists "Owner members can view owner membership roles" on public.owner_membership_roles;
create policy "Owner members can view owner membership roles"
  on public.owner_membership_roles
  for select
  to authenticated
  using (public.is_owner_account_member(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can create owner membership roles" on public.owner_membership_roles;
create policy "Owner admins can create owner membership roles"
  on public.owner_membership_roles
  for insert
  to authenticated
  with check (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can update owner membership roles" on public.owner_membership_roles;
create policy "Owner admins can update owner membership roles"
  on public.owner_membership_roles
  for update
  to authenticated
  using (public.is_owner_account_admin(owner_account_id, (select auth.uid())))
  with check (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can delete owner membership roles" on public.owner_membership_roles;
create policy "Owner admins can delete owner membership roles"
  on public.owner_membership_roles
  for delete
  to authenticated
  using (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

drop policy if exists "Owner staff players and guardians can view owner players" on public.owner_players;
create policy "Owner staff players and guardians can view owner players"
  on public.owner_players
  for select
  to authenticated
  using (
    public.has_owner_account_coach_access(owner_account_id, (select auth.uid()))
    or player_id = (select auth.uid())
    or public.can_owner_guardian_read_player(owner_account_id, (select auth.uid()), player_id)
  );

drop policy if exists "Owner coaches can create owner players" on public.owner_players;
create policy "Owner coaches can create owner players"
  on public.owner_players
  for insert
  to authenticated
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can update owner players" on public.owner_players;
create policy "Owner coaches can update owner players"
  on public.owner_players
  for update
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can delete owner players" on public.owner_players;
create policy "Owner admins can delete owner players"
  on public.owner_players
  for delete
  to authenticated
  using (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

drop policy if exists "Owner staff players and guardians can view guardian links" on public.owner_player_guardians;
create policy "Owner staff players and guardians can view guardian links"
  on public.owner_player_guardians
  for select
  to authenticated
  using (
    public.has_owner_account_coach_access(owner_account_id, (select auth.uid()))
    or player_id = (select auth.uid())
    or guardian_user_id = (select auth.uid())
  );

drop policy if exists "Owner admins can create guardian links" on public.owner_player_guardians;
create policy "Owner admins can create guardian links"
  on public.owner_player_guardians
  for insert
  to authenticated
  with check (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can update guardian links" on public.owner_player_guardians;
create policy "Owner admins can update guardian links"
  on public.owner_player_guardians
  for update
  to authenticated
  using (public.is_owner_account_admin(owner_account_id, (select auth.uid())))
  with check (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can delete guardian links" on public.owner_player_guardians;
create policy "Owner admins can delete guardian links"
  on public.owner_player_guardians
  for delete
  to authenticated
  using (public.is_owner_account_admin(owner_account_id, (select auth.uid())));

revoke all on public.owner_accounts from anon;
revoke all on public.owner_memberships from anon;
revoke all on public.owner_membership_roles from anon;
revoke all on public.owner_players from anon;
revoke all on public.owner_player_guardians from anon;

grant select, insert, update, delete on public.owner_accounts to authenticated;
grant select, insert, update, delete on public.owner_memberships to authenticated;
grant select, insert, update, delete on public.owner_membership_roles to authenticated;
grant select, insert, update, delete on public.owner_players to authenticated;
grant select, insert, update, delete on public.owner_player_guardians to authenticated;

grant all on public.owner_accounts to service_role;
grant all on public.owner_memberships to service_role;
grant all on public.owner_membership_roles to service_role;
grant all on public.owner_players to service_role;
grant all on public.owner_player_guardians to service_role;

revoke all on function public.map_owner_membership_role(text) from public;
revoke all on function public.get_owner_account_id_for_coach_account(uuid) from public;
revoke all on function public.get_owner_account_id_for_club(uuid) from public;
revoke all on function public.ensure_owner_account_for_coach_account(uuid) from public;
revoke all on function public.ensure_owner_account_for_club(uuid) from public;
revoke all on function public.ensure_owner_membership(uuid, uuid, text, text, text, text, uuid) from public;
revoke all on function public.upsert_owner_membership_role(uuid, uuid, text, text, text, uuid, text, text) from public;
revoke all on function public.upsert_owner_player_from_legacy(uuid, uuid, text, text, uuid, uuid, uuid, uuid, timestamptz) from public;
revoke all on function public.get_owner_account_roles(uuid, uuid) from public;
revoke all on function public.get_current_owner_account_roles(uuid) from public;
revoke all on function public.has_owner_account_role(uuid, uuid, text[]) from public;
revoke all on function public.is_owner_account_member(uuid, uuid) from public;
revoke all on function public.is_owner_account_admin(uuid, uuid) from public;
revoke all on function public.is_owner_account_owner(uuid, uuid) from public;
revoke all on function public.has_owner_account_coach_access(uuid, uuid) from public;
revoke all on function public.can_owner_guardian_read_player(uuid, uuid, uuid) from public;
revoke all on function public.can_owner_account_access_player(uuid, uuid, uuid) from public;
revoke all on function public.assert_current_owner_account_admin(uuid) from public;
revoke all on function public.assert_current_owner_account_coach_access(uuid) from public;
revoke all on function public.get_owner_account_unification_audit() from public;

grant execute on function public.map_owner_membership_role(text) to authenticated, service_role;
grant execute on function public.get_owner_account_id_for_coach_account(uuid) to authenticated, service_role;
grant execute on function public.get_owner_account_id_for_club(uuid) to authenticated, service_role;
grant execute on function public.ensure_owner_account_for_coach_account(uuid) to service_role;
grant execute on function public.ensure_owner_account_for_club(uuid) to service_role;
grant execute on function public.ensure_owner_membership(uuid, uuid, text, text, text, text, uuid) to service_role;
grant execute on function public.upsert_owner_membership_role(uuid, uuid, text, text, text, uuid, text, text) to service_role;
grant execute on function public.upsert_owner_player_from_legacy(uuid, uuid, text, text, uuid, uuid, uuid, uuid, timestamptz) to service_role;
grant execute on function public.get_owner_account_roles(uuid, uuid) to service_role;
grant execute on function public.get_current_owner_account_roles(uuid) to authenticated, service_role;
grant execute on function public.has_owner_account_role(uuid, uuid, text[]) to authenticated, service_role;
grant execute on function public.is_owner_account_member(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_owner_account_admin(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_owner_account_owner(uuid, uuid) to authenticated, service_role;
grant execute on function public.has_owner_account_coach_access(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_owner_guardian_read_player(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.can_owner_account_access_player(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.assert_current_owner_account_admin(uuid) to authenticated, service_role;
grant execute on function public.assert_current_owner_account_coach_access(uuid) to authenticated, service_role;
grant execute on function public.get_owner_account_unification_audit() to service_role;

comment on table public.owner_accounts is
  'Unified top-level owner scope for clubs and private coach businesses. Future B2B coach features should reference owner_account_id.';

comment on table public.owner_memberships is
  'Users attached to an owner account. Roles live in owner_membership_roles so one user can be owner, admin and coach at the same time.';

comment on table public.owner_membership_roles is
  'Multi-role assignment table for owner accounts. Permissions are calculated from the sum of active roles.';

comment on table public.owner_players is
  'Unified player roster scoped by owner account, backfilled from coach_players, club_members and club team memberships.';

comment on table public.owner_player_guardians is
  'Explicit parent/guardian-to-player relation. Guardian access is never inferred from email or profile text.';

comment on function public.get_owner_account_unification_audit() is
  'Service-role audit RPC for validating #313 owner-account backfill coverage.';

comment on function public.can_guardian_read_player_scoped_data(uuid, uuid) is
  'Guardian gate backed by explicit owner_player_guardians rows. Returns false unless an active relation exists.';
