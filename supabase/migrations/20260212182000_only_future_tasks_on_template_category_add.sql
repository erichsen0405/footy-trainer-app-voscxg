create or replace function public.trigger_fix_tasks_on_template_category_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- When a task template is assigned to a new category, only create tasks for
  -- upcoming internal activities (never past/finished activities).
  if tg_op = 'INSERT' then
    perform public.create_tasks_for_activity(a.id)
    from public.activities a
    join public.task_templates tt on tt.id = new.task_template_id
    where a.category_id = new.category_id
      and a.user_id = tt.user_id
      and a.is_external = false
      and (
        (a.activity_date > current_date)
        or (
          a.activity_date = current_date
          and coalesce(a.activity_time::time, time '00:00:00') >= localtime
        )
      );
  end if;

  return new;
end;
$$;

create or replace function public.trigger_fix_external_tasks_on_template_category_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- When a task template is assigned to a new category, only create tasks for
  -- upcoming external events (never past/finished events).
  if tg_op = 'INSERT' then
    perform public.create_tasks_for_external_event(elm.id)
    from public.events_local_meta elm
    join public.task_templates tt on tt.id = new.task_template_id
    join public.events_external ee on ee.id = elm.external_event_id
    where elm.category_id = new.category_id
      and elm.user_id = tt.user_id
      and (
        (ee.start_date > current_date)
        or (
          ee.start_date = current_date
          and coalesce(ee.start_time::time, time '00:00:00') >= localtime
        )
      );
  end if;

  return new;
end;
$$;
