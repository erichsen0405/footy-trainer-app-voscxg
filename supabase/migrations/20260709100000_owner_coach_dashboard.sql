-- Issue #282: Owner-scoped coach dashboard with player overview and alerts.

create index if not exists owner_dashboard_activities_user_date_idx
  on public.activities (user_id, activity_date);

create index if not exists owner_dashboard_activities_player_date_idx
  on public.activities (player_id, activity_date);

create index if not exists owner_dashboard_activities_team_date_idx
  on public.activities (team_id, activity_date);

create index if not exists owner_dashboard_activity_tasks_activity_completed_idx
  on public.activity_tasks (activity_id, completed);

create index if not exists owner_dashboard_training_reflections_user_created_idx
  on public.training_reflections (user_id, created_at desc);

create index if not exists owner_dashboard_trainer_feedback_player_updated_idx
  on public.trainer_activity_feedback (player_id, updated_at desc);

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
  v_owner public.owner_accounts%rowtype;
  v_now timestamptz := coalesce(p_now, now());
  v_today date := coalesce(p_now, now())::date;
  v_week_start date := date_trunc('week', coalesce(p_now, now()))::date;
  v_week_end date := (date_trunc('week', coalesce(p_now, now()))::date + 6);
  v_inactivity_cutoff date := (coalesce(p_now, now())::date - 14);
  v_recent_feedback_cutoff timestamptz := coalesce(p_now, now()) - interval '7 days';
  v_task_cutoff date := (coalesce(p_now, now())::date - 14);
  v_payload jsonb;
