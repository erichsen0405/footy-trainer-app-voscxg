
# Category Revert Issue - Final Solution

## Problem Summary
When users manually set a category on an external activity and then performed a pull-to-refresh, the category would revert back to "Ukendt" (Unknown). This happened even though the `manually_set_category` flag was being set and read correctly.

## Root Cause
The issue was in the `sync-external-calendar` Edge Function. While it correctly:
1. Read the `manually_set_category` flag from the database
2. Preserved the flag during updates

It was **still updating the `category_id` field** even when `manually_set_category=true`. This meant that the category would be recalculated and overwritten during every sync, regardless of the flag.

## The Fix

### 1. Edge Function Update (`supabase/functions/sync-external-calendar/index.ts`)

**Before:**
```typescript
const activityData = {
  user_id: user.id,
  title: event.summary,
  activity_date: event.startDateString,
  activity_time: event.startTimeString,
  location: event.location || 'Ingen lokation',
  category_id: categoryId, // ❌ Always updated, even if manually set
  is_external: true,
  external_calendar_id: calendarId,
  external_event_id: event.uid,
  external_category: externalCategory,
  manually_set_category: existingActivity?.manuallySetCategory || false,
};
```

**After:**
```typescript
const baseActivityData = {
  user_id: user.id,
  title: event.summary,
  activity_date: event.startDateString,
  activity_time: event.startTimeString,
  location: event.location || 'Ingen lokation',
  is_external: true,
  external_calendar_id: calendarId,
  external_event_id: event.uid,
  external_category: externalCategory,
};

if (existingActivity) {
  if (existingActivity.manuallySetCategory === true) {
    // ✅ Do NOT update category_id if manually set
    return {
      ...baseActivityData,
      id: existingActivity.id,
      category_id: existingActivity.categoryId, // Keep existing category
      manually_set_category: true,
    };
  } else {
    // Update category normally
    return {
      ...baseActivityData,
      id: existingActivity.id,
      category_id: categoryId,
      manually_set_category: false,
    };
  }
}
```

### 2. Enhanced Logging

Added detailed logging to track category updates:
- Log when categories are preserved due to `manually_set_category=true`
- Log the category ID being used for each activity
- Log the manually_set_category flag value during updates

## How It Works Now

### When User Manually Sets Category:
1. User opens activity details and changes category
2. `updateActivitySingle` is called with new `categoryId`
3. Database is updated with:
   - `category_id` = new category
   - `manually_set_category` = true
4. Activity is refreshed in UI

### When Pull-to-Refresh Happens:
1. `fetchExternalCalendarEvents` is called
2. `sync-external-calendar` Edge Function runs
3. For each activity:
   - Check if `manually_set_category=true`
   - **If YES**: Keep existing `category_id`, do NOT recalculate
   - **If NO**: Calculate category based on name parsing/explicit categories
4. Activities are updated in database
5. UI refreshes with preserved categories

## Testing Checklist

✅ **Test 1: Manual Category Assignment**
- Open an external activity
- Change category from "Ukendt" to "Træning"
- Verify category is saved
- Check logs show `manually_set_category=true`

✅ **Test 2: Pull-to-Refresh Preservation**
- After Test 1, perform pull-to-refresh
- Verify category stays as "Træning"
- Check logs show "Skipping category_id update for manually set activity"

✅ **Test 3: New External Activities**
- Add a new event to external calendar
- Sync calendar
- Verify new activity gets auto-assigned category
- Verify `manually_set_category=false`

✅ **Test 4: Multiple Refreshes**
- Manually set category on activity
- Perform multiple pull-to-refreshes
- Verify category never reverts

## Database Schema

The `activities` table includes:
```sql
- category_id: uuid (foreign key to activity_categories)
- manually_set_category: boolean (default: false)
```

When `manually_set_category=true`, the category is "locked" and will not be changed by automatic sync operations.

## Key Files Modified

1. **supabase/functions/sync-external-calendar/index.ts**
   - Modified activity data building logic
   - Added conditional category_id handling
   - Enhanced logging

2. **hooks/useFootballData.ts**
   - Already correctly sets `manually_set_category=true` when user updates category
   - Enhanced logging for debugging

3. **app/activity-details.tsx**
   - Already uses `updateActivitySingle` for category updates
   - No changes needed

## Logging Output

When working correctly, you should see logs like:

```
🔒 PRESERVING manually set category "Træning" for "Fodboldtræning" (manually_set_category=true)
🔒 Skipping category_id update for manually set activity: Fodboldtræning
🔄 Updating activity abc-123:
   - Title: Fodboldtræning
   - Category ID: def-456
   - Manually set: true
✅ Updated activity abc-123 successfully
```

## Summary

The fix ensures that once a user manually sets a category on an external activity, that category is **permanently preserved** across all future sync operations. The `manually_set_category` flag acts as a "lock" that prevents automatic category recalculation.

This provides users with full control over their activity categories while still allowing automatic categorization for new activities.
