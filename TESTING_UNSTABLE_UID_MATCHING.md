
# Testing Guide: Unstable UID Matching

## Quick Test Checklist

### ✅ Test 1: Basic Sync
1. Add a new external calendar (DBU iCal)
2. Click "Synkroniser"
3. Verify events are imported
4. Check logs for matching results

**Expected Result**: All events imported successfully, no errors

### ✅ Test 2: UID Change Detection
1. Sync calendar (first time)
2. Note the number of events
3. Sync again immediately
4. Check logs for "Found via provider_uid mapping"

**Expected Result**: All events matched via provider_uid, no new events created

### ✅ Test 3: Exact Match
1. Manually delete a mapping from `external_event_mappings`
2. Sync calendar again
3. Check logs for "Found via exact match"

**Expected Result**: Event matched via exact match, new mapping created

### ✅ Test 4: Fuzzy Match
1. Manually update an event's summary in `external_events` (e.g., add a dash)
2. Delete its mapping from `external_event_mappings`
3. Sync calendar again
4. Check logs for "Found via fuzzy match"

**Expected Result**: Event matched via fuzzy match, new mapping created

### ✅ Test 5: Category Preservation
1. Sync calendar
2. Manually assign a category to an event
3. Sync calendar again
4. Verify category is preserved

**Expected Result**: Category unchanged after sync

### ✅ Test 6: New Event Creation
1. Add a completely new event to the iCal feed
2. Sync calendar
3. Check logs for "Creating new external event"

**Expected Result**: New event created with mapping

### ✅ Test 7: Event Deletion
1. Remove an event from the iCal feed
2. Sync calendar
3. Verify event is no longer visible

**Expected Result**: Event marked as deleted or removed

## SQL Queries for Testing

### Check Mappings
```sql
SELECT 
  ee.id,
  ee.summary,
  ee.primary_provider_uid,
  eem.provider_uid,
  eem.mapped_at
FROM external_events ee
LEFT JOIN external_event_mappings eem ON eem.external_event_id = ee.id
WHERE ee.provider = 'ics'
ORDER BY ee.id, eem.mapped_at;
```

### Check Events with Multiple UIDs
```sql
SELECT 
  ee.id,
  ee.summary,
  COUNT(eem.id) as uid_count,
  array_agg(eem.provider_uid) as all_uids
FROM external_events ee
LEFT JOIN external_event_mappings eem ON eem.external_event_id = ee.id
WHERE ee.provider = 'ics'
GROUP BY ee.id, ee.summary
HAVING COUNT(eem.id) > 1
ORDER BY uid_count DESC;
```

### Check Local Metadata
```sql
SELECT 
  ee.summary,
  ee.dtstart_utc,
  lem.user_id,
  ac.name as category_name,
  lem.overrides
FROM local_event_meta lem
JOIN external_events ee ON ee.id = lem.external_event_id
LEFT JOIN activity_categories ac ON ac.id = lem.category_id
WHERE lem.user_id = 'YOUR_USER_ID'
ORDER BY ee.dtstart_utc;
```

### Check Sync Performance
```sql
SELECT 
  DATE_TRUNC('hour', mapped_at) as hour,
  COUNT(*) as mappings_created
FROM external_event_mappings
WHERE mapped_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

## Edge Function Testing

### Test match-external-event Function

```bash
curl -X POST \
  'https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/match-external-event' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "event": {
      "provider": "ics",
      "provider_uid": "test-uid-123",
      "dtstart_utc": "2024-01-15T10:00:00Z",
      "summary": "U15 Træning",
      "location": "Stadion"
    }
  }'
```

### Test sync-external-calendar-v2 Function

```bash
curl -X POST \
  'https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/sync-external-calendar-v2' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "calendarId": "YOUR_CALENDAR_ID"
  }'
```

## Client-Side Testing

### Test Token Overlap

```typescript
import { calculateTokenOverlap } from '@/utils/externalEventMatcher';

// Test cases
const tests = [
  {
    text1: "U15 Træning København",
    text2: "U15 - Træning i København",
    expected: 1.0,  // 100% overlap
  },
  {
    text1: "U15 Træning",
    text2: "U17 Træning",
    expected: 0.5,  // 50% overlap (træning matches, u15/u17 don't)
  },
  {
    text1: "Fodbold Kamp",
    text2: "Håndbold Kamp",
    expected: 0.33,  // 33% overlap (only kamp matches)
  },
];

