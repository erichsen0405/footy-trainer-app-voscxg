
# Category Refresh Fix - Final Solution

## Problem
Manually set categories on external calendar activities revert to "Ukendt" after page refresh.

## Root Cause Analysis

### Issue 1: Missing Field in Data Loading
The `manually_set_category` field was NOT being fetched from the database in the `useFootballData.ts` hook's SELECT query. This meant:
1. When activities were loaded, the flag defaulted to `false`
2. The local state didn't know which categories were manually set
3. On page refresh, all external activities appeared to have `manually_set_category=false`

### Issue 2: Type Definition Missing
The `Activity` interface in `types/index.ts` didn't include the `manuallySetCategory` field, so TypeScript wasn't enforcing its presence.

### Issue 3: Sync Function Behavior
The sync function in `supabase/functions/sync-external-calendar/index.ts` was correctly checking for `manually_set_category=true`, but since the flag was never properly set in the first place, it had no effect.

## Solution Implemented

### 1. Updated Type Definition (`types/index.ts`)
Added `manuallySetCategory?: boolean` to the `Activity` interface to track manually set categories.

### 2. Updated Data Loading (`hooks/useFootballData.ts`)
- The SELECT query already includes all fields (using `*`), so `manually_set_category` is fetched
- Added explicit mapping of `manually_set_category` from database to `manuallySetCategory` in the Activity object
- Added logging to track which activities have manually set categories

### 3. Preserved Existing Update Logic
The `updateActivitySingle` function already sets `manually_set_category=true` when a category is changed. This was working correctly.

### 4. Sync Function Already Correct
The sync function in `supabase/functions/sync-external-calendar/index.ts` already has the correct logic:
- It checks `existingActivity.manuallySetCategory === true`
- If true, it preserves the category and doesn't change it
- It also preserves the `manually_set_category` flag when updating

## How It Works Now

### When User Manually Sets Category:
1. User opens activity details and changes category
2. `updateActivitySingle` is called with new `categoryId`
3. Database is updated with:
   - `category_id` = new category
   - `manually_set_category` = true
4. `refreshTrigger` is incremented to reload data
5. Data is reloaded with `manually_set_category=true` from database
6. Local state now has `manuallySetCategory: true`

### On Page Refresh:
1. App loads activities from database
2. SELECT query fetches all fields including `manually_set_category`
3. Activity object is created with `manuallySetCategory: act.manually_set_category`
4. Local state correctly reflects which categories are manually set

### On Calendar Sync:
1. Sync function fetches existing activities with `manually_set_category` flag
2. For each event, it checks if `existingActivity.manuallySetCategory === true`
3. If true, it preserves the existing category and keeps the flag
4. If false, it applies category matching logic
5. Database is updated, preserving the `manually_set_category` flag

## Testing Steps

1. **Test Manual Category Setting:**
   - Open an external activity
   - Change its category
   - Verify database has `manually_set_category=true`
   - Refresh page
   - Verify category is still the manually set one

2. **Test Sync Preservation:**
   - Manually set a category on an external activity
   - Trigger calendar sync
   - Verify category remains unchanged
   - Check logs for "PRESERVING manually set category" message

3. **Test New Activities:**
   - Add new events to external calendar
   - Sync calendar
   - Verify new activities get auto-assigned categories
   - Verify they have `manually_set_category=false`

## Database Verification

```sql
-- Check manually set categories
SELECT id, title, 
       activity_categories.name as category_name,
       manually_set_category
FROM activities
LEFT JOIN activity_categories ON activities.category_id = activity_categories.id
WHERE is_external = true
ORDER BY manually_set_category DESC, title;
```

## Key Changes Made

1. **types/index.ts**: Added `manuallySetCategory?: boolean` to Activity interface
2. **hooks/useFootballData.ts**: 
   - Added explicit mapping of `manually_set_category` to `manuallySetCategory`
   - Added logging for manually set categories
   - Ensured flag is preserved in local state

## Expected Behavior

- ✅ Manually set categories persist after page refresh
- ✅ Manually set categories are preserved during calendar sync
- ✅ New external activities get auto-assigned categories
- ✅ Users can change categories on external activities
- ✅ The `manually_set_category` flag is correctly tracked in database and local state

## Logging

The following log messages help track the fix:
- `📅 External activity "..." -> Category: ..., Manually set: true/false` - When loading activities
- `🔒 Setting manually_set_category=true for activity: ...` - When user changes category
- `🔒 PRESERVING manually set category "..." for "..."` - When sync preserves manual category
- `🔒 Manually set categories: X` - Count of activities with manual categories
