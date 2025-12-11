
# Unstable UID Matching Architecture

## Problem

The DBU iCal feed generates **unstable UIDs** - the same event can have different UIDs across different fetches. This breaks traditional synchronization logic that relies on UIDs as stable identifiers.

## Solution

We've implemented a **multi-step matching process** that can handle unstable UIDs by using multiple matching strategies with fallback logic.

## Database Schema

### 1. `external_events` Table

Stores the canonical external event data.

```sql
CREATE TABLE external_events (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,                    -- 'ics', 'google', 'outlook', etc.
  primary_provider_uid TEXT,                 -- Current/primary UID
  dtstart_utc TIMESTAMPTZ,                   -- Start time in UTC
  summary TEXT,                              -- Event title
  location TEXT,                             -- Event location
  external_last_modified TIMESTAMPTZ,        -- Last modified timestamp from source
  raw_payload TEXT,                          -- Full event data as JSON
  raw_hash TEXT,                             -- Hash of raw payload for change detection
  first_seen TIMESTAMPTZ DEFAULT now(),      -- When first imported
  last_seen TIMESTAMPTZ DEFAULT now(),       -- Last sync where event was present
  deleted BOOLEAN DEFAULT FALSE              -- Soft delete flag
);

CREATE UNIQUE INDEX ux_external_events_provider_uid 
  ON external_events(provider, primary_provider_uid);
```

### 2. `external_event_mappings` Table

Maps multiple provider UIDs to the same external event. This is the key to handling unstable UIDs.

```sql
CREATE TABLE external_event_mappings (
  id BIGSERIAL PRIMARY KEY,
  external_event_id BIGINT NOT NULL REFERENCES external_events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_uid TEXT NOT NULL,                -- Any UID that has been seen for this event
  mapped_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX ix_mappings_provider_uid 
  ON external_event_mappings(provider, provider_uid);
```

**Key insight:** When an event's UID changes, we create a new mapping entry rather than losing the connection to the existing event.

### 3. `local_event_meta` Table

Stores user-specific metadata and overrides for external events.

```sql
CREATE TABLE local_event_meta (
  id BIGSERIAL PRIMARY KEY,
  external_event_id BIGINT REFERENCES external_events(id),
  user_id UUID REFERENCES auth.users(id),
  category_id UUID REFERENCES activity_categories(id),
  overrides JSONB,                           -- User overrides (title, time, etc.)
  last_local_modified TIMESTAMPTZ DEFAULT now()
);
```

## Matching Logic

The matching process follows a **prioritized three-step approach**:

### Step 1: Match by Provider UID (via mappings)

```typescript
const { data: mapping } = await supabase
  .from('external_event_mappings')
  .select('external_event_id')
  .eq('provider', provider)
  .eq('provider_uid', providerUid)
  .single();

if (mapping) {
  // Found! Use this external_event_id
  return { matched: true, externalEventId: mapping.external_event_id };
}
```

**Why this works:** Even if the UID has changed, we've stored all previous UIDs in the mappings table.

### Step 2: Exact Match (summary + dtstart_utc)

```typescript
const { data: exactMatch } = await supabase
  .from('external_events')
  .select('id, primary_provider_uid')
  .eq('provider', provider)
  .eq('summary', summary)
  .eq('dtstart_utc', dtstartUtc)
  .single();

if (exactMatch) {
  // Found! Create new mapping if UID changed
  if (exactMatch.primary_provider_uid !== providerUid) {
    await supabase
      .from('external_event_mappings')
      .insert({
        external_event_id: exactMatch.id,
        provider: provider,
        provider_uid: providerUid,
      });
  }
  return { matched: true, externalEventId: exactMatch.id };
}
```

**Why this works:** If the title and start time are exactly the same, it's very likely the same event.

### Step 3: Fuzzy Match (token overlap + time tolerance)

```typescript
// Get candidates within ±1 hour time window
const windowStart = new Date(startTime.getTime() - 60 * 60 * 1000);
const windowEnd = new Date(startTime.getTime() + 60 * 60 * 1000);

const { data: candidates } = await supabase
  .from('external_events')
  .select('id, summary, dtstart_utc, primary_provider_uid')
  .eq('provider', provider)
  .gte('dtstart_utc', windowStart.toISOString())
  .lte('dtstart_utc', windowEnd.toISOString());

// Calculate token overlap for each candidate
for (const candidate of candidates) {
  const tokenOverlap = calculateTokenOverlap(summary, candidate.summary);
  const withinTimeTolerance = isWithinTimeTolerance(dtstartUtc, candidate.dtstart_utc, 15);
  
  // Require at least 60% token overlap and within 15 minutes
  if (tokenOverlap >= 0.6 && withinTimeTolerance) {
    // Found! Create new mapping
    await supabase
      .from('external_event_mappings')
      .insert({
        external_event_id: candidate.id,
        provider: provider,
        provider_uid: providerUid,
      });
    return { matched: true, externalEventId: candidate.id };
  }
}
```

**Why this works:** Even if the title has minor changes (e.g., "U15 Træning" → "U15 - Træning"), the token overlap will be high. Combined with time tolerance, we can confidently match events.

### Token Overlap Algorithm

