create table if not exists public.task_template_self_feedback (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    task_template_id uuid not null references public.task_templates (id) on delete cascade,
    activity_id uuid not null references public.activities (id) on delete cascade,
    rating integer check (rating between 1 and 10),
    note text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint task_template_self_feedback_owner_key unique (user_id, task_template_id, activity_id)
);

create index if not exists task_template_self_feedback_user_template_idx
    on public.task_template_self_feedback (user_id, task_template_id);

create index if not exists task_template_self_feedback_template_created_idx
    on public.task_template_self_feedback (task_template_id, created_at desc);

alter table public.task_template_self_feedback enable row level security;

drop policy if exists "task_template_self_feedback_select" on public.task_template_self_feedback;
create policy "task_template_self_feedback_select"
    on public.task_template_self_feedback
    for select
    using (
        auth.uid() = user_id
        or exists (
            select 1
            from public.admin_player_relationships apr
            where apr.admin_id = auth.uid()
              and apr.player_id = user_id
        )
    );

drop policy if exists "task_template_self_feedback_insert" on public.task_template_self_feedback;
create policy "task_template_self_feedback_insert"
    on public.task_template_self_feedback
    for insert
    with check (
        auth.uid() = user_id
        or exists (
            select 1
            from public.admin_player_relationships apr
            where apr.admin_id = auth.uid()
              and apr.player_id = user_id
        )
    );

drop policy if exists "task_template_self_feedback_update" on public.task_template_self_feedback;
create policy "task_template_self_feedback_update"
    on public.task_template_self_feedback
    for update
    using (
        auth.uid() = user_id
        or exists (
            select 1
            from public.admin_player_relationships apr
            where apr.admin_id = auth.uid()
              and apr.player_id = user_id
        )
    )
    with check (
        auth.uid() = user_id
        or exists (
            select 1
            from public.admin_player_relationships apr
            where apr.admin_id = auth.uid()
              and apr.player_id = user_id
        )
    );

create trigger update_task_template_self_feedback_timestamp
    before update on public.task_template_self_feedback
    for each row
    execute function public.trigger_update_timestamp();

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
begin
    if p_activity_id is null or p_task_template_id is null then
        return;
    end if;

    v_feedback_title := 'Feedback på ' || coalesce(nullif(trim(p_base_title), ''), 'opgaven');
    v_marker := '[auto-after-training:' || p_task_template_id::text || ']';
    v_description := 'Del din feedback efter træningen direkte til træneren. ' || v_marker;

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
            null
        )
        returning id into v_feedback_task_id;
    else
        update public.activity_tasks
           set title = v_feedback_title,
               description = v_description,
               updated_at = now()
         where id = v_feedback_task_id;
    end if;
end;
$$;

create or replace function public.trigger_insert_activity_task_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_after_training boolean;
    v_template_title text;
begin
    if new.task_template_id is null then
        return new;
    end if;

    select after_training_enabled, title
      into v_after_training, v_template_title
      from public.task_templates
     where id = new.task_template_id;

    if coalesce(v_after_training, false) then
        perform public.upsert_after_training_feedback_task(
            new.activity_id,
            new.task_template_id,
            coalesce(new.title, v_template_title)
        );
    end if;

    return new;
end;
$$;

drop trigger if exists activity_tasks_after_training_feedback on public.activity_tasks;
create trigger activity_tasks_after_training_feedback
    after insert on public.activity_tasks
    for each row
    when (new.task_template_id is not null)
    execute function public.trigger_insert_activity_task_feedback();

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

      perform public.upsert_after_training_feedback_task(p_activity_id, v_template.id, v_template.title);
    end if;
  end loop;
end;
$$;

-- Remove legacy feedback tasks without template markers so the helper can rebuild them correctly
delete from public.activity_tasks
 where task_template_id is null
   and description like '%[auto-after-training]%'
   and description not like '%[auto-after-training:%';

-- Normalize existing marker-based feedback tasks so titles and descriptions follow the new convention
with parsed as (
  select
    t.id,
    t.activity_id,
    (regexp_matches(
      t.description,
      '\\[auto-after-training:([0-9a-f-]{8}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{4}-[0-9a-f-]{12})\\]'
    ))[1]::uuid as template_id
  from public.activity_tasks t
  where t.task_template_id is null
    and t.description like '%[auto-after-training:%'
)
update public.activity_tasks tgt
set
  title = 'Feedback på ' || coalesce(primary_task.title, template.title, 'opgaven'),
  description = 'Del din feedback efter træningen direkte til træneren. [auto-after-training:' || parsed.template_id::text || ']'
  , updated_at = now()
from parsed
left join public.task_templates template
  on template.id = parsed.template_id
left join public.activity_tasks primary_task
  on primary_task.activity_id = parsed.activity_id
 and primary_task.task_template_id = parsed.template_id
where tgt.id = parsed.id;

-- Ensure each template with after-training enabled has a dedicated feedback task per activity
DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    select at.activity_id, at.task_template_id, at.title
      from public.activity_tasks at
      join public.task_templates tt on tt.id = at.task_template_id
     where coalesce(tt.after_training_enabled, false)
  LOOP
    perform public.upsert_after_training_feedback_task(rec.activity_id, rec.task_template_id, rec.title);
  END LOOP;
END $$;
