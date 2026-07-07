-- Issue #279 follow-up: preserve club context for team-derived coach players.

update public.coach_players cp
set club_id = t.club_id,
    last_synced_at = now(),
    updated_at = now()
from public.team_members tm
join public.teams t
  on t.id = tm.team_id
where t.club_id is not null
  and cp.coach_account_id = t.coach_account_id
  and cp.player_id = tm.player_id
  and cp.club_id is distinct from t.club_id;

create or replace function public.sync_team_member_to_coach_player()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coach_account_id uuid;
  v_admin_id uuid;
  v_club_id uuid;
begin
  select t.coach_account_id, t.admin_id, t.club_id
    into v_coach_account_id, v_admin_id, v_club_id
  from public.teams t
  where t.id = new.team_id;

  if v_coach_account_id is null then
    v_coach_account_id := public.ensure_migration_coach_account_for_user(v_admin_id);

    update public.teams
       set coach_account_id = v_coach_account_id,
           updated_at = now()
     where id = new.team_id
       and coach_account_id is null;
  end if;

  perform public.upsert_coach_player_from_legacy(
    v_coach_account_id,
    new.player_id,
    'active',
    'team_member',
    v_admin_id,
    null,
    null,
    v_club_id,
    coalesce(new.created_at, now())
  );

  return new;
end;
$$;

comment on column public.coach_players.club_id is
  'Optional club context preserved for team-derived legacy coach/player links.';
