import fs from 'fs';
import path from 'path';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260707133000_owner_subscription_seats.sql'
);
const modelDocPath = path.join(process.cwd(), 'docs/owner-subscription-seat-model.md');
const base44PromptPath = path.join(process.cwd(), 'docs/base44-owner-subscription-seat-prompt.md');
const architecturePath = path.join(process.cwd(), 'docs/owner-account-architecture.md');
const entitlementsSyncPath = path.join(process.cwd(), 'services/entitlementsSync.ts');

describe('owner subscription and seat model contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const modelDoc = fs.readFileSync(modelDocPath, 'utf8');
  const base44Prompt = fs.readFileSync(base44PromptPath, 'utf8');
  const architecture = fs.readFileSync(architecturePath, 'utf8');
  const entitlementsSync = fs.readFileSync(entitlementsSyncPath, 'utf8');

  it('creates owner-aware plan, subscription, seat adjustment and audit tables', () => {
    expect(migration).toContain('create table if not exists public.owner_subscription_plans');
    expect(migration).toContain('create table if not exists public.owner_subscriptions');
    expect(migration).toContain('create table if not exists public.owner_seat_adjustments');
    expect(migration).toContain('create table if not exists public.owner_subscription_audit_events');
    expect(migration).toContain("source in ('apple_iap', 'super_admin', 'manual', 'migration')");
    expect(migration).toContain("adjustment_type in ('override', 'add_on')");
  });

  it('defines private coach Apple tiers with seats and premium feature flags', () => {
    expect(migration).toContain("'trainer_basic'");
    expect(migration).toContain("'fc_trainer_basic_monthly'");
    expect(migration).toContain('"player": 5');
    expect(migration).toContain("'trainer_standard'");
    expect(migration).toContain('"player": 15');
    expect(migration).toContain('"video_feedback": true');
    expect(migration).toContain("'trainer_premium'");
    expect(migration).toContain('"player": 50');
    expect(migration).toContain('"booking": true');
  });

  it('computes one effective seat truth from plan baseline and super admin provisioning', () => {
    expect(migration).toContain('public.get_owner_effective_seats');
    expect(migration).toContain('super_admin_override');
    expect(migration).toContain('plan_baseline_plus_add_on');
    expect(migration).toContain('seats_available');
    expect(modelDoc).toContain('effective seats per role = super admin override ?? plan baseline');
    expect(modelDoc).toContain('effective seats per role += active super admin add-ons');
  });

  it('connects active Apple trainer entitlements to private coach owner access', () => {
    expect(migration).toContain('public.sync_private_coach_owner_subscription');
    expect(migration).toContain("'private_coach_business'");
    expect(migration).toContain("'apple_subscription'");
    expect(migration).toContain("'owner'");
    expect(migration).toContain("'admin'");
    expect(migration).toContain("'coach'");
    expect(entitlementsSync).toContain('sync_private_coach_owner_subscription');
    expect(modelDoc).toMatch(/without a\s+club invite/);
  });

  it('exposes seat status and validation RPCs for web/mobile gating', () => {
    expect(migration).toContain('public.get_owner_seat_status');
    expect(migration).toContain('public.get_current_owner_seat_status');
    expect(migration).toContain('public.assert_owner_seat_available');
    expect(migration).toContain('SEAT_LIMIT_REACHED');
    expect(modelDoc).toContain('assertOwnerSeatAvailable');
  });

  it('keeps Base44 on the existing owner-aware webapp path', () => {
    expect(base44Prompt).toContain('Byg ikke');
    expect(base44Prompt).toContain('KlubAdmin');
    expect(base44Prompt).toContain('owner_account_id');
    expect(base44Prompt).toContain('Supabase Er Source Of Truth');
    expect(base44Prompt).toContain('sync_private_coach_owner_subscription');
    expect(architecture).toContain('#281 moves subscription and seat logic onto owner accounts');
  });
});
