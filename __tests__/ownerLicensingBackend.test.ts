import {
  assertOwnerSeatAvailableAction,
  createOwnerAccountAction,
  deleteOwnerAccountAction,
  getOwnerSeatStatusAction,
  listPlatformAdminOwnerAccountsAction,
  normalizeOwnerSeatLine,
  parseAssertOwnerSeatBody,
  parseCreateOwnerAccountBody,
  parseDeleteOwnerAccountBody,
  parseOwnerSeatStatusBody,
  parseUpsertOwnerSeatAdjustmentBody,
  upsertOwnerSeatAdjustmentAction,
} from '../supabase/functions/_shared/ownerLicensing';
import fs from 'fs';
import path from 'path';

const actorUserId = '11111111-1111-4111-8111-111111111111';
const ownerAccountId = '22222222-2222-4222-8222-222222222222';
const ownerUserId = '33333333-3333-4333-8333-333333333333';
const adjustmentId = '44444444-4444-4444-8444-444444444444';
const deleteVisibilityMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260710150000_platform_admin_owner_account_delete_visibility.sql'
);
const deleteNoReprovisionMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260711110000_delete_owner_account_prevent_legacy_reprovision.sql'
);
const restrictedProvisioningMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260711113000_restrict_owner_workspace_auto_creation.sql'
);
const provisioningGuardDefaultMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260711120500_fix_owner_workspace_provision_guard_default.sql'
);
const ownerSeatBase44PromptPath = path.join(process.cwd(), 'docs/base44-owner-seat-endpoints-deployed-prompt.md');
const ownerDeleteBase44PromptPath = path.join(process.cwd(), 'docs/base44-delete-owner-account-fix-prompt.md');

function createRpcClient(result: { data: unknown; error: { message?: string } | null }) {
  return {
    rpc: jest.fn().mockResolvedValue(result),
  };
}

const ownerSeatStatusPayload = {
  ownerAccountId,
  ownerType: 'private_coach_business',
  ownerStatus: 'active',
  planCode: 'trainer_standard',
  planName: 'Coach Standard',
  subscriptionStatus: 'active',
  validUntil: null,
  featureFlags: {
    reports: true,
    programs: true,
    video_feedback: true,
    booking: false,
  },
  seats: [
    {
      role: 'player',
      planSeats: 15,
      overrideSeats: null,
      addOnSeats: 5,
      effectiveSeats: 20,
      seatsUsed: 12,
      seatsAvailable: 8,
      source: 'plan_baseline_plus_add_on',
      planCode: 'trainer_standard',
    },
  ],
  playerSeats: {
    role: 'player',
    planSeats: 15,
    overrideSeats: null,
    addOnSeats: 5,
    effectiveSeats: 20,
    seatsUsed: 12,
    seatsAvailable: 8,
    source: 'plan_baseline_plus_add_on',
    planCode: 'trainer_standard',
  },
  canAddPlayers: true,
};

