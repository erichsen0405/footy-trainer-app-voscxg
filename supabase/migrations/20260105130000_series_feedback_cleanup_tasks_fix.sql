create or replace function public.create_tasks_for_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_activity_user_id uuid;
  v_activity_player_id uuid;
  v_template record;
  v_task_id uuid;
  v_subtask record;
  v_existing_task_id uuid;
  v_reflection_user_id uuid;
  v_template_ids uuid[] := array[]::uuid[];
begin
  select category_id, user_id, player_id
    into v_category_id, v_activity_user_id, v_activity_player_id
    from public.activities
   where id = p_activity_id;

  if v_category_id is null or v_activity_user_id is null then
    return;
  end if;

  select coalesce(array_remove(array_agg(distinct tt.id), null), array[]::uuid[])
    into v_template_ids
    from public.task_templates tt
    join public.task_template_categories ttc on ttc.task_template_id = tt.id
   where ttc.category_id = v_category_id
     and tt.user_id = v_activity_user_id;

  with auto_tasks as (
    select id
      from public.activity_tasks
     where activity_id = p_activity_id
       and task_template_id is null
       and description is not null
       and description like '%[auto-after-training:%'
  )
  delete from public.activity_task_subtasks
   where activity_task_id in (select id from auto_tasks);

  delete from public.activity_tasks
   where id in (select id from auto_tasks);

  with orphan_tasks as (
    select id
      from public.activity_tasks
     where activity_id = p_activity_id
       and task_template_id is not null
       and (
         coalesce(array_length(v_template_ids, 1), 0) = 0
         or not (task_template_id = any(v_template_ids))
       )
  )
  delete from public.activity_task_subtasks
   where activity_task_id in (select id from orphan_tasks);

  delete from public.activity_tasks
   where id in (select id from orphan_tasks);

  for v_template in
    select distinct tt.*
      from public.task_templates tt
      join public.task_template_categories ttc on ttc.task_template_id = tt.id
     where ttc.category_id = v_category_id
       and tt.user_id = v_activity_user_id
  loop
    select id
      into v_existing_task_id
      from public.activity_tasks
     where activity_id = p_activity_id
       and task_template_id = v_template.id;

    if v_existing_task_id is not null then
      update public.activity_tasks
         set title = v_template.title,
             description = v_template.description,
             reminder_minutes = v_template.reminder_minutes,
             updated_at = now()
       where id = v_existing_task_id;

      delete from public.activity_task_subtasks
       where activity_task_id = v_existing_task_id;

      for v_subtask in
        select *
          from public.task_template_subtasks
         where task_template_id = v_template.id
         order by sort_order
      loop
        insert into public.activity_task_subtasks (activity_task_id, title, sort_order)
        values (v_existing_task_id, v_subtask.title, v_subtask.sort_order);
      end loop;
    else
      insert into public.activity_tasks (activity_id, task_template_id, title, description, reminder_minutes)
      values (p_activity_id, v_template.id, v_template.title, v_template.description, v_template.reminder_minutes)
      returning id into v_task_id;

      for v_subtask in
        select *
          from public.task_template_subtasks
         where task_template_id = v_template.id
         order by sort_order
      loop
        insert into public.activity_task_subtasks (activity_task_id, title, sort_order)
        values (v_task_id, v_subtask.title, v_subtask.sort_order);
      end loop;
    end if;

    if coalesce(v_template.after_training_enabled, false) then
      v_reflection_user_id := coalesce(v_activity_player_id, v_activity_user_id);

      if v_reflection_user_id is not null then
        insert into public.training_reflections (activity_id, user_id, category_id, rating, note)
        values (p_activity_id, v_reflection_user_id, v_category_id, null, null)
        on conflict (activity_id) do nothing;
      end if;

      perform public.upsert_after_training_feedback_task(
        p_activity_id,
        v_template.id,
        v_template.title
      );
    end if;
  end loop;
end;
$$;

create or replace function public.cleanup_tasks_for_template(
  p_user_id uuid,
  p_template_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_ids uuid[] := array[]::uuid[];
begin
  if p_user_id is null or p_template_id is null then
    return;
  end if;

  select coalesce(array_remove(array_agg(id), null), array[]::uuid[])
    into v_activity_ids
    from public.activities
   where user_id = p_user_id;

  if coalesce(array_length(v_activity_ids, 1), 0) > 0 then
    with template_tasks as (
      select id
        from public.activity_tasks
       where activity_id = any(v_activity_ids)
         and task_template_id = p_template_id
    )
    delete from public.activity_task_subtasks
     where activity_task_id in (select id from template_tasks);

    delete from public.activity_tasks
     where id in (select id from template_tasks);

    with feedback_tasks as (
      select id
        from public.activity_tasks
       where activity_id = any(v_activity_ids)
         and task_template_id is null
         and description is not null
         and description like '%[auto-after-training:' || p_template_id::text || ']%'
    )
    delete from public.activity_task_subtasks
     where activity_task_id in (select id from feedback_tasks);

    delete from public.activity_tasks
     where id in (select id from feedback_tasks);
  end if;

  delete from public.external_event_tasks eet
  using public.events_local_meta elm
   where eet.local_meta_id = elm.id
     and elm.user_id = p_user_id
     and eet.task_template_id = p_template_id;

  delete from public.task_template_self_feedback
   where user_id = p_user_id
     and task_template_id = p_template_id;

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
    perform public.cleanup_tasks_for_template(old.user_id, old.id);
  end if;

  return old;
end;
$$;

drop trigger if exists cleanup_tasks_on_template_delete on public.task_templates;

create trigger cleanup_tasks_on_template_delete
  after delete on public.task_templates
  for each row
  execute function public.trigger_cleanup_tasks_on_template_delete();
