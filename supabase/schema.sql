


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."calculate_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) RETURNS TABLE("percentage" integer, "completed_tasks" integer, "total_tasks" integer, "trophy_type" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_completed integer;
  v_total integer;
  v_percentage integer;
  v_trophy text;
begin
  -- Calculate completed and total tasks for the week
  select
    count(*) filter (where at.completed = true),
    count(*)
  into v_completed, v_total
  from activities a
  join activity_tasks at on at.activity_id = a.id
  where a.user_id = p_user_id
  and extract(week from a.activity_date) = p_week_number
  and extract(year from a.activity_date) = p_year;

  -- Calculate percentage
  if v_total > 0 then
    v_percentage := round((v_completed::numeric / v_total::numeric) * 100);
  else
    v_percentage := 0;
  end if;

  -- Determine trophy type
  if v_percentage >= 80 then
    v_trophy := 'gold';
  elsif v_percentage >= 60 then
    v_trophy := 'silver';
  else
    v_trophy := 'bronze';
  end if;

  return query select v_percentage, v_completed, v_total, v_trophy;
end;
$$;


ALTER FUNCTION "public"."calculate_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_player_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  admin_user_id UUID;
  current_player_count INTEGER;
  max_allowed_players INTEGER;
  subscription_status TEXT;
BEGIN
  -- Get the admin_id from the new relationship
  admin_user_id := NEW.admin_id;
  
  -- Count current players for this admin
  SELECT COUNT(*) INTO current_player_count
  FROM admin_player_relationships
  WHERE admin_id = admin_user_id;
  
  -- Get the admin's subscription details
  SELECT s.status, sp.max_players INTO subscription_status, max_allowed_players
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.admin_id = admin_user_id
    AND s.status IN ('trial', 'active')
  ORDER BY s.created_at DESC
  LIMIT 1;
  
  -- If no active subscription, allow 0 players (admin only)
  IF subscription_status IS NULL THEN
    RAISE EXCEPTION 'No active subscription found. Please subscribe to add players.';
  END IF;
  
  -- Check if adding this player would exceed the limit
  IF current_player_count >= max_allowed_players THEN
    RAISE EXCEPTION 'Player limit reached. Your plan allows % player(s). Please upgrade your subscription.', max_allowed_players;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_player_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- Remove template-backed tasks + subtasks across user activities
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

  -- Remove auto after-training tasks + subtasks across user activities
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

  -- External events
  delete from public.external_event_tasks eet
  using public.events_local_meta elm
   where eet.local_meta_id = elm.id
     and elm.user_id = p_user_id
     and eet.task_template_id = p_template_id;

  -- Self feedback rows
  delete from public.task_template_self_feedback
   where user_id = p_user_id
     and task_template_id = p_template_id;

  return;
end;
$$;


ALTER FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid", "p_template_title" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid", "p_template_title" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_admin_player_relationship"("p_admin_id" "uuid", "p_player_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO admin_player_relationships (admin_id, player_id)
  VALUES (p_admin_id, p_player_id)
  ON CONFLICT DO NOTHING;
END;
$$;


ALTER FUNCTION "public"."create_admin_player_relationship"("p_admin_id" "uuid", "p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_player_profile"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO profiles (user_id, full_name, phone_number)
  VALUES (p_user_id, p_full_name, p_phone_number)
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      phone_number = EXCLUDED.phone_number,
      updated_at = now();
END;
$$;


ALTER FUNCTION "public"."create_player_profile"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_player_role"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  INSERT INTO user_roles (user_id, role)
  VALUES (p_user_id, 'player')
  ON CONFLICT (user_id) DO UPDATE
  SET role = 'player',
      updated_at = now();
END;
$$;


ALTER FUNCTION "public"."create_player_role"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_tasks_for_activity"("p_activity_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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

  -- 1) Remove ALL auto after-training tasks for this activity (and their subtasks)
  delete from public.activity_task_subtasks
   where activity_task_id in (
     select id
       from public.activity_tasks
      where activity_id = p_activity_id
        and task_template_id is null
        and description is not null
        and description like '%[auto-after-training:%'
   );

  delete from public.activity_tasks
   where activity_id = p_activity_id
     and task_template_id is null
     and description is not null
     and description like '%[auto-after-training:%';

  -- 2) Remove orphaned template-backed tasks (template no longer applies) + subtasks
  delete from public.activity_task_subtasks
   where activity_task_id in (
     select id
       from public.activity_tasks
      where activity_id = p_activity_id
        and task_template_id is not null
        and (
          coalesce(array_length(v_template_ids, 1), 0) = 0
          or not (task_template_id = any(v_template_ids))
        )
   );

  delete from public.activity_tasks
   where activity_id = p_activity_id
     and task_template_id is not null
     and (
       coalesce(array_length(v_template_ids, 1), 0) = 0
       or not (task_template_id = any(v_template_ids))
     );

  -- 3) Upsert current template-backed tasks + subtasks; re-create after-training tasks only when enabled
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
        p_activity_id := p_activity_id,
        p_task_template_id := v_template.id,
        p_base_title := v_template.title
      );
    end if;
  end loop;
end;
$$;


