-- Fix overload ambiguity for cleanup_tasks_for_template(uuid, uuid).
-- Some environments ended up with both:
-- 1) cleanup_tasks_for_template(uuid, uuid)
-- 2) cleanup_tasks_for_template(uuid, uuid, text default null)
-- which can break PostgREST/RPC resolution.

drop function if exists public.cleanup_tasks_for_template(uuid, uuid);

create or replace function public.trigger_cleanup_tasks_on_template_hide()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is not null and new.task_template_id is not null then
    perform public.cleanup_tasks_for_template(new.user_id, new.task_template_id, null::text);
  end if;

  return new;
end;
$$;
