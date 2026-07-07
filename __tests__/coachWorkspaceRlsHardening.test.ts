import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260707110000_coach_workspace_rls_hardening.sql'
);

const docsPath = path.join(process.cwd(), 'docs/coach-account-rls-contract.md');

describe('coach workspace RLS hardening contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const docs = fs.readFileSync(docsPath, 'utf8');

  it('keeps new B2B coach tables behind authenticated workspace policies', () => {
    expect(migration).toContain('alter table public.coach_accounts enable row level security');
    expect(migration).toContain('alter table public.coach_memberships enable row level security');
    expect(migration).toContain('revoke all on public.coach_accounts from anon');
    expect(migration).toContain('revoke all on public.coach_memberships from anon');
    expect(migration).toContain("source = 'personal_coach'");
    expect(migration).toContain("status = 'active'");
  });

  it('adds current-user RPC helpers that derive the actor from auth.uid()', () => {
    expect(migration).toContain('public.get_current_coach_account_role');
    expect(migration).toContain('public.assert_current_coach_account_member');
    expect(migration).toContain('public.assert_current_coach_account_admin');
    expect(migration).toContain('public.assert_current_coach_account_coach_access');
    expect(migration).toContain('public.can_current_user_read_player_scoped_data');
    expect(migration).toContain('public.can_current_user_write_coach_scoped_player_data');
    expect(migration).toContain('(select auth.uid())');
  });

  it('keeps actor-id helpers service-role only for Edge Functions', () => {
    expect(migration).toContain('grant execute on function public.assert_actor_coach_account_member(uuid, uuid) to service_role');
    expect(migration).toContain('grant execute on function public.can_actor_read_player_scoped_data(uuid, uuid, uuid) to service_role');
    expect(migration).toContain('grant execute on function public.can_actor_write_coach_scoped_player_data(uuid, uuid, uuid) to service_role');
    expect(migration).not.toContain('grant execute on function public.can_actor_read_player_scoped_data(uuid, uuid, uuid) to authenticated');
    expect(migration).not.toContain('grant execute on function public.can_actor_write_coach_scoped_player_data(uuid, uuid, uuid) to authenticated');
  });

  it('bridges legacy trainer/player links without rewriting old RLS policies', () => {
    expect(migration).toContain('public.can_coach_account_access_legacy_player');
    expect(migration).toContain('from public.admin_player_relationships apr');
    expect(migration).toContain('join public.coach_memberships cm');
    expect(migration).not.toMatch(
      /drop policy .* on public\.(profiles|admin_player_relationships|teams|team_members|activities|activity_tasks|task_templates|exercise_library|exercise_assignments|training_reflections|trainer_activity_feedback|clubs|club_members|club_licenses)/
    );
  });

  it('denies parent access until explicit guardian links exist', () => {
    expect(migration).toContain('public.can_guardian_read_player_scoped_data');
    expect(migration).toContain('select false');
    expect(docs).toContain('Parent/guardian access must never be inferred from email');
    expect(docs).toMatch(/until a dedicated relation table\s+links the guardian user to the child player/);
  });

  it('documents the two-coach/two-player policy matrix and Base44 status', () => {
    expect(docs).toContain('This issue does not add a web UI. Base44 is not required for #278.');
    expect(docs).toContain('Use at least two coaches and two players when testing policy behavior');
    expect(docs).toContain('Coach A reads Coach B-only player data');
    expect(docs).toContain('Player A reads Player B assignments/goals/reports/feedback');
    expect(docs).toContain('Regression checks should include the existing trainer assignment flows');
  });
});
