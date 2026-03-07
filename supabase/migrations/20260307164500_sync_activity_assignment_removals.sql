create or replace function public.assign_internal_activity_to_players(
  p_source_activity_id uuid,
  p_player_ids uuid[],
  p_team_scope_by_player jsonb default '{}'::jsonb
)
returns table (
  inserted_activity_id uuid,
  player_id uuid,
  team_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_source record;
  v_player uuid;
  v_team_id uuid;
  v_team_text text;
  v_existing_activity_id uuid;
  v_category_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  select
    a.id,
    a.title,
    a.activity_date,
    a.activity_time,
    a.activity_end_time,
    a.location,
    a.category_id,
    a.intensity_enabled
  into v_source
  from public.activities a
  where a.id = p_source_activity_id
    and a.user_id = v_actor
    and coalesce(a.is_external, false) = false;

  if not found then
    raise exception 'Activity not found or not allowed'
      using errcode = '42501';
  end if;

  if p_player_ids is null or coalesce(array_length(p_player_ids, 1), 0) = 0 then
    return;
  end if;

  foreach v_player in array p_player_ids loop
    if not exists (
      select 1
      from public.admin_player_relationships apr
      where apr.admin_id = v_actor
        and apr.player_id = v_player
    ) then
      raise exception 'Player % is not linked to trainer', v_player
        using errcode = '42501';
    end if;

    v_team_id := null;
    v_team_text := nullif(trim(coalesce(p_team_scope_by_player ->> v_player::text, '')), '');
    if v_team_text is not null and lower(v_team_text) <> 'null' then
      begin
        v_team_id := v_team_text::uuid;
      exception
        when others then
          v_team_id := null;
      end;

      if v_team_id is not null and not exists (
        select 1
        from public.teams t
        join public.team_members tm
          on tm.team_id = t.id
         and tm.player_id = v_player
        where t.id = v_team_id
          and t.admin_id = v_actor
      ) then
        v_team_id := null;
      end if;
    end if;

    v_category_id := public.ensure_player_category_copy(v_source.category_id, v_player);
    v_existing_activity_id := null;

    select a_existing.id
      into v_existing_activity_id
    from public.activities a_existing
    where a_existing.source_activity_id = v_source.id
      and a_existing.user_id = v_player
      and coalesce(a_existing.is_external, false) = false
    limit 1;

    if v_existing_activity_id is not null then
      update public.activities
         set team_id = v_team_id,
             category_id = v_category_id,
             updated_at = now()
       where id = v_existing_activity_id
         and (
           team_id is distinct from v_team_id
           or category_id is distinct from v_category_id
         );
      continue;
    end if;

    insert into public.activities (
      user_id,
      title,
      activity_date,
      activity_time,
      activity_end_time,
      location,
      category_id,
      intensity,
      intensity_enabled,
      intensity_note,
      is_external,
      player_id,
      team_id,
      source_activity_id,
      series_id,
      series_instance_date
    )
    values (
      v_player,
      v_source.title,
      v_source.activity_date,
      v_source.activity_time,
      v_source.activity_end_time,
      v_source.location,
      v_category_id,
      null,
      coalesce(v_source.intensity_enabled, false),
      null,
      false,
      v_player,
      v_team_id,
      v_source.id,
      null,
      null
    )
    returning id into inserted_activity_id;

    insert into public.activity_tasks (
      activity_id,
      title,
      description,
      completed,
      reminder_minutes,
      task_template_id,
      feedback_template_id
    )
    select
      inserted_activity_id,
      coalesce(nullif(trim(at.title), ''), 'Opgave'),
      coalesce(at.description, ''),
      false,
      at.reminder_minutes,
      at.task_template_id,
      at.feedback_template_id
    from public.activity_tasks at
    where at.activity_id = v_source.id;

    player_id := v_player;
    team_id := v_team_id;
    return next;
  end loop;

  return;
end;
$$;

grant execute on function public.assign_internal_activity_to_players(uuid, uuid[], jsonb) to authenticated;

create or replace function public.remove_internal_activity_assignments(
  p_source_activity_id uuid,
  p_player_ids uuid[]
)
returns table (
  removed_activity_id uuid,
  player_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_source_id uuid;
  v_player uuid;
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

  if p_player_ids is null or coalesce(array_length(p_player_ids, 1), 0) = 0 then
    return;
  end if;

  foreach v_player in array p_player_ids loop
    removed_activity_id := null;
    player_id := null;

    delete from public.activities a
     where a.source_activity_id = v_source_id
       and a.user_id = v_player
       and coalesce(a.is_external, false) = false
    returning a.id, a.user_id
      into removed_activity_id, player_id;

    if removed_activity_id is not null then
      return next;
    end if;
  end loop;

  return;
end;
$$;

grant execute on function public.remove_internal_activity_assignments(uuid, uuid[]) to authenticated;

create or replace function public.assign_external_activity_to_players(
  p_external_event_id uuid,
  p_player_ids uuid[],
  p_team_scope_by_player jsonb default '{}'::jsonb,
  p_source_meta_id uuid default null,
  p_category_id uuid default null,
  p_intensity_enabled boolean default false
)
returns table (
  inserted_meta_id uuid,
  player_id uuid,
  team_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_player uuid;
  v_team_id uuid;
  v_team_text text;
  v_source_meta_id uuid := null;
  v_source_meta_category_id uuid := null;
  v_effective_category_id uuid;
  v_player_category_id uuid;
  v_existing_meta_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_external_event_id is null then
    raise exception 'Missing external event id'
      using errcode = '22023';
  end if;

  if p_player_ids is null or coalesce(array_length(p_player_ids, 1), 0) = 0 then
    return;
  end if;

  if p_source_meta_id is not null then
    select
      elm.id,
      elm.category_id
    into
      v_source_meta_id,
      v_source_meta_category_id
    from public.events_local_meta elm
    where elm.id = p_source_meta_id
      and elm.user_id = v_actor
      and elm.external_event_id = p_external_event_id;
  end if;

  if v_source_meta_id is null and not exists (
    select 1
    from public.events_external ee
    join public.external_calendars ec
      on ec.id = ee.provider_calendar_id
    where ee.id = p_external_event_id
      and ec.user_id = v_actor
  ) then
    raise exception 'External activity not found or not allowed'
      using errcode = '42501';
  end if;

  v_effective_category_id := coalesce(p_category_id, v_source_meta_category_id);

  foreach v_player in array p_player_ids loop
    if not exists (
      select 1
      from public.admin_player_relationships apr
      where apr.admin_id = v_actor
        and apr.player_id = v_player
    ) then
      raise exception 'Player % is not linked to trainer', v_player
        using errcode = '42501';
    end if;

    v_team_id := null;
    v_team_text := nullif(trim(coalesce(p_team_scope_by_player ->> v_player::text, '')), '');
    if v_team_text is not null and lower(v_team_text) <> 'null' then
      begin
        v_team_id := v_team_text::uuid;
      exception
        when others then
          v_team_id := null;
      end;

      if v_team_id is not null and not exists (
        select 1
        from public.teams t
        join public.team_members tm
          on tm.team_id = t.id
         and tm.player_id = v_player
        where t.id = v_team_id
          and t.admin_id = v_actor
      ) then
        v_team_id := null;
      end if;
    end if;

    v_player_category_id := public.ensure_player_category_copy(v_effective_category_id, v_player);
    v_existing_meta_id := null;

    if v_source_meta_id is not null then
      select elm.id
        into v_existing_meta_id
      from public.events_local_meta elm
      where elm.source_local_meta_id = v_source_meta_id
        and elm.user_id = v_player
      limit 1;
    end if;

    if v_existing_meta_id is null then
      select elm.id
        into v_existing_meta_id
      from public.events_local_meta elm
      where elm.external_event_id = p_external_event_id
        and elm.user_id = v_player
      limit 1;
    end if;

    if v_existing_meta_id is not null then
      update public.events_local_meta
      set
        team_id = v_team_id,
        category_id = v_player_category_id,
        source_local_meta_id = coalesce(v_source_meta_id, source_local_meta_id),
        updated_at = now(),
        last_local_modified = now()
      where id = v_existing_meta_id
        and (
          team_id is distinct from v_team_id
          or category_id is distinct from v_player_category_id
          or (v_source_meta_id is not null and source_local_meta_id is distinct from v_source_meta_id)
        );
      continue;
    end if;

    inserted_meta_id := null;

    insert into public.events_local_meta (
      external_event_id,
      user_id,
      category_id,
      intensity,
      intensity_enabled,
      intensity_note,
      player_id,
      team_id,
      source_local_meta_id,
      updated_at,
      last_local_modified
    )
    values (
      p_external_event_id,
      v_player,
      v_player_category_id,
      null,
      coalesce(p_intensity_enabled, false),
      null,
      v_player,
      v_team_id,
      v_source_meta_id,
      now(),
      now()
    )
    on conflict (external_event_id, user_id) do nothing
    returning id into inserted_meta_id;

    if inserted_meta_id is null then
      continue;
    end if;

    if v_source_meta_id is not null then
      insert into public.external_event_tasks (
        local_meta_id,
        title,
        description,
        completed,
        reminder_minutes,
        task_template_id,
        feedback_template_id
      )
      select
        inserted_meta_id,
        coalesce(nullif(trim(et.title), ''), 'Opgave'),
        coalesce(et.description, ''),
        false,
        et.reminder_minutes,
        et.task_template_id,
        et.feedback_template_id
      from public.external_event_tasks et
      where et.local_meta_id = v_source_meta_id;
    end if;

    player_id := v_player;
    team_id := v_team_id;
    return next;
  end loop;

  return;
end;
$$;

grant execute on function public.assign_external_activity_to_players(uuid, uuid[], jsonb, uuid, uuid, boolean) to authenticated;

create or replace function public.remove_external_activity_assignments(
  p_external_event_id uuid,
  p_player_ids uuid[],
  p_source_meta_id uuid default null
)
returns table (
  removed_meta_id uuid,
  player_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_source_meta_id uuid := null;
  v_player uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated'
      using errcode = '42501';
  end if;

  if p_external_event_id is null then
    raise exception 'Missing external event id'
      using errcode = '22023';
  end if;

  if p_source_meta_id is not null then
    select elm.id
      into v_source_meta_id
    from public.events_local_meta elm
    where elm.id = p_source_meta_id
      and elm.user_id = v_actor
      and elm.external_event_id = p_external_event_id;
  end if;

  if v_source_meta_id is null and not exists (
    select 1
    from public.events_external ee
    join public.external_calendars ec
      on ec.id = ee.provider_calendar_id
    where ee.id = p_external_event_id
      and ec.user_id = v_actor
  ) then
    raise exception 'External activity not found or not allowed'
      using errcode = '42501';
  end if;

  if p_player_ids is null or coalesce(array_length(p_player_ids, 1), 0) = 0 then
    return;
  end if;

  foreach v_player in array p_player_ids loop
    removed_meta_id := null;
    player_id := null;

    if v_source_meta_id is not null then
      delete from public.events_local_meta elm
       where elm.source_local_meta_id = v_source_meta_id
         and elm.user_id = v_player
      returning elm.id, elm.user_id
        into removed_meta_id, player_id;
    else
      delete from public.events_local_meta elm
       where elm.external_event_id = p_external_event_id
         and elm.user_id = v_player
      returning elm.id, elm.user_id
        into removed_meta_id, player_id;
    end if;

    if removed_meta_id is not null then
      return next;
    end if;
  end loop;

  return;
end;
$$;

grant execute on function public.remove_external_activity_assignments(uuid, uuid[], uuid) to authenticated;
