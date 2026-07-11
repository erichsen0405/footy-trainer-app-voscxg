alter table if exists public.activity_tasks
  add column if not exists training_template_id uuid references public.training_templates(id) on delete set null,
  add column if not exists training_template_type text,
  add column if not exists exercise_timer jsonb;

alter table if exists public.external_event_tasks
  add column if not exists training_template_id uuid references public.training_templates(id) on delete set null,
  add column if not exists training_template_type text,
  add column if not exists exercise_timer jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'activity_tasks_training_template_type_chk'
  ) then
    alter table public.activity_tasks
      add constraint activity_tasks_training_template_type_chk
      check (
        training_template_type is null
        or training_template_type in ('task', 'exercise', 'session', 'week')
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'external_event_tasks_training_template_type_chk'
  ) then
    alter table public.external_event_tasks
      add constraint external_event_tasks_training_template_type_chk
      check (
        training_template_type is null
        or training_template_type in ('task', 'exercise', 'session', 'week')
      );
  end if;
end $$;

create unique index if not exists activity_tasks_unique_training_template
  on public.activity_tasks (activity_id, training_template_id)
  where training_template_id is not null;

create unique index if not exists external_event_tasks_unique_training_template
  on public.external_event_tasks (local_meta_id, training_template_id)
  where training_template_id is not null;

create index if not exists activity_tasks_training_template_idx
  on public.activity_tasks (training_template_id)
  where training_template_id is not null;

create index if not exists external_event_tasks_training_template_idx
  on public.external_event_tasks (training_template_id)
  where training_template_id is not null;
