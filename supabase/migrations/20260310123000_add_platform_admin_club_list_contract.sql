create or replace function public.get_club_list_item_payload(
  p_club_id uuid,
  p_role text default null,
  p_member_id uuid default null,
  p_member_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club jsonb;
  v_seat_status jsonb;
begin
  if p_club_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  v_club := public.get_club_payload(p_club_id);
  v_seat_status := public.get_club_seat_status_payload(p_club_id);

  if v_club is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  return jsonb_build_object(
    'clubId', p_club_id,
    'clubName', v_club ->> 'name',
    'role', nullif(btrim(coalesce(p_role, '')), ''),
    'status', v_club ->> 'status',
    'planName', v_seat_status ->> 'planName',
    'seatsTotal', coalesce((v_seat_status ->> 'seatsTotal')::integer, 0),
    'seatsUsed', coalesce((v_seat_status ->> 'seatsUsed')::integer, 0),
    'seatsAvailable', coalesce((v_seat_status ->> 'seatsAvailable')::integer, 0),
    'pendingInvitesCount', coalesce((v_seat_status ->> 'pendingInvitesCount')::integer, 0),
    'createdAt', v_club ->> 'createdAt',
    'licenseStatus', coalesce(v_seat_status ->> 'licenseStatus', 'inactive'),
    'validUntil', v_seat_status ->> 'validUntil',
    'activeMembersCount', coalesce((v_seat_status ->> 'activeMembersCount')::integer, 0),
    'memberId', p_member_id,
    'memberStatus', p_member_status
  );
end;
$$;

create or replace function public.list_platform_admin_clubs(
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_email text;
  v_clubs jsonb := '[]'::jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select lower(au.email)
    into v_user_email
  from auth.users au
  where au.id = p_actor_user_id;

  if v_user_email is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not public.is_platform_admin(p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  select coalesce(
    jsonb_agg(
      public.get_club_list_item_payload(
        c.id,
        coalesce(cm.role, 'platform_admin'),
        cm.id,
        cm.status
      )
      order by c.created_at asc
    ),
    '[]'::jsonb
  )
    into v_clubs
  from public.clubs c
  left join public.club_members cm
    on cm.club_id = c.id
   and cm.user_id = p_actor_user_id
   and cm.status = 'active';

  return jsonb_build_object(
    'userId', p_actor_user_id,
    'email', v_user_email,
    'isPlatformAdmin', true,
    'clubs', v_clubs
  );
end;
$$;

create or replace function public.get_current_user_club_context(
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_email text;
  v_is_platform_admin boolean := false;
  v_clubs jsonb := '[]'::jsonb;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  select lower(au.email)
    into v_user_email
  from auth.users au
  where au.id = p_actor_user_id;

  if v_user_email is null then
    raise exception 'UNAUTHORIZED';
  end if;

  v_is_platform_admin := public.is_platform_admin(p_actor_user_id);

  if v_is_platform_admin then
    return public.list_platform_admin_clubs(p_actor_user_id);
  end if;

  select coalesce(
    jsonb_agg(
      public.get_club_list_item_payload(
        cm.club_id,
        cm.role,
        cm.id,
        cm.status
      )
      order by c.created_at asc
    ),
    '[]'::jsonb
  )
    into v_clubs
  from public.club_members cm
  join public.clubs c
    on c.id = cm.club_id
  where cm.user_id = p_actor_user_id
    and cm.status = 'active';

  return jsonb_build_object(
    'userId', p_actor_user_id,
    'email', v_user_email,
    'isPlatformAdmin', v_is_platform_admin,
    'clubs', v_clubs
  );
end;
$$;

revoke all on function public.get_club_list_item_payload(uuid, text, uuid, text) from public;
grant execute on function public.get_club_list_item_payload(uuid, text, uuid, text) to service_role;

revoke all on function public.list_platform_admin_clubs(uuid) from public;
grant execute on function public.list_platform_admin_clubs(uuid) to service_role;

revoke all on function public.get_current_user_club_context(uuid) from public;
grant execute on function public.get_current_user_club_context(uuid) to service_role;
