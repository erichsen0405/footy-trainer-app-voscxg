import fs from 'fs';
import path from 'path';
import { parseOwnerPlayerCrmBody } from '../supabase/functions/_shared/ownerPlayerCrm';

const ownerAccountId = '22222222-2222-4222-8222-222222222222';
const playerId = '33333333-3333-4333-8333-333333333333';
const tagId = '44444444-4444-4444-8444-444444444444';

const migrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260708143000_owner_player_crm.sql'
);
const tagFkHardeningMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260708144500_owner_player_crm_tag_fk_hardening.sql'
);
const guardianInviteMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260708152000_owner_player_guardian_invites.sql'
);
const base44PromptPath = path.join(process.cwd(), 'docs/base44-owner-player-crm-prompt.md');
const mobileCrmPath = path.join(process.cwd(), 'app/(tabs)/player-crm.tsx');
const tabLayoutPath = path.join(process.cwd(), 'app/(tabs)/_layout.tsx');
const profilePath = path.join(process.cwd(), 'app/(tabs)/profile.tsx');
const createPlayerPath = path.join(process.cwd(), 'supabase/functions/create-player/index.ts');
const authCallbackPath = path.join(process.cwd(), 'app/auth/callback.tsx');
const acceptGuardianInvitePath = path.join(
  process.cwd(),
  'supabase/functions/acceptOwnerPlayerGuardianInvite/index.ts'
);

