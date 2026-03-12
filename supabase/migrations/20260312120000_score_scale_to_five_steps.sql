-- Rollout contract:
-- 1. Apply this migration before deploying any app code that writes 1-5 scores.
-- 2. This migration assumes persisted scores are still on the legacy 1-10 scale.
-- 3. If any 1-5 scores have already been written in remote/dev data, clean them up before running this migration.

update public.activities
set intensity = case
  when intensity is null then null
  when greatest(1, least(10, round(intensity)::integer)) <= 2 then 1
  when greatest(1, least(10, round(intensity)::integer)) <= 4 then 2
  when greatest(1, least(10, round(intensity)::integer)) <= 6 then 3
  when greatest(1, least(10, round(intensity)::integer)) <= 8 then 4
  else 5
end
where intensity is not null;

update public.events_local_meta
set intensity = case
  when intensity is null then null
  when greatest(1, least(10, round(intensity)::integer)) <= 2 then 1
  when greatest(1, least(10, round(intensity)::integer)) <= 4 then 2
  when greatest(1, least(10, round(intensity)::integer)) <= 6 then 3
  when greatest(1, least(10, round(intensity)::integer)) <= 8 then 4
  else 5
end
where intensity is not null;

alter table public.task_template_self_feedback
  disable trigger validate_task_template_self_feedback_activity_id;

update public.task_template_self_feedback
set rating = case
  when rating is null then null
  when greatest(1, least(10, round(rating)::integer)) <= 2 then 1
  when greatest(1, least(10, round(rating)::integer)) <= 4 then 2
  when greatest(1, least(10, round(rating)::integer)) <= 6 then 3
  when greatest(1, least(10, round(rating)::integer)) <= 8 then 4
  else 5
end,
intensity = case
  when intensity is null then null
  when greatest(1, least(10, round(intensity)::integer)) <= 2 then 1
  when greatest(1, least(10, round(intensity)::integer)) <= 4 then 2
  when greatest(1, least(10, round(intensity)::integer)) <= 6 then 3
  when greatest(1, least(10, round(intensity)::integer)) <= 8 then 4
  else 5
end
where rating is not null
   or intensity is not null;

alter table public.task_template_self_feedback
  enable trigger validate_task_template_self_feedback_activity_id;

update public.training_reflections
set rating = case
  when rating is null then null
  when greatest(1, least(10, round(rating)::integer)) <= 2 then 1
  when greatest(1, least(10, round(rating)::integer)) <= 4 then 2
  when greatest(1, least(10, round(rating)::integer)) <= 6 then 3
  when greatest(1, least(10, round(rating)::integer)) <= 8 then 4
  else 5
end
where rating is not null;

alter table public.activities
  drop constraint if exists activities_intensity_valid;

alter table public.activities
  add constraint activities_intensity_valid
  check (intensity is null or (intensity between 1 and 5));

alter table public.events_local_meta
  drop constraint if exists events_local_meta_intensity_valid;

alter table public.events_local_meta
  add constraint events_local_meta_intensity_valid
  check (intensity is null or (intensity between 1 and 5));

alter table public.task_template_self_feedback
  drop constraint if exists task_template_self_feedback_rating_check;

alter table public.task_template_self_feedback
  add constraint task_template_self_feedback_rating_check
  check (rating is null or (rating between 1 and 5));

alter table public.task_template_self_feedback
  drop constraint if exists task_template_self_feedback_intensity_check;

alter table public.task_template_self_feedback
  add constraint task_template_self_feedback_intensity_check
  check (intensity is null or (intensity between 1 and 5));

alter table public.training_reflections
  drop constraint if exists training_reflections_rating_check;

alter table public.training_reflections
  add constraint training_reflections_rating_check
  check (rating is null or (rating between 1 and 5));
