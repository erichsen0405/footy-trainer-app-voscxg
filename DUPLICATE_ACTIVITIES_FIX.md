
# Fix for Duplicate Activities on Player Profile

## Problem
Players were seeing duplicate activities on their profile when viewing external calendar events.

## Root Cause
The issue was caused by a mismatch in the RLS (Row Level Security) policies between the `external_calendars` and `events_external` tables:

1. **`external_calendars` RLS policy** correctly allowed players to view calendars where:
   - `user_id = auth.uid()` (their own calendars)
   - `player_id = auth.uid()` (calendars assigned to them by trainers)
   - `team_id IN (...)` (calendars for teams they belong to)

2. **`events_external` RLS policy** ONLY checked:
   - `provider_calendar_id IN (SELECT id FROM external_calendars WHERE user_id = auth.uid())`
   
   This meant that when a trainer created a calendar for a player (with `player_id` set), the player could see the calendar but NOT the events, causing the sync logic to create duplicate metadata entries.

## Solution

### 1. Fixed RLS Policy on `events_external`
Updated the policy to match the same filtering logic as `external_calendars`:

```sql
DROP POLICY IF EXISTS "Users can view external events from their calendars" ON events_external;

CREATE POLICY "Users can view external events from their calendars"
ON events_external
FOR SELECT
USING (
  provider_calendar_id IN (
    SELECT id FROM external_calendars
    WHERE user_id = auth.uid()
       OR player_id = auth.uid()
       OR team_id IN (
         SELECT team_id FROM team_members
         WHERE player_id = auth.uid()
       )
  )
);
```

### 2. Added Deduplication Logic in `useFootballData.ts`
Added logic to deduplicate external event metadata entries when multiple entries exist for the same external event:

- If multiple metadata entries exist for the same `external_event_id`, prioritize based on context:
  1. **Highest priority**: `player_id` matches current user (player viewing their own assigned events)
  2. **Medium priority**: `team_id` matches (team member viewing team events)
  3. **Lowest priority**: `user_id` matches (trainer viewing their own events)

This ensures that each external event is only displayed once, even if multiple metadata entries exist.

## Testing
To verify the fix:

1. Log in as a player (e.g., nohrhoffmann@gmail.com)
2. Navigate to the home screen
3. Verify that external calendar activities are displayed only once
4. Check the console logs for deduplication messages:
   - `✅ Found X external event metadata entries`
   - `✅ Deduplicated to Y unique external events`

## Impact
- **Players**: Will now see each external activity only once on their profile
- **Trainers/Admins**: No change in behavior - they continue to see activities as before
- **Performance**: Slight improvement due to deduplication logic reducing redundant data processing

## Files Modified
1. `hooks/useFootballData.ts` - Added deduplication logic for external event metadata
2. Database migration: `fix_duplicate_external_events_rls` - Updated RLS policy on `events_external` table
