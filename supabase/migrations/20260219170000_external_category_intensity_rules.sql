create table if not exists public.external_category_intensity_rules (
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.activity_categories(id) on delete cascade,
  intensity_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, category_id)
);

alter table public.external_category_intensity_rules enable row level security;

drop policy if exists "Users can view their own external category intensity rules"
  on public.external_category_intensity_rules;
create policy "Users can view their own external category intensity rules"
  on public.external_category_intensity_rules
  for select
  using (user_id = auth.uid());

drop policy if exists "Users can insert their own external category intensity rules"
  on public.external_category_intensity_rules;
create policy "Users can insert their own external category intensity rules"
  on public.external_category_intensity_rules
  for insert
  with check (user_id = auth.uid());

drop policy if exists "Users can update their own external category intensity rules"
  on public.external_category_intensity_rules;
create policy "Users can update their own external category intensity rules"
  on public.external_category_intensity_rules
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Users can delete their own external category intensity rules"
  on public.external_category_intensity_rules;
create policy "Users can delete their own external category intensity rules"
  on public.external_category_intensity_rules
  for delete
  using (user_id = auth.uid());

drop trigger if exists update_external_category_intensity_rules_timestamp
  on public.external_category_intensity_rules;
create trigger update_external_category_intensity_rules_timestamp
before update on public.external_category_intensity_rules
for each row
execute function public.trigger_update_timestamp();

create or replace function public.apply_external_category_intensity_rule_to_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
  v_recurrence_id text := null;
begin
  if new.category_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and not (new.category_id is distinct from old.category_id) then
    return new;
  end if;

  select eir.intensity_enabled
    into v_enabled
    from public.external_category_intensity_rules eir
   where eir.user_id = new.user_id
     and eir.category_id = new.category_id;

  if coalesce(v_enabled, false) = false then
    return new;
  end if;

  if new.external_event_id is null then
    return new;
  end if;

  select ee.recurrence_id
    into v_recurrence_id
    from public.events_external ee
   where ee.id = new.external_event_id;

  if v_recurrence_id is not null then
    return new;
  end if;

  if new.intensity is null and coalesce(new.intensity_enabled, false) = false then
    new.intensity_enabled := true;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_external_category_intensity_rule_to_meta
  on public.events_local_meta;
create trigger apply_external_category_intensity_rule_to_meta
before insert or update of category_id on public.events_local_meta
for each row
execute function public.apply_external_category_intensity_rule_to_meta();
