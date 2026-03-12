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

  if not (public.is_club_admin(v_invite.club_id, p_actor_user_id) or public.is_platform_admin(p_actor_user_id)) then
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
