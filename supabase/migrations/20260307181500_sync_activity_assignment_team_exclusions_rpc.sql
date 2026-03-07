create or replace function public.sync_internal_activity_assignment_team_exclusions(
  p_source_activity_id uuid,
  p_excluded_player_ids_by_team jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_source_id uuid;
  v_team_key text;
  v_team_value jsonb;
  v_team_id uuid;
  v_player_value text;
  v_player_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  select a.id
    into v_source_id
  from public.activities a
  where a.id = p_source_activity_id
    and a.user_id = v_actor
    and coalesce(a.is_external, false) = false;

  if v_source_id is null then
    raise exception 'Activity not found or not allowed'
      using errcode = '42501';
  end if;

  delete from public.activity_assignment_team_exclusions e
   where e.source_activity_id = v_source_id;

  if p_excluded_player_ids_by_team is null or jsonb_typeof(p_excluded_player_ids_by_team) <> 'object' then
    return;
  end if;

  for v_team_key, v_team_value in
    select key, value
    from jsonb_each(p_excluded_player_ids_by_team)
  loop
    begin
      v_team_id := nullif(trim(v_team_key), '')::uuid;
    exception
      when others then
        v_team_id := null;
    end;

    if v_team_id is null then
      continue;
    end if;

    if not exists (
      select 1
      from public.teams t
      where t.id = v_team_id
        and t.admin_id = v_actor
    ) then
      continue;
    end if;

    if jsonb_typeof(v_team_value) <> 'array' then
      continue;
    end if;

    for v_player_value in
      select jsonb_array_elements_text(v_team_value)
    loop
      begin
        v_player_id := nullif(trim(v_player_value), '')::uuid;
      exception
        when others then
          v_player_id := null;
      end;

      if v_player_id is null then
        continue;
      end if;

      if not exists (
        select 1
        from public.admin_player_relationships apr
        join public.team_members tm
          on tm.player_id = apr.player_id
         and tm.team_id = v_team_id
        where apr.admin_id = v_actor
          and apr.player_id = v_player_id
      ) then
        continue;
      end if;

      insert into public.activity_assignment_team_exclusions (
        source_activity_id,
        external_event_id,
        team_id,
        player_id
      )
      values (
        v_source_id,
        null,
        v_team_id,
        v_player_id
      )
      on conflict do nothing;
    end loop;
  end loop;

  return;
end;
$$;

grant execute on function public.sync_internal_activity_assignment_team_exclusions(uuid, jsonb) to authenticated;

create or replace function public.sync_external_activity_assignment_team_exclusions(
  p_external_event_id uuid,
  p_excluded_player_ids_by_team jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_external_event_id uuid;
  v_team_key text;
  v_team_value jsonb;
  v_team_id uuid;
  v_player_value text;
  v_player_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  select ee.id
    into v_external_event_id
  from public.events_external ee
  join public.external_calendars ec
    on ec.id = ee.provider_calendar_id
  where ee.id = p_external_event_id
    and ec.user_id = v_actor;

  if v_external_event_id is null then
    raise exception 'External activity not found or not allowed'
      using errcode = '42501';
  end if;

  delete from public.activity_assignment_team_exclusions e
   where e.external_event_id = v_external_event_id;

  if p_excluded_player_ids_by_team is null or jsonb_typeof(p_excluded_player_ids_by_team) <> 'object' then
    return;
  end if;

  for v_team_key, v_team_value in
    select key, value
    from jsonb_each(p_excluded_player_ids_by_team)
  loop
    begin
      v_team_id := nullif(trim(v_team_key), '')::uuid;
    exception
      when others then
        v_team_id := null;
    end;

    if v_team_id is null then
      continue;
    end if;

    if not exists (
      select 1
      from public.teams t
      where t.id = v_team_id
        and t.admin_id = v_actor
    ) then
      continue;
    end if;

    if jsonb_typeof(v_team_value) <> 'array' then
      continue;
    end if;

    for v_player_value in
      select jsonb_array_elements_text(v_team_value)
    loop
      begin
        v_player_id := nullif(trim(v_player_value), '')::uuid;
      exception
        when others then
          v_player_id := null;
      end;

      if v_player_id is null then
        continue;
      end if;

      if not exists (
        select 1
        from public.admin_player_relationships apr
        join public.team_members tm
          on tm.player_id = apr.player_id
         and tm.team_id = v_team_id
        where apr.admin_id = v_actor
          and apr.player_id = v_player_id
      ) then
        continue;
      end if;

      insert into public.activity_assignment_team_exclusions (
        source_activity_id,
        external_event_id,
        team_id,
        player_id
      )
      values (
        null,
        v_external_event_id,
        v_team_id,
        v_player_id
      )
      on conflict do nothing;
    end loop;
  end loop;

  return;
end;
$$;

grant execute on function public.sync_external_activity_assignment_team_exclusions(uuid, jsonb) to authenticated;
