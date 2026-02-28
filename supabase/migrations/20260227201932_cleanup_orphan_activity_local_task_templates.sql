create or replace function public.cleanup_orphan_local_task_template_from_activity_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate_template_id uuid;
begin
  foreach v_candidate_template_id in array array[old.task_template_id, old.feedback_template_id]
  loop
    if v_candidate_template_id is null then
      continue;
    end if;

    delete from public.task_templates tt
     where tt.id = v_candidate_template_id
       and coalesce(tt.source_folder, '') = 'activity_local_task'
       and not exists (
         select 1
           from public.activity_tasks at
          where at.task_template_id = tt.id
             or at.feedback_template_id = tt.id
       )
       and not exists (
         select 1
           from public.external_event_tasks eet
          where eet.task_template_id = tt.id
             or eet.feedback_template_id = tt.id
       );
  end loop;

  return old;
end;
$$;

drop trigger if exists cleanup_orphan_local_task_template_on_activity_task_delete
  on public.activity_tasks;

create trigger cleanup_orphan_local_task_template_on_activity_task_delete
after delete on public.activity_tasks
for each row
execute function public.cleanup_orphan_local_task_template_from_activity_task();