ALTER FUNCTION "public"."create_tasks_for_activity"("p_activity_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_tasks_for_external_event"("p_local_meta_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_category_id uuid;
  v_user_id uuid;
  v_template record;
  v_existing_task_id uuid;
BEGIN
  -- Get the category and user from the local metadata
  SELECT category_id, user_id
  INTO v_category_id, v_user_id
  FROM events_local_meta
  WHERE id = p_local_meta_id;

  -- If no category, exit
  IF v_category_id IS NULL THEN
    RETURN;
  END IF;

  -- Loop through all task templates for this category
  FOR v_template IN
    SELECT DISTINCT tt.*
    FROM task_templates tt
    JOIN task_template_categories ttc ON ttc.task_template_id = tt.id
    WHERE ttc.category_id = v_category_id
    AND tt.user_id = v_user_id
  LOOP
    -- Check if task already exists
    SELECT id INTO v_existing_task_id
    FROM external_event_tasks
    WHERE local_meta_id = p_local_meta_id
    AND task_template_id = v_template.id;

    IF v_existing_task_id IS NOT NULL THEN
      -- Task exists - UPDATE it
      UPDATE external_event_tasks
      SET 
        title = v_template.title,
        description = v_template.description,
        reminder_minutes = v_template.reminder_minutes,
        updated_at = now()
      WHERE id = v_existing_task_id;
    ELSE
      -- Task doesn't exist - CREATE it
      INSERT INTO external_event_tasks (
        local_meta_id,
        task_template_id,
        title,
        description,
        reminder_minutes
      )
      VALUES (
        p_local_meta_id,
        v_template.id,
        v_template.title,
        v_template.description,
        v_template.reminder_minutes
      );
    END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."create_tasks_for_external_event"("p_local_meta_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fix_missing_activity_tasks"() RETURNS TABLE("activity_id" "uuid", "tasks_created" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_activity RECORD;
  v_tasks_before integer;
  v_tasks_after integer;
BEGIN
  -- Loop through all non-external activities with categories
  FOR v_activity IN
    SELECT a.id, a.category_id, a.user_id
    FROM activities a
    WHERE a.is_external = false
      AND a.category_id IS NOT NULL
  LOOP
    -- Count existing tasks
    SELECT COUNT(*) INTO v_tasks_before
    FROM activity_tasks
    WHERE activity_tasks.activity_id = v_activity.id;
    
    -- Check if there are task templates for this category
    IF EXISTS (
      SELECT 1
      FROM task_templates tt
      JOIN task_template_categories ttc ON tt.id = ttc.task_template_id
      WHERE ttc.category_id = v_activity.category_id
        AND tt.user_id = v_activity.user_id
    ) THEN
      -- Delete existing template-linked tasks to avoid duplicates
      DELETE FROM activity_tasks
      WHERE activity_tasks.activity_id = v_activity.id
        AND task_template_id IS NOT NULL;
      
      -- Create tasks for this activity
      PERFORM create_tasks_for_activity(v_activity.id);
      
      -- Count tasks after
      SELECT COUNT(*) INTO v_tasks_after
      FROM activity_tasks
      WHERE activity_tasks.activity_id = v_activity.id;
      
      -- Return result if tasks were created
      IF v_tasks_after > v_tasks_before THEN
        activity_id := v_activity.id;
        tasks_created := v_tasks_after - v_tasks_before;
        RETURN NEXT;
      END IF;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$;


ALTER FUNCTION "public"."fix_missing_activity_tasks"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_admins"("p_player_id" "uuid") RETURNS TABLE("admin_id" "uuid", "admin_email" "text", "created_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    apr.admin_id,
    au.email::TEXT,
    apr.created_at
  FROM admin_player_relationships apr
  JOIN auth.users au ON au.id = apr.admin_id
  WHERE apr.player_id = p_player_id;
END;
$$;


ALTER FUNCTION "public"."get_player_admins"("p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_subscription_status"("user_id" "uuid") RETURNS TABLE("has_subscription" boolean, "status" "text", "plan_name" "text", "max_players" integer, "current_players" integer, "trial_end" timestamp with time zone, "current_period_end" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE WHEN s.id IS NOT NULL THEN true ELSE false END as has_subscription,
    s.status,
    sp.name as plan_name,
    sp.max_players,
    (SELECT COUNT(*)::INTEGER FROM admin_player_relationships WHERE admin_id = user_id) as current_players,
    s.trial_end,
    s.current_period_end
  FROM subscriptions s
  JOIN subscription_plans sp ON s.plan_id = sp.id
  WHERE s.admin_id = user_id
    AND s.status IN ('trial', 'active')
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;


ALTER FUNCTION "public"."get_subscription_status"("user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_library_exercises"("p_user_id" "uuid") RETURNS TABLE("id" "text", "trainer_id" "text", "title" "text", "description" "text", "video_url" "text", "thumbnail_url" "text", "created_at" "text", "updated_at" "text", "is_system" boolean, "category_path" "text", "difficulty" integer, "position" "text", "trainer_name" "text", "last_score" integer, "execution_count" integer, "is_added_to_tasks" boolean)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  with src as (
    select
      t.id::text as base_id,
      to_jsonb(t) as j
    from public.task_templates t
  ),
  parsed as (
    select
      base_id,
      j,
      case
        when j->>'difficulty' ~ '^[0-9]+$' then (j->>'difficulty')::int
        when j->>'stars' ~ '^[0-9]+$' then (j->>'stars')::int
        else null
      end as safe_difficulty,
      coalesce(
        case
          when lower(nullif(j->>'is_system','')) in ('true','t','1','yes') then true
          when lower(nullif(j->>'is_system','')) in ('false','f','0','no') then false
          else null
        end,
        case
          when lower(nullif(j->>'isSystem','')) in ('true','t','1','yes') then true
          when lower(nullif(j->>'isSystem','')) in ('false','f','0','no') then false
          else null
        end,
        case
          when lower(nullif(j->>'system','')) in ('true','t','1','yes') then true
          when lower(nullif(j->>'system','')) in ('false','f','0','no') then false
          else null
        end,
        case
          when lower(nullif(j->>'is_default','')) in ('true','t','1','yes') then true
          when lower(nullif(j->>'is_default','')) in ('false','f','0','no') then false
          else null
        end,
        false
      ) as safe_is_system,
      coalesce(
        case
          when lower(nullif(j->>'is_added_to_tasks','')) in ('true','t','1','yes') then true
          when lower(nullif(j->>'is_added_to_tasks','')) in ('false','f','0','no') then false
          else null
        end,
        case
          when lower(nullif(j->>'added_to_tasks','')) in ('true','t','1','yes') then true
          when lower(nullif(j->>'added_to_tasks','')) in ('false','f','0','no') then false
          else null
        end,
        case
          when lower(nullif(j->>'isAddedToTasks','')) in ('true','t','1','yes') then true
          when lower(nullif(j->>'isAddedToTasks','')) in ('false','f','0','no') then false
          else null
        end,
        false
      ) as safe_is_added_to_tasks,
      coalesce(
        nullif(j->>'trainer_id',''),
        nullif(j->>'created_by',''),
        nullif(j->>'user_id',''),
        nullif(j->>'owner_id',''),
        ''
      ) as safe_trainer_id
    from src
  )
  select
    coalesce(
      nullif(j->>'id',''),
      nullif(j->>'exercise_id',''),
      nullif(j->>'template_id',''),
      base_id
    ) as id,
    safe_trainer_id as trainer_id,
    coalesce(nullif(j->>'title',''), nullif(j->>'name',''), '') as title,
    nullif(coalesce(j->>'description', j->>'notes', ''), '') as description,
    nullif(coalesce(j->>'video_url', j->>'video', ''), '') as video_url,
    nullif(coalesce(j->>'thumbnail_url', j->>'thumbnail', j->>'image_url', ''), '') as thumbnail_url,
    coalesce(nullif(j->>'created_at',''), now()::text) as created_at,
    coalesce(nullif(j->>'updated_at',''), nullif(j->>'created_at',''), now()::text) as updated_at,
    safe_is_system as is_system,
    nullif(coalesce(j->>'category_path', j->>'category', j->>'folder_id', j->>'source_folder', ''), '') as category_path,
    safe_difficulty as difficulty,
    nullif(coalesce(j->>'position', j->>'player_position', ''), '') as "position",
    nullif(coalesce(j->>'trainer_name', j->>'author_name', ''), '') as trainer_name,
    null::int as last_score,
    null::int as execution_count,
    safe_is_added_to_tasks as is_added_to_tasks
  from parsed
  where safe_is_system = true
     or safe_trainer_id = p_user_id::text;
$_$;


ALTER FUNCTION "public"."get_user_library_exercises"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"("p_user_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN (
    SELECT role FROM user_roles
    WHERE user_id = p_user_id
    LIMIT 1
  );
END;
$$;


ALTER FUNCTION "public"."get_user_role"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  user_role TEXT;
  plan_id UUID;
  trial_end TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Get role and plan_id from user metadata
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'player');
  plan_id := (NEW.raw_user_meta_data->>'plan_id')::UUID;
  
  -- Insert user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, user_role)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Create profile
  INSERT INTO public.profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  
  -- If plan_id is provided, create subscription
  IF plan_id IS NOT NULL THEN
    trial_end := NOW() + INTERVAL '14 days';
    
    INSERT INTO public.subscriptions (
      admin_id,
      plan_id,
      status,
      trial_start,
      trial_end,
      current_period_start,
      current_period_end,
      cancel_at_period_end
    )
    VALUES (
      NEW.id,
      plan_id,
      'trial',
      NOW(),
      trial_end,
      NOW(),
      trial_end,
      false
    )
    ON CONFLICT DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = p_user_id AND role = 'admin'
  );
END;
$$;


ALTER FUNCTION "public"."is_admin"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."migrate_external_activities"() RETURNS TABLE("migrated_count" integer, "error_count" integer)
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_migrated_count INTEGER := 0;
  v_error_count INTEGER := 0;
  v_activity RECORD;
  v_external_event_id UUID;
BEGIN
  -- Migrate external activities
  FOR v_activity IN 
    SELECT * FROM activities WHERE is_external = TRUE
  LOOP
    BEGIN
      -- Insert into events_external
      INSERT INTO events_external (
        provider,
        provider_event_uid,
        provider_calendar_id,
        title,
        description,
        location,
        start_date,
        start_time,
        end_date,
        end_time,
        is_all_day,
        external_last_modified,
        fetched_at,
        created_at,
        updated_at
      ) VALUES (
        'ics',
        COALESCE(v_activity.external_event_id, 'migrated-' || v_activity.id::text),
        v_activity.external_calendar_id,
        v_activity.title,
        NULL,
        v_activity.location,
        v_activity.activity_date,
        v_activity.activity_time,
        v_activity.activity_date,
        v_activity.activity_time,
        FALSE,
        v_activity.updated_at,
        v_activity.created_at,
        v_activity.created_at,
        v_activity.updated_at
      )
      ON CONFLICT (provider_calendar_id, provider_event_uid, recurrence_id) 
      DO UPDATE SET updated_at = EXCLUDED.updated_at
      RETURNING id INTO v_external_event_id;
      
      -- Insert into events_local_meta
      INSERT INTO events_local_meta (
        external_event_id,
        user_id,
        category_id,
        manually_set_category,
        category_updated_at,
        last_local_modified,
        created_at,
        updated_at
      ) VALUES (
        v_external_event_id,
        v_activity.user_id,
        v_activity.category_id,
        COALESCE(v_activity.manually_set_category, FALSE),
        v_activity.category_updated_at,
        v_activity.updated_at,
        v_activity.created_at,
        v_activity.updated_at
      )
      ON CONFLICT (external_event_id, user_id) DO NOTHING;
      
      v_migrated_count := v_migrated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      RAISE NOTICE 'Error migrating activity %: %', v_activity.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_migrated_count, v_error_count;
END;
$$;


ALTER FUNCTION "public"."migrate_external_activities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_data_for_user"("p_user_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_cat_training uuid;
  v_cat_strength uuid;
  v_cat_vr uuid;
  v_cat_match uuid;
  v_cat_tournament uuid;
  v_cat_meeting uuid;
  v_cat_sprint uuid;
  v_cat_other uuid;
  v_task_vr uuid;
  v_task_focus_training uuid;
  v_task_breathing uuid;
  v_task_strength uuid;
  v_task_pack uuid;
  v_task_focus_match uuid;
begin
  -- Get system category IDs instead of creating new ones
  SELECT id INTO v_cat_training FROM activity_categories WHERE is_system = TRUE AND name = 'Træning' LIMIT 1;
  SELECT id INTO v_cat_match FROM activity_categories WHERE is_system = TRUE AND name = 'Kamp' LIMIT 1;
  SELECT id INTO v_cat_tournament FROM activity_categories WHERE is_system = TRUE AND name = 'Turnering' LIMIT 1;
  SELECT id INTO v_cat_meeting FROM activity_categories WHERE is_system = TRUE AND name = 'Møde' LIMIT 1;
  SELECT id INTO v_cat_strength FROM activity_categories WHERE is_system = TRUE AND name = 'Fysisk træning' LIMIT 1;
  SELECT id INTO v_cat_vr FROM activity_categories WHERE is_system = TRUE AND name = 'VR træning' LIMIT 1;
  SELECT id INTO v_cat_sprint FROM activity_categories WHERE is_system = TRUE AND name = 'Sprinttræning' LIMIT 1;
  SELECT id INTO v_cat_other FROM activity_categories WHERE is_system = TRUE AND name = 'Andet' LIMIT 1;

  -- Create default task templates
  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'VR træning', 'Gennemfør VR træning', 15)
  returning id into v_task_vr;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Fokuspunkter til træning', 'Gennemgå fokuspunkter', 45)
  returning id into v_task_focus_training;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Åndedrætsøvelser', 'Udfør åndedrætsøvelser', 15)
  returning id into v_task_breathing;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Styrketræning', 'Gennemfør styrketræning', 15)
  returning id into v_task_strength;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Pak fodboldtaske', 'Pak alt nødvendigt udstyr', 90)
  returning id into v_task_pack;

  insert into task_templates (user_id, title, description, reminder_minutes)
  values (p_user_id, 'Fokuspunkter til kamp', 'Gennemgå fokuspunkter', 60)
  returning id into v_task_focus_match;

  -- Link tasks to system categories
  insert into task_template_categories (task_template_id, category_id)
  values
    (v_task_vr, v_cat_vr),
    (v_task_focus_training, v_cat_training),
    (v_task_breathing, v_cat_training),
    (v_task_breathing, v_cat_match),
    (v_task_breathing, v_cat_tournament),
    (v_task_strength, v_cat_strength),
    (v_task_pack, v_cat_training),
    (v_task_pack, v_cat_match),
    (v_task_pack, v_cat_tournament),
    (v_task_focus_match, v_cat_match);
end;
$$;


ALTER FUNCTION "public"."seed_default_data_for_user"("p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_cleanup_tasks_on_template_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if old.user_id is not null then
    perform public.cleanup_tasks_for_template(old.user_id, old.id, old.title);
  end if;

  return old;
end;
$$;


ALTER FUNCTION "public"."trigger_cleanup_tasks_on_template_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_cleanup_tasks_on_template_hide"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.user_id is not null and new.task_template_id is not null then
    perform public.cleanup_tasks_for_template(new.user_id, new.task_template_id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_cleanup_tasks_on_template_hide"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_create_tasks_for_activity"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Only create tasks if the activity has a category and is not external
  if new.category_id is not null and new.is_external = false then
    perform create_tasks_for_activity(new.id);
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_create_tasks_for_activity"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_create_tasks_for_external_event"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- Only create tasks if the category is set
  IF NEW.category_id IS NOT NULL THEN
    -- If this is an insert or the category changed
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
      -- Delete existing tasks that are linked to templates (if category changed)
      IF TG_OP = 'UPDATE' THEN
        DELETE FROM external_event_tasks
        WHERE local_meta_id = NEW.id
        AND task_template_id IS NOT NULL;
      END IF;
      
      -- Create new tasks based on category
      PERFORM create_tasks_for_external_event(NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_create_tasks_for_external_event"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_fix_external_tasks_on_template_category_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- When a task template is assigned to a new category, create tasks for all external events in that category
  IF TG_OP = 'INSERT' THEN
    -- Get the user_id from the task template
    PERFORM create_tasks_for_external_event(elm.id)
    FROM events_local_meta elm
    JOIN task_templates tt ON tt.id = NEW.task_template_id
    WHERE elm.category_id = NEW.category_id
      AND elm.user_id = tt.user_id;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_fix_external_tasks_on_template_category_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_fix_tasks_on_template_category_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  -- When a task template is assigned to a new category, create tasks for all activities in that category
  IF TG_OP = 'INSERT' THEN
    -- Get the user_id from the task template
    PERFORM create_tasks_for_activity(a.id)
    FROM activities a
    JOIN task_templates tt ON tt.id = NEW.task_template_id
    WHERE a.category_id = NEW.category_id
      AND a.user_id = tt.user_id
      AND a.is_external = false;
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trigger_fix_tasks_on_template_category_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_insert_activity_task_feedback"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."trigger_insert_activity_task_feedback"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_seed_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  perform public.seed_default_data_for_user(new.id);
  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_seed_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_tasks_on_category_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- If category changed and not external
  if new.category_id is distinct from old.category_id and new.is_external = false then
    -- Delete existing tasks that are linked to templates
    delete from activity_tasks
    where activity_id = new.id
    and task_template_id is not null;
    
    -- Create new tasks based on new category
    if new.category_id is not null then
      perform create_tasks_for_activity(new.id);
    end if;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_update_tasks_on_category_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_tasks_on_subtask_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_template_id uuid;
begin
  v_template_id := coalesce(new.task_template_id, old.task_template_id);

  if v_template_id is not null then
    perform public.update_all_tasks_from_template(v_template_id, false);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_update_tasks_on_subtask_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_tasks_on_template_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' then
    if new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.reminder_minutes is distinct from old.reminder_minutes
       or new.after_training_enabled is distinct from old.after_training_enabled
       or new.after_training_delay_minutes is distinct from old.after_training_delay_minutes then
      perform public.update_all_tasks_from_template(new.id, false);
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_update_tasks_on_template_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_timestamp"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."trigger_update_timestamp"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_update_weekly_performance"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_user_id uuid;
  v_activity_date date;
  v_week_number integer;
  v_year integer;
begin
  -- Get activity info
  -- For DELETE operations, the activity might already be deleted, so we need to handle that
  select a.user_id, a.activity_date
  into v_user_id, v_activity_date
  from activities a
  where a.id = coalesce(new.activity_id, old.activity_id);

  -- If we couldn't find the activity (it was deleted), skip the update
  -- This prevents the NULL user_id error
  if v_user_id is null then
    return coalesce(new, old);
  end if;

  -- Calculate week and year
  v_week_number := extract(week from v_activity_date);
  v_year := extract(year from v_activity_date);

  -- Update performance
  perform update_weekly_performance(v_user_id, v_week_number, v_year);

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."trigger_update_weekly_performance"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_all_tasks_from_template"("p_template_id" "uuid", "p_dry_run" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_activity_ids uuid[] := array[]::uuid[];
  v_series_ids uuid[] := array[]::uuid[];
  v_series_activity_ids uuid[] := array[]::uuid[];
  v_external_ids uuid[] := array[]::uuid[];
  v_activity_id uuid;
  v_local_meta_id uuid;
  v_direct_count integer := 0;
  v_series_count integer := 0;
  v_series_activity_count integer := 0;
  v_total_activity_updates integer := 0;
  v_external_count integer := 0;
  v_result jsonb;
begin
  if p_template_id is null then
    return jsonb_build_object(
      'templateId', null,
      'seriesCount', 0,
      'directActivityUpdates', 0,
      'seriesActivityUpdates', 0,
      'totalActivityUpdates', 0,
      'externalEventUpdates', 0,
      'dryRun', p_dry_run
    );
  end if;

  select coalesce(array_remove(array_agg(distinct at.activity_id), null), array[]::uuid[])
    into v_activity_ids
    from public.activity_tasks at
    where at.task_template_id = p_template_id;

  select coalesce(array_remove(array_agg(distinct a.series_id), null), array[]::uuid[])
    into v_series_ids
    from public.activity_tasks at
    join public.activities a on a.id = at.activity_id
    where at.task_template_id = p_template_id
      and a.series_id is not null;

  if coalesce(array_length(v_series_ids, 1), 0) > 0 then
    select coalesce(array_remove(array_agg(distinct a2.id), null), array[]::uuid[])
      into v_series_activity_ids
      from public.activities a2
      where a2.series_id = any(v_series_ids)
        and not (a2.id = any(v_activity_ids));
  else
    v_series_activity_ids := array[]::uuid[];
  end if;

  select coalesce(array_remove(array_agg(distinct eet.local_meta_id), null), array[]::uuid[])
    into v_external_ids
    from public.external_event_tasks eet
    where eet.task_template_id = p_template_id;

  v_direct_count := coalesce(array_length(v_activity_ids, 1), 0);
  v_series_count := coalesce(array_length(v_series_ids, 1), 0);
  v_series_activity_count := coalesce(array_length(v_series_activity_ids, 1), 0);
  v_external_count := coalesce(array_length(v_external_ids, 1), 0);
  v_total_activity_updates := v_direct_count + v_series_activity_count;

  if not p_dry_run then
    foreach v_activity_id in array v_activity_ids loop
      perform public.create_tasks_for_activity(v_activity_id);
    end loop;

    foreach v_activity_id in array v_series_activity_ids loop
      perform public.create_tasks_for_activity(v_activity_id);
    end loop;

    foreach v_local_meta_id in array v_external_ids loop
      perform public.create_tasks_for_external_event(v_local_meta_id);
    end loop;

    raise notice '[SERIES_FEEDBACK_SYNC] template=% series=% activities=% external=%',
      p_template_id,
      v_series_count,
      v_total_activity_updates,
      v_external_count;
  end if;

  v_result := jsonb_build_object(
    'templateId', p_template_id,
    'seriesCount', v_series_count,
    'directActivityUpdates', v_direct_count,
    'seriesActivityUpdates', v_series_activity_count,
    'totalActivityUpdates', v_total_activity_updates,
    'externalEventUpdates', v_external_count,
    'dryRun', p_dry_run
  );

  return v_result;
end;
$$;


ALTER FUNCTION "public"."update_all_tasks_from_template"("p_template_id" "uuid", "p_dry_run" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_category_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Only update category_updated_at if category_id actually changed
  IF (TG_OP = 'UPDATE' AND OLD.category_id IS DISTINCT FROM NEW.category_id) THEN
    NEW.category_updated_at = NOW();
  END IF;
  
  -- For new records, set category_updated_at to now
  IF (TG_OP = 'INSERT' AND NEW.category_updated_at IS NULL) THEN
    NEW.category_updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_category_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_profiles_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_profiles_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_series_activities"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  -- Update all activities in the series with the new information
  UPDATE activities
  SET
    title = NEW.title,
    location = NEW.location,
    category_id = NEW.category_id,
    activity_time = NEW.activity_time,
    updated_at = now()
  WHERE series_id = NEW.id;
  
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_series_activities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_stats record;
begin
  -- Safety check: if user_id is NULL, don't proceed
  if p_user_id is null then
    return;
  end if;

  -- Get the stats
  select * into v_stats
  from calculate_weekly_performance(p_user_id, p_week_number, p_year);

  -- Upsert the performance record
  insert into weekly_performance (
    user_id,
    week_number,
    year,
    trophy_type,
    percentage,
    completed_tasks,
    total_tasks
  )
  values (
    p_user_id,
    p_week_number,
    p_year,
    v_stats.trophy_type,
    v_stats.percentage,
    v_stats.completed_tasks,
    v_stats.total_tasks
  )
  on conflict (user_id, week_number, year)
  do update set
    trophy_type = excluded.trophy_type,
    percentage = excluded.percentage,
    completed_tasks = excluded.completed_tasks,
    total_tasks = excluded.total_tasks;
end;
$$;


ALTER FUNCTION "public"."update_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."upsert_after_training_feedback_task"("p_activity_id" "uuid", "p_task_template_id" "uuid", "p_base_title" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."upsert_after_training_feedback_task"("p_activity_id" "uuid", "p_task_template_id" "uuid", "p_base_title" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."activities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "activity_date" "date" NOT NULL,
    "activity_time" time without time zone NOT NULL,
    "location" "text",
    "category_id" "uuid",
    "is_external" boolean DEFAULT false NOT NULL,
    "external_calendar_id" "uuid",
    "external_event_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "series_id" "uuid",
    "series_instance_date" "date",
    "external_category" "text",
    "manually_set_category" boolean DEFAULT false,
    "category_updated_at" timestamp with time zone,
    "team_id" "uuid",
    "player_id" "uuid",
    "activity_end_time" "text",
    "intensity" integer,
    "intensity_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "activities_intensity_valid" CHECK ((("intensity" IS NULL) OR (("intensity" >= 1) AND ("intensity" <= 10))))
);


ALTER TABLE "public"."activities" OWNER TO "postgres";


COMMENT ON COLUMN "public"."activities"."manually_set_category" IS 'Set to TRUE when user manually changes the category. Prevents auto-sync from overwriting manual changes.';



COMMENT ON COLUMN "public"."activities"."category_updated_at" IS 'Timestamp of when the category was last changed. Used for conflict resolution during sync.';



CREATE TABLE IF NOT EXISTS "public"."events_external" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "provider_event_uid" "text" NOT NULL,
    "provider_calendar_id" "uuid",
    "recurrence_id" "text",
    "external_last_modified" timestamp with time zone,
    "fetched_at" timestamp with time zone DEFAULT "now"(),
    "raw_payload" "jsonb",
    "title" "text" NOT NULL,
    "description" "text",
    "location" "text",
    "start_date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_date" "date",
    "end_time" time without time zone,
    "is_all_day" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "miss_count" integer DEFAULT 0,
    "deleted" boolean DEFAULT false,
    CONSTRAINT "events_external_provider_check" CHECK (("provider" = ANY (ARRAY['ics'::"text", 'google'::"text", 'outlook'::"text", 'caldav'::"text"])))
);


ALTER TABLE "public"."events_external" OWNER TO "postgres";


COMMENT ON TABLE "public"."events_external" IS 'Stores raw external calendar event data from iCal/CalDAV/API sources';



COMMENT ON COLUMN "public"."events_external"."miss_count" IS 'Number of consecutive sync cycles where this event was not found in the feed';



COMMENT ON COLUMN "public"."events_external"."deleted" IS 'Soft delete flag - true when event is missing from feed beyond grace period';



CREATE TABLE IF NOT EXISTS "public"."events_local_meta" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "external_event_id" "uuid",
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid",
    "local_title_override" "text",
    "local_description" "text",
    "local_start_override" timestamp with time zone,
    "local_end_override" timestamp with time zone,
    "reminders" "jsonb" DEFAULT '[]'::"jsonb",
    "pinned" boolean DEFAULT false,
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb",
    "last_local_modified" timestamp with time zone DEFAULT "now"(),
    "manually_set_category" boolean DEFAULT false,
    "category_updated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "team_id" "uuid",
    "player_id" "uuid"
);


ALTER TABLE "public"."events_local_meta" OWNER TO "postgres";


COMMENT ON TABLE "public"."events_local_meta" IS 'User-specific metadata for external calendar events - each user manages their own event metadata';



COMMENT ON COLUMN "public"."events_local_meta"."manually_set_category" IS 'TRUE when user manually sets category - prevents sync from overwriting';



COMMENT ON COLUMN "public"."events_local_meta"."category_updated_at" IS 'Timestamp when category was last changed by user';



CREATE OR REPLACE VIEW "public"."activities_combined" AS
 SELECT COALESCE("elm"."id", "ee"."id") AS "id",
    "ee"."id" AS "external_event_id",
    "elm"."id" AS "local_meta_id",
    "elm"."user_id",
    COALESCE("elm"."local_title_override", "ee"."title") AS "title",
    COALESCE("elm"."local_description", "ee"."description") AS "description",
    "ee"."location",
    COALESCE("date"("elm"."local_start_override"), "ee"."start_date") AS "activity_date",
    COALESCE(("elm"."local_start_override")::time without time zone, "ee"."start_time") AS "activity_time",
    "elm"."category_id",
    "elm"."manually_set_category",
    "elm"."category_updated_at",
    "ee"."provider",
    "ee"."provider_event_uid" AS "external_event_uid",
    "ee"."provider_calendar_id" AS "external_calendar_id",
    "ee"."is_all_day",
    "elm"."reminders",
    "elm"."pinned",
    "elm"."custom_fields",
    "ee"."created_at",
    GREATEST("ee"."updated_at", COALESCE("elm"."updated_at", "ee"."updated_at")) AS "updated_at",
    "ee"."external_last_modified",
    "elm"."last_local_modified",
    true AS "is_external"
   FROM ("public"."events_external" "ee"
     LEFT JOIN "public"."events_local_meta" "elm" ON (("ee"."id" = "elm"."external_event_id")))
UNION ALL
 SELECT "a"."id",
    NULL::"uuid" AS "external_event_id",
    NULL::"uuid" AS "local_meta_id",
    "a"."user_id",
    "a"."title",
    NULL::"text" AS "description",
    "a"."location",
    "a"."activity_date",
    "a"."activity_time",
    "a"."category_id",
    "a"."manually_set_category",
    "a"."category_updated_at",
    'internal'::"text" AS "provider",
    NULL::"text" AS "external_event_uid",
    NULL::"uuid" AS "external_calendar_id",
    false AS "is_all_day",
    '[]'::"jsonb" AS "reminders",
    false AS "pinned",
    '{}'::"jsonb" AS "custom_fields",
    "a"."created_at",
    "a"."updated_at",
    NULL::timestamp with time zone AS "external_last_modified",
    NULL::timestamp with time zone AS "last_local_modified",
    false AS "is_external"
   FROM "public"."activities" "a"
  WHERE (("a"."is_external" = false) OR ("a"."is_external" IS NULL));


ALTER VIEW "public"."activities_combined" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "color" "text" NOT NULL,
    "emoji" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_id" "uuid",
    "player_id" "uuid",
    "is_system" boolean DEFAULT false
);


ALTER TABLE "public"."activity_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_series" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "location" "text",
    "category_id" "uuid",
    "recurrence_type" "text" NOT NULL,
    "recurrence_days" integer[] DEFAULT '{}'::integer[],
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "activity_time" time without time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_id" "uuid",
    "player_id" "uuid",
    "activity_end_time" "text",
    "intensity_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "activity_series_recurrence_type_check" CHECK (("recurrence_type" = ANY (ARRAY['daily'::"text", 'weekly'::"text", 'biweekly'::"text", 'triweekly'::"text", 'monthly'::"text"])))
);


ALTER TABLE "public"."activity_series" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_task_subtasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_task_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "completed" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_task_subtasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."activity_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "task_template_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "completed" boolean DEFAULT false NOT NULL,
    "reminder_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_player_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "admin_player_relationships_check" CHECK (("admin_id" <> "player_id"))
);


ALTER TABLE "public"."admin_player_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."category_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "external_category" "text" NOT NULL,
    "internal_category_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."category_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."event_sync_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "external_event_id" "uuid",
    "calendar_id" "uuid",
    "user_id" "uuid",
    "action" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb",
    "timestamp" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "event_sync_log_action_check" CHECK (("action" = ANY (ARRAY['created'::"text", 'updated'::"text", 'deleted'::"text", 'ignored'::"text", 'conflict'::"text"])))
);


ALTER TABLE "public"."event_sync_log" OWNER TO "postgres";


COMMENT ON TABLE "public"."event_sync_log" IS 'Tracks synchronization history for debugging and conflict resolution';



CREATE TABLE IF NOT EXISTS "public"."exercise_assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "player_id" "uuid",
    "team_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "check_player_or_team" CHECK (((("player_id" IS NOT NULL) AND ("team_id" IS NULL)) OR (("player_id" IS NULL) AND ("team_id" IS NOT NULL))))
);


