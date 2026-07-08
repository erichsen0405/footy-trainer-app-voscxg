-- Basic coach owners can invite guardians for their five included players.
update public.owner_subscription_plans
set
  seat_limits = jsonb_set(coalesce(seat_limits, '{}'::jsonb), '{parent}', '5'::jsonb, true),
  updated_at = now()
where plan_code = 'trainer_basic';
