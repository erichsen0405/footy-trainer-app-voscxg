-- Issue #278: RLS/API hardening for multi-tenant coach workspace data.

alter table public.coach_accounts enable row level security;
alter table public.coach_memberships enable row level security;

revoke all on public.coach_accounts from anon;
revoke all on public.coach_memberships from anon;

drop policy if exists "Authenticated users can create owned coach accounts" on public.coach_accounts;
create policy "Authenticated users can create owned coach accounts"
  on public.coach_accounts
  for insert
  with check (
    owner_user_id = (select auth.uid())
    and status = 'active'
    and source = 'personal_coach'
  );

create or replace function public.get_coach_account_role(
  p_coach_account_id uuid,
  p_user_id uuid
)
returns text
language sql
security definer
set search_path = public
as $$
  select cm.role
  from public.coach_memberships cm
  where cm.coach_account_id = p_coach_account_id
    and cm.user_id = p_user_id
    and cm.status = 'active'
  limit 1;
$$;

create or replace function public.get_current_coach_account_role(
  p_coach_account_id uuid
)
returns text
language sql
security definer
set search_path = public
as $$
  select public.get_coach_account_role(p_coach_account_id, (select auth.uid()));
$$;

create or replace function public.assert_actor_coach_account_member(
  p_coach_account_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_coach_account_member(p_coach_account_id, p_actor_user_id) is not true then
    raise exception 'FORBIDDEN'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_actor_coach_account_admin(
  p_coach_account_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_coach_account_admin(p_coach_account_id, p_actor_user_id) is not true then
    raise exception 'FORBIDDEN'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_actor_coach_account_coach_access(
  p_coach_account_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.has_coach_account_coach_access(p_coach_account_id, p_actor_user_id) is not true then
    raise exception 'FORBIDDEN'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_current_coach_account_member(
  p_coach_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_actor_coach_account_member(p_coach_account_id, (select auth.uid()));
end;
$$;

create or replace function public.assert_current_coach_account_admin(
  p_coach_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_actor_coach_account_admin(p_coach_account_id, (select auth.uid()));
end;
$$;

create or replace function public.assert_current_coach_account_coach_access(
  p_coach_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_actor_coach_account_coach_access(p_coach_account_id, (select auth.uid()));
end;
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
  select false;
$$;

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
    and exists (
      select 1
      from public.admin_player_relationships apr
      join public.coach_memberships cm
        on cm.user_id = apr.admin_id
       and cm.coach_account_id = p_coach_account_id
       and cm.status = 'active'
       and cm.role in ('owner', 'admin', 'coach', 'assistant')
      where apr.player_id = p_player_id
    );
$$;

create or replace function public.can_actor_read_player_scoped_data(
  p_actor_user_id uuid,
  p_player_id uuid,
  p_coach_account_id uuid default null
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(p_actor_user_id = p_player_id, false)
    or coalesce(public.can_guardian_read_player_scoped_data(p_actor_user_id, p_player_id), false)
    or (
      p_coach_account_id is not null
      and public.can_coach_account_access_legacy_player(
        p_coach_account_id,
        p_actor_user_id,
        p_player_id
      )
    );
$$;

create or replace function public.can_current_user_read_player_scoped_data(
  p_player_id uuid,
  p_coach_account_id uuid default null
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.can_actor_read_player_scoped_data(
    (select auth.uid()),
    p_player_id,
    p_coach_account_id
  );
$$;

create or replace function public.assert_actor_can_read_player_scoped_data(
  p_actor_user_id uuid,
  p_player_id uuid,
  p_coach_account_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_actor_read_player_scoped_data(
    p_actor_user_id,
    p_player_id,
    p_coach_account_id
  ) is not true then
    raise exception 'FORBIDDEN'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_current_user_can_read_player_scoped_data(
  p_player_id uuid,
  p_coach_account_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_actor_can_read_player_scoped_data(
    (select auth.uid()),
    p_player_id,
    p_coach_account_id
  );
end;
$$;

create or replace function public.can_actor_write_coach_scoped_player_data(
  p_coach_account_id uuid,
  p_actor_user_id uuid,
  p_player_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.can_coach_account_access_legacy_player(
    p_coach_account_id,
    p_actor_user_id,
    p_player_id
  );
$$;

create or replace function public.can_current_user_write_coach_scoped_player_data(
  p_coach_account_id uuid,
  p_player_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.can_actor_write_coach_scoped_player_data(
    p_coach_account_id,
    (select auth.uid()),
    p_player_id
  );
$$;

create or replace function public.assert_actor_can_write_coach_scoped_player_data(
  p_coach_account_id uuid,
  p_actor_user_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.can_actor_write_coach_scoped_player_data(
    p_coach_account_id,
    p_actor_user_id,
    p_player_id
  ) is not true then
    raise exception 'FORBIDDEN'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.assert_current_user_can_write_coach_scoped_player_data(
  p_coach_account_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_actor_can_write_coach_scoped_player_data(
    p_coach_account_id,
    (select auth.uid()),
    p_player_id
  );
end;
$$;

revoke all on function public.get_coach_account_role(uuid, uuid) from public;
revoke all on function public.get_current_coach_account_role(uuid) from public;
revoke all on function public.assert_actor_coach_account_member(uuid, uuid) from public;
revoke all on function public.assert_actor_coach_account_admin(uuid, uuid) from public;
revoke all on function public.assert_actor_coach_account_coach_access(uuid, uuid) from public;
revoke all on function public.assert_current_coach_account_member(uuid) from public;
revoke all on function public.assert_current_coach_account_admin(uuid) from public;
revoke all on function public.assert_current_coach_account_coach_access(uuid) from public;
revoke all on function public.can_guardian_read_player_scoped_data(uuid, uuid) from public;
revoke all on function public.can_coach_account_access_legacy_player(uuid, uuid, uuid) from public;
revoke all on function public.can_actor_read_player_scoped_data(uuid, uuid, uuid) from public;
revoke all on function public.can_current_user_read_player_scoped_data(uuid, uuid) from public;
revoke all on function public.assert_actor_can_read_player_scoped_data(uuid, uuid, uuid) from public;
revoke all on function public.assert_current_user_can_read_player_scoped_data(uuid, uuid) from public;
revoke all on function public.can_actor_write_coach_scoped_player_data(uuid, uuid, uuid) from public;
revoke all on function public.can_current_user_write_coach_scoped_player_data(uuid, uuid) from public;
revoke all on function public.assert_actor_can_write_coach_scoped_player_data(uuid, uuid, uuid) from public;
revoke all on function public.assert_current_user_can_write_coach_scoped_player_data(uuid, uuid) from public;

grant execute on function public.get_coach_account_role(uuid, uuid) to service_role;
grant execute on function public.get_current_coach_account_role(uuid) to authenticated, service_role;
grant execute on function public.assert_actor_coach_account_member(uuid, uuid) to service_role;
grant execute on function public.assert_actor_coach_account_admin(uuid, uuid) to service_role;
grant execute on function public.assert_actor_coach_account_coach_access(uuid, uuid) to service_role;
grant execute on function public.assert_current_coach_account_member(uuid) to authenticated, service_role;
grant execute on function public.assert_current_coach_account_admin(uuid) to authenticated, service_role;
grant execute on function public.assert_current_coach_account_coach_access(uuid) to authenticated, service_role;
grant execute on function public.can_guardian_read_player_scoped_data(uuid, uuid) to service_role;
grant execute on function public.can_coach_account_access_legacy_player(uuid, uuid, uuid) to service_role;
grant execute on function public.can_actor_read_player_scoped_data(uuid, uuid, uuid) to service_role;
grant execute on function public.can_current_user_read_player_scoped_data(uuid, uuid) to authenticated, service_role;
grant execute on function public.assert_actor_can_read_player_scoped_data(uuid, uuid, uuid) to service_role;
grant execute on function public.assert_current_user_can_read_player_scoped_data(uuid, uuid) to authenticated, service_role;
grant execute on function public.can_actor_write_coach_scoped_player_data(uuid, uuid, uuid) to service_role;
grant execute on function public.can_current_user_write_coach_scoped_player_data(uuid, uuid) to authenticated, service_role;
grant execute on function public.assert_actor_can_write_coach_scoped_player_data(uuid, uuid, uuid) to service_role;
grant execute on function public.assert_current_user_can_write_coach_scoped_player_data(uuid, uuid) to authenticated, service_role;

comment on function public.get_coach_account_role(uuid, uuid) is
  'Service-role helper for resolving a verified actor user role inside a coach account.';

comment on function public.get_current_coach_account_role(uuid) is
  'Authenticated-user RPC helper that derives the actor from auth.uid().';

comment on function public.assert_actor_coach_account_member(uuid, uuid) is
  'Service-role assertion for Edge Functions after the actor user id has been verified server-side.';

comment on function public.assert_actor_coach_account_admin(uuid, uuid) is
  'Service-role assertion for owner/admin-only coach account writes.';

comment on function public.assert_actor_coach_account_coach_access(uuid, uuid) is
  'Service-role assertion for owner/admin/coach/assistant workspace access.';

comment on function public.can_guardian_read_player_scoped_data(uuid, uuid) is
  'Reserved guardian gate. It returns false until an explicit parent/guardian-to-player relation exists.';

comment on function public.can_coach_account_access_legacy_player(uuid, uuid, uuid) is
  'Bridges coach_account membership to legacy admin_player_relationships until a coach_players table exists.';

comment on function public.can_actor_read_player_scoped_data(uuid, uuid, uuid) is
  'Service-role read predicate for player-scoped data. Use only with a server-verified actor user id.';

comment on function public.can_current_user_read_player_scoped_data(uuid, uuid) is
  'Authenticated-user read predicate for player-scoped data. The actor is auth.uid(), not a client role.';

comment on function public.can_actor_write_coach_scoped_player_data(uuid, uuid, uuid) is
  'Service-role write predicate for coach-owned player data. Use only with a server-verified actor user id.';

comment on function public.can_current_user_write_coach_scoped_player_data(uuid, uuid) is
  'Authenticated-user write predicate for coach-owned player data. The actor is auth.uid(), not a client role.';
