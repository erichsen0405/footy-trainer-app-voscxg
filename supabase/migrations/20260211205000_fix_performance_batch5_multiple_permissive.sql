-- Issue #149 performance batch 5
-- Consolidate multiple PERMISSIVE RLS policies into one per (table, command, roles)
-- for highest-volume tables in Security Advisor.
-- Semantics are preserved by OR-combining USING / WITH CHECK expressions.

do $$
declare
  grp record;
  pol record;
  roles_clause text;
  new_policy_name text;
  using_expr text;
  check_expr text;
  create_sql text;
begin
  for grp in
    with groups as (
      select
        p.schemaname,
        p.tablename,
        p.cmd,
        p.roles,
        count(*) as policy_count,
        bool_or(p.qual is null) as has_unrestricted_using,
        bool_or(p.with_check is null) as has_unrestricted_check,
        string_agg('(' || p.qual || ')', ' OR ') filter (where p.qual is not null) as using_or,
        string_agg('(' || p.with_check || ')', ' OR ') filter (where p.with_check is not null) as check_or
      from pg_policies p
      where p.schemaname = 'public'
        and p.permissive = 'PERMISSIVE'
        and p.tablename in (
          'external_event_tasks',
          'events_local_meta',
          'activities',
          'player_invitations',
          'exercise_assignments',
          'activity_categories',
          'task_templates',
          'task_template_categories'
        )
      group by p.schemaname, p.tablename, p.cmd, p.roles
      having count(*) > 1
    )
    select * from groups
  loop
    select string_agg(quote_ident(r), ', ')
      into roles_clause
    from unnest(grp.roles) as r;

    new_policy_name :=
      left(
        format(
          'mp_%s_%s_%s',
          grp.tablename,
          lower(grp.cmd),
          substr(md5(array_to_string(grp.roles, ',')), 1, 8)
        ),
        63
      );

    using_expr :=
      case
        when grp.has_unrestricted_using then 'true'
        else grp.using_or
      end;

    check_expr :=
      case
        when grp.has_unrestricted_check then 'true'
        else grp.check_or
      end;

    -- Remove old policies in the group.
    for pol in
      select p.policyname
      from pg_policies p
      where p.schemaname = grp.schemaname
        and p.tablename = grp.tablename
        and p.permissive = 'PERMISSIVE'
        and p.cmd = grp.cmd
        and p.roles = grp.roles
    loop
      execute format(
        'drop policy %I on %I.%I',
        pol.policyname,
        grp.schemaname,
        grp.tablename
      );
    end loop;

    execute format(
      'drop policy if exists %I on %I.%I',
      new_policy_name,
      grp.schemaname,
      grp.tablename
    );

    create_sql := format(
      'create policy %I on %I.%I as permissive for %s to %s',
      new_policy_name,
      grp.schemaname,
      grp.tablename,
      upper(grp.cmd),
      coalesce(roles_clause, 'public')
    );

    if upper(grp.cmd) in ('SELECT', 'UPDATE', 'DELETE', 'ALL') and using_expr is not null then
      create_sql := create_sql || format(' using (%s)', using_expr);
    end if;

    if upper(grp.cmd) in ('INSERT', 'UPDATE', 'ALL') and check_expr is not null then
      create_sql := create_sql || format(' with check (%s)', check_expr);
    end if;

    execute create_sql;
  end loop;
end
$$;
