create table if not exists public.task_template_category_periods (
  id uuid primary key default gen_random_uuid(),
  task_template_id uuid not null references public.task_templates (id) on delete cascade,
  category_id uuid not null references public.activity_categories (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_template_category_periods_order_chk
    check (removed_at is null or removed_at >= assigned_at)
);

create index if not exists task_template_category_periods_template_idx
  on public.task_template_category_periods (task_template_id, category_id, assigned_at);

create unique index if not exists task_template_category_periods_open_uidx
  on public.task_template_category_periods (task_template_id, category_id)
  where removed_at is null;

create table if not exists public.task_template_archive_periods (
  id uuid primary key default gen_random_uuid(),
  task_template_id uuid not null references public.task_templates (id) on delete cascade,
  archived_at timestamptz not null,
  reactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_template_archive_periods_order_chk
    check (reactivated_at is null or reactivated_at >= archived_at)
);

create index if not exists task_template_archive_periods_template_idx
  on public.task_template_archive_periods (task_template_id, archived_at);

create unique index if not exists task_template_archive_periods_open_uidx
  on public.task_template_archive_periods (task_template_id)
  where reactivated_at is null;

insert into public.task_template_category_periods (
  task_template_id,
  category_id,
  assigned_at,
  created_at,
  updated_at
)
select
  ttc.task_template_id,
  ttc.category_id,
  coalesce(ttc.created_at, now()),
  coalesce(ttc.created_at, now()),
  now()
from public.task_template_categories ttc
on conflict (task_template_id, category_id) where removed_at is null do nothing;

insert into public.task_template_archive_periods (
  task_template_id,
  archived_at,
  created_at,
  updated_at
)
select
  tt.id,
  tt.archived_at,
  tt.archived_at,
  now()
from public.task_templates tt
where tt.archived_at is not null
on conflict (task_template_id) where reactivated_at is null do nothing;

drop trigger if exists task_template_category_periods_update_timestamp
  on public.task_template_category_periods;
create trigger task_template_category_periods_update_timestamp
  before update on public.task_template_category_periods
  for each row execute function public.trigger_update_timestamp();

drop trigger if exists task_template_archive_periods_update_timestamp
  on public.task_template_archive_periods;
create trigger task_template_archive_periods_update_timestamp
  before update on public.task_template_archive_periods
  for each row execute function public.trigger_update_timestamp();

create or replace function public.log_task_template_category_period_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_template_category_periods (
    task_template_id,
    category_id,
    assigned_at,
    created_at,
    updated_at
  )
  values (
    new.task_template_id,
    new.category_id,
    coalesce(new.created_at, now()),
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (task_template_id, category_id) where removed_at is null
  do update
    set assigned_at = least(
          task_template_category_periods.assigned_at,
          excluded.assigned_at
        ),
        updated_at = now();

  return new;
end;
$$;

create or replace function public.log_task_template_category_period_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_removed_at timestamptz := now();
  v_updated integer := 0;
begin
  update public.task_template_category_periods
     set removed_at = v_removed_at,
         updated_at = now()
   where task_template_id = old.task_template_id
     and category_id = old.category_id
     and removed_at is null;

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    insert into public.task_template_category_periods (
      task_template_id,
      category_id,
      assigned_at,
      removed_at,
      created_at,
      updated_at
    )
    values (
      old.task_template_id,
      old.category_id,
      coalesce(old.created_at, v_removed_at),
      v_removed_at,
      coalesce(old.created_at, v_removed_at),
      now()
    );
  end if;

  return old;
end;
$$;

drop trigger if exists task_template_category_period_insert
  on public.task_template_categories;
create trigger task_template_category_period_insert
  after insert on public.task_template_categories
  for each row execute function public.log_task_template_category_period_insert();

drop trigger if exists task_template_category_period_delete
  on public.task_template_categories;
create trigger task_template_category_period_delete
  before delete on public.task_template_categories
  for each row execute function public.log_task_template_category_period_delete();

create or replace function public.log_task_template_archive_period()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reactivated_at timestamptz;
  v_updated integer := 0;
begin
  if old.archived_at is not null and new.archived_at is not null then
    update public.task_template_archive_periods
       set archived_at = new.archived_at,
           updated_at = now()
     where id = (
       select id
       from public.task_template_archive_periods
       where task_template_id = new.id
         and reactivated_at is null
       order by archived_at desc
       limit 1
     );

    return new;
  end if;

  if old.archived_at is null and new.archived_at is not null then
    insert into public.task_template_archive_periods (
      task_template_id,
      archived_at,
      created_at,
      updated_at
    )
    values (
      new.id,
      new.archived_at,
      new.archived_at,
      now()
    )
    on conflict (task_template_id) where reactivated_at is null
    do update
      set archived_at = excluded.archived_at,
          updated_at = now();

    return new;
  end if;

  if old.archived_at is not null and new.archived_at is null then
    v_reactivated_at := greatest(
      coalesce(new.updated_at, now()),
      old.archived_at
    );

    update public.task_template_archive_periods
       set reactivated_at = v_reactivated_at,
           updated_at = now()
     where id = (
       select id
       from public.task_template_archive_periods
       where task_template_id = new.id
         and reactivated_at is null
       order by archived_at desc
       limit 1
     );

    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      insert into public.task_template_archive_periods (
        task_template_id,
        archived_at,
        reactivated_at,
        created_at,
        updated_at
      )
      values (
        new.id,
        old.archived_at,
        v_reactivated_at,
        old.archived_at,
        now()
      );
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists task_template_archive_period_update
  on public.task_templates;
create trigger task_template_archive_period_update
  after update of archived_at on public.task_templates
  for each row
  when (old.archived_at is distinct from new.archived_at)
  execute function public.log_task_template_archive_period();

create or replace function public.get_task_template_visibility_state(
  p_template_ids uuid[]
)
returns table (
  template_id uuid,
  archived_at timestamptz,
  archive_periods jsonb,
  category_periods jsonb
)
language sql
security definer
set search_path = public
as $$
  with requested as (
    select distinct unnest(coalesce(p_template_ids, array[]::uuid[])) as id
  ),
  authorized_templates as (
    select tt.id, tt.archived_at
    from public.task_templates tt
    join requested requested_templates on requested_templates.id = tt.id
    where auth.uid() is not null
      and (
        tt.user_id = auth.uid()
        or tt.player_id = auth.uid()
        or (
          tt.team_id is not null
          and exists (
            select 1
            from public.team_members tm
            where tm.team_id = tt.team_id
              and tm.player_id = auth.uid()
          )
        )
      )
  )
  select
    tt.id as template_id,
    tt.archived_at,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'archivedAt', ap.archived_at,
            'reactivatedAt', ap.reactivated_at
          )
          order by ap.archived_at
        )
        from public.task_template_archive_periods ap
        where ap.task_template_id = tt.id
      ),
      '[]'::jsonb
    ) as archive_periods,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'categoryId', cp.category_id,
            'assignedAt', cp.assigned_at,
            'removedAt', cp.removed_at
          )
          order by cp.assigned_at
        )
        from public.task_template_category_periods cp
        where cp.task_template_id = tt.id
      ),
      '[]'::jsonb
    ) as category_periods
  from authorized_templates tt;
$$;

grant execute on function public.get_task_template_visibility_state(uuid[]) to authenticated;
