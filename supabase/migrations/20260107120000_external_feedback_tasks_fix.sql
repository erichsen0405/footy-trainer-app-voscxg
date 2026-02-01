create or replace function public.create_tasks_for_external_event(p_local_meta_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category_id uuid;
  v_user_id uuid;
  v_template record;
  v_base_task_id uuid;
  v_feedback_task_id uuid;
  v_has_is_feedback_task boolean := false;
begin
  if p_local_meta_id is null then
    return;
  end if;

  select category_id, user_id
    into v_category_id, v_user_id
  from public.events_local_meta
  where id = p_local_meta_id;

  if v_category_id is null or v_user_id is null then
    return;
  end if;

  select exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'external_event_tasks'
      and column_name = 'is_feedback_task'
  ) into v_has_is_feedback_task;

  for v_template in
    select distinct tt.*
    from public.task_templates tt
    join public.task_template_categories ttc on ttc.task_template_id = tt.id
    where ttc.category_id = v_category_id
      and tt.user_id = v_user_id
  loop
    select id
      into v_base_task_id
    from public.external_event_tasks
    where local_meta_id = p_local_meta_id
      and task_template_id = v_template.id
    limit 1;

    if v_base_task_id is null then
      insert into public.external_event_tasks (
        local_meta_id,
        task_template_id,
        title,
        description,
        reminder_minutes,
        completed
      )
      values (
        p_local_meta_id,
        v_template.id,
        v_template.title,
        v_template.description,
        v_template.reminder_minutes,
        false
      )
      returning id into v_base_task_id;
    else
      update public.external_event_tasks
      set title = v_template.title,
          description = v_template.description,
          reminder_minutes = v_template.reminder_minutes
      where id = v_base_task_id;
    end if;

    select id
      into v_feedback_task_id
    from public.external_event_tasks
    where local_meta_id = p_local_meta_id
      and feedback_template_id = v_template.id
    limit 1;

    if v_feedback_task_id is null then
      if v_has_is_feedback_task then
        insert into public.external_event_tasks (
          local_meta_id,
          task_template_id,
          feedback_template_id,
          title,
          description,
          reminder_minutes,
          completed,
          is_feedback_task
        )
        values (
          p_local_meta_id,
          null,
          v_template.id,
          'Feedback på ' || coalesce(v_template.title, 'opgave'),
          '',
          null,
          false,
          true
        )
        returning id into v_feedback_task_id;
      else
        insert into public.external_event_tasks (
          local_meta_id,
          task_template_id,
          feedback_template_id,
          title,
          description,
          reminder_minutes,
          completed
        )
        values (
          p_local_meta_id,
          null,
          v_template.id,
          'Feedback på ' || coalesce(v_template.title, 'opgave'),
          '',
          null,
          false
        )
        returning id into v_feedback_task_id;
      end if;
    else
      update public.external_event_tasks
      set title = 'Feedback på ' || coalesce(v_template.title, 'opgave'),
          description = '',
          reminder_minutes = null
      where id = v_feedback_task_id;
    end if;
  end loop;
end;
$$;
