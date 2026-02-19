create or replace function public.apply_external_category_intensity_rule_to_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
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

  if new.intensity is null and coalesce(new.intensity_enabled, false) = false then
    new.intensity_enabled := true;
  end if;

  return new;
end;
$$;

create or replace function public.apply_external_category_intensity_rule_to_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enabled boolean := false;
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

  if new.intensity is null and coalesce(new.intensity_enabled, false) = false then
    new.intensity_enabled := true;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_external_category_intensity_rule_to_activity
  on public.activities;
create trigger apply_external_category_intensity_rule_to_activity
before insert or update of category_id on public.activities
for each row
execute function public.apply_external_category_intensity_rule_to_activity();
