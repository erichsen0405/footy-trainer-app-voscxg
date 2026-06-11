export interface ActivityCategoryCandidate {
  id: string;
  name: string;
  color?: string | null;
  emoji?: string | null;
  user_id?: string | null;
  is_system?: boolean | null;
  player_id?: string | null;
  source_category_id?: string | null;
  club_id?: string | null;
}

export interface CategoryMappingRecord {
  external_category: string;
  internal_category_id: string;
}

export interface CategoryResolution {
  category: ActivityCategoryCandidate;
  confidence: number;
  reason: 'external-mapping' | 'keyword-match' | 'name-match';
  matchedValue: string;
}

export interface ResolveCategoryOptions {
  title: string;
  categories: ActivityCategoryCandidate[];
  externalCategories?: string[];
  categoryMappings?: CategoryMappingRecord[];
  customKeywords?: CategoryKeywords[];
}

export interface CategoryKeywords {
  categoryName: string;
  keywords: string[];
  priority: number;
}

const DEFAULT_CATEGORY_KEYWORDS: CategoryKeywords[] = [
  {
    categoryName: 'Match',
    keywords: ['kamp', 'match', 'game', 'turnering', 'tournament', 'finale', 'semifinale', 'kvartfinale', 'vs', '-'],
    priority: 10,
  },
  {
    categoryName: 'Training',
    keywords: ['træning', 'training', 'practice', 'øvelse', 'drill', 'session'],
    priority: 9,
  },
  {
    categoryName: 'Physical training',
    keywords: ['fysisk', 'fitness', 'kondition', 'styrke', 'cardio', 'løb', 'gym', 'vægt'],
    priority: 8,
  },
  {
    categoryName: 'Tactics',
    keywords: ['taktik', 'tactics', 'strategi', 'strategy', 'analyse', 'video', 'gennemgang', 'videomøde', 'videomode'],
    priority: 8,
  },
  {
    categoryName: 'Meeting',
    keywords: ['møde', 'mode', 'meeting', 'samtale', 'briefing', 'debriefing', 'evaluering', 'forældremøde', 'spillermøde', 'videomøde'],
    priority: 7,
  },
  {
    categoryName: 'Team gathering',
    keywords: ['holdsamling', 'team building', 'social', 'sammenkomst', 'event', 'fest'],
    priority: 7,
  },
  {
    categoryName: 'Medical appointment',
    keywords: ['læge', 'doctor', 'fysioterapi', 'physio', 'behandling', 'skade', 'injury', 'sundhed'],
    priority: 6,
  },
  {
    categoryName: 'Travel',
    keywords: ['rejse', 'travel', 'transport', 'bus', 'fly', 'flight', 'afgang', 'departure'],
    priority: 6,
  },
];

const SOURCE_SUFFIX_PATTERN = /\s*\((?:club|from coach|klub|fra træner)\)\s*$/i;

const CATEGORY_NAME_ALIASES: Record<string, string[]> = {
  kamp: ['match'],
  match: ['kamp'],
  'træning': ['training'],
  training: ['træning'],
  'fysisk træning': ['physical training'],
  'physical training': ['fysisk træning'],
  taktik: ['tactics'],
  tactics: ['taktik'],
  'møde': ['meeting'],
  meeting: ['møde'],
  holdsamling: ['team gathering'],
  'team gathering': ['holdsamling'],
  'lægebesøg': ['medical appointment'],
  'medical appointment': ['lægebesøg'],
  rejse: ['travel'],
  travel: ['rejse'],
};

export function stripCategorySourceSuffix(name: string | null | undefined): string {
  return (name ?? '').replace(SOURCE_SUFFIX_PATTERN, '').trim();
}

function getCategoryNameAliases(category: ActivityCategoryCandidate): string[] {
  const aliases = new Set<string>();
  const normalizedName = normalizeString(category.name);
  const normalizedBaseName = normalizeString(stripCategorySourceSuffix(category.name));

  if (normalizedName) {
    aliases.add(normalizedName);
  }

  if (normalizedBaseName) {
    aliases.add(normalizedBaseName);
  }

  [...aliases].forEach((alias) => {
    CATEGORY_NAME_ALIASES[alias]?.forEach((translatedAlias) => {
      aliases.add(normalizeString(translatedAlias));
    });
  });

  return Array.from(aliases);
}

