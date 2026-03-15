-- Keep weekly_performance aligned with real activity history.
-- Fixes stale trophy weeks that can survive after activities are moved or deleted.

create or replace function public.update_weekly_performance(
  p_user_id uuid,
  p_week_number integer,
  p_year integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stats record;
begin
  if p_user_id is null or p_week_number is null or p_year is null then
    return;
  end if;

  select *
  into v_stats
  from public.calculate_weekly_performance(p_user_id, p_week_number, p_year);

  if coalesce(v_stats.total_tasks, 0) <= 0 then
    delete from public.weekly_performance
    where user_id = p_user_id
      and week_number = p_week_number
      and year = p_year;
    return;
  end if;

  insert into public.weekly_performance (
    user_id,
    week_number,
    year,
    trophy_type,
    percentage,
    completed_tasks,
    total_tasks
  )
  values (
    p_user_id,
    p_week_number,
    p_year,
    v_stats.trophy_type,
    v_stats.percentage,
    v_stats.completed_tasks,
    v_stats.total_tasks
  )
  on conflict (user_id, week_number, year)
  do update set
    trophy_type = excluded.trophy_type,
    percentage = excluded.percentage,
    completed_tasks = excluded.completed_tasks,
    total_tasks = excluded.total_tasks;
end;
$$;

create or replace function public.trigger_update_weekly_performance_from_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_week integer;
  v_old_year integer;
  v_new_week integer;
  v_new_year integer;
begin
  if tg_op = 'DELETE' then
    perform public.update_weekly_performance(
      old.user_id,
      extract(week from old.activity_date)::integer,
      extract(year from old.activity_date)::integer
    );
    return old;
  end if;

  v_new_week := extract(week from new.activity_date)::integer;
  v_new_year := extract(year from new.activity_date)::integer;

  if tg_op = 'UPDATE' then
    v_old_week := extract(week from old.activity_date)::integer;
    v_old_year := extract(year from old.activity_date)::integer;

    if old.user_id is distinct from new.user_id
      or old.activity_date is distinct from new.activity_date then
      perform public.update_weekly_performance(old.user_id, v_old_week, v_old_year);
    end if;
  end if;

  perform public.update_weekly_performance(new.user_id, v_new_week, v_new_year);
  return new;
end;
$$;

drop trigger if exists on_activity_changed_update_weekly_performance on public.activities;

create trigger on_activity_changed_update_weekly_performance
after delete or update of user_id, activity_date
on public.activities
for each row
execute function public.trigger_update_weekly_performance_from_activity();

do $$
declare
  v_scope record;
begin
  for v_scope in (
    select distinct scoped.user_id, scoped.week_number, scoped.year
    from (
      select
        wp.user_id,
        wp.week_number,
        wp.year
      from public.weekly_performance wp

      union

      select
        a.user_id,
        extract(week from a.activity_date)::integer as week_number,
        extract(year from a.activity_date)::integer as year
      from public.activities a
    ) scoped
    where scoped.user_id is not null
  ) loop
    perform public.update_weekly_performance(
      v_scope.user_id,
      v_scope.week_number,
      v_scope.year
    );
  end loop;
end;
$$;
