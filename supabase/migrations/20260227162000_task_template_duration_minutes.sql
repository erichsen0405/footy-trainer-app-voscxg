alter table if exists public.task_templates
  add column if not exists task_duration_enabled boolean not null default false,
  add column if not exists task_duration_minutes integer;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_task_duration_minutes_check'
      and conrelid = 'public.task_templates'::regclass
  ) then
    alter table public.task_templates
      add constraint task_templates_task_duration_minutes_check
      check (
        task_duration_minutes is null
        or (task_duration_minutes >= 0 and task_duration_minutes <= 600)
      );
  end if;
end $$;
