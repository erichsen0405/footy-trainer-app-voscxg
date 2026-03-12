import {
  acceptClubInviteAction,
  createClubAction,
  deleteClubAction,
  getClubInviteByTokenAction,
  getCurrentUserClubContextAction,
  listPlatformAdminClubsAction,
  parseAcceptClubInviteBody,
  parseCreateClubBody,
  parseUpdateClubBody,
  updateClubAction,
} from '../supabase/functions/_shared/clubAdmin';

const actorUserId = '11111111-1111-4111-8111-111111111111';
const clubId = '22222222-2222-4222-8222-222222222222';
const inviteId = '33333333-3333-4333-8333-333333333333';
const memberId = '44444444-4444-4444-8444-444444444444';
const invitedUserId = '55555555-5555-4555-8555-555555555555';

function createRpcClient(result: { data: unknown; error: { message?: string } | null }) {
  return {
    rpc: jest.fn().mockResolvedValue(result),
  };
}

describe('club admin phase 1 backend helpers', () => {
  it('normalizes create-club payloads', () => {
    const payload = parseCreateClubBody({
      clubName: ' FC Copenhagen ',
      adminEmail: ' Admin@Club.dk ',
      seatsTotal: 12,
      planName: ' Pro ',
      validUntil: '2026-12-31T00:00:00.000Z',
    });

    expect(payload).toEqual({
      clubName: 'FC Copenhagen',
      adminEmail: 'admin@club.dk',
      seatsTotal: 12,
      planName: 'Pro',
      validUntil: '2026-12-31T00:00:00.000Z',
    });
  });

  it('rejects invalid validUntil values', () => {
    expect.assertions(2);

    try {
      parseCreateClubBody({
        clubName: 'FC Copenhagen',
        adminEmail: 'admin@club.dk',
        seatsTotal: 12,
        validUntil: 'not-a-date',
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(error).toHaveProperty('message', 'validUntil must be a valid ISO datetime string.');
    }
  });

  it('returns normalized data for create-club responses', async () => {
    const client = createRpcClient({
      data: {
        club: {
          id: clubId,
          name: 'FC Copenhagen',
          status: 'active',
          createdAt: '2026-03-09T12:00:00.000Z',
        },
        license: {
          id: '66666666-6666-4666-8666-666666666666',
          clubId,
          seatsTotal: 12,
          status: 'active',
          validUntil: '2026-12-31T00:00:00.000Z',
          planName: 'Pro',
          createdAt: '2026-03-09T12:00:00.000Z',
          updatedAt: '2026-03-09T12:00:00.000Z',
        },
        invite: {
          id: inviteId,
          clubId,
          email: 'admin@club.dk',
          role: 'admin',
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
          seatsTotal: 12,
          seatsUsed: 0,
          seatsAvailable: 12,
          licenseStatus: 'active',
          planName: 'Pro',
          validUntil: '2026-12-31T00:00:00.000Z',
          pendingInvitesCount: 1,
          activeMembersCount: 0,
        },
      },
      error: null,
    });

    await expect(
      createClubAction(client, actorUserId, {
        clubName: 'FC Copenhagen',
        adminEmail: 'admin@club.dk',
        seatsTotal: 12,
        planName: 'Pro',
        validUntil: '2026-12-31T00:00:00.000Z',
      })
    ).resolves.toMatchObject({
      club: { id: clubId, name: 'FC Copenhagen' },
      license: { clubId, seatsTotal: 12 },
      invite: { email: 'admin@club.dk', role: 'admin' },
      seatStatus: { seatsAvailable: 12, pendingInvitesCount: 1 },
    });
  });

  it('maps platform-admin permission failures for create-club', async () => {
    const client = createRpcClient({
      data: null,
      error: { message: 'FORBIDDEN' },
    });

    await expect(
      createClubAction(client, actorUserId, {
        clubName: 'FC Copenhagen',
        adminEmail: 'admin@club.dk',
        seatsTotal: 12,
      })
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'You do not have access to this club.',
    });
  });

  it('normalizes update-club payloads', () => {
    expect(
      parseUpdateClubBody({
        clubId,
        clubName: ' FC Midtjylland ',
        status: 'inactive',
        seatsTotal: 18,
        planName: ' Enterprise ',
        validUntil: '2026-12-31T00:00:00.000Z',
        licenseStatus: 'inactive',
      })
    ).toEqual({
      clubId,
      clubName: 'FC Midtjylland',
      status: 'inactive',
      seatsTotal: 18,
      planName: 'Enterprise',
      validUntil: '2026-12-31T00:00:00.000Z',
      licenseStatus: 'inactive',
    });
  });

  it('returns normalized data for update-club responses', async () => {
    const client = createRpcClient({
      data: {
        club: {
          id: clubId,
          name: 'FC Midtjylland',
          status: 'inactive',
          createdAt: '2026-03-09T12:00:00.000Z',
        },
        license: {
          id: '66666666-6666-4666-8666-666666666666',
          clubId,
          seatsTotal: 18,
          status: 'inactive',
          validUntil: '2026-12-31T00:00:00.000Z',
          planName: 'Enterprise',
          createdAt: '2026-03-09T12:00:00.000Z',
          updatedAt: '2026-03-10T12:00:00.000Z',
        },
        seatStatus: {
          clubId,
          seatsTotal: 18,
          seatsUsed: 1,
          seatsAvailable: 17,
          licenseStatus: 'inactive',
          planName: 'Enterprise',
          validUntil: '2026-12-31T00:00:00.000Z',
          pendingInvitesCount: 0,
          activeMembersCount: 1,
        },
      },
      error: null,
    });

    await expect(
      updateClubAction(client, actorUserId, {
        clubId,
        clubName: 'FC Midtjylland',
        status: 'inactive',
        seatsTotal: 18,
        planName: 'Enterprise',
        validUntil: '2026-12-31T00:00:00.000Z',
        licenseStatus: 'inactive',
      })
    ).resolves.toMatchObject({
      club: { id: clubId, name: 'FC Midtjylland', status: 'inactive' },
      license: { clubId, seatsTotal: 18, status: 'inactive' },
      seatStatus: { seatsAvailable: 17, licenseStatus: 'inactive' },
    });
  });

  it('maps club-not-found failures for update-club', async () => {
    const client = createRpcClient({
      data: null,
      error: { message: 'CLUB_NOT_FOUND' },
    });

    await expect(
      updateClubAction(client, actorUserId, {
        clubId,
        clubName: 'FC Midtjylland',
        status: 'inactive',
        seatsTotal: 18,
        planName: 'Enterprise',
        validUntil: '2026-12-31T00:00:00.000Z',
        licenseStatus: 'inactive',
      })
    ).rejects.toMatchObject({
      code: 'CLUB_NOT_FOUND',
      message: 'Club not found.',
    });
  });

  it('returns delete-club success payloads', async () => {
    const client = createRpcClient({
      data: {
        clubId,
        deleted: true,
      },
      error: null,
    });

    await expect(deleteClubAction(client, actorUserId, { clubId })).resolves.toEqual({
      clubId,
      deleted: true,
    });
  });

  it('normalizes invite-accept payloads', () => {
    expect(
      parseAcceptClubInviteBody({
        token: ' invite-token ',
        fullName: '  Jane Admin ',
      })
    ).toEqual({
      token: 'invite-token',
      fullName: 'Jane Admin',
    });
  });

  it('returns public invite lookup payloads', async () => {
    const client = createRpcClient({
      data: {
        id: inviteId,
        clubId,
        clubName: 'FC Copenhagen',
        email: 'admin@club.dk',
        role: 'admin',
        status: 'pending',
        expiresAt: '2026-03-16T12:00:00.000Z',
        acceptedAt: null,
        cancelledAt: null,
      },
      error: null,
    });

    await expect(
      getClubInviteByTokenAction(client, {
        token: 'invite-token',
      })
    ).resolves.toEqual({
      id: inviteId,
      clubId,
      clubName: 'FC Copenhagen',
      email: 'admin@club.dk',
      role: 'admin',
      status: 'pending',
      expiresAt: '2026-03-16T12:00:00.000Z',
      acceptedAt: null,
      cancelledAt: null,
    });
  });

  it('maps seat-limit failures during invite acceptance', async () => {
    const client = createRpcClient({
      data: null,
      error: { message: 'SEAT_LIMIT_REACHED' },
    });

    await expect(
      acceptClubInviteAction(client, invitedUserId, {
        token: 'invite-token',
      })
    ).rejects.toMatchObject({
      code: 'SEAT_LIMIT_REACHED',
      message: 'The club has no available seats.',
    });
  });

  it('returns normalized member and seat status for invite acceptance', async () => {
    const client = createRpcClient({
      data: {
        member: {
          id: memberId,
          clubId,
          userId: invitedUserId,
          fullName: 'Jane Admin',
          email: 'admin@club.dk',
          role: 'admin',
          status: 'active',
          createdAt: '2026-03-09T12:00:00.000Z',
          updatedAt: '2026-03-09T12:00:00.000Z',
        },
        seatStatus: {
          clubId,
          seatsTotal: 12,
          seatsUsed: 1,
          seatsAvailable: 11,
          licenseStatus: 'active',
          planName: 'Pro',
          validUntil: '2026-12-31T00:00:00.000Z',
          pendingInvitesCount: 0,
          activeMembersCount: 1,
        },
      },
      error: null,
    });

    await expect(
      acceptClubInviteAction(client, invitedUserId, {
        token: 'invite-token',
        fullName: 'Jane Admin',
      })
    ).resolves.toMatchObject({
      member: {
        id: memberId,
        role: 'admin',
        status: 'active',
      },
      seatStatus: {
        seatsUsed: 1,
        seatsAvailable: 11,
      },
    });
  });

  it('returns current user context with platform-admin flag and clubs', async () => {
    const client = createRpcClient({
      data: {
        userId: actorUserId,
        email: 'owner@platform.dk',
        isPlatformAdmin: true,
        clubs: [
          {
            clubId,
            clubName: 'FC Copenhagen',
            role: 'platform_admin',
            status: 'active',
            planName: 'Pro',
            seatsTotal: 12,
            seatsUsed: 1,
            seatsAvailable: 11,
            pendingInvitesCount: 0,
            createdAt: '2026-03-09T12:00:00.000Z',
            licenseStatus: 'active',
            validUntil: '2026-12-31T00:00:00.000Z',
            activeMembersCount: 1,
            memberId: null,
            memberStatus: null,
          },
        ],
      },
      error: null,
    });

    await expect(getCurrentUserClubContextAction(client, actorUserId)).resolves.toMatchObject({
      userId: actorUserId,
      email: 'owner@platform.dk',
      isPlatformAdmin: true,
      clubs: [
        {
          clubId,
          clubName: 'FC Copenhagen',
          role: 'platform_admin',
          seatsAvailable: 11,
        },
      ],
    });
  });

  it('returns a flat platform-admin club list payload', async () => {
    const client = createRpcClient({
      data: {
        userId: actorUserId,
        email: 'owner@platform.dk',
        isPlatformAdmin: true,
        clubs: [
          {
            clubId,
            clubName: 'FC Copenhagen',
            role: 'admin',
            status: 'active',
            planName: 'Pro',
            seatsTotal: 12,
            seatsUsed: 1,
            seatsAvailable: 11,
            pendingInvitesCount: 0,
            createdAt: '2026-03-09T12:00:00.000Z',
            licenseStatus: 'active',
            validUntil: '2026-12-31T00:00:00.000Z',
            activeMembersCount: 1,
            memberId,
            memberStatus: 'active',
          },
        ],
      },
      error: null,
    });

    await expect(listPlatformAdminClubsAction(client, actorUserId)).resolves.toMatchObject({
      userId: actorUserId,
      email: 'owner@platform.dk',
      isPlatformAdmin: true,
      clubs: [
        {
          clubId,
          clubName: 'FC Copenhagen',
          role: 'admin',
          seatsTotal: 12,
          seatsAvailable: 11,
          memberId,
        },
      ],
    });
  });
});
