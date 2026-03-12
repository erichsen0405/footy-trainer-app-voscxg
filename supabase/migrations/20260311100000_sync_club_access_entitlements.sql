create or replace function public.sync_club_member_access(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_has_trainer_access boolean := false;
  v_has_player_access boolean := false;
  v_current_role text;
  v_desired_role text := null;
begin
  if p_user_id is null then
    return;
  end if;

  select exists (
    select 1
    from public.club_members cm
    where cm.user_id = p_user_id
      and cm.status = 'active'
      and cm.role in ('owner', 'admin', 'coach')
  )
  into v_has_trainer_access;

  select exists (
    select 1
    from public.club_members cm
    where cm.user_id = p_user_id
      and cm.status = 'active'
      and cm.role = 'player'
  )
  into v_has_player_access;

  update public.user_entitlements
     set is_active = false,
         expires_at = coalesce(expires_at, now()),
         notes = 'Klub adgang fjernet'
   where user_id = p_user_id
     and source = 'club'
     and entitlement = U&'tr\00E6ner_premium'
     and is_active = true
     and not v_has_trainer_access;

  if v_has_trainer_access then
    update public.user_entitlements
       set is_active = true,
           expires_at = null,
           notes = 'Træner premium - klub adgang'
     where user_id = p_user_id
       and source = 'club'
       and entitlement = U&'tr\00E6ner_premium';

    if not exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = p_user_id
        and ue.source = 'club'
        and ue.entitlement = U&'tr\00E6ner_premium'
    ) then
      insert into public.user_entitlements (
        user_id,
        entitlement,
        source,
        is_active,
        expires_at,
        notes
      )
      values (
        p_user_id,
        U&'tr\00E6ner_premium',
        'club',
        true,
        null,
        'Træner premium - klub adgang'
      );
    end if;
  end if;

  update public.user_entitlements
     set is_active = false,
         expires_at = coalesce(expires_at, now()),
         notes = 'Klub adgang fjernet'
   where user_id = p_user_id
     and source = 'club'
     and entitlement = 'spiller_premium'
     and is_active = true
     and not v_has_player_access;

  if v_has_player_access then
    update public.user_entitlements
       set is_active = true,
           expires_at = null,
           notes = 'spiller premium - klub adgang'
     where user_id = p_user_id
       and source = 'club'
       and entitlement = 'spiller_premium';

    if not exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = p_user_id
        and ue.source = 'club'
        and ue.entitlement = 'spiller_premium'
    ) then
      insert into public.user_entitlements (
        user_id,
        entitlement,
        source,
        is_active,
        expires_at,
        notes
      )
      values (
        p_user_id,
        'spiller_premium',
        'club',
        true,
        null,
        'spiller premium - klub adgang'
      );
    end if;
  end if;

  if v_has_trainer_access then
    v_desired_role := 'trainer';
  elsif v_has_player_access then
    v_desired_role := 'player';
  end if;

  if v_desired_role is not null then
    select ur.role
      into v_current_role
    from public.user_roles ur
    where ur.user_id = p_user_id;

    if v_current_role is null then
      insert into public.user_roles (
        user_id,
        role
      )
      values (
        p_user_id,
        v_desired_role
      )
      on conflict (user_id) do update
        set role = excluded.role;
    elsif v_current_role <> 'admin'
      and not (v_current_role = 'trainer' and v_desired_role = 'player')
      and v_current_role <> v_desired_role
    then
      update public.user_roles
         set role = v_desired_role
       where user_id = p_user_id;
    end if;
  end if;
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

  perform public.sync_club_member_access(p_actor_user_id);

  return jsonb_build_object(
    'member', public.get_club_member_payload(v_member.id),
    'seatStatus', public.get_club_seat_status_payload(v_invite.club_id)
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

  perform public.sync_club_member_access(v_member.user_id);

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

  perform public.sync_club_member_access(v_member.user_id);

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

  perform public.sync_club_member_access(v_member.user_id);

  return jsonb_build_object(
    'memberId', p_member_id,
    'removed', true,
    'seatStatus', public.get_club_seat_status_payload(v_member.club_id)
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
declare
  v_affected_user_ids uuid[];
  v_user_id uuid;
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

  select array_remove(array_agg(distinct cm.user_id), null)
    into v_affected_user_ids
  from public.club_members cm
  where cm.club_id = p_club_id;

  delete from public.clubs
  where id = p_club_id;

  if v_affected_user_ids is not null then
    foreach v_user_id in array v_affected_user_ids
    loop
      perform public.sync_club_member_access(v_user_id);
    end loop;
  end if;

  return jsonb_build_object(
    'clubId', p_club_id,
    'deleted', true
  );
end;
$$;

revoke all on function public.sync_club_member_access(uuid) from public;
grant execute on function public.sync_club_member_access(uuid) to service_role;
