create or replace function public.trigger_update_tasks_on_category_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category_id is distinct from old.category_id
     and coalesce(new.is_external, false) = false then
    if new.category_id is not null then
      perform public.create_tasks_for_activity(new.id);
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.trigger_create_tasks_for_external_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category_id is not null then
    if tg_op = 'INSERT'
       or (tg_op = 'UPDATE' and new.category_id is distinct from old.category_id) then
      perform public.create_tasks_for_external_event(new.id);
    end if;
  end if;

  return new;
end;
$$;
