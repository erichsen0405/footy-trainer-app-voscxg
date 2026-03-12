create or replace function public.check_player_limit()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  admin_user_id uuid;
  current_player_count integer;
  max_allowed_players integer;
  subscription_status text;
  has_trainer_entitlement boolean := false;
begin
  admin_user_id := new.admin_id;

  select count(*)
    into current_player_count
  from public.admin_player_relationships
  where admin_id = admin_user_id;

  select
    s.status,
    sp.max_players
    into subscription_status, max_allowed_players
  from public.subscriptions s
  join public.subscription_plans sp
    on sp.id = s.plan_id
  where s.admin_id = admin_user_id
    and s.status in ('trial', 'active')
  order by s.created_at desc
  limit 1;

  if subscription_status is null then
    select exists (
      select 1
      from public.user_entitlements ue
      where ue.user_id = admin_user_id
        and ue.entitlement = U&'tr\00E6ner_premium'
        and ue.is_active = true
        and (ue.expires_at is null or ue.expires_at > now())
    )
    into has_trainer_entitlement;

    if has_trainer_entitlement then
      max_allowed_players := 50;
    else
      raise exception 'No active subscription found. Please subscribe to add players.';
    end if;
  end if;

  if current_player_count >= max_allowed_players then
    raise exception 'Player limit reached. Your plan allows % player(s). Please upgrade your subscription.', max_allowed_players;
  end if;

  return new;
end;
$$;
