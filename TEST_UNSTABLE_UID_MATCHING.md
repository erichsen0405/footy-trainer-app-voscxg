
# Testing Unstable UID Matching

This guide helps you test the new unstable UID matching implementation.

## Prerequisites

- ✅ `match-external-event` Edge Function deployed
- ✅ Database tables (`external_events`, `external_event_mappings`, `local_event_meta`) exist
- ✅ Indexes created
- ✅ External calendar configured in your app

## Test Scenarios

### Scenario 1: First Sync (New Events)

**Expected Behavior:** All events should be created as new.

```typescript
// In your app
import { supabase } from '@/app/integrations/supabase/client';

const { data, error } = await supabase.functions.invoke(
  'sync-external-calendar-v3',
  {
    body: { calendarId: 'your-calendar-id' }
  }
);

console.log('First sync result:', data);
// Expected:
// {
//   eventsCreated: 50,  // All events are new
//   eventsUpdated: 0,
//   matchStats: {
//     providerUid: 0,
//     exact: 0,
//     fuzzy: 0
//   }
// }
```

### Scenario 2: Second Sync (Stable UIDs)

**Expected Behavior:** All events should match via provider_uid.

```typescript
// Sync again immediately
const { data, error } = await supabase.functions.invoke(
  'sync-external-calendar-v3',
  {
    body: { calendarId: 'your-calendar-id' }
  }
);

console.log('Second sync result:', data);
// Expected:
// {
//   eventsCreated: 0,
//   eventsUpdated: 50,  // All events matched
//   matchStats: {
//     providerUid: 50,  // All matched via UID
//     exact: 0,
//     fuzzy: 0
//   }
// }
```

### Scenario 3: Exact Match (Title + Time Unchanged)

**Expected Behavior:** Events should match via exact match even if UID changes.

**Steps:**
1. Manually change a UID in the database
2. Sync again

```sql
-- Simulate UID change
UPDATE external_events 
SET primary_provider_uid = 'new-uid-123' 
WHERE id = 1;

-- Delete old mapping
DELETE FROM external_event_mappings 
WHERE external_event_id = 1;
```

```typescript
// Sync again
const { data } = await supabase.functions.invoke(
  'sync-external-calendar-v3',
  { body: { calendarId: 'your-calendar-id' } }
);

// Expected: Event should match via exact match
// matchStats.exact should be > 0
```

### Scenario 4: Fuzzy Match (Title Changed Slightly)

**Expected Behavior:** Events should match via fuzzy logic.

**Steps:**
1. Change event title in external calendar (e.g., "Fodboldtræning" → "Fodboldtræning U17")
2. Sync

```typescript
const { data } = await supabase.functions.invoke(
  'sync-external-calendar-v3',
  { body: { calendarId: 'your-calendar-id' } }
);

// Expected: Event should match via fuzzy match
// matchStats.fuzzy should be > 0
```

### Scenario 5: No Match (Completely New Event)

**Expected Behavior:** Event should be created as new.

**Steps:**
1. Add a completely new event to external calendar
2. Sync

```typescript
const { data } = await supabase.functions.invoke(
  'sync-external-calendar-v3',
  { body: { calendarId: 'your-calendar-id' } }
);

// Expected: New event created
// eventsCreated should be 1
```

## Testing Individual Event Matching

You can test the matching logic for a single event:

```typescript
import { matchExternalEvent } from '@/utils/externalEventMatcher';

const testEvent = {
  provider: 'ics',
  provider_uid: 'test-uid-123',
  dtstart_utc: '2024-01-15T10:00:00Z',
  summary: 'Fodboldtræning U17',
  location: 'Stadion',
};

const result = await matchExternalEvent(testEvent);

console.log('Match result:', result);
// {
//   matched: true/false,
//   external_event_id: 123,
//   action: 'existing' | 'new',
//   match_method: 'provider_uid' | 'exact' | 'fuzzy',
//   confidence: 85
// }
```

## Checking Logs

### Edge Function Logs

1. Go to Supabase Dashboard
2. Navigate to Edge Functions
3. Select `match-external-event` or `sync-external-calendar-v3`
4. View logs

Look for:
- `🔍 Matching event: "..."`
- `✅ MATCH via provider_uid`
- `✅ EXACT MATCH found`
- `✅ FUZZY MATCH found (confidence: X%)`
- `❌ No match found`

### Database Queries

Check what's in the database:

