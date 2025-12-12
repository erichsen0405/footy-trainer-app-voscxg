
# Calendar Sync V4 Implementation - computeSyncOps

## Overview

This document describes the implementation of the new calendar synchronization system (v4) that uses the `computeSyncOps` function to handle:

- **Soft deletes** with grace period and miss count tracking
- **Immediate deletes** for cancelled events (STATUS:CANCELLED or METHOD:CANCEL)
- **Unstable UID matching** via provider_uid, summary+datetime, and fuzzy matching
- **Preservation of local metadata** (categories, reminders, etc.)

## Architecture

### Database Schema

The sync system uses two main tables:

1. **`events_external`** - Stores raw external calendar event data
   - `id` (uuid) - Primary key
   - `provider_event_uid` (text) - UID from the iCal feed
   - `title`, `description`, `location` - Event details
   - `start_date`, `start_time`, `end_date`, `end_time` - Event timing
   - `is_all_day` (boolean) - All-day event flag
   - `miss_count` (integer) - Number of consecutive syncs where event was missing
   - `deleted` (boolean) - Soft delete flag
   - `external_last_modified` (timestamptz) - Last modified timestamp from feed
   - `fetched_at` (timestamptz) - When the event was last fetched
   - `raw_payload` (jsonb) - Additional data (categories, timezone, status, method)

2. **`events_local_meta`** - Stores user-specific metadata and overrides
   - `id` (uuid) - Primary key
   - `external_event_id` (uuid) - Foreign key to events_external
   - `user_id` (uuid) - User who owns this metadata
   - `category_id` (uuid) - Assigned category
   - `manually_set_category` (boolean) - TRUE when user manually sets category
   - `reminders` (jsonb) - User-defined reminders
   - `custom_fields` (jsonb) - Additional user data

### Sync Flow

```
1. Fetch events from iCal feed
2. Parse events (extract UID, summary, datetime, status, method, etc.)
3. Load existing events from database
4. Call computeSyncOps(fetched, dbRows, methodCancel, options)
5. Execute operations in order:
   a. Creates - Insert new events
   b. Updates - Update existing events
   c. Restores - Restore soft-deleted events that reappeared
   d. Soft Deletes - Mark missing events as deleted
   e. Immediate Deletes - Delete cancelled events
6. Update calendar metadata (last_fetched, event_count)
```

## computeSyncOps Function

### Parameters

```typescript
computeSyncOps(
  fetched: FetchedEvent[],      // Events from iCal feed
  dbRows: ExternalEventRow[],   // Existing events in database
  methodCancel: boolean,         // Handle METHOD:CANCEL (default: true)
  opts: SyncOptions              // Configuration options
): SyncOperations
```

### Options

```typescript
interface SyncOptions {
  graceHours?: number;           // Hours before soft-deleting (default: 6)
  fuzzyThreshold?: number;       // Token overlap threshold (default: 0.65)
  dtToleranceSeconds?: number;   // Time tolerance in seconds (default: 300 = 5 min)
  maxMissCount?: number;         // Max miss count before soft delete (default: 3)
}
```

### Matching Strategy

The function uses a three-step matching process:

1. **Exact UID Match** - Match by `provider_event_uid`
2. **Exact Summary + DateTime Match** - Match by title and start time
3. **Fuzzy Match** - Token overlap + time tolerance
   - Tokenizes summary and location
   - Calculates Jaccard similarity (token overlap)
   - Checks if start times are within tolerance
   - Combined score: `summary_overlap * 0.7 + location_overlap * 0.3`
   - Requires score >= `fuzzyThreshold` (default 0.65)

### Operations Returned

```typescript
interface SyncOperations {
  creates: Array<{
    event: FetchedEvent;
    reason: string;
  }>;
  updates: Array<{
    dbRowId: string;
    event: FetchedEvent;
    reason: string;
  }>;
  softDeletes: Array<{
    dbRowId: string;
    reason: string;
  }>;
  restores: Array<{
    dbRowId: string;
    event: FetchedEvent;
    reason: string;
  }>;
  immediateDeletes: Array<{
    dbRowId: string;
    reason: string;
  }>;
}
```

## Key Features

### 1. Soft Deletes with Grace Period

Events that are missing from the feed are not immediately deleted. Instead:

- The `miss_count` is incremented on each sync where the event is missing
- The event is only soft-deleted when:
  - `hoursSinceUpdate >= graceHours` (default: 6 hours), OR
  - `miss_count >= maxMissCount` (default: 3)
- Soft-deleted events have `deleted = true` but are not removed from the database
- If a soft-deleted event reappears in the feed, it is restored

### 2. Immediate Deletes for Cancelled Events

Events with `STATUS:CANCELLED` or `METHOD:CANCEL` are:

- Immediately deleted if they already exist in the database
- Not created if they are new (skipped during sync)

### 3. Unstable UID Handling

The system handles calendar providers that change UIDs:

- **Primary matching** by UID
- **Fallback matching** by summary + datetime
- **Fuzzy matching** for events with similar titles and times
- Preserves event continuity even when UIDs change

### 4. Category Preservation

User-defined categories are preserved:

- When `manually_set_category = true`, the category is NEVER overwritten
- When `manually_set_category = false`, the category is auto-updated based on event title
- New events get auto-assigned categories based on keyword matching

## Usage

### Deploying the Edge Function

The Edge Function is deployed as `sync-external-calendar-v4`:

```bash
supabase functions deploy sync-external-calendar-v4
```

### Calling the Sync Function

From the React Native app:

```typescript
const { data, error } = await supabase.functions.invoke('sync-external-calendar-v4', {
  body: { calendarId },
});
```

