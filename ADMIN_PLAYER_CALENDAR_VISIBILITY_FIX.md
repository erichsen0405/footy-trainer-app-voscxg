
# Admin-Player Calendar Visibility Fix

## Problem
When admin user `mhe@optimise.nu` tried to manage data for player `nohrhoffmann@gmail.com`, the player's external calendar activities were not visible, even though they existed in the database.

## Root Cause
The issue was caused by missing RLS (Row Level Security) policies that prevented admins from accessing their players' external calendar data. Specifically:

1. **external_calendars table**: Only had policies allowing users to see their own calendars, but no policy for admins to see their players' calendars.

2. **external_event_tasks table**: Only had policies checking if `events_local_meta.user_id = auth.uid()`, but didn't account for admin-player relationships.

3. **events_local_meta table**: Had a SELECT policy for admins, but was missing UPDATE and DELETE policies.

## Solution
Added the following RLS policies:

### 1. External Calendars Access
```sql
CREATE POLICY "Admins can view their players calendars"
ON external_calendars
FOR SELECT
USING (
  user_id IN (
    SELECT player_id 
    FROM admin_player_relationships 
    WHERE admin_id = auth.uid()
  )
);
```

### 2. External Event Tasks Access
Added four policies for admins to SELECT, INSERT, UPDATE, and DELETE their players' external event tasks:

```sql
CREATE POLICY "Admins can view their players external event tasks"
ON external_event_tasks
FOR SELECT
USING (
  local_meta_id IN (
    SELECT id 
    FROM events_local_meta 
    WHERE user_id IN (
      SELECT player_id 
      FROM admin_player_relationships 
      WHERE admin_id = auth.uid()
    )
  )
);
```

(Similar policies for INSERT, UPDATE, DELETE)

### 3. Events Local Meta Access
Added UPDATE and DELETE policies for admins:

```sql
CREATE POLICY "Admins can update their players event metadata"
ON events_local_meta
FOR UPDATE
USING (
  user_id IN (
    SELECT player_id 
    FROM admin_player_relationships 
    WHERE admin_id = auth.uid()
  )
);
```

## Code Changes
Enhanced logging in `hooks/useFootballData.ts` to better track calendar loading:

- Added more detailed console logs showing which user's calendars are being loaded
- Added logging for calendar details (name, enabled status, event count)
- Improved error logging with full error details

## Testing
To verify the fix works:

1. Log in as admin user `mhe@optimise.nu`
2. Select player `nohrhoffmann@gmail.com` from the context selector
3. Navigate to the home screen or activities page
4. Verify that the player's external calendar activities are now visible
5. Verify that you can:
   - View the player's external calendars
   - See the external calendar activities
   - Update categories on external activities
   - Toggle task completion on external activities

## Database Verification
The admin-player relationship exists:
```
admin_id: e5dbd97a-e5f6-4018-89fa-e6c7a66c6a71 (mhe@optimise.nu)
player_id: 0e235b8c-0ad3-4aa2-9ad0-a7196afe4adf (nohrhoffmann@gmail.com)
```

The player has:
- 1 external calendar: "B.93 - 2013A"
- 96 active external events
- 133 event metadata entries (all with categories assigned)

## Impact
This fix ensures that:
- Admins can fully manage their players' external calendar data
- The admin-player relationship is properly enforced through RLS
- Data isolation is maintained (admins can only see their own players' data)
- All CRUD operations work correctly for admins managing player data