```sql
-- View all external events
SELECT id, provider, primary_provider_uid, summary, dtstart_utc
FROM external_events
ORDER BY dtstart_utc DESC
LIMIT 10;

-- View all mappings
SELECT 
  eem.id,
  eem.provider_uid,
  ee.summary,
  ee.dtstart_utc
FROM external_event_mappings eem
JOIN external_events ee ON ee.id = eem.external_event_id
ORDER BY eem.mapped_at DESC
LIMIT 10;

-- Count mappings per event (should be >= 1)
SELECT 
  ee.id,
  ee.summary,
  COUNT(eem.id) as mapping_count
FROM external_events ee
LEFT JOIN external_event_mappings eem ON eem.external_event_id = ee.id
GROUP BY ee.id, ee.summary
ORDER BY mapping_count DESC;
```

## Testing Tokenization

Test the tokenization logic locally:

```typescript
import { tokenize, calculateTokenOverlap } from '@/utils/externalEventMatcher';

// Test tokenization
const tokens = tokenize("Fodboldtræning U17 - Hjemme");
console.log('Tokens:', Array.from(tokens));
// Expected: ['fodboldtræning', 'u17', 'hjemme']

// Test overlap
const overlap = calculateTokenOverlap(
  "Fodboldtræning U17 Hjemme",
  "Fodboldtræning U17 Ude"
);
console.log('Overlap:', overlap);
// Expected: 0.5 (50% - 2 out of 4 tokens match)
```

## Testing Time Tolerance

```typescript
import { isWithinTimeTolerance } from '@/utils/externalEventMatcher';

const result = isWithinTimeTolerance(
  '2024-01-15T10:00:00Z',
  '2024-01-15T10:10:00Z',
  15 // tolerance in minutes
);
console.log('Within tolerance:', result);
// Expected: true (10 minutes apart)
```

## Performance Testing

Test with a large calendar:

```typescript
console.time('sync');

const { data } = await supabase.functions.invoke(
  'sync-external-calendar-v3',
  { body: { calendarId: 'your-calendar-id' } }
);

console.timeEnd('sync');
console.log('Events processed:', data.eventCount);
console.log('Time per event:', (performance.now() / data.eventCount).toFixed(2), 'ms');
```

**Expected Performance:**
- Small calendar (< 50 events): < 5 seconds
- Medium calendar (50-200 events): < 15 seconds
- Large calendar (200-500 events): < 30 seconds

## Troubleshooting

### Events are duplicating

**Check:**
1. Are indexes created? Run the index creation SQL
2. Is the overlap threshold too low? Increase from 0.6 to 0.7
3. Are timestamps being calculated correctly?

```sql
-- Check for duplicates
SELECT summary, dtstart_utc, COUNT(*) as count
FROM external_events
GROUP BY summary, dtstart_utc
HAVING COUNT(*) > 1;
```

### Events are not matching when they should

**Check:**
1. Is the overlap threshold too high? Decrease from 0.6 to 0.5
2. Are special characters being handled correctly?
3. Is the time tolerance too strict? Increase from 15 to 30 minutes

```typescript
// Test tokenization with your event titles
const title1 = "Your event title from calendar";
const title2 = "Your event title from database";

console.log('Tokens 1:', Array.from(tokenize(title1)));
console.log('Tokens 2:', Array.from(tokenize(title2)));
console.log('Overlap:', calculateTokenOverlap(title1, title2));
```

### Fuzzy matching is too aggressive

**Adjust thresholds in Edge Function:**

```typescript
// In match-external-event/index.ts
const OVERLAP_THRESHOLD = 0.7;  // Increase from 0.6
const TIME_TOLERANCE_MINUTES = 10;  // Decrease from 15
```

## Success Criteria

✅ **First sync:** All events created as new  
✅ **Second sync:** All events matched via provider_uid  
✅ **After title change:** Events matched via fuzzy logic  
✅ **No duplicates:** Each event has exactly one entry in external_events  
✅ **Mappings created:** Each event has at least one mapping  
✅ **Performance:** Sync completes in reasonable time  

## Next Steps After Testing

1. ✅ Verify all test scenarios pass
2. ✅ Check logs for any errors
3. ✅ Monitor matching success rates
4. ⚠️ Adjust thresholds if needed
5. ⚠️ Deploy to production
6. ⚠️ Monitor real-world usage

## Support

If you encounter issues:
1. Check Edge Function logs
2. Review database state with SQL queries
3. Test tokenization and overlap calculations locally
4. Adjust thresholds and re-test
5. Refer to `UNSTABLE_UID_IMPLEMENTATION.md` for detailed documentation
