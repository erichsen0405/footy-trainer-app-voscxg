
# Category Sync Simplified - Implementation Summary

## Problem
The previous approach tried to preserve manually set categories during sync using a `manually_set_category` flag, but this was causing race conditions and unreliable behavior. Categories would sometimes revert to "Ukendt" even after being manually set.

## Solution
We've completely removed the automatic category assignment logic from the sync function. Now:

1. **New external activities** are assigned the "Ukendt" (Unknown) category
2. **Existing external activities** keep their current category - the sync function NEVER changes it
3. **No automatic category inference** - no name parsing, no keyword matching, no category mappings
4. **Users set categories manually** - and they stay that way

## Changes Made

### 1. Edge Function (`sync-external-calendar`)
- Removed all category assignment logic (name parsing, keyword matching, explicit category mapping)
- Removed `manually_set_category` flag handling
- New activities get "Ukendt" category by default
- Existing activities preserve their current category_id without any checks or conditions
- Simplified logging to reflect the new behavior

### 2. Frontend Hook (`useFootballData.ts`)
- Removed `pendingUpdates` state tracking
- Removed `manually_set_category` flag from activity loading
- Simplified `updateActivitySingle` to just update the category without setting any flags
- Removed race condition mitigation delays (no longer needed)
- Cleaned up logging

### 3. Type Definition (`types/index.ts`)
- Removed `manuallySetCategory` field from Activity interface

## How It Works Now

### Sync Behavior
```
New Activity:
  → Assigned "Ukendt" category
  → User can change it manually

Existing Activity:
  → Category is NEVER touched by sync
  → Only title, date, time, location are updated
  → User's category choice is always preserved
```

### Manual Category Update
```typescript
// User changes category
updateActivitySingle(activityId, { categoryId: newCategoryId })

// This updates the category in the database
// Next sync will preserve this category
```

## Benefits

1. **Simpler Logic**: No complex flag tracking or race condition handling
2. **Predictable Behavior**: Categories never change unexpectedly
3. **User Control**: Users have full control over categories
4. **No Race Conditions**: No conflicts between manual updates and auto-sync
5. **Easier to Understand**: Clear separation between sync (data) and categorization (user choice)

## Migration Notes

- Existing activities keep their current categories
- The `manually_set_category` column in the database is no longer used (but can remain for backward compatibility)
- No data migration needed - everything continues to work

## Testing

To verify the fix:
1. Import external calendar activities (they get "Ukendt" category)
2. Manually change a category on an external activity
3. Pull to refresh (trigger sync)
4. Verify the category stays as you set it
5. Repeat multiple times - category should never change

## Future Considerations

If automatic category assignment is desired in the future, it should be:
- A separate, explicit user action (e.g., "Auto-categorize all Ukendt activities")
- Never run automatically during sync
- Always respect user's manual choices
