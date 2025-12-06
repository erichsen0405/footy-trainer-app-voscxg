
# Intelligent Category Assignment via Name Parsing

## Overview

External calendar activities now support **intelligent category assignment** through activity name parsing. When external calendars don't provide explicit categories, the system automatically analyzes activity names and assigns appropriate categories based on keywords.

## How It Works

### Three-Tier Category Assignment Strategy

1. **Explicit Category Mapping** (Highest Priority)
   - If the external calendar event has a category field, use it directly
   - Create mapping between external category and internal category
   - Store mapping for future use

2. **Name Parsing** (Medium Priority)
   - Parse activity name for keywords
   - Match keywords to existing user categories
   - Assign category with confidence score

3. **Intelligent Suggestion** (Fallback)
   - If no keyword match found, suggest new category based on activity name
   - Create new category with appropriate emoji and color
   - Use for current and future similar activities

## Keyword Categories

The system recognizes the following default categories and keywords:

### 🏆 Kamp (Match)
**Keywords:** kamp, match, game, turnering, tournament, finale, semifinale, kvartfinale
**Priority:** 10 (Highest)

### ⚽ Træning (Training)
**Keywords:** træning, training, practice, øvelse, drill, session
**Priority:** 9

### 💪 Fysisk træning (Physical Training)
**Keywords:** fysisk, fitness, kondition, styrke, cardio, løb, gym, vægt
**Priority:** 8

### 📋 Taktik (Tactics)
**Keywords:** taktik, tactics, strategi, strategy, analyse, video, gennemgang
**Priority:** 8

### 📅 Møde (Meeting)
**Keywords:** møde, meeting, samtale, briefing, debriefing, evaluering
**Priority:** 7

### 🤝 Holdsamling (Team Building)
**Keywords:** holdsamling, team building, social, sammenkomst, event, fest
**Priority:** 7

### 🏥 Lægebesøg (Medical)
**Keywords:** læge, doctor, fysioterapi, physio, behandling, skade, injury, sundhed
**Priority:** 6

### ✈️ Rejse (Travel)
**Keywords:** rejse, travel, transport, bus, fly, flight, afgang, departure
**Priority:** 6

## Matching Algorithm

### 1. Exact Word Boundary Match
- Highest confidence score
- Example: "Træning" in "Fodbold Træning" → ⚽ Træning

### 2. Partial Match
- Medium confidence score
- Example: "kamp" in "Pokalkamp" → 🏆 Kamp

### 3. Category Name Match
- Direct match with existing category names
- Example: Activity "Taktik møde" matches category "Taktik" → 📋 Taktik

## Examples

### Example 1: Training Activity
```
Activity Name: "Fodbold træning - U19"
Matched Category: ⚽ Træning
Confidence: 95%
Method: Name parsing (exact word match)
```

### Example 2: Match Activity
```
Activity Name: "Pokalkamp mod Brøndby"
Matched Category: 🏆 Kamp
Confidence: 100%
Method: Name parsing (partial match)
```

### Example 3: New Category Creation
```
Activity Name: "Holdmøde om strategi"
No existing match found
Created Category: 📅 Møde
Method: Intelligent suggestion
```

## Benefits

1. **Automatic Organization**
   - No manual category assignment needed
   - Activities are automatically organized

2. **Consistent Categorization**
   - Same keywords always map to same categories
   - Mappings are stored and reused

3. **Flexible & Extensible**
   - Works with any activity name
   - Creates new categories when needed

4. **Multi-Language Support**
   - Supports both Danish and English keywords
   - Easy to extend with more languages

## Usage

### Syncing External Calendar

When you sync an external calendar:

1. Click "Synkroniser" on any calendar
2. System analyzes each activity name
3. Assigns categories automatically
4. Shows detailed statistics:
   - Activities assigned via name parsing
   - Activities assigned via explicit categories
   - New categories created

### Viewing Category Mappings

1. Open External Calendar Manager
2. Click "Kategori-tildelinger" to expand
3. See all automatic mappings
4. Mappings show: External Category → Internal Category

## Technical Details

### Implementation Files

- **`utils/activityNameParser.ts`**: Core parsing logic
- **`supabase/functions/sync-external-calendar/index.ts`**: Edge Function with parsing
- **`components/ExternalCalendarManager.tsx`**: UI for viewing mappings

### Database Tables

- **`activities`**: Stores `external_category` field
- **`category_mappings`**: Stores external → internal category mappings
- **`activity_categories`**: User's categories

### Confidence Scoring

- **100%**: Exact word boundary match with highest priority keyword
- **95%**: Exact word boundary match with high priority keyword
- **80-90%**: Partial match with high priority keyword
- **50%**: Direct category name match
- **Lower**: Suggested new category

## Customization

To add custom keywords or categories, modify the `DEFAULT_CATEGORY_KEYWORDS` array in:
- `utils/activityNameParser.ts` (client-side)
- `supabase/functions/sync-external-calendar/index.ts` (server-side)

Example:
```typescript
{
  categoryName: 'Yoga',
  keywords: ['yoga', 'meditation', 'mindfulness', 'stretching'],
  priority: 7,
}
```

## Future Enhancements

Potential improvements:
- User-customizable keyword sets
- Machine learning for improved matching
- Multi-language keyword expansion
- Category suggestion learning from user corrections