```typescript
function tokenize(text: string): Set<string> {
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9æøå\s]/g, ' ')  // Remove special chars
    .trim();
  
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  return new Set(tokens);
}

function calculateTokenOverlap(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;  // Jaccard similarity
}
```

**Example:**
- Text 1: "U15 Træning København"
- Text 2: "U15 - Træning i København"
- Tokens 1: {u15, træning, københavn}
- Tokens 2: {u15, træning, københavn}
- Overlap: 3/3 = 100%

## Synchronization Flow

```
1. Fetch iCal feed
   ↓
2. Parse events
   ↓
3. For each event:
   ├─→ Try match by provider_uid (Step 1)
   │   ├─→ Found? Update external_event
   │   └─→ Not found? Continue to Step 2
   │
   ├─→ Try exact match (Step 2)
   │   ├─→ Found? Update external_event + create new mapping
   │   └─→ Not found? Continue to Step 3
   │
   ├─→ Try fuzzy match (Step 3)
   │   ├─→ Found? Update external_event + create new mapping
   │   └─→ Not found? Create new external_event + mapping
   │
   └─→ Ensure local_event_meta exists for user
```

## Edge Functions

### 1. `match-external-event`

Standalone function that performs the matching logic. Can be called independently for testing or debugging.

**Input:**
```json
{
  "event": {
    "provider": "ics",
    "provider_uid": "abc123",
    "dtstart_utc": "2024-01-15T10:00:00Z",
    "summary": "U15 Træning",
    "location": "Stadion"
  }
}
```

**Output:**
```json
{
  "success": true,
  "result": {
    "matched": true,
    "external_event_id": 42,
    "action": "updated",
    "match_method": "fuzzy"
  }
}
```

### 2. `sync-external-calendar-v2`

Full synchronization function that uses the matching logic to sync an entire calendar.

**Input:**
```json
{
  "calendarId": "uuid-of-calendar"
}
```

**Output:**
```json
{
  "success": true,
  "eventCount": 25,
  "eventsCreated": 5,
  "eventsUpdated": 20,
  "mappingsCreated": 5,
  "message": "Successfully synced 25 events using unstable UID matching."
}
```

## Benefits

1. **Handles Unstable UIDs:** Multiple UIDs can point to the same event via mappings.
2. **Robust Matching:** Three-step fallback ensures high match rate.
3. **No Data Loss:** Events are never duplicated or lost due to UID changes.
4. **User Metadata Preserved:** Local overrides and categories are maintained across syncs.
5. **Audit Trail:** Mappings table provides history of all UIDs seen for each event.

## Migration from Old Architecture

If you have existing data in the old `events_external` and `events_local_meta` tables, you can migrate it:

```sql
-- Migrate external events
INSERT INTO external_events (
  provider,
  primary_provider_uid,
  dtstart_utc,
  summary,
  location,
  external_last_modified,
  raw_payload,
  first_seen,
  last_seen
)
SELECT
  provider,
  provider_event_uid,
  (start_date || ' ' || start_time)::timestamptz,
  title,
  location,
  external_last_modified,
  raw_payload::text,
  created_at,
  updated_at
FROM events_external;

-- Create initial mappings
INSERT INTO external_event_mappings (
  external_event_id,
  provider,
  provider_uid
)
SELECT
  ee.id,
  oe.provider,
  oe.provider_event_uid
FROM events_external oe
JOIN external_events ee ON ee.primary_provider_uid = oe.provider_event_uid;

-- Migrate local metadata
INSERT INTO local_event_meta (
  external_event_id,
  user_id,
  category_id,
  overrides
)
SELECT
  ee.id,
  elm.user_id,
  elm.category_id,
  jsonb_build_object(
    'title', elm.local_title_override,
    'description', elm.local_description,
    'start', elm.local_start_override,
    'end', elm.local_end_override,
    'reminders', elm.reminders,
    'pinned', elm.pinned,
    'custom_fields', elm.custom_fields
  )
FROM events_local_meta elm
JOIN events_external oe ON oe.id = elm.external_event_id
JOIN external_events ee ON ee.primary_provider_uid = oe.provider_event_uid;
```

## Testing

To test the matching logic:

```typescript
import { matchExternalEvent } from '@/utils/externalEventMatcher';

const testEvent = {
  provider: 'ics',
  provider_uid: 'test-uid-123',
  dtstart_utc: '2024-01-15T10:00:00Z',
  summary: 'U15 Træning',
  location: 'Stadion',
};

const result = await matchExternalEvent(testEvent);
console.log('Match result:', result);
```

## Performance Considerations

- **Indexes:** All key lookup columns are indexed for fast queries.
- **Time Window:** Fuzzy matching only searches within ±1 hour to limit candidates.
- **Token Overlap:** Efficient set operations using JavaScript Sets.
- **Batch Processing:** Events are processed sequentially to avoid race conditions.

## Future Enhancements

1. **Machine Learning:** Train a model to predict matches based on historical data.
2. **User Feedback:** Allow users to confirm/reject fuzzy matches.
3. **Conflict Resolution:** UI for handling ambiguous matches.
4. **Performance Monitoring:** Track match rates and performance metrics.
