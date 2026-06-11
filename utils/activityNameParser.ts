import { DEFAULT_CATEGORY_KEYWORDS as DEFAULT_CATEGORY_KEYWORDS_LOCAL } from '@/shared/activityCategoryResolver';

export {
  parseActivityNameForCategory,
  resolveActivityCategory,
} from '@/shared/activityCategoryResolver';
export { DEFAULT_CATEGORY_KEYWORDS_LOCAL as DEFAULT_CATEGORY_KEYWORDS };

export type {
  ActivityCategoryCandidate,
  CategoryKeywords,
  CategoryMappingRecord,
  CategoryResolution,
  ResolveCategoryOptions,
} from '@/shared/activityCategoryResolver';

export function suggestCategoryFromActivityName(activityName: string): {
  name: string;
  emoji: string;
  color: string;
} {
  const normalizedName = activityName.toLowerCase().trim();

  for (const keywordSet of DEFAULT_CATEGORY_KEYWORDS_LOCAL) {
    for (const keyword of keywordSet.keywords) {
      if (normalizedName.includes(keyword.toLowerCase())) {
        return {
          name: keywordSet.categoryName,
          emoji: getCategoryEmoji(keywordSet.categoryName),
          color: getCategoryColor(keywordSet.categoryName),
        };
      }
    }
  }

  return {
    name: activityName.split(' ')[0] || 'Activity',
    emoji: '📌',
    color: '#4CAF50',
  };
}

function getCategoryEmoji(categoryName: string): string {
  const emojiMap: { [key: string]: string } = {
    'kamp': '🏆',
    'training': '⚽',
    'physical exercise': '💪',
    'taktik': '📋',
    'meeting': '📅',
    'holdsamling': '🤝',
    'doctor\'s visit': '🏥',
    'rejse': '✈️',
  };

  return emojiMap[categoryName.toLowerCase()] || '📌';
}

function getCategoryColor(categoryName: string): string {
  const colorMap: { [key: string]: string } = {
    'kamp': '#FFD700',
    'training': '#4CAF50',
    'physical exercise': '#FF5722',
    'taktik': '#2196F3',
    'meeting': '#9C27B0',
    'holdsamling': '#FF9800',
    'doctor\'s visit': '#F44336',
    'rejse': '#00BCD4',
  };

  return colorMap[categoryName.toLowerCase()] || '#4CAF50';
}
