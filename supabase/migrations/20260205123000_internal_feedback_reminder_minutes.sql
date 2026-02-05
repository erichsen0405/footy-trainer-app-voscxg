-- Ensure feedback tasks for internal activities carry a reminder derived from the template's after_training_delay_minutes
-- This fixes missing reminder badges on internal feedback tasks (external tasks already copy the delay).

create or replace function public.upsert_after_training_feedback_task(
    p_activity_id uuid,
    p_task_template_id uuid,
    p_base_title text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_feedback_title text;
    v_marker text;
    v_description text;
    v_feedback_task_id uuid;
    v_feedback_delay integer;
begin
    if p_activity_id is null or p_task_template_id is null then
        return;
    end if;

    v_feedback_title := 'Feedback pÃ¥ ' || coalesce(nullif(trim(p_base_title), ''), 'opgaven');
    v_marker := '[auto-after-training:' || p_task_template_id::text || ']';
    v_description := 'Del din feedback efter trÃ¦ningen direkte til trÃ¦neren. ' || v_marker;

    select after_training_delay_minutes
      into v_feedback_delay
      from public.task_templates
     where id = p_task_template_id;

    select id
      into v_feedback_task_id
      from public.activity_tasks
     where activity_id = p_activity_id
       and task_template_id is null
       and description like '%' || v_marker || '%'
     limit 1;

    if v_feedback_task_id is null then
        insert into public.activity_tasks (
            activity_id,
            task_template_id,
            title,
            description,
            reminder_minutes
        ) values (
            p_activity_id,
            null,
            v_feedback_title,
            v_description,
            v_feedback_delay
        )
        returning id into v_feedback_task_id;
    else
        update public.activity_tasks
           set title = v_feedback_title,
               description = v_description,
               reminder_minutes = v_feedback_delay,
               updated_at = now()
         where id = v_feedback_task_id;
    end if;
end;
$$;

