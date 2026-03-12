create or replace function public.resolve_default_club_id_for_team_admin(
  p_admin_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_club_ids uuid[];
begin
  if p_admin_user_id is null then
    return null;
  end if;

  select
    coalesce(array_agg(distinct cm.club_id), '{}'::uuid[])
    into v_club_ids
  from public.club_members cm
  where cm.user_id = p_admin_user_id
    and cm.status = 'active'
    and cm.role in ('owner', 'admin', 'coach');

  if coalesce(array_length(v_club_ids, 1), 0) = 1 then
    return v_club_ids[1];
  end if;

  return null;
end;
$$;

create or replace function public.assign_team_club_id_from_membership()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.club_id is null then
    new.club_id := public.resolve_default_club_id_for_team_admin(new.admin_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_assign_team_club_id_from_membership on public.teams;

create trigger trigger_assign_team_club_id_from_membership
before insert or update of admin_id, club_id
on public.teams
for each row
execute function public.assign_team_club_id_from_membership();

update public.teams t
   set club_id = public.resolve_default_club_id_for_team_admin(t.admin_id)
 where t.club_id is null;