ALTER TABLE "public"."exercise_assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."exercise_library" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainer_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "video_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_system" boolean DEFAULT false,
    "category_path" "text",
    "difficulty" integer,
    CONSTRAINT "exercise_library_difficulty_range_chk" CHECK ((("difficulty" IS NULL) OR (("difficulty" >= 0) AND ("difficulty" <= 5))))
);


ALTER TABLE "public"."exercise_library" OWNER TO "postgres";


COMMENT ON COLUMN "public"."exercise_library"."is_system" IS 'TRUE for FootballCoach system exercises (read-only inspiration)';



COMMENT ON COLUMN "public"."exercise_library"."category_path" IS 'Category path for organizing exercises (e.g., holdtraening_faelles, selvtraening_kant)';



COMMENT ON COLUMN "public"."exercise_library"."difficulty" IS '0-5 rating used for FootballCoach system exercises';



CREATE TABLE IF NOT EXISTS "public"."exercise_subtasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "exercise_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."exercise_subtasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_calendars" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "ics_url" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "last_fetched" timestamp with time zone,
    "event_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auto_sync_enabled" boolean DEFAULT true,
    "sync_interval_minutes" integer DEFAULT 60
);


ALTER TABLE "public"."external_calendars" OWNER TO "postgres";


COMMENT ON TABLE "public"."external_calendars" IS 'External calendar subscriptions - each user can only manage their own calendars';