tests.forEach(test => {
  const overlap = calculateTokenOverlap(test.text1, test.text2);
  console.log(`"${test.text1}" vs "${test.text2}"`);
  console.log(`Expected: ${test.expected}, Got: ${overlap.toFixed(2)}`);
  console.log(`✅ ${Math.abs(overlap - test.expected) < 0.1 ? 'PASS' : 'FAIL'}\n`);
});
```

### Test Time Tolerance

```typescript
import { isWithinTimeTolerance } from '@/utils/externalEventMatcher';

// Test cases
const tests = [
  {
    dt1: "2024-01-15T10:00:00Z",
    dt2: "2024-01-15T10:05:00Z",
    tolerance: 15,
    expected: true,  // 5 minutes apart, within 15 min tolerance
  },
  {
    dt1: "2024-01-15T10:00:00Z",
    dt2: "2024-01-15T10:20:00Z",
    tolerance: 15,
    expected: false,  // 20 minutes apart, outside 15 min tolerance
  },
  {
    dt1: "2024-01-15T10:00:00Z",
    dt2: "2024-01-15T10:14:59Z",
    tolerance: 15,
    expected: true,  // Just under 15 minutes
  },
];

tests.forEach(test => {
  const within = isWithinTimeTolerance(test.dt1, test.dt2, test.tolerance);
  console.log(`${test.dt1} vs ${test.dt2} (tolerance: ${test.tolerance} min)`);
  console.log(`Expected: ${test.expected}, Got: ${within}`);
  console.log(`✅ ${within === test.expected ? 'PASS' : 'FAIL'}\n`);
});
```

## Performance Testing

### Measure Sync Time

```typescript
const startTime = Date.now();

await supabase.functions.invoke('sync-external-calendar-v2', {
  body: { calendarId: 'YOUR_CALENDAR_ID' },
});

const endTime = Date.now();
const duration = (endTime - startTime) / 1000;

console.log(`Sync completed in ${duration.toFixed(2)} seconds`);
```

### Measure Match Performance

```sql
-- Check average match time from logs
SELECT 
  AVG(EXTRACT(EPOCH FROM (mapped_at - first_seen))) as avg_match_time_seconds
FROM external_event_mappings
WHERE mapped_at > NOW() - INTERVAL '24 hours';
```

## Common Issues and Solutions

### Issue: Duplicate Events Created

**Diagnosis:**
```sql
SELECT summary, dtstart_utc, COUNT(*) as count
FROM external_events
WHERE provider = 'ics'
GROUP BY summary, dtstart_utc
HAVING COUNT(*) > 1;
```

**Solution:** Adjust fuzzy match threshold or time tolerance

### Issue: Events Not Matching

**Diagnosis:**
```sql
SELECT 
  ee.summary,
  ee.dtstart_utc,
  COUNT(eem.id) as mapping_count
FROM external_events ee
LEFT JOIN external_event_mappings eem ON eem.external_event_id = ee.id
WHERE ee.provider = 'ics'
GROUP BY ee.id, ee.summary, ee.dtstart_utc
HAVING COUNT(eem.id) = 0;
```

**Solution:** Check if events have valid UIDs and timestamps

### Issue: Slow Sync Performance

**Diagnosis:**
```sql
EXPLAIN ANALYZE
SELECT id, summary, dtstart_utc, primary_provider_uid
FROM external_events
WHERE provider = 'ics'
  AND dtstart_utc >= '2024-01-15T09:00:00Z'
  AND dtstart_utc <= '2024-01-15T11:00:00Z';
```

**Solution:** Ensure indexes are created and used

## Success Criteria

✅ **No Duplicates**: Each real-world event has exactly one entry in `external_events`

✅ **High Match Rate**: >95% of events matched via provider_uid or exact match

✅ **Fast Sync**: Sync completes in <10 seconds for 100 events

✅ **Data Preservation**: User categories and overrides maintained across syncs

✅ **Audit Trail**: All UID changes tracked in `external_event_mappings`

## Monitoring

### Daily Checks

1. Check for duplicate events
2. Monitor sync performance
3. Review error logs
4. Verify user data preservation

### Weekly Checks

1. Analyze match method distribution
2. Review fuzzy match accuracy
3. Check for orphaned mappings
4. Optimize indexes if needed

### Monthly Checks

1. Review overall system performance
2. Analyze user feedback
3. Plan optimizations
4. Update documentation

## Support

For issues or questions:

1. Check logs in Supabase Dashboard
2. Review documentation in `UNSTABLE_UID_MATCHING_ARCHITECTURE.md`
3. Run diagnostic SQL queries
4. Contact development team with findings
