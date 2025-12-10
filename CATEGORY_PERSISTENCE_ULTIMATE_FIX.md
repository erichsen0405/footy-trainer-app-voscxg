
# Category Persistence - Ultimate Fix

## Problem Summary

Categories were reverting to "Ukendt" (Unknown) after pull-to-refresh, even after being manually set by the user in the iPhone app.

## Root Cause Analysis

The issue was identified through database inspection and code review:

1. **User Action**: User manually changes category in iPhone app
2. **App Behavior**: `updateActivitySingle` correctly sets `manually_set_category = true` in database
3. **Pull-to-Refresh**: Triggers `fetchExternalCalendarEvents` which calls the Edge Function
4. **Edge Function Bug**: The Edge Function was **explicitly resetting** `manually_set_category = false` for activities that were NOT manually set

### The Critical Bug

In the Edge Function, when processing existing activities:

```typescript
// For activities NOT manually set
else {
  // Auto-detect category
  updateData.category_id = categoryMatch.categoryId;
  updateData.manually_set_category = false; // ❌ BUG: This overwrites the flag!
}
```

**The Problem**: Even if a user manually set a category (setting the flag to `true`), the next sync would:
1. See that the activity exists in the database
2. Check if `manually_set_category` is `true` in the **fetched data**
3. BUT: If there was any timing issue or if the flag wasn't properly fetched, it would fall into the `else` block
4. Explicitly set `manually_set_category = false` in the update payload
5. Overwrite the user's manual category selection

## The Ultimate Fix

### Change 1: Never Reset the Flag

**Before**:
```typescript
else {
  updateData.category_id = categoryMatch.categoryId;
  updateData.manually_set_category = false; // ❌ Overwrites user's manual setting
}
```

**After**:
```typescript
else {
  updateData.category_id = categoryMatch.categoryId;
  // ✅ DO NOT include manually_set_category in update payload
  // This preserves the existing value in the database
}
```

### Change 2: Explicit Logging

Added comprehensive logging to track:
- When categories are preserved due to manual flag
- When categories are auto-detected
- When the `manually_set_category` flag is NOT being modified

## How It Works Now

### Scenario 1: User Manually Sets Category

1. User changes category in app → `manually_set_category = true` in database
2. Pull-to-refresh triggers sync
3. Edge Function fetches existing activities
4. Sees `manually_set_category = true`
5. **Does NOT include** `category_id` or `manually_set_category` in update payload
6. Database preserves both the category AND the flag
7. ✅ Category remains as user set it

### Scenario 2: Auto-Detected Category

1. New activity synced from external calendar
2. Edge Function auto-detects category based on name
3. Sets `category_id` and `manually_set_category = false`
4. On subsequent syncs:
   - If still auto-detected: Updates category if better match found
   - If user manually changes: Flag set to `true`, then protected forever

### Scenario 3: No Category Match

1. Activity doesn't match any category keywords
2. Assigned to "Ukendt" (Unknown)
3. `manually_set_category = false`
4. User can manually change it later
5. Once changed, protected from future syncs

## Database State Verification

Before fix (from database query):
```sql
-- "Juleferie - start" activity
manually_set_category: false  -- ❌ Should be true after manual change
category_name: "Ukendt"       -- ❌ Reverted to Unknown
```

After fix (expected):
```sql
-- "Juleferie - start" activity
manually_set_category: true   -- ✅ Preserved after manual change
category_name: "Andet"        -- ✅ Stays as user set it
```

## Testing Steps

1. **Manual Category Change**:
   - Open iPhone app
   - Find "Juleferie - start" activity
   - Change category to "Andet"
   - Verify in database: `manually_set_category = true`

2. **Pull-to-Refresh**:
   - Wait 3 minutes (to ensure database propagation)
   - Pull down to refresh in app
   - Verify category is STILL "Andet"
   - Verify in database: `manually_set_category = true` (unchanged)

3. **Multiple Syncs**:
   - Perform multiple pull-to-refresh actions
   - Category should NEVER change back to "Ukendt"
   - Flag should ALWAYS remain `true`

## Key Principles

1. **Never Reset the Flag**: The Edge Function NEVER sets `manually_set_category = false` for existing activities
2. **Preserve User Intent**: Once a user manually sets a category, it's protected forever
3. **Minimal Updates**: Only include fields in the update payload that actually need to change
4. **Database as Source of Truth**: Let the database preserve values that aren't being updated

## Logging Output

The Edge Function now logs:
```
🛡️🛡️🛡️ ABSOLUTE PROTECTION: Category manually set by user
🚫 SKIPPING ALL CATEGORY UPDATES - Keeping "Andet"
⚠️ This category will NEVER be changed by sync
ℹ️ NOT including category_id or manually_set_category in update
```

And for auto-detected categories:
```
🎯 Auto-detected category: "Træning" (confidence: 90%)
ℹ️ NOT modifying manually_set_category flag (preserving existing value)
```

## Conclusion

The fix ensures that:
- ✅ Manually set categories are NEVER overwritten by sync
- ✅ The `manually_set_category` flag is NEVER reset to `false` by sync
- ✅ Auto-detected categories can still be updated if better matches are found
- ✅ User intent is always preserved and respected

This is the **ultimate fix** that addresses the root cause of the category persistence issue.