CREATE TABLE IF NOT EXISTS "public"."external_event_mappings" (
    "id" bigint NOT NULL,
    "external_event_id" bigint NOT NULL,
    "provider" "text" NOT NULL,
    "provider_uid" "text" NOT NULL,
    "mapped_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."external_event_mappings" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."external_event_mappings_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."external_event_mappings_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."external_event_mappings_id_seq" OWNED BY "public"."external_event_mappings"."id";



CREATE TABLE IF NOT EXISTS "public"."external_event_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "local_meta_id" "uuid" NOT NULL,
    "task_template_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text",
    "completed" boolean DEFAULT false,
    "reminder_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."external_event_tasks" OWNER TO "postgres";


COMMENT ON TABLE "public"."external_event_tasks" IS 'Tasks for external calendar events, linked to task templates via category';



CREATE TABLE IF NOT EXISTS "public"."external_events" (
    "id" bigint NOT NULL,
    "provider" "text" NOT NULL,
    "primary_provider_uid" "text",
    "dtstart_utc" timestamp with time zone,
    "summary" "text",
    "location" "text",
    "external_last_modified" timestamp with time zone,
    "raw_payload" "text",
    "raw_hash" "text",
    "first_seen" timestamp with time zone DEFAULT "now"(),
    "last_seen" timestamp with time zone DEFAULT "now"(),
    "deleted" boolean DEFAULT false
);


ALTER TABLE "public"."external_events" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."external_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."external_events_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."external_events_id_seq" OWNED BY "public"."external_events"."id";



CREATE TABLE IF NOT EXISTS "public"."hidden_activity_categories" (
    "user_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."hidden_activity_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hidden_task_templates" (
    "user_id" "uuid" NOT NULL,
    "task_template_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hidden_task_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."local_event_meta" (
    "id" bigint NOT NULL,
    "external_event_id" bigint,
    "user_id" "uuid",
    "category_id" "uuid",
    "overrides" "jsonb",
    "last_local_modified" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."local_event_meta" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."local_event_meta_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."local_event_meta_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."local_event_meta_id_seq" OWNED BY "public"."local_event_meta"."id";



CREATE TABLE IF NOT EXISTS "public"."player_invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "player_name" "text" NOT NULL,
    "invitation_code" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "accepted_at" timestamp with time zone,
    "player_id" "uuid",
    CONSTRAINT "player_invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'accepted'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."player_invitations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "full_name" "text",
    "phone_number" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "subscription_tier" "text",
    "subscription_product_id" "text",
    "subscription_receipt" "text",
    "subscription_updated_at" timestamp with time zone
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."subscription_tier" IS 'Apple IAP subscription tier: player_basic, player_premium, trainer_basic, trainer_standard, trainer_premium';



COMMENT ON COLUMN "public"."profiles"."subscription_product_id" IS 'Apple product ID from App Store';



COMMENT ON COLUMN "public"."profiles"."subscription_receipt" IS 'Apple transaction receipt for verification';



COMMENT ON COLUMN "public"."profiles"."subscription_updated_at" IS 'Last time subscription was updated';



CREATE TABLE IF NOT EXISTS "public"."subscription_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "price_dkk" integer NOT NULL,
    "max_players" integer NOT NULL,
    "stripe_price_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."subscription_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "trial_start" timestamp with time zone,
    "trial_end" timestamp with time zone,
    "current_period_start" timestamp with time zone,
    "current_period_end" timestamp with time zone,
    "stripe_customer_id" "text",
    "stripe_subscription_id" "text",
    "cancel_at_period_end" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "subscriptions_status_check" CHECK (("status" = ANY (ARRAY['trial'::"text", 'active'::"text", 'past_due'::"text", 'canceled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_template_categories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_template_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_template_categories" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_template_self_feedback" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "task_template_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "rating" integer,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "intensity" integer,
    CONSTRAINT "task_template_self_feedback_intensity_check" CHECK ((("intensity" >= 1) AND ("intensity" <= 10))),
    CONSTRAINT "task_template_self_feedback_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 10)))
);


ALTER TABLE "public"."task_template_self_feedback" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_template_subtasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_template_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."task_template_subtasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."task_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "reminder_minutes" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_id" "uuid",
    "player_id" "uuid",
    "video_url" "text",
    "source_folder" "text",
    "after_training_enabled" boolean DEFAULT false NOT NULL,
    "after_training_delay_minutes" integer,
    "after_training_feedback_enable_score" boolean DEFAULT true NOT NULL,
    "after_training_feedback_score_explanation" "text",
    "after_training_feedback_enable_intensity" boolean DEFAULT false NOT NULL,
    "after_training_feedback_enable_note" boolean DEFAULT true NOT NULL,
    CONSTRAINT "task_templates_after_training_delay_minutes_check" CHECK ((("after_training_delay_minutes" IS NULL) OR (("after_training_delay_minutes" >= 0) AND ("after_training_delay_minutes" <= 240))))
);


ALTER TABLE "public"."task_templates" OWNER TO "postgres";


COMMENT ON COLUMN "public"."task_templates"."source_folder" IS 'Indicates the source of the copied exercise (e.g., "Fra træner: [name]", "FootballCoach Inspiration")';



CREATE TABLE IF NOT EXISTS "public"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "completed" boolean DEFAULT false NOT NULL,
    "is_template" boolean DEFAULT false NOT NULL,
    "category_ids" "uuid"[] DEFAULT '{}'::"uuid"[],
    "reminder_minutes" integer,
    "subtasks" "jsonb" DEFAULT '[]'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tasks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."team_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "team_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."team_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."training_reflections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "activity_id" "uuid" NOT NULL,
    "category_id" "uuid" NOT NULL,
    "rating" integer,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "training_reflections_rating_check" CHECK ((("rating" IS NULL) OR (("rating" >= 1) AND ("rating" <= 10))))
);


ALTER TABLE "public"."training_reflections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."trophies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week" integer NOT NULL,
    "year" integer NOT NULL,
    "type" "text" NOT NULL,
    "percentage" integer NOT NULL,
    "completed_tasks" integer DEFAULT 0 NOT NULL,
    "total_tasks" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "trophies_percentage_check" CHECK ((("percentage" >= 0) AND ("percentage" <= 100))),
    CONSTRAINT "trophies_type_check" CHECK (("type" = ANY (ARRAY['gold'::"text", 'silver'::"text", 'bronze'::"text"])))
);


ALTER TABLE "public"."trophies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "user_roles_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'player'::"text", 'trainer'::"text"])))
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."weekly_performance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_number" integer NOT NULL,
    "year" integer NOT NULL,
    "trophy_type" "text" NOT NULL,
    "percentage" integer NOT NULL,
    "completed_tasks" integer DEFAULT 0 NOT NULL,
    "total_tasks" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_id" "uuid",
    "player_id" "uuid",
    CONSTRAINT "weekly_performance_percentage_check" CHECK ((("percentage" >= 0) AND ("percentage" <= 100))),
    CONSTRAINT "weekly_performance_trophy_type_check" CHECK (("trophy_type" = ANY (ARRAY['gold'::"text", 'silver'::"text", 'bronze'::"text"])))
);


ALTER TABLE "public"."weekly_performance" OWNER TO "postgres";


ALTER TABLE ONLY "public"."external_event_mappings" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."external_event_mappings_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."external_events" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."external_events_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."local_event_meta" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."local_event_meta_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_categories"
    ADD CONSTRAINT "activity_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_series"
    ADD CONSTRAINT "activity_series_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_task_subtasks"
    ADD CONSTRAINT "activity_task_subtasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."activity_tasks"
    ADD CONSTRAINT "activity_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."admin_player_relationships"
    ADD CONSTRAINT "admin_player_relationships_admin_id_player_id_key" UNIQUE ("admin_id", "player_id");



ALTER TABLE ONLY "public"."admin_player_relationships"
    ADD CONSTRAINT "admin_player_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_mappings"
    ADD CONSTRAINT "category_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."category_mappings"
    ADD CONSTRAINT "category_mappings_user_id_external_category_key" UNIQUE ("user_id", "external_category");



ALTER TABLE ONLY "public"."event_sync_log"
    ADD CONSTRAINT "event_sync_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events_external"
    ADD CONSTRAINT "events_external_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events_external"
    ADD CONSTRAINT "events_external_provider_calendar_id_provider_event_uid_rec_key" UNIQUE ("provider_calendar_id", "provider_event_uid", "recurrence_id");



ALTER TABLE ONLY "public"."events_local_meta"
    ADD CONSTRAINT "events_local_meta_external_event_id_user_id_key" UNIQUE ("external_event_id", "user_id");



ALTER TABLE ONLY "public"."events_local_meta"
    ADD CONSTRAINT "events_local_meta_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_assignments"
    ADD CONSTRAINT "exercise_assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_library"
    ADD CONSTRAINT "exercise_library_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."exercise_subtasks"
    ADD CONSTRAINT "exercise_subtasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_calendars"
    ADD CONSTRAINT "external_calendars_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_event_mappings"
    ADD CONSTRAINT "external_event_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_event_tasks"
    ADD CONSTRAINT "external_event_tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_events"
    ADD CONSTRAINT "external_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hidden_activity_categories"
    ADD CONSTRAINT "hidden_activity_categories_pkey" PRIMARY KEY ("user_id", "category_id");



ALTER TABLE ONLY "public"."hidden_task_templates"
    ADD CONSTRAINT "hidden_task_templates_pkey" PRIMARY KEY ("user_id", "task_template_id");



ALTER TABLE ONLY "public"."local_event_meta"
    ADD CONSTRAINT "local_event_meta_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."player_invitations"
    ADD CONSTRAINT "player_invitations_invitation_code_key" UNIQUE ("invitation_code");



ALTER TABLE ONLY "public"."player_invitations"
    ADD CONSTRAINT "player_invitations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."subscription_plans"
    ADD CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_template_categories"
    ADD CONSTRAINT "task_template_categories_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_template_categories"
    ADD CONSTRAINT "task_template_categories_task_template_id_category_id_key" UNIQUE ("task_template_id", "category_id");



ALTER TABLE ONLY "public"."task_template_self_feedback"
    ADD CONSTRAINT "task_template_self_feedback_owner_key" UNIQUE ("user_id", "task_template_id", "activity_id");



