/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { DEFAULT_CATEGORY_KEYWORDS as DEFAULT_CATEGORY_KEYWORDS_LOCAL } from '@/shared/activityCategoryResolver';

export {
  DEFAULT_CATEGORY_KEYWORDS_LOCAL as DEFAULT_CATEGORY_KEYWORDS,
  parseActivityNameForCategory,
  resolveActivityCategory,
} from '@/shared/activityCategoryResolver';

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
    name: activityName.split(' ')[0] || 'Aktivitet',
    emoji: '📌',
    color: '#4CAF50',
  };
}

function getCategoryEmoji(categoryName: string): string {
  const emojiMap: { [key: string]: string } = {
    'kamp': '🏆',
    'træning': '⚽',
    'fysisk træning': '💪',
    'taktik': '📋',
    'møde': '📅',
    'holdsamling': '🤝',
    'lægebesøg': '🏥',
    'rejse': '✈️',
  };

  return emojiMap[categoryName.toLowerCase()] || '📌';
}

function getCategoryColor(categoryName: string): string {
  const colorMap: { [key: string]: string } = {
    'kamp': '#FFD700',
    'træning': '#4CAF50',
    'fysisk træning': '#FF5722',
    'taktik': '#2196F3',
    'møde': '#9C27B0',
    'holdsamling': '#FF9800',
    'lægebesøg': '#F44336',
    'rejse': '#00BCD4',
  };

  return colorMap[categoryName.toLowerCase()] || '#4CAF50';
}


