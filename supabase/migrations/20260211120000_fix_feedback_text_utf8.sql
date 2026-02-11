-- Fix feedback task mojibake and ensure UTF-8 strings are used in the helper.
-- Safe to rerun: CREATE OR REPLACE + targeted UPDATE filters.

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

    v_feedback_title := 'Feedback på ' || coalesce(nullif(trim(p_base_title), ''), 'opgaven');
    v_marker := '[auto-after-training:' || p_task_template_id::text || ']';
    v_description := 'Del din feedback efter træningen direkte til træneren. ' || v_marker;

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

-- Correct already-created rows that contain garbled text
update public.activity_tasks
   set title = replace(title, 'Feedback pÃ¥ ', 'Feedback på ')
 where title like 'Feedback pÃ¥ %';

update public.activity_tasks
   set title = replace(title, 'Feedback pÃƒÂ¥ ', 'Feedback på ')
 where title like 'Feedback pÃƒÂ¥ %';

update public.activity_tasks
   set title = replace(title, 'Feedback pÃƒÆ’Ã‚Â¥ ', 'Feedback på ')
 where title like 'Feedback pÃƒÆ’Ã‚Â¥ %';

update public.activity_tasks
   set description = replace(description, 'trÃ¦ningen', 'træningen')
 where description like '%trÃ¦ningen%';

update public.activity_tasks
   set description = replace(description, 'trÃƒÂ¦ningen', 'træningen')
 where description like '%trÃƒÂ¦ningen%';

update public.activity_tasks
   set description = replace(description, 'trÃƒÆ’Ã‚Â¦ningen', 'træningen')
 where description like '%trÃƒÆ’Ã‚Â¦ningen%';

update public.activity_tasks
   set description = replace(description, 'trÃ¦neren', 'træneren')
 where description like '%trÃ¦neren%';

update public.activity_tasks
   set description = replace(description, 'trÃƒÂ¦neren', 'træneren')
 where description like '%trÃƒÂ¦neren%';

update public.activity_tasks
   set description = replace(description, 'trÃƒÆ’Ã‚Â¦neren', 'træneren')
 where description like '%trÃƒÆ’Ã‚Â¦neren%';
