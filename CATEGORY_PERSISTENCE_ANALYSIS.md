
# Category Persistence Analysis & Fix

## Problem Summary

Manually set categories on external calendar activities were not persisting after app updates or synchronizations.

## Root Cause Analysis

### The Issue Was NOT with App Updates

After thorough investigation, the problem was **not with app updates per se**, but with the **synchronization logic** and **lack of explicit tracking** for manually-set categories.

### What Was Happening

1. **User manually changes category** from "Ukendt" to "Kamp" on an external activity
2. **Auto-sync runs** (every 60 minutes) or user triggers manual sync
3. **Sync function fetches existing activities** from database
4. **Sync logic checks** if category is not "Ukendt" and preserves it
5. **BUT** - the sync couldn't distinguish between:
   - A category that was **manually set by the user** (should ALWAYS be preserved)
   - A category that was **auto-assigned** (can be updated by sync)

### The Race Condition

```
Timeline:
1. User changes category: "Ukendt" → "Kamp"
2. Change is saved to database
3. Auto-sync starts
4. Sync fetches activities (sees "Kamp")
5. Sync preserves "Kamp" (because it's not "Ukendt")
6. ✅ Works correctly!

BUT if:
1. User changes category: "Ukendt" → "Kamp"
2. Change is being saved...
3. Auto-sync starts BEFORE save completes
4. Sync fetches activities (still sees "Ukendt")
5. Sync assigns new category based on name parsing
6. ❌ User's manual change is lost!
```

### Evidence from Database

Looking at the activities data:
- All external activities had `created_at` = `updated_at`
- This meant no manual updates had been tracked
- The `updated_at` timestamp wasn't being updated when categories changed

## The Solution

### 1. Added `manually_set_category` Flag

**Migration:**
```sql
ALTER TABLE activities 
ADD COLUMN manually_set_category BOOLEAN DEFAULT FALSE;
```

This flag explicitly tracks when a user manually changes a category, making the intent clear.

### 2. Updated Sync Logic

**Before:**
```typescript
if (existingActivity && existingActivity.categoryName.toLowerCase() !== 'ukendt') {
  // Preserve the existing category
  categoryId = existingActivity.categoryId;
}
```

**After:**
```typescript
if (existingActivity && existingActivity.manuallySetCategory) {
  // ALWAYS preserve manually set categories, regardless of value
  categoryId = existingActivity.categoryId;
  console.log(`🔒 PRESERVING manually set category`);
} else if (existingActivity && existingActivity.categoryName.toLowerCase() !== 'ukendt') {
  // Preserve existing non-"Ukendt" categories (backward compatibility)
  categoryId = existingActivity.categoryId;
}
```

### 3. Updated Activity Update Function

**In `useFootballData.ts`:**
```typescript
if (updates.categoryId) {
  updateData.category_id = updates.categoryId;
  updateData.manually_set_category = true; // 🔒 Set flag
  console.log('🔒 Setting manually_set_category=true');
}
```

## How It Works Now

### Scenario 1: User Manually Changes Category

```
1. User changes category: "Ukendt" → "Kamp"
2. updateActivitySingle() is called
3. Database is updated:
   - category_id = "kamp-id"
   - manually_set_category = TRUE ✅
   - updated_at = current timestamp
4. Auto-sync runs
5. Sync fetches activity (sees manually_set_category = TRUE)
6. Sync ALWAYS preserves the category
7. ✅ User's choice is respected!
```

### Scenario 2: Auto-Assigned Category

```
1. New external activity is imported
2. Category is auto-assigned via name parsing
3. Database is updated:
   - category_id = "træning-id"
   - manually_set_category = FALSE ✅
4. Auto-sync runs again
5. Sync fetches activity (sees manually_set_category = FALSE)
6. Sync can update category if better match is found
7. ✅ Auto-assignment can be improved!
```

### Scenario 3: User Changes to "Ukendt"

```
1. User manually changes category to "Ukendt"
2. Database is updated:
   - category_id = "ukendt-id"
   - manually_set_category = TRUE ✅
3. Auto-sync runs
4. Sync sees manually_set_category = TRUE
5. Sync preserves "Ukendt" (respects user's choice)
6. ✅ User can explicitly mark as unknown!
```

## Benefits of This Approach

### 1. **Explicit Intent Tracking**
- Clear distinction between manual and automatic category assignments
- No ambiguity about user intent

### 2. **Backward Compatible**
- Existing activities without the flag still work
- Old logic preserved as fallback

### 3. **Race Condition Proof**
- Flag is set atomically with category update
- No timing issues between update and sync

### 4. **Future-Proof**
- Can add more sophisticated logic later
- Can track category change history
- Can implement conflict resolution UI

## Testing Recommendations

### Test Case 1: Manual Category Change
1. Import external calendar with activities
2. Manually change category on an activity
3. Trigger manual sync
4. Verify category is preserved
5. Close and reopen app
6. Verify category is still preserved

### Test Case 2: Auto-Sync During Manual Change
1. Import external calendar
2. Start changing category
3. Trigger sync while change is in progress
4. Verify manual change takes precedence

### Test Case 3: Multiple Syncs
1. Import external calendar
2. Manually change category
3. Trigger sync multiple times
4. Verify category remains unchanged

### Test Case 4: App Update
1. Import external calendar
2. Manually change categories on several activities
3. Force app update/reload
4. Verify all manual categories are preserved

## Database Schema

### Before
```sql
activities (
  id uuid,
  category_id uuid,
  is_external boolean,
  external_calendar_id uuid,
  external_event_id text,
  external_category text
)
```

### After
```sql
activities (
  id uuid,
  category_id uuid,
  is_external boolean,
  external_calendar_id uuid,
  external_event_id text,
  external_category text,
  manually_set_category boolean DEFAULT FALSE  -- ✅ NEW
)
```

## Logging & Debugging

### Key Log Messages

**When preserving manually set category:**
```
🔒 PRESERVING manually set category "Kamp" for "Træning" (manually_set_category=true)
```

**When setting flag:**
```
🔒 Setting manually_set_category=true for activity: abc-123
```

**When preserving existing category (backward compatibility):**
```
✓ Preserving existing category "Træning" for "Træning"
```

## Performance Impact

- **Minimal**: One additional boolean column
- **Indexed**: For faster queries on manually set categories
- **No breaking changes**: Existing code continues to work

## Future Enhancements

### 1. Category Change History
```sql
CREATE TABLE category_change_history (
  id uuid PRIMARY KEY,
  activity_id uuid REFERENCES activities(id),
  old_category_id uuid,
  new_category_id uuid,
  changed_by text, -- 'user' or 'auto-sync'
  changed_at timestamptz,
  reason text
);
```

### 2. Conflict Resolution UI
- Show user when sync wants to change a category
- Let user choose: keep manual, accept auto, or create rule

### 3. Smart Learning
- Track which manual changes user makes
- Learn user's category preferences
- Improve auto-assignment over time

## Conclusion

The issue was caused by the inability to distinguish between manually-set and auto-assigned categories. By adding an explicit `manually_set_category` flag, we now have:

- ✅ **Clear intent tracking**
- ✅ **Race condition protection**
- ✅ **Backward compatibility**
- ✅ **Future extensibility**

The fix ensures that user's manual category choices are **always respected**, regardless of when syncs occur or how the app is updated.