### Response Format

```typescript
{
  success: true,
  eventCount: 42,
  eventsCreated: 5,
  eventsUpdated: 30,
  eventsRestored: 2,
  eventsSoftDeleted: 3,
  eventsImmediatelyDeleted: 1,
  metadataCreated: 5,
  metadataPreserved: 15,
  eventsFailed: 1,
  failedEvents: [
    { title: "Event Title", error: "Error message" }
  ],
  message: "Successfully synced 42 events..."
}
```

## Configuration

### Recommended Settings

For DBU (Danish Football Union) calendars:

```typescript
{
  graceHours: 6,           // 6 hours grace period
  fuzzyThreshold: 0.65,    // 65% token overlap required
  dtToleranceSeconds: 300, // ±5 minutes time tolerance
  maxMissCount: 3          // 3 consecutive misses before soft delete
}
```

### Tuning Parameters

- **Increase `graceHours`** if events are being soft-deleted too quickly
- **Decrease `fuzzyThreshold`** for more aggressive matching (may cause false positives)
- **Increase `fuzzyThreshold`** for more conservative matching (may miss some matches)
- **Increase `dtToleranceSeconds`** if events have time zone issues or slight time variations

## Testing

### Test Scenarios

1. **New Event** - Create a new event in the iCal feed
   - Expected: Event is created in database with auto-assigned category

2. **Updated Event** - Modify an existing event in the iCal feed
   - Expected: Event is updated in database, category preserved if manually set

3. **Deleted Event** - Remove an event from the iCal feed
   - Expected: Event is soft-deleted after grace period

4. **Cancelled Event** - Set STATUS:CANCELLED on an event
   - Expected: Event is immediately deleted

5. **Restored Event** - Add back a previously deleted event
   - Expected: Event is restored with `deleted = false`

6. **UID Change** - Change the UID of an event but keep title and time
   - Expected: Event is matched via summary+datetime or fuzzy matching

7. **Manual Category** - User manually sets a category
   - Expected: Category is preserved on subsequent syncs

## Monitoring

### Logs

The Edge Function logs detailed information:

```
🔄 ========== SYNC STARTED (computeSyncOps v4) ==========
User authenticated: <user_id>
Timestamp: <iso_timestamp>
Syncing calendar: <calendar_id>
Calendar found: <calendar_name>
✅ Parsed 42 events from iCal feed
Found 40 existing external events in database

📊 Sync Operations Computed:
   ➕ Creates: 5
   🔄 Updates: 30
   🗑️ Soft Deletes: 3
   ♻️ Restores: 2
   ❌ Immediate Deletes: 1

🔄 Executing CREATE operations...
   ➕ Creating: "Event Title"
   ...

📊 ========== SYNC SUMMARY (computeSyncOps v4) ==========
   📥 Total events in iCal feed: 42
   ➕ NEW external events created: 5
   🔄 Existing external events updated: 30
   ♻️ Events restored: 2
   🗑️ Events soft-deleted: 3
   ❌ Events immediately deleted (cancelled): 1
   ➕ NEW local metadata created: 5
   🔒 Local metadata preserved (manually set): 15
   ❌ Events FAILED to process: 1
   ✅ GUARANTEE: Manually set categories are NEVER overwritten
========================================================
```

### Event Sync Log

All sync operations are logged to the `event_sync_log` table:

```sql
SELECT * FROM event_sync_log 
WHERE calendar_id = '<calendar_id>' 
ORDER BY timestamp DESC 
LIMIT 100;
```

## Troubleshooting

### Events Not Syncing

1. Check the Edge Function logs:
   ```bash
   supabase functions logs sync-external-calendar-v4
   ```

2. Verify the iCal URL is accessible:
   ```bash
   curl -I <ics_url>
   ```

3. Check for parsing errors in the logs

### Events Being Soft-Deleted Too Quickly

- Increase `graceHours` in the sync options
- Check if the iCal feed is stable (events should have consistent UIDs)

### Events Not Matching (Duplicates Created)

- Decrease `fuzzyThreshold` for more aggressive matching
- Increase `dtToleranceSeconds` if there are time zone issues
- Check if event titles are significantly different

### Categories Not Being Preserved

- Verify `manually_set_category = true` in `events_local_meta`
- Check the Edge Function logs for category preservation messages

## Migration from Previous Versions

### From sync-external-calendar (v1)

The v4 sync function is a drop-in replacement. Update the function call:

```typescript
// Old
await supabase.functions.invoke('sync-external-calendar', { body: { calendarId } });

// New
await supabase.functions.invoke('sync-external-calendar-v4', { body: { calendarId } });
```

### Database Changes

The v4 implementation adds two new columns to `events_external`:

- `miss_count` (integer, default: 0)
- `deleted` (boolean, default: false)

These columns are automatically added by the migration.

## Future Enhancements

Potential improvements for future versions:

1. **Incremental Sync** - Only fetch events that have changed since last sync
2. **Batch Operations** - Execute database operations in batches for better performance
3. **Conflict Resolution** - Handle conflicts when both local and external events are modified
4. **Recurrence Support** - Better handling of recurring events
5. **Multi-Calendar Sync** - Sync multiple calendars in a single operation
6. **Webhook Support** - Real-time sync via webhooks instead of polling

## References

- Original specification: https://docs.google.com/document/d/1nviy_flRA7e5Xfn1caChMKEKVxWTNJ1qkDjKpoI544Q/edit?usp=sharing
- Edge Function: `supabase/functions/sync-external-calendar-v4/index.ts`
- Utility module: `utils/computeSyncOps.ts`
- Component: `components/ExternalCalendarManager.tsx`
