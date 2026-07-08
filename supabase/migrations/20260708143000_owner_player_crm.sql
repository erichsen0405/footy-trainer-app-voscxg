-- Issue #283: Owner-scoped player CRM for clubs and private coach businesses.

create table if not exists public.owner_player_crm_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  crm_status text not null default 'active',
  positions text[] not null default '{}'::text[],
  playing_level text null,
  club_name text null,
  date_of_birth date null,
  phone_number text null,
  email text null,
  email_visible_to_staff boolean not null default true,
  phone_visible_to_staff boolean not null default true,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_player_crm_profiles_owner_player_key unique (owner_account_id, player_id),
  constraint owner_player_crm_profiles_owner_player_fkey foreign key (owner_account_id, player_id)
    references public.owner_players(owner_account_id, player_id)
    on delete cascade,
  constraint owner_player_crm_profiles_status_check check (crm_status in ('active', 'paused', 'former', 'trial')),
  constraint owner_player_crm_profiles_positions_max_8 check (cardinality(positions) <= 8),
  constraint owner_player_crm_profiles_email_lowercase_check check (email is null or email = lower(email))
);

create table if not exists public.owner_player_tags (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  color text not null default '#2563eb',
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_player_tags_name_not_blank_check check (btrim(name) <> ''),
  constraint owner_player_tags_normalized_not_blank_check check (btrim(normalized_name) <> ''),
  constraint owner_player_tags_color_check check (color ~ '^#[0-9A-Fa-f]{6}$'),
  unique (owner_account_id, normalized_name)
);

create table if not exists public.owner_player_tag_links (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  tag_id uuid not null references public.owner_player_tags(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint owner_player_tag_links_owner_player_fkey foreign key (owner_account_id, player_id)
    references public.owner_players(owner_account_id, player_id)
    on delete cascade,
  unique (owner_account_id, player_id, tag_id)
);

create table if not exists public.owner_player_notes (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  visibility text not null default 'coach_private',
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_player_notes_owner_player_fkey foreign key (owner_account_id, player_id)
    references public.owner_players(owner_account_id, player_id)
    on delete cascade,
  constraint owner_player_notes_body_not_blank_check check (btrim(body) <> ''),
  constraint owner_player_notes_visibility_check check (visibility in ('coach_private'))
);

create table if not exists public.owner_player_guardian_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  guardian_user_id uuid null references auth.users(id) on delete set null,
  full_name text not null,
  email text null,
  phone_number text null,
  relation text not null default 'parent',
  notes text null,
  status text not null default 'active',
  permissions jsonb not null default '{"read": false}'::jsonb,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_player_guardian_contacts_owner_player_fkey foreign key (owner_account_id, player_id)
    references public.owner_players(owner_account_id, player_id)
    on delete cascade,
  constraint owner_player_guardian_contacts_full_name_not_blank_check check (btrim(full_name) <> ''),
  constraint owner_player_guardian_contacts_email_lowercase_check check (email is null or email = lower(email)),
  constraint owner_player_guardian_contacts_relation_check check (relation in ('parent', 'guardian', 'other')),
  constraint owner_player_guardian_contacts_status_check check (status in ('active', 'pending', 'inactive', 'removed'))
);

create index if not exists owner_player_crm_profiles_owner_status_idx
  on public.owner_player_crm_profiles (owner_account_id, crm_status);

create index if not exists owner_player_crm_profiles_player_id_idx
  on public.owner_player_crm_profiles (player_id);

create index if not exists owner_player_tags_owner_idx
  on public.owner_player_tags (owner_account_id);

create index if not exists owner_player_tag_links_owner_player_idx
  on public.owner_player_tag_links (owner_account_id, player_id);

create index if not exists owner_player_tag_links_tag_id_idx
  on public.owner_player_tag_links (tag_id);

create index if not exists owner_player_notes_owner_player_idx
  on public.owner_player_notes (owner_account_id, player_id, updated_at desc);

create index if not exists owner_player_guardian_contacts_owner_player_idx
  on public.owner_player_guardian_contacts (owner_account_id, player_id);

