import {
  isHideableSystemActivityCategory,
  isUserManagedActivityCategory,
} from '../shared/activityCategoryPermissions';
import type { ActivityCategory } from '../types';

const userId = 'user-1';

function category(overrides: Partial<ActivityCategory>): ActivityCategory {
  return {
    id: 'category-1',
    name: 'Teknik',
    color: '#4ECDC4',
    emoji: 'T',
    user_id: userId,
    is_system: false,
    ...overrides,
  };
}

describe('activity category permissions', () => {
  it('allows users to manage only their own uncopied personal categories', () => {
    expect(isUserManagedActivityCategory(category({}), userId)).toBe(true);
  });

  it('does not allow users to manage club category copies even when user_id matches', () => {
    expect(
      isUserManagedActivityCategory(
        category({
          name: 'Teknik (klub)',
          club_id: 'club-1',
          source_category_id: 'source-category-1',
        }),
        userId
      )
    ).toBe(false);
  });

  it('only allows system categories to be hidden from the profile', () => {
    expect(isHideableSystemActivityCategory(category({ is_system: true, user_id: null }))).toBe(true);
    expect(
      isHideableSystemActivityCategory(
        category({
          is_system: false,
          club_id: 'club-1',
          source_category_id: 'source-category-1',
        })
      )
    ).toBe(false);
  });
});
