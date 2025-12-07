
# Category Persistence Fix - Complete Analysis and Solution

## Problem Summary

The app was removing manually set category choices on external activities after refreshing or syncing the calendar. Despite previous attempts to fix this issue, the problem persisted.

## Root Cause Analysis

After thorough investigation, I identified the exact issue:

### The Problem Flow:

1. **User manually changes category** on an external activity in `activity-details.tsx`
2. **Direct database update** was being used for external activities (line ~280 in old code)
3. **`manually_set_category` flag was NOT being set** during this update
4. **Calendar sync runs** and sees `manually_set_category = false`
5. **Category gets overwritten** back to auto-assigned value

### Key Finding:

The `activity-details.tsx` file had special handling for external activities that bypassed the `updateActivitySingle` function. This meant the `manually_set_category` flag was never set to `true` when users manually changed categories.

```typescript
// OLD CODE (BROKEN):
if (activity.isExternal) {
  const { error } = await supabase
    .from('activities')
    .update({
      category_id: editCategory?.id,
      updated_at: new Date().toISOString(),
      // ❌ manually_set_category NOT SET!
    })
    .eq('id', activity.id);
}
```

## The Solution

### 1. Fixed `activity-details.tsx`

Changed the external activity save logic to use `updateActivitySingle` instead of direct database update:

```typescript
// NEW CODE (FIXED):
if (activity.isExternal) {
  console.log('🔄 Updating external activity category via updateActivitySingle');
  
  await updateActivitySingle(activity.id, {
    categoryId: editCategory?.id,
  });
  
  console.log('✅ External activity category updated with manually_set_category=true');
}
```

### 2. Verified `useFootballData.ts`

The `updateActivitySingle` function already had the correct logic:

```typescript
if (updates.categoryId) {
  updateData.category_id = updates.categoryId;
  updateData.manually_set_category = true;  // ✅ This sets the flag
  console.log('🔒 Setting manually_set_category=true for activity:', activityId);
}
```

### 3. Verified `sync-external-calendar/index.ts`

The sync function already respects the flag:

```typescript
if (existingActivity && existingActivity.manuallySetCategory) {
  categoryId = existingActivity.categoryId;
  assignmentMethod = 'manually_set';
  categoriesPreserved++;
  console.log(`🔒 PRESERVING manually set category...`);
}
```

## Database Schema

The `manually_set_category` column exists with correct configuration:

```sql
Column: manually_set_category
Type: boolean
Nullable: YES
Default: false
```

## Testing the Fix

### Before Fix:
1. User changes category on external activity → `manually_set_category` stays `false`
2. Calendar syncs → Category gets overwritten
3. User's manual choice is lost ❌

### After Fix:
1. User changes category on external activity → `manually_set_category` set to `true`
2. Calendar syncs → Category is preserved (flag is checked)
3. User's manual choice is maintained ✅

## Verification Steps

To verify the fix is working:

1. **Change a category** on an external activity
2. **Check the database**:
   ```sql
   SELECT id, title, manually_set_category, category_id
   FROM activities
   WHERE id = '<activity_id>';
   ```
   Should show `manually_set_category = true`

3. **Sync the calendar** (manually or wait for auto-sync)
4. **Check the activity again** - category should remain unchanged
5. **Check sync logs** - should show "PRESERVING manually set category"

## Additional Improvements

### User Feedback
Updated the success message to be more informative:

```typescript
Alert.alert(
  'Gemt', 
  'Kategorien er blevet opdateret og vil ikke blive ændret ved næste synkronisering'
);
```

### Info Box Update
Updated the info box for external activities to mention category preservation:

```typescript
<Text>
  Dette er en ekstern aktivitet. Du kan kun ændre kategorien. 
  Manuelt tildelte kategorier bevares ved synkronisering.
</Text>
```

## Architecture Overview

The complete flow now works as follows:

```
User Action (activity-details.tsx)
    ↓
updateActivitySingle (useFootballData.ts)
    ↓
Database Update (manually_set_category = true)
    ↓
Calendar Sync (sync-external-calendar)
    ↓
Check manually_set_category flag
    ↓
Preserve category if flag = true ✅
```

## Files Modified

1. **`app/activity-details.tsx`**
   - Changed external activity save to use `updateActivitySingle`
   - Added logging for debugging
   - Updated user feedback messages
   - Updated info box text

## Files Verified (No Changes Needed)

1. **`hooks/useFootballData.ts`**
   - Already sets `manually_set_category = true` correctly
   
2. **`supabase/functions/sync-external-calendar/index.ts`**
   - Already checks and preserves manually set categories

3. **Database Schema**
   - `manually_set_category` column exists with correct configuration

## Conclusion

The issue was a simple but critical oversight: the external activity save logic was bypassing the proper update function that sets the `manually_set_category` flag. By routing all category updates through `updateActivitySingle`, we ensure the flag is always set correctly, and the sync function can properly preserve user choices.

The fix is minimal, focused, and leverages the existing infrastructure that was already in place. No database migrations or complex changes were needed - just ensuring the right code path is used.
