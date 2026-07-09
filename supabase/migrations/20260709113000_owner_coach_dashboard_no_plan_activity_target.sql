-- Issue #282 follow-up: route "no upcoming plan" alerts to player-scoped activities.

do $$
begin
  if to_regprocedure('public.get_owner_coach_dashboard_payload_base_20260709100000(uuid,uuid,timestamptz)') is null then
    alter function public.get_owner_coach_dashboard_payload(uuid, uuid, timestamptz)
      rename to get_owner_coach_dashboard_payload_base_20260709100000;
  end if;
end $$;

create or replace function public.get_owner_coach_dashboard_payload(
  p_actor_user_id uuid,
  p_owner_account_id uuid,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_alerts jsonb;
begin
  v_payload := public.get_owner_coach_dashboard_payload_base_20260709100000(
    p_actor_user_id,
    p_owner_account_id,
    p_now
  );

  select coalesce(jsonb_agg(
    case
      when alert->>'type' = 'no_plan' then
        jsonb_set(
          alert,
          '{action}',
          jsonb_build_object('target', 'activities', 'playerId', alert->>'playerId'),
          true
        )
      else alert
    end
    order by ord
  ), '[]'::jsonb)
    into v_alerts
  from jsonb_array_elements(coalesce(v_payload->'alerts', '[]'::jsonb)) with ordinality as alert_rows(alert, ord);

  return jsonb_set(v_payload, '{alerts}', v_alerts, true);
end;
$$;

revoke all on function public.get_owner_coach_dashboard_payload_base_20260709100000(uuid, uuid, timestamptz) from public, authenticated;
grant execute on function public.get_owner_coach_dashboard_payload_base_20260709100000(uuid, uuid, timestamptz) to service_role;

revoke all on function public.get_owner_coach_dashboard_payload(uuid, uuid, timestamptz) from public;
grant execute on function public.get_owner_coach_dashboard_payload(uuid, uuid, timestamptz) to authenticated, service_role;

comment on function public.get_owner_coach_dashboard_payload(uuid, uuid, timestamptz) is
  'Returns the owner-scoped coach dashboard payload for issue #282 and routes no-plan alerts to player-scoped activities.';
