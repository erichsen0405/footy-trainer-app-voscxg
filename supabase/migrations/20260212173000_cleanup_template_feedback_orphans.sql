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
  v_local_meta_ids uuid[] := array[]::uuid[];
  v_template_title text := nullif(trim(coalesce(p_template_title, '')), '');
  v_feedback_title_norm text := null;
begin
  if p_user_id is null or p_template_id is null then
    return;
  end if;

  select coalesce(array_remove(array_agg(id), null), array[]::uuid[])
    into v_activity_ids
    from public.activities
   where user_id = p_user_id;

  select coalesce(array_remove(array_agg(id), null), array[]::uuid[])
    into v_local_meta_ids
    from public.events_local_meta
   where user_id = p_user_id;

  -- Remove activity task subtasks for both base template tasks and feedback tasks.
  delete from public.activity_task_subtasks ast
   using public.activity_tasks at
   where ast.activity_task_id = at.id
     and at.activity_id = any(v_activity_ids)
     and (
       at.task_template_id = p_template_id
       or at.feedback_template_id = p_template_id
     );

  -- Remove all activity tasks tied to the template (base + feedback).
  delete from public.activity_tasks at
   where at.activity_id = any(v_activity_ids)
     and (
       at.task_template_id = p_template_id
       or at.feedback_template_id = p_template_id
     );

  -- Remove legacy marker-only feedback rows for this template.
  delete from public.activity_task_subtasks ast
   where ast.activity_task_id in (
     select at.id
       from public.activity_tasks at
      where at.activity_id = any(v_activity_ids)
        and at.task_template_id is null
        and at.description is not null
        and at.description like '%[auto-after-training:' || p_template_id::text || ']%'
   );

  delete from public.activity_tasks at
   where at.activity_id = any(v_activity_ids)
     and at.task_template_id is null
     and at.description is not null
     and at.description like '%[auto-after-training:' || p_template_id::text || ']%';

  -- Remove all external tasks tied to the template (base + feedback).
  delete from public.external_event_tasks eet
   where eet.local_meta_id = any(v_local_meta_ids)
     and (
       eet.task_template_id = p_template_id
       or eet.feedback_template_id = p_template_id
     );

  -- Remove recorded self-feedback entries for the template.
  delete from public.task_template_self_feedback ttsf
   where ttsf.user_id = p_user_id
     and ttsf.task_template_id = p_template_id;

  -- Defensive cleanup: remove remaining orphan feedback rows by title for this template.
  if v_template_title is not null then
    v_feedback_title_norm :=
      lower(
        trim(
          regexp_replace(
            translate('feedback pa ' || v_template_title, 'åÅæÆøØ', 'aaaeoeoe'),
            '\s+',
            ' ',
            'g'
          )
        )
      );

    delete from public.activity_task_subtasks ast
     where ast.activity_task_id in (
       select at.id
         from public.activity_tasks at
         join public.activities a on a.id = at.activity_id
        where a.user_id = p_user_id
          and at.task_template_id is null
          and coalesce(at.feedback_template_id, p_template_id) = p_template_id
          and lower(
                trim(
                  regexp_replace(
                    translate(coalesce(at.title, ''), 'åÅæÆøØ', 'aaaeoeoe'),
                    '\s+',
                    ' ',
                    'g'
                  )
                )
              ) = v_feedback_title_norm
     );

    delete from public.activity_tasks at
     using public.activities a
     where at.activity_id = a.id
       and a.user_id = p_user_id
       and at.task_template_id is null
       and coalesce(at.feedback_template_id, p_template_id) = p_template_id
       and lower(
             trim(
               regexp_replace(
                 translate(coalesce(at.title, ''), 'åÅæÆøØ', 'aaaeoeoe'),
                 '\s+',
                 ' ',
                 'g'
               )
             )
           ) = v_feedback_title_norm;
  end if;

  return;
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
begin
  perform public.cleanup_tasks_for_template(p_user_id, p_template_id, null);
  return;
end;
$$;
