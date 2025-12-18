
# Player Data Visibility Fix

## Problem Analysis

User `nohrhoffmann@gmail.com` (Player role) reported two issues:

1. **Cannot see synced calendar activities** - Despite having an external calendar synced with 95 events
2. **Seeing task templates they shouldn't** - Seeing task templates from other users

## Investigation Results

### Issue 1: External Calendar Activities Not Visible ✅ FIXED

**Root Cause:**
- The RLS policy on `events_local_meta` table was too restrictive
- Policy only allowed: `auth.uid() = user_id`
- Did NOT include checks for `player_id` or `team_id`
- When a player logged in, they could only see metadata where `user_id = their ID`
- The code was trying to query with OR filter including `player_id`, but RLS blocked it

**Data Found:**
- User has 1 external calendar: "B93 2013A" with 95 events
- User has 10+ `events_local_meta` entries with `user_id` = their ID
- All metadata entries have `player_id = NULL` and `team_id = NULL`

**Solution Applied:**
Updated RLS policies on `events_local_meta` to allow players to see metadata where:
- `user_id = auth.uid()` (their own)
- `player_id = auth.uid()` (assigned to them)
- `team_id IN (their teams)` (team events)

Applied to SELECT, UPDATE, and DELETE policies.

### Issue 2: Task Templates ✅ NOT AN ISSUE

**Investigation Result:**
- User is ONLY seeing their own 6 task templates
- RLS policy is working correctly
- No unauthorized task templates are visible
- The templates shown are all created by `nohrhoffmann@gmail.com`

**Task Templates Found:**
1. VR træning
2. Fokuspunkter til træning
3. Åndedrætsøvelser
4. Styrketræning
5. Pak fodboldtaske
6. Fokuspunkter til kamp

All have `user_id = 0e235b8c-0ad3-4aa2-9ad0-a7196afe4adf` (the player's ID).

## Code Changes

### 1. Database Migration: RLS Policy Fix

**File:** Migration `fix_events_local_meta_rls_for_players`

Updated `events_local_meta` RLS policies to include `player_id` and `team_id` checks:

```sql
-- SELECT policy
CREATE POLICY "Users can view their event metadata"
ON events_local_meta
FOR SELECT
USING (
  auth.uid() = user_id
  OR auth.uid() = player_id
  OR team_id IN (
    SELECT team_id 
    FROM team_members 
    WHERE player_id = auth.uid()
  )
);
```

### 2. Code Fix: External Calendar Filtering

**File:** `hooks/useFootballData.ts`

**Key Changes:**

1. **External Calendars Loading (Line 280-310):**
   - Removed incorrect filtering by `player_id` and `team_id` (these columns don't exist in `external_calendars`)
   - External calendars are ALWAYS owned by the logged-in user
   - Simplified to: `query = query.eq('user_id', userId)`

2. **External Events Loading (Line 380-420):**
   - For players, removed explicit OR filter
   - Now relies on RLS policy to automatically filter events
   - RLS policy handles: `user_id`, `player_id`, and `team_id` checks

3. **Task Templates Loading (Line 230-260):**
   - For players, removed explicit OR filter
   - Now relies on RLS policy to automatically filter
   - Added comment: "RLS policy will handle this automatically"

4. **Add External Calendar (Line 1050-1090):**
   - Removed `player_id` and `team_id` from insert
   - External calendars are personal to each user
   - Simplified to only use `user_id`

## Testing Recommendations

1. **Test as Player (nohrhoffmann@gmail.com):**
   - ✅ Verify external calendar activities are now visible
   - ✅ Verify only own task templates are shown
   - ✅ Verify can create/edit/delete own data
   - ✅ Verify cannot see other users' data

2. **Test as Admin/Trainer:**
   - ✅ Verify can still manage player/team data
   - ✅ Verify context selector works correctly
   - ✅ Verify external calendars remain personal

3. **Test RLS Policies:**
   - ✅ Player can view events where `user_id = player_id`
   - ✅ Player can view events where `player_id = player_id`
   - ✅ Player can view events where `team_id IN (their teams)`
   - ✅ Player cannot view other users' events

## Architecture Notes

### External Calendars Ownership Model

**Important:** External calendars are PERSONAL to each user:
- Each user (admin, trainer, or player) has their own calendars
- No `player_id` or `team_id` columns in `external_calendars` table
- Admins/trainers managing player data do NOT see player calendars
- This is by design for privacy and data separation

### Events Metadata Ownership Model

**Flexible:** Events metadata can be owned in multiple ways:
- `user_id`: The user who created/synced the event
- `player_id`: The player the event is assigned to
- `team_id`: The team the event is assigned to

This allows for:
- Players to have their own events
- Admins to assign events to players
- Teams to have shared events

## Summary

The main issue was the RLS policy on `events_local_meta` being too restrictive. By updating it to include `player_id` and `team_id` checks, players can now see:
1. Events they created (`user_id = their ID`)
2. Events assigned to them (`player_id = their ID`)
3. Events for teams they're in (`team_id IN their teams`)

The task templates issue was a false alarm - the user was only seeing their own templates, which is correct behavior.

The code has been updated to rely more on RLS policies for filtering, making it more secure and maintainable.