describe('owner player CRM contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const tagFkHardeningMigration = fs.readFileSync(tagFkHardeningMigrationPath, 'utf8');
  const guardianInviteMigration = fs.readFileSync(guardianInviteMigrationPath, 'utf8');
  const base44Prompt = fs.readFileSync(base44PromptPath, 'utf8');
  const mobileCrm = fs.readFileSync(mobileCrmPath, 'utf8');
  const tabLayout = fs.readFileSync(tabLayoutPath, 'utf8');
  const profile = fs.readFileSync(profilePath, 'utf8');
  const createPlayer = fs.readFileSync(createPlayerPath, 'utf8');
  const authCallback = fs.readFileSync(authCallbackPath, 'utf8');
  const acceptGuardianInvite = fs.readFileSync(acceptGuardianInvitePath, 'utf8');

  it('creates owner-scoped CRM tables without granting player or guardian note access', () => {
    expect(migration).toContain('create table if not exists public.owner_player_crm_profiles');
    expect(migration).toContain('create table if not exists public.owner_player_tags');
    expect(migration).toContain('create table if not exists public.owner_player_tag_links');
    expect(migration).toContain('create table if not exists public.owner_player_notes');
    expect(migration).toContain('create table if not exists public.owner_player_guardian_contacts');
    expect(migration).toContain('foreign key (owner_account_id, player_id)');
    expect(migration).toContain('references public.owner_players(owner_account_id, player_id)');
    expect(migration).toContain("visibility text not null default 'coach_private'");
    expect(migration).toContain('Players and guardians must not be granted access to this table');
    expect(migration).not.toContain('can_guardian_read_player_scoped_data(owner_account_id, player_id)');
  });

  it('keeps CRM RLS behind owner coach access and service-backed writes', () => {
    expect(migration).toContain('alter table public.owner_player_crm_profiles enable row level security');
    expect(migration).toContain('alter table public.owner_player_notes enable row level security');
    expect(migration).toContain('alter table public.owner_player_guardian_contacts enable row level security');
    expect(migration).toContain('public.has_owner_account_coach_access(owner_account_id, (select auth.uid()))');
    expect(migration).toContain('revoke all on public.owner_player_notes from anon');
    expect(migration).toContain('grant all on public.owner_player_notes to service_role');
  });

  it('prevents CRM tag links from crossing owner accounts', () => {
    expect(tagFkHardeningMigration).toContain('owner_player_tags_owner_id_unique');
    expect(tagFkHardeningMigration).toContain('owner_player_tag_links_owner_tag_fkey');
    expect(tagFkHardeningMigration).toContain('foreign key (owner_account_id, tag_id)');
    expect(tagFkHardeningMigration).toContain('references public.owner_player_tags(owner_account_id, id)');
  });

  it('creates secure owner-scoped guardian invite lifecycle storage', () => {
    expect(guardianInviteMigration).toContain('create table if not exists public.owner_player_guardian_invites');
    expect(guardianInviteMigration).toContain('token_hash text not null unique');
    expect(guardianInviteMigration).toContain("status in ('pending', 'accepted', 'cancelled', 'expired', 'revoked')");
    expect(guardianInviteMigration).toContain('owner_player_guardian_invites_pending_email_unique');
    expect(guardianInviteMigration).toContain('references public.owner_players(owner_account_id, player_id)');
    expect(guardianInviteMigration).toContain('alter table public.owner_player_guardian_invites enable row level security');
    expect(guardianInviteMigration).toContain('public.has_owner_account_coach_access(owner_account_id, (select auth.uid()))');
    expect(guardianInviteMigration).toContain('revoke all on public.owner_player_guardian_invites from anon');
  });

  it('parses CRM profile, tag and guardian action payloads', () => {
    expect(
      parseOwnerPlayerCrmBody({
        action: 'updateProfile',
        ownerAccountId,
        playerId,
        profile: {
          crmStatus: 'trial',
          positions: [' Striker ', 'Striker', 'Winger'],
          playingLevel: ' U15 elite ',
          clubName: ' FC Test ',
          dateOfBirth: '2011-04-12',
          phoneNumber: ' +45 12345678 ',
          email: ' PLAYER@EXAMPLE.COM ',
          emailVisibleToStaff: false,
          phoneVisibleToStaff: true,
        },
      })
    ).toEqual({
      action: 'updateProfile',
      ownerAccountId,
      playerId,
      profile: {
        crm_status: 'trial',
        positions: ['Striker', 'Winger'],
        playing_level: 'U15 elite',
        club_name: 'FC Test',
        date_of_birth: '2011-04-12',
        phone_number: '+45 12345678',
        email: 'player@example.com',
        email_visible_to_staff: false,
        phone_visible_to_staff: true,
      },
    });

    expect(
      parseOwnerPlayerCrmBody({
        action: 'setPlayerTags',
        ownerAccountId,
        playerId,
        tagIds: [tagId, tagId],
      })
    ).toEqual({
      action: 'setPlayerTags',
      ownerAccountId,
      playerId,
      tagIds: [tagId],
    });

    expect(
      parseOwnerPlayerCrmBody({
        action: 'createGuardianContact',
        ownerAccountId,
        playerId,
        fullName: ' Parent Name ',
        email: 'PARENT@EXAMPLE.COM',
        relation: 'parent',
      })
    ).toEqual({
      action: 'createGuardianContact',
      ownerAccountId,
      playerId,
      contactId: null,
      guardianUserId: null,
      fullName: 'Parent Name',
      email: 'parent@example.com',
      phoneNumber: null,
      relation: 'parent',
      status: 'active',
      notes: null,
    });

    expect(
      parseOwnerPlayerCrmBody({
        action: 'inviteGuardianContact',
        ownerAccountId,
        playerId,
        contactId: tagId,
      })
    ).toEqual({
      action: 'inviteGuardianContact',
      ownerAccountId,
      playerId,
      contactId: tagId,
    });

    expect(
      parseOwnerPlayerCrmBody({
        action: 'resendGuardianInvite',
        ownerAccountId,
        playerId,
        inviteId: tagId,
      })
    ).toEqual({
      action: 'resendGuardianInvite',
      ownerAccountId,
      playerId,
      inviteId: tagId,
    });
  });

  it('documents Base44 reuse, owner scope and web/mobile parity', () => {
    expect(base44Prompt).toContain('Base44/KlubAdmin');
    expect(base44Prompt).toContain('Byg ikke en ny portal');
    expect(base44Prompt).toContain('owner_account_id');
    expect(base44Prompt).toContain('Mobil og web skal have funktionsparitet');
    expect(base44Prompt).toContain('manageOwnerPlayerCrm');
    expect(base44Prompt).toContain('acceptOwnerPlayerGuardianInvite');
    expect(base44Prompt).toContain('guardianInviteToken`, ikke');
    expect(base44Prompt).toContain('GUARDIAN_INVITE_AUTH_REDIRECT_URL=https://footballcoach.online/AuthCallback');
    expect(base44Prompt).toContain('Parent/guardian adgang er ubegrænset');
    expect(base44Prompt).toContain('inviteGuardianContact');
    expect(base44Prompt).toContain('revokeGuardianAccess');
    expect(base44Prompt).toContain('create-player');
    expect(base44Prompt).toContain('ownerAccountId');
    expect(base44Prompt).toContain('SEAT_LIMIT_REACHED');
  });

  it('moves mobile player/team management into the dedicated CRM tab', () => {
    expect(tabLayout).toContain("name: 'player-crm'");
    expect(tabLayout).toContain("label: 'Spillere'");
    expect(tabLayout).toContain('<Stack.Screen name="player-crm" />');
    expect(mobileCrm).toContain('TeamManagement');
    expect(mobileCrm).toContain('CreatePlayerModal');
    expect(mobileCrm).toContain('ownerAccountId={activeOwnerAccountId}');
    expect(mobileCrm).toContain('inviteOwnerPlayerGuardianContact');
    expect(mobileCrm).toContain('resendOwnerPlayerGuardianInvite');
    expect(mobileCrm).toContain('revokeOwnerPlayerGuardianAccess');
    expect(mobileCrm.indexOf('<FilterChips')).toBeGreaterThan(mobileCrm.indexOf('styles.sectionHeader'));
    expect(profile).toContain("router.push('/(tabs)/player-crm'");
    expect(profile).toContain('profile.openPlayerCrmButton');
    expect(profile).not.toContain('<PlayersList');
    expect(profile).not.toContain('<TeamManagement');
  });

  it('seat-checks player add requests when they come from owner CRM', () => {
    expect(createPlayer).toContain('ownerAccountId');
    expect(createPlayer).toContain('assert_owner_seat_available');
    expect(createPlayer).toContain("p_role: 'player'");
    expect(createPlayer).toContain('SEAT_LIMIT_REACHED');
    expect(createPlayer).toContain('LICENSE_INACTIVE');
  });

  it('accepts guardian invites through the mobile auth callback', () => {
    expect(acceptGuardianInvite).toContain('acceptOwnerPlayerGuardianInviteAction');
    expect(acceptGuardianInvite).toContain('requireAuthContext');
    expect(authCallback).toContain('guardianInviteToken');
    expect(authCallback).toContain('INVITE_TOKEN_PARAM_KEYS');
    expect(authCallback).toContain('hasAnyCallbackParam');
    expect(authCallback).toContain('shouldRetryCallbackParams');
    expect(authCallback).toContain("otpType === 'magiclink'");
    expect(authCallback).toContain('acceptOwnerPlayerGuardianInvite');
    expect(authCallback).toContain('acceptInvitesIfPresent');
  });
});
