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
       and (
         feedback_template_id = p_task_template_id
         or (task_template_id is null and description like '%' || v_marker || '%')
         or (coalesce(is_feedback_task, false) = true and task_template_id = p_task_template_id)
       )
     order by coalesce(completed, false) desc, created_at asc, id asc
     limit 1;

    if v_feedback_task_id is null then
        insert into public.activity_tasks (
            activity_id,
            task_template_id,
            feedback_template_id,
            is_feedback_task,
            title,
            description,
            reminder_minutes
        ) values (
            p_activity_id,
            null,
            p_task_template_id,
            true,
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
               feedback_template_id = p_task_template_id,
               is_feedback_task = true,
               task_template_id = null,
               updated_at = now()
         where id = v_feedback_task_id;
    end if;
end;
$$;

with feedback_candidates as (
  select
    at.id,
    at.activity_id,
    coalesce(
      nullif(at.feedback_template_id::text, ''),
      nullif(
        split_part(
          split_part(coalesce(at.description, ''), '[auto-after-training:', 2),
          ']',
          1
        ),
        ''
      )
    ) as template_id_text,
    at.created_at,
    coalesce(at.completed, false) as completed
  from public.activity_tasks at
  where at.feedback_template_id is not null
     or coalesce(at.is_feedback_task, false) = true
     or at.description like '%[auto-after-training:%'
),
normalized as (
  select
    fc.id,
    fc.template_id_text::uuid as template_id
  from feedback_candidates fc
  where fc.template_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
update public.activity_tasks at
   set feedback_template_id = n.template_id,
       is_feedback_task = true,
       task_template_id = null,
       updated_at = now()
  from normalized n
 where at.id = n.id;

with feedback_candidates as (
  select
    at.id,
    at.activity_id,
    coalesce(
      nullif(at.feedback_template_id::text, ''),
      nullif(
        split_part(
          split_part(coalesce(at.description, ''), '[auto-after-training:', 2),
          ']',
          1
        ),
        ''
      )
    ) as template_id_text,
    at.created_at,
    coalesce(at.completed, false) as completed
  from public.activity_tasks at
  where at.feedback_template_id is not null
     or coalesce(at.is_feedback_task, false) = true
     or at.description like '%[auto-after-training:%'
),
ranked as (
  select
    id,
    activity_id,
    template_id_text,
    row_number() over (
      partition by activity_id, template_id_text
      order by completed desc, created_at asc, id asc
    ) as rn
  from feedback_candidates
  where template_id_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
)
delete from public.activity_tasks at
using ranked r
where at.id = r.id
  and r.rn > 1;
