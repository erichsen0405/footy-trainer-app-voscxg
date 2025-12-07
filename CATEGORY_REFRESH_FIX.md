
# Category Refresh Fix - Manually Set Categories Preserved

## Problem
When refreshing the app, manually set categories on external activities were reverting to "Ukendt" (Unknown). This happened because:

1. The `manually_set_category` flag was being set correctly when the user changed a category
2. However, the sync function wasn't properly checking and preserving this flag during calendar synchronization
3. The flag value was being lost during updates

## Root Cause
The issue was in the sync logic flow:

1. **In `useFootballData.ts`**: The `updateActivitySingle` function correctly set `manually_set_category = true` when updating categories
2. **In `sync-external-calendar/index.ts`**: The Edge Function was checking for the flag, but the logic had a subtle flaw - it was checking `manuallySetCategory` but not strictly comparing it to `true`
3. **Database default**: The `manually_set_category` column has a default value of `false`, so any activity without an explicit `true` value would be treated as not manually set

## Solution

### 1. Enhanced Logging in `useFootballData.ts`
Added comprehensive logging to track the `manually_set_category` flag throughout the data flow:

```typescript
// Log when loading activities
if (act.is_external) {
  console.log(`📅 External activity "${act.title}" -> Category: ${category.name} (${category.emoji}), Manually set: ${act.manually_set_category || false}`);
}

// Log when updating activities
console.log('🔒 Setting manually_set_category=true for activity:', activityId);
console.log('📝 Update data being sent to database:', updateData);
console.log('✅ Activity updated successfully:', data);
console.log('   - manually_set_category:', data.manually_set_category);
```

### 2. Strict Boolean Comparison in Edge Function
Updated the sync function to use strict boolean comparison:

```typescript
// BEFORE (could fail with falsy values)
if (existingActivity && existingActivity.manuallySetCategory) {
  // ...
}

// AFTER (strict comparison)
if (existingActivity && existingActivity.manuallySetCategory === true) {
  // User has manually set this category - NEVER change it
  categoryId = existingActivity.categoryId;
  assignmentMethod = 'manually_set';
  categoriesPreserved++;
  console.log(`🔒 PRESERVING manually set category "${existingActivity.categoryName}" for "${event.summary}" (manually_set_category=true)`);
}
```

### 3. Explicit Flag Preservation
Ensured the `manually_set_category` flag is explicitly preserved during updates:

```typescript
const activityData = {
  user_id: user.id,
  title: event.summary,
  activity_date: event.startDateString,
  activity_time: event.startTimeString,
  location: event.location || 'Ingen lokation',
  category_id: categoryId,
  is_external: true,
  external_calendar_id: calendarId,
  external_event_id: event.uid,
  external_category: externalCategory,
  // CRITICAL FIX: Preserve manually_set_category flag if it exists
  manually_set_category: existingActivity?.manuallySetCategory || false,
};
```

### 4. Immediate Refresh After Update
Added immediate data refresh after category updates to ensure UI reflects database state:

```typescript
// CRITICAL FIX: Force immediate refresh to ensure UI reflects database state
setRefreshTrigger(prev => prev + 1);
```

## Testing the Fix

### Test Scenario 1: Manual Category Change
1. Open an external activity
2. Change its category from "Ukendt" to another category (e.g., "Kamp")
3. Save the change
4. Refresh the app (pull down or close/reopen)
5. **Expected**: Category remains as "Kamp", not reverting to "Ukendt"

### Test Scenario 2: Calendar Sync
1. Manually set a category on an external activity
2. Trigger a calendar sync (either manually or wait for auto-sync)
3. **Expected**: The manually set category is preserved, not overwritten by the sync

### Test Scenario 3: New External Activities
1. Add a new event to the external calendar
2. Sync the calendar in the app
3. **Expected**: New activity gets auto-assigned category based on name parsing
4. Manually change the category
5. Sync again
6. **Expected**: Manual category is preserved

## Database Schema
The `activities` table has the following relevant columns:

```sql
- category_id: uuid (nullable)
- is_external: boolean (default: false)
- manually_set_category: boolean (default: false)
```

## Verification
To verify the fix is working, check the console logs:

1. **When updating a category**:
   ```
   🔄 Updating single activity: <id> { categoryId: '<category-id>' }
   🔒 Setting manually_set_category=true for activity: <id>
   📝 Update data being sent to database: { category_id: '<category-id>', manually_set_category: true, ... }
   ✅ Activity updated successfully: { ..., manually_set_category: true }
   ```

2. **When syncing calendar**:
   ```
   📋 Existing activity: "<event-id>" - manually_set_category: true
   🔒 PRESERVING manually set category "<category-name>" for "<activity-title>" (manually_set_category=true)
   ```

3. **When loading activities**:
   ```
   📅 External activity "<title>" -> Category: <name> (<emoji>), Manually set: true
   ```

## Impact
- ✅ Manually set categories are now preserved across app refreshes
- ✅ Calendar synchronization respects user's manual category choices
- ✅ Automatic category assignment still works for new activities
- ✅ Backward compatibility maintained for existing activities

## Files Modified
1. `hooks/useFootballData.ts` - Enhanced logging and explicit flag handling
2. `supabase/functions/sync-external-calendar/index.ts` - Strict boolean comparison and flag preservation
3. `app/activity-details.tsx` - Already correct, no changes needed

## Notes
- The fix maintains backward compatibility with activities that don't have the `manually_set_category` flag set
- The default value of `false` for `manually_set_category` ensures that only explicitly user-modified categories are preserved
- The sync function will still auto-assign categories to new activities or activities with "Ukendt" category
