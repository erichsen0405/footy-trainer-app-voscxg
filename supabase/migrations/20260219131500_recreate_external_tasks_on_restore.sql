-- Issue #173 follow-up:
-- When an external event is restored (deleted true -> false), recreate missing external tasks.

create or replace function public.cleanup_pending_external_tasks_on_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.deleted, false) = false and coalesce(new.deleted, false) = true then
    -- Soft delete: remove only pending tasks.
    delete from public.external_event_tasks eet
    using public.events_local_meta elm
    where elm.external_event_id = new.id
      and eet.local_meta_id = elm.id
      and coalesce(eet.completed, false) = false;
  elsif coalesce(old.deleted, false) = true and coalesce(new.deleted, false) = false then
    -- Restore: recreate any missing tasks for linked local-meta rows with category.
    perform public.create_tasks_for_external_event(elm.id)
    from public.events_local_meta elm
    where elm.external_event_id = new.id
      and elm.category_id is not null;
  end if;

  return new;
end;
$$;
