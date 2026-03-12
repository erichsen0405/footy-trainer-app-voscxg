import {
  isTrainerProfileRole,
  parseClubMemberManagementBody,
  parseCoachPlayerLinkBody,
  parseCreateClubTeamBody,
  resolveMemberUserId,
  parseUpdateClubTeamBody,
} from '../supabase/functions/_shared/clubMemberManagement';

const clubId = '11111111-1111-4111-8111-111111111111';
const coachUserId = '22222222-2222-4222-8222-222222222222';
const playerUserId = '33333333-3333-4333-8333-333333333333';
const teamId = '44444444-4444-4444-8444-444444444444';

describe('club member management backend helpers', () => {
  it('normalizes member management clubId input', () => {
    expect(parseClubMemberManagementBody({ clubId })).toEqual({ clubId });
  });

  it('normalizes coach-player link input', () => {
    expect(
      parseCoachPlayerLinkBody({
        clubId,
        coachUserId,
        playerUserId,
      })
    ).toEqual({
      clubId,
      coachUserId,
      playerUserId,
    });
  });

  it('normalizes create club team input', () => {
    expect(
      parseCreateClubTeamBody({
        clubId,
        name: '  U15 A  ',
        description: '  Træning mandag og onsdag  ',
        coachUserId,
        playerUserIds: [playerUserId, playerUserId],
      })
    ).toEqual({
      clubId,
      name: 'U15 A',
      description: 'Træning mandag og onsdag',
      coachUserId,
      playerUserIds: [playerUserId],
    });
  });

  it('normalizes update club team input', () => {
    expect(
      parseUpdateClubTeamBody({
        teamId,
        clubId,
        name: 'Førstehold',
        description: '',
        coachUserId,
        playerUserIds: [playerUserId],
      })
    ).toEqual({
      teamId,
      clubId,
      name: 'Førstehold',
      description: null,
      coachUserId,
      playerUserIds: [playerUserId],
    });
  });

  it('rejects missing team names', () => {
    expect.assertions(2);

    try {
      parseCreateClubTeamBody({
        clubId,
        name: '',
        coachUserId,
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(error).toHaveProperty('message', 'name is required.');
    }
  });

  it('treats admin and coach as trainer profiles', () => {
    expect(isTrainerProfileRole('admin')).toBe(true);
    expect(isTrainerProfileRole('coach')).toBe(true);
    expect(isTrainerProfileRole('player')).toBe(false);
  });

  it('rejects invalid playerUserIds payloads', () => {
    expect.assertions(2);

    try {
      parseCreateClubTeamBody({
        clubId,
        name: 'U15 A',
        coachUserId,
        playerUserIds: 'not-an-array',
      });
    } catch (error) {
      expect(error).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(error).toHaveProperty('message', 'playerUserIds must be an array of UUIDs.');
    }
  });

  it('resolves both memberId and userId to the member user id', () => {
    const members = [
      {
        memberId: 'member-admin',
        clubId,
        userId: 'user-admin',
        fullName: 'Admin',
        email: 'admin@example.com',
        role: 'admin',
        isTrainerProfile: true,
        status: 'active',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:00.000Z',
      },
      {
        memberId: 'member-player',
        clubId,
        userId: 'user-player',
        fullName: 'Player',
        email: 'player@example.com',
        role: 'player',
        isTrainerProfile: false,
        status: 'active',
        createdAt: '2026-03-11T00:00:00.000Z',
        updatedAt: '2026-03-11T00:00:00.000Z',
      },
    ] as const;

    expect(resolveMemberUserId([...members], 'user-admin')).toBe('user-admin');
    expect(resolveMemberUserId([...members], 'member-admin')).toBe('user-admin');
    expect(resolveMemberUserId([...members], 'member-player')).toBe('user-player');
  });
});
