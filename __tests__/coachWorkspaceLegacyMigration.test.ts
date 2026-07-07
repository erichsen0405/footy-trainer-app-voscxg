import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260707120000_migrate_legacy_coach_workspace_relations.sql'
);
const clubContextMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260707123000_preserve_coach_player_club_context.sql'
);

const migrationPlanPath = path.join(process.cwd(), 'docs/coach-workspace-migration-plan.md');
const workspaceModelPath = path.join(process.cwd(), 'docs/coach-account-workspace-model.md');
const rlsContractPath = path.join(process.cwd(), 'docs/coach-account-rls-contract.md');

describe('coach workspace legacy migration contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const clubContextMigration = fs.readFileSync(clubContextMigrationPath, 'utf8');
  const migrationPlan = fs.readFileSync(migrationPlanPath, 'utf8');
  const workspaceModel = fs.readFileSync(workspaceModelPath, 'utf8');
  const rlsContract = fs.readFileSync(rlsContractPath, 'utf8');

  it('creates the coach_players compatibility roster', () => {
    expect(migration).toContain('create table if not exists public.coach_players');
    expect(migration).toContain('coach_account_id uuid not null references public.coach_accounts(id)');
    expect(migration).toContain('player_id uuid not null references auth.users(id)');
    expect(migration).toContain('constraint coach_players_account_player_key unique (coach_account_id, player_id)');
    expect(migration).toContain("constraint coach_players_status_check check (status in ('active', 'pending', 'inactive', 'removed'))");
  });

  it('adds workspace pointers only to compatibility tables', () => {
    expect(migration).toContain('alter table public.teams');
    expect(migration).toContain('alter table public.player_invitations');
    expect(migration).toContain('alter table public.admin_player_link_requests');
    expect(migration).toContain('add column if not exists coach_account_id uuid references public.coach_accounts(id)');
    expect(migration).not.toContain('alter table public.activities add column');
    expect(migration).not.toContain('alter table public.activity_tasks add column');
    expect(migration).not.toContain('alter table public.training_reflections add column');
    expect(migration).not.toContain('alter table public.trainer_activity_feedback add column');
  });

  it('backfills coach accounts from trainer, team, invitation, request and club staff sources', () => {
    expect(migration).toContain('from public.admin_player_relationships apr');
    expect(migration).toContain('from public.player_invitations pi');
    expect(migration).toContain('from public.admin_player_link_requests aplr');
    expect(migration).toContain('from public.teams t');
    expect(migration).toContain('from public.club_members cm');
    expect(migration).toContain("cm.role in ('owner', 'admin', 'coach')");
    expect(migration).toContain('public.ensure_migration_coach_account_for_user(sc.user_id)');
  });

  it('syncs accepted and team-based player links into coach_players', () => {
    expect(migration).toContain("'admin_player_relationship'");
    expect(migration).toContain("'player_invitation'");
    expect(migration).toContain("'link_request'");
    expect(migration).toContain("'team_member'");
    expect(migration).toContain('sync_admin_player_relationship_to_coach_player');
    expect(migration).toContain('sync_player_invitation_to_coach_player');
    expect(migration).toContain('sync_link_request_to_coach_player');
    expect(migration).toContain('sync_team_member_to_coach_player');
  });

  it('preserves club context for team-derived coach player links', () => {
    expect(clubContextMigration).toContain('update public.coach_players cp');
    expect(clubContextMigration).toContain('join public.teams t');
    expect(clubContextMigration).toContain('set club_id = t.club_id');
    expect(clubContextMigration).toContain('select t.coach_account_id, t.admin_id, t.club_id');
    expect(clubContextMigration).toContain('v_club_id');
    expect(clubContextMigration).toContain('Optional club context preserved');
  });

  it('keeps coach_players behind RLS and updates the #278 access bridge', () => {
    expect(migration).toContain('alter table public.coach_players enable row level security');
    expect(migration).toContain('revoke all on public.coach_players from anon');
    expect(migration).toContain('public.is_coach_account_member(coach_account_id, (select auth.uid()))');
    expect(migration).toContain('public.has_coach_account_coach_access(coach_account_id, (select auth.uid()))');
    expect(migration).toContain('create or replace function public.can_coach_account_access_legacy_player');
    expect(migration).toContain('from public.coach_players cp');
  });

  it('exposes compatibility and audit RPCs', () => {
    expect(migration).toContain('public.get_coach_workspace_legacy_relationships');
    expect(migration).toContain('perform public.assert_current_coach_account_coach_access(p_coach_account_id)');
    expect(migration).toContain('public.get_coach_workspace_migration_audit');
    expect(migration).toContain('teams_missing_coach_account');
    expect(migration).toContain('team_members_without_coach_player');
    expect(migration).toContain('grant execute on function public.get_coach_workspace_migration_audit() to service_role');
  });

  it('documents Base44, EAS update, QA and rollback expectations', () => {
    expect(migrationPlan).toContain('Base44 is not required for #279');
    expect(migrationPlan).toContain('must not be deployed with `eas update`');
    expect(migrationPlan).toContain('Team-derived roster links preserve `teams.club_id`');
    expect(migrationPlan).toContain('Run `get_coach_workspace_migration_audit()` with service role after deployment');
    expect(migrationPlan).toContain('## Rollback Plan');
    expect(migrationPlan).toContain('Do not delete or rewrite legacy player history tables during rollback');
  });

  it('updates existing docs now that #279 owns coach_players foundation', () => {
    expect(workspaceModel).toContain('introduce the compatibility `coach_players` roster');
    expect(workspaceModel).toContain('#281, #280 and #283 should build on `owner_account_id`');
    expect(rlsContract).toContain('When #279 introduces `coach_players`');
    expect(rlsContract).toContain('After #313, new product tables should use');
  });
});
