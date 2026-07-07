-- Issue #279: Backfill legacy trainer/player/team relations into coach workspaces.

alter table public.teams
  add column if not exists coach_account_id uuid references public.coach_accounts(id) on delete set null;

alter table public.player_invitations
  add column if not exists coach_account_id uuid references public.coach_accounts(id) on delete set null;

alter table public.admin_player_link_requests
  add column if not exists coach_account_id uuid references public.coach_accounts(id) on delete set null;

create index if not exists teams_coach_account_id_idx
  on public.teams (coach_account_id);

create index if not exists player_invitations_coach_account_id_idx
  on public.player_invitations (coach_account_id);

create index if not exists admin_player_link_requests_coach_account_id_idx
  on public.admin_player_link_requests (coach_account_id);

create table if not exists public.coach_players (
  id uuid primary key default gen_random_uuid(),
  coach_account_id uuid not null references public.coach_accounts(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  source text not null default 'migration',
  linked_by uuid null references auth.users(id) on delete set null,
  invitation_id uuid null references public.player_invitations(id) on delete set null,
  link_request_id uuid null references public.admin_player_link_requests(id) on delete set null,
  club_id uuid null references public.clubs(id) on delete set null,
  first_linked_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_players_account_player_key unique (coach_account_id, player_id),
  constraint coach_players_status_check check (status in ('active', 'pending', 'inactive', 'removed')),
  constraint coach_players_source_check check (
    source in (
      'admin_player_relationship',
      'player_invitation',
      'link_request',
      'team_member',
      'manual',
      'migration'
    )
  )
);

create index if not exists coach_players_account_id_idx
  on public.coach_players (coach_account_id);

create index if not exists coach_players_player_id_idx
  on public.coach_players (player_id);

create index if not exists coach_players_account_status_idx
  on public.coach_players (coach_account_id, status);

create index if not exists coach_players_linked_by_idx
  on public.coach_players (linked_by);

drop trigger if exists update_coach_players_updated_at on public.coach_players;
create trigger update_coach_players_updated_at
before update on public.coach_players
for each row
execute function public.trigger_update_timestamp();

create or replace function public.ensure_migration_coach_account_for_user(
  p_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account_id uuid;
  v_profile_name text;
  v_account_name text;
begin
  if p_user_id is null then
    return null;
  end if;

  select ca.id
    into v_account_id
  from public.coach_accounts ca
  where ca.owner_user_id = p_user_id
    and ca.status = 'active'
    and ca.source in ('personal_coach', 'migration')
  order by ca.created_at asc
  limit 1;

  if v_account_id is null then
    select nullif(btrim(p.full_name), '')
      into v_profile_name
    from public.profiles p
    where p.user_id = p_user_id;

    v_account_name := coalesce(v_profile_name || '''s workspace', 'Coach workspace');

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
      'migration'
    )
    returning id
      into v_account_id;
  end if;

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
end;
$$;

revoke all on function public.ensure_migration_coach_account_for_user(uuid) from public;
grant execute on function public.ensure_migration_coach_account_for_user(uuid) to service_role;

create or replace function public.upsert_coach_player_from_legacy(
  p_coach_account_id uuid,
  p_player_id uuid,
  p_status text,
  p_source text,
  p_linked_by uuid default null,
  p_invitation_id uuid default null,
  p_link_request_id uuid default null,
  p_club_id uuid default null,
  p_first_linked_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_player_id uuid;
begin
  if p_coach_account_id is null or p_player_id is null then
    return null;
  end if;

  insert into public.coach_players (
    coach_account_id,
    player_id,
    status,
    source,
    linked_by,
    invitation_id,
    link_request_id,
    club_id,
    first_linked_at,
    last_synced_at
  )
  values (
    p_coach_account_id,
    p_player_id,
    coalesce(p_status, 'active'),
    coalesce(p_source, 'migration'),
    p_linked_by,
    p_invitation_id,
    p_link_request_id,
    p_club_id,
    coalesce(p_first_linked_at, now()),
    now()
  )
  on conflict (coach_account_id, player_id)
  do update
     set status = case
           when excluded.status = 'active' then 'active'
           else public.coach_players.status
         end,
         linked_by = coalesce(public.coach_players.linked_by, excluded.linked_by),
         invitation_id = coalesce(public.coach_players.invitation_id, excluded.invitation_id),
         link_request_id = coalesce(public.coach_players.link_request_id, excluded.link_request_id),
         club_id = coalesce(public.coach_players.club_id, excluded.club_id),
         first_linked_at = least(public.coach_players.first_linked_at, excluded.first_linked_at),
         last_synced_at = now()
  returning id
    into v_coach_player_id;

  return v_coach_player_id;
end;
$$;

revoke all on function public.upsert_coach_player_from_legacy(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) from public;
grant execute on function public.upsert_coach_player_from_legacy(
  uuid,
  uuid,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid,
  timestamptz
) to service_role;

with source_coaches as (
  select apr.admin_id as user_id
  from public.admin_player_relationships apr
  union
  select pi.admin_id
  from public.player_invitations pi
  union
  select aplr.admin_id
  from public.admin_player_link_requests aplr
  union
  select t.admin_id
  from public.teams t
  union
  select cm.user_id
  from public.club_members cm
  where cm.status = 'active'
    and cm.role in ('owner', 'admin', 'coach')
)
select public.ensure_migration_coach_account_for_user(sc.user_id)
from source_coaches sc
where sc.user_id is not null;

update public.teams t
set coach_account_id = public.ensure_migration_coach_account_for_user(t.admin_id)
where t.coach_account_id is null
  and t.admin_id is not null;

update public.player_invitations pi
set coach_account_id = public.ensure_migration_coach_account_for_user(pi.admin_id)
where pi.coach_account_id is null
  and pi.admin_id is not null;

update public.admin_player_link_requests aplr
set coach_account_id = public.ensure_migration_coach_account_for_user(aplr.admin_id)
where aplr.coach_account_id is null
  and aplr.admin_id is not null;

with linked_players as (
  select
    public.ensure_migration_coach_account_for_user(apr.admin_id) as coach_account_id,
    apr.player_id,
    apr.admin_id as linked_by,
    apr.created_at as first_linked_at
  from public.admin_player_relationships apr
)
select public.upsert_coach_player_from_legacy(
  lp.coach_account_id,
  lp.player_id,
  'active',
  'admin_player_relationship',
  lp.linked_by,
  null,
  null,
  null,
  lp.first_linked_at
)
from linked_players lp
where lp.coach_account_id is not null
  and lp.player_id is not null;

with accepted_invitations as (
  select
    pi.coach_account_id,
    pi.player_id,
    pi.admin_id as linked_by,
    pi.id as invitation_id,
    coalesce(pi.accepted_at, pi.created_at, now()) as first_linked_at
  from public.player_invitations pi
  where pi.status = 'accepted'
    and pi.player_id is not null
)
select public.upsert_coach_player_from_legacy(
  ai.coach_account_id,
  ai.player_id,
  'active',
  'player_invitation',
  ai.linked_by,
  ai.invitation_id,
  null,
  null,
  ai.first_linked_at
)
from accepted_invitations ai
where ai.coach_account_id is not null;

with accepted_requests as (
  select
    aplr.coach_account_id,
    aplr.player_id,
    aplr.admin_id as linked_by,
    aplr.id as link_request_id,
    coalesce(aplr.accepted_at, aplr.created_at, now()) as first_linked_at
  from public.admin_player_link_requests aplr
  where aplr.status = 'accepted'
)
select public.upsert_coach_player_from_legacy(
  ar.coach_account_id,
  ar.player_id,
  'active',
  'link_request',
  ar.linked_by,
  null,
  ar.link_request_id,
  null,
  ar.first_linked_at
)
from accepted_requests ar
where ar.coach_account_id is not null;

with team_players as (
  select
    t.coach_account_id,
    tm.player_id,
    t.admin_id as linked_by,
    tm.created_at as first_linked_at
  from public.team_members tm
  join public.teams t
    on t.id = tm.team_id
)
select public.upsert_coach_player_from_legacy(
  tp.coach_account_id,
  tp.player_id,
  'active',
  'team_member',
  tp.linked_by,
  null,
  null,
  null,
  tp.first_linked_at
)
from team_players tp
where tp.coach_account_id is not null
  and tp.player_id is not null;

create or replace function public.set_team_coach_account_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coach_account_id is null
     or (tg_op = 'UPDATE' and new.admin_id is distinct from old.admin_id)
  then
    new.coach_account_id := public.ensure_migration_coach_account_for_user(new.admin_id);
  end if;

  return new;
end;
$$;

drop trigger if exists set_team_coach_account_id on public.teams;
create trigger set_team_coach_account_id
before insert or update of admin_id, coach_account_id on public.teams
for each row
execute function public.set_team_coach_account_id();

create or replace function public.set_player_invitation_coach_account_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coach_account_id is null
     or (tg_op = 'UPDATE' and new.admin_id is distinct from old.admin_id)
  then
    new.coach_account_id := public.ensure_migration_coach_account_for_user(new.admin_id);
  end if;

  return new;
end;
$$;

drop trigger if exists set_player_invitation_coach_account_id on public.player_invitations;
create trigger set_player_invitation_coach_account_id
before insert or update of admin_id, coach_account_id on public.player_invitations
for each row
execute function public.set_player_invitation_coach_account_id();

create or replace function public.set_link_request_coach_account_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.coach_account_id is null
     or (tg_op = 'UPDATE' and new.admin_id is distinct from old.admin_id)
  then
    new.coach_account_id := public.ensure_migration_coach_account_for_user(new.admin_id);
  end if;

  return new;
end;
$$;

drop trigger if exists set_link_request_coach_account_id on public.admin_player_link_requests;
create trigger set_link_request_coach_account_id
before insert or update of admin_id, coach_account_id on public.admin_player_link_requests
for each row
execute function public.set_link_request_coach_account_id();

create or replace function public.sync_admin_player_relationship_to_coach_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_account_id uuid;
begin
  v_coach_account_id := public.ensure_migration_coach_account_for_user(new.admin_id);

  perform public.upsert_coach_player_from_legacy(
    v_coach_account_id,
    new.player_id,
    'active',
    'admin_player_relationship',
    new.admin_id,
    null,
    null,
    null,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists sync_admin_player_relationship_to_coach_player on public.admin_player_relationships;
create trigger sync_admin_player_relationship_to_coach_player
after insert or update of admin_id, player_id on public.admin_player_relationships
for each row
execute function public.sync_admin_player_relationship_to_coach_player();

create or replace function public.sync_player_invitation_to_coach_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' and new.player_id is not null then
    perform public.upsert_coach_player_from_legacy(
      new.coach_account_id,
      new.player_id,
      'active',
      'player_invitation',
      new.admin_id,
      new.id,
      null,
      null,
      coalesce(new.accepted_at, new.created_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_player_invitation_to_coach_player on public.player_invitations;
create trigger sync_player_invitation_to_coach_player
after insert or update of status, player_id, admin_id, coach_account_id on public.player_invitations
for each row
execute function public.sync_player_invitation_to_coach_player();

create or replace function public.sync_link_request_to_coach_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'accepted' then
    perform public.upsert_coach_player_from_legacy(
      new.coach_account_id,
      new.player_id,
      'active',
      'link_request',
      new.admin_id,
      null,
      new.id,
      null,
      coalesce(new.accepted_at, new.created_at, now())
    );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_link_request_to_coach_player on public.admin_player_link_requests;
create trigger sync_link_request_to_coach_player
after insert or update of status, player_id, admin_id, coach_account_id on public.admin_player_link_requests
for each row
execute function public.sync_link_request_to_coach_player();

create or replace function public.sync_team_member_to_coach_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_account_id uuid;
  v_admin_id uuid;
begin
  select t.coach_account_id, t.admin_id
    into v_coach_account_id, v_admin_id
  from public.teams t
  where t.id = new.team_id;

  if v_coach_account_id is null then
    v_coach_account_id := public.ensure_migration_coach_account_for_user(v_admin_id);

    update public.teams
       set coach_account_id = v_coach_account_id,
           updated_at = now()
     where id = new.team_id
       and coach_account_id is null;
  end if;

  perform public.upsert_coach_player_from_legacy(
    v_coach_account_id,
    new.player_id,
    'active',
    'team_member',
    v_admin_id,
    null,
    null,
    null,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

drop trigger if exists sync_team_member_to_coach_player on public.team_members;
create trigger sync_team_member_to_coach_player
after insert or update of team_id, player_id on public.team_members
for each row
execute function public.sync_team_member_to_coach_player();

alter table public.coach_players enable row level security;

drop policy if exists "Coach account members and players can view coach players" on public.coach_players;
create policy "Coach account members and players can view coach players"
  on public.coach_players
  for select
  to authenticated
  using (
    public.is_coach_account_member(coach_account_id, (select auth.uid()))
    or player_id = (select auth.uid())
  );

drop policy if exists "Coach account coaches can create coach players" on public.coach_players;
create policy "Coach account coaches can create coach players"
  on public.coach_players
  for insert
  to authenticated
  with check (public.has_coach_account_coach_access(coach_account_id, (select auth.uid())));

drop policy if exists "Coach account coaches can update coach players" on public.coach_players;
create policy "Coach account coaches can update coach players"
  on public.coach_players
  for update
  to authenticated
  using (public.has_coach_account_coach_access(coach_account_id, (select auth.uid())))
  with check (public.has_coach_account_coach_access(coach_account_id, (select auth.uid())));

drop policy if exists "Coach account admins can delete coach players" on public.coach_players;
create policy "Coach account admins can delete coach players"
  on public.coach_players
  for delete
  to authenticated
  using (public.is_coach_account_admin(coach_account_id, (select auth.uid())));

revoke all on public.coach_players from anon;
grant select, insert, update, delete on public.coach_players to authenticated;
grant all on public.coach_players to service_role;

create or replace function public.can_coach_account_access_legacy_player(
  p_coach_account_id uuid,
  p_actor_user_id uuid,
  p_player_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.has_coach_account_coach_access(p_coach_account_id, p_actor_user_id)
    and (
      exists (
        select 1
        from public.coach_players cp
        where cp.coach_account_id = p_coach_account_id
          and cp.player_id = p_player_id
          and cp.status = 'active'
      )
      or exists (
        select 1
        from public.admin_player_relationships apr
        join public.coach_memberships cm
          on cm.user_id = apr.admin_id
         and cm.coach_account_id = p_coach_account_id
         and cm.status = 'active'
         and cm.role in ('owner', 'admin', 'coach', 'assistant')
        where apr.player_id = p_player_id
      )
    );
$$;

create or replace function public.get_coach_workspace_legacy_relationships(
  p_coach_account_id uuid
)
returns table (
  coach_player_id uuid,
  coach_account_id uuid,
  player_id uuid,
  status text,
  source text,
  linked_by uuid,
  first_linked_at timestamptz,
  invitation_id uuid,
  link_request_id uuid,
  club_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_current_coach_account_coach_access(p_coach_account_id);

  return query
  select
    cp.id,
    cp.coach_account_id,
    cp.player_id,
    cp.status,
    cp.source,
    cp.linked_by,
    cp.first_linked_at,
    cp.invitation_id,
    cp.link_request_id,
    cp.club_id
  from public.coach_players cp
  where cp.coach_account_id = p_coach_account_id
    and cp.status in ('active', 'pending')
  order by cp.first_linked_at asc, cp.created_at asc;
end;
$$;

grant execute on function public.get_coach_workspace_legacy_relationships(uuid) to authenticated, service_role;

create or replace function public.get_coach_workspace_migration_audit()
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
    'teams_missing_coach_account'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select t.id
        from public.teams t
        where t.coach_account_id is null
        order by t.created_at nulls last
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.teams t
  where t.coach_account_id is null

  union all

  select
    'accepted_invitations_without_coach_player'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select pi.id
        from public.player_invitations pi
        where pi.status = 'accepted'
          and pi.player_id is not null
          and not exists (
            select 1
            from public.coach_players cp
            where cp.coach_account_id = pi.coach_account_id
              and cp.player_id = pi.player_id
              and cp.status = 'active'
          )
        order by pi.accepted_at nulls last, pi.created_at nulls last
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.player_invitations pi
  where pi.status = 'accepted'
    and pi.player_id is not null
    and not exists (
      select 1
      from public.coach_players cp
      where cp.coach_account_id = pi.coach_account_id
        and cp.player_id = pi.player_id
        and cp.status = 'active'
    )

  union all

  select
    'accepted_link_requests_without_coach_player'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select aplr.id
        from public.admin_player_link_requests aplr
        where aplr.status = 'accepted'
          and not exists (
            select 1
            from public.coach_players cp
            where cp.coach_account_id = aplr.coach_account_id
              and cp.player_id = aplr.player_id
              and cp.status = 'active'
          )
        order by aplr.accepted_at nulls last, aplr.created_at nulls last
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.admin_player_link_requests aplr
  where aplr.status = 'accepted'
    and not exists (
      select 1
      from public.coach_players cp
      where cp.coach_account_id = aplr.coach_account_id
        and cp.player_id = aplr.player_id
        and cp.status = 'active'
    )

  union all

  select
    'team_members_without_coach_player'::text,
    count(*)::bigint,
    coalesce((
      select jsonb_agg(sample.id)
      from (
        select tm.id
        from public.team_members tm
        join public.teams t
          on t.id = tm.team_id
        where t.coach_account_id is not null
          and not exists (
            select 1
            from public.coach_players cp
            where cp.coach_account_id = t.coach_account_id
              and cp.player_id = tm.player_id
              and cp.status = 'active'
          )
        order by tm.created_at nulls last
        limit 20
      ) sample
    ), '[]'::jsonb)
  from public.team_members tm
  join public.teams t
    on t.id = tm.team_id
  where t.coach_account_id is not null
    and not exists (
      select 1
      from public.coach_players cp
      where cp.coach_account_id = t.coach_account_id
        and cp.player_id = tm.player_id
        and cp.status = 'active'
    )

  union all

  select
    'duplicate_coach_players_prevented_by_unique_key'::text,
    0::bigint,
    '[]'::jsonb;
end;
$$;

revoke all on function public.get_coach_workspace_migration_audit() from public;
grant execute on function public.get_coach_workspace_migration_audit() to service_role;

grant execute on function public.can_coach_account_access_legacy_player(uuid, uuid, uuid) to service_role;

comment on table public.coach_players is
  'Compatibility roster linking coach accounts to legacy player records. Backfilled from trainer/player links, accepted invitations, accepted link requests and team memberships.';

comment on column public.teams.coach_account_id is
  'Backfilled workspace owner for legacy teams. Existing admin_id flows remain the compatibility source during migration.';

comment on column public.player_invitations.coach_account_id is
  'Workspace owner for legacy player invitations. Pending invitations are preserved even when player_id is null.';

comment on column public.admin_player_link_requests.coach_account_id is
  'Workspace owner for legacy player link requests. Accepted requests sync into coach_players.';

comment on function public.get_coach_workspace_legacy_relationships(uuid) is
  'Compatibility RPC for authenticated coach-account members to read migrated player roster links.';

comment on function public.get_coach_workspace_migration_audit() is
  'Service-role audit RPC for validating #279 backfill coverage before production rollout.';
