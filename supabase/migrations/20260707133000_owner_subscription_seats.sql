-- Issue #281: Owner-aware coach subscription, licensing and effective seat model.

alter table public.owner_accounts
drop constraint if exists owner_accounts_source_check;

alter table public.owner_accounts
add constraint owner_accounts_source_check
check (source in ('coach_account', 'club', 'manual', 'migration', 'apple_subscription', 'super_admin'));

alter table public.owner_memberships
drop constraint if exists owner_memberships_source_check;

alter table public.owner_memberships
add constraint owner_memberships_source_check
check (source in ('coach_membership', 'club_member', 'manual', 'migration', 'apple_subscription', 'super_admin'));

alter table public.owner_membership_roles
drop constraint if exists owner_membership_roles_source_check;

alter table public.owner_membership_roles
add constraint owner_membership_roles_source_check
check (source in ('coach_membership', 'club_member', 'manual', 'migration', 'apple_subscription', 'super_admin'));

create table if not exists public.owner_subscription_plans (
  plan_code text primary key,
  owner_type text not null,
  display_name text not null,
  status text not null default 'active',
  source text not null default 'apple_iap',
  apple_product_id text null unique,
  seat_limits jsonb not null default '{}'::jsonb,
  feature_flags jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_subscription_plans_owner_type_check check (owner_type in ('club', 'private_coach_business')),
  constraint owner_subscription_plans_status_check check (status in ('active', 'inactive')),
  constraint owner_subscription_plans_source_check check (source in ('apple_iap', 'super_admin', 'manual')),
  constraint owner_subscription_plans_seat_limits_object_check check (jsonb_typeof(seat_limits) = 'object'),
  constraint owner_subscription_plans_feature_flags_object_check check (jsonb_typeof(feature_flags) = 'object')
);

create table if not exists public.owner_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  source text not null,
  plan_code text null references public.owner_subscription_plans(plan_code) on delete set null,
  status text not null default 'active',
  purchased_by_user_id uuid null references auth.users(id) on delete set null,
  product_id text null,
  apple_entitlement_id uuid null references public.apple_entitlements(id) on delete set null,
  valid_until timestamptz null,
  current_period_end timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_subscriptions_source_check check (source in ('apple_iap', 'super_admin', 'manual', 'migration')),
  constraint owner_subscriptions_status_check check (
    status in ('trial', 'active', 'past_due', 'canceled', 'expired', 'revoked', 'inactive')
  ),
  constraint owner_subscriptions_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint owner_subscriptions_owner_source_key unique (owner_account_id, source)
);

create table if not exists public.owner_seat_adjustments (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  role text not null,
  adjustment_type text not null,
  seats integer not null,
  status text not null default 'active',
  source text not null default 'super_admin',
  reason text null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  valid_until timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_seat_adjustments_role_check check (
    role in ('owner', 'admin', 'coach', 'assistant_coach', 'player', 'parent')
  ),
  constraint owner_seat_adjustments_adjustment_type_check check (adjustment_type in ('override', 'add_on')),
  constraint owner_seat_adjustments_seats_check check (seats >= 0),
  constraint owner_seat_adjustments_status_check check (status in ('active', 'inactive', 'expired')),
  constraint owner_seat_adjustments_source_check check (source in ('super_admin', 'manual', 'migration'))
);

create table if not exists public.owner_subscription_audit_events (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid null references public.owner_accounts(id) on delete set null,
  actor_user_id uuid null references auth.users(id) on delete set null,
  source text not null,
  action text not null,
  before_payload jsonb null,
  after_payload jsonb null,
  created_at timestamptz not null default now(),
  constraint owner_subscription_audit_events_source_check check (
    source in ('apple_iap', 'super_admin', 'manual', 'migration', 'system')
  ),
  constraint owner_subscription_audit_events_action_not_blank_check check (btrim(action) <> ''),
  constraint owner_subscription_audit_events_before_payload_object_check check (
    before_payload is null or jsonb_typeof(before_payload) = 'object'
  ),
  constraint owner_subscription_audit_events_after_payload_object_check check (
    after_payload is null or jsonb_typeof(after_payload) = 'object'
  )
);

