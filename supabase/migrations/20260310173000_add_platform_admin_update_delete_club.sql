create or replace function public.update_club(
  p_actor_user_id uuid,
  p_club_id uuid,
  p_club_name text,
  p_status text,
  p_seats_total integer,
  p_plan_name text default null,
  p_valid_until timestamptz default null,
  p_license_status text default 'active'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_members_count integer := 0;
  v_club public.clubs%rowtype;
  v_license_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_club_id is null
     or btrim(coalesce(p_club_name, '')) = ''
     or p_status not in ('active', 'inactive')
     or p_license_status not in ('active', 'inactive', 'expired')
     or p_seats_total is null
     or p_seats_total < 0 then
    raise exception 'VALIDATION_ERROR';
  end if;

  if not public.is_platform_admin(p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_club_id::text));

  select *
    into v_club
  from public.clubs c
  where c.id = p_club_id;

  if not found then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  select count(*)::integer
    into v_active_members_count
  from public.club_members cm
  where cm.club_id = p_club_id
    and cm.status = 'active';

  if v_active_members_count > p_seats_total then
    raise exception 'SEAT_LIMIT_REACHED';
  end if;

  update public.clubs
     set name = btrim(p_club_name),
         status = p_status
   where id = p_club_id
  returning *
    into v_club;

  select cl.id
    into v_license_id
  from public.club_licenses cl
  where cl.club_id = p_club_id
  order by
    case
      when cl.status = 'active' and (cl.valid_until is null or cl.valid_until > now()) then 3
      when cl.status = 'inactive' then 2
      else 1
    end desc,
    coalesce(cl.valid_until, 'infinity'::timestamptz) desc,
    cl.created_at desc
  limit 1;

  if v_license_id is null then
    insert into public.club_licenses (
      club_id,
      seats_total,
      status,
      valid_until,
      plan_name
    )
    values (
      p_club_id,
      p_seats_total,
      p_license_status,
      p_valid_until,
      nullif(btrim(coalesce(p_plan_name, '')), '')
    )
    returning id
      into v_license_id;
  else
    update public.club_licenses
       set seats_total = p_seats_total,
           status = p_license_status,
           valid_until = p_valid_until,
           plan_name = nullif(btrim(coalesce(p_plan_name, '')), '')
     where id = v_license_id;
  end if;

  return jsonb_build_object(
    'club', public.get_club_payload(p_club_id),
    'license', (
      select jsonb_build_object(
        'id', cl.id,
        'clubId', cl.club_id,
        'seatsTotal', cl.seats_total,
        'status', cl.status,
        'validUntil', cl.valid_until,
        'planName', cl.plan_name,
        'createdAt', cl.created_at,
        'updatedAt', cl.updated_at
      )
      from public.club_licenses cl
      where cl.id = v_license_id
    ),
    'seatStatus', public.get_club_seat_status_payload(p_club_id)
  );
end;
$$;

create or replace function public.delete_club(
  p_actor_user_id uuid,
  p_club_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_club_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  if not public.is_platform_admin(p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_club_id::text));

  if not exists (
    select 1
    from public.clubs c
    where c.id = p_club_id
  ) then
    raise exception 'CLUB_NOT_FOUND';
  end if;

  delete from public.clubs
  where id = p_club_id;

  return jsonb_build_object(
    'clubId', p_club_id,
    'deleted', true
  );
end;
$$;

revoke all on function public.update_club(uuid, uuid, text, text, integer, text, timestamptz, text) from public;
grant execute on function public.update_club(uuid, uuid, text, text, integer, text, timestamptz, text) to service_role;

revoke all on function public.delete_club(uuid, uuid) from public;
grant execute on function public.delete_club(uuid, uuid) to service_role;