ALTER TABLE ONLY "public"."task_template_self_feedback"
    ADD CONSTRAINT "task_template_self_feedback_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_template_subtasks"
    ADD CONSTRAINT "task_template_subtasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_player_id_key" UNIQUE ("team_id", "player_id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_reflections"
    ADD CONSTRAINT "training_reflections_activity_id_key" UNIQUE ("activity_id");



ALTER TABLE ONLY "public"."training_reflections"
    ADD CONSTRAINT "training_reflections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trophies"
    ADD CONSTRAINT "trophies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."trophies"
    ADD CONSTRAINT "trophies_user_id_week_year_key" UNIQUE ("user_id", "week", "year");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."weekly_performance"
    ADD CONSTRAINT "weekly_performance_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."weekly_performance"
    ADD CONSTRAINT "weekly_performance_user_id_week_number_year_key" UNIQUE ("user_id", "week_number", "year");



CREATE INDEX "activities_category_id_idx" ON "public"."activities" USING "btree" ("category_id");



CREATE INDEX "activities_date_idx" ON "public"."activities" USING "btree" ("activity_date");



CREATE INDEX "activities_external_calendar_id_idx" ON "public"."activities" USING "btree" ("external_calendar_id") WHERE ("external_calendar_id" IS NOT NULL);



CREATE INDEX "activities_user_id_idx" ON "public"."activities" USING "btree" ("user_id");



CREATE INDEX "activity_categories_user_id_idx" ON "public"."activity_categories" USING "btree" ("user_id");



CREATE INDEX "activity_task_subtasks_task_id_idx" ON "public"."activity_task_subtasks" USING "btree" ("activity_task_id");



CREATE INDEX "activity_tasks_activity_id_idx" ON "public"."activity_tasks" USING "btree" ("activity_id");



CREATE INDEX "activity_tasks_template_id_idx" ON "public"."activity_tasks" USING "btree" ("task_template_id") WHERE ("task_template_id" IS NOT NULL);



CREATE UNIQUE INDEX "exercise_library_system_category_title_idx" ON "public"."exercise_library" USING "btree" (COALESCE("category_path", ''::"text"), "title") WHERE ("is_system" = true);



CREATE INDEX "external_calendars_user_id_idx" ON "public"."external_calendars" USING "btree" ("user_id");



CREATE INDEX "idx_activities_category_updated_at" ON "public"."activities" USING "btree" ("category_updated_at");



CREATE INDEX "idx_activities_manually_set_category" ON "public"."activities" USING "btree" ("manually_set_category") WHERE ("manually_set_category" = true);



CREATE INDEX "idx_activities_player_id" ON "public"."activities" USING "btree" ("player_id");



CREATE INDEX "idx_activities_series_id" ON "public"."activities" USING "btree" ("series_id");



CREATE INDEX "idx_activities_team_id" ON "public"."activities" USING "btree" ("team_id");



CREATE INDEX "idx_activity_categories_is_system" ON "public"."activity_categories" USING "btree" ("is_system");



CREATE INDEX "idx_activity_categories_player_id" ON "public"."activity_categories" USING "btree" ("player_id");



CREATE INDEX "idx_activity_categories_team_id" ON "public"."activity_categories" USING "btree" ("team_id");



CREATE INDEX "idx_activity_categories_user_id" ON "public"."activity_categories" USING "btree" ("user_id");



CREATE INDEX "idx_activity_series_user_id" ON "public"."activity_series" USING "btree" ("user_id");



CREATE UNIQUE INDEX "idx_activity_tasks_unique_template" ON "public"."activity_tasks" USING "btree" ("activity_id", "task_template_id") WHERE ("task_template_id" IS NOT NULL);



COMMENT ON INDEX "public"."idx_activity_tasks_unique_template" IS 'Prevents duplicate tasks from the same template on the same activity';



CREATE INDEX "idx_admin_player_relationships_admin_id" ON "public"."admin_player_relationships" USING "btree" ("admin_id");



CREATE INDEX "idx_admin_player_relationships_player_id" ON "public"."admin_player_relationships" USING "btree" ("player_id");



CREATE INDEX "idx_category_mappings_user_external" ON "public"."category_mappings" USING "btree" ("user_id", "external_category");



CREATE INDEX "idx_event_sync_log_calendar" ON "public"."event_sync_log" USING "btree" ("calendar_id");



CREATE INDEX "idx_event_sync_log_timestamp" ON "public"."event_sync_log" USING "btree" ("timestamp" DESC);



CREATE INDEX "idx_events_external_calendar" ON "public"."events_external" USING "btree" ("provider_calendar_id");



CREATE INDEX "idx_events_external_deleted" ON "public"."events_external" USING "btree" ("deleted") WHERE ("deleted" = false);



CREATE INDEX "idx_events_external_start_date" ON "public"."events_external" USING "btree" ("start_date");



CREATE INDEX "idx_events_external_uid" ON "public"."events_external" USING "btree" ("provider_event_uid");



CREATE INDEX "idx_events_local_meta_category" ON "public"."events_local_meta" USING "btree" ("category_id");



CREATE INDEX "idx_events_local_meta_external" ON "public"."events_local_meta" USING "btree" ("external_event_id");



CREATE INDEX "idx_events_local_meta_user" ON "public"."events_local_meta" USING "btree" ("user_id");



CREATE INDEX "idx_exercise_assignments_exercise_id" ON "public"."exercise_assignments" USING "btree" ("exercise_id");



CREATE INDEX "idx_exercise_assignments_player_id" ON "public"."exercise_assignments" USING "btree" ("player_id");



CREATE INDEX "idx_exercise_assignments_team_id" ON "public"."exercise_assignments" USING "btree" ("team_id");



CREATE INDEX "idx_exercise_assignments_trainer_id" ON "public"."exercise_assignments" USING "btree" ("trainer_id");



CREATE INDEX "idx_exercise_library_category_path" ON "public"."exercise_library" USING "btree" ("category_path");



CREATE INDEX "idx_exercise_library_is_system" ON "public"."exercise_library" USING "btree" ("is_system");



CREATE INDEX "idx_exercise_library_trainer_id" ON "public"."exercise_library" USING "btree" ("trainer_id");



CREATE INDEX "idx_exercise_subtasks_exercise_id" ON "public"."exercise_subtasks" USING "btree" ("exercise_id");



CREATE INDEX "idx_external_event_tasks_local_meta" ON "public"."external_event_tasks" USING "btree" ("local_meta_id");



CREATE INDEX "idx_external_event_tasks_template" ON "public"."external_event_tasks" USING "btree" ("task_template_id");



CREATE UNIQUE INDEX "idx_external_event_tasks_unique_template" ON "public"."external_event_tasks" USING "btree" ("local_meta_id", "task_template_id") WHERE ("task_template_id" IS NOT NULL);



CREATE INDEX "idx_player_invitations_admin_id" ON "public"."player_invitations" USING "btree" ("admin_id");



CREATE INDEX "idx_player_invitations_code" ON "public"."player_invitations" USING "btree" ("invitation_code");



CREATE INDEX "idx_player_invitations_status" ON "public"."player_invitations" USING "btree" ("status");



CREATE INDEX "idx_profiles_subscription_product_id" ON "public"."profiles" USING "btree" ("subscription_product_id");



CREATE INDEX "idx_profiles_subscription_tier" ON "public"."profiles" USING "btree" ("subscription_tier");



CREATE INDEX "idx_profiles_user_id" ON "public"."profiles" USING "btree" ("user_id");



CREATE INDEX "idx_task_templates_player_id" ON "public"."task_templates" USING "btree" ("player_id");



CREATE INDEX "idx_task_templates_team_id" ON "public"."task_templates" USING "btree" ("team_id");



CREATE INDEX "idx_tasks_is_template" ON "public"."tasks" USING "btree" ("is_template");



CREATE INDEX "idx_tasks_user_id" ON "public"."tasks" USING "btree" ("user_id");



CREATE INDEX "idx_team_members_player_id" ON "public"."team_members" USING "btree" ("player_id");



CREATE INDEX "idx_team_members_team_id" ON "public"."team_members" USING "btree" ("team_id");



CREATE INDEX "idx_trophies_user_id" ON "public"."trophies" USING "btree" ("user_id");



CREATE INDEX "idx_trophies_week_year" ON "public"."trophies" USING "btree" ("week", "year");



CREATE INDEX "idx_user_roles_role" ON "public"."user_roles" USING "btree" ("role");



CREATE INDEX "idx_user_roles_user_id" ON "public"."user_roles" USING "btree" ("user_id");



CREATE INDEX "ix_external_events_dtstart_summary" ON "public"."external_events" USING "btree" ("dtstart_utc");



CREATE INDEX "ix_external_events_summary" ON "public"."external_events" USING "gin" ("to_tsvector"('"simple"'::"regconfig", "summary"));



CREATE INDEX "ix_mappings_provider_uid" ON "public"."external_event_mappings" USING "btree" ("provider", "provider_uid");



CREATE INDEX "task_template_categories_category_id_idx" ON "public"."task_template_categories" USING "btree" ("category_id");



CREATE INDEX "task_template_categories_template_id_idx" ON "public"."task_template_categories" USING "btree" ("task_template_id");



CREATE INDEX "task_template_self_feedback_template_created_idx" ON "public"."task_template_self_feedback" USING "btree" ("task_template_id", "created_at" DESC);



CREATE INDEX "task_template_self_feedback_user_template_idx" ON "public"."task_template_self_feedback" USING "btree" ("user_id", "task_template_id");



CREATE INDEX "task_template_subtasks_template_id_idx" ON "public"."task_template_subtasks" USING "btree" ("task_template_id");



CREATE INDEX "task_templates_user_id_idx" ON "public"."task_templates" USING "btree" ("user_id");



CREATE INDEX "training_reflections_user_category_created_at_idx" ON "public"."training_reflections" USING "btree" ("user_id", "category_id", "created_at" DESC);



CREATE UNIQUE INDEX "ux_external_events_provider_uid" ON "public"."external_events" USING "btree" ("provider", "primary_provider_uid");



CREATE INDEX "weekly_performance_user_id_idx" ON "public"."weekly_performance" USING "btree" ("user_id");



CREATE INDEX "weekly_performance_year_week_idx" ON "public"."weekly_performance" USING "btree" ("year", "week_number");



CREATE OR REPLACE TRIGGER "activity_tasks_after_training_feedback" AFTER INSERT ON "public"."activity_tasks" FOR EACH ROW WHEN (("new"."task_template_id" IS NOT NULL)) EXECUTE FUNCTION "public"."trigger_insert_activity_task_feedback"();



CREATE OR REPLACE TRIGGER "cleanup_tasks_on_template_delete" BEFORE DELETE ON "public"."task_templates" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_cleanup_tasks_on_template_delete"();



CREATE OR REPLACE TRIGGER "cleanup_tasks_on_template_hide" AFTER INSERT ON "public"."hidden_task_templates" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_cleanup_tasks_on_template_hide"();



CREATE OR REPLACE TRIGGER "enforce_player_limit" BEFORE INSERT ON "public"."admin_player_relationships" FOR EACH ROW EXECUTE FUNCTION "public"."check_player_limit"();



CREATE OR REPLACE TRIGGER "on_activity_category_changed" AFTER UPDATE ON "public"."activities" FOR EACH ROW WHEN (("old"."category_id" IS DISTINCT FROM "new"."category_id")) EXECUTE FUNCTION "public"."trigger_update_tasks_on_category_change"();



CREATE OR REPLACE TRIGGER "on_activity_created" AFTER INSERT ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_create_tasks_for_activity"();



CREATE OR REPLACE TRIGGER "on_activity_task_changed" AFTER INSERT OR DELETE OR UPDATE ON "public"."activity_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_weekly_performance"();



CREATE OR REPLACE TRIGGER "on_external_event_category_changed" AFTER INSERT OR UPDATE OF "category_id" ON "public"."events_local_meta" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_create_tasks_for_external_event"();



CREATE OR REPLACE TRIGGER "on_task_template_category_added" AFTER INSERT ON "public"."task_template_categories" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_fix_tasks_on_template_category_change"();



CREATE OR REPLACE TRIGGER "on_task_template_category_added_external" AFTER INSERT ON "public"."task_template_categories" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_fix_external_tasks_on_template_category_change"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_profiles_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_category_updated_at" BEFORE INSERT OR UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."update_category_updated_at"();



CREATE OR REPLACE TRIGGER "trigger_update_series_activities" AFTER UPDATE ON "public"."activity_series" FOR EACH ROW WHEN ((("old"."title" IS DISTINCT FROM "new"."title") OR ("old"."location" IS DISTINCT FROM "new"."location") OR ("old"."category_id" IS DISTINCT FROM "new"."category_id") OR ("old"."activity_time" IS DISTINCT FROM "new"."activity_time"))) EXECUTE FUNCTION "public"."update_series_activities"();



CREATE OR REPLACE TRIGGER "update_activities_timestamp" BEFORE UPDATE ON "public"."activities" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_timestamp"();



CREATE OR REPLACE TRIGGER "update_activity_categories_timestamp" BEFORE UPDATE ON "public"."activity_categories" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_timestamp"();



CREATE OR REPLACE TRIGGER "update_activity_tasks_timestamp" BEFORE UPDATE ON "public"."activity_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_timestamp"();



CREATE OR REPLACE TRIGGER "update_external_calendars_timestamp" BEFORE UPDATE ON "public"."external_calendars" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_timestamp"();



CREATE OR REPLACE TRIGGER "update_external_event_tasks_timestamp" BEFORE UPDATE ON "public"."external_event_tasks" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_timestamp"();



CREATE OR REPLACE TRIGGER "update_task_template_self_feedback_timestamp" BEFORE UPDATE ON "public"."task_template_self_feedback" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_timestamp"();



CREATE OR REPLACE TRIGGER "update_task_templates_timestamp" BEFORE UPDATE ON "public"."task_templates" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_timestamp"();



CREATE OR REPLACE TRIGGER "update_tasks_on_subtask_change" AFTER INSERT OR DELETE OR UPDATE ON "public"."task_template_subtasks" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_tasks_on_subtask_change"();



CREATE OR REPLACE TRIGGER "update_tasks_on_template_change" AFTER UPDATE ON "public"."task_templates" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_update_tasks_on_template_change"();



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."activity_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "public"."activity_series"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activities"
    ADD CONSTRAINT "activities_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_categories"
    ADD CONSTRAINT "activity_categories_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_categories"
    ADD CONSTRAINT "activity_categories_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_categories"
    ADD CONSTRAINT "activity_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_series"
    ADD CONSTRAINT "activity_series_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."activity_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."activity_series"
    ADD CONSTRAINT "activity_series_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_series"
    ADD CONSTRAINT "activity_series_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_series"
    ADD CONSTRAINT "activity_series_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_task_subtasks"
    ADD CONSTRAINT "activity_task_subtasks_activity_task_id_fkey" FOREIGN KEY ("activity_task_id") REFERENCES "public"."activity_tasks"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_tasks"
    ADD CONSTRAINT "activity_tasks_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."activity_tasks"
    ADD CONSTRAINT "activity_tasks_task_template_id_fkey" FOREIGN KEY ("task_template_id") REFERENCES "public"."task_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."admin_player_relationships"
    ADD CONSTRAINT "admin_player_relationships_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_player_relationships"
    ADD CONSTRAINT "admin_player_relationships_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_mappings"
    ADD CONSTRAINT "category_mappings_internal_category_id_fkey" FOREIGN KEY ("internal_category_id") REFERENCES "public"."activity_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."category_mappings"
    ADD CONSTRAINT "category_mappings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_sync_log"
    ADD CONSTRAINT "event_sync_log_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "public"."external_calendars"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_sync_log"
    ADD CONSTRAINT "event_sync_log_external_event_id_fkey" FOREIGN KEY ("external_event_id") REFERENCES "public"."events_external"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_sync_log"
    ADD CONSTRAINT "event_sync_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events_external"
    ADD CONSTRAINT "events_external_provider_calendar_id_fkey" FOREIGN KEY ("provider_calendar_id") REFERENCES "public"."external_calendars"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events_local_meta"
    ADD CONSTRAINT "events_local_meta_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."activity_categories"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."events_local_meta"
    ADD CONSTRAINT "events_local_meta_external_event_id_fkey" FOREIGN KEY ("external_event_id") REFERENCES "public"."events_external"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events_local_meta"
    ADD CONSTRAINT "events_local_meta_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events_local_meta"
    ADD CONSTRAINT "events_local_meta_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events_local_meta"
    ADD CONSTRAINT "events_local_meta_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_assignments"
    ADD CONSTRAINT "exercise_assignments_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise_library"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_assignments"
    ADD CONSTRAINT "exercise_assignments_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_assignments"
    ADD CONSTRAINT "exercise_assignments_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_assignments"
    ADD CONSTRAINT "exercise_assignments_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_library"
    ADD CONSTRAINT "exercise_library_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."exercise_subtasks"
    ADD CONSTRAINT "exercise_subtasks_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercise_library"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_calendars"
    ADD CONSTRAINT "external_calendars_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_event_mappings"
    ADD CONSTRAINT "external_event_mappings_external_event_id_fkey" FOREIGN KEY ("external_event_id") REFERENCES "public"."external_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_event_tasks"
    ADD CONSTRAINT "external_event_tasks_local_meta_id_fkey" FOREIGN KEY ("local_meta_id") REFERENCES "public"."events_local_meta"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."external_event_tasks"
    ADD CONSTRAINT "external_event_tasks_task_template_id_fkey" FOREIGN KEY ("task_template_id") REFERENCES "public"."task_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hidden_activity_categories"
    ADD CONSTRAINT "hidden_activity_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."activity_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hidden_activity_categories"
    ADD CONSTRAINT "hidden_activity_categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."local_event_meta"
    ADD CONSTRAINT "local_event_meta_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."activity_categories"("id");



ALTER TABLE ONLY "public"."local_event_meta"
    ADD CONSTRAINT "local_event_meta_external_event_id_fkey" FOREIGN KEY ("external_event_id") REFERENCES "public"."external_events"("id");



ALTER TABLE ONLY "public"."local_event_meta"
    ADD CONSTRAINT "local_event_meta_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."player_invitations"
    ADD CONSTRAINT "player_invitations_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."player_invitations"
    ADD CONSTRAINT "player_invitations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id");