function getCategoryPriority(category: ActivityCategoryCandidate): number {
  if (!!category.user_id && !category.is_system && !category.source_category_id) {
    return 40;
  }

  if (!!category.user_id && !category.is_system && !!category.source_category_id) {
    return 35;
  }

  if (!!category.player_id && !category.is_system) {
    return 30;
  }

  if (!category.is_system) {
    return 20;
  }

  return 10;
}

function buildCategoryLookups(categories: ActivityCategoryCandidate[]) {
  const byId = new Map<string, ActivityCategoryCandidate>();
  const byName = new Map<string, ActivityCategoryCandidate>();

  categories.forEach((category) => {
    byId.set(category.id, category);

    getCategoryNameAliases(category).forEach((normalizedName) => {
      const existing = byName.get(normalizedName);

      if (!existing) {
        byName.set(normalizedName, category);
        return;
      }

      if (getCategoryPriority(category) > getCategoryPriority(existing)) {
        byName.set(normalizedName, category);
      }
    });
  });

  return { byId, byName };
}

function normalizeString(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim();
}

export function resolveActivityCategory(options: ResolveCategoryOptions): CategoryResolution | null {
  const { title, categories, externalCategories, categoryMappings, customKeywords } = options;

  if (!title || !categories || categories.length === 0) {
    return null;
  }

  const normalizedTitle = normalizeString(title);
  const { byId, byName } = buildCategoryLookups(categories);

  if (externalCategories && externalCategories.length > 0 && categoryMappings && categoryMappings.length > 0) {
    const mappingLookup = new Map<string, string>();
    categoryMappings.forEach((mapping) => {
      mappingLookup.set(normalizeString(mapping.external_category), mapping.internal_category_id);
    });

    for (const externalCategory of externalCategories) {
      const normalizedExternal = normalizeString(externalCategory);
      const mappedId = mappingLookup.get(normalizedExternal);

      if (mappedId) {
        const matchedCategory = byId.get(mappedId);
        if (matchedCategory) {
          return {
            category: matchedCategory,
            confidence: 100,
            reason: 'external-mapping',
            matchedValue: externalCategory,
          };
        }
      }
    }
  }

  const keywordDefinitions = (customKeywords && customKeywords.length > 0
    ? customKeywords
    : DEFAULT_CATEGORY_KEYWORDS).slice().sort((a, b) => b.priority - a.priority);

  const keywordMatches: { category: ActivityCategoryCandidate; score: number; matchedKeyword: string }[] = [];

  keywordDefinitions.forEach((definition) => {
    const category = byName.get(normalizeString(definition.categoryName));
    if (!category) {
      return;
    }

    definition.keywords.forEach((keyword) => {
      const normalizedKeyword = normalizeString(keyword);
      if (!normalizedKeyword) {
        return;
      }

      const wordBoundaryRegex = new RegExp(`\\b${normalizedKeyword.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
      if (wordBoundaryRegex.test(normalizedTitle)) {
        keywordMatches.push({
          category,
          score: definition.priority * 10 + 5,
          matchedKeyword: keyword,
        });
        return;
      }

      if (normalizedTitle.includes(normalizedKeyword)) {
        keywordMatches.push({
          category,
          score: definition.priority * 10,
          matchedKeyword: keyword,
        });
      }
    });
  });

  if (keywordMatches.length > 0) {
    keywordMatches.sort((a, b) => b.score - a.score);
    const bestMatch = keywordMatches[0];

    return {
      category: bestMatch.category,
      confidence: Math.min(100, Math.round(bestMatch.score)),
      reason: 'keyword-match',
      matchedValue: bestMatch.matchedKeyword,
    };
  }

  for (const [name, category] of byName.entries()) {
    if (normalizedTitle.includes(name)) {
      return {
        category,
        confidence: 60,
        reason: 'name-match',
        matchedValue: category.name,
      };
    }
  }

  return null;
}

export function parseActivityNameForCategory(
  activityName: string,
  userCategories: ActivityCategoryCandidate[],
  customKeywords?: CategoryKeywords[]
): { categoryId: string; categoryName: string; confidence: number } | null {
  const resolution = resolveActivityCategory({
    title: activityName,
    categories: userCategories,
    customKeywords,
  });

  if (!resolution) {
    return null;
  }

  return {
    categoryId: resolution.category.id,
    categoryName: resolution.category.name,
    confidence: resolution.confidence,
  };
}

export { DEFAULT_CATEGORY_KEYWORDS };
