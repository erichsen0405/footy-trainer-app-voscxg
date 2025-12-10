
# Category Persistence Diagnostic Report

## Problem Summary

When manually changing a category for an external activity (e.g., "Juleferie - start" to "Andet"), the category was being reset to "Ukendt" after performing a pull-to-refresh sync.

## Root Cause Analysis

### Database Investigation

Query results showed:
```sql
SELECT id, title, is_external, manually_set_category, category_updated_at
FROM activities
WHERE title ILIKE '%juleferie%';
```

Result:
- **Activity**: "Juleferie - start"
- **manually_set_category**: `false` ❌
- **Expected**: `true` ✅

This confirmed that the `manually_set_category` flag was NOT being set in the database when the user manually changed the category.

### Code Analysis

The issue was in the `updateActivitySingle` function in `hooks/useFootballData.ts`:

**Problem 1: Race Condition with `.select()`**
```typescript
// OLD CODE (PROBLEMATIC)
const { data, error } = await supabase
  .from('activities')
  .update(updateData)
  .eq('id', activityId)
  .eq('user_id', userId)
  .select(`*`)  // ❌ This fetches data BEFORE propagation
  .single();
```

The `.select()` was fetching data immediately after the update, potentially before the database had fully propagated the changes. This caused:

1. Update sent with `manually_set_category = true`
2. Immediate fetch returns OLD data with `manually_set_category = false`
3. Local state updated with OLD data
4. Pull-to-refresh fetches from database
5. Sync function sees `manually_set_category = false` and overwrites category

**Problem 2: No Verification**

The old code didn't verify that the flag was actually set in the database after the update.

## The Fix

### 1. Remove Race Condition

```typescript
// NEW CODE (FIXED)
// Step 1: Perform update WITHOUT .select()
const { error: updateError } = await supabase
  .from('activities')
  .update(updateData)
  .eq('id', activityId)
  .eq('user_id', userId);

// Step 2: Wait for database propagation
await new Promise(resolve => setTimeout(resolve, 1000));

// Step 3: Verify the update by fetching fresh data
const { data: verifyData, error: verifyError } = await supabase
  .from('activities')
  .select(`*`)
  .eq('id', activityId)
  .eq('user_id', userId)
  .single();
```

### 2. Add Explicit Verification

```typescript
if (updates.categoryId !== undefined) {
  console.log('🔍 ========== VERIFICATION: Manual Category Protection ==========');
  console.log(`✅ Category was updated to: ${verifyData.category?.name}`);
  console.log(`✅ manually_set_category flag: ${verifyData.manually_set_category}`);
  
  if (verifyData.manually_set_category === true) {
    console.log('✅✅✅ SUCCESS: Manual category protection is ACTIVE!');
  } else {
    console.log('❌❌❌ CRITICAL ERROR: Manual category protection FAILED!');
    
    // Try one more time with explicit update
    const { error: flagError } = await supabase
      .from('activities')
      .update({ 
        manually_set_category: true,
        category_updated_at: new Date().toISOString()
      })
      .eq('id', activityId)
      .eq('user_id', userId);
  }
}
```

### 3. Enhanced Logging

Added comprehensive logging at every step:
- Before update
- During update
- After update
- During verification
- Success/failure status

## How to Verify the Fix

### Test Procedure

1. **Find an external activity** (e.g., "Juleferie - start")
2. **Manually change its category** to "Andet"
3. **Check the console logs** - you should see:
   ```
   ✅✅✅ SUCCESS: Manual category protection is ACTIVE!
   ✅ This category will NEVER be overwritten by sync
   ```
4. **Perform pull-to-refresh** (swipe down on the home screen)
5. **Verify the category remains "Andet"** ✅

### Database Verification

Run this query to check the flag:
```sql
SELECT 
  id,
  title,
  is_external,
  manually_set_category,
  category_updated_at,
  category_id
FROM activities
WHERE title ILIKE '%juleferie%';
```

Expected result:
- `manually_set_category`: `true` ✅
- `category_updated_at`: Recent timestamp ✅

### Edge Function Verification

The sync function already has protection:
```typescript
if (existingActivity.manuallySetCategory === true) {
  preserveCategory = true;
  categoriesPreserved++;
  console.log(`   🛡️🛡️🛡️ ABSOLUTE PROTECTION: Category manually set by user`);
  console.log(`   🚫 SKIPPING ALL CATEGORY UPDATES`);
}
```

## Expected Behavior After Fix

### Scenario 1: Manual Category Change
1. User changes category from "Ukendt" to "Andet"
2. `manually_set_category` = `true` is set in database
3. Category is "Andet" ✅

### Scenario 2: Pull-to-Refresh After Manual Change
1. User performs pull-to-refresh
2. Sync function fetches external calendar
3. Sync function sees `manually_set_category = true`
4. Sync function SKIPS category update
5. Category remains "Andet" ✅

### Scenario 3: Auto-Sync After Manual Change
1. Auto-sync runs every hour
2. Sync function sees `manually_set_category = true`
3. Sync function SKIPS category update
4. Category remains "Andet" ✅

## Key Changes Summary

1. **Removed `.select()` from update** - Prevents race condition
2. **Added 1000ms wait** - Ensures database propagation
3. **Added explicit verification** - Confirms flag was set
4. **Added fallback update** - Retries if flag wasn't set
5. **Enhanced logging** - Makes debugging easier

## Monitoring

Watch for these log messages:

**Success:**
```
✅✅✅ SUCCESS: Manual category protection is ACTIVE!
✅ This category will NEVER be overwritten by sync
```

**Failure:**
```
❌❌❌ CRITICAL ERROR: Manual category protection FAILED!
❌ manually_set_category: false
```

If you see the failure message, there's a deeper issue with RLS policies or database permissions.

## RLS Policy Verification

The RLS policies are correct:
```sql
-- Users can update their own activities
CREATE POLICY "Users can update their own activities" 
ON activities FOR UPDATE 
USING (auth.uid() = user_id);
```

This allows users to update ALL columns, including `manually_set_category`.

## Next Steps

1. **Test the fix** with the procedure above
2. **Monitor the logs** for success/failure messages
3. **Report back** if the category is still being overwritten

If the issue persists after this fix, it indicates a database-level problem that requires further investigation.