ALTER TABLE ONLY "public"."task_template_categories"
    ADD CONSTRAINT "task_template_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "public"."activity_categories"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_template_categories"
    ADD CONSTRAINT "task_template_categories_task_template_id_fkey" FOREIGN KEY ("task_template_id") REFERENCES "public"."task_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_template_self_feedback"
    ADD CONSTRAINT "task_template_self_feedback_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_template_self_feedback"
    ADD CONSTRAINT "task_template_self_feedback_task_template_id_fkey" FOREIGN KEY ("task_template_id") REFERENCES "public"."task_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_template_self_feedback"
    ADD CONSTRAINT "task_template_self_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_template_subtasks"
    ADD CONSTRAINT "task_template_subtasks_task_template_id_fkey" FOREIGN KEY ("task_template_id") REFERENCES "public"."task_templates"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."task_templates"
    ADD CONSTRAINT "task_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tasks"
    ADD CONSTRAINT "tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."team_members"
    ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_reflections"
    ADD CONSTRAINT "training_reflections_activity_id_fkey" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_reflections"
    ADD CONSTRAINT "training_reflections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."trophies"
    ADD CONSTRAINT "trophies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_performance"
    ADD CONSTRAINT "weekly_performance_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."weekly_performance"
    ADD CONSTRAINT "weekly_performance_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."weekly_performance"
    ADD CONSTRAINT "weekly_performance_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can add members to their teams" ON "public"."team_members" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."teams"
  WHERE (("teams"."id" = "team_members"."team_id") AND ("teams"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can create invitations" ON "public"."player_invitations" FOR INSERT WITH CHECK ((("admin_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."user_roles"
  WHERE (("user_roles"."user_id" = "auth"."uid"()) AND ("user_roles"."role" = 'admin'::"text"))))));



CREATE POLICY "Admins can create teams" ON "public"."teams" FOR INSERT WITH CHECK (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can delete their own teams" ON "public"."teams" FOR DELETE USING (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can delete their player relationships" ON "public"."admin_player_relationships" FOR DELETE USING (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can delete their players event metadata" ON "public"."events_local_meta" FOR DELETE USING (("user_id" IN ( SELECT "admin_player_relationships"."player_id"
   FROM "public"."admin_player_relationships"
  WHERE ("admin_player_relationships"."admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins can delete their players external event tasks" ON "public"."external_event_tasks" FOR DELETE USING (("local_meta_id" IN ( SELECT "events_local_meta"."id"
   FROM "public"."events_local_meta"
  WHERE ("events_local_meta"."user_id" IN ( SELECT "admin_player_relationships"."player_id"
           FROM "public"."admin_player_relationships"
          WHERE ("admin_player_relationships"."admin_id" = "auth"."uid"()))))));



CREATE POLICY "Admins can insert their own subscriptions" ON "public"."subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can insert their players external event tasks" ON "public"."external_event_tasks" FOR INSERT WITH CHECK (("local_meta_id" IN ( SELECT "events_local_meta"."id"
   FROM "public"."events_local_meta"
  WHERE ("events_local_meta"."user_id" IN ( SELECT "admin_player_relationships"."player_id"
           FROM "public"."admin_player_relationships"
          WHERE ("admin_player_relationships"."admin_id" = "auth"."uid"()))))));



CREATE POLICY "Admins can remove members from their teams" ON "public"."team_members" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."teams"
  WHERE (("teams"."id" = "team_members"."team_id") AND ("teams"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can update their invitations" ON "public"."player_invitations" FOR UPDATE USING (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can update their own subscriptions" ON "public"."subscriptions" FOR UPDATE TO "authenticated" USING (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can update their own teams" ON "public"."teams" FOR UPDATE USING (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can update their players event metadata" ON "public"."events_local_meta" FOR UPDATE USING (("user_id" IN ( SELECT "admin_player_relationships"."player_id"
   FROM "public"."admin_player_relationships"
  WHERE ("admin_player_relationships"."admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins can update their players external event tasks" ON "public"."external_event_tasks" FOR UPDATE USING (("local_meta_id" IN ( SELECT "events_local_meta"."id"
   FROM "public"."events_local_meta"
  WHERE ("events_local_meta"."user_id" IN ( SELECT "admin_player_relationships"."player_id"
           FROM "public"."admin_player_relationships"
          WHERE ("admin_player_relationships"."admin_id" = "auth"."uid"()))))));



CREATE POLICY "Admins can view activities assigned to their players" ON "public"."activities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "activities"."player_id") AND ("apr"."admin_id" = "auth"."uid"()) AND ("activities"."player_id" IS NOT NULL)))));



CREATE POLICY "Admins can view external events from their players calendars" ON "public"."events_external" FOR SELECT USING (("provider_calendar_id" IN ( SELECT "ec"."id"
   FROM ("public"."external_calendars" "ec"
     JOIN "public"."admin_player_relationships" "apr" ON (("apr"."player_id" = "ec"."user_id")))
  WHERE ("apr"."admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins can view system and players categories" ON "public"."activity_categories" FOR SELECT USING ((("is_system" = true) OR (EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "activity_categories"."user_id") AND ("apr"."admin_id" = "auth"."uid"()))))));



CREATE POLICY "Admins can view team members for their teams" ON "public"."team_members" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."teams"
  WHERE (("teams"."id" = "team_members"."team_id") AND ("teams"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can view their invitations" ON "public"."player_invitations" FOR SELECT USING (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can view their own subscriptions" ON "public"."subscriptions" FOR SELECT TO "authenticated" USING (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can view their own teams" ON "public"."teams" FOR SELECT USING (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can view their player relationships" ON "public"."admin_player_relationships" FOR SELECT USING (("admin_id" = "auth"."uid"()));



CREATE POLICY "Admins can view their players activities" ON "public"."activities" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "activities"."user_id") AND ("apr"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can view their players activity series" ON "public"."activity_series" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "activity_series"."user_id") AND ("apr"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can view their players activity tasks" ON "public"."activity_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."activities" "a"
     JOIN "public"."admin_player_relationships" "apr" ON (("apr"."player_id" = "a"."user_id")))
  WHERE (("a"."id" = "activity_tasks"."activity_id") AND ("apr"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can view their players calendars" ON "public"."external_calendars" FOR SELECT USING (("user_id" IN ( SELECT "admin_player_relationships"."player_id"
   FROM "public"."admin_player_relationships"
  WHERE ("admin_player_relationships"."admin_id" = "auth"."uid"()))));



CREATE POLICY "Admins can view their players external event tasks" ON "public"."external_event_tasks" FOR SELECT USING (("local_meta_id" IN ( SELECT "events_local_meta"."id"
   FROM "public"."events_local_meta"
  WHERE ("events_local_meta"."user_id" IN ( SELECT "admin_player_relationships"."player_id"
           FROM "public"."admin_player_relationships"
          WHERE ("admin_player_relationships"."admin_id" = "auth"."uid"()))))));



CREATE POLICY "Admins can view their players external events" ON "public"."events_local_meta" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "events_local_meta"."user_id") AND ("apr"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can view their players profiles" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "profiles"."user_id") AND ("apr"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can view their players task template categories" ON "public"."task_template_categories" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."task_templates" "tt"
     JOIN "public"."admin_player_relationships" "apr" ON (("apr"."player_id" = "tt"."user_id")))
  WHERE (("tt"."id" = "task_template_categories"."task_template_id") AND ("apr"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can view their players task templates v2" ON "public"."task_templates" FOR SELECT USING (((EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "task_templates"."user_id") AND ("apr"."admin_id" = "auth"."uid"())))) OR (EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "task_templates"."player_id") AND ("apr"."admin_id" = "auth"."uid"()) AND ("task_templates"."player_id" IS NOT NULL))))));



CREATE POLICY "Admins can view their players trophies" ON "public"."trophies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "trophies"."user_id") AND ("apr"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Admins can view their players weekly performance" ON "public"."weekly_performance" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."player_id" = "weekly_performance"."user_id") AND ("apr"."admin_id" = "auth"."uid"())))));



CREATE POLICY "Allow delete own hidden categories" ON "public"."hidden_activity_categories" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Allow insert own hidden categories" ON "public"."hidden_activity_categories" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Allow select own hidden categories" ON "public"."hidden_activity_categories" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Anyone can view invitations by code" ON "public"."player_invitations" FOR SELECT USING (true);



CREATE POLICY "Anyone can view subscription plans" ON "public"."subscription_plans" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Anyone can view system exercises" ON "public"."exercise_library" FOR SELECT USING (("is_system" = true));



CREATE POLICY "Players can delete their own assignments" ON "public"."exercise_assignments" FOR DELETE USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players can view exercises assigned to them" ON "public"."exercise_assignments" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Players can view exercises assigned to them" ON "public"."exercise_library" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."exercise_assignments"
  WHERE (("exercise_assignments"."exercise_id" = "exercise_library"."id") AND ("exercise_assignments"."player_id" = "auth"."uid"())))));



CREATE POLICY "Players can view their admin profile" ON "public"."profiles" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."admin_id" = "profiles"."user_id") AND ("apr"."player_id" = "auth"."uid"())))));