create index if not exists owner_subscriptions_owner_account_id_idx
  on public.owner_subscriptions (owner_account_id);

create index if not exists owner_subscriptions_status_idx
  on public.owner_subscriptions (status);

create index if not exists owner_subscriptions_purchased_by_user_id_idx
  on public.owner_subscriptions (purchased_by_user_id);

create index if not exists owner_seat_adjustments_owner_account_id_idx
  on public.owner_seat_adjustments (owner_account_id);

create index if not exists owner_seat_adjustments_owner_role_status_idx
  on public.owner_seat_adjustments (owner_account_id, role, status);

create unique index if not exists owner_seat_adjustments_active_override_uidx
  on public.owner_seat_adjustments (owner_account_id, role)
  where status = 'active' and adjustment_type = 'override';

create index if not exists owner_subscription_audit_events_owner_account_id_idx
  on public.owner_subscription_audit_events (owner_account_id, created_at desc);

drop trigger if exists update_owner_subscription_plans_updated_at on public.owner_subscription_plans;
create trigger update_owner_subscription_plans_updated_at
before update on public.owner_subscription_plans
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_owner_subscriptions_updated_at on public.owner_subscriptions;
create trigger update_owner_subscriptions_updated_at
before update on public.owner_subscriptions
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_owner_seat_adjustments_updated_at on public.owner_seat_adjustments;
create trigger update_owner_seat_adjustments_updated_at
before update on public.owner_seat_adjustments
for each row
execute function public.trigger_update_timestamp();

insert into public.owner_subscription_plans (
  plan_code,
  owner_type,
  display_name,
  source,
  apple_product_id,
  seat_limits,
  feature_flags
)
values
  (
    'trainer_basic',
    'private_coach_business',
    'Coach Basic',
    'apple_iap',
    'fc_trainer_basic_monthly',
    '{"owner": 1, "admin": 1, "coach": 1, "assistant_coach": 0, "player": 5, "parent": 0}'::jsonb,
    '{"reports": false, "programs": true, "video_feedback": false, "booking": false}'::jsonb
  ),
  (
    'trainer_standard',
    'private_coach_business',
    'Coach Standard',
    'apple_iap',
    'fc_trainer_standard_monthly',
    '{"owner": 1, "admin": 2, "coach": 1, "assistant_coach": 2, "player": 15, "parent": 15}'::jsonb,
    '{"reports": true, "programs": true, "video_feedback": true, "booking": false}'::jsonb
  ),
  (
    'trainer_premium',
    'private_coach_business',
    'Coach Premium',
    'apple_iap',
    'fc_trainer_premium_monthly',
    '{"owner": 1, "admin": 4, "coach": 3, "assistant_coach": 6, "player": 50, "parent": 50}'::jsonb,
    '{"reports": true, "programs": true, "video_feedback": true, "booking": true}'::jsonb
  )
on conflict (plan_code)
do update
   set owner_type = excluded.owner_type,
       display_name = excluded.display_name,
       status = 'active',
       source = excluded.source,
       apple_product_id = excluded.apple_product_id,
       seat_limits = excluded.seat_limits,
       feature_flags = excluded.feature_flags,
       updated_at = now();

