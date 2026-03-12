import {
  cancelClubInviteAction,
  createClubInviteAction,
  deactivateClubMemberAction,
  getClubSeatStatusAction,
  parseChangeClubMemberRoleBody,
  parseCreateClubInviteBody,
  resendClubInviteAction,
} from '../supabase/functions/_shared/clubAdmin';

const clubId = '11111111-1111-4111-8111-111111111111';
const inviteId = '22222222-2222-4222-8222-222222222222';
const actorUserId = '33333333-3333-4333-8333-333333333333';
const memberId = '44444444-4444-4444-8444-444444444444';

function createRpcClient(result: { data: unknown; error: { message?: string } | null }) {
  return {
    rpc: jest.fn().mockResolvedValue(result),
  };
}

describe('club admin backend helpers', () => {
  it('normalizes create invite payloads', () => {
    const payload = parseCreateClubInviteBody({
      clubId,
      email: '  ADMIN@Example.com ',
      role: 'admin',
    });

    expect(payload).toEqual({
      clubId,
      email: 'admin@example.com',
      role: 'admin',
    });
  });

  it('blocks owner role changes in v1 before RPC execution', () => {
    expect.assertions(2);

    try {
      parseChangeClubMemberRoleBody({
        memberId,
        role: 'owner',
      });
    } catch (error) {
      expect(error).toMatchObject({
        code: 'VALIDATION_ERROR',
      });
      expect(error).toHaveProperty('message', 'Changing owner role is blocked in v1.');
    }
  });

  it('maps create invite seat-limit failures to stable app errors', async () => {
    const client = createRpcClient({
      data: null,
      error: { message: 'SEAT_LIMIT_REACHED' },
    });

    await expect(
      createClubInviteAction(client, actorUserId, {
        clubId,
        email: 'coach@example.com',
        role: 'coach',
      })
    ).rejects.toMatchObject({
      code: 'SEAT_LIMIT_REACHED',
      message: 'The club has no available seats.',
    });
  });

  it('maps permission failures to stable app errors', async () => {
    const client = createRpcClient({
      data: null,
      error: { message: 'FORBIDDEN' },
    });

    await expect(
      getClubSeatStatusAction(client, actorUserId, {
        clubId,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'You do not have access to this club.',
    });
  });

  it('returns normalized invite and seat status for create invite', async () => {
    const client = createRpcClient({
      data: {
        invite: {
          id: inviteId,
          clubId,
          email: 'coach@example.com',
          role: 'coach',
          token: 'secure-token',
          status: 'pending',
          expiresAt: '2026-03-16T12:00:00.000Z',
          invitedBy: actorUserId,
          createdAt: '2026-03-09T12:00:00.000Z',
          updatedAt: '2026-03-09T12:00:00.000Z',
          acceptedAt: null,
          cancelledAt: null,
        },
        seatStatus: {
          clubId,
          seatsTotal: 10,
          seatsUsed: 4,
          seatsAvailable: 6,
          licenseStatus: 'active',
          planName: 'Club Pro',
          validUntil: '2026-04-09T12:00:00.000Z',
          pendingInvitesCount: 1,
          activeMembersCount: 4,
        },
      },
      error: null,
    });

    await expect(
      createClubInviteAction(client, actorUserId, {
        clubId,
        email: 'coach@example.com',
        role: 'coach',
      })
    ).resolves.toEqual({
      invite: {
        id: inviteId,
        clubId,
        email: 'coach@example.com',
        role: 'coach',
        token: 'secure-token',
        status: 'pending',
        expiresAt: '2026-03-16T12:00:00.000Z',
        invitedBy: actorUserId,
        createdAt: '2026-03-09T12:00:00.000Z',
        updatedAt: '2026-03-09T12:00:00.000Z',
        acceptedAt: null,
        cancelledAt: null,
      },
      seatStatus: {
        clubId,
        seatsTotal: 10,
        seatsUsed: 4,
        seatsAvailable: 6,
        licenseStatus: 'active',
        planName: 'Club Pro',
        validUntil: '2026-04-09T12:00:00.000Z',
        pendingInvitesCount: 1,
        activeMembersCount: 4,
      },
    });
  });

  it('returns updated invite data for resend flows', async () => {
    const client = createRpcClient({
      data: {
        id: inviteId,
        clubId,
        email: 'coach@example.com',
        role: 'coach',
        token: 'rotated-token',
        status: 'pending',
        expiresAt: '2026-03-17T12:00:00.000Z',
        invitedBy: actorUserId,
        createdAt: '2026-03-09T12:00:00.000Z',
        updatedAt: '2026-03-10T12:00:00.000Z',
        acceptedAt: null,
        cancelledAt: null,
      },
      error: null,
    });

    await expect(
      resendClubInviteAction(client, actorUserId, {
        inviteId,
      })
    ).resolves.toMatchObject({
      id: inviteId,
      token: 'rotated-token',
      status: 'pending',
    });
  });

  it('maps last-owner guard failures when deactivating members', async () => {
    const client = createRpcClient({
      data: null,
      error: { message: 'LAST_OWNER_GUARD' },
    });

    await expect(
      deactivateClubMemberAction(client, actorUserId, {
        memberId,
      })
    ).rejects.toMatchObject({
      code: 'LAST_OWNER_GUARD',
      message: 'Owner changes are blocked or would remove the last active owner.',
    });
  });

  it('returns seat status output for club members', async () => {
    const client = createRpcClient({
      data: {
        clubId,
        seatsTotal: 15,
        seatsUsed: 7,
        seatsAvailable: 8,
        licenseStatus: 'active',
        planName: 'Enterprise',
        validUntil: '2026-12-31T23:59:59.000Z',
        pendingInvitesCount: 2,
        activeMembersCount: 7,
      },
      error: null,
    });

    await expect(
      getClubSeatStatusAction(client, actorUserId, {
        clubId,
      })
    ).resolves.toEqual({
      clubId,
      seatsTotal: 15,
      seatsUsed: 7,
      seatsAvailable: 8,
      licenseStatus: 'active',
      planName: 'Enterprise',
      validUntil: '2026-12-31T23:59:59.000Z',
      pendingInvitesCount: 2,
      activeMembersCount: 7,
    });
  });

  it('returns cancel success payloads with stable shape', async () => {
    const client = createRpcClient({
      data: {
        inviteId,
        cancelled: true,
      },
      error: null,
    });

    await expect(
      cancelClubInviteAction(client, actorUserId, {
        inviteId,
      })
    ).resolves.toEqual({
      inviteId,
      cancelled: true,
    });
  });
});