CREATE POLICY "Players can view their admin relationships" ON "public"."admin_player_relationships" FOR SELECT USING (("player_id" = "auth"."uid"()));



CREATE POLICY "Service role can manage external events" ON "public"."events_external" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Service role can manage sync logs" ON "public"."event_sync_log" USING ((("auth"."jwt"() ->> 'role'::"text") = 'service_role'::"text"));



CREATE POLICY "Trainers can create assignments" ON "public"."exercise_assignments" FOR INSERT WITH CHECK (("trainer_id" = "auth"."uid"()));



CREATE POLICY "Trainers can create exercises" ON "public"."exercise_library" FOR INSERT WITH CHECK (("trainer_id" = "auth"."uid"()));



CREATE POLICY "Trainers can create subtasks for their exercises" ON "public"."exercise_subtasks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."exercise_library"
  WHERE (("exercise_library"."id" = "exercise_subtasks"."exercise_id") AND ("exercise_library"."trainer_id" = "auth"."uid"())))));



CREATE POLICY "Trainers can delete subtasks for their exercises" ON "public"."exercise_subtasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."exercise_library"
  WHERE (("exercise_library"."id" = "exercise_subtasks"."exercise_id") AND ("exercise_library"."trainer_id" = "auth"."uid"())))));



CREATE POLICY "Trainers can delete their assignments" ON "public"."exercise_assignments" FOR DELETE USING (("trainer_id" = "auth"."uid"()));



CREATE POLICY "Trainers can delete their own exercises" ON "public"."exercise_library" FOR DELETE USING (("trainer_id" = "auth"."uid"()));



CREATE POLICY "Trainers can update subtasks for their exercises" ON "public"."exercise_subtasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."exercise_library"
  WHERE (("exercise_library"."id" = "exercise_subtasks"."exercise_id") AND ("exercise_library"."trainer_id" = "auth"."uid"())))));



CREATE POLICY "Trainers can update their own exercises" ON "public"."exercise_library" FOR UPDATE USING (("trainer_id" = "auth"."uid"()));



CREATE POLICY "Trainers can view their assignments" ON "public"."exercise_assignments" FOR SELECT USING (("trainer_id" = "auth"."uid"()));



CREATE POLICY "Trainers can view their own exercises" ON "public"."exercise_library" FOR SELECT USING (("trainer_id" = "auth"."uid"()));



CREATE POLICY "Users can create player relationships" ON "public"."admin_player_relationships" FOR INSERT WITH CHECK (("admin_id" = "auth"."uid"()));



