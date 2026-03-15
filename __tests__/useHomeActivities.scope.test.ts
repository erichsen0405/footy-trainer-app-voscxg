import { buildActivityScopeFilter } from '@/hooks/useHomeActivities';

describe('buildActivityScopeFilter', () => {
  it('builds self scope from current user and team memberships', () => {
    expect(buildActivityScopeFilter({
      sessionUserId: 'user-1',
      adminMode: 'self',
      adminTargetId: null,
      adminTargetType: null,
      selfTeamIds: ['team-1', 'team-2'],
    })).toBe(
      'and(user_id.eq.user-1,player_id.is.null,team_id.is.null),player_id.eq.user-1,team_id.in.(team-1,team-2)'
    );
  });

  it('builds player admin scope from selected player', () => {
    expect(buildActivityScopeFilter({
      sessionUserId: 'coach-1',
      adminMode: 'player',
      adminTargetId: 'player-7',
      adminTargetType: 'player',
      selfTeamIds: ['team-1'],
    })).toBe(
      'and(user_id.eq.player-7,player_id.is.null,team_id.is.null),player_id.eq.player-7'
    );
  });

  it('builds team admin scope from selected team', () => {
    expect(buildActivityScopeFilter({
      sessionUserId: 'coach-1',
      adminMode: 'team',
      adminTargetId: 'team-9',
      adminTargetType: 'team',
      selfTeamIds: ['team-1'],
    })).toBe('team_id.eq.team-9');
  });
});
