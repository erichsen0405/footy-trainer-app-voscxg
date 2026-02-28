alter table if exists public.activity_tasks
  add column if not exists after_training_enabled boolean not null default false,
  add column if not exists after_training_delay_minutes integer,
  add column if not exists task_duration_enabled boolean not null default false,
  add column if not exists task_duration_minutes integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'activity_tasks_after_training_delay_minutes_check'
  ) then
    alter table public.activity_tasks
      add constraint activity_tasks_after_training_delay_minutes_check
      check (
        after_training_delay_minutes is null
        or (after_training_delay_minutes >= 0 and after_training_delay_minutes <= 600)
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'activity_tasks_task_duration_minutes_check'
  ) then
    alter table public.activity_tasks
      add constraint activity_tasks_task_duration_minutes_check
      check (
        task_duration_minutes is null
        or (task_duration_minutes >= 0 and task_duration_minutes <= 600)
      );
  end if;
end $$;
