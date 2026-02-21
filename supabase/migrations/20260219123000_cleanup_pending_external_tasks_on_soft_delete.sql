-- Issue #173:
-- Delete pending external tasks when their source external event is soft deleted.
-- Assumption: soft delete is represented by public.events_external.deleted (boolean).

-- A) One-time cleanup for already soft-deleted external events.
delete from public.external_event_tasks eet
using public.events_local_meta elm
join public.events_external ee on ee.id = elm.external_event_id
where eet.local_meta_id = elm.id
  and coalesce(ee.deleted, false) = true
  and coalesce(eet.completed, false) = false;

-- B) Forward-looking cleanup when events_external.deleted transitions false -> true.
create or replace function public.cleanup_pending_external_tasks_on_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(old.deleted, false) = false and coalesce(new.deleted, false) = true then
    delete from public.external_event_tasks eet
    using public.events_local_meta elm
    where elm.external_event_id = new.id
      and eet.local_meta_id = elm.id
      and coalesce(eet.completed, false) = false;
  end if;

  return new;
end;
$$;

drop trigger if exists on_events_external_soft_delete_cleanup_pending_tasks on public.events_external;

create trigger on_events_external_soft_delete_cleanup_pending_tasks
after update of deleted on public.events_external
for each row
execute function public.cleanup_pending_external_tasks_on_soft_delete();
