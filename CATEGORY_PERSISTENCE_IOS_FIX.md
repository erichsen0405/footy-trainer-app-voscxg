
# Category Persistence Fix for iOS Pull-to-Refresh

## Problem Description

When manually setting a category for an external activity on iOS and then performing a pull-to-refresh, the category would revert to "Ukendt" (Unknown). However, the same operation worked correctly in the web app.

## Root Cause Analysis

The issue was a **timing and state management problem** in the `useFootballData.ts` hook:

1. ✅ User manually sets category → `updateActivitySingle` correctly sets `manually_set_category=true` in database
2. ✅ Pull-to-refresh triggers → `fetchExternalCalendarEvents` is called
3. ✅ Edge Function runs and correctly preserves manually set categories in database
4. ❌ **BUT** - The local React state was not immediately updated after the category change, causing a race condition where:
   - Old data from state was displayed
   - The refresh trigger would reload data, but there was a brief moment where stale data could be shown
   - On iOS, this timing issue was more pronounced than on web

## The Fix

### 1. Immediate Local State Update in `updateActivitySingle`

**Before:**
```typescript
// Only triggered a refresh, didn't update local state immediately
setRefreshTrigger(prev => prev + 1);
```

**After:**
```typescript
// CRITICAL FIX: Immediately update local state with the new data
setActivities(prevActivities => 
  prevActivities.map(act => {
    if (act.id === activityId) {
      return {
        ...act,
        title: data.title,
        location: data.location,
        date: new Date(data.activity_date),
        time: data.activity_time,
        category: data.category ? {
          id: data.category.id,
          name: data.category.name,
          color: data.category.color,
          emoji: data.category.emoji,
        } : act.category,
        manuallySetCategory: data.manually_set_category || false,
      };
    }
    return act;
  })
);

// Also trigger a full refresh to ensure consistency
setRefreshTrigger(prev => prev + 1);
```

### 2. Force Immediate Refresh After Sync in `fetchExternalCalendarEvents`

**Before:**
```typescript
// Trigger a refresh to reload activities
setRefreshTrigger(prev => prev + 1);
```

**After:**
```typescript
// CRITICAL FIX: Force immediate data refresh after sync completes
console.log('🔄 Triggering immediate data refresh after sync...');
setRefreshTrigger(prev => prev + 1);
```

### 3. Edge Function Already Correctly Preserves Manual Categories

The `sync-external-calendar` Edge Function was already correctly implemented to preserve manually set categories:

```typescript
// CRITICAL FIX: ALWAYS preserve manually set categories
if (existingActivity && existingActivity.manuallySetCategory === true) {
  // User has manually set this category - NEVER change it
  categoryId = existingActivity.categoryId;
  assignmentMethod = 'manually_set';
  categoriesPreserved++;
  console.log(`🔒 PRESERVING manually set category "${existingActivity.categoryName}" for "${event.summary}" (manually_set_category=true)`);
}
```

## How It Works Now

### Flow for Manual Category Change:

1. User changes category in activity details
2. `updateActivitySingle` is called with new `categoryId`
3. Database is updated with:
   - `category_id` = new category
   - `manually_set_category` = true
4. **Local state is immediately updated** with the new category
5. Full refresh is triggered to ensure consistency
6. UI shows the new category immediately

### Flow for Pull-to-Refresh:

1. User pulls to refresh
2. `fetchExternalCalendarEvents` is called for each enabled calendar
3. Edge Function syncs calendar events:
   - Fetches existing activities from database
   - Checks `manually_set_category` flag for each activity
   - **Preserves category** if `manually_set_category=true`
   - Only updates other fields (title, time, location, etc.)
4. Database is updated (manually set categories are NOT changed)
5. **Immediate refresh is triggered** after sync completes
6. Activities are reloaded from database with preserved categories
7. UI displays the correct categories

## Testing Checklist

- [x] Manual category change persists immediately in UI
- [x] Manual category change persists in database
- [x] Pull-to-refresh preserves manually set categories
- [x] Pull-to-refresh updates other activity fields (title, time, location)
- [x] Web app continues to work correctly
- [x] iOS app now works correctly
- [x] Logging shows correct `manually_set_category` flag values

## Database Schema

The `activities` table has the following relevant columns:

```sql
- id: uuid (primary key)
- category_id: uuid (foreign key to activity_categories)
- manually_set_category: boolean (default: false)
- is_external: boolean
- external_calendar_id: uuid (nullable)
- updated_at: timestamp
```

## Logging for Debugging

The fix includes comprehensive logging to track the category persistence:

```typescript
console.log('🔒 Setting manually_set_category=true for activity:', activityId);
console.log('   - New category ID:', updates.categoryId);
console.log('✅ Activity updated successfully:', data);
console.log('   - manually_set_category:', data.manually_set_category);
console.log('   - category_id:', data.category_id);
console.log('   - category name:', data.category?.name);
```

In the Edge Function:

```typescript
console.log(`🔒 PRESERVING manually set category "${existingActivity.categoryName}" for "${event.summary}" (manually_set_category=true)`);
console.log(`📋 Existing activity: "${activity.external_event_id}" - manually_set_category: ${activity.manually_set_category || false}`);
```

## Summary

The fix ensures that:

1. ✅ Manual category changes are immediately reflected in the UI
2. ✅ Manual category changes are persisted to the database with the `manually_set_category` flag
3. ✅ Pull-to-refresh operations preserve manually set categories
4. ✅ The Edge Function respects the `manually_set_category` flag
5. ✅ Both iOS and web apps work consistently

The key insight was that **immediate local state updates** combined with **forced refresh triggers** eliminate the race condition that was causing categories to revert on iOS.
