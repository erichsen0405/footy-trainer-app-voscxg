import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260707100000_create_coach_workspace_foundation.sql'
);

const docsPath = path.join(process.cwd(), 'docs/coach-account-workspace-model.md');

describe('coach workspace foundation migration', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const docs = fs.readFileSync(docsPath, 'utf8');

  it('creates the coach account and membership foundation tables', () => {
    expect(migration).toContain('create table if not exists public.coach_accounts');
    expect(migration).toContain('create table if not exists public.coach_memberships');
    expect(migration).toContain('coach_account_id uuid not null references public.coach_accounts(id)');
    expect(migration).toContain("constraint coach_memberships_role_check check (role in ('owner', 'admin', 'coach', 'assistant'))");
  });

  it('enables RLS with member/admin policies', () => {
    expect(migration).toContain('alter table public.coach_accounts enable row level security');
    expect(migration).toContain('alter table public.coach_memberships enable row level security');
    expect(migration).toContain('Coach account members can view accounts');
    expect(migration).toContain('Coach account admins can create memberships');
    expect(migration).toContain('Coach account admins can update memberships');
  });

  it('exposes workspace helper functions for later API work', () => {
    expect(migration).toContain('public.is_coach_account_member');
    expect(migration).toContain('public.is_coach_account_admin');
    expect(migration).toContain('public.has_coach_account_coach_access');
    expect(migration).toContain('public.ensure_default_coach_account');
    expect(migration).toContain('public.get_default_coach_account_id');
  });

  it('keeps existing player activity flows untouched in the foundation issue', () => {
    expect(migration).not.toContain('alter table public.activities add column coach_account_id');
    expect(migration).not.toContain('alter table public.activity_tasks add column coach_account_id');
    expect(migration).not.toContain('alter table public.admin_player_relationships add column coach_account_id');
  });

  it('documents the club separation and migration path', () => {
    expect(docs).toContain('The existing `clubs`, `club_members` and `club_licenses` module is an');
    expect(docs).toContain('The `coach_accounts.source` field reserves a `club_bridge` value');
    expect(docs).toContain('Create one default `coach_accounts` row for each existing trainer/admin user');
  });
});
