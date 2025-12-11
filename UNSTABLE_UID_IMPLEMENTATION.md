
# Unstable UID Matching Implementation

This document describes the implementation of the unstable UID matching logic for external calendar synchronization, based on the Python code provided in:
https://docs.google.com/document/d/1bihJqUW4eFKsdHJECk9Tmj0iSReFV95I3yq6ER6D5Es/edit

## Overview

The DBU iCal feed does not generate stable UIDs for events. This means the same event can have different UIDs on different fetches, making it impossible to track events using UID alone. To solve this, we implement a multi-step matching strategy.

## Architecture

### Database Tables

#### `external_events` (bigint IDs)
Stores raw external calendar event data from iCal/CalDAV/API sources.

```sql
CREATE TABLE external_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  primary_provider_uid TEXT,
  dtstart_utc TIMESTAMPTZ,
  summary TEXT,
  location TEXT,
  external_last_modified TIMESTAMPTZ,
  raw_payload TEXT,
  raw_hash TEXT,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  deleted BOOLEAN DEFAULT FALSE
);
```

#### `external_event_mappings`
Tracks multiple provider UIDs that map to the same external event (for handling UID changes).

```sql
CREATE TABLE external_event_mappings (
  id BIGSERIAL PRIMARY KEY,
  external_event_id BIGINT NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_uid TEXT NOT NULL,
  mapped_at TIMESTAMPTZ DEFAULT now()
);
```

#### `local_event_meta`
Stores user-specific metadata and overrides for external events.

```sql
CREATE TABLE local_event_meta (
  id BIGSERIAL PRIMARY KEY,
  external_event_id BIGINT REFERENCES external_events(id),
  user_id UUID,
  category_id UUID,
  overrides JSONB,
  last_local_modified TIMESTAMPTZ DEFAULT now()
);
```

### Indexes

```sql
-- For fast UID lookups
CREATE UNIQUE INDEX ux_external_events_provider_uid 
  ON external_events(provider, primary_provider_uid);

-- For mapping lookups
CREATE INDEX ix_mappings_provider_uid 
  ON external_event_mappings(provider, provider_uid);

-- For time-based queries
CREATE INDEX ix_external_events_dtstart_summary 
  ON external_events(dtstart_utc);

-- For text search
CREATE INDEX ix_external_events_summary 
  ON external_events USING gin (to_tsvector('simple', summary));
```

## Matching Strategy

The matching logic follows a three-step process, in order of priority:

### Step 1: Provider UID Match
Try to find an existing mapping for the provider UID.

```typescript
const { data: mapping } = await supabase
  .from('external_event_mappings')
  .select('external_event_id')
  .eq('provider', provider)
  .eq('provider_uid', providerUid)
  .single();
```

**Result:** If found, we have a definitive match (100% confidence).

### Step 2: Exact Match (Summary + Dtstart)
If no UID mapping exists, try exact match on summary and start time.

```typescript
const { data: exactMatches } = await supabase
  .from('external_events')
  .select('id, primary_provider_uid')
  .eq('provider', provider)
  .eq('summary', summary)
  .eq('dtstart_utc', dtstart);
```

**Result:** If found, create a new mapping and update the primary UID (100% confidence).

### Step 3: Fuzzy Match
If no exact match, try fuzzy matching using:
- Token overlap (Jaccard similarity) on summary
- Token overlap on location (if available)
- Time tolerance (±15 minutes)

```typescript
// Fetch candidates within ±30 minute window
const startWindow = new Date(dtstart.getTime() - 30 * 60 * 1000);
const endWindow = new Date(dtstart.getTime() + 30 * 60 * 1000);

// Calculate similarity scores
const summaryOverlap = calculateTokenOverlap(summary1, summary2);
const locationOverlap = calculateTokenOverlap(location1, location2);
const score = summaryOverlap * 0.7 + locationOverlap * 0.3;

// Match if: within time tolerance AND summary overlap >= 60%
if (withinTime && summaryOverlap >= 0.6 && score > bestScore) {
  // Found a match
}
```

**Result:** If found, create a new mapping and update the primary UID (confidence = score * 100).

### Step 4: No Match
If no match is found, create a new external event.

## Implementation Files

### Edge Functions

1. **`supabase/functions/match-external-event/index.ts`**
   - Standalone matching function
   - Can be called from client or other Edge Functions
   - Implements the full 3-step matching logic

2. **`supabase/functions/sync-external-calendar-v3/index.ts`**
   - Full calendar synchronization
   - Uses the matching logic inline
   - Handles event creation, updates, and deletions

### Client Utilities

**`utils/externalEventMatcher.ts`**
- Client-side wrapper for calling the match Edge Function
- Utility functions for tokenization and similarity calculation
- Local fuzzy matching for testing/preview

