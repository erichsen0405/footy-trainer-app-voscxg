-- Hard-delete all user owned data so the delete-account edge function can safely remove auth users
create or replace function public.delete_user_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  task_alias_placeholder constant text := '__TASK_ALIAS__';
  task_scope_conditions text;
  task_scope_subquery text;
  task_scope_conditions_for_delete text;
  template_scope_subquery text;
  activity_scope_subquery text;
  tasks_has_player_id boolean := false;
  tasks_has_team_id boolean := false;
  tasks_has_activity_id boolean := false;
  tasks_has_task_template_id boolean := false;
  fk_task record;
  fk_template record;
  fk_activity record;
begin
  if p_user_id is null then
    raise exception 'p_user_id must not be null';
  end if;

  delete from public.activity_task_subtasks ast
  using public.activity_tasks at
  join public.activities a on a.id = at.activity_id
  where ast.activity_task_id = at.id
    and (
      a.user_id = p_user_id
      or a.player_id = p_user_id
      or a.team_id in (
        select id from public.teams where admin_id = p_user_id
      )
    );

  delete from public.activity_tasks at
  using public.activities a
  where at.activity_id = a.id
    and (
      a.user_id = p_user_id
      or a.player_id = p_user_id
      or a.team_id in (
        select id from public.teams where admin_id = p_user_id
      )
    );

  delete from public.task_template_self_feedback ttsf
  where ttsf.user_id = p_user_id
     or exists (
       select 1
       from public.activities a
       where a.id = ttsf.activity_id
         and (
           a.user_id = p_user_id
           or a.player_id = p_user_id
           or a.team_id in (
             select id from public.teams where admin_id = p_user_id
           )
         )
     )
     or exists (
       select 1
       from public.task_templates tt
       where tt.id = ttsf.task_template_id
         and (
           tt.user_id = p_user_id
           or tt.player_id = p_user_id
           or tt.team_id in (
             select id from public.teams where admin_id = p_user_id
           )
         )
     );

  delete from public.training_reflections tr
  where tr.user_id = p_user_id
     or exists (
       select 1
       from public.activities a
       where a.id = tr.activity_id
         and (
           a.user_id = p_user_id
           or a.player_id = p_user_id
           or a.team_id in (
             select id from public.teams where admin_id = p_user_id
           )
         )
     );

  if to_regclass('public.tasks') is not null then
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'user_id'
    ) then
      raise exception 'public.tasks must contain a user_id column for delete_user_account';
    end if;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'player_id'
    ) into tasks_has_player_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'team_id'
    ) into tasks_has_team_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'activity_id'
    ) into tasks_has_activity_id;

    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tasks'
        and column_name = 'task_template_id'
    ) into tasks_has_task_template_id;

    task_scope_conditions := format('%s.user_id = $1', task_alias_placeholder);

    if tasks_has_player_id then
      task_scope_conditions := task_scope_conditions || format(' or %s.player_id = $1', task_alias_placeholder);
    end if;

    if tasks_has_team_id then
      task_scope_conditions := task_scope_conditions || format(
        ' or %s.team_id in (select id from public.teams where admin_id = $1)',
        task_alias_placeholder
      );
    end if;

    if tasks_has_activity_id then
      task_scope_conditions := task_scope_conditions || format(
        ' or exists (select 1 from public.activities a where a.id = %s.activity_id and (a.user_id = $1 or a.player_id = $1 or a.team_id in (select id from public.teams where admin_id = $1)))',
        task_alias_placeholder
      );
    end if;

    if tasks_has_task_template_id then
      task_scope_conditions := task_scope_conditions || format(
        ' or exists (select 1 from public.task_templates tt where tt.id = %s.task_template_id and (tt.user_id = $1 or tt.player_id = $1 or tt.team_id in (select id from public.teams where admin_id = $1)))',
        task_alias_placeholder
      );
    end if;

    task_scope_subquery :=
      'select task_candidates.id from public.tasks task_candidates where '
      || replace(task_scope_conditions, task_alias_placeholder, 'task_candidates');
    task_scope_conditions_for_delete := replace(task_scope_conditions, task_alias_placeholder, 'task_records');

    for fk_task in (
      select
        nsp.nspname as schema_name,
        cls.relname as table_name,
        att.attname as column_name
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = cls.relnamespace
      join lateral unnest(con.conkey) as fkcols(attnum) on true
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = fkcols.attnum
      where con.confrelid = 'public.tasks'::regclass
        and con.contype = 'f'
        and array_length(con.conkey, 1) = 1
    ) loop
      execute format(
        'delete from %I.%I child where child.%I in (%s)',
        fk_task.schema_name,
        fk_task.table_name,
        fk_task.column_name,
        task_scope_subquery
      ) using p_user_id;
    end loop;

    execute format(
      'delete from public.tasks task_records where %s',
      task_scope_conditions_for_delete
    ) using p_user_id;
  end if;

  delete from public.external_event_tasks eet
  using public.events_local_meta elm
  where eet.local_meta_id = elm.id
    and (
      elm.user_id = p_user_id
      or elm.player_id = p_user_id
      or elm.team_id in (
        select id from public.teams where admin_id = p_user_id
      )
    );

  delete from public.events_local_meta
  where user_id = p_user_id
     or player_id = p_user_id
     or team_id in (
       select id from public.teams where admin_id = p_user_id
     );

  delete from public.local_event_meta
  where user_id = p_user_id
     or category_id in (
       select id from public.activity_categories
       where user_id = p_user_id
          or player_id = p_user_id
          or team_id in (
            select id from public.teams where admin_id = p_user_id
          )
     );

  delete from public.event_sync_log
  where user_id = p_user_id;

  delete from public.external_calendars
  where user_id = p_user_id;

  delete from public.category_mappings
  where user_id = p_user_id;

  delete from public.hidden_activity_categories
  where user_id = p_user_id
     or category_id in (
       select id from public.activity_categories
       where user_id = p_user_id
          or player_id = p_user_id
          or team_id in (
            select id from public.teams where admin_id = p_user_id
          )
     );

  delete from public.task_template_subtasks
  where task_template_id in (
    select id from public.task_templates
    where user_id = p_user_id
       or player_id = p_user_id
       or team_id in (
         select id from public.teams where admin_id = p_user_id
       )
  );

  delete from public.task_template_categories
  where task_template_id in (
    select id from public.task_templates
    where user_id = p_user_id
       or player_id = p_user_id
       or team_id in (
         select id from public.teams where admin_id = p_user_id
       )
  )
     or category_id in (
    select id from public.activity_categories
    where user_id = p_user_id
       or player_id = p_user_id
       or team_id in (
         select id from public.teams where admin_id = p_user_id
       )
  );

  delete from public.hidden_task_templates
  where user_id = p_user_id
     or task_template_id in (
       select id from public.task_templates
       where user_id = p_user_id
          or player_id = p_user_id
          or team_id in (
            select id from public.teams where admin_id = p_user_id
          )
     );

  delete from public.user_entitlements
  where user_id = p_user_id;

  delete from public.exercise_assignments
  where trainer_id = p_user_id
     or player_id = p_user_id
     or team_id in (
       select id from public.teams where admin_id = p_user_id
     )
     or exercise_id in (
       select id from public.exercise_library
       where trainer_id = p_user_id
     );

  delete from public.exercise_subtasks es
  using public.exercise_library el
  where es.exercise_id = el.id
    and el.trainer_id = p_user_id;

  delete from public.exercise_library
  where trainer_id = p_user_id;

  delete from public.admin_player_relationships
  where admin_id = p_user_id
     or player_id = p_user_id;

  delete from public.player_invitations
  where admin_id = p_user_id
     or player_id = p_user_id;

  delete from public.team_members
  where player_id = p_user_id
     or team_id in (
       select id from public.teams where admin_id = p_user_id
     );

  delete from public.subscriptions
  where admin_id = p_user_id;

  delete from public.trophies
  where user_id = p_user_id;

  delete from public.weekly_performance
  where user_id = p_user_id
     or player_id = p_user_id
     or team_id in (
       select id from public.teams where admin_id = p_user_id
     );

  template_scope_subquery :=
    'select template_candidates.id from public.task_templates template_candidates '
    || 'where template_candidates.user_id = $1 '
    || 'or template_candidates.player_id = $1 '
    || 'or template_candidates.team_id in (select id from public.teams where admin_id = $1)';

  for fk_template in (
    select
      nsp.nspname as schema_name,
      cls.relname as table_name,
      att.attname as column_name
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    join lateral unnest(con.conkey) as fkcols(attnum) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = fkcols.attnum
    where con.confrelid = 'public.task_templates'::regclass
      and con.contype = 'f'
      and array_length(con.conkey, 1) = 1
  ) loop
    execute format(
      'delete from %I.%I child where child.%I in (%s)',
      fk_template.schema_name,
      fk_template.table_name,
      fk_template.column_name,
      template_scope_subquery
    ) using p_user_id;
  end loop;

  delete from public.task_templates
  where user_id = p_user_id
     or player_id = p_user_id
     or team_id in (
       select id from public.teams where admin_id = p_user_id
     );

  activity_scope_subquery :=
    'select activity_candidates.id from public.activities activity_candidates '
    || 'where activity_candidates.user_id = $1 '
    || 'or activity_candidates.player_id = $1 '
    || 'or activity_candidates.team_id in (select id from public.teams where admin_id = $1)';

  for fk_activity in (
    select
      nsp.nspname as schema_name,
      cls.relname as table_name,
      att.attname as column_name
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = cls.relnamespace
    join lateral unnest(con.conkey) as fkcols(attnum) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = fkcols.attnum
    where con.confrelid = 'public.activities'::regclass
      and con.contype = 'f'
      and array_length(con.conkey, 1) = 1
  ) loop
    execute format(
      'delete from %I.%I child where child.%I in (%s)',
      fk_activity.schema_name,
      fk_activity.table_name,
      fk_activity.column_name,
      activity_scope_subquery
    ) using p_user_id;
  end loop;

  delete from public.activities
  where user_id = p_user_id
     or player_id = p_user_id
     or team_id in (
       select id from public.teams where admin_id = p_user_id
     );

  delete from public.activity_series
  where user_id = p_user_id
     or player_id = p_user_id
     or team_id in (
       select id from public.teams where admin_id = p_user_id
     );

  delete from public.activity_categories
  where user_id = p_user_id
     or player_id = p_user_id
     or team_id in (
       select id from public.teams where admin_id = p_user_id
     );

  delete from public.teams
  where admin_id = p_user_id;

  delete from public.profiles
  where user_id = p_user_id;

  delete from public.user_roles
  where user_id = p_user_id;
end;
$$;

revoke all on function public.delete_user_account(uuid) from public;
grant execute on function public.delete_user_account(uuid) to service_role;
grant execute on function public.delete_user_account(uuid) to supabase_admin;
comment on function public.delete_user_account(uuid) is 'Deletes all first-party user data so the edge function can follow up with auth.admin.deleteUser.';
