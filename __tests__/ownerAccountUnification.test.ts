import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260707130000_owner_account_unification.sql'
);

const architecturePath = path.join(process.cwd(), 'docs/owner-account-architecture.md');
const workspaceModelPath = path.join(process.cwd(), 'docs/coach-account-workspace-model.md');
const rlsContractPath = path.join(process.cwd(), 'docs/coach-account-rls-contract.md');

describe('owner account unification contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const architecture = fs.readFileSync(architecturePath, 'utf8');
  const workspaceModel = fs.readFileSync(workspaceModelPath, 'utf8');
  const rlsContract = fs.readFileSync(rlsContractPath, 'utf8');

  it('creates a unified owner account model for clubs and private coach businesses', () => {
    expect(migration).toContain('create table if not exists public.owner_accounts');
    expect(migration).toContain("owner_type in ('club', 'private_coach_business')");
    expect(migration).toContain('coach_account_id uuid null unique references public.coach_accounts(id)');
    expect(migration).toContain('club_id uuid null unique references public.clubs(id)');
    expect(architecture).toContain('An owner account can represent either:');
    expect(architecture).toContain('a private coach business');
  });

  it('supports multiple active roles for the same user in the same owner account', () => {
    expect(migration).toContain('create table if not exists public.owner_memberships');
    expect(migration).toContain('create table if not exists public.owner_membership_roles');
    expect(migration).toContain("role in ('owner', 'admin', 'coach', 'assistant_coach', 'player')");
    expect(migration).toContain('unique (owner_account_id, user_id, role)');
    expect(migration).toContain('get_owner_account_roles');
    expect(migration).toContain('has_owner_account_role');
    expect(architecture).toContain('owner`, `admin` and `coach`');
  });

  it('backfills and syncs both legacy coach and club sources', () => {
    expect(migration).toContain('public.ensure_owner_account_for_coach_account');
    expect(migration).toContain('public.ensure_owner_account_for_club');
    expect(migration).toContain('from public.coach_accounts ca');
    expect(migration).toContain('from public.clubs c');
    expect(migration).toContain('from public.coach_memberships cm');
    expect(migration).toContain('from public.club_members cm');
    expect(migration).toContain('sync_owner_account_from_coach_account');
    expect(migration).toContain('sync_owner_account_from_club');
    expect(migration).toContain('sync_owner_role_from_coach_membership');
    expect(migration).toContain('sync_owner_role_from_club_member');
  });

  it('creates the unified owner player and guardian relations', () => {
    expect(migration).toContain('create table if not exists public.owner_players');
    expect(migration).toContain('create table if not exists public.owner_player_guardians');
    expect(migration).toContain("source in ('coach_player', 'club_member', 'team_member', 'manual', 'migration')");
    expect(migration).toContain("relation in ('parent', 'guardian')");
    expect(migration).toContain('public.can_owner_account_access_player');
    expect(migration).toContain('public.can_owner_guardian_read_player');
    expect(migration).toContain('public.can_guardian_read_player_scoped_data');
  });

  it('keeps new owner tables behind RLS and exposes an audit RPC', () => {
    expect(migration).toContain('alter table public.owner_accounts enable row level security');
    expect(migration).toContain('alter table public.owner_membership_roles enable row level security');
    expect(migration).toContain('alter table public.owner_players enable row level security');
    expect(migration).toContain('revoke all on public.owner_accounts from anon');
    expect(migration).toContain('public.get_owner_account_unification_audit');
    expect(migration).toContain('coach_accounts_without_owner_account');
    expect(migration).toContain('active_club_members_without_owner_role');
    expect(migration).toContain('grant execute on function public.get_owner_account_unification_audit() to service_role');
  });

  it('documents the new top-level scope and downstream dependency shift', () => {
    expect(workspaceModel).toContain('Issue #313 supersedes the two-track product direction');
    expect(workspaceModel).toMatch(/new B2B\s+platform features should scope data by `owner_account_id`/);
    expect(rlsContract).toMatch(/After #313,\s+new platform tables should use `owner_account_id`/);
    expect(rlsContract).toMatch(/A user\s+can have multiple active roles in the same owner account/);
    expect(architecture).toContain('Base44 is not required for #313');
    expect(architecture).toContain('must not be deployed with `eas update`');
  });
});