create or replace function public.get_active_owner_subscription(
  p_owner_account_id uuid
)
returns table (
  subscription_id uuid,
  source text,
  plan_code text,
  plan_name text,
  subscription_status text,
  valid_until timestamptz,
  seat_limits jsonb,
  feature_flags jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    os.id,
    os.source,
    os.plan_code,
    osp.display_name,
    os.status,
    coalesce(os.valid_until, os.current_period_end),
    coalesce(osp.seat_limits, '{}'::jsonb),
    coalesce(osp.feature_flags, '{}'::jsonb)
  from public.owner_subscriptions os
  left join public.owner_subscription_plans osp
    on osp.plan_code = os.plan_code
   and osp.status = 'active'
  where os.owner_account_id = p_owner_account_id
    and os.status in ('trial', 'active', 'past_due')
    and (
      coalesce(os.valid_until, os.current_period_end) is null
      or coalesce(os.valid_until, os.current_period_end) > now()
    )
  order by case os.source
      when 'apple_iap' then 1
      when 'super_admin' then 2
      when 'manual' then 3
      else 4
    end,
    os.updated_at desc
  limit 1;
$$;

create or replace function public.get_owner_effective_seats(
  p_owner_account_id uuid
)
returns table (
  owner_account_id uuid,
  role text,
  plan_seats integer,
  override_seats integer,
  add_on_seats integer,
  effective_seats integer,
  seats_used integer,
  seats_available integer,
  source text,
  plan_code text
)
language sql
security definer
set search_path = public
as $$
  with active_subscription as (
    select *
    from public.get_active_owner_subscription(p_owner_account_id)
  ),
  base_roles as (
    select unnest(array['owner', 'admin', 'coach', 'assistant_coach', 'player', 'parent']) as role
  ),
  plan_roles as (
    select key as role, greatest((value #>> '{}')::integer, 0) as seats
    from active_subscription, jsonb_each(active_subscription.seat_limits)
    where jsonb_typeof(value) = 'number'
  ),
  adjustment_roles as (
    select osa.role
    from public.owner_seat_adjustments osa
    where osa.owner_account_id = p_owner_account_id
      and osa.status = 'active'
      and (osa.valid_until is null or osa.valid_until > now())
  ),
  roles as (
    select role from base_roles
    union
    select role from plan_roles
    union
    select role from adjustment_roles
  ),
  adjustments as (
    select
      osa.role,
      max(osa.seats) filter (where osa.adjustment_type = 'override')::integer as override_seats,
      coalesce(sum(osa.seats) filter (where osa.adjustment_type = 'add_on'), 0)::integer as add_on_seats
    from public.owner_seat_adjustments osa
    where osa.owner_account_id = p_owner_account_id
      and osa.status = 'active'
      and (osa.valid_until is null or osa.valid_until > now())
    group by osa.role
  ),
  usage as (
    select omr.role, count(distinct omr.user_id)::integer as seats_used
    from public.owner_membership_roles omr
    join public.owner_memberships om
      on om.owner_account_id = omr.owner_account_id
     and om.user_id = omr.user_id
     and om.status = 'active'
    where omr.owner_account_id = p_owner_account_id
      and omr.status = 'active'
      and omr.role in ('owner', 'admin', 'coach', 'assistant_coach')
    group by omr.role

    union all

    select 'player'::text, count(distinct op.player_id)::integer
    from public.owner_players op
    where op.owner_account_id = p_owner_account_id
      and op.status = 'active'

    union all

    select 'parent'::text, count(distinct opg.guardian_user_id)::integer
    from public.owner_player_guardians opg
    where opg.owner_account_id = p_owner_account_id
      and opg.status = 'active'
  )
  select
    p_owner_account_id as owner_account_id,
    r.role,
    coalesce(pr.seats, 0)::integer as plan_seats,
    a.override_seats,
    coalesce(a.add_on_seats, 0)::integer as add_on_seats,
    greatest(coalesce(a.override_seats, coalesce(pr.seats, 0)) + coalesce(a.add_on_seats, 0), 0)::integer as effective_seats,
    coalesce(u.seats_used, 0)::integer as seats_used,
    greatest(
      greatest(coalesce(a.override_seats, coalesce(pr.seats, 0)) + coalesce(a.add_on_seats, 0), 0)
      - coalesce(u.seats_used, 0),
      0
    )::integer as seats_available,
    case
      when a.override_seats is not null and coalesce(a.add_on_seats, 0) > 0 then 'super_admin_override_plus_add_on'
      when a.override_seats is not null then 'super_admin_override'
      when coalesce(a.add_on_seats, 0) > 0 and coalesce(pr.seats, 0) > 0 then 'plan_baseline_plus_add_on'
      when coalesce(a.add_on_seats, 0) > 0 then 'super_admin_add_on'
      when coalesce(pr.seats, 0) > 0 then 'plan_baseline'
      else 'none'
    end as source,
    (select active_subscription.plan_code from active_subscription limit 1) as plan_code
  from roles r
  left join plan_roles pr
    on pr.role = r.role
  left join adjustments a
    on a.role = r.role
  left join usage u
    on u.role = r.role
  order by array_position(array['owner', 'admin', 'coach', 'assistant_coach', 'player', 'parent'], r.role);
$$;

create or replace function public.get_owner_seat_status_payload(
  p_owner_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner public.owner_accounts%rowtype;
  v_plan_code text := null;
  v_plan_name text := null;
  v_subscription_status text := null;
  v_valid_until timestamptz := null;
  v_feature_flags jsonb := '{}'::jsonb;
  v_seats jsonb := '[]'::jsonb;
  v_player_seats jsonb := null;
begin
  select *
    into v_owner
  from public.owner_accounts oa
  where oa.id = p_owner_account_id;

  if v_owner.id is null then
    raise exception 'OWNER_ACCOUNT_NOT_FOUND';
  end if;

  select
    plan_code,
    plan_name,
    subscription_status,
    valid_until,
    feature_flags
    into
      v_plan_code,
      v_plan_name,
      v_subscription_status,
      v_valid_until,
      v_feature_flags
  from public.get_active_owner_subscription(p_owner_account_id)
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'role', es.role,
      'planSeats', es.plan_seats,
      'overrideSeats', es.override_seats,
      'addOnSeats', es.add_on_seats,
      'effectiveSeats', es.effective_seats,
      'seatsUsed', es.seats_used,
      'seatsAvailable', es.seats_available,
      'source', es.source,
      'planCode', es.plan_code
    ) order by array_position(array['owner', 'admin', 'coach', 'assistant_coach', 'player', 'parent'], es.role)), '[]'::jsonb)
    into v_seats
  from public.get_owner_effective_seats(p_owner_account_id) es;

  select jsonb_build_object(
      'role', es.role,
      'planSeats', es.plan_seats,
      'overrideSeats', es.override_seats,
      'addOnSeats', es.add_on_seats,
      'effectiveSeats', es.effective_seats,
      'seatsUsed', es.seats_used,
      'seatsAvailable', es.seats_available,
      'source', es.source,
      'planCode', es.plan_code
    )
    into v_player_seats
  from public.get_owner_effective_seats(p_owner_account_id) es
  where es.role = 'player';

  return jsonb_build_object(
    'ownerAccountId', v_owner.id,
    'ownerType', v_owner.owner_type,
    'ownerStatus', v_owner.status,
    'planCode', v_plan_code,
    'planName', v_plan_name,
    'subscriptionStatus', v_subscription_status,
    'validUntil', v_valid_until,
    'featureFlags', coalesce(v_feature_flags, '{}'::jsonb),
    'seats', v_seats,
    'playerSeats', v_player_seats,
    'canAddPlayers', coalesce((v_player_seats ->> 'seatsAvailable')::integer, 0) > 0
  );
end;
$$;

create or replace function public.get_owner_seat_status(
  p_actor_user_id uuid,
  p_owner_account_id uuid
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

  if p_owner_account_id is null then
    raise exception 'VALIDATION_ERROR';
  end if;

  if not (
    public.has_owner_account_role(
      p_owner_account_id,
      p_actor_user_id,
      array['owner', 'admin', 'coach', 'assistant_coach']
    )
    or public.is_platform_admin(p_actor_user_id)
  ) then
    raise exception 'FORBIDDEN';
  end if;

  return public.get_owner_seat_status_payload(p_owner_account_id);
end;
$$;

create or replace function public.get_current_owner_seat_status(
  p_owner_account_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.get_owner_seat_status((select auth.uid()), p_owner_account_id);
end;
$$;

create or replace function public.assert_owner_seat_available(
  p_actor_user_id uuid,
  p_owner_account_id uuid,
  p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := case
    when p_role = 'assistant' then 'assistant_coach'
    else p_role
  end;
  v_status jsonb;
  v_role_status jsonb;
begin
  if v_role not in ('owner', 'admin', 'coach', 'assistant_coach', 'player', 'parent') then
    raise exception 'VALIDATION_ERROR';
  end if;

  v_status := public.get_owner_seat_status(p_actor_user_id, p_owner_account_id);

  select seat_line
    into v_role_status
  from jsonb_array_elements(v_status -> 'seats') as seat_line
  where seat_line ->> 'role' = v_role
  limit 1;

  if v_role_status is null then
    raise exception 'SEAT_LIMIT_REACHED';
  end if;

  if coalesce((v_role_status ->> 'effectiveSeats')::integer, 0) <= 0 then
    raise exception 'LICENSE_INACTIVE';
  end if;

  if coalesce((v_role_status ->> 'seatsAvailable')::integer, 0) <= 0 then
    raise exception 'SEAT_LIMIT_REACHED';
  end if;

  return jsonb_build_object(
    'ok', true,
    'seat', v_role_status,
    'seatStatus', v_status
  );
end;
$$;

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
  v_actor_user_id uuid := (select auth.uid());
  v_jwt_role text := current_setting('request.jwt.claim.role', true);
  v_plan public.owner_subscription_plans%rowtype;
  v_profile_name text;
  v_account_name text;
  v_coach_account_id uuid;
  v_owner_account_id uuid;
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

  update public.owner_accounts
     set status = case when v_is_active then 'active' else status end,
         source = case when source in ('manual', 'migration') then 'apple_subscription' else source end,
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
    coalesce(v_actor_user_id, p_user_id),
    'apple_iap',
    case when v_is_active then 'apple_entitlement_synced' else 'apple_entitlement_inactive' end,
    jsonb_build_object(
      'subscriptionId', v_subscription_id,
      'planCode', v_plan.plan_code,
      'status', v_normalized_status,
      'expiresAt', p_expires_at
    )
  );

  return public.get_owner_seat_status_payload(v_owner_account_id)
    || jsonb_build_object(
      'skipped', false,
      'ownerProvisioned', v_is_active,
      'coachAccountId', v_coach_account_id
    );
end;
$$;

create or replace function public.upsert_owner_seat_adjustment_as_platform_admin(
  p_actor_user_id uuid,
  p_owner_account_id uuid,
  p_role text,
  p_adjustment_type text,
  p_seats integer,
  p_reason text default null,
  p_valid_until timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := case when p_role = 'assistant' then 'assistant_coach' else p_role end;
  v_before jsonb;
  v_adjustment_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHORIZED';
  end if;

  if not public.is_platform_admin(p_actor_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if p_owner_account_id is null
     or v_role not in ('owner', 'admin', 'coach', 'assistant_coach', 'player', 'parent')
     or p_adjustment_type not in ('override', 'add_on')
     or p_seats is null
     or p_seats < 0
  then
    raise exception 'VALIDATION_ERROR';
  end if;

  v_before := public.get_owner_seat_status_payload(p_owner_account_id);

  if p_adjustment_type = 'override' then
    insert into public.owner_seat_adjustments (
      owner_account_id,
      role,
      adjustment_type,
      seats,
      status,
      source,
      reason,
      actor_user_id,
      valid_until
    )
    values (
      p_owner_account_id,
      v_role,
      'override',
      p_seats,
      'active',
      'super_admin',
      nullif(btrim(coalesce(p_reason, '')), ''),
      p_actor_user_id,
      p_valid_until
    )
    on conflict (owner_account_id, role)
    where status = 'active' and adjustment_type = 'override'
    do update
       set seats = excluded.seats,
           reason = excluded.reason,
           actor_user_id = excluded.actor_user_id,
           valid_until = excluded.valid_until,
           updated_at = now()
    returning id
      into v_adjustment_id;
  else
    insert into public.owner_seat_adjustments (
      owner_account_id,
      role,
      adjustment_type,
      seats,
      status,
      source,
      reason,
      actor_user_id,
      valid_until
    )
    values (
      p_owner_account_id,
      v_role,
      'add_on',
      p_seats,
      'active',
      'super_admin',
      nullif(btrim(coalesce(p_reason, '')), ''),
      p_actor_user_id,
      p_valid_until
    )
    returning id
      into v_adjustment_id;
  end if;

  insert into public.owner_subscription_audit_events (
    owner_account_id,
    actor_user_id,
    source,
    action,
    before_payload,
    after_payload
  )
  values (
    p_owner_account_id,
    p_actor_user_id,
    'super_admin',
    'seat_adjustment_upserted',
    v_before,
    public.get_owner_seat_status_payload(p_owner_account_id)
      || jsonb_build_object('adjustmentId', v_adjustment_id)
  );

  return public.get_owner_seat_status_payload(p_owner_account_id)
    || jsonb_build_object('adjustmentId', v_adjustment_id);
end;
$$;

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

drop trigger if exists sync_owner_subscription_from_club_license on public.club_licenses;
create trigger sync_owner_subscription_from_club_license
after insert or update of club_id, seats_total, status, valid_until, plan_name on public.club_licenses
for each row
execute function public.sync_owner_subscription_from_club_license();

insert into public.owner_subscriptions (
  owner_account_id,
  source,
  plan_code,
  status,
  valid_until,
  metadata
)
select
  public.ensure_owner_account_for_club(cl.club_id),
  'super_admin',
  null,
  case when cl.status in ('active', 'expired', 'inactive') then cl.status else 'inactive' end,
  cl.valid_until,
  jsonb_build_object(
    'legacyClubLicenseId', cl.id,
    'planName', cl.plan_name,
    'mergeRule', 'club_license_player_override'
  )
from public.club_licenses cl
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
  public.ensure_owner_account_for_club(cl.club_id),
  'player',
  'override',
  greatest(coalesce(cl.seats_total, 0), 0),
  case when cl.status = 'active' then 'active' else 'inactive' end,
  'migration',
  'Backfilled from legacy club_licenses.seats_total',
  cl.valid_until
from public.club_licenses cl
on conflict (owner_account_id, role)
where status = 'active' and adjustment_type = 'override'
do update
   set seats = excluded.seats,
       status = excluded.status,
       reason = excluded.reason,
       valid_until = excluded.valid_until,
       updated_at = now();

alter table public.owner_subscription_plans enable row level security;
alter table public.owner_subscriptions enable row level security;
alter table public.owner_seat_adjustments enable row level security;
alter table public.owner_subscription_audit_events enable row level security;

drop policy if exists "Authenticated users can read active owner subscription plans" on public.owner_subscription_plans;
create policy "Authenticated users can read active owner subscription plans"
  on public.owner_subscription_plans
  for select
  to authenticated
  using (status = 'active');

drop policy if exists "Owner members can read owner subscriptions" on public.owner_subscriptions;
create policy "Owner members can read owner subscriptions"
  on public.owner_subscriptions
  for select
  to authenticated
  using (public.is_owner_account_member(owner_account_id, (select auth.uid())));

drop policy if exists "Owner members can read owner seat adjustments" on public.owner_seat_adjustments;
create policy "Owner members can read owner seat adjustments"
  on public.owner_seat_adjustments
  for select
  to authenticated
  using (public.is_owner_account_member(owner_account_id, (select auth.uid())));

drop policy if exists "Owner admins can read owner subscription audit" on public.owner_subscription_audit_events;
create policy "Owner admins can read owner subscription audit"
  on public.owner_subscription_audit_events
  for select
  to authenticated
  using (
    owner_account_id is not null
    and public.is_owner_account_admin(owner_account_id, (select auth.uid()))
  );

revoke all on public.owner_subscription_plans from anon;
revoke all on public.owner_subscriptions from anon;
revoke all on public.owner_seat_adjustments from anon;
revoke all on public.owner_subscription_audit_events from anon;

grant select on public.owner_subscription_plans to authenticated;
grant select on public.owner_subscriptions to authenticated;
grant select on public.owner_seat_adjustments to authenticated;
grant select on public.owner_subscription_audit_events to authenticated;

grant all on public.owner_subscription_plans to service_role;
grant all on public.owner_subscriptions to service_role;
grant all on public.owner_seat_adjustments to service_role;
grant all on public.owner_subscription_audit_events to service_role;

revoke all on function public.get_active_owner_subscription(uuid) from public;
grant execute on function public.get_active_owner_subscription(uuid) to authenticated, service_role;

revoke all on function public.get_owner_effective_seats(uuid) from public;
grant execute on function public.get_owner_effective_seats(uuid) to authenticated, service_role;

revoke all on function public.get_owner_seat_status_payload(uuid) from public;
grant execute on function public.get_owner_seat_status_payload(uuid) to service_role;

revoke all on function public.get_owner_seat_status(uuid, uuid) from public;
grant execute on function public.get_owner_seat_status(uuid, uuid) to service_role;

revoke all on function public.get_current_owner_seat_status(uuid) from public;
grant execute on function public.get_current_owner_seat_status(uuid) to authenticated, service_role;

revoke all on function public.assert_owner_seat_available(uuid, uuid, text) from public;
grant execute on function public.assert_owner_seat_available(uuid, uuid, text) to service_role;

revoke all on function public.sync_private_coach_owner_subscription(uuid, text, text, text, timestamptz, text, jsonb) from public;
grant execute on function public.sync_private_coach_owner_subscription(uuid, text, text, text, timestamptz, text, jsonb) to authenticated, service_role;

revoke all on function public.upsert_owner_seat_adjustment_as_platform_admin(uuid, uuid, text, text, integer, text, timestamptz) from public;
grant execute on function public.upsert_owner_seat_adjustment_as_platform_admin(uuid, uuid, text, text, integer, text, timestamptz) to service_role;

revoke all on function public.create_owner_account_as_platform_admin(uuid, text, text, uuid, text, jsonb) from public;
grant execute on function public.create_owner_account_as_platform_admin(uuid, text, text, uuid, text, jsonb) to service_role;

revoke all on function public.sync_owner_subscription_from_club_license() from public;
grant execute on function public.sync_owner_subscription_from_club_license() to service_role;

comment on table public.owner_subscription_plans is
  'Owner-aware plan catalogue. Coach Apple plans define baseline seats and premium feature flags for private_coach_business owners.';

comment on table public.owner_subscriptions is
  'Current commercial entitlement for an owner account from Apple IAP, super admin provisioning or migration.';

comment on table public.owner_seat_adjustments is
  'Super admin override/add-on seat provisioning. Effective seats are plan baseline plus add-ons unless an override replaces the baseline for a role.';

comment on function public.get_owner_effective_seats(uuid) is
  'Computes the single effective seat truth for each owner role: plan baseline, super admin override/add-on, current usage and availability.';

comment on function public.sync_private_coach_owner_subscription(uuid, text, text, text, timestamptz, text, jsonb) is
  'Connects active Apple trainer entitlements to a private_coach_business owner account with owner, admin and coach roles without deleting history on expiry/revocation.';
