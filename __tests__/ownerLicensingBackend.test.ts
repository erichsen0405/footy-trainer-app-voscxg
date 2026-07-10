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
const ownerSeatBase44PromptPath = path.join(process.cwd(), 'docs/base44-owner-seat-endpoints-deployed-prompt.md');

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
  const ownerSeatBase44Prompt = fs.readFileSync(ownerSeatBase44PromptPath, 'utf8');

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
