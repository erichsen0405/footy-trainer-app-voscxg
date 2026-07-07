import {
  assertOwnerSeatAvailableAction,
  getOwnerSeatStatusAction,
  parseAssertOwnerSeatBody,
  parseOwnerSeatStatusBody,
} from '../supabase/functions/_shared/ownerLicensing';

const actorUserId = '11111111-1111-4111-8111-111111111111';
const ownerAccountId = '22222222-2222-4222-8222-222222222222';

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
  it('normalizes owner seat status input', () => {
    expect(parseOwnerSeatStatusBody({ ownerAccountId })).toEqual({ ownerAccountId });
  });

  it('normalizes assistant role aliases for seat assertions', () => {
    expect(parseAssertOwnerSeatBody({ ownerAccountId, role: 'assistant' })).toEqual({
      ownerAccountId,
      role: 'assistant_coach',
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
});
