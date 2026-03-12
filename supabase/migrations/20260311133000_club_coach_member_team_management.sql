alter table public.teams
  add column if not exists club_id uuid null references public.clubs(id) on delete cascade;

create index if not exists teams_club_id_idx
  on public.teams (club_id);

create index if not exists teams_club_id_admin_id_idx
  on public.teams (club_id, admin_id);

create or replace function public.get_active_club_member_role(
  p_club_id uuid,
  p_user_id uuid
)
returns text
language sql
security definer
set search_path = public
as $$
  select cm.role
  from public.club_members cm
  where cm.club_id = p_club_id
    and cm.user_id = p_user_id
    and cm.status = 'active'
  limit 1;
$$;

create or replace function public.is_club_staff(
  p_club_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.club_members cm
    where cm.club_id = p_club_id
      and cm.user_id = p_user_id
      and cm.status = 'active'
      and cm.role in ('owner', 'admin', 'coach')
  );
$$;

create or replace function public.can_manage_club_invite(
  p_club_id uuid,
  p_user_id uuid,
  p_role text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select case
    when public.is_platform_admin(p_user_id) then p_role in ('admin', 'coach', 'player')
    when public.get_active_club_member_role(p_club_id, p_user_id) in ('owner', 'admin') then p_role in ('admin', 'coach', 'player')
    when public.get_active_club_member_role(p_club_id, p_user_id) = 'coach' then p_role = 'player'
    else false
  end;
$$;

create or replace function public.create_club_invite(
  p_actor_user_id uuid,
  p_club_id uuid,
  p_email text,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_license record;
  v_active_members_count integer := 0;
  v_invite public.club_invites%rowtype;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_club_id is null or v_email = '' or p_role not in ('admin', 'coach', 'player') then
    raise exception 'VALIDATION_ERROR';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_club_id::text));
  perform public.expire_stale_club_invites(p_club_id);

  if not public.can_manage_club_invite(p_club_id, p_actor_user_id, p_role) then
    raise exception 'FORBIDDEN';
  end if;

  select *
    into v_license
  from public.get_club_license_snapshot(p_club_id);

  if not coalesce(v_license.license_is_active, false) then
    raise exception 'LICENSE_INACTIVE';
  end if;

  select count(*)::integer
    into v_active_members_count
  from public.club_members cm
  where cm.club_id = p_club_id
    and cm.status = 'active';

  if v_active_members_count >= coalesce(v_license.seats_total, 0) then
    raise exception 'SEAT_LIMIT_REACHED';
  end if;

  if exists (
    select 1
    from public.club_members cm
    where cm.club_id = p_club_id
      and cm.status = 'active'
      and lower(cm.email) = v_email
  ) then
    raise exception 'MEMBER_ALREADY_EXISTS';
  end if;

  if exists (
    select 1
    from public.club_invites ci
    where ci.club_id = p_club_id
      and ci.status = 'pending'
      and lower(ci.email) = v_email
  ) then
    raise exception 'INVITE_ALREADY_PENDING';
  end if;

  insert into public.club_invites (
    club_id,
    email,
    role,
    token,
    status,
    expires_at,
    invited_by
  )
  values (
    p_club_id,
    v_email,
    p_role,
    public.generate_club_invite_token(),
    'pending',
    now() + interval '7 days',
    p_actor_user_id
  )
  returning *
    into v_invite;

  return jsonb_build_object(
    'invite', public.get_club_invite_payload(v_invite.id),
    'seatStatus', public.get_club_seat_status_payload(p_club_id)
  );
end;
$$;

create or replace function public.resend_club_invite(
  p_actor_user_id uuid,
  p_invite_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.club_invites%rowtype;
  v_license record;
  v_active_members_count integer := 0;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_invite_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  select *
    into v_invite
  from public.club_invites ci
  where ci.id = p_invite_id;

  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_invite.club_id::text));
  perform public.expire_stale_club_invites(v_invite.club_id);

  select *
    into v_invite
  from public.club_invites ci
  where ci.id = p_invite_id;

  if not public.can_manage_club_invite(v_invite.club_id, p_actor_user_id, v_invite.role) then
    raise exception 'FORBIDDEN';
  end if;

  if v_invite.status not in ('pending', 'expired') then
    raise exception 'VALIDATION_ERROR';
  end if;

  if exists (
    select 1
    from public.club_members cm
    where cm.club_id = v_invite.club_id
      and cm.status = 'active'
      and lower(cm.email) = lower(v_invite.email)
  ) then
    raise exception 'MEMBER_ALREADY_EXISTS';
  end if;

  select *
    into v_license
  from public.get_club_license_snapshot(v_invite.club_id);

  if not coalesce(v_license.license_is_active, false) then
    raise exception 'LICENSE_INACTIVE';
  end if;

  select count(*)::integer
    into v_active_members_count
  from public.club_members cm
  where cm.club_id = v_invite.club_id
    and cm.status = 'active';

  if v_active_members_count >= coalesce(v_license.seats_total, 0) then
    raise exception 'SEAT_LIMIT_REACHED';
  end if;

  update public.club_invites
     set token = public.generate_club_invite_token(),
         status = 'pending',
         expires_at = now() + interval '7 days',
         cancelled_at = null
   where id = p_invite_id;

  return public.get_club_invite_payload(p_invite_id);
end;
$$;

create or replace function public.cancel_club_invite(
  p_actor_user_id uuid,
  p_invite_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.club_invites%rowtype;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_invite_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  select *
    into v_invite
  from public.club_invites ci
  where ci.id = p_invite_id;

  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_invite.club_id::text));

  if not public.can_manage_club_invite(v_invite.club_id, p_actor_user_id, v_invite.role) then
    raise exception 'FORBIDDEN';
  end if;

  if v_invite.status = 'accepted' then
    raise exception 'VALIDATION_ERROR';
  end if;

  update public.club_invites
     set status = 'cancelled',
         cancelled_at = coalesce(cancelled_at, now())
   where id = p_invite_id;

  return jsonb_build_object(
    'inviteId', p_invite_id,
    'cancelled', true
  );
end;
$$;

drop policy if exists "club_admins_can_read_club_invites" on public.club_invites;
drop policy if exists "club_admins_or_platform_admins_can_read_club_invites" on public.club_invites;
drop policy if exists "club_staff_or_platform_admins_can_read_club_invites" on public.club_invites;

create policy "club_staff_or_platform_admins_can_read_club_invites"
on public.club_invites
for select
to authenticated
using (
  public.is_club_staff(club_id, auth.uid())
  or public.is_platform_admin(auth.uid())
);

revoke all on function public.get_active_club_member_role(uuid, uuid) from public;
grant execute on function public.get_active_club_member_role(uuid, uuid) to authenticated;

revoke all on function public.is_club_staff(uuid, uuid) from public;
grant execute on function public.is_club_staff(uuid, uuid) to authenticated;

revoke all on function public.can_manage_club_invite(uuid, uuid, text) from public;
grant execute on function public.can_manage_club_invite(uuid, uuid, text) to service_role;
