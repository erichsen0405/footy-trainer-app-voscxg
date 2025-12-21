
/**
 * Utility for parsing activity names and automatically assigning categories
 * based on keywords in the activity title
 */

export interface CategoryKeywords {
  categoryName: string;
  keywords: string[];
  priority: number; // Higher priority = checked first
}

// Default keyword mappings for common football/sports activities
// These can be extended or customized per user
const DEFAULT_CATEGORY_KEYWORDS: CategoryKeywords[] = [
  {
    categoryName: 'Kamp',
    keywords: ['kamp', 'match', 'game', 'turnering', 'tournament', 'finale', 'semifinale', 'kvartfinale'],
    priority: 10,
  },
  {
    categoryName: 'Træning',
    keywords: ['træning', 'training', 'practice', 'øvelse', 'drill', 'session'],
    priority: 9,
  },
  {
    categoryName: 'Fysisk træning',
    keywords: ['fysisk', 'fitness', 'kondition', 'styrke', 'cardio', 'løb', 'gym', 'vægt'],
    priority: 8,
  },
  {
    categoryName: 'Taktik',
    keywords: ['taktik', 'tactics', 'strategi', 'strategy', 'analyse', 'video', 'gennemgang'],
    priority: 8,
  },
  {
    categoryName: 'Møde',
    keywords: ['møde', 'meeting', 'samtale', 'briefing', 'debriefing', 'evaluering'],
    priority: 7,
  },
  {
    categoryName: 'Holdsamling',
    keywords: ['holdsamling', 'team building', 'social', 'sammenkomst', 'event', 'fest'],
    priority: 7,
  },
  {
    categoryName: 'Lægebesøg',
    keywords: ['læge', 'doctor', 'fysioterapi', 'physio', 'behandling', 'skade', 'injury', 'sundhed'],
    priority: 6,
  },
  {
    categoryName: 'Rejse',
    keywords: ['rejse', 'travel', 'transport', 'bus', 'fly', 'flight', 'afgang', 'departure'],
    priority: 6,
  },
];

/**
 * Parse an activity name and determine the most appropriate category
 * @param activityName The name/title of the activity
 * @param userCategories List of user's existing categories
 * @param customKeywords Optional custom keyword mappings
 * @returns The best matching category or null if no match found
 */
export function parseActivityNameForCategory(
  activityName: string,
  userCategories: { id: string; name: string; color: string; emoji: string }[],
  customKeywords?: CategoryKeywords[]
): { categoryId: string; categoryName: string; confidence: number } | null {
  if (!activityName || !userCategories || userCategories.length === 0) {
    return null;
  }

  const normalizedName = activityName.toLowerCase().trim();
  const keywords = customKeywords || DEFAULT_CATEGORY_KEYWORDS;

  // Sort keywords by priority (highest first)
  const sortedKeywords = [...keywords].sort((a, b) => b.priority - a.priority);

  // Track all matches with their scores
  const matches: {
    category: { id: string; name: string; color: string; emoji: string };
    score: number;
    matchedKeyword: string;
  }[] = [];

  // Check each keyword set
  for (const keywordSet of sortedKeywords) {
    // Find matching user category by name (case-insensitive)
    const matchingCategory = userCategories.find(
      (cat) => cat.name.toLowerCase().trim() === keywordSet.categoryName.toLowerCase().trim()
    );

    if (!matchingCategory) {
      continue;
    }

    // Check if any keyword matches
    for (const keyword of keywordSet.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      
      // Exact word match (highest score)
      const wordBoundaryRegex = new RegExp(`\\b${normalizedKeyword}\\b`, 'i');
      if (wordBoundaryRegex.test(normalizedName)) {
        matches.push({
          category: matchingCategory,
          score: keywordSet.priority * 10 + 5, // Bonus for exact word match
          matchedKeyword: keyword,
        });
        continue;
      }

      // Partial match (lower score)
      if (normalizedName.includes(normalizedKeyword)) {
        matches.push({
          category: matchingCategory,
          score: keywordSet.priority * 10,
          matchedKeyword: keyword,
        });
      }
    }
  }

  // If no keyword matches, try direct category name matching
  if (matches.length === 0) {
    for (const category of userCategories) {
      const categoryNameLower = category.name.toLowerCase().trim();
      
      // Check if activity name contains category name
      if (normalizedName.includes(categoryNameLower)) {
        matches.push({
          category: category,
          score: 50, // Medium confidence for direct name match
          matchedKeyword: category.name,
        });
      }
    }
  }

  // Return the best match
  if (matches.length > 0) {
    // Sort by score (highest first)
    matches.sort((a, b) => b.score - a.score);
    const bestMatch = matches[0];

    // Calculate confidence (0-100)
    const maxPossibleScore = 100;
    const confidence = Math.min(100, Math.round((bestMatch.score / maxPossibleScore) * 100));

    console.log(`Activity "${activityName}" matched to category "${bestMatch.category.name}" (confidence: ${confidence}%, keyword: "${bestMatch.matchedKeyword}")`);

    return {
      categoryId: bestMatch.category.id,
      categoryName: bestMatch.category.name,
      confidence: confidence,
    };
  }

  console.log(`No category match found for activity "${activityName}"`);
  return null;
}

/**
 * Generate a suggested category name based on activity name
 * Used when no existing category matches
 */
export function suggestCategoryFromActivityName(activityName: string): {
  name: string;
  emoji: string;
  color: string;
} {
  const normalizedName = activityName.toLowerCase().trim();

  // Check against default keywords to suggest appropriate emoji and color
  for (const keywordSet of DEFAULT_CATEGORY_KEYWORDS) {
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

  // Default fallback
  return {
    name: activityName.split(' ')[0] || 'Aktivitet',
    emoji: '📌',
    color: '#4CAF50',
  };
}

/**
 * Get appropriate emoji for a category name
 */
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

/**
 * Get appropriate color for a category name
 */
function getCategoryColor(categoryName: string): string {
  const colorMap: { [key: string]: string } = {
    'kamp': '#FFD700',        // Gold
    'træning': '#4CAF50',     // Green
    'fysisk træning': '#FF5722', // Red-Orange
    'taktik': '#2196F3',      // Blue
    'møde': '#9C27B0',        // Purple
    'holdsamling': '#FF9800', // Orange
    'lægebesøg': '#F44336',   // Red
    'rejse': '#00BCD4',       // Cyan
  };

  return colorMap[categoryName.toLowerCase()] || '#4CAF50';
}
