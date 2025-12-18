
# Fix: Trainer Cannot See Player Activities

## Problem
When logged in as `mhe@optimise.nu` (trainer) and managing data for `nohrhoffmann@gmail.com` (player), the activities for the player were not visible.

## Root Cause Analysis

The issue was caused by **missing RLS (Row Level Security) policies** on two critical tables:

1. **`events_local_meta` table**: This table stores local metadata for external calendar events. The existing RLS policies only allowed users to see their own events, events assigned to them as a player, or events for their teams. There was NO policy allowing trainers/admins to view external events for players they manage.

2. **`events_external` table**: This table stores the actual external event data. The existing RLS policy only allowed users to view external events from their own calendars. There was NO policy allowing trainers/admins to view external events from their managed players' calendars.

## Data Verification

Before the fix, we verified:
- ✅ Admin-player relationship exists: `admin_id = e5dbd97a-e5f6-4018-89fa-e6c7a66c6a71` (mhe@optimise.nu) and `player_id = 0e235b8c-0ad3-4aa2-9ad0-a7196afe4adf` (nohrhoffmann@gmail.com)
- ✅ Player has external activities: 10+ external events from calendar sync
- ❌ Trainer could not see these activities due to RLS policies

## Solution Implemented

### Migration 1: `add_admin_view_player_external_events`

Added two new RLS policies:

1. **Policy on `events_local_meta`**:
   ```sql
   CREATE POLICY "Admins can view their players external events"
   ON events_local_meta
   FOR SELECT
   USING (
     EXISTS (
       SELECT 1
       FROM admin_player_relationships apr
       WHERE apr.player_id = events_local_meta.user_id
         AND apr.admin_id = auth.uid()
     )
   );
   ```
   This allows trainers to see the local metadata for external events owned by their managed players.

2. **Policy on `activities`**:
   ```sql
   CREATE POLICY "Admins can view activities assigned to their players"
   ON activities
   FOR SELECT
   USING (
     EXISTS (
       SELECT 1
       FROM admin_player_relationships apr
       WHERE apr.player_id = activities.player_id
         AND apr.admin_id = auth.uid()
         AND activities.player_id IS NOT NULL
     )
   );
   ```
   This allows trainers to see activities that are explicitly assigned to their managed players (where `player_id` is set).

### Migration 2: `add_admin_view_player_external_events_data`

Added RLS policy on `events_external`:

```sql
CREATE POLICY "Admins can view external events from their players calendars"
ON events_external
FOR SELECT
USING (
  provider_calendar_id IN (
    SELECT ec.id
    FROM external_calendars ec
    JOIN admin_player_relationships apr ON apr.player_id = ec.user_id
    WHERE apr.admin_id = auth.uid()
  )
);
```

This allows trainers to see the actual external event data (title, date, time, location, etc.) for events from their managed players' calendars.

## How It Works

When a trainer selects a player to manage in the `TeamPlayerContext`:

1. The `useFootballData` hook filters data based on `selectedContext.type === 'player'` and `selectedContext.id`
2. For external activities, it queries:
   - `events_local_meta` (filtered by `player_id` or through the new admin policy)
   - `events_external` (filtered through the new admin policy)
   - `external_event_tasks` (automatically filtered through `events_local_meta` relationship)

3. The new RLS policies ensure that:
   - Trainers can see external events for players they manage
   - Trainers can see the local metadata (categories, tasks) for those events
   - The data is properly filtered based on the admin-player relationship

## Testing

To test the fix:

1. Log in as `mhe@optimise.nu` (trainer)
2. Navigate to the home screen
3. Select "Administrer data for spiller" and choose `nohrhoffmann@gmail.com`
4. Verify that the player's external activities are now visible
5. Verify that you can see:
   - Activity titles
   - Dates and times
   - Locations
   - Categories
   - Tasks

## Related Tables and Policies

The following tables now have complete admin access policies:

- ✅ `activities` - Admins can view their players' activities
- ✅ `activity_categories` - Admins can view their players' categories
- ✅ `activity_tasks` - Admins can view their players' activity tasks
- ✅ `task_templates` - Admins can view their players' task templates
- ✅ `events_local_meta` - **NEW** Admins can view their players' external event metadata
- ✅ `events_external` - **NEW** Admins can view external events from their players' calendars
- ✅ `external_event_tasks` - Automatically accessible through `events_local_meta`

## Notes

- External calendars (`external_calendars` table) remain personal to each user. Trainers do NOT see their players' calendar configurations, only the events from those calendars.
- The fix maintains data isolation - trainers can only see data for players they explicitly manage through `admin_player_relationships`.
- No changes were needed to the frontend code - the RLS policies handle the filtering automatically.
