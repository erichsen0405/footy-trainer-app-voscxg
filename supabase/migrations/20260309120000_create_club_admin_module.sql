create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  constraint clubs_status_check check (status in ('active', 'inactive'))
);

create table if not exists public.club_licenses (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  seats_total integer not null check (seats_total >= 0),
  status text not null default 'active',
  valid_until timestamptz null,
  plan_name text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_licenses_status_check check (status in ('active', 'inactive', 'expired'))
);

create table if not exists public.club_members (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text null,
  email text not null,
  role text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint club_members_role_check check (role in ('owner', 'admin', 'coach', 'player')),
  constraint club_members_status_check check (status in ('active', 'inactive')),
  constraint club_members_email_lowercase_check check (email = lower(email)),
  unique (club_id, user_id)
);

create table if not exists public.club_invites (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  email text not null,
  role text not null,
  token text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz null,
  cancelled_at timestamptz null,
  constraint club_invites_status_check check (status in ('pending', 'accepted', 'expired', 'cancelled')),
  constraint club_invites_role_check check (role in ('admin', 'coach', 'player')),
  constraint club_invites_email_lowercase_check check (email = lower(email))
);

create index if not exists clubs_status_idx
  on public.clubs (status);

create index if not exists club_licenses_club_id_idx
  on public.club_licenses (club_id);

create index if not exists club_licenses_club_id_status_idx
  on public.club_licenses (club_id, status);

create unique index if not exists club_licenses_one_active_per_club_uidx
  on public.club_licenses (club_id)
  where status = 'active';

create index if not exists club_members_club_id_idx
  on public.club_members (club_id);

create index if not exists club_members_user_id_idx
  on public.club_members (user_id);

create index if not exists club_members_club_id_status_idx
  on public.club_members (club_id, status);

create index if not exists club_members_club_id_role_status_idx
  on public.club_members (club_id, role, status);

create index if not exists club_members_club_id_lower_email_idx
  on public.club_members (club_id, lower(email));

create unique index if not exists club_members_club_id_active_email_uidx
  on public.club_members (club_id, lower(email))
  where status = 'active';

create index if not exists club_invites_club_id_idx
  on public.club_invites (club_id);

create index if not exists club_invites_club_id_status_idx
  on public.club_invites (club_id, status);

create index if not exists club_invites_club_id_expires_at_idx
  on public.club_invites (club_id, expires_at);

create index if not exists club_invites_club_id_lower_email_idx
  on public.club_invites (club_id, lower(email));

create unique index if not exists club_invites_pending_email_uidx
  on public.club_invites (club_id, lower(email))
  where status = 'pending';

create or replace function public.normalize_club_admin_email()
returns trigger
language plpgsql
as $$
begin
  if new.email is not null then
    new.email := lower(btrim(new.email));
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_club_member_email on public.club_members;
create trigger normalize_club_member_email
before insert or update on public.club_members
for each row
execute function public.normalize_club_admin_email();

drop trigger if exists normalize_club_invite_email on public.club_invites;
create trigger normalize_club_invite_email
before insert or update on public.club_invites
for each row
execute function public.normalize_club_admin_email();

drop trigger if exists update_club_licenses_updated_at on public.club_licenses;
create trigger update_club_licenses_updated_at
before update on public.club_licenses
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_club_members_updated_at on public.club_members;
create trigger update_club_members_updated_at
before update on public.club_members
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_club_invites_updated_at on public.club_invites;
create trigger update_club_invites_updated_at
before update on public.club_invites
for each row
execute function public.trigger_update_timestamp();

create or replace function public.is_club_member(
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
  );
$$;

create or replace function public.is_club_admin(
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
      and cm.role in ('owner', 'admin')
  );
$$;

create or replace function public.is_last_active_owner(
  p_club_id uuid,
  p_member_id uuid
)
returns boolean
language sql
security definer
set search_path = public
as $$
  with target_owner as (
    select cm.id
    from public.club_members cm
    where cm.id = p_member_id
      and cm.club_id = p_club_id
      and cm.status = 'active'
      and cm.role = 'owner'
  )
  select exists (
    select 1
    from target_owner
  )
  and not exists (
    select 1
    from public.club_members cm
    where cm.club_id = p_club_id
      and cm.status = 'active'
      and cm.role = 'owner'
      and cm.id <> p_member_id
  );
$$;

