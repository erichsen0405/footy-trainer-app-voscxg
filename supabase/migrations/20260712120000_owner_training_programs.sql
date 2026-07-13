-- Issue #285: owner-scoped training programs, immutable published versions and enrollments.

create table public.training_programs (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  title text not null check (btrim(title) <> ''),
  description text,
  audience text,
  level text,
  duration_weeks integer not null check (duration_weeks between 1 and 52),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_version integer not null default 0 check (published_version >= 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_account_id, id)
);

create table public.program_phases (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  program_id uuid not null,
  title text not null check (btrim(title) <> ''),
  description text,
  week_offset integer not null default 0 check (week_offset between 0 and 51),
  duration_weeks integer not null default 1 check (duration_weeks between 1 and 52),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_account_id, program_id) references public.training_programs(owner_account_id, id) on delete cascade,
  unique (owner_account_id, id)
);

create table public.program_items (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  program_id uuid not null,
  phase_id uuid,
  item_type text not null check (item_type in ('task_template', 'exercise_template', 'session_template', 'week_template', 'note', 'focus', 'video', 'test')),
  training_template_id uuid references public.training_templates(id) on delete restrict,
  title text not null check (btrim(title) <> ''),
  description text,
  day_offset integer not null default 0 check (day_offset between 0 and 363),
  sort_order integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_account_id, program_id) references public.training_programs(owner_account_id, id) on delete cascade,
  foreign key (owner_account_id, phase_id) references public.program_phases(owner_account_id, id) on delete cascade
);

create table public.program_versions (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  program_id uuid not null,
  version_number integer not null check (version_number > 0),
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (owner_account_id, program_id) references public.training_programs(owner_account_id, id) on delete cascade,
  unique (program_id, version_number),
  unique (owner_account_id, id)
);

create table public.program_enrollments (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  program_id uuid not null,
  program_version_id uuid not null,
  player_id uuid not null references auth.users(id) on delete cascade,
  source_team_id uuid references public.teams(id) on delete set null,
  start_date date not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  paused_at timestamptz,
  completed_at timestamptz,
  enrolled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_account_id, program_id) references public.training_programs(owner_account_id, id) on delete cascade,
  foreign key (owner_account_id, program_version_id) references public.program_versions(owner_account_id, id) on delete restrict,
  unique (program_id, player_id, start_date),
  unique (owner_account_id, id)
);

create table public.program_enrollment_items (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  enrollment_id uuid not null,
  program_item_id uuid,
  player_id uuid not null references auth.users(id) on delete cascade,
  scheduled_date date not null,
  item_type text not null,
  title text not null,
  snapshot jsonb not null default '{}'::jsonb,
  activity_id uuid references public.activities(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  status text not null default 'upcoming' check (status in ('upcoming', 'available', 'completed', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (owner_account_id, enrollment_id) references public.program_enrollments(owner_account_id, id) on delete cascade,
  unique (enrollment_id, program_item_id)
);

create index training_programs_owner_status_idx on public.training_programs(owner_account_id, status, updated_at desc);
create index program_items_program_sort_idx on public.program_items(owner_account_id, program_id, day_offset, sort_order);
create index program_enrollments_player_idx on public.program_enrollments(player_id, status, start_date);
create index program_enrollment_items_player_date_idx on public.program_enrollment_items(player_id, scheduled_date);

create trigger update_training_programs_updated_at before update on public.training_programs for each row execute function public.trigger_update_timestamp();
create trigger update_program_phases_updated_at before update on public.program_phases for each row execute function public.trigger_update_timestamp();
create trigger update_program_items_updated_at before update on public.program_items for each row execute function public.trigger_update_timestamp();
create trigger update_program_enrollments_updated_at before update on public.program_enrollments for each row execute function public.trigger_update_timestamp();
create trigger update_program_enrollment_items_updated_at before update on public.program_enrollment_items for each row execute function public.trigger_update_timestamp();

alter table public.training_programs enable row level security;
alter table public.program_phases enable row level security;
alter table public.program_items enable row level security;
alter table public.program_versions enable row level security;
alter table public.program_enrollments enable row level security;
alter table public.program_enrollment_items enable row level security;

create policy "Owner coaches manage programs" on public.training_programs for all to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));
create policy "Owner coaches manage phases" on public.program_phases for all to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));
create policy "Owner coaches manage program items" on public.program_items for all to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));
create policy "Owner coaches read program versions" on public.program_versions for select to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));
create policy "Owner coaches manage enrollments" on public.program_enrollments for all to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));
create policy "Players read own enrollments" on public.program_enrollments for select to authenticated using (player_id = (select auth.uid()));
create policy "Owner coaches manage enrollment items" on public.program_enrollment_items for all to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));
create policy "Players read own program items" on public.program_enrollment_items for select to authenticated using (player_id = (select auth.uid()));

revoke all on public.training_programs, public.program_phases, public.program_items, public.program_versions, public.program_enrollments, public.program_enrollment_items from anon;
grant select, insert, update, delete on public.training_programs, public.program_phases, public.program_items, public.program_enrollments, public.program_enrollment_items to authenticated;
grant select on public.program_versions to authenticated;
grant all on public.training_programs, public.program_phases, public.program_items, public.program_versions, public.program_enrollments, public.program_enrollment_items to service_role;

comment on table public.program_versions is 'Immutable program snapshots. Enrollments reference a version so later edits never rewrite player history.';
comment on table public.program_enrollment_items is 'Dated snapshot instances for mobile player progression; activity_id/task_id link materialized legacy records when applicable.';
