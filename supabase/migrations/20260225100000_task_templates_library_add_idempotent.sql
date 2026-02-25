-- Ensure library add-to-tasks is idempotent per user scope and exercise.

alter table public.task_templates
  add column if not exists library_exercise_id uuid;

alter table public.task_templates
  drop constraint if exists task_templates_library_exercise_id_fkey;

alter table public.task_templates
  add constraint task_templates_library_exercise_id_fkey
  foreign key (library_exercise_id)
  references public.exercise_library(id)
  on delete set null;

-- Backfill only deterministic matches from existing library-origin templates.
with normalized_library as (
  select
    e.id,
    lower(trim(coalesce(e.title, ''))) as norm_title,
    lower(trim(coalesce(e.description, ''))) as norm_description,
    lower(trim(coalesce(e.video_url, ''))) as norm_video
  from public.exercise_library e
),
matched as (
  select
    t.id as task_template_id,
    (array_agg(l.id order by l.id))[1] as library_exercise_id,
    count(*) as match_count
  from public.task_templates t
  join normalized_library l
    on l.norm_title = lower(trim(coalesce(t.title, '')))
   and l.norm_description = lower(trim(coalesce(t.description, '')))
   and l.norm_video = lower(trim(coalesce(t.video_url, '')))
  where t.library_exercise_id is null
    and (
      lower(coalesce(t.source_folder, '')) like 'footballcoach inspiration%'
      or lower(coalesce(t.source_folder, '')) like 'fra træner%'
    )
  group by t.id
)
update public.task_templates t
set library_exercise_id = m.library_exercise_id
from matched m
where t.id = m.task_template_id
  and m.match_count = 1;

-- Remove duplicate rows before adding unique index.
with ranked as (
  select
    id,
    row_number() over (
      partition by user_id, player_id, team_id, library_exercise_id
      order by created_at asc, id asc
    ) as rn
  from public.task_templates
  where library_exercise_id is not null
)
delete from public.task_templates t
using ranked r
where t.id = r.id
  and r.rn > 1;

drop index if exists task_templates_user_scope_library_exercise_uidx;

create unique index task_templates_user_scope_library_exercise_uidx
  on public.task_templates (user_id, player_id, team_id, library_exercise_id)
  nulls not distinct
  where library_exercise_id is not null;