create or replace function public.expire_stale_club_invites(
  p_club_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.club_invites
     set status = 'expired',
         cancelled_at = null
   where status = 'pending'
     and expires_at <= now()
     and (p_club_id is null or club_id = p_club_id);
end;
$$;

create or replace function public.get_club_license_snapshot(
  p_club_id uuid
)
returns table (
  license_id uuid,
  seats_total integer,
  license_status text,
  plan_name text,
  valid_until timestamptz,
  license_is_active boolean
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      cl.id as license_id,
      cl.seats_total,
      case
        when cl.status = 'active' and cl.valid_until is not null and cl.valid_until <= now() then 'expired'
        else cl.status
      end as license_status,
      cl.plan_name,
      cl.valid_until,
      case
        when cl.status = 'active' and (cl.valid_until is null or cl.valid_until > now()) then true
        else false
      end as license_is_active,
      row_number() over (
        order by
          case
            when cl.status = 'active' and (cl.valid_until is null or cl.valid_until > now()) then 3
            when cl.status = 'inactive' then 2
            else 1
          end desc,
          coalesce(cl.valid_until, 'infinity'::timestamptz) desc,
          cl.created_at desc
      ) as rn
    from public.club_licenses cl
    where cl.club_id = p_club_id
  )
  select
    ranked.license_id,
    ranked.seats_total,
    ranked.license_status,
    ranked.plan_name,
    ranked.valid_until,
    ranked.license_is_active
  from ranked
  where ranked.rn = 1

  union all

  select
    null::uuid,
    0,
    'inactive'::text,
    null::text,
    null::timestamptz,
    false
  where not exists (
    select 1
    from ranked
    where ranked.rn = 1
  );
$$;

create or replace function public.get_club_member_payload(
  p_member_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', cm.id,
    'clubId', cm.club_id,
    'userId', cm.user_id,
    'fullName', cm.full_name,
    'email', cm.email,
    'role', cm.role,
    'status', cm.status,
    'createdAt', cm.created_at,
    'updatedAt', cm.updated_at
  )
  from public.club_members cm
  where cm.id = p_member_id;
$$;

create or replace function public.get_club_invite_payload(
  p_invite_id uuid
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', ci.id,
    'clubId', ci.club_id,
    'email', ci.email,
    'role', ci.role,
    'token', ci.token,
    'status', ci.status,
    'expiresAt', ci.expires_at,
    'invitedBy', ci.invited_by,
    'createdAt', ci.created_at,
    'updatedAt', ci.updated_at,
    'acceptedAt', ci.accepted_at,
    'cancelledAt', ci.cancelled_at
  )
  from public.club_invites ci
  where ci.id = p_invite_id;
$$;

create or replace function public.get_club_seat_status_payload(
  p_club_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_license record;
  v_active_members_count integer := 0;
  v_pending_invites_count integer := 0;
begin
  perform public.expire_stale_club_invites(p_club_id);

  select *
    into v_license
  from public.get_club_license_snapshot(p_club_id);

  select count(*)::integer
    into v_active_members_count
  from public.club_members cm
  where cm.club_id = p_club_id
    and cm.status = 'active';

  select count(*)::integer
    into v_pending_invites_count
  from public.club_invites ci
  where ci.club_id = p_club_id
    and ci.status = 'pending';

  return jsonb_build_object(
    'clubId', p_club_id,
    'seatsTotal', coalesce(v_license.seats_total, 0),
    'seatsUsed', v_active_members_count,
    'seatsAvailable', greatest(coalesce(v_license.seats_total, 0) - v_active_members_count, 0),
    'licenseStatus', coalesce(v_license.license_status, 'inactive'),
    'planName', v_license.plan_name,
    'validUntil', v_license.valid_until,
    'pendingInvitesCount', v_pending_invites_count,
    'activeMembersCount', v_active_members_count
  );
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
    encode(gen_random_bytes(32), 'hex'),
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
     set token = encode(gen_random_bytes(32), 'hex'),
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

  if not public.is_club_admin(v_invite.club_id, p_actor_user_id) then
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

create or replace function public.change_club_member_role(
  p_actor_user_id uuid,
  p_member_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.club_members%rowtype;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_member_id is null or p_role not in ('owner', 'admin', 'coach', 'player') then
    raise exception 'VALIDATION_ERROR';
  end if;

  select *
    into v_member
  from public.club_members cm
  where cm.id = p_member_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_member.club_id::text));

  if not public.is_club_admin(v_member.club_id, p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_member.status <> 'active' then
    raise exception 'VALIDATION_ERROR';
  end if;

  if v_member.role = 'owner' or p_role = 'owner' then
    raise exception 'LAST_OWNER_GUARD';
  end if;

  update public.club_members
     set role = p_role
   where id = p_member_id;

  return public.get_club_member_payload(p_member_id);
end;
$$;

create or replace function public.deactivate_club_member(
  p_actor_user_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.club_members%rowtype;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_member_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  select *
    into v_member
  from public.club_members cm
  where cm.id = p_member_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_member.club_id::text));

  if not public.is_club_admin(v_member.club_id, p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_member.role = 'owner' and public.is_last_active_owner(v_member.club_id, v_member.id) then
    raise exception 'LAST_OWNER_GUARD';
  end if;

  if v_member.status = 'active' then
    update public.club_members
       set status = 'inactive'
     where id = p_member_id;
  end if;

  return jsonb_build_object(
    'member', public.get_club_member_payload(p_member_id),
    'seatStatus', public.get_club_seat_status_payload(v_member.club_id)
  );
end;
$$;

create or replace function public.remove_club_member(
  p_actor_user_id uuid,
  p_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.club_members%rowtype;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if p_member_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  select *
    into v_member
  from public.club_members cm
  where cm.id = p_member_id;

  if not found then
    raise exception 'MEMBER_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_member.club_id::text));

  if not public.is_club_admin(v_member.club_id, p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if v_member.role = 'owner' and public.is_last_active_owner(v_member.club_id, v_member.id) then
    raise exception 'LAST_OWNER_GUARD';
  end if;

  delete from public.club_members
  where id = p_member_id;

  return jsonb_build_object(
    'memberId', p_member_id,
    'removed', true,
    'seatStatus', public.get_club_seat_status_payload(v_member.club_id)
  );
end;
$$;

create or replace function public.get_club_seat_status(
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

  if not public.is_club_member(p_club_id, p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  return public.get_club_seat_status_payload(p_club_id);
end;
$$;

alter table public.clubs enable row level security;
alter table public.club_licenses enable row level security;
alter table public.club_members enable row level security;
alter table public.club_invites enable row level security;

drop policy if exists "club_members_can_read_clubs" on public.clubs;
create policy "club_members_can_read_clubs"
on public.clubs
for select
to authenticated
using (public.is_club_member(id, auth.uid()));

drop policy if exists "club_members_can_read_club_licenses" on public.club_licenses;
create policy "club_members_can_read_club_licenses"
on public.club_licenses
for select
to authenticated
using (public.is_club_member(club_id, auth.uid()));

drop policy if exists "club_members_can_read_club_members" on public.club_members;
create policy "club_members_can_read_club_members"
on public.club_members
for select
to authenticated
using (public.is_club_member(club_id, auth.uid()));

drop policy if exists "club_admins_can_read_club_invites" on public.club_invites;
create policy "club_admins_can_read_club_invites"
on public.club_invites
for select
to authenticated
using (public.is_club_admin(club_id, auth.uid()));

grant select on public.clubs to authenticated;
grant select on public.club_licenses to authenticated;
grant select on public.club_members to authenticated;
grant select on public.club_invites to authenticated;

revoke all on function public.is_club_member(uuid, uuid) from public;
grant execute on function public.is_club_member(uuid, uuid) to authenticated;

revoke all on function public.is_club_admin(uuid, uuid) from public;
grant execute on function public.is_club_admin(uuid, uuid) to authenticated;

revoke all on function public.is_last_active_owner(uuid, uuid) from public;
grant execute on function public.is_last_active_owner(uuid, uuid) to service_role;

revoke all on function public.expire_stale_club_invites(uuid) from public;
grant execute on function public.expire_stale_club_invites(uuid) to service_role;

revoke all on function public.get_club_license_snapshot(uuid) from public;
grant execute on function public.get_club_license_snapshot(uuid) to service_role;

revoke all on function public.get_club_member_payload(uuid) from public;
grant execute on function public.get_club_member_payload(uuid) to service_role;

revoke all on function public.get_club_invite_payload(uuid) from public;
grant execute on function public.get_club_invite_payload(uuid) to service_role;

revoke all on function public.get_club_seat_status_payload(uuid) from public;
grant execute on function public.get_club_seat_status_payload(uuid) to service_role;

revoke all on function public.create_club_invite(uuid, uuid, text, text) from public;
grant execute on function public.create_club_invite(uuid, uuid, text, text) to service_role;

revoke all on function public.resend_club_invite(uuid, uuid) from public;
grant execute on function public.resend_club_invite(uuid, uuid) to service_role;

revoke all on function public.cancel_club_invite(uuid, uuid) from public;
grant execute on function public.cancel_club_invite(uuid, uuid) to service_role;

revoke all on function public.change_club_member_role(uuid, uuid, text) from public;
grant execute on function public.change_club_member_role(uuid, uuid, text) to service_role;

revoke all on function public.deactivate_club_member(uuid, uuid) from public;
grant execute on function public.deactivate_club_member(uuid, uuid) to service_role;

revoke all on function public.remove_club_member(uuid, uuid) from public;
grant execute on function public.remove_club_member(uuid, uuid) to service_role;

revoke all on function public.get_club_seat_status(uuid, uuid) from public;
grant execute on function public.get_club_seat_status(uuid, uuid) to service_role;
