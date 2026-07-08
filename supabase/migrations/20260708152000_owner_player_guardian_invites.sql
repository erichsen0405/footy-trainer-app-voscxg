-- Issue #316: Guardian invite and acceptance flow for owner player CRM.

create table if not exists public.owner_player_guardian_invites (
  id uuid primary key default gen_random_uuid(),
  owner_account_id uuid not null references public.owner_accounts(id) on delete cascade,
  player_id uuid not null references auth.users(id) on delete cascade,
  guardian_contact_id uuid null references public.owner_player_guardian_contacts(id) on delete set null,
  guardian_user_id uuid null references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  relation text not null default 'parent',
  token_hash text not null unique,
  status text not null default 'pending',
  expires_at timestamptz not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid null references auth.users(id) on delete set null,
  accepted_at timestamptz null,
  cancelled_at timestamptz null,
  revoked_at timestamptz null,
  last_sent_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_player_guardian_invites_owner_player_fkey foreign key (owner_account_id, player_id)
    references public.owner_players(owner_account_id, player_id)
    on delete cascade,
  constraint owner_player_guardian_invites_email_lowercase_check check (email = lower(email)),
  constraint owner_player_guardian_invites_full_name_not_blank_check check (btrim(full_name) <> ''),
  constraint owner_player_guardian_invites_relation_check check (relation in ('parent', 'guardian', 'other')),
  constraint owner_player_guardian_invites_status_check check (
    status in ('pending', 'accepted', 'cancelled', 'expired', 'revoked')
  )
);

create index if not exists owner_player_guardian_invites_owner_player_idx
  on public.owner_player_guardian_invites (owner_account_id, player_id, created_at desc);

create index if not exists owner_player_guardian_invites_contact_idx
  on public.owner_player_guardian_invites (guardian_contact_id, created_at desc);

create index if not exists owner_player_guardian_invites_guardian_user_idx
  on public.owner_player_guardian_invites (guardian_user_id, created_at desc);

create unique index if not exists owner_player_guardian_invites_pending_email_unique
  on public.owner_player_guardian_invites (owner_account_id, player_id, email)
  where status = 'pending';

drop trigger if exists update_owner_player_guardian_invites_updated_at on public.owner_player_guardian_invites;
create trigger update_owner_player_guardian_invites_updated_at
before update on public.owner_player_guardian_invites
for each row
execute function public.trigger_update_timestamp();

alter table public.owner_player_guardian_invites enable row level security;

drop policy if exists "Owner coaches can read guardian invites" on public.owner_player_guardian_invites;
create policy "Owner coaches can read guardian invites"
  on public.owner_player_guardian_invites
  for select
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

drop policy if exists "Guardians can read their accepted guardian invites" on public.owner_player_guardian_invites;
create policy "Guardians can read their accepted guardian invites"
  on public.owner_player_guardian_invites
  for select
  to authenticated
  using (
    guardian_user_id = (select auth.uid())
    or accepted_by = (select auth.uid())
  );

drop policy if exists "Owner coaches can write guardian invites" on public.owner_player_guardian_invites;
create policy "Owner coaches can write guardian invites"
  on public.owner_player_guardian_invites
  for all
  to authenticated
  using (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())))
  with check (public.has_owner_account_coach_access(owner_account_id, (select auth.uid())));

revoke all on public.owner_player_guardian_invites from anon;
grant select, insert, update, delete on public.owner_player_guardian_invites to authenticated;
grant all on public.owner_player_guardian_invites to service_role;

comment on table public.owner_player_guardian_invites is
  'Secure owner-scoped guardian invite lifecycle for player CRM. Guardian access becomes active only after token acceptance creates owner_player_guardians.';
