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

  v_has_local_meta_id boolean := false;
  v_has_task_template_id boolean := false;
  v_has_title boolean := false;
  v_has_description boolean := false;
  v_has_reminder_minutes boolean := false;
  v_has_completed boolean := false;
  v_has_feedback_template_id boolean := false;
  v_has_is_feedback_task boolean := false;
  v_has_video_url boolean := false;

  v_has_after_training_enabled boolean := false;
  v_has_after_training_delay_minutes boolean := false;

  v_should_create_feedback boolean := false;
  v_feedback_reminder_minutes integer := null;
begin
  if p_local_meta_id is null then
    return;
  end if;

  if to_regclass('public.external_event_tasks') is null
     or to_regclass('public.events_local_meta') is null
     or to_regclass('public.task_templates') is null
     or to_regclass('public.task_template_categories') is null then
    return;
  end if;

  select
    coalesce(bool_or(column_name = 'local_meta_id'), false),
    coalesce(bool_or(column_name = 'task_template_id'), false),
    coalesce(bool_or(column_name = 'title'), false),
    coalesce(bool_or(column_name = 'description'), false),
    coalesce(bool_or(column_name = 'reminder_minutes'), false),
    coalesce(bool_or(column_name = 'completed'), false),
    coalesce(bool_or(column_name = 'feedback_template_id'), false),
    coalesce(bool_or(column_name = 'is_feedback_task'), false),
    coalesce(bool_or(column_name = 'video_url'), false)
  into
    v_has_local_meta_id,
    v_has_task_template_id,
    v_has_title,
    v_has_description,
    v_has_reminder_minutes,
    v_has_completed,
    v_has_feedback_template_id,
    v_has_is_feedback_task,
    v_has_video_url
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'external_event_tasks';

  if not (
    v_has_local_meta_id
    and v_has_task_template_id
    and v_has_title
    and v_has_description
    and v_has_reminder_minutes
    and v_has_completed
  ) then
    return;
  end if;

  if not v_has_feedback_template_id then
    return;
  end if;

  select
    coalesce(bool_or(column_name = 'after_training_enabled'), false),
    coalesce(bool_or(column_name = 'after_training_delay_minutes'), false)
  into
    v_has_after_training_enabled,
    v_has_after_training_delay_minutes
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'task_templates';

  select category_id, user_id
    into v_category_id, v_user_id
  from public.events_local_meta
  where id = p_local_meta_id;

  if v_category_id is null or v_user_id is null then
    return;
  end if;

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

    v_should_create_feedback := false;
    if v_has_after_training_enabled then
      v_should_create_feedback := coalesce(v_template.after_training_enabled, false);
    end if;

    v_feedback_reminder_minutes := null;
    if v_has_after_training_delay_minutes then
      v_feedback_reminder_minutes := v_template.after_training_delay_minutes;
    end if;

    if not v_should_create_feedback then
      delete from public.external_event_tasks
      where local_meta_id = p_local_meta_id
        and feedback_template_id = v_template.id;

      if v_has_is_feedback_task then
        delete from public.external_event_tasks
        where local_meta_id = p_local_meta_id
          and coalesce(is_feedback_task, false) = true
          and task_template_id is null
          and (feedback_template_id is null or feedback_template_id = v_template.id);
      end if;

      continue;
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
          v_feedback_reminder_minutes,
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
          v_feedback_reminder_minutes,
          false
        )
        returning id into v_feedback_task_id;
      end if;
    else
      update public.external_event_tasks
         set title = 'Feedback på ' || coalesce(v_template.title, 'opgave'),
             description = '',
             reminder_minutes = v_feedback_reminder_minutes
       where id = v_feedback_task_id;
    end if;
  end loop;
end;
$$;