## Usage

### Synchronizing a Calendar

```typescript
import { supabase } from '@/app/integrations/supabase/client';

// Trigger sync
const { data, error } = await supabase.functions.invoke(
  'sync-external-calendar-v3',
  {
    body: { calendarId: 'your-calendar-id' }
  }
);

console.log('Sync result:', data);
// {
//   success: true,
//   eventCount: 50,
//   eventsCreated: 5,
//   eventsUpdated: 45,
//   matchStats: {
//     providerUid: 30,
//     exact: 10,
//     fuzzy: 5
//   }
// }
```

### Matching a Single Event

```typescript
import { matchExternalEvent } from '@/utils/externalEventMatcher';

const event = {
  provider: 'ics',
  provider_uid: 'some-uid-123',
  dtstart_utc: '2024-01-15T10:00:00Z',
  summary: 'Fodboldtræning',
  location: 'Stadion',
};

const result = await matchExternalEvent(event);

if (result.matched) {
  console.log('Matched to existing event:', result.external_event_id);
  console.log('Match method:', result.match_method);
  console.log('Confidence:', result.confidence);
} else {
  console.log('No match found - will create new event');
}
```

## Tokenization Details

The tokenization function:
1. Converts text to lowercase
2. Removes special characters (except Danish letters: æ, ø, å)
3. Splits on whitespace
4. Filters out tokens shorter than 3 characters

Example:
```typescript
tokenize("Fodboldtræning U17 - Hjemme")
// Returns: Set(['fodboldtræning', 'u17', 'hjemme'])
```

## Jaccard Similarity

The Jaccard similarity coefficient measures overlap between two sets:

```
J(A, B) = |A ∩ B| / |A ∪ B|
```

Example:
```typescript
calculateTokenOverlap(
  "Fodboldtræning U17 Hjemme",
  "Fodboldtræning U17 Ude"
)
// tokens1: ['fodboldtræning', 'u17', 'hjemme']
// tokens2: ['fodboldtræning', 'u17', 'ude']
// intersection: ['fodboldtræning', 'u17'] (2 tokens)
// union: ['fodboldtræning', 'u17', 'hjemme', 'ude'] (4 tokens)
// Result: 2/4 = 0.5 (50% overlap)
```

## Time Tolerance

Events are considered to match if their start times are within 15 minutes of each other. This accounts for minor time adjustments in the external calendar.

```typescript
isWithinTimeTolerance(
  '2024-01-15T10:00:00Z',
  '2024-01-15T10:10:00Z',
  15 // tolerance in minutes
)
// Result: true (10 minutes apart)
```

## Thresholds

- **Summary overlap threshold:** 60% (0.6)
- **Time tolerance:** ±15 minutes
- **Candidate search window:** ±30 minutes
- **Scoring weights:**
  - Summary: 70%
  - Location: 30%

## Benefits

1. **Handles unstable UIDs:** Events are tracked even when UIDs change
2. **Prevents duplicates:** Fuzzy matching catches renamed or slightly modified events
3. **Maintains history:** Mapping table preserves all historical UIDs
4. **User data preserved:** Local metadata (categories, reminders) is never lost
5. **Transparent:** Detailed logging shows which matching method was used

## Migration from Old System

If you have existing data in the `events_external` table (UUID-based), you'll need to migrate to the new `external_events` table (bigint-based). The new system is designed to work alongside the old one during transition.

## Testing

To test the matching logic:

1. Create a test event in your external calendar
2. Sync the calendar (first sync creates the event)
3. Modify the event title slightly in the external calendar
4. Sync again - should match via fuzzy logic
5. Check logs to see which matching method was used

## Troubleshooting

### Events are duplicating
- Check if the summary overlap threshold is too low
- Verify that dtstart_utc is being calculated correctly
- Check if the time tolerance is too strict

### Events are not matching when they should
- Check if the summary overlap threshold is too high
- Verify that tokenization is working correctly (check for special characters)
- Increase the time tolerance if events have time zone issues

### Performance issues
- Ensure all indexes are created
- Check if the candidate search window is too large
- Consider adding more specific filters to reduce candidate set

## Future Improvements

1. **Machine learning:** Train a model to improve matching accuracy
2. **User feedback:** Allow users to confirm/reject matches
3. **Conflict resolution:** Better handling of conflicting matches
4. **Performance:** Batch processing for large calendars
5. **Analytics:** Track matching success rates and adjust thresholds

## References

- Original Python implementation: https://docs.google.com/document/d/1bihJqUW4eFKsdHJECk9Tmj0iSReFV95I3yq6ER6D5Es/edit
- Jaccard similarity: https://en.wikipedia.org/wiki/Jaccard_index
- Token-based matching: https://en.wikipedia.org/wiki/Tokenization_(lexical_analysis)