drop trigger if exists update_owner_player_crm_profiles_updated_at on public.owner_player_crm_profiles;
create trigger update_owner_player_crm_profiles_updated_at
before update on public.owner_player_crm_profiles
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_owner_player_tags_updated_at on public.owner_player_tags;
create trigger update_owner_player_tags_updated_at
before update on public.owner_player_tags
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_owner_player_notes_updated_at on public.owner_player_notes;
create trigger update_owner_player_notes_updated_at
before update on public.owner_player_notes
for each row
execute function public.trigger_update_timestamp();

drop trigger if exists update_owner_player_guardian_contacts_updated_at on public.owner_player_guardian_contacts;
create trigger update_owner_player_guardian_contacts_updated_at
before update on public.owner_player_guardian_contacts
for each row
execute function public.trigger_update_timestamp();

alter table public.owner_player_crm_profiles enable row level security;
alter table public.owner_player_tags enable row level security;
alter table public.owner_player_tag_links enable row level security;
alter table public.owner_player_notes enable row level security;
alter table public.owner_player_guardian_contacts enable row level security;

drop policy if exists "Owner coaches can read CRM profiles" on public.owner_player_crm_profiles;
create policy "Owner coaches can read CRM profiles"
  on public.owner_player_crm_profiles
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can write CRM profiles" on public.owner_player_crm_profiles;
create policy "Owner coaches can write CRM profiles"
  on public.owner_player_crm_profiles
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can read CRM tags" on public.owner_player_tags;
create policy "Owner coaches can read CRM tags"
  on public.owner_player_tags
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can write CRM tags" on public.owner_player_tags;
create policy "Owner coaches can write CRM tags"
  on public.owner_player_tags
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can read CRM tag links" on public.owner_player_tag_links;
create policy "Owner coaches can read CRM tag links"
  on public.owner_player_tag_links
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can write CRM tag links" on public.owner_player_tag_links;
create policy "Owner coaches can write CRM tag links"
  on public.owner_player_tag_links
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can read private player notes" on public.owner_player_notes;
create policy "Owner coaches can read private player notes"
  on public.owner_player_notes
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can write private player notes" on public.owner_player_notes;
create policy "Owner coaches can write private player notes"
  on public.owner_player_notes
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can read guardian CRM contacts" on public.owner_player_guardian_contacts;
create policy "Owner coaches can read guardian CRM contacts"
  on public.owner_player_guardian_contacts
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Owner coaches can write guardian CRM contacts" on public.owner_player_guardian_contacts;
create policy "Owner coaches can write guardian CRM contacts"
  on public.owner_player_guardian_contacts
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

revoke all on public.owner_player_crm_profiles from anon;
revoke all on public.owner_player_tags from anon;
revoke all on public.owner_player_tag_links from anon;
revoke all on public.owner_player_notes from anon;
revoke all on public.owner_player_guardian_contacts from anon;

grant select, insert, update, delete on public.owner_player_crm_profiles to authenticated;
grant select, insert, update, delete on public.owner_player_tags to authenticated;
grant select, insert, update, delete on public.owner_player_tag_links to authenticated;
grant select, insert, update, delete on public.owner_player_notes to authenticated;
grant select, insert, update, delete on public.owner_player_guardian_contacts to authenticated;

grant all on public.owner_player_crm_profiles to service_role;
grant all on public.owner_player_tags to service_role;
grant all on public.owner_player_tag_links to service_role;
grant all on public.owner_player_notes to service_role;
grant all on public.owner_player_guardian_contacts to service_role;

comment on table public.owner_player_crm_profiles is
  'Owner-scoped player CRM metadata. Separate from global profiles and owner_players roster/access status.';

comment on table public.owner_player_notes is
  'Coach-private CRM notes. Players and guardians must not be granted access to this table.';

comment on table public.owner_player_guardian_contacts is
  'CRM contact information for parent/guardian preparation. App access still requires explicit owner_player_guardians rows.';
