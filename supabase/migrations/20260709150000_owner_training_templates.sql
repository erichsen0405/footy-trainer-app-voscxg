-- Issue #286: Owner-scoped training templates for task, session and week planning.

create table if not exists public.training_template_folders (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  color text not null default '#2563eb',
  sort_order integer not null default 0,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_template_folders_owner_id_unique unique (owner_account_id, id),
  constraint training_template_folders_name_not_blank_check check (btrim(name) <> ''),
  constraint training_template_folders_normalized_not_blank_check check (btrim(normalized_name) <> ''),
  constraint training_template_folders_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  unique (owner_account_id, normalized_name)
);

create table if not exists public.training_templates (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  template_type text not null,
  title text not null,
  description text null,
  status text not null default 'active',
  folder_id uuid null,
  focus_areas text[] not null default '{}'::text[],
  duration_minutes integer null,
  source_task_template_id uuid null references public.task_templates(id) on delete set null,
  active_version_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint training_templates_owner_id_unique unique (owner_account_id, id),
  constraint training_templates_folder_fkey foreign key (folder_id)
    references public.training_template_folders(id)
    on delete set null,
  constraint training_templates_type_check check (template_type in ('task', 'session', 'week')),
  constraint training_templates_status_check check (status in ('active', 'archived')),
  constraint training_templates_title_not_blank_check check (btrim(title) <> ''),
  constraint training_templates_duration_check check (duration_minutes is null or duration_minutes between 1 and 1440),
  constraint training_templates_focus_max_12 check (cardinality(focus_areas) <= 12)
);

create table if not exists public.training_template_items (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  template_id uuid not null,
  parent_item_id uuid null,
  item_type text not null,
  source_task_template_id uuid null references public.task_templates(id) on delete set null,
  source_activity_series_id uuid null references public.activity_series(id) on delete set null,
  linked_template_id uuid null,
  title text not null,
  description text null,
  day_offset integer not null default 0,
  start_time time null,
  duration_minutes integer null,
  sort_order integer not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_template_items_owner_id_unique unique (owner_account_id, id),
  constraint training_template_items_template_fkey foreign key (owner_account_id, template_id)
    references public.training_templates(owner_account_id, id)
    on delete cascade,
  constraint training_template_items_parent_fkey foreign key (parent_item_id)
    references public.training_template_items(id)
    on delete cascade,
  constraint training_template_items_linked_template_fkey foreign key (linked_template_id)
    references public.training_templates(id)
    on delete set null,
  constraint training_template_items_type_check check (item_type in ('task_template', 'activity', 'session_template', 'note', 'focus')),
  constraint training_template_items_title_not_blank_check check (btrim(title) <> ''),
  constraint training_template_items_day_offset_check check (day_offset >= 0 and day_offset <= 365),
  constraint training_template_items_duration_check check (duration_minutes is null or duration_minutes between 1 and 1440)
);

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  template_id uuid not null,
  version_number integer not null,
  snapshot jsonb not null,
  change_note text null,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint template_versions_owner_id_unique unique (owner_account_id, id),
  constraint template_versions_template_fkey foreign key (owner_account_id, template_id)
    references public.training_templates(owner_account_id, id)
    on delete cascade,
  constraint template_versions_number_positive_check check (version_number > 0),
  unique (template_id, version_number)
);

create index if not exists training_template_folders_owner_sort_idx
  on public.training_template_folders (owner_account_id, sort_order, name);

create index if not exists training_templates_owner_status_type_idx
  on public.training_templates (owner_account_id, status, template_type, updated_at desc);

create index if not exists training_templates_folder_idx
  on public.training_templates (owner_account_id, folder_id);

create index if not exists training_template_items_template_sort_idx
  on public.training_template_items (owner_account_id, template_id, sort_order);

create index if not exists template_versions_template_version_idx
  on public.template_versions (owner_account_id, template_id, version_number desc);

drop trigger if exists update_training_template_folders_updated_at on public.training_template_folders;
create trigger update_training_template_folders_updated_at
before update on public.training_template_folders
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_training_templates_updated_at on public.training_templates;
create trigger update_training_templates_updated_at
before update on public.training_templates
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_training_template_items_updated_at on public.training_template_items;
create trigger update_training_template_items_updated_at
before update on public.training_template_items
for each row
execute function public.trigger_update_timestamp();

alter table public.training_template_folders enable row level security;
alter table public.training_templates enable row level security;
alter table public.training_template_items enable row level security;
alter table public.template_versions enable row level security;

drop policy if exists "Owner coaches can read training template folders" on public.training_template_folders;
create policy "Owner coaches can read training template folders"
  on public.training_template_folders
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can write training template folders" on public.training_template_folders;
create policy "Owner coaches can write training template folders"
  on public.training_template_folders
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can read training templates" on public.training_templates;
create policy "Owner coaches can read training templates"
  on public.training_templates
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can write training templates" on public.training_templates;
create policy "Owner coaches can write training templates"
  on public.training_templates
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can read training template items" on public.training_template_items;
create policy "Owner coaches can read training template items"
  on public.training_template_items
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can write training template items" on public.training_template_items;
create policy "Owner coaches can write training template items"
  on public.training_template_items
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can read training template versions" on public.template_versions;
create policy "Owner coaches can read training template versions"
  on public.template_versions
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can write training template versions" on public.template_versions;
create policy "Owner coaches can write training template versions"
  on public.template_versions
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

revoke all on public.training_template_folders from anon;
revoke all on public.training_templates from anon;
revoke all on public.training_template_items from anon;
revoke all on public.template_versions from anon;

grant select, insert, update, delete on public.training_template_folders to authenticated;
grant select, insert, update, delete on public.training_templates to authenticated;
grant select, insert, update, delete on public.training_template_items to authenticated;
grant select, insert, update, delete on public.template_versions to authenticated;

grant all on public.training_template_folders to service_role;
grant all on public.training_templates to service_role;
grant all on public.training_template_items to service_role;
grant all on public.template_versions to service_role;

comment on table public.training_templates is
  'Owner-scoped reusable training templates for tasks, sessions and weeks. Supabase is source of truth for mobile and Base44. Players and guardians must not be granted template-admin access.';

comment on table public.training_template_items is
  'Ordered reusable template contents. Items can link to existing task_templates, activity_series or other training templates inside the same owner account.';

comment on table public.template_versions is
  'Immutable snapshots used so assignments can remain stable when training templates are edited later.';