begin
  if p_actor_user_id is null or p_owner_account_id is null then
    raise exception 'VALIDATION_ERROR'
      using errcode = '22023';
  end if;

  select *
    into v_owner
  from public.owner_accounts oa
  where oa.id = p_owner_account_id;

  if v_owner.id is null then
    raise exception 'OWNER_ACCOUNT_NOT_FOUND';
  end if;

  if public.has_owner_account_coach_access(p_owner_account_id, p_actor_user_id) is not true then
    raise exception 'FORBIDDEN'
      using errcode = '42501';
  end if;

  with staff as (
    select distinct om.user_id
    from public.owner_memberships om
    join public.owner_membership_roles omr
      on omr.owner_account_id = om.owner_account_id
     and omr.user_id = om.user_id
     and omr.status = 'active'
    where om.owner_account_id = p_owner_account_id
      and om.status = 'active'
      and omr.role in ('owner', 'admin', 'coach', 'assistant_coach')
  ),
  owner_teams as (
    select distinct
      t.id,
      t.name,
      t.description,
      t.admin_id,
      t.club_id,
      t.coach_account_id
    from public.teams t
    where t.admin_id in (select user_id from staff)
       or (v_owner.club_id is not null and t.club_id = v_owner.club_id)
       or (v_owner.coach_account_id is not null and t.coach_account_id = v_owner.coach_account_id)
  ),
  team_member_counts as (
    select
      tm.team_id,
      count(distinct tm.player_id)::integer as member_count
    from public.team_members tm
    join owner_teams ot
      on ot.id = tm.team_id
    group by tm.team_id
  ),
  owner_players_base as (
    select
      op.id as owner_player_id,
      op.player_id,
      op.status as owner_roster_status,
      op.source,
      op.first_linked_at,
      op.created_at,
      op.updated_at
    from public.owner_players op
    where op.owner_account_id = p_owner_account_id
      and op.status = 'active'
  ),
  player_teams as (
    select
      tm.player_id,
      jsonb_agg(
        distinct jsonb_build_object(
          'id', ot.id,
          'name', ot.name,
          'description', ot.description,
          'memberCount', coalesce(tmc.member_count, 0)
        )
      ) as teams,
      array_agg(distinct ot.id) as team_ids,
      array_agg(distinct ot.name) as team_names
    from public.team_members tm
    join owner_teams ot
      on ot.id = tm.team_id
    left join team_member_counts tmc
      on tmc.team_id = ot.id
    join owner_players_base op
      on op.player_id = tm.player_id
    group by tm.player_id
  ),
  player_tags as (
    select
      optl.player_id,
      jsonb_agg(
        jsonb_build_object(
          'id', opt.id,
          'name', opt.name,
          'color', opt.color
        )
        order by opt.name
      ) as tags,
      array_agg(opt.id order by opt.name) as tag_ids,
      array_agg(opt.name order by opt.name) as tag_names
    from public.owner_player_tag_links optl
    join public.owner_player_tags opt
      on opt.owner_account_id = optl.owner_account_id
     and opt.id = optl.tag_id
    where optl.owner_account_id = p_owner_account_id
    group by optl.player_id
  ),
  players_enriched as (
    select
      op.owner_player_id,
      op.player_id,
      op.owner_roster_status,
      op.source,
      op.first_linked_at,
      coalesce(nullif(btrim(pr.full_name), ''), 'Player') as display_name,
      coalesce(crm.crm_status, 'active') as crm_status,
      coalesce(crm.positions, pr.player_positions, '{}'::text[]) as positions,
      nullif(coalesce(crm.positions[1], pr.player_positions[1]), '') as primary_position,
      nullif(btrim(coalesce(crm.playing_level, pr.playing_level, '')), '') as playing_level,
      nullif(btrim(coalesce(crm.club_name, pr.club_name, '')), '') as club_name,
      coalesce(pt.tags, '[]'::jsonb) as tags,
      coalesce(pt.tag_ids, '{}'::uuid[]) as tag_ids,
      coalesce(pt.tag_names, '{}'::text[]) as tag_names,
      coalesce(pteams.teams, '[]'::jsonb) as teams,
      coalesce(pteams.team_ids, '{}'::uuid[]) as team_ids,
      coalesce(pteams.team_names, '{}'::text[]) as team_names
    from owner_players_base op
    left join lateral (
      select
        p.full_name,
        p.player_positions,
        p.club_name,
        p.playing_level
      from public.profiles p
      where p.user_id = op.player_id
      order by p.updated_at desc nulls last, p.created_at desc nulls last
      limit 1
    ) pr on true
    left join public.owner_player_crm_profiles crm
      on crm.owner_account_id = p_owner_account_id
     and crm.player_id = op.player_id
    left join player_tags pt
      on pt.player_id = op.player_id
    left join player_teams pteams
      on pteams.player_id = op.player_id
  ),
  scoped_activities as (
    select distinct
      a.id,
      a.title,
      a.activity_date,
      a.activity_time,
      a.location,
      a.team_id,
      a.player_id as direct_player_id,
      op.player_id,
      (a.activity_date + coalesce(a.activity_time, time '00:00'))::timestamptz as activity_start
    from public.activities a
    join owner_players_base op
      on (
        a.player_id = op.player_id
        or (
          a.player_id is null
          and a.team_id is null
          and a.user_id = op.player_id
        )
      )

    union

    select distinct
      a.id,
      a.title,
      a.activity_date,
      a.activity_time,
      a.location,
      a.team_id,
      null::uuid as direct_player_id,
      tm.player_id,
      (a.activity_date + coalesce(a.activity_time, time '00:00'))::timestamptz as activity_start
    from public.activities a
    join owner_teams ot
      on ot.id = a.team_id
    join public.team_members tm
      on tm.team_id = ot.id
    join owner_players_base op
      on op.player_id = tm.player_id
  ),
  activity_task_counts as (
    select
      at.activity_id,
      count(*)::integer as total_tasks,
      count(*) filter (where coalesce(at.completed, false))::integer as completed_tasks,
      count(*) filter (where coalesce(at.completed, false) is not true)::integer as open_tasks
    from public.activity_tasks at
    where at.activity_id in (select id from scoped_activities)
    group by at.activity_id
  ),
  activity_unique as (
    select
      sa.id,
      sa.title,
      sa.activity_date,
      sa.activity_time,
      min(sa.activity_start) as activity_start,
      sa.location,
      sa.team_id,
      ot.name as team_name,
      array_agg(distinct sa.player_id) as player_ids,
      count(distinct sa.player_id)::integer as player_count,
      coalesce(max(atc.total_tasks), 0)::integer as total_tasks,
      coalesce(max(atc.completed_tasks), 0)::integer as completed_tasks,
      coalesce(max(atc.open_tasks), 0)::integer as open_tasks
    from scoped_activities sa
    left join owner_teams ot
      on ot.id = sa.team_id
    left join activity_task_counts atc
      on atc.activity_id = sa.id
    group by sa.id, sa.title, sa.activity_date, sa.activity_time, sa.location, sa.team_id, ot.name
  ),
  player_activity_stats as (
    select
      p.player_id,
      max(sa.activity_start) filter (where sa.activity_date <= v_today) as last_activity_at,
      min(sa.activity_start) filter (where sa.activity_date >= v_today) as next_activity_at,
      count(distinct sa.id) filter (where sa.activity_date = v_today)::integer as today_activities_count,
      count(distinct sa.id) filter (where sa.activity_date between v_week_start and v_week_end)::integer as week_activities_count,
      count(distinct sa.id) filter (where sa.activity_date between v_today and (v_today + 13))::integer as upcoming_activities_count,
      coalesce(sum(atc.open_tasks) filter (where sa.activity_date between v_task_cutoff and v_week_end), 0)::integer as open_tasks,
      coalesce(sum(atc.completed_tasks) filter (where sa.activity_date between v_task_cutoff and v_week_end), 0)::integer as completed_tasks,
      coalesce(sum(atc.open_tasks) filter (where sa.activity_date between v_task_cutoff and v_today), 0)::integer as missing_tasks
    from players_enriched p
    left join scoped_activities sa
      on sa.player_id = p.player_id
    left join activity_task_counts atc
      on atc.activity_id = sa.id
    group by p.player_id
  ),
  feedback_events as (
    select
      tr.user_id as player_id,
      tr.created_at,
      'reflection'::text as feedback_type,
      tr.note,
      tr.rating::text as rating_label
    from public.training_reflections tr
    where tr.user_id in (select player_id from owner_players_base)
      and tr.created_at >= v_recent_feedback_cutoff

    union all

    select
      taf.player_id,
      taf.updated_at as created_at,
      'trainer_feedback'::text as feedback_type,
      taf.feedback_text as note,
      null::text as rating_label
    from public.trainer_activity_feedback taf
    where taf.player_id in (select player_id from owner_players_base)
      and taf.trainer_id in (select user_id from staff)
      and taf.updated_at >= v_recent_feedback_cutoff
  ),
  player_feedback_stats as (
    select
      p.player_id,
      count(fe.*)::integer as recent_feedback_count,
      max(fe.created_at) as last_feedback_at
    from players_enriched p
    left join feedback_events fe
      on fe.player_id = p.player_id
    group by p.player_id
  ),
  player_dashboard as (
    select
      p.*,
      pas.last_activity_at,
      pas.next_activity_at,
      coalesce(pas.today_activities_count, 0)::integer as today_activities_count,
      coalesce(pas.week_activities_count, 0)::integer as week_activities_count,
      coalesce(pas.upcoming_activities_count, 0)::integer as upcoming_activities_count,
      coalesce(pas.open_tasks, 0)::integer as open_tasks,
      coalesce(pas.completed_tasks, 0)::integer as completed_tasks,
      coalesce(pas.missing_tasks, 0)::integer as missing_tasks,
      coalesce(pfs.recent_feedback_count, 0)::integer as recent_feedback_count,
      pfs.last_feedback_at,
      (
        pas.last_activity_at is null
        or pas.last_activity_at < v_inactivity_cutoff::timestamptz
      ) as is_inactive,
      coalesce(pas.upcoming_activities_count, 0) = 0 as without_plan,
      case
        when coalesce(pas.open_tasks, 0) + coalesce(pas.completed_tasks, 0) = 0 then null::integer
        else round(
          (coalesce(pas.completed_tasks, 0)::numeric /
            nullif(coalesce(pas.open_tasks, 0) + coalesce(pas.completed_tasks, 0), 0)) * 100
        )::integer
      end as task_completion_rate
    from players_enriched p
    left join player_activity_stats pas
      on pas.player_id = p.player_id
    left join player_feedback_stats pfs
      on pfs.player_id = p.player_id
  ),
  alert_rows as (
    select
      'missing_tasks'::text as type,
      case when pd.missing_tasks >= 3 then 'high' else 'warning' end as severity,
      case when pd.missing_tasks >= 3 then 1 else 2 end as severity_rank,
      pd.player_id,
      pd.display_name,
      pd.team_ids,
      pd.team_names,
      pd.missing_tasks as count,
      pd.last_activity_at as occurred_at,
      'Missing tasks'::text as title,
      format('%s has %s unfinished task%s.', pd.display_name, pd.missing_tasks, case when pd.missing_tasks = 1 then '' else 's' end) as subtitle
    from player_dashboard pd
    where pd.missing_tasks > 0

    union all

    select
      'inactive_player'::text,
      'warning'::text,
      2,
      pd.player_id,
      pd.display_name,
      pd.team_ids,
      pd.team_names,
      1,
      pd.last_activity_at,
      'Inactive player'::text,
      case
        when pd.last_activity_at is null then format('%s has no logged activity yet.', pd.display_name)
        else format('%s has not had activity since %s.', pd.display_name, to_char(pd.last_activity_at, 'YYYY-MM-DD'))
      end
    from player_dashboard pd
    where pd.is_inactive

    union all

    select
      'new_feedback'::text,
      'info'::text,
      3,
      pd.player_id,
      pd.display_name,
      pd.team_ids,
      pd.team_names,
      pd.recent_feedback_count,
      pd.last_feedback_at,
      'New feedback'::text,
      format('%s has %s new feedback item%s.', pd.display_name, pd.recent_feedback_count, case when pd.recent_feedback_count = 1 then '' else 's' end)
    from player_dashboard pd
    where pd.recent_feedback_count > 0

    union all

    select
      'upcoming_session'::text,
      'info'::text,
      4,
      pd.player_id,
      pd.display_name,
      pd.team_ids,
      pd.team_names,
      1,
      pd.next_activity_at,
      'Upcoming session'::text,
      format('%s has a session coming up.', pd.display_name)
    from player_dashboard pd
    where pd.next_activity_at is not null
      and pd.next_activity_at < (v_now + interval '3 days')

    union all

    select
      'no_plan'::text,
      'warning'::text,
      2,
      pd.player_id,
      pd.display_name,
      pd.team_ids,
      pd.team_names,
      1,
      null::timestamptz,
      'No plan'::text,
      format('%s has no upcoming activities in the next 14 days.', pd.display_name)
    from player_dashboard pd
    where pd.without_plan
  ),
  alerts_limited as (
    select *
    from alert_rows
    order by severity_rank asc, occurred_at desc nulls last, display_name asc
    limit 50
  ),
  player_payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'ownerPlayerId', pd.owner_player_id,
      'playerId', pd.player_id,
      'displayName', pd.display_name,
      'ownerRosterStatus', pd.owner_roster_status,
      'source', pd.source,
      'crmStatus', pd.crm_status,
      'positions', pd.positions,
      'primaryPosition', pd.primary_position,
      'playingLevel', pd.playing_level,
      'clubName', pd.club_name,
      'tags', pd.tags,
      'tagIds', pd.tag_ids,
      'teams', pd.teams,
      'teamIds', pd.team_ids,
      'lastActivityAt', pd.last_activity_at,
      'nextActivityAt', pd.next_activity_at,
      'todayActivitiesCount', pd.today_activities_count,
      'weekActivitiesCount', pd.week_activities_count,
      'upcomingActivitiesCount', pd.upcoming_activities_count,
      'openTasks', pd.open_tasks,
      'completedTasks', pd.completed_tasks,
      'missingTasks', pd.missing_tasks,
      'taskCompletionRate', pd.task_completion_rate,
      'recentFeedbackCount', pd.recent_feedback_count,
      'lastFeedbackAt', pd.last_feedback_at,
      'isInactive', pd.is_inactive,
      'withoutPlan', pd.without_plan,
      'alertTypes', array_remove(array[
        case when pd.missing_tasks > 0 then 'missing_tasks' end,
        case when pd.is_inactive then 'inactive_player' end,
        case when pd.recent_feedback_count > 0 then 'new_feedback' end,
        case when pd.next_activity_at is not null and pd.next_activity_at < (v_now + interval '3 days') then 'upcoming_session' end,
        case when pd.without_plan then 'no_plan' end
      ], null),
      'quickActions', jsonb_build_array(
        jsonb_build_object('type', 'profile', 'label', 'Profile', 'target', 'player_crm', 'playerId', pd.player_id),
        jsonb_build_object('type', 'tasks', 'label', 'Tasks', 'target', 'tasks', 'playerId', pd.player_id),
        jsonb_build_object('type', 'reports', 'label', 'Reports', 'target', 'performance', 'playerId', pd.player_id),
        jsonb_build_object('type', 'program', 'label', 'Program', 'target', 'programs', 'playerId', pd.player_id),
        jsonb_build_object('type', 'goals', 'label', 'Goals', 'target', 'goals', 'playerId', pd.player_id),
        jsonb_build_object('type', 'chat', 'label', 'Chat', 'target', 'chat', 'playerId', pd.player_id)
      )
    ) order by
      case when pd.missing_tasks > 0 then 0 else 1 end,
      pd.is_inactive desc,
      pd.without_plan desc,
      pd.display_name asc), '[]'::jsonb) as players
    from player_dashboard pd
  ),
  metrics_payload as (
    select jsonb_build_object(
      'totalPlayers', count(*)::integer,
      'activePlayers', count(*) filter (where crm_status = 'active')::integer,
      'trialPlayers', count(*) filter (where crm_status = 'trial')::integer,
      'pausedPlayers', count(*) filter (where crm_status = 'paused')::integer,
      'formerPlayers', count(*) filter (where crm_status = 'former')::integer,
      'playersMissingTasks', count(*) filter (where missing_tasks > 0)::integer,
      'inactivePlayers', count(*) filter (where is_inactive)::integer,
      'playersWithoutPlan', count(*) filter (where without_plan)::integer,
      'newFeedback', coalesce(sum(recent_feedback_count), 0)::integer,
      'todayActivities', (select count(*)::integer from activity_unique where activity_date = v_today),
      'weekActivities', (select count(*)::integer from activity_unique where activity_date between v_week_start and v_week_end),
      'upcomingSessions', (select count(*)::integer from activity_unique where activity_date between v_today and v_week_end),
      'openTasks', coalesce(sum(open_tasks), 0)::integer,
      'completedTasks', coalesce(sum(completed_tasks), 0)::integer,
      'taskCompletionRate', case
        when coalesce(sum(open_tasks), 0) + coalesce(sum(completed_tasks), 0) = 0 then null
        else round(
          (coalesce(sum(completed_tasks), 0)::numeric /
            nullif(coalesce(sum(open_tasks), 0) + coalesce(sum(completed_tasks), 0), 0)) * 100
        )::integer
      end
    ) as metrics
    from player_dashboard
  ),
  today_payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', au.id,
      'title', au.title,
      'activityDate', au.activity_date,
      'activityTime', au.activity_time,
      'activityStart', au.activity_start,
      'location', au.location,
      'teamId', au.team_id,
      'teamName', au.team_name,
      'playerIds', au.player_ids,
      'playerCount', au.player_count,
      'totalTasks', au.total_tasks,
      'completedTasks', au.completed_tasks,
      'openTasks', au.open_tasks
    ) order by au.activity_start asc), '[]'::jsonb) as activities
    from activity_unique au
    where au.activity_date = v_today
  ),
  week_payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', au.id,
      'title', au.title,
      'activityDate', au.activity_date,
      'activityTime', au.activity_time,
      'activityStart', au.activity_start,
      'location', au.location,
      'teamId', au.team_id,
      'teamName', au.team_name,
      'playerIds', au.player_ids,
      'playerCount', au.player_count,
      'totalTasks', au.total_tasks,
      'completedTasks', au.completed_tasks,
      'openTasks', au.open_tasks
    ) order by au.activity_start asc), '[]'::jsonb) as activities
    from (
      select *
      from activity_unique
      where activity_date between v_week_start and v_week_end
      order by activity_start asc
      limit 40
    ) au
  ),
  alerts_payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', concat(type, ':', player_id),
      'type', type,
      'severity', severity,
      'title', title,
      'subtitle', subtitle,
      'playerId', player_id,
      'playerName', display_name,
      'teamIds', team_ids,
      'teamNames', team_names,
      'count', count,
      'occurredAt', occurred_at,
      'action', jsonb_build_object('target', 'player_crm', 'playerId', player_id)
    ) order by severity_rank asc, occurred_at desc nulls last, display_name asc), '[]'::jsonb) as alerts
    from alerts_limited
  ),
  filters_payload as (
    select jsonb_build_object(
      'statuses', jsonb_build_array(
        jsonb_build_object('value', 'active', 'label', 'Active'),
        jsonb_build_object('value', 'trial', 'label', 'Trial'),
        jsonb_build_object('value', 'paused', 'label', 'Paused'),
        jsonb_build_object('value', 'former', 'label', 'Former')
      ),
      'teams', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ot.id,
          'name', ot.name,
          'description', ot.description,
          'memberCount', coalesce(tmc.member_count, 0)
        ) order by ot.name)
        from owner_teams ot
        left join team_member_counts tmc
          on tmc.team_id = ot.id
      ), '[]'::jsonb),
      'tags', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', opt.id,
          'name', opt.name,
          'color', opt.color
        ) order by opt.name)
        from public.owner_player_tags opt
        where opt.owner_account_id = p_owner_account_id
      ), '[]'::jsonb),
      'levels', coalesce((
        select jsonb_agg(distinct playing_level)
        from player_dashboard
        where playing_level is not null
      ), '[]'::jsonb),
      'positions', coalesce((
        select jsonb_agg(distinct position)
        from player_dashboard pd,
        lateral unnest(pd.positions) as position
        where nullif(btrim(position), '') is not null
      ), '[]'::jsonb)
    ) as filters
  )
  select jsonb_build_object(
    'ownerAccount', jsonb_build_object(
      'ownerAccountId', v_owner.id,
      'ownerType', v_owner.owner_type,
      'name', v_owner.name,
      'status', v_owner.status,
      'coachAccountId', v_owner.coach_account_id,
      'clubId', v_owner.club_id
    ),
    'actor', jsonb_build_object(
      'userId', p_actor_user_id,
      'roles', public.get_owner_account_roles(p_owner_account_id, p_actor_user_id),
      'canManageOwner', public.is_owner_account_admin(p_owner_account_id, p_actor_user_id),
      'canCoach', true
    ),
    'generatedAt', v_now,
    'window', jsonb_build_object(
      'today', v_today,
      'weekStart', v_week_start,
      'weekEnd', v_week_end,
      'inactivityCutoff', v_inactivity_cutoff,
      'recentFeedbackCutoff', v_recent_feedback_cutoff,
      'taskCutoff', v_task_cutoff
    ),
    'seatStatus', public.get_owner_seat_status_payload(p_owner_account_id),
    'metrics', mp.metrics,
    'alerts', ap.alerts,
    'today', jsonb_build_object('activities', tp.activities),
    'week', jsonb_build_object('activities', wp.activities),
    'players', pp.players,
    'filters', fp.filters
  )
    into v_payload
  from metrics_payload mp
  cross join alerts_payload ap
  cross join today_payload tp
  cross join week_payload wp
  cross join player_payload pp
  cross join filters_payload fp;

  return v_payload;
end;
$$;

revoke all on function public.get_owner_coach_dashboard_payload(uuid, uuid, timestamptz) from public;
grant execute on function public.get_owner_coach_dashboard_payload(uuid, uuid, timestamptz) to authenticated, service_role;

comment on function public.get_owner_coach_dashboard_payload(uuid, uuid, timestamptz) is
  'Returns the owner-scoped coach dashboard payload for issue #282: players, alerts, activities, task completion, feedback, filters and seat status.';
