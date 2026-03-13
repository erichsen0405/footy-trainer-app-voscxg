create table if not exists public.trainer_activity_feedback (
  id uuid primary key default gen_random_uuid(),
  activity_context_type text not null
    check (activity_context_type in ('internal', 'external')),
  activity_context_id uuid not null,
  player_id uuid not null references auth.users(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  feedback_text text not null
    check (length(btrim(feedback_text)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainer_activity_feedback_context_player_trainer_key
    unique (activity_context_type, activity_context_id, player_id, trainer_id)
);

create index if not exists trainer_activity_feedback_player_context_idx
  on public.trainer_activity_feedback (player_id, activity_context_type, activity_context_id);

create index if not exists trainer_activity_feedback_trainer_context_idx
  on public.trainer_activity_feedback (trainer_id, activity_context_type, activity_context_id);

alter table public.trainer_activity_feedback enable row level security;

drop policy if exists "Players can read own trainer feedback" on public.trainer_activity_feedback;
create policy "Players can read own trainer feedback"
  on public.trainer_activity_feedback
  for select
  using (player_id = auth.uid());

drop policy if exists "Trainers can read own trainer feedback" on public.trainer_activity_feedback;
create policy "Trainers can read own trainer feedback"
  on public.trainer_activity_feedback
  for select
  using (trainer_id = auth.uid());

drop policy if exists "Service role can manage trainer feedback" on public.trainer_activity_feedback;
create policy "Service role can manage trainer feedback"
  on public.trainer_activity_feedback
  using ((auth.jwt() ->> 'role') = 'service_role')
  with check ((auth.jwt() ->> 'role') = 'service_role');

drop trigger if exists update_trainer_activity_feedback_timestamp on public.trainer_activity_feedback;
create trigger update_trainer_activity_feedback_timestamp
  before update on public.trainer_activity_feedback
  for each row
  execute function public.trigger_update_timestamp();

grant select on public.trainer_activity_feedback to authenticated;
grant all on public.trainer_activity_feedback to service_role;
