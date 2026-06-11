import {
  MAX_PLAYER_PROFILE_POSITIONS,
  arePlayerProfilePositionsEqual,
  isMissingPlayerProfileFieldsError,
  normalizePlayerProfilePositions,
  withProfilePlayerFieldDefaults,
} from '../utils/playerProfileOptions';

describe('player profile position options', () => {
  it('normalizes known positions and caps selections at five', () => {
    expect(
      normalizePlayerProfilePositions([
        'Fullback',
        'Fullback',
        'Ukendt',
        'Winger',
        'Striker',
        'Goalkeeper',
        'Center back',
        'Central midfielder',
      ])
    ).toEqual(['Fullback', 'Winger', 'Striker', 'Goalkeeper', 'Center back']);
    expect(normalizePlayerProfilePositions(['Fullback', 'Winger', 'Striker', 'Goalkeeper', 'Center back', 'Midtbane'])).toHaveLength(
      MAX_PLAYER_PROFILE_POSITIONS
    );
  });

  it('compares saved position arrays in order', () => {
    expect(arePlayerProfilePositionsEqual(['Fullback', 'Winger'], ['Fullback', 'Winger'])).toBe(true);
    expect(arePlayerProfilePositionsEqual(['Winger', 'Fullback'], ['Fullback', 'Winger'])).toBe(false);
  });

  it('detects missing migrated profile fields and applies legacy defaults', () => {
    expect(
      isMissingPlayerProfileFieldsError({
        code: '42703',
        message: 'column profiles.avatar_url does not exist',
      })
    ).toBe(true);
    expect(withProfilePlayerFieldDefaults({ full_name: 'Test', phone_number: null })).toEqual({
      full_name: 'Test',
      phone_number: null,
      avatar_url: null,
      player_positions: [],
      club_name: null,
      playing_level: null,
    });
  });
});
