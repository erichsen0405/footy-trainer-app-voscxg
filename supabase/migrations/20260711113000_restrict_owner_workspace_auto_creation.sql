-- Restrict owner/coach workspace creation to explicit Apple trainer subscription
-- and platform-admin provisioning flows.

create or replace function public.owner_workspace_provision_allowed()
returns boolean
language sql
stable
as $$
  select current_setting('app.allow_owner_workspace_provision', true) = 'on';
$$;

revoke all on function public.owner_workspace_provision_allowed() from public;
grant execute on function public.owner_workspace_provision_allowed() to service_role;

comment on function public.owner_workspace_provision_allowed() is
  'Transaction-local guard: only Apple trainer subscription and platform-admin create flows may create owner/coach workspaces.';

create or replace function public.ensure_default_coach_account(
  p_user_id uuid,
  p_account_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_account_id uuid;
begin
  if p_user_id is null or v_auth_user_id is null or p_user_id <> v_auth_user_id then
    raise exception 'UNAUTHORIZED';
  end if;

  select public.get_default_coach_account_id(p_user_id)
    into v_account_id;

  if v_account_id is not null then
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
  end if;

  return v_account_id;
end;
$$;

revoke all on function public.ensure_default_coach_account(uuid, text) from public;
grant execute on function public.ensure_default_coach_account(uuid, text) to authenticated, service_role;

comment on function public.ensure_default_coach_account(uuid, text) is
  'Returns an existing default coach account and repairs membership; it no longer auto-creates workspaces.';

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

  if v_account_id is not null then
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
  end if;

  return v_account_id;
end;
$$;

revoke all on function public.ensure_migration_coach_account_for_user(uuid) from public;
grant execute on function public.ensure_migration_coach_account_for_user(uuid) to service_role;

comment on function public.ensure_migration_coach_account_for_user(uuid) is
  'Finds existing legacy coach workspaces and repairs membership; it no longer auto-creates migration workspaces.';

create or replace function public.ensure_owner_account_for_coach_account(
  p_coach_account_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.coach_accounts%rowtype;
  v_owner_account_id uuid;
begin
  if p_coach_account_id is null then
    return null;
  end if;

  select *
    into v_account
  from public.coach_accounts ca
  where ca.id = p_coach_account_id;

  if v_account.id is null then
    return null;
  end if;

  select oa.id
    into v_owner_account_id
  from public.owner_accounts oa
  where oa.coach_account_id = p_coach_account_id
  limit 1;

  if v_owner_account_id is not null then
    update public.owner_accounts
       set owner_type = 'private_coach_business',
           name = v_account.name,
           status = v_account.status,
           owner_user_id = v_account.owner_user_id,
           updated_at = now()
     where id = v_owner_account_id;

    return v_owner_account_id;
  end if;

  if not public.owner_workspace_provision_allowed() then
    return null;
  end if;

  insert into public.owner_accounts (
    owner_type,
    name,
    status,
    source,
    coach_account_id,
    owner_user_id,
    created_at,
    updated_at
  )
  values (
    'private_coach_business',
    v_account.name,
    v_account.status,
    'coach_account',
    v_account.id,
    v_account.owner_user_id,
    v_account.created_at,
    v_account.updated_at
  )
  returning id
    into v_owner_account_id;

  return v_owner_account_id;
end;
$$;

revoke all on function public.ensure_owner_account_for_coach_account(uuid) from public;
grant execute on function public.ensure_owner_account_for_coach_account(uuid) to service_role;

comment on function public.ensure_owner_account_for_coach_account(uuid) is
  'Finds or updates owner accounts for coach accounts; creates only inside explicit Apple trainer or platform-admin provisioning flows.';

create or replace function public.ensure_owner_account_for_club(
  p_club_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club public.clubs%rowtype;
  v_owner_user_id uuid;
  v_owner_account_id uuid;
begin
  if p_club_id is null then
    return null;
  end if;

  select *
    into v_club
  from public.clubs c
  where c.id = p_club_id;

  if v_club.id is null then
    return null;
  end if;

  select cm.user_id
    into v_owner_user_id
  from public.club_members cm
  where cm.club_id = p_club_id
    and cm.role = 'owner'
    and cm.status = 'active'
  order by cm.created_at asc
  limit 1;

  select oa.id
    into v_owner_account_id
  from public.owner_accounts oa
  where oa.club_id = p_club_id
  limit 1;

  if v_owner_account_id is not null then
    update public.owner_accounts oa
       set owner_type = 'club',
           name = v_club.name,
           status = v_club.status,
           owner_user_id = coalesce(v_owner_user_id, oa.owner_user_id),
           updated_at = now()
     where oa.id = v_owner_account_id;

    return v_owner_account_id;
  end if;

  if not public.owner_workspace_provision_allowed() then
    return null;
  end if;

  insert into public.owner_accounts (
    owner_type,
    name,
    status,
    source,
    club_id,
    owner_user_id,
    created_at,
    updated_at
  )
  values (
    'club',
    v_club.name,
    v_club.status,
    'club',
    v_club.id,
    v_owner_user_id,
    v_club.created_at,
    now()
  )
  returning id
    into v_owner_account_id;

  return v_owner_account_id;
end;
$$;

revoke all on function public.ensure_owner_account_for_club(uuid) from public;
grant execute on function public.ensure_owner_account_for_club(uuid) to service_role;

comment on function public.ensure_owner_account_for_club(uuid) is
  'Finds or updates owner accounts for clubs; creates only inside explicit platform-admin provisioning flows.';

drop policy if exists "Authenticated users can create owned coach accounts" on public.coach_accounts;
revoke insert on public.coach_accounts from authenticated;

comment on table public.coach_accounts is
  'Personal coach workspaces. Direct authenticated inserts are disabled; new rows are provisioned only by Apple trainer subscription sync or platform-admin flows.';

create or replace function public.sync_owner_role_from_coach_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
begin
  v_owner_account_id := public.ensure_owner_account_for_coach_account(new.coach_account_id);

  if v_owner_account_id is null then
    return new;
  end if;

  perform public.upsert_owner_membership_role(
    v_owner_account_id,
    new.user_id,
    new.role,
    new.status,
    'coach_membership',
    new.added_by
  );

  return new;
end;
$$;

comment on function public.sync_owner_role_from_coach_membership() is
  'Mirrors coach memberships to existing owner accounts; does not auto-provision owner accounts.';

create or replace function public.sync_owner_role_from_club_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
begin
  v_owner_account_id := public.ensure_owner_account_for_club(new.club_id);

  if v_owner_account_id is null then
    return new;
  end if;

  perform public.upsert_owner_membership_role(
    v_owner_account_id,
    new.user_id,
    new.role,
    new.status,
    'club_member',
    null,
    new.full_name,
    new.email
  );

  if new.role = 'player' then
    perform public.upsert_owner_player_from_legacy(
      v_owner_account_id,
      new.user_id,
      new.status,
      'club_member',
      null,
      null,
      new.id,
      new.club_id,
      coalesce(new.created_at, now())
    );
  end if;

  return new;
end;
$$;

comment on function public.sync_owner_role_from_club_member() is
  'Mirrors club memberships to existing owner accounts; does not auto-provision owner accounts.';

create or replace function public.sync_owner_player_from_coach_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
begin
  v_owner_account_id := public.ensure_owner_account_for_coach_account(new.coach_account_id);

  if v_owner_account_id is null then
    return new;
  end if;

  perform public.upsert_owner_player_from_legacy(
    v_owner_account_id,
    new.player_id,
    new.status,
    'coach_player',
    new.linked_by,
    new.id,
    null,
    new.club_id,
    coalesce(new.first_linked_at, new.created_at, now())
  );

  return new;
end;
$$;

comment on function public.sync_owner_player_from_coach_player() is
  'Mirrors coach-player links to existing owner accounts; does not auto-provision owner accounts.';

create or replace function public.sync_owner_player_from_team_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
  v_club_id uuid;
  v_linked_by uuid;
begin
  select t.club_id, t.admin_id
    into v_club_id, v_linked_by
  from public.teams t
  where t.id = new.team_id;

  if v_club_id is null then
    return new;
  end if;

  v_owner_account_id := public.ensure_owner_account_for_club(v_club_id);

  if v_owner_account_id is null then
    return new;
  end if;

  perform public.upsert_owner_player_from_legacy(
    v_owner_account_id,
    new.player_id,
    'active',
    'team_member',
    v_linked_by,
    null,
    null,
    v_club_id,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

comment on function public.sync_owner_player_from_team_member() is
  'Mirrors team-player links to existing owner accounts; does not auto-provision owner accounts.';

create or replace function public.sync_private_coach_owner_subscription(
  p_user_id uuid,
  p_product_id text,
  p_plan_code text,
  p_status text default 'active',
  p_expires_at timestamptz default null,
  p_receipt text default null,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_actor_user_id uuid := auth.uid();
  v_plan public.owner_subscription_plans%rowtype;
  v_coach_account_id uuid;
  v_owner_account_id uuid;
  v_profile_name text;
  v_account_name text;
  v_entitlement_id uuid;
  v_subscription_id uuid;
  v_normalized_status text := lower(btrim(coalesce(p_status, 'active')));
  v_is_active boolean;
begin
  if p_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if coalesce(v_jwt_role, '') <> 'service_role'
     and (v_actor_user_id is null or v_actor_user_id <> p_user_id)
  then
    raise exception 'UNAUTHORIZED';
  end if;

  select *
    into v_plan
  from public.owner_subscription_plans osp
  where osp.plan_code = p_plan_code
    and osp.owner_type = 'private_coach_business'
    and osp.status = 'active';

  if v_plan.plan_code is null then
    return jsonb_build_object(
      'skipped', true,
      'reason', 'NOT_PRIVATE_COACH_PLAN',
      'planCode', p_plan_code
    );
  end if;

  if v_normalized_status not in ('trial', 'active', 'past_due', 'canceled', 'expired', 'revoked', 'inactive') then
    v_normalized_status := 'active';
  end if;

  v_is_active := v_normalized_status in ('trial', 'active', 'past_due')
    and (p_expires_at is null or p_expires_at > now());

  insert into public.apple_entitlements (
    user_id,
    product_id,
    plan_code,
    status,
    expires_at,
    latest_receipt,
    latest_payload,
    last_synced_at
  )
  values (
    p_user_id,
    coalesce(nullif(btrim(coalesce(p_product_id, '')), ''), v_plan.apple_product_id),
    v_plan.plan_code,
    case when v_is_active then 'active' else v_normalized_status end,
    p_expires_at,
    p_receipt,
    coalesce(p_payload, '{}'::jsonb),
    now()
  )
  on conflict (user_id)
  do update
     set product_id = excluded.product_id,
         plan_code = excluded.plan_code,
         status = excluded.status,
         expires_at = excluded.expires_at,
         latest_receipt = excluded.latest_receipt,
         latest_payload = excluded.latest_payload,
         last_synced_at = now(),
         updated_at = now()
  returning id
    into v_entitlement_id;

  select public.get_default_coach_account_id(p_user_id)
    into v_coach_account_id;

  perform set_config('app.allow_owner_workspace_provision', 'on', true);

  if v_coach_account_id is null then
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
      'personal_coach'
    )
    returning id
      into v_coach_account_id;
  end if;

  insert into public.coach_memberships (
    coach_account_id,
    user_id,
    role,
    status,
    added_by
  )
  values (
    v_coach_account_id,
    p_user_id,
    'owner',
    'active',
    p_user_id
  )
  on conflict (coach_account_id, user_id)
  do update
     set role = case
           when public.coach_memberships.role = 'owner' then public.coach_memberships.role
           else excluded.role
         end,
         status = 'active',
         updated_at = now();

  v_owner_account_id := public.ensure_owner_account_for_coach_account(v_coach_account_id);

  if v_owner_account_id is null then
    raise exception 'OWNER_ACCOUNT_NOT_PROVISIONED';
  end if;

  update public.owner_accounts
     set status = case when v_is_active then 'active' else status end,
         source = case when source in ('manual', 'migration', 'coach_account') then 'apple_subscription' else source end,
         updated_at = now()
   where id = v_owner_account_id;

  if v_is_active then
    perform public.upsert_owner_membership_role(
      v_owner_account_id,
      p_user_id,
      'owner',
      'active',
      'apple_subscription',
      p_user_id
    );

    perform public.upsert_owner_membership_role(
      v_owner_account_id,
      p_user_id,
      'admin',
      'active',
      'apple_subscription',
      p_user_id
    );

    perform public.upsert_owner_membership_role(
      v_owner_account_id,
      p_user_id,
      'coach',
      'active',
      'apple_subscription',
      p_user_id
    );
  end if;

  insert into public.owner_subscriptions (
    owner_account_id,
    source,
    plan_code,
    status,
    purchased_by_user_id,
    product_id,
    apple_entitlement_id,
    valid_until,
    current_period_end,
    metadata
  )
  values (
    v_owner_account_id,
    'apple_iap',
    v_plan.plan_code,
    case when v_is_active then v_normalized_status else v_normalized_status end,
    p_user_id,
    coalesce(nullif(btrim(coalesce(p_product_id, '')), ''), v_plan.apple_product_id),
    v_entitlement_id,
    p_expires_at,
    p_expires_at,
    jsonb_build_object(
      'mergeRule', 'plan_baseline_plus_super_admin_override_or_add_on',
      'lastSyncedAt', now()
    ) || coalesce(p_payload, '{}'::jsonb)
  )
  on conflict on constraint owner_subscriptions_owner_source_key
  do update
     set plan_code = excluded.plan_code,
         status = excluded.status,
         purchased_by_user_id = excluded.purchased_by_user_id,
         product_id = excluded.product_id,
         apple_entitlement_id = excluded.apple_entitlement_id,
         valid_until = excluded.valid_until,
         current_period_end = excluded.current_period_end,
         metadata = excluded.metadata,
         updated_at = now()
  returning id
    into v_subscription_id;

  insert into public.owner_subscription_audit_events (
    owner_account_id,
    actor_user_id,
    source,
    action,
    after_payload
  )
  values (
    v_owner_account_id,
    p_user_id,
    'apple_iap',
    case when v_is_active then 'apple_entitlement_synced' else 'apple_entitlement_inactive' end,
    jsonb_build_object(
      'subscriptionId', v_subscription_id,
      'appleEntitlementId', v_entitlement_id,
      'planCode', v_plan.plan_code,
      'status', v_normalized_status,
      'expiresAt', p_expires_at
    )
  );

  return public.get_owner_seat_status_payload(v_owner_account_id);
end;
$$;

revoke all on function public.sync_private_coach_owner_subscription(uuid, text, text, text, timestamptz, text, jsonb) from public;
grant execute on function public.sync_private_coach_owner_subscription(uuid, text, text, text, timestamptz, text, jsonb) to authenticated, service_role;

comment on function public.sync_private_coach_owner_subscription(uuid, text, text, text, timestamptz, text, jsonb) is
  'Connects active Apple trainer entitlements to a private_coach_business owner account and is allowed to provision the required owner/coach workspace.';

create or replace function public.create_owner_account_as_platform_admin(
  p_actor_user_id uuid,
  p_owner_type text,
  p_owner_name text,
  p_owner_user_id uuid default null,
  p_plan_code text default null,
  p_seat_overrides jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_name text := nullif(btrim(coalesce(p_owner_name, '')), '');
  v_club public.clubs%rowtype;
  v_coach_account public.coach_accounts%rowtype;
  v_owner_account_id uuid;
  v_role text;
  v_seats integer;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not public.is_platform_admin(p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if p_owner_type not in ('club', 'private_coach_business')
     or v_owner_name is null
     or jsonb_typeof(coalesce(p_seat_overrides, '{}'::jsonb)) <> 'object'
  then
    raise exception 'VALIDATION_ERROR';
  end if;

  perform set_config('app.allow_owner_workspace_provision', 'on', true);

  if p_owner_type = 'club' then
    insert into public.clubs (name, status)
    values (v_owner_name, 'active')
    returning *
      into v_club;

    v_owner_account_id := public.ensure_owner_account_for_club(v_club.id);
  else
    if p_owner_user_id is null then
      insert into public.owner_accounts (
        owner_type,
        name,
        status,
        source,
        owner_user_id
      )
      values (
        'private_coach_business',
        v_owner_name,
        'active',
        'super_admin',
        null
      )
      returning id
        into v_owner_account_id;
    else
      insert into public.coach_accounts (
        owner_user_id,
        name,
        status,
        source
      )
      values (
        p_owner_user_id,
        v_owner_name,
        'active',
        'personal_coach'
      )
      returning *
        into v_coach_account;

      insert into public.coach_memberships (
        coach_account_id,
        user_id,
        role,
        status,
        added_by
      )
      values (
        v_coach_account.id,
        p_owner_user_id,
        'owner',
        'active',
        p_actor_user_id
      )
      on conflict (coach_account_id, user_id)
      do update
         set role = 'owner',
             status = 'active',
             updated_at = now();

      v_owner_account_id := public.ensure_owner_account_for_coach_account(v_coach_account.id);

      perform public.upsert_owner_membership_role(
        v_owner_account_id,
        p_owner_user_id,
        'owner',
        'active',
        'super_admin',
        p_actor_user_id
      );
    end if;
  end if;

  if v_owner_account_id is null then
    raise exception 'OWNER_ACCOUNT_NOT_PROVISIONED';
  end if;

  if p_plan_code is not null then
    insert into public.owner_subscriptions (
      owner_account_id,
      source,
      plan_code,
      status,
      purchased_by_user_id,
      metadata
    )
    values (
      v_owner_account_id,
      'super_admin',
      p_plan_code,
      'active',
      p_owner_user_id,
      jsonb_build_object('createdBy', p_actor_user_id, 'mergeRule', 'plan_baseline_plus_super_admin_override_or_add_on')
    )
    on conflict on constraint owner_subscriptions_owner_source_key
    do update
       set plan_code = excluded.plan_code,
           status = 'active',
           purchased_by_user_id = excluded.purchased_by_user_id,
           metadata = excluded.metadata,
           updated_at = now();
  end if;

  for v_role, v_seats in
    select key, greatest((value #>> '{}')::integer, 0)
    from jsonb_each(coalesce(p_seat_overrides, '{}'::jsonb))
    where jsonb_typeof(value) = 'number'
  loop
    perform public.upsert_owner_seat_adjustment_as_platform_admin(
      p_actor_user_id,
      v_owner_account_id,
      v_role,
      'override',
      v_seats,
      'Initial super admin provisioning',
      null
    );
  end loop;

  insert into public.owner_subscription_audit_events (
    owner_account_id,
    actor_user_id,
    source,
    action,
    after_payload
  )
  values (
    v_owner_account_id,
    p_actor_user_id,
    'super_admin',
    'owner_account_created',
    public.get_owner_seat_status_payload(v_owner_account_id)
  );

  return public.get_owner_seat_status_payload(v_owner_account_id);
end;
$$;

revoke all on function public.create_owner_account_as_platform_admin(uuid, text, text, uuid, text, jsonb) from public;
grant execute on function public.create_owner_account_as_platform_admin(uuid, text, text, uuid, text, jsonb) to service_role;

comment on function public.create_owner_account_as_platform_admin(uuid, text, text, uuid, text, jsonb) is
  'Platform-admin provisioning flow for owner accounts; this is the only non-Apple path allowed to create owner/coach workspaces.';

create or replace function public.sync_owner_subscription_from_club_license()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_account_id uuid;
begin
  v_owner_account_id := public.ensure_owner_account_for_club(new.club_id);

  if v_owner_account_id is null then
    return new;
  end if;

  insert into public.owner_subscriptions (
    owner_account_id,
    source,
    plan_code,
    status,
    valid_until,
    metadata
  )
  values (
    v_owner_account_id,
    'super_admin',
    null,
    case
      when new.status in ('active', 'expired', 'inactive') then new.status
      else 'inactive'
    end,
    new.valid_until,
    jsonb_build_object(
      'legacyClubLicenseId', new.id,
      'planName', new.plan_name,
      'mergeRule', 'club_license_player_override'
    )
  )
  on conflict on constraint owner_subscriptions_owner_source_key
  do update
     set status = excluded.status,
         valid_until = excluded.valid_until,
         metadata = excluded.metadata,
         updated_at = now();

  insert into public.owner_seat_adjustments (
    owner_account_id,
    role,
    adjustment_type,
    seats,
    status,
    source,
    reason,
    valid_until
  )
  select
    v_owner_account_id,
    'player',
    'override',
    greatest(coalesce(new.seats_total, 0), 0),
    'active',
    'migration',
    'Synced from legacy club_licenses.seats_total',
    new.valid_until
  where new.status = 'active'
  on conflict (owner_account_id, role)
  where status = 'active' and adjustment_type = 'override'
  do update
     set seats = excluded.seats,
         status = 'active',
         reason = excluded.reason,
         valid_until = excluded.valid_until,
         updated_at = now();

  if new.status <> 'active' then
    update public.owner_seat_adjustments
       set status = 'inactive',
           valid_until = new.valid_until,
           updated_at = now()
     where owner_account_id = v_owner_account_id
       and role = 'player'
       and adjustment_type = 'override'
       and source = 'migration'
       and status = 'active';
  end if;

  return new;
end;
$$;

revoke all on function public.sync_owner_subscription_from_club_license() from public;
grant execute on function public.sync_owner_subscription_from_club_license() to service_role;

comment on function public.sync_owner_subscription_from_club_license() is
  'Syncs legacy club license data only for existing owner accounts; it must not auto-create owner accounts.';
