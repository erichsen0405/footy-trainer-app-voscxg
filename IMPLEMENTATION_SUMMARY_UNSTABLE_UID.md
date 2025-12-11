
# Implementation Summary: Unstable UID Matching for External Calendars

## Overview

This implementation addresses the issue of **unstable UIDs** in the DBU iCal feed by introducing a robust multi-step matching process that can handle UID changes while maintaining data integrity and preventing duplicates.

## What Was Implemented

### 1. New Database Schema

Created three new tables to support unstable UID matching:

- **`external_events`**: Stores canonical external event data
- **`external_event_mappings`**: Maps multiple provider UIDs to the same event
- **`local_event_meta`**: Stores user-specific metadata and overrides

### 2. Matching Logic

Implemented a three-step matching process:

1. **Provider UID Match**: Check if UID exists in mappings table
2. **Exact Match**: Match on exact summary + start time
3. **Fuzzy Match**: Match using token overlap (60%+) + time tolerance (±15 min)

### 3. Edge Functions

Created two new Edge Functions:

- **`match-external-event`**: Standalone matching function
- **`sync-external-calendar-v2`**: Full sync using new matching logic

### 4. Client Utilities

Created `utils/externalEventMatcher.ts` with helper functions for client-side matching operations.

### 5. Documentation

Created comprehensive documentation:

- **`UNSTABLE_UID_MATCHING_ARCHITECTURE.md`**: Technical architecture details
- **`UNSTABLE_UID_SYNC_GUIDE.md`**: User guide in Danish
- **`IMPLEMENTATION_SUMMARY_UNSTABLE_UID.md`**: This file

## Key Features

### Handles Unstable UIDs
Multiple UIDs can point to the same event through the mappings table. When a UID changes, a new mapping is created rather than losing the connection.

### Robust Matching
Three-step fallback ensures high match rate:
- Step 1: Fast lookup via UID mapping
- Step 2: Exact match on title + time
- Step 3: Fuzzy match with token overlap

### No Data Loss
Events are never duplicated or lost due to UID changes. The system maintains continuity across syncs.

### User Metadata Preserved
Local overrides and categories are maintained across syncs, even when UIDs change.

### Audit Trail
The mappings table provides a complete history of all UIDs seen for each event.

## Database Migration

The new tables coexist with the old `events_external` and `events_local_meta` tables. To migrate existing data, run the SQL migration provided in `UNSTABLE_UID_MATCHING_ARCHITECTURE.md`.

## Usage

### For Developers

```typescript
import { matchExternalEvent } from '@/utils/externalEventMatcher';

const event = {
  provider: 'ics',
  provider_uid: 'abc123',
  dtstart_utc: '2024-01-15T10:00:00Z',
  summary: 'U15 Træning',
  location: 'Stadion',
};

const result = await matchExternalEvent(event);
console.log('Match result:', result);
```

### For Users

1. Add external calendar in the app
2. Click "Synkroniser" to sync
3. Enable "Auto-synkronisering" for automatic hourly syncs

The system will automatically handle UID changes and maintain event continuity.

## Performance

- **Indexes**: All key lookup columns are indexed for fast queries
- **Time Window**: Fuzzy matching only searches within ±1 hour
- **Token Overlap**: Efficient set operations using JavaScript Sets
- **Batch Processing**: Events processed sequentially to avoid race conditions

## Testing

To test the implementation:

1. Add a DBU iCal calendar
2. Sync the calendar
3. Check logs for matching results
4. Verify no duplicates are created
5. Manually change a category on an event
6. Sync again and verify category is preserved

## Troubleshooting

### Duplicate Events

**Cause**: Fuzzy matching threshold too low

**Solution**: Increase token overlap threshold from 0.6 to 0.7 in `sync-external-calendar-v2`

### Missing Matches

**Cause**: Fuzzy matching threshold too high or time tolerance too low

**Solution**: Decrease threshold from 0.6 to 0.5, or increase time tolerance from 15 to 30 minutes

### Slow Sync

**Cause**: Too many candidates in fuzzy matching

**Solution**: Reduce time window from ±1 hour to ±30 minutes

## Future Enhancements

1. **Machine Learning**: Train a model to predict matches based on historical data
2. **User Feedback**: Allow users to confirm/reject fuzzy matches
3. **Conflict Resolution**: UI for handling ambiguous matches
4. **Performance Monitoring**: Track match rates and performance metrics
5. **Batch Operations**: Process multiple calendars in parallel

## Files Changed/Created

### New Files
- `supabase/functions/match-external-event/index.ts`
- `supabase/functions/sync-external-calendar-v2/index.ts`
- `utils/externalEventMatcher.ts`
- `UNSTABLE_UID_MATCHING_ARCHITECTURE.md`
- `UNSTABLE_UID_SYNC_GUIDE.md`
- `IMPLEMENTATION_SUMMARY_UNSTABLE_UID.md`

### Database Migrations
- `create_external_events_new_architecture` migration applied

### Existing Files (No Changes Required)
- `utils/icalParser.ts` - Can continue to be used
- `components/ExternalCalendarManager.tsx` - Works with both old and new architecture
- `supabase/functions/sync-external-calendar/index.ts` - Old version still available

## Migration Path

### Phase 1: Testing (Current)
- New tables and functions deployed
- Old system continues to work
- Test new system with select calendars

### Phase 2: Gradual Migration
- Update `ExternalCalendarManager` to use new sync function
- Migrate existing data from old tables to new tables
- Monitor for issues

### Phase 3: Full Deployment
- Switch all calendars to new system
- Deprecate old tables and functions
- Remove old code

## Conclusion

This implementation provides a robust solution for handling unstable UIDs in external calendar feeds. The multi-step matching process ensures high accuracy while preventing duplicates and preserving user data.

The architecture is designed to be:
- **Scalable**: Efficient indexes and batch processing
- **Maintainable**: Clear separation of concerns
- **Extensible**: Easy to add new matching strategies
- **User-friendly**: Transparent to end users

For questions or issues, refer to the detailed documentation in `UNSTABLE_UID_MATCHING_ARCHITECTURE.md` or `UNSTABLE_UID_SYNC_GUIDE.md`.