CREATE POLICY "Users can create their own activities" ON "public"."activities" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create their own activity series" ON "public"."activity_series" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create their own categories" ON "public"."activity_categories" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can create their own task templates" ON "public"."task_templates" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their event metadata" ON "public"."events_local_meta" FOR DELETE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "player_id") OR ("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE ("team_members"."player_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own activities" ON "public"."activities" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own activity series" ON "public"."activity_series" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own activity task subtasks" ON "public"."activity_task_subtasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ("public"."activity_tasks"
     JOIN "public"."activities" ON (("activities"."id" = "activity_tasks"."activity_id")))
  WHERE (("activity_tasks"."id" = "activity_task_subtasks"."activity_task_id") AND ("activities"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own activity tasks" ON "public"."activity_tasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."activities"
  WHERE (("activities"."id" = "activity_tasks"."activity_id") AND ("activities"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own calendars" ON "public"."external_calendars" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own categories" ON "public"."activity_categories" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own category mappings" ON "public"."category_mappings" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own external event tasks" ON "public"."external_event_tasks" FOR DELETE USING (("local_meta_id" IN ( SELECT "events_local_meta"."id"
   FROM "public"."events_local_meta"
  WHERE ("events_local_meta"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can delete their own hidden tasks" ON "public"."hidden_task_templates" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own local event metadata" ON "public"."local_event_meta" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own task template categories" ON "public"."task_template_categories" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."task_templates"
  WHERE (("task_templates"."id" = "task_template_categories"."task_template_id") AND ("task_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own task template subtasks" ON "public"."task_template_subtasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."task_templates"
  WHERE (("task_templates"."id" = "task_template_subtasks"."task_template_id") AND ("task_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can delete their own task templates" ON "public"."task_templates" FOR DELETE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can delete their own tasks" ON "public"."tasks" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own trophies" ON "public"."trophies" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can delete their own weekly performance" ON "public"."weekly_performance" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own activities" ON "public"."activities" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own activity task subtasks" ON "public"."activity_task_subtasks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."activity_tasks"
     JOIN "public"."activities" ON (("activities"."id" = "activity_tasks"."activity_id")))
  WHERE (("activity_tasks"."id" = "activity_task_subtasks"."activity_task_id") AND ("activities"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own activity tasks" ON "public"."activity_tasks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."activities"
  WHERE (("activities"."id" = "activity_tasks"."activity_id") AND ("activities"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own calendars" ON "public"."external_calendars" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own categories" ON "public"."activity_categories" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own category mappings" ON "public"."category_mappings" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own event metadata" ON "public"."events_local_meta" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own external event tasks" ON "public"."external_event_tasks" FOR INSERT WITH CHECK (("local_meta_id" IN ( SELECT "events_local_meta"."id"
   FROM "public"."events_local_meta"
  WHERE ("events_local_meta"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can insert their own hidden tasks" ON "public"."hidden_task_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own local event metadata" ON "public"."local_event_meta" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own role on signup" ON "public"."user_roles" FOR INSERT WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can insert their own task template categories" ON "public"."task_template_categories" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."task_templates"
  WHERE (("task_templates"."id" = "task_template_categories"."task_template_id") AND ("task_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own task template subtasks" ON "public"."task_template_subtasks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."task_templates"
  WHERE (("task_templates"."id" = "task_template_subtasks"."task_template_id") AND ("task_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can insert their own task templates" ON "public"."task_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own tasks" ON "public"."tasks" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own trophies" ON "public"."trophies" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert their own weekly performance" ON "public"."weekly_performance" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update invitations they're accepting" ON "public"."player_invitations" FOR UPDATE USING ((("status" = 'pending'::"text") AND ("invitation_code" IS NOT NULL)));



CREATE POLICY "Users can update their event metadata" ON "public"."events_local_meta" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "player_id") OR ("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE ("team_members"."player_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own activities" ON "public"."activities" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own activity series" ON "public"."activity_series" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own activity task subtasks" ON "public"."activity_task_subtasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."activity_tasks"
     JOIN "public"."activities" ON (("activities"."id" = "activity_tasks"."activity_id")))
  WHERE (("activity_tasks"."id" = "activity_task_subtasks"."activity_task_id") AND ("activities"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own activity tasks" ON "public"."activity_tasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."activities"
  WHERE (("activities"."id" = "activity_tasks"."activity_id") AND ("activities"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own calendars" ON "public"."external_calendars" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own categories" ON "public"."activity_categories" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own category mappings" ON "public"."category_mappings" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own external event tasks" ON "public"."external_event_tasks" FOR UPDATE USING (("local_meta_id" IN ( SELECT "events_local_meta"."id"
   FROM "public"."events_local_meta"
  WHERE ("events_local_meta"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can update their own local event metadata" ON "public"."local_event_meta" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own profile" ON "public"."profiles" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own role" ON "public"."user_roles" FOR UPDATE USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own task template subtasks" ON "public"."task_template_subtasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."task_templates"
  WHERE (("task_templates"."id" = "task_template_subtasks"."task_template_id") AND ("task_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update their own task templates" ON "public"."task_templates" FOR UPDATE USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can update their own tasks" ON "public"."tasks" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own trophies" ON "public"."trophies" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update their own weekly performance" ON "public"."weekly_performance" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can upsert their own hidden tasks" ON "public"."hidden_task_templates" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view external events from their calendars" ON "public"."events_external" FOR SELECT USING (("provider_calendar_id" IN ( SELECT "external_calendars"."id"
   FROM "public"."external_calendars"
  WHERE ("external_calendars"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view external events through local_event_meta" ON "public"."external_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."local_event_meta"
  WHERE (("local_event_meta"."external_event_id" = "external_events"."id") AND ("local_event_meta"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view mappings through local_event_meta" ON "public"."external_event_mappings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."local_event_meta"
  WHERE (("local_event_meta"."external_event_id" = "external_event_mappings"."external_event_id") AND ("local_event_meta"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view subtasks of exercises they can access" ON "public"."exercise_subtasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."exercise_library"
  WHERE (("exercise_library"."id" = "exercise_subtasks"."exercise_id") AND (("exercise_library"."trainer_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
           FROM "public"."exercise_assignments"
          WHERE (("exercise_assignments"."exercise_id" = "exercise_library"."id") AND ("exercise_assignments"."player_id" = "auth"."uid"())))) OR ("exercise_library"."is_system" = true))))));



CREATE POLICY "Users can view system and own categories" ON "public"."activity_categories" FOR SELECT USING ((("is_system" = true) OR ("user_id" = "auth"."uid"()) OR ("player_id" = "auth"."uid"()) OR ("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE ("team_members"."player_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their event metadata" ON "public"."events_local_meta" FOR SELECT USING ((("auth"."uid"() = "user_id") OR ("auth"."uid"() = "player_id") OR ("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE ("team_members"."player_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own activities" ON "public"."activities" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR ("player_id" = "auth"."uid"()) OR ("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE ("team_members"."player_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own activity series" ON "public"."activity_series" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own activity task subtasks" ON "public"."activity_task_subtasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."activity_tasks"
     JOIN "public"."activities" ON (("activities"."id" = "activity_tasks"."activity_id")))
  WHERE (("activity_tasks"."id" = "activity_task_subtasks"."activity_task_id") AND ("activities"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own activity tasks" ON "public"."activity_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."activities"
  WHERE (("activities"."id" = "activity_tasks"."activity_id") AND ("activities"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own calendars" ON "public"."external_calendars" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own category mappings" ON "public"."category_mappings" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own external event tasks" ON "public"."external_event_tasks" FOR SELECT USING (("local_meta_id" IN ( SELECT "events_local_meta"."id"
   FROM "public"."events_local_meta"
  WHERE ("events_local_meta"."user_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own hidden tasks" ON "public"."hidden_task_templates" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own local event metadata" ON "public"."local_event_meta" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own profile" ON "public"."profiles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own role" ON "public"."user_roles" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own sync logs" ON "public"."event_sync_log" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can view their own task template categories" ON "public"."task_template_categories" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."task_templates"
  WHERE (("task_templates"."id" = "task_template_categories"."task_template_id") AND ("task_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own task template subtasks" ON "public"."task_template_subtasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."task_templates"
  WHERE (("task_templates"."id" = "task_template_subtasks"."task_template_id") AND ("task_templates"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can view their own task templates v2" ON "public"."task_templates" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (("player_id" = "auth"."uid"()) AND ("player_id" IS NOT NULL)) OR (("team_id" IN ( SELECT "team_members"."team_id"
   FROM "public"."team_members"
  WHERE ("team_members"."player_id" = "auth"."uid"()))) AND ("team_id" IS NOT NULL))));



CREATE POLICY "Users can view their own tasks" ON "public"."tasks" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own trophies" ON "public"."trophies" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view their own weekly performance" ON "public"."weekly_performance" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."activities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_series" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_task_subtasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."activity_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."admin_player_relationships" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."category_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_sync_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events_external" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events_local_meta" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_library" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."exercise_subtasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_calendars" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_event_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_event_tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."external_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hidden_activity_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hidden_task_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."local_event_meta" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."player_invitations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_template_categories" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_template_self_feedback" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "task_template_self_feedback_insert" ON "public"."task_template_self_feedback" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."admin_id" = "auth"."uid"()) AND ("apr"."player_id" = "task_template_self_feedback"."user_id"))))));



CREATE POLICY "task_template_self_feedback_select" ON "public"."task_template_self_feedback" FOR SELECT USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."admin_id" = "auth"."uid"()) AND ("apr"."player_id" = "task_template_self_feedback"."user_id"))))));



CREATE POLICY "task_template_self_feedback_update" ON "public"."task_template_self_feedback" FOR UPDATE USING ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."admin_id" = "auth"."uid"()) AND ("apr"."player_id" = "task_template_self_feedback"."user_id")))))) WITH CHECK ((("auth"."uid"() = "user_id") OR (EXISTS ( SELECT 1
   FROM "public"."admin_player_relationships" "apr"
  WHERE (("apr"."admin_id" = "auth"."uid"()) AND ("apr"."player_id" = "task_template_self_feedback"."user_id"))))));



ALTER TABLE "public"."task_template_subtasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."task_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tasks" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."team_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."training_reflections" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "training_reflections_insert_own" ON "public"."training_reflections" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "training_reflections_select_own" ON "public"."training_reflections" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "training_reflections_update_own" ON "public"."training_reflections" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."trophies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."weekly_performance" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."calculate_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."calculate_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."calculate_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."check_player_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_player_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_player_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid", "p_template_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid", "p_template_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cleanup_tasks_for_template"("p_user_id" "uuid", "p_template_id" "uuid", "p_template_title" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_admin_player_relationship"("p_admin_id" "uuid", "p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_admin_player_relationship"("p_admin_id" "uuid", "p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_admin_player_relationship"("p_admin_id" "uuid", "p_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_player_profile"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_player_profile"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_player_profile"("p_user_id" "uuid", "p_full_name" "text", "p_phone_number" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_player_role"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_player_role"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_player_role"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_tasks_for_activity"("p_activity_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_tasks_for_activity"("p_activity_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_tasks_for_activity"("p_activity_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_tasks_for_external_event"("p_local_meta_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_tasks_for_external_event"("p_local_meta_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_tasks_for_external_event"("p_local_meta_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."fix_missing_activity_tasks"() TO "anon";
GRANT ALL ON FUNCTION "public"."fix_missing_activity_tasks"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."fix_missing_activity_tasks"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_player_admins"("p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_player_admins"("p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_player_admins"("p_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_subscription_status"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_subscription_status"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_subscription_status"("user_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_user_library_exercises"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_user_library_exercises"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_library_exercises"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_library_exercises"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."migrate_external_activities"() TO "anon";
GRANT ALL ON FUNCTION "public"."migrate_external_activities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."migrate_external_activities"() TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_data_for_user"("p_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_data_for_user"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_data_for_user"("p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_cleanup_tasks_on_template_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_cleanup_tasks_on_template_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_cleanup_tasks_on_template_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_cleanup_tasks_on_template_hide"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_cleanup_tasks_on_template_hide"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_cleanup_tasks_on_template_hide"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_create_tasks_for_activity"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_create_tasks_for_activity"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_create_tasks_for_activity"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_create_tasks_for_external_event"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_create_tasks_for_external_event"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_create_tasks_for_external_event"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_fix_external_tasks_on_template_category_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_fix_external_tasks_on_template_category_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_fix_external_tasks_on_template_category_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_fix_tasks_on_template_category_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_fix_tasks_on_template_category_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_fix_tasks_on_template_category_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_insert_activity_task_feedback"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_insert_activity_task_feedback"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_insert_activity_task_feedback"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_seed_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_seed_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_seed_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_tasks_on_category_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_tasks_on_category_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_tasks_on_category_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_tasks_on_subtask_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_tasks_on_subtask_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_tasks_on_subtask_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_tasks_on_template_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_tasks_on_template_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_tasks_on_template_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_timestamp"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_timestamp"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_timestamp"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trigger_update_weekly_performance"() TO "anon";
GRANT ALL ON FUNCTION "public"."trigger_update_weekly_performance"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trigger_update_weekly_performance"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_all_tasks_from_template"("p_template_id" "uuid", "p_dry_run" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."update_all_tasks_from_template"("p_template_id" "uuid", "p_dry_run" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_all_tasks_from_template"("p_template_id" "uuid", "p_dry_run" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_category_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_category_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_category_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_profiles_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_series_activities"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_series_activities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_series_activities"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."update_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_weekly_performance"("p_user_id" "uuid", "p_week_number" integer, "p_year" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."upsert_after_training_feedback_task"("p_activity_id" "uuid", "p_task_template_id" "uuid", "p_base_title" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."upsert_after_training_feedback_task"("p_activity_id" "uuid", "p_task_template_id" "uuid", "p_base_title" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."upsert_after_training_feedback_task"("p_activity_id" "uuid", "p_task_template_id" "uuid", "p_base_title" "text") TO "service_role";



GRANT ALL ON TABLE "public"."activities" TO "anon";
GRANT ALL ON TABLE "public"."activities" TO "authenticated";
GRANT ALL ON TABLE "public"."activities" TO "service_role";



GRANT ALL ON TABLE "public"."events_external" TO "anon";
GRANT ALL ON TABLE "public"."events_external" TO "authenticated";
GRANT ALL ON TABLE "public"."events_external" TO "service_role";



GRANT ALL ON TABLE "public"."events_local_meta" TO "anon";
GRANT ALL ON TABLE "public"."events_local_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."events_local_meta" TO "service_role";



GRANT ALL ON TABLE "public"."activities_combined" TO "anon";
GRANT ALL ON TABLE "public"."activities_combined" TO "authenticated";
GRANT ALL ON TABLE "public"."activities_combined" TO "service_role";



GRANT ALL ON TABLE "public"."activity_categories" TO "anon";
GRANT ALL ON TABLE "public"."activity_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_categories" TO "service_role";



GRANT ALL ON TABLE "public"."activity_series" TO "anon";
GRANT ALL ON TABLE "public"."activity_series" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_series" TO "service_role";



GRANT ALL ON TABLE "public"."activity_task_subtasks" TO "anon";
GRANT ALL ON TABLE "public"."activity_task_subtasks" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_task_subtasks" TO "service_role";



GRANT ALL ON TABLE "public"."activity_tasks" TO "anon";
GRANT ALL ON TABLE "public"."activity_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."admin_player_relationships" TO "anon";
GRANT ALL ON TABLE "public"."admin_player_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."admin_player_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."category_mappings" TO "anon";
GRANT ALL ON TABLE "public"."category_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."category_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."event_sync_log" TO "anon";
GRANT ALL ON TABLE "public"."event_sync_log" TO "authenticated";
GRANT ALL ON TABLE "public"."event_sync_log" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_assignments" TO "anon";
GRANT ALL ON TABLE "public"."exercise_assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_assignments" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_library" TO "anon";
GRANT ALL ON TABLE "public"."exercise_library" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_library" TO "service_role";



GRANT ALL ON TABLE "public"."exercise_subtasks" TO "anon";
GRANT ALL ON TABLE "public"."exercise_subtasks" TO "authenticated";
GRANT ALL ON TABLE "public"."exercise_subtasks" TO "service_role";



GRANT ALL ON TABLE "public"."external_calendars" TO "anon";
GRANT ALL ON TABLE "public"."external_calendars" TO "authenticated";
GRANT ALL ON TABLE "public"."external_calendars" TO "service_role";



GRANT ALL ON TABLE "public"."external_event_mappings" TO "anon";
GRANT ALL ON TABLE "public"."external_event_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."external_event_mappings" TO "service_role";



GRANT ALL ON SEQUENCE "public"."external_event_mappings_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."external_event_mappings_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."external_event_mappings_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."external_event_tasks" TO "anon";
GRANT ALL ON TABLE "public"."external_event_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."external_event_tasks" TO "service_role";



GRANT ALL ON TABLE "public"."external_events" TO "anon";
GRANT ALL ON TABLE "public"."external_events" TO "authenticated";
GRANT ALL ON TABLE "public"."external_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."external_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."external_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."external_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."hidden_activity_categories" TO "anon";
GRANT ALL ON TABLE "public"."hidden_activity_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."hidden_activity_categories" TO "service_role";



GRANT ALL ON TABLE "public"."hidden_task_templates" TO "anon";
GRANT ALL ON TABLE "public"."hidden_task_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."hidden_task_templates" TO "service_role";



GRANT ALL ON TABLE "public"."local_event_meta" TO "anon";
GRANT ALL ON TABLE "public"."local_event_meta" TO "authenticated";
GRANT ALL ON TABLE "public"."local_event_meta" TO "service_role";



GRANT ALL ON SEQUENCE "public"."local_event_meta_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."local_event_meta_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."local_event_meta_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."player_invitations" TO "anon";
GRANT ALL ON TABLE "public"."player_invitations" TO "authenticated";
GRANT ALL ON TABLE "public"."player_invitations" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."subscription_plans" TO "anon";
GRANT ALL ON TABLE "public"."subscription_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_plans" TO "service_role";



GRANT ALL ON TABLE "public"."subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."task_template_categories" TO "anon";
GRANT ALL ON TABLE "public"."task_template_categories" TO "authenticated";
GRANT ALL ON TABLE "public"."task_template_categories" TO "service_role";



GRANT ALL ON TABLE "public"."task_template_self_feedback" TO "anon";
GRANT ALL ON TABLE "public"."task_template_self_feedback" TO "authenticated";
GRANT ALL ON TABLE "public"."task_template_self_feedback" TO "service_role";



GRANT ALL ON TABLE "public"."task_template_subtasks" TO "anon";
GRANT ALL ON TABLE "public"."task_template_subtasks" TO "authenticated";
GRANT ALL ON TABLE "public"."task_template_subtasks" TO "service_role";



GRANT ALL ON TABLE "public"."task_templates" TO "anon";
GRANT ALL ON TABLE "public"."task_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."task_templates" TO "service_role";



GRANT ALL ON TABLE "public"."tasks" TO "anon";
GRANT ALL ON TABLE "public"."tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."tasks" TO "service_role";



GRANT ALL ON TABLE "public"."team_members" TO "anon";
GRANT ALL ON TABLE "public"."team_members" TO "authenticated";
GRANT ALL ON TABLE "public"."team_members" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON TABLE "public"."training_reflections" TO "anon";
GRANT ALL ON TABLE "public"."training_reflections" TO "authenticated";
GRANT ALL ON TABLE "public"."training_reflections" TO "service_role";



GRANT ALL ON TABLE "public"."trophies" TO "anon";
GRANT ALL ON TABLE "public"."trophies" TO "authenticated";
GRANT ALL ON TABLE "public"."trophies" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."weekly_performance" TO "anon";
GRANT ALL ON TABLE "public"."weekly_performance" TO "authenticated";
GRANT ALL ON TABLE "public"."weekly_performance" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







