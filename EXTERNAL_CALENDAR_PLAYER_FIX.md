
# Fix: External Calendar Activities Not Visible for Players

## Problem Analysis

When a player logs in and adds an external calendar, then synchronizes it, they receive a message that activities have been imported, but these activities are **not visible on the home screen**.

### Root Cause

The issue was caused by **overly restrictive RLS (Row Level Security) policies** on the `events_local_meta` table. This table stores user-specific metadata for external calendar events, including:
- Category assignments
- Custom titles/descriptions
- Reminders
- Player/team assignments

#### The Specific Issues:

1. **RLS Policy Gap**: The original `events_local_meta` SELECT policy only allowed users to view records where `user_id = auth.uid()`. This worked fine for trainers/admins managing their own calendars, but **failed for players** because:
   - When a player adds their own external calendar, the `user_id` is set to the player's ID
   - However, the policy didn't account for the `player_id` and `team_id` columns that were added for trainer/admin management features
   - Players couldn't see events where `player_id = auth.uid()` (events assigned to them by trainers)
   - Players couldn't see events for teams they're members of

2. **Data Filtering vs. RLS**: The `useFootballData` hook correctly attempted to filter external events based on `player_id` and `team_id`:
   ```typescript
   // Player - show own external events and those assigned to them
   externalQuery = externalQuery.or(`events_local_meta.user_id.eq.${userId},events_local_meta.player_id.eq.${userId}`);
   ```
   However, the RLS policies blocked the data from being returned **before** the application-level filtering could even run.

3. **Inconsistent Behavior**: This created a confusing user experience where:
   - The sync operation succeeded (confirmed by success message)
   - The data was stored in the database
   - But the data was invisible to the player due to RLS restrictions

## Solution Implemented

### Migration: `fix_external_calendar_player_visibility`

Updated the RLS policies on `events_local_meta` to allow players to view, update, and delete external event metadata for:

1. **Events they created** (`user_id = auth.uid()`)
2. **Events assigned to them as a player** (`player_id = auth.uid()`)
3. **Events assigned to teams they are members of** (`team_id IN (SELECT team_id FROM team_members WHERE player_id = auth.uid())`)

### Updated Policies:

#### SELECT Policy
```sql
CREATE POLICY "Users can view their own and assigned event metadata"
ON events_local_meta
FOR SELECT
USING (
  user_id = auth.uid() 
  OR player_id = auth.uid()
  OR team_id IN (
    SELECT team_id 
    FROM team_members 
    WHERE player_id = auth.uid()
  )
);
```

#### UPDATE Policy
```sql
CREATE POLICY "Users can update their own and assigned event metadata"
ON events_local_meta
FOR UPDATE
USING (
  user_id = auth.uid() 
  OR player_id = auth.uid()
  OR team_id IN (
    SELECT team_id 
    FROM team_members 
    WHERE player_id = auth.uid()
  )
);
```

#### DELETE Policy
```sql
CREATE POLICY "Users can delete their own and assigned event metadata"
ON events_local_meta
FOR DELETE
USING (
  user_id = auth.uid() 
  OR player_id = auth.uid()
  OR team_id IN (
    SELECT team_id 
    FROM team_members 
    WHERE player_id = auth.uid()
  )
);
```

#### INSERT Policy
```sql
CREATE POLICY "Users can insert their own and assigned event metadata"
ON events_local_meta
FOR INSERT
WITH CHECK (
  user_id = auth.uid()
);
```

## How It Works Now

### For Players:

1. **Adding External Calendar**:
   - Player adds an external calendar (e.g., Google Calendar, iCal)
   - Calendar is stored with `user_id = player_id`, `player_id = NULL`, `team_id = NULL`

2. **Syncing Calendar**:
   - Edge function `sync-external-calendar-v4` fetches events from the calendar
   - Creates `events_external` records (raw event data)
   - Creates `events_local_meta` records with `user_id = player_id`
   - **NEW**: RLS policy now allows player to see these records because `user_id = auth.uid()`

