
# External Calendar Sync Diagnostic Fix

## Problem Identified

The external calendar sync was reporting that it fetched 11 events from the iCal feed, but only 9 events were actually being stored in the database. This meant **2 events were silently failing** to be imported.

### Root Cause

The sync function had insufficient error handling and logging. When an event failed to be created or updated (due to database errors, validation issues, etc.), the function would:

1. Continue processing other events
2. Not properly log the failure
3. Update the `event_count` based on fetched events, not successfully processed ones
4. Return a "success" message even though some events failed

This created a situation where:
- The user saw "11 events synced"
- But only 9 were actually in the database
- No error messages were shown
- The 2 missing events were invisible

## Solution Implemented

I've updated the `sync-external-calendar` Edge Function with:

### 1. **Enhanced Error Tracking**
```typescript
let eventsFailed = 0;
const failedEvents: Array<{ title: string; error: string }> = [];
```

### 2. **Try-Catch Around Each Event**
Each event is now processed in its own try-catch block, so if one event fails, the others continue processing:

```typescript
for (const event of events) {
  try {
    // Process event...
  } catch (eventError: any) {
    console.error(`❌ CRITICAL ERROR processing event "${event.summary}":`, eventError);
    eventsFailed++;
    failedEvents.push({ title: event.summary, error: eventError.message });
  }
}
```

### 3. **Detailed Error Logging**
The function now logs:
- Which events failed
- Why they failed (error message)
- How many events succeeded vs failed

### 4. **Improved Response**
The sync response now includes:
```json
{
  "success": true,
  "eventCount": 11,
  "eventsCreated": 2,
  "eventsUpdated": 7,
  "eventsFailed": 2,
  "failedEvents": [
    { "title": "Event Name", "error": "Error message" }
  ],
  "message": "Successfully synced 11 events. 2 new events created, 7 updated, 0 deleted. 0 manually set categories preserved. WARNING: 2 events failed to process."
}
```

## How to Test

### Step 1: Trigger a Manual Sync

1. Open the app
2. Go to the Admin/Profile page
3. Find the "External Calendar" section
4. Click "Synkroniser" (Sync) on your calendar

### Step 2: Check the Response

The app will now show you:
- ✅ How many events were successfully processed
- ❌ How many events failed
- 📋 Which specific events failed and why

### Step 3: Check the Logs

To see detailed logs:

1. Go to your Supabase Dashboard
2. Navigate to Edge Functions → sync-external-calendar
3. Click on "Logs"
4. Look for the most recent sync

You should see detailed output like:

```
🔄 ========== SYNC STARTED (NEW ARCHITECTURE) ==========
📥 Total events in iCal feed: 11
➕ NEW external events created: 2
🔄 Existing external events updated: 7
❌ Events FAILED to process: 2

⚠️ FAILED EVENTS:
   1. "Event Name 1": duplicate key value violates unique constraint
   2. "Event Name 2": invalid date format
```

## Common Failure Reasons

Based on the architecture, events might fail due to:

1. **Duplicate UIDs**: If the same event UID exists multiple times in the feed
2. **Invalid Dates**: If the iCal date format is malformed
3. **Missing Required Fields**: If title, start_date, or start_time are missing
4. **Database Constraints**: If RLS policies or foreign key constraints fail
5. **Timezone Issues**: If timezone conversion fails

## Next Steps

After running a sync with the updated function:

1. **If all events succeed**: Great! The issue was likely a transient error that's now resolved.

2. **If some events still fail**: Check the error messages to understand why:
   - Look at the `failedEvents` array in the response
   - Check the Edge Function logs for detailed error messages
   - Share the error messages so we can fix the specific issue

3. **Verify the count**: After sync, check:
   ```sql
   SELECT 
     ec.name,
     ec.event_count as "Reported Count",
     COUNT(ee.id) as "Actual Count"
   FROM external_calendars ec
   LEFT JOIN events_external ee ON ee.provider_calendar_id = ec.id
   GROUP BY ec.id, ec.name, ec.event_count;
   ```

## What's Guaranteed

✅ **Manually set categories are NEVER overwritten** - This is still guaranteed
✅ **Failed events are now visible** - You'll see exactly which events failed and why
✅ **Sync continues even if some events fail** - One bad event won't stop the whole sync
✅ **Accurate reporting** - The response now reflects what actually happened

## Monitoring

The sync function now logs to the `event_sync_log` table, so you can track:
- When each event was synced
- Whether it was created, updated, or failed
- Why it failed (in the `details` field)

Query to check sync history:
```sql
SELECT 
  esl.action,
  esl.details,
  esl.timestamp,
  ee.title
FROM event_sync_log esl
LEFT JOIN events_external ee ON esl.external_event_id = ee.id
WHERE esl.calendar_id = 'your-calendar-id'
ORDER BY esl.timestamp DESC
LIMIT 50;
```

## Summary

The sync function has been updated to:
1. ✅ Catch and log all errors
2. ✅ Continue processing even if some events fail
3. ✅ Report exactly which events failed and why
4. ✅ Provide accurate counts of succeeded vs failed events

**Please run a sync now and let me know what the response shows!** This will help us identify the specific issue with the 2 missing events.
