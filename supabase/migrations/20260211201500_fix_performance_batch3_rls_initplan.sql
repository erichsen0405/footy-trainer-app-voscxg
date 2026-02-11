-- Issue #149 performance batch 3
-- Fix remaining high-count auth_rls_initplan warnings by rewriting policy expressions:
--   auth.uid() -> (select auth.uid())
--   auth.jwt() -> (select auth.jwt())

do $$
declare
  pol record;
  new_qual text;
  new_with_check text;
  roles_clause text;
  create_sql text;
begin
  for pol in
    select
      p.schemaname,
      p.tablename,
      p.policyname,
      p.permissive,
      p.cmd,
      p.roles,
      p.qual,
      p.with_check
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename in (
        'category_mappings',
        'local_event_meta',
        'hidden_task_templates',
        'teams',
        'exercise_subtasks',
        'activity_task_subtasks',
        'task_template_subtasks',
        'tasks',
        'admin_player_relationships',
        'hidden_activity_categories',
        'training_reflections',
        'team_members',
        'subscriptions',
        'user_roles',
        'player_invitations',
        'events_external',
        'task_template_self_feedback'
      )
  loop
    new_qual :=
      case
        when pol.qual is null then null
        else replace(replace(pol.qual, 'auth.uid()', '(select auth.uid())'), 'auth.jwt()', '(select auth.jwt())')
      end;

    new_with_check :=
      case
        when pol.with_check is null then null
        else replace(replace(pol.with_check, 'auth.uid()', '(select auth.uid())'), 'auth.jwt()', '(select auth.jwt())')
      end;

    if new_qual is not distinct from pol.qual
       and new_with_check is not distinct from pol.with_check then
      continue;
    end if;

    select string_agg(quote_ident(r), ', ')
    into roles_clause
    from unnest(pol.roles) as r;

    execute format(
      'drop policy %I on %I.%I',
      pol.policyname,
      pol.schemaname,
      pol.tablename
    );

    create_sql := format(
      'create policy %I on %I.%I as %s for %s to %s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      pol.permissive,
      upper(pol.cmd),
      coalesce(roles_clause, 'public')
    );

    if new_qual is not null then
      create_sql := create_sql || format(' using (%s)', new_qual);
    end if;

    if new_with_check is not null then
      create_sql := create_sql || format(' with check (%s)', new_with_check);
    end if;

    execute create_sql;
  end loop;
end
$$;