describe('owner licensing backend helpers', () => {
  const deleteVisibilityMigration = fs.readFileSync(deleteVisibilityMigrationPath, 'utf8');
  const deleteNoReprovisionMigration = fs.readFileSync(deleteNoReprovisionMigrationPath, 'utf8');
  const restrictedProvisioningMigration = fs.readFileSync(restrictedProvisioningMigrationPath, 'utf8');
  const provisioningGuardDefaultMigration = fs.readFileSync(provisioningGuardDefaultMigrationPath, 'utf8');
  const ownerSeatBase44Prompt = fs.readFileSync(ownerSeatBase44PromptPath, 'utf8');
  const ownerDeleteBase44Prompt = fs.readFileSync(ownerDeleteBase44PromptPath, 'utf8');

  it('normalizes owner seat status input', () => {
    expect(parseOwnerSeatStatusBody({ ownerAccountId })).toEqual({ ownerAccountId });
  });

  it('normalizes owner account delete input', () => {
    expect(parseDeleteOwnerAccountBody({ ownerAccountId })).toEqual({ ownerAccountId });
  });

  it('normalizes assistant role aliases for seat assertions', () => {
    expect(parseAssertOwnerSeatBody({ ownerAccountId, role: 'assistant' })).toEqual({
      ownerAccountId,
      role: 'assistant_coach',
    });
  });

  it('normalizes platform owner creation payloads', () => {
    expect(
      parseCreateOwnerAccountBody({
        ownerType: 'private_coach_business',
        ownerName: '  ME Training ',
        ownerUserId,
        planCode: ' trainer_standard ',
        seatOverrides: {
          owner: 1,
          admin: 1,
          assistant: 2,
          player: 20,
        },
      })
    ).toEqual({
      ownerType: 'private_coach_business',
      ownerName: 'ME Training',
      ownerUserId,
      planCode: 'trainer_standard',
      seatOverrides: {
        owner: 1,
        admin: 1,
        assistant_coach: 2,
        player: 20,
      },
    });
  });

  it('normalizes platform seat adjustment payloads', () => {
    expect(
      parseUpsertOwnerSeatAdjustmentBody({
        ownerAccountId,
        role: 'assistant',
        adjustmentType: 'add_on',
        seats: 3,
        reason: '  Manual add-on ',
        validUntil: '2026-12-31T23:59:59.000Z',
      })
    ).toEqual({
      ownerAccountId,
      role: 'assistant_coach',
      adjustmentType: 'add_on',
      seats: 3,
      reason: 'Manual add-on',
      validUntil: '2026-12-31T23:59:59.000Z',
    });
  });

  it('returns normalized owner seat status payloads', async () => {
    const client = createRpcClient({
      data: ownerSeatStatusPayload,
      error: null,
    });

    await expect(getOwnerSeatStatusAction(client, actorUserId, { ownerAccountId })).resolves.toEqual({
      ownerAccountId,
      ownerType: 'private_coach_business',
      ownerStatus: 'active',
      planCode: 'trainer_standard',
      planName: 'Coach Standard',
      subscriptionStatus: 'active',
      validUntil: null,
      featureFlags: {
        reports: true,
        programs: true,
        video_feedback: true,
        booking: false,
      },
      seats: [
        {
          role: 'player',
          isUnlimited: false,
          planSeats: 15,
          overrideSeats: null,
          addOnSeats: 5,
          effectiveSeats: 20,
          seatsUsed: 12,
          seatsAvailable: 8,
          source: 'plan_baseline_plus_add_on',
          planCode: 'trainer_standard',
        },
      ],
      playerSeats: {
        role: 'player',
        isUnlimited: false,
        planSeats: 15,
        overrideSeats: null,
        addOnSeats: 5,
        effectiveSeats: 20,
        seatsUsed: 12,
        seatsAvailable: 8,
        source: 'plan_baseline_plus_add_on',
        planCode: 'trainer_standard',
      },
      canAddPlayers: true,
    });
  });

  it('normalizes unlimited count-only seat rows', () => {
    expect(
      normalizeOwnerSeatLine({
        role: 'parent',
        isUnlimited: true,
        planSeats: null,
        overrideSeats: null,
        addOnSeats: null,
        effectiveSeats: null,
        seatsUsed: 18,
        seatsAvailable: null,
        source: 'unlimited',
        planCode: 'trainer_basic',
      })
    ).toEqual({
      role: 'parent',
      isUnlimited: true,
      planSeats: null,
      overrideSeats: null,
      addOnSeats: null,
      effectiveSeats: null,
      seatsUsed: 18,
      seatsAvailable: null,
      source: 'unlimited',
      planCode: 'trainer_basic',
    });
  });

  it('maps owner seat-limit failures to stable app errors', async () => {
    const client = createRpcClient({
      data: null,
      error: { message: 'SEAT_LIMIT_REACHED' },
    });

    await expect(
      assertOwnerSeatAvailableAction(client, actorUserId, {
        ownerAccountId,
        role: 'player',
      })
    ).rejects.toMatchObject({
      code: 'SEAT_LIMIT_REACHED',
      message: 'The owner account has no available seats for this role.',
    });
  });

  it('normalizes successful seat assertion payloads', async () => {
    const client = createRpcClient({
      data: {
        ok: true,
        seat: ownerSeatStatusPayload.playerSeats,
        seatStatus: ownerSeatStatusPayload,
      },
      error: null,
    });

    await expect(
      assertOwnerSeatAvailableAction(client, actorUserId, {
        ownerAccountId,
        role: 'player',
      })
    ).resolves.toMatchObject({
      ok: true,
      seat: { role: 'player', seatsAvailable: 8 },
      seatStatus: { ownerAccountId, canAddPlayers: true },
    });
  });

  it('calls the platform owner creation RPC', async () => {
    const client = createRpcClient({
      data: ownerSeatStatusPayload,
      error: null,
    });

    await expect(
      createOwnerAccountAction(client, actorUserId, {
        ownerType: 'club',
        ownerName: 'B93',
        ownerUserId: null,
        planCode: 'club_pro',
        seatOverrides: {
          player: 100,
        },
      })
    ).resolves.toMatchObject({
      ownerAccountId,
      canAddPlayers: true,
    });

    expect(client.rpc).toHaveBeenCalledWith('create_owner_account_as_platform_admin', {
      p_actor_user_id: actorUserId,
      p_owner_type: 'club',
      p_owner_name: 'B93',
      p_owner_user_id: null,
      p_plan_code: 'club_pro',
      p_seat_overrides: {
        player: 100,
      },
    });
  });

  it('returns platform admin owner accounts with seat status', async () => {
    const client = createRpcClient({
      data: {
        userId: actorUserId,
        email: 'owner@platform.dk',
        isPlatformAdmin: true,
        ownerAccounts: [
          {
            ownerAccountId,
            ownerType: 'private_coach_business',
            ownerName: 'Demo Coach',
            ownerStatus: 'active',
            source: 'super_admin',
            ownerUserId: null,
            ownerEmail: null,
            coachAccountId: null,
            clubId: null,
            createdAt: '2026-07-08T10:00:00.000Z',
            updatedAt: '2026-07-08T10:00:00.000Z',
            seatStatus: ownerSeatStatusPayload,
          },
        ],
      },
      error: null,
    });

    await expect(listPlatformAdminOwnerAccountsAction(client, actorUserId)).resolves.toMatchObject({
      userId: actorUserId,
      email: 'owner@platform.dk',
      isPlatformAdmin: true,
      ownerAccounts: [
        {
          ownerAccountId,
          ownerType: 'private_coach_business',
          ownerName: 'Demo Coach',
          ownerUserId: null,
          coachAccountId: null,
          seatStatus: {
            ownerAccountId,
            playerSeats: {
              effectiveSeats: 20,
              seatsAvailable: 8,
            },
          },
        },
      ],
    });

    expect(client.rpc).toHaveBeenCalledWith('list_platform_admin_owner_accounts', {
      p_actor_user_id: actorUserId,
    });
  });

  it('hides deleted owner accounts from the platform admin web list', () => {
    expect(deleteVisibilityMigration).toContain('create or replace function public.list_platform_admin_owner_accounts');
    expect(deleteVisibilityMigration).toContain("where oa.status = 'active'");
    expect(deleteVisibilityMigration).toContain('Returns active owner accounts');
    expect(ownerSeatBase44Prompt).toContain('Treat `data.ownerAccounts` as the full source of truth');
    expect(ownerSeatBase44Prompt).toContain('Refetch maa ikke merge med den gamle liste');
    expect(ownerSeatBase44Prompt).toContain('Fjern straks den slettede row fra lokal state');
    expect(ownerSeatBase44Prompt).toContain('| `deleteOwnerAccount` | ACTIVE | Protected; unauthenticated smoke returns `401`, not `404`. |');
    expect(ownerSeatBase44Prompt).toContain('URL: https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/deleteOwnerAccount');
    expect(ownerSeatBase44Prompt).toContain('If Base44 shows `Status: —`');
  });

  it('documents the Base44 owner account delete fix', () => {
    expect(ownerDeleteBase44Prompt).toContain('Base44 Prompt: Fix Owner Account Delete Flow');
    expect(ownerDeleteBase44Prompt).toContain('Slet altid ud fra `row.ownerAccountId`');
    expect(ownerDeleteBase44Prompt).toContain('Brug aldrig `ownerName` som identitet');
    expect(ownerDeleteBase44Prompt).toContain('Brug aldrig `coachAccountId` som `ownerAccountId`');
    expect(ownerDeleteBase44Prompt).toContain('response.data.ownerAccountId === selectedOwnerAccountId');
    expect(ownerDeleteBase44Prompt).toContain('Merge aldrig med gammel');
    expect(ownerDeleteBase44Prompt).toContain('setOwnerAccounts(refreshed.ownerAccounts ?? [])');
    expect(ownerDeleteBase44Prompt).toContain('legacy auto-provision triggers');
    expect(ownerDeleteBase44Prompt).toContain('20260711110000_delete_owner_account_prevent_legacy_reprovision.sql');
    expect(ownerDeleteBase44Prompt).toContain('e6a68cb1-53d5-491e-bca6-1d4ce660919f');
    expect(ownerDeleteBase44Prompt).toContain('58b2b944-1084-4e7a-a78e-bb0e700424c0');
    expect(ownerDeleteBase44Prompt).toContain('owner_accounts_name_jeppe_count: 0');
    expect(ownerDeleteBase44Prompt).toContain('9f1f6e7a-f971-4b29-8d40-0ae8fc5c6c0f');
    expect(ownerDeleteBase44Prompt).toContain('025e0cc0-69ac-4bbd-bd74-5eac6dd56e1a');
    expect(ownerDeleteBase44Prompt).toContain('Der er ingen hardcoded special-case for Jeppe');
  });

  it('prevents legacy workspace reprovision during owner account delete', () => {
    expect(deleteNoReprovisionMigration).toContain('create or replace function public.ensure_migration_coach_account_for_user');
    expect(deleteNoReprovisionMigration).toContain("current_setting('app.skip_coach_workspace_auto_provision', true) = 'on'");
    expect(deleteNoReprovisionMigration).toContain('return null;');
    expect(deleteNoReprovisionMigration).toContain('create or replace function public.delete_owner_account_as_platform_admin');
    expect(deleteNoReprovisionMigration).toContain(
      "perform set_config('app.skip_coach_workspace_auto_provision', 'on', true);"
    );
    expect(deleteNoReprovisionMigration).toContain('delete from public.coach_accounts');
    expect(deleteNoReprovisionMigration).toContain('without legacy auto-reprovisioning');
  });

  it('restricts owner and coach workspace provisioning to explicit allowed flows', () => {
    expect(restrictedProvisioningMigration).toContain('public.owner_workspace_provision_allowed()');
    expect(restrictedProvisioningMigration).toContain('it no longer auto-creates workspaces');
    expect(restrictedProvisioningMigration).toContain('it no longer auto-creates migration workspaces');
    expect(restrictedProvisioningMigration).toContain('if not public.owner_workspace_provision_allowed() then');
    expect(restrictedProvisioningMigration).toContain('return null;');
    expect(restrictedProvisioningMigration).toContain(
      'drop policy if exists "Authenticated users can create owned coach accounts" on public.coach_accounts'
    );
    expect(restrictedProvisioningMigration).toContain('revoke insert on public.coach_accounts from authenticated');
    expect(restrictedProvisioningMigration).toContain('Direct authenticated inserts are disabled');
    expect(restrictedProvisioningMigration).toContain('if v_owner_account_id is null then');
    expect(restrictedProvisioningMigration).toContain('create or replace function public.sync_private_coach_owner_subscription');
    expect(restrictedProvisioningMigration).toContain(
      "perform set_config('app.allow_owner_workspace_provision', 'on', true);"
    );
    expect(restrictedProvisioningMigration).toContain('create or replace function public.create_owner_account_as_platform_admin');
    expect(restrictedProvisioningMigration).toContain('the only non-Apple path allowed to create owner/coach workspaces');
    expect(restrictedProvisioningMigration).toContain('it must not auto-create owner accounts');
  });

  it('keeps the owner workspace provisioning guard fail-closed', () => {
    expect(provisioningGuardDefaultMigration).toContain(
      "coalesce(current_setting('app.allow_owner_workspace_provision', true), '') = 'on'"
    );
    expect(provisioningGuardDefaultMigration).toContain('defaults to false');
  });

  it('documents Base44 dashboard seat status fallback handling', () => {
    expect(ownerSeatBase44Prompt).toContain('Dashboard/KPI implementation rules');
    expect(ownerSeatBase44Prompt).toContain('`KlubAdmin.jsx` skal hente `getOwnerSeatStatus`');
    expect(ownerSeatBase44Prompt).toContain('adapteren bevare `playerSeats` fra backendens');
    expect(ownerSeatBase44Prompt).toContain('Normaliser ikke en manglende');
    expect(ownerSeatBase44Prompt).toContain('Hvis Base44 fortsat bruger flade convenience-felter');
    expect(ownerSeatBase44Prompt).toContain('`seatsTotal`,');
    expect(ownerSeatBase44Prompt).toContain('skal felterne vaere');
    expect(ownerSeatBase44Prompt).toContain('`null`/`undefined`');
    expect(ownerSeatBase44Prompt).toContain('sidebar/header');
    expect(ownerSeatBase44Prompt).toContain('`seatsUsed ?? "—"` og `seatsTotal ?? "—"`');
    expect(ownerSeatBase44Prompt).toContain('`KlubDashboard.jsx` skal foretraekke den prop-baserede status');
    expect(ownerSeatBase44Prompt).toContain('`DashboardKpiStrip.jsx` skal have en `getPlayerSeats(seatStatus)`-helper');
    expect(ownerSeatBase44Prompt).toContain('`seatStatusLoading`, `seatStatusError` og');
    expect(ownerSeatBase44Prompt).toContain('`onSeatStatusRetry` videre til `KlubDashboard`');
    expect(ownerSeatBase44Prompt).toContain('returnerer `null`, naar `seatStatus` eller `seatStatus.playerSeats` mangler');
    expect(ownerSeatBase44Prompt).toContain('Den maa ikke returnere `{ total: 0, used: 0, available: 0 }` som fallback');
    expect(ownerSeatBase44Prompt).toContain('Hvis der bruges `Loader2`, skal ikonet have `animate-spin`');
    expect(ownerSeatBase44Prompt).toContain('Vis aldrig `0/0` som placeholder');
    expect(ownerSeatBase44Prompt).toContain('`playerSeats.effectiveSeats`, `playerSeats.seatsUsed` og');
  });

  it('documents Base44 seat pre-check before player assignment', () => {
    expect(ownerSeatBase44Prompt).toContain('Base44 assignment rules');
    expect(ownerSeatBase44Prompt).toContain('Kald `assertOwnerSeatAvailable` lige foer Base44 opretter eller tildeler en');
    expect(ownerSeatBase44Prompt).toContain('i `AddPlayerModal.jsx` lige');
    expect(ownerSeatBase44Prompt).toContain("role: 'player'");
    expect(ownerSeatBase44Prompt).toContain('Behold stadig backendens seat-check');
    expect(ownerSeatBase44Prompt).toContain('Pre-checket er en UX-forbedring');
    expect(ownerSeatBase44Prompt).toContain('Hvis Base44 senere opretter/tildeler `owner` eller `admin`');
    expect(ownerSeatBase44Prompt).toContain('Kald ikke `assertOwnerSeatAvailable` for `coach`, `assistant_coach` eller');
  });

  it('calls the platform owner account delete RPC', async () => {
    const client = createRpcClient({
      data: {
        ownerAccountId,
        deleted: true,
        ownerType: 'private_coach_business',
        ownerName: 'Demo Coach',
        coachAccountId: null,
        clubId: null,
        linkedWorkspaceDeleted: false,
      },
      error: null,
    });

    await expect(deleteOwnerAccountAction(client, actorUserId, { ownerAccountId })).resolves.toEqual({
      ownerAccountId,
      deleted: true,
      ownerType: 'private_coach_business',
      ownerName: 'Demo Coach',
      coachAccountId: null,
      clubId: null,
      linkedWorkspaceDeleted: false,
    });

    expect(client.rpc).toHaveBeenCalledWith('delete_owner_account_as_platform_admin', {
      p_actor_user_id: actorUserId,
      p_owner_account_id: ownerAccountId,
    });
  });

  it('calls the platform owner seat adjustment RPC', async () => {
    const client = createRpcClient({
      data: {
        ...ownerSeatStatusPayload,
        adjustmentId,
      },
      error: null,
    });

    await expect(
      upsertOwnerSeatAdjustmentAction(client, actorUserId, {
        ownerAccountId,
        role: 'assistant',
        adjustmentType: 'override',
        seats: 4,
        reason: 'Manual provisioning',
        validUntil: null,
      })
    ).resolves.toMatchObject({
      ownerAccountId,
      adjustmentId,
    });

    expect(client.rpc).toHaveBeenCalledWith('upsert_owner_seat_adjustment_as_platform_admin', {
      p_actor_user_id: actorUserId,
      p_owner_account_id: ownerAccountId,
      p_role: 'assistant_coach',
      p_adjustment_type: 'override',
      p_seats: 4,
      p_reason: 'Manual provisioning',
      p_valid_until: null,
    });
  });
});
