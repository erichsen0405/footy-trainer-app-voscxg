
# Timestamp-Based Conflict Resolution for Category Preservation

## Problem
The previous approach using only the `manually_set_category` flag wasn't working because:
1. Once set to `true`, the flag would preserve the category forever
2. External calendar syncs could never update categories, even when they should
3. Users couldn't benefit from automatic category detection after manually setting a category once

## Solution: Time-Window Based Conflict Resolution

### How It Works

The new system uses **timestamp-based conflict resolution** with a configurable time window:

1. **Conflict Resolution Window**: 120 minutes (2 hours) by default
2. **Category Timestamp**: `category_updated_at` tracks when a category was last changed
3. **Smart Decision Making**:
   - If a category was **manually set within the last 2 hours** → **PRESERVE IT**
   - If a category was **manually set more than 2 hours ago** → **ALLOW AUTO-UPDATE**
   - If a category was **never manually set** → **ALWAYS AUTO-UPDATE**

### Key Features

#### 1. Recent Manual Changes Are Protected
```
User manually sets category → timestamp recorded
Next sync (within 2 hours) → category preserved ✅
Sync after 2+ hours → category can be auto-updated 🔄
```

#### 2. Automatic Category Detection
The system now:
- Analyzes event names for keywords (træning, kamp, møde, etc.)
- Assigns appropriate categories automatically
- Updates categories for events that haven't been manually modified recently

#### 3. Configurable Time Window
The conflict resolution window can be adjusted in the Edge Function:
```typescript
const CONFLICT_RESOLUTION_WINDOW_MINUTES = 120; // 2 hours
```

### Database Schema

The `activities` table has two key columns:

```sql
-- Flag indicating if user manually set the category
manually_set_category BOOLEAN DEFAULT false

-- Timestamp of when category was last changed
category_updated_at TIMESTAMP WITH TIME ZONE
```

### Trigger Function

A database trigger automatically updates `category_updated_at` when `category_id` changes:

```sql
CREATE OR REPLACE FUNCTION update_category_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if category_id actually changed
  IF (TG_OP = 'UPDATE' AND OLD.category_id IS DISTINCT FROM NEW.category_id) THEN
    NEW.category_updated_at = NOW();
  END IF;
  
  -- For new records, set timestamp
  IF (TG_OP = 'INSERT' AND NEW.category_updated_at IS NULL) THEN
    NEW.category_updated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Edge Function Logic

The `sync-external-calendar` Edge Function now:

1. **Fetches existing activities** with their timestamps
2. **For each event**:
   - Checks if manually set
   - Calculates time since last manual update
   - Decides whether to preserve or update category
3. **Logs detailed information** about each decision

### Example Scenarios

#### Scenario 1: Recent Manual Change
```
User manually sets "Træning" → "Kamp" at 10:00
Sync runs at 10:30 (30 minutes later)
Result: Category "Kamp" is PRESERVED ✅
Reason: Within 2-hour window
```

#### Scenario 2: Old Manual Change
```
User manually sets "Træning" → "Kamp" at 08:00
Sync runs at 12:00 (4 hours later)
Event name is "Træning"
Result: Category updated to "Træning" 🔄
Reason: Outside 2-hour window, auto-detection applies
```

#### Scenario 3: Never Manually Set
```
Event "Træning" has category "Ukendt" (auto-assigned)
Sync runs
Event name is "Træning"
Result: Category updated to "Træning" 🔄
Reason: Never manually set, auto-detection applies
```

### Benefits

1. **Preserves Recent User Intent**: Manual changes are respected for 2 hours
2. **Enables Automatic Correction**: Old manual changes can be corrected by auto-detection
3. **Reduces Manual Work**: Users don't need to manually categorize every event
4. **Flexible**: Time window can be adjusted based on user needs
5. **Transparent**: Detailed logging shows exactly why each decision was made

### Monitoring

Check the Edge Function logs to see:
- Which categories were preserved
- Which categories were auto-updated
- Time since last manual update for each activity
- Conflict resolution decisions

### Configuration

To adjust the conflict resolution window, modify the Edge Function:

```typescript
// In supabase/functions/sync-external-calendar/index.ts
const CONFLICT_RESOLUTION_WINDOW_MINUTES = 120; // Change this value
```

Common values:
- `60` = 1 hour (more aggressive auto-updates)
- `120` = 2 hours (balanced, default)
- `240` = 4 hours (more conservative)
- `1440` = 24 hours (very conservative)

### Testing

To test the system:

1. **Manually set a category** on an external activity
2. **Wait a few minutes** and trigger a sync
3. **Check logs** - category should be preserved
4. **Wait 2+ hours** and trigger another sync
5. **Check logs** - category may be auto-updated if event name matches a different category

### Troubleshooting

If categories are still being overwritten:

1. **Check the timestamp**: Verify `category_updated_at` is being set correctly
2. **Check the window**: Ensure the conflict resolution window is appropriate
3. **Check the logs**: Review Edge Function logs for decision reasoning
4. **Check the trigger**: Verify the database trigger is working correctly

### Future Enhancements

Possible improvements:
- User-configurable conflict resolution window
- Different windows for different categories
- Machine learning for better category detection
- User feedback loop to improve auto-detection
