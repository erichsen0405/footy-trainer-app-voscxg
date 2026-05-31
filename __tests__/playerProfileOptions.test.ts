import {
  MAX_PLAYER_PROFILE_POSITIONS,
  arePlayerProfilePositionsEqual,
  normalizePlayerProfilePositions,
} from '../utils/playerProfileOptions';

describe('player profile position options', () => {
  it('normalizes known positions and caps selections at five', () => {
    expect(
      normalizePlayerProfilePositions([
        'Back',
        'Back',
        'Ukendt',
        'Kant',
        'Angriber',
        'Målmand',
        'Midterforsvarer',
        'Central midtbane',
      ])
    ).toEqual(['Back', 'Kant', 'Angriber', 'Målmand', 'Midterforsvarer']);
    expect(normalizePlayerProfilePositions(['Back', 'Kant', 'Angriber', 'Målmand', 'Midterforsvarer', 'Midtbane'])).toHaveLength(
      MAX_PLAYER_PROFILE_POSITIONS
    );
  });

  it('compares saved position arrays in order', () => {
    expect(arePlayerProfilePositionsEqual(['Back', 'Kant'], ['Back', 'Kant'])).toBe(true);
    expect(arePlayerProfilePositionsEqual(['Kant', 'Back'], ['Back', 'Kant'])).toBe(false);
  });
});
