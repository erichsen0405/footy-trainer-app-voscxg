-- Coach, assistant coach and parent/guardian roles are count-only.
-- Player seats remain capped by plan/super-admin provisioning.

update public.owner_subscription_plans
set
  seat_limits = seat_limits - 'coach' - 'assistant_coach' - 'parent',
  updated_at = now()
where owner_type = 'private_coach_business';

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
    case
      when r.role in ('coach', 'assistant_coach', 'parent') then 0
      else coalesce(pr.seats, 0)::integer
    end as plan_seats,
    case
      when r.role in ('coach', 'assistant_coach', 'parent') then null::integer
      else a.override_seats
    end as override_seats,
    case
      when r.role in ('coach', 'assistant_coach', 'parent') then 0
      else coalesce(a.add_on_seats, 0)::integer
    end as add_on_seats,
    case
      when r.role in ('coach', 'assistant_coach', 'parent') then 0
      else greatest(coalesce(a.override_seats, coalesce(pr.seats, 0)) + coalesce(a.add_on_seats, 0), 0)::integer
    end as effective_seats,
    coalesce(u.seats_used, 0)::integer as seats_used,
    case
      when r.role in ('coach', 'assistant_coach', 'parent') then 0
      else greatest(
        greatest(coalesce(a.override_seats, coalesce(pr.seats, 0)) + coalesce(a.add_on_seats, 0), 0)
        - coalesce(u.seats_used, 0),
        0
      )::integer
    end as seats_available,
    case
      when r.role in ('coach', 'assistant_coach', 'parent') then 'unlimited'
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
      'isUnlimited', es.role in ('coach', 'assistant_coach', 'parent'),
      'planSeats', case when es.role in ('coach', 'assistant_coach', 'parent') then null else es.plan_seats end,
      'overrideSeats', case when es.role in ('coach', 'assistant_coach', 'parent') then null else es.override_seats end,
      'addOnSeats', case when es.role in ('coach', 'assistant_coach', 'parent') then null else es.add_on_seats end,
      'effectiveSeats', case when es.role in ('coach', 'assistant_coach', 'parent') then null else es.effective_seats end,
      'seatsUsed', es.seats_used,
      'seatsAvailable', case when es.role in ('coach', 'assistant_coach', 'parent') then null else es.seats_available end,
      'source', case when es.role in ('coach', 'assistant_coach', 'parent') then 'unlimited' else es.source end,
      'planCode', es.plan_code
    ) order by array_position(array['owner', 'admin', 'coach', 'assistant_coach', 'player', 'parent'], es.role)), '[]'::jsonb)
    into v_seats
  from public.get_owner_effective_seats(p_owner_account_id) es;

  select jsonb_build_object(
      'role', es.role,
      'isUnlimited', false,
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

  if v_role in ('coach', 'assistant_coach', 'parent') then
    return jsonb_build_object(
      'ok', true,
      'seat', v_role_status,
      'seatStatus', v_status
    );
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
