create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admins_email_lowercase_check check (email = lower(email)),
  constraint platform_admins_status_check check (status in ('active', 'inactive')),
  unique (user_id)
);

create unique index if not exists platform_admins_active_email_uidx
  on public.platform_admins (lower(email))
  where status = 'active';

create index if not exists platform_admins_user_id_idx
  on public.platform_admins (user_id);

drop trigger if exists normalize_platform_admin_email on public.platform_admins;
create trigger normalize_platform_admin_email
before insert or update on public.platform_admins
for each row
execute function public.normalize_club_admin_email();

drop trigger if exists update_platform_admins_updated_at on public.platform_admins;
create trigger update_platform_admins_updated_at
before update on public.platform_admins
for each row
execute function public.trigger_update_timestamp();

create or replace function public.is_platform_admin(
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins pa
    where pa.user_id = p_user_id
      and pa.status = 'active'
  );
$$;

create or replace function public.get_club_payload(
  p_club_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'status', c.status,
    'createdAt', c.created_at
  )
  from public.clubs c
  where c.id = p_club_id;
$$;

create or replace function public.get_club_license_payload(
  p_club_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
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
  where cl.club_id = p_club_id
  order by cl.created_at desc
  limit 1;
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
    encode(gen_random_bytes(32), 'hex'),
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

create or replace function public.get_club_invite_by_token(
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.club_invites%rowtype;
  v_club_name text;
begin
  if btrim(coalesce(p_token, '')) = '' then
    raise exception 'VALIDATION_ERROR';
  end if;

  select *
    into v_invite
  from public.club_invites ci
  where ci.token = btrim(p_token);

  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  if v_invite.status = 'pending' and v_invite.expires_at <= now() then
    update public.club_invites
       set status = 'expired'
     where id = v_invite.id
       and status = 'pending';

    select *
      into v_invite
    from public.club_invites ci
    where ci.id = v_invite.id;
  end if;

  select c.name
    into v_club_name
  from public.clubs c
  where c.id = v_invite.club_id;

  return jsonb_build_object(
    'id', v_invite.id,
    'clubId', v_invite.club_id,
    'clubName', v_club_name,
    'email', v_invite.email,
    'role', v_invite.role,
    'status', v_invite.status,
    'expiresAt', v_invite.expires_at,
    'acceptedAt', v_invite.accepted_at,
    'cancelledAt', v_invite.cancelled_at
  );
end;
$$;

create or replace function public.accept_club_invite(
  p_actor_user_id uuid,
  p_token text,
  p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.club_invites%rowtype;
  v_member public.club_members%rowtype;
  v_license record;
  v_active_members_count integer := 0;
  v_user_email text;
  v_profile_name text;
  v_resolved_full_name text;
  v_existing_member_id uuid;
  v_existing_member_status text;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if btrim(coalesce(p_token, '')) = '' then
    raise exception 'VALIDATION_ERROR';
  end if;

  select
    lower(au.email),
    pr.full_name
    into v_user_email, v_profile_name
  from auth.users au
  left join public.profiles pr
    on pr.user_id = au.id
  where au.id = p_actor_user_id;

  if v_user_email is null then
    raise exception 'UNAUTHORIZED';
  end if;

  v_resolved_full_name := nullif(
    btrim(
      coalesce(
        p_full_name,
        v_profile_name,
        ''
      )
    ),
    ''
  );

  select *
    into v_invite
  from public.club_invites ci
  where ci.token = btrim(p_token);

  if not found then
    raise exception 'INVITE_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_invite.club_id::text));
  perform public.expire_stale_club_invites(v_invite.club_id);

  select *
    into v_invite
  from public.club_invites ci
  where ci.id = v_invite.id;

  if v_invite.status <> 'pending' then
    raise exception 'VALIDATION_ERROR';
  end if;

  if lower(v_invite.email) <> v_user_email then
    raise exception 'FORBIDDEN';
  end if;

  select *
    into v_license
  from public.get_club_license_snapshot(v_invite.club_id);

  if not coalesce(v_license.license_is_active, false) then
    raise exception 'LICENSE_INACTIVE';
  end if;

  if exists (
    select 1
    from public.club_members cm
    where cm.club_id = v_invite.club_id
      and cm.status = 'active'
      and lower(cm.email) = v_user_email
      and cm.user_id <> p_actor_user_id
  ) then
    raise exception 'MEMBER_ALREADY_EXISTS';
  end if;

  select cm.id, cm.status
    into v_existing_member_id, v_existing_member_status
  from public.club_members cm
  where cm.club_id = v_invite.club_id
    and cm.user_id = p_actor_user_id
  limit 1;

  select count(*)::integer
    into v_active_members_count
  from public.club_members cm
  where cm.club_id = v_invite.club_id
    and cm.status = 'active';

  if not (v_existing_member_id is not null and v_existing_member_status = 'active')
     and v_active_members_count >= coalesce(v_license.seats_total, 0)
  then
    raise exception 'SEAT_LIMIT_REACHED';
  end if;

  insert into public.profiles (
    user_id,
    full_name
  )
  values (
    p_actor_user_id,
    v_resolved_full_name
  )
  on conflict (user_id) do update
    set full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();

  if v_existing_member_id is not null then
    update public.club_members
       set full_name = coalesce(v_resolved_full_name, full_name),
           email = v_user_email,
           role = v_invite.role,
           status = 'active'
     where id = v_existing_member_id
     returning *
       into v_member;
  else
    insert into public.club_members (
      club_id,
      user_id,
      full_name,
      email,
      role,
      status
    )
    values (
      v_invite.club_id,
      p_actor_user_id,
      v_resolved_full_name,
      v_user_email,
      v_invite.role,
      'active'
    )
    returning *
      into v_member;
  end if;

  update public.club_invites
     set status = 'accepted',
         accepted_at = coalesce(accepted_at, now())
   where id = v_invite.id;

  return jsonb_build_object(
    'member', public.get_club_member_payload(v_member.id),
    'seatStatus', public.get_club_seat_status_payload(v_invite.club_id)
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'club', public.get_club_payload(cm.club_id),
        'member', public.get_club_member_payload(cm.id),
        'seatStatus', public.get_club_seat_status_payload(cm.club_id)
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

alter table public.platform_admins enable row level security;

drop policy if exists "platform_admins_can_read_self" on public.platform_admins;
create policy "platform_admins_can_read_self"
on public.platform_admins
for select
to authenticated
using (user_id = auth.uid());

grant select on public.platform_admins to authenticated;

revoke all on function public.is_platform_admin(uuid) from public;
grant execute on function public.is_platform_admin(uuid) to authenticated;

revoke all on function public.get_club_payload(uuid) from public;
grant execute on function public.get_club_payload(uuid) to service_role;

revoke all on function public.get_club_license_payload(uuid) from public;
grant execute on function public.get_club_license_payload(uuid) to service_role;

revoke all on function public.create_club(uuid, text, text, integer, text, timestamptz) from public;
grant execute on function public.create_club(uuid, text, text, integer, text, timestamptz) to service_role;

revoke all on function public.get_club_invite_by_token(text) from public;
grant execute on function public.get_club_invite_by_token(text) to service_role;

revoke all on function public.accept_club_invite(uuid, text, text) from public;
grant execute on function public.accept_club_invite(uuid, text, text) to service_role;

revoke all on function public.get_current_user_club_context(uuid) from public;
grant execute on function public.get_current_user_club_context(uuid) to service_role;
