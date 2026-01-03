create extension if not exists pgcrypto;

create table if not exists public.training_reflections (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null,
    activity_id uuid not null,
    category_id uuid not null,
    rating integer not null,
    note text null,
    created_at timestamptz not null default now(),
    constraint training_reflections_rating_check check (rating between 1 and 10)
);

alter table if exists public.training_reflections
    drop constraint if exists training_reflections_user_id_fkey,
    add constraint training_reflections_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

do $$
begin
    if to_regclass('public.activities') is not null then
        alter table public.training_reflections
            drop constraint if exists training_reflections_activity_id_fkey,
            add constraint training_reflections_activity_id_fkey foreign key (activity_id) references public.activities (id) on delete cascade;
    end if;
end
$$;

do $$
begin
    if to_regclass('public.categories') is not null then
        alter table public.training_reflections
            drop constraint if exists training_reflections_category_id_fkey,
            add constraint training_reflections_category_id_fkey foreign key (category_id) references public.categories (id) on delete cascade;
    end if;
end
$$;

create index if not exists training_reflections_user_category_created_at_idx
    on public.training_reflections (user_id, category_id, created_at desc);

alter table if exists public.training_reflections enable row level security;

drop policy if exists "training_reflections_select_own" on public.training_reflections;
create policy "training_reflections_select_own"
    on public.training_reflections
    for select
    using (auth.uid() = user_id);

drop policy if exists "training_reflections_insert_own" on public.training_reflections;
create policy "training_reflections_insert_own"
    on public.training_reflections
    for insert
    with check (auth.uid() = user_id);

drop policy if exists "training_reflections_update_own" on public.training_reflections;
create policy "training_reflections_update_own"
    on public.training_reflections
    for update
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

do $$
begin
  if to_regclass('public.task_templates') is not null then
    execute 'alter table public.task_templates add column if not exists after_training_enabled boolean not null default false';
    execute 'alter table public.task_templates add column if not exists after_training_delay_minutes integer';

    if not exists (
      select 1
      from pg_constraint
      where conname = 'task_templates_after_training_delay_chk'
        and conrelid = 'public.task_templates'::regclass
    ) then
      execute 'alter table public.task_templates
               add constraint task_templates_after_training_delay_chk
               check (after_training_delay_minutes is null or after_training_delay_minutes between 1 and 240)';
    end if;
  end if;
end $$;
