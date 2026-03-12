create or replace function public.generate_club_invite_token()
returns text
language sql
security definer
set search_path = public
as $$
  select replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
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

  if not public.is_club_admin(p_club_id, p_actor_user_id) then
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

  if not public.is_club_admin(v_invite.club_id, p_actor_user_id) then
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

create or replace function public.create_club(
  p_actor_user_id uuid,
  p_club_name text,
  p_admin_email text,
  p_seats_total integer,
  p_plan_name text default null,
  p_valid_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs%rowtype;
  v_license public.club_licenses%rowtype;
  v_invite public.club_invites%rowtype;
  v_club_name text := btrim(coalesce(p_club_name, ''));
  v_admin_email text := lower(btrim(coalesce(p_admin_email, '')));
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not public.is_platform_admin(p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_club_name = ''
     or v_admin_email = ''
     or position('@' in v_admin_email) = 0
     or p_seats_total is null
     or p_seats_total < 0
  then
    raise exception 'VALIDATION_ERROR';
  end if;

  if p_valid_until is not null and p_valid_until <= now() then
    raise exception 'VALIDATION_ERROR';
  end if;

  insert into public.clubs (
    name,
    status
  )
  values (
    v_club_name,
    'active'
  )
  returning *
    into v_club;

  insert into public.club_licenses (
    club_id,
    seats_total,
    status,
    valid_until,
    plan_name
  )
  values (
    v_club.id,
    p_seats_total,
    'active',
    p_valid_until,
    nullif(btrim(coalesce(p_plan_name, '')), '')
  )
  returning *
    into v_license;

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
    v_club.id,
    v_admin_email,
    'admin',
    public.generate_club_invite_token(),
    'pending',
    now() + interval '7 days',
    p_actor_user_id
  )
  returning *
    into v_invite;

  return jsonb_build_object(
    'club', public.get_club_payload(v_club.id),
    'license', public.get_club_license_payload(v_club.id),
    'invite', public.get_club_invite_payload(v_invite.id),
    'seatStatus', public.get_club_seat_status_payload(v_club.id)
  );
end;
$$;

revoke all on function public.generate_club_invite_token() from public;
grant execute on function public.generate_club_invite_token() to service_role;
