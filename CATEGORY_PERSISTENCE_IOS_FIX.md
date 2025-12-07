
# iOS Category Persistence Fix

## Problem Summary

Categories assigned manually to external calendar activities were being reset on iOS but not on web. This was particularly noticeable after:
- Pull-to-refresh
- App coming to foreground from background
- Any calendar sync operation

## Root Cause Analysis

### Why iOS was affected but not Web

1. **App Lifecycle Differences:**
   - iOS apps have aggressive lifecycle management (background/foreground transitions)
   - Web apps don't have the same lifecycle events
   - The `AppState` listener in `useFootballData.ts` triggers data refreshes on iOS when the app becomes active

2. **The Missing Flag:**
   - The `manually_set_category` flag exists in the database but wasn't being set to `true` when users manually changed categories
   - When sync ran, it couldn't distinguish between auto-assigned and manually-set categories
   - All categories were treated as auto-assigned and could be overwritten

3. **Race Condition:**
   - iOS triggers more frequent syncs due to app lifecycle events
   - Each sync would check the `manually_set_category` flag
   - Since the flag was always `false`, categories would be reset

## The Fix

### 1. Updated `updateActivitySingle` in `hooks/useFootballData.ts`

**Before:**
```typescript
if (updates.categoryId !== undefined) {
  updateData.category_id = updates.categoryId;
  console.log('📝 Updating category to:', updates.categoryId);
}
```

**After:**
```typescript
if (updates.categoryId !== undefined) {
  updateData.category_id = updates.categoryId;
  
  // If this is an external activity, mark the category as manually set
  if (isExternal) {
    updateData.manually_set_category = true;
    console.log('🔒 Setting manually_set_category = true for external activity');
  }
  
  console.log('📝 Updating category to:', updates.categoryId);
}
```

**Key Changes:**
- Detects if the activity is external
- Sets `manually_set_category = true` when updating the category
- Adds logging to track the flag status

### 2. Enhanced Edge Function Logging

Updated `sync-external-calendar/index.ts` to:
- Fetch and log the `manually_set_category` flag for each activity
- Explicitly preserve categories when the flag is `true`
- Provide detailed logging showing which categories are preserved vs. updated
- Track statistics on manually-set categories

**Key Improvements:**
```typescript
// Fetch with manually_set_category flag
const { data: existingActivities } = await supabaseClient
  .from('activities')
  .select('id, external_event_id, category_id, manually_set_category, activity_categories(name)')
  .eq('external_calendar_id', calendarId)
  .eq('user_id', user.id);

// Preserve the flag when updating
return {
  ...baseActivityData,
  id: existingActivity.id,
  category_id: existingActivity.categoryId, // Always keep existing category
  manually_set_category: existingActivity.manuallySetCategory, // Preserve the flag
};
```

### 3. Enhanced Logging

Added comprehensive logging throughout the data flow:

**In `useFootballData.ts`:**
```typescript
if (act.is_external) {
  const manuallySet = act.manually_set_category ? '✅ MANUAL' : '❌ AUTO';
  console.log(`📅 External activity "${act.title}" -> Category: ${category.name} (${category.emoji}) [${manuallySet}]`);
}
```

**In Edge Function:**
```typescript
const manualFlag = activity.manually_set_category ? '🔒 MANUAL' : '🔓 AUTO';
console.log(`  📌 "${eventIdShort}..." -> Category: "${activity.activity_categories?.name || 'Unknown'}" [${manualFlag}]`);
```

## Testing the Fix

### On iOS:

1. **Manual Category Assignment:**
   ```
   - Open an external activity
   - Change its category
   - Check logs for: "🔒 Setting manually_set_category = true"
   ```

2. **Pull-to-Refresh:**
   ```
   - Assign a category manually
   - Pull down to refresh
   - Verify category is preserved
   - Check logs for: "🛡️ Category was manually set - PRESERVING it"
   ```

3. **App Background/Foreground:**
   ```
   - Assign a category manually
   - Put app in background
   - Bring app to foreground
   - Verify category is preserved
   ```

4. **Calendar Sync:**
   ```
   - Assign a category manually
   - Trigger a calendar sync
   - Verify category is preserved
   - Check Edge Function logs for preservation messages
   ```

### Expected Log Output:

**When updating category:**
```
🔄 Updating single activity: <id> { categoryId: '<new-category-id>' }
📝 Updating category to: <new-category-id>
🔒 Setting manually_set_category = true for external activity
✅ Activity updated successfully
   - category_id: <new-category-id>
   - category name: <category-name>
   - manually_set_category: true
```

**During sync:**
```
📌 "<event-id>..." -> Category: "<category-name>" [🔒 MANUAL]
   ✅ Found existing activity in database
   📊 Current category: "<category-name>"
   🔒 Manually set: true
   🛡️ Category was manually set - PRESERVING it
```

## Database Schema

The `manually_set_category` column in the `activities` table:
```sql
manually_set_category boolean DEFAULT false
```

This flag indicates whether a user has manually assigned a category to an external activity.

## Verification Queries

Check if the flag is being set correctly:

```sql
-- Check external activities with manually set categories
SELECT 
  id, 
  title, 
  category_id, 
  manually_set_category,
  updated_at
FROM activities
WHERE is_external = true
  AND manually_set_category = true
ORDER BY updated_at DESC;

-- Count manually vs. auto-assigned categories
SELECT 
  manually_set_category,
  COUNT(*) as count
FROM activities
WHERE is_external = true
GROUP BY manually_set_category;
```

## Platform-Specific Behavior

### iOS
- ✅ Categories now persist across app lifecycle events
- ✅ Pull-to-refresh preserves manually set categories
- ✅ Background/foreground transitions don't reset categories
- ✅ Calendar syncs respect manually set categories

### Web
- ✅ Already worked correctly (fewer lifecycle events)
- ✅ Now has consistent behavior with iOS
- ✅ Same logging and flag management

## Future Improvements

1. **UI Indicator:** Add a visual indicator in the UI showing which categories are manually set vs. auto-assigned
2. **Bulk Operations:** Add ability to mark multiple activities' categories as manually set
3. **Reset Option:** Add option to reset a manually-set category back to auto-assignment
4. **Category Suggestions:** Show suggested categories based on activity name even for manually-set activities

## Related Files

- `hooks/useFootballData.ts` - Main data management hook
- `supabase/functions/sync-external-calendar/index.ts` - Calendar sync Edge Function
- `app/activity-details.tsx` - Activity detail screen where categories are changed
- `types/index.ts` - TypeScript type definitions

## Deployment Notes

1. Edge Function deployed as version 10
2. No database migration required (column already exists)
3. Existing activities will have `manually_set_category = false` by default
4. Users need to re-assign categories once for the flag to be set

## Rollback Plan

If issues occur, the fix can be rolled back by:
1. Reverting the Edge Function to version 9
2. Reverting the changes in `useFootballData.ts`
3. No database changes needed (flag can remain, just won't be used)
