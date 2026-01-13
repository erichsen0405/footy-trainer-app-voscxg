create or replace function public.get_user_library_exercises(p_user_id uuid)
returns table (
  id text,
  trainer_id text,
  title text,
  description text,
  video_url text,
  thumbnail_url text,
  created_at text,
  updated_at text,
  is_system boolean,
  category_path text,
  difficulty int,
  position text,
  trainer_name text,
  last_score int,
  execution_count int,
  is_added_to_tasks boolean
)
language sql
security invoker
set search_path = public
as $$
  with src as (
    select
      t,
      to_jsonb(t) as j
    from public.task_templates t
  ),
  parsed as (
    select
      t,
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
      ) as safe_is_added_to_tasks
    from src
  )
  select
    coalesce(
      nullif(j->>'id',''),
      nullif(j->>'exercise_id',''),
      nullif(j->>'template_id',''),
      t.id::text
    ) as id,
    coalesce(
      nullif(j->>'trainer_id',''),
      nullif(j->>'created_by',''),
      nullif(j->>'user_id',''),
      nullif(j->>'owner_id',''),
      ''
    ) as trainer_id,
    coalesce(nullif(j->>'title',''), nullif(j->>'name',''), '') as title,
    nullif(coalesce(j->>'description', j->>'notes', ''), '') as description,
    nullif(coalesce(j->>'video_url', j->>'video', ''), '') as video_url,
    nullif(coalesce(j->>'thumbnail_url', j->>'thumbnail', j->>'image_url', ''), '') as thumbnail_url,
    coalesce(nullif(j->>'created_at',''), now()::text) as created_at,
    coalesce(nullif(j->>'updated_at',''), nullif(j->>'created_at',''), now()::text) as updated_at,
    safe_is_system as is_system,
    nullif(coalesce(j->>'category_path', j->>'category', j->>'folder_id', j->>'source_folder', ''), '') as category_path,
    safe_difficulty as difficulty,
    nullif(coalesce(j->>'position', j->>'player_position', ''), '') as position,
    nullif(coalesce(j->>'trainer_name', j->>'author_name', ''), '') as trainer_name,
    null::int as last_score,
    null::int as execution_count,
    safe_is_added_to_tasks as is_added_to_tasks
  from parsed;
$$;

revoke all on function public.get_user_library_exercises(uuid) from public;
grant execute on function public.get_user_library_exercises(uuid) to authenticated;
