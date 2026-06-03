import {
  resolveActivityCategory,
  stripCategorySourceSuffix,
} from '../shared/activityCategoryResolver';

describe('activity category resolver', () => {
  it('matches copied club categories by their base name', () => {
    const result = resolveActivityCategory({
      title: 'Recovery session',
      categories: [
        {
          id: 'club-recovery',
          name: 'Recovery (klub)',
          color: '#4ECDC4',
          emoji: 'R',
          user_id: 'user-1',
          source_category_id: 'source-recovery',
          club_id: 'club-1',
          is_system: false,
        },
      ],
    });

    expect(result).toMatchObject({
      category: {
        id: 'club-recovery',
      },
      reason: 'name-match',
      matchedValue: 'Recovery (klub)',
    });
  });

  it('prefers a personal category over a copied club alias with the same base name', () => {
    const result = resolveActivityCategory({
      title: 'Recovery',
      categories: [
        {
          id: 'club-recovery',
          name: 'Recovery (klub)',
          color: '#4ECDC4',
          emoji: 'R',
          user_id: 'user-1',
          source_category_id: 'source-recovery',
          club_id: 'club-1',
          is_system: false,
        },
        {
          id: 'personal-recovery',
          name: 'Recovery',
          color: '#FF6B6B',
          emoji: 'P',
          user_id: 'user-1',
          is_system: false,
        },
      ],
    });

    expect(result?.category.id).toBe('personal-recovery');
  });

  it('strips source suffixes used for copied categories', () => {
    expect(stripCategorySourceSuffix('Sprint (klub)')).toBe('Sprint');
    expect(stripCategorySourceSuffix('Sprint (fra træner)')).toBe('Sprint');
  });
});
