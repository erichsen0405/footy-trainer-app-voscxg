create table if not exists public.activity_assignment_team_exclusions (
  id uuid primary key default gen_random_uuid(),
  source_activity_id uuid null,
  external_event_id uuid null,
  team_id uuid not null,
  player_id uuid not null,
  created_at timestamptz not null default now(),
  constraint activity_assignment_team_exclusions_source_check
    check (((source_activity_id is not null)::int + (external_event_id is not null)::int) = 1),
  constraint activity_assignment_team_exclusions_source_activity_id_fkey
    foreign key (source_activity_id)
    references public.activities (id)
    on delete cascade,
  constraint activity_assignment_team_exclusions_external_event_id_fkey
    foreign key (external_event_id)
    references public.events_external (id)
    on delete cascade,
  constraint activity_assignment_team_exclusions_team_id_fkey
    foreign key (team_id)
    references public.teams (id)
    on delete cascade,
  constraint activity_assignment_team_exclusions_player_id_fkey
    foreign key (player_id)
    references auth.users (id)
    on delete cascade
);

create index if not exists idx_activity_assignment_team_exclusions_source_activity
  on public.activity_assignment_team_exclusions (source_activity_id);

create index if not exists idx_activity_assignment_team_exclusions_external_event
  on public.activity_assignment_team_exclusions (external_event_id);

create index if not exists idx_activity_assignment_team_exclusions_team_player
  on public.activity_assignment_team_exclusions (team_id, player_id);

create unique index if not exists idx_activity_assignment_team_exclusions_internal_unique
  on public.activity_assignment_team_exclusions (source_activity_id, team_id, player_id)
  where source_activity_id is not null;

create unique index if not exists idx_activity_assignment_team_exclusions_external_unique
  on public.activity_assignment_team_exclusions (external_event_id, team_id, player_id)
  where external_event_id is not null;

grant select, insert, delete on public.activity_assignment_team_exclusions to authenticated;

alter table public.activity_assignment_team_exclusions enable row level security;

drop policy if exists "trainer can view activity assignment team exclusions"
  on public.activity_assignment_team_exclusions;
create policy "trainer can view activity assignment team exclusions"
  on public.activity_assignment_team_exclusions
  for select
  to authenticated
  using (
    (
      source_activity_id is not null
      and exists (
        select 1
        from public.activities a
        where a.id = source_activity_id
          and a.user_id = auth.uid()
          and coalesce(a.is_external, false) = false
      )
    )
    or (
      external_event_id is not null
      and exists (
        select 1
        from public.events_external ee
        join public.external_calendars ec
          on ec.id = ee.provider_calendar_id
        where ee.id = external_event_id
          and ec.user_id = auth.uid()
      )
    )
  );

drop policy if exists "trainer can insert activity assignment team exclusions"
  on public.activity_assignment_team_exclusions;
create policy "trainer can insert activity assignment team exclusions"
  on public.activity_assignment_team_exclusions
  for insert
  to authenticated
  with check (
    (
      source_activity_id is not null
      and exists (
        select 1
        from public.activities a
        where a.id = source_activity_id
          and a.user_id = auth.uid()
          and coalesce(a.is_external, false) = false
      )
    )
    or (
      external_event_id is not null
      and exists (
        select 1
        from public.events_external ee
        join public.external_calendars ec
          on ec.id = ee.provider_calendar_id
        where ee.id = external_event_id
          and ec.user_id = auth.uid()
      )
    )
  );

drop policy if exists "trainer can delete activity assignment team exclusions"
  on public.activity_assignment_team_exclusions;
create policy "trainer can delete activity assignment team exclusions"
  on public.activity_assignment_team_exclusions
  for delete
  to authenticated
  using (
    (
      source_activity_id is not null
      and exists (
        select 1
        from public.activities a
        where a.id = source_activity_id
          and a.user_id = auth.uid()
          and coalesce(a.is_external, false) = false
      )
    )
    or (
      external_event_id is not null
      and exists (
        select 1
        from public.events_external ee
        join public.external_calendars ec
          on ec.id = ee.provider_calendar_id
        where ee.id = external_event_id
          and ec.user_id = auth.uid()
      )
    )
  );
