BEGIN;

create or replace function public.cleanup_tasks_for_template(
  p_user_id uuid,
  p_template_id uuid,
  p_template_title text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_ids uuid[] := array[]::uuid[];
  v_category_ids uuid[] := array[]::uuid[];
  v_template_title text := nullif(trim(coalesce(p_template_title, '')), '');
begin
  if p_user_id is null or p_template_id is null then
    return;
  end if;

  select coalesce(array_remove(array_agg(id), null), array[]::uuid[])
    into v_activity_ids
    from public.activities
   where user_id = p_user_id;

  select coalesce(array_remove(array_agg(distinct category_id), null), array[]::uuid[])
    into v_category_ids
    from public.task_template_categories
   where task_template_id = p_template_id;

  delete from public.activity_task_subtasks
   where activity_task_id in (
     select id
       from public.activity_tasks
      where activity_id = any(v_activity_ids)
        and task_template_id = p_template_id
   );

  delete from public.activity_tasks
   where activity_id = any(v_activity_ids)
     and task_template_id = p_template_id;

  delete from public.activity_task_subtasks
   where activity_task_id in (
     select id
       from public.activity_tasks
      where activity_id = any(v_activity_ids)
        and task_template_id is null
        and description is not null
        and description like '%[auto-after-training:' || p_template_id::text || ']%'
   );

  delete from public.activity_tasks
   where activity_id = any(v_activity_ids)
     and task_template_id is null
     and description is not null
     and description like '%[auto-after-training:' || p_template_id::text || ']%';

  delete from public.external_event_tasks eet
  using public.events_local_meta elm
   where eet.local_meta_id = elm.id
     and elm.user_id = p_user_id
     and eet.task_template_id = p_template_id;

  delete from public.task_template_self_feedback
   where user_id = p_user_id
     and task_template_id = p_template_id;

  if v_template_title is not null then
    delete from public.activity_task_subtasks ast
    using public.activity_tasks at
    join public.activities a on a.id = at.activity_id
     where ast.activity_task_id = at.id
       and at.activity_id = any(v_activity_ids)
       and at.task_template_id is null
       and at.title = v_template_title
       and (
         (coalesce(array_length(v_category_ids, 1), 0) > 0 and a.category_id = any(v_category_ids))
         or (coalesce(array_length(v_category_ids, 1), 0) = 0 and a.series_id is not null)
       )
       and exists (
         select 1
           from public.activity_tasks at2
           join public.activities a2 on a2.id = at2.activity_id
          where at2.task_template_id is null
            and at2.title = v_template_title
            and at2.activity_id <> at.activity_id
            and a2.user_id = p_user_id
            and (
              (coalesce(array_length(v_category_ids, 1), 0) > 0 and a2.category_id = any(v_category_ids))
              or (coalesce(array_length(v_category_ids, 1), 0) = 0 and a2.series_id is not null)
            )
       );

    delete from public.activity_tasks at
    using public.activities a
     where at.activity_id = a.id
       and at.activity_id = any(v_activity_ids)
       and at.task_template_id is null
       and at.title = v_template_title
       and (
         (coalesce(array_length(v_category_ids, 1), 0) > 0 and a.category_id = any(v_category_ids))
         or (coalesce(array_length(v_category_ids, 1), 0) = 0 and a.series_id is not null)
       )
       and exists (
         select 1
           from public.activity_tasks at2
           join public.activities a2 on a2.id = at2.activity_id
          where at2.task_template_id is null
            and at2.title = v_template_title
            and at2.activity_id <> at.activity_id
            and a2.user_id = p_user_id
            and (
              (coalesce(array_length(v_category_ids, 1), 0) > 0 and a2.category_id = any(v_category_ids))
              or (coalesce(array_length(v_category_ids, 1), 0) = 0 and a2.series_id is not null)
            )
       );
  end if;

  return;
end;
$$;

create or replace function public.trigger_cleanup_tasks_on_template_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.user_id is not null then
    perform public.cleanup_tasks_for_template(old.user_id, old.id, old.title);
  end if;

  return old;
end;
$$;

drop trigger if exists cleanup_tasks_on_template_delete on public.task_templates;

create trigger cleanup_tasks_on_template_delete
  before delete on public.task_templates
  for each row
  execute function public.trigger_cleanup_tasks_on_template_delete();

with legacy_series_tasks as (
  select at.id
    from public.activity_tasks at
    join public.activities a on a.id = at.activity_id
   where at.task_template_id is null
     and at.title is not null
     and a.series_id is not null
     and a.user_id is not null
     and exists (
       select 1
         from public.activity_tasks at2
         join public.activities a2 on a2.id = at2.activity_id
        where at2.task_template_id is null
          and at2.title = at.title
          and a2.series_id = a.series_id
          and a2.user_id = a.user_id
          and at2.activity_id <> at.activity_id
     )
     and not exists (
       select 1
         from public.task_templates tt
        where tt.user_id = a.user_id
          and tt.title = at.title
     )
)
delete from public.activity_task_subtasks ast
using legacy_series_tasks lst
 where ast.activity_task_id = lst.id;

with legacy_series_tasks as (
  select at.id
    from public.activity_tasks at
    join public.activities a on a.id = at.activity_id
   where at.task_template_id is null
     and at.title is not null
     and a.series_id is not null
     and a.user_id is not null
     and exists (
       select 1
         from public.activity_tasks at2
         join public.activities a2 on a2.id = at2.activity_id
        where at2.task_template_id is null
          and at2.title = at.title
          and a2.series_id = a.series_id
          and a2.user_id = a.user_id
          and at2.activity_id <> at.activity_id
     )
     and not exists (
       select 1
         from public.task_templates tt
        where tt.user_id = a.user_id
          and tt.title = at.title
     )
)
delete from public.activity_tasks at
using legacy_series_tasks lst
 where at.id = lst.id;

COMMIT;
