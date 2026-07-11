alter table if exists public.task_templates
  add column if not exists focus_areas text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'task_templates_focus_areas_max_12'
      and conrelid = 'public.task_templates'::regclass
  ) then
    alter table public.task_templates
      add constraint task_templates_focus_areas_max_12
      check (cardinality(focus_areas) <= 12);
  end if;
end $$;

create index if not exists task_templates_focus_areas_gin_idx
  on public.task_templates using gin (focus_areas);