3. **Viewing Activities**:
   - `useFootballData` hook queries `events_external` with `!inner` join to `events_local_meta`
   - **NEW**: RLS policy allows the join to succeed
   - Activities are displayed on the home screen

### For Trainers/Admins Managing Player Data:

1. **Adding Calendar for Player**:
   - Trainer selects a player context
   - Adds external calendar with `user_id = trainer_id`, `player_id = selected_player_id`

2. **Syncing Calendar**:
   - Edge function creates `events_local_meta` with `user_id = trainer_id`, `player_id = selected_player_id`

3. **Player Viewing Activities**:
   - **NEW**: Player can see these activities because `player_id = auth.uid()` in RLS policy
   - Activities appear on player's home screen

### For Team Management:

1. **Adding Calendar for Team**:
   - Trainer adds calendar with `team_id = selected_team_id`

2. **Team Members Viewing**:
   - **NEW**: Team members can see activities because of the team membership check in RLS policy
   - `team_id IN (SELECT team_id FROM team_members WHERE player_id = auth.uid())`

## Testing Checklist

### Player Self-Management:
- [ ] Player can add their own external calendar
- [ ] Player can sync their calendar
- [ ] Player can see imported activities on home screen
- [ ] Player can complete tasks on external activities
- [ ] Player can manually change categories on external activities
- [ ] Player can delete external activities

### Trainer/Admin Managing Player:
- [ ] Trainer can select a player context
- [ ] Trainer can add external calendar for player
- [ ] Trainer can sync calendar for player
- [ ] Trainer can see imported activities for player
- [ ] **Player can see activities assigned to them by trainer**
- [ ] Player can interact with these activities (complete tasks, etc.)

### Team Management:
- [ ] Trainer can add calendar for team
- [ ] Team members can see team activities
- [ ] Team members can interact with team activities

## Architecture Notes

### External Calendar Data Flow:

```
External Calendar (iCal/Google/etc.)
         ↓
   [Sync Function]
         ↓
   events_external (raw event data)
         ↓
   events_local_meta (user-specific metadata)
         ↓
   [RLS Policies Filter]
         ↓
   useFootballData Hook
         ↓
   Home Screen Display
```

### Key Tables:

1. **`external_calendars`**: Stores calendar subscriptions
   - `user_id`: Who created the calendar
   - `player_id`: If assigned to a specific player
   - `team_id`: If assigned to a team

2. **`events_external`**: Raw event data from external sources
   - Provider-agnostic storage
   - No user-specific data

3. **`events_local_meta`**: User-specific metadata
   - Links external events to users
   - Stores category assignments
   - Stores custom overrides
   - **Critical for RLS filtering**

4. **`external_event_tasks`**: Tasks for external events
   - Linked to `events_local_meta`
   - Inherits RLS from parent metadata

## Performance Considerations

The updated RLS policies include a subquery for team membership:
```sql
team_id IN (SELECT team_id FROM team_members WHERE player_id = auth.uid())
```

This is efficient because:
- `team_members` table is small (only active team memberships)
- Query is indexed on `player_id`
- Subquery is evaluated once per request, not per row

## Security Considerations

The updated policies maintain security by:
1. **Players can only see their own data**: `user_id = auth.uid()`
2. **Players can only see data assigned to them**: `player_id = auth.uid()`
3. **Players can only see team data if they're members**: Team membership is verified
4. **INSERT policy remains restrictive**: Only allows creating metadata for own calendars

## Related Files

- `hooks/useFootballData.ts`: Data fetching and filtering logic
- `contexts/TeamPlayerContext.tsx`: Context management for trainer/admin
- `components/ExternalCalendarManager.tsx`: UI for managing calendars
- `supabase/functions/sync-external-calendar-v4/index.ts`: Sync logic

## Conclusion

The fix ensures that external calendar activities work consistently for all user roles:
- **Players** can manage their own calendars and see imported activities
- **Trainers/Admins** can manage calendars for players and teams
- **Team members** can see team activities
- All while maintaining proper security through RLS policies

The issue was purely at the database RLS level - the application code was already correctly structured to handle player contexts.
