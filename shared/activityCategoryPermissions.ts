import type { ActivityCategory } from '@/types';

export function isUserManagedActivityCategory(
  category: ActivityCategory | null | undefined,
  userId: string | null | undefined
): boolean {
  if (!category || !userId) {
    return false;
  }

  return (
    category.user_id === userId &&
    category.is_system !== true &&
    !category.club_id &&
    !category.source_category_id &&
    !category.player_id &&
    !category.team_id
  );
}

export function isHideableSystemActivityCategory(category: ActivityCategory | null | undefined): boolean {
  if (!category) {
    return false;
  }

  return category.is_system === true && !category.club_id && !category.source_category_id;
}
