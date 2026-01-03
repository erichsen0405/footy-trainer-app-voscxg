-- Ensure after-training templates generate a dedicated feedback task per activity
create or replace function public.create_tasks_for_activity(p_activity_id uuid)
returns void
language plpgsql
security definer
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
  v_feedback_task_id uuid;
  v_feedback_marker constant text := '[auto-after-training]';
  v_feedback_title constant text := 'Efter-træning feedback';
  v_feedback_description constant text := 'Del din feedback efter træningen direkte til træneren. ' || v_feedback_marker;
begin
  select category_id, user_id, player_id
  into v_category_id, v_activity_user_id, v_activity_player_id
  from activities
  where id = p_activity_id;

  if v_category_id is null then
    return;
  end if;

  for v_template in
    select distinct tt.*
    from task_templates tt
    join task_template_categories ttc on ttc.task_template_id = tt.id
    where ttc.category_id = v_category_id
      and tt.user_id = v_activity_user_id
  loop
    select id into v_existing_task_id
    from activity_tasks
    where activity_id = p_activity_id
      and task_template_id = v_template.id;

    if v_existing_task_id is not null then
      update activity_tasks
      set title = v_template.title,
          description = v_template.description,
          reminder_minutes = v_template.reminder_minutes,
          updated_at = now()
      where id = v_existing_task_id;

      delete from activity_task_subtasks
      where activity_task_id = v_existing_task_id;

      for v_subtask in
        select * from task_template_subtasks
        where task_template_id = v_template.id
        order by sort_order
      loop
        insert into activity_task_subtasks (activity_task_id, title, sort_order)
        values (v_existing_task_id, v_subtask.title, v_subtask.sort_order);
      end loop;

      raise notice 'Task updated for activity % and template %', p_activity_id, v_template.id;
    else
      insert into activity_tasks (activity_id, task_template_id, title, description, reminder_minutes)
      values (p_activity_id, v_template.id, v_template.title, v_template.description, v_template.reminder_minutes)
      returning id into v_task_id;

      for v_subtask in
        select * from task_template_subtasks
        where task_template_id = v_template.id
        order by sort_order
      loop
        insert into activity_task_subtasks (activity_task_id, title, sort_order)
        values (v_task_id, v_subtask.title, v_subtask.sort_order);
      end loop;

      raise notice 'Task created for activity % and template %', p_activity_id, v_template.id;
    end if;

    if coalesce(v_template.after_training_enabled, false) then
      v_reflection_user_id := coalesce(v_activity_player_id, v_activity_user_id);

      if v_reflection_user_id is not null then
        insert into training_reflections (activity_id, user_id, category_id, rating, note)
        values (p_activity_id, v_reflection_user_id, v_category_id, null, null)
        on conflict (activity_id) do nothing;
      end if;

      select id
      into v_feedback_task_id
      from activity_tasks
      where activity_id = p_activity_id
        and task_template_id is null
        and description like '%' || v_feedback_marker || '%'
      limit 1;

      if v_feedback_task_id is null then
        insert into activity_tasks (activity_id, task_template_id, title, description, reminder_minutes)
        values (p_activity_id, null, v_feedback_title, v_feedback_description, null)
        returning id into v_feedback_task_id;
        raise notice 'Feedback task created for activity %', p_activity_id;
      else
        update activity_tasks
        set title = v_feedback_title,
            description = v_feedback_description,
            updated_at = now()
        where id = v_feedback_task_id;
      end if;
    end if;
  end loop;
end;
$$;

-- Backfill existing activities that already rely on after-training templates
DO $$
DECLARE
  v_activity record;
BEGIN
  FOR v_activity IN
    select distinct at.activity_id
    from activity_tasks at
    join task_templates tt on tt.id = at.task_template_id
    where coalesce(tt.after_training_enabled, false)
  LOOP
    PERFORM create_tasks_for_activity(v_activity.activity_id);
  END LOOP;
END $$;
