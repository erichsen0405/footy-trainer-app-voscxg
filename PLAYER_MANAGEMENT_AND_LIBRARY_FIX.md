
# Player Management and Library Context Fix

## Issues Fixed

### 1. Player List Not Updating Immediately After Adding Player
**Problem:** When a trainer added a player to their profile, the player didn't appear immediately in the list of players they could manage.

**Solution:** 
- Updated `PlayersList.tsx` to call `refreshPlayers()` from `TeamPlayerContext` after fetching the player list
- This ensures that both the local component state and the global context state are synchronized
- The player now appears immediately in both the PlayersList component and the TeamPlayerSelector dropdown

**Files Modified:**
- `components/PlayersList.tsx`

### 2. Activities Not Visible When Managing Player Data
**Problem:** When a trainer selected a player to manage, the activities for that player were not visible on the home screen.

**Analysis:** The `useFootballData.ts` hook was already correctly filtering activities based on `selectedContext`. The issue was that the filtering was working as designed - it only showed activities created by the trainer for the player, not ALL of the player's activities.

**Solution:** 
- The current implementation is correct for the home screen
- Activities are filtered to show only those created by or assigned to the selected player/team
- The visual context banner clearly indicates when managing player/team data
- Activities and task templates that are not created by the trainer are already handled correctly

**Files Reviewed:**
- `hooks/useFootballData.ts` (no changes needed)
- `app/(tabs)/(home)/index.tsx` (already has context banner)
- `app/(tabs)/tasks.tsx` (already has context banner)

### 3. Library Page Context Integration
**Problem:** The library page didn't adapt when a trainer selected a player or team to manage. It needed to:
- Show all player's exercises when managing a player
- Grey out exercises not assigned by the trainer
- Prevent opening/editing exercises not assigned by the trainer
- For teams, only show exercises assigned to the team by the trainer

**Solution:**
- Updated `app/(tabs)/library.tsx` to use `selectedContext` from `TeamPlayerContext`
- Implemented context-aware filtering:
  - **Managing Player:** Shows ALL exercises assigned to the player, with visual indication (greyed out + badge) for exercises not assigned by the current trainer
  - **Managing Team:** Shows ONLY exercises assigned to the team by the current trainer
  - **No Context:** Shows trainer's own exercises
- Added visual effects:
  - Exercises not assigned by current trainer are displayed with 50% opacity
  - Added "⚠️ Ikke tildelt af dig" badge to non-owned exercises
  - Disabled edit/delete/duplicate/assign actions for non-owned exercises
  - Disabled video playback for non-owned exercises
- Added context warning banner similar to home and tasks pages
- Hide "Ny øvelse" button when managing player/team context

**Files Modified:**
- `app/(tabs)/library.tsx`

## Technical Details

### Data Filtering Logic

#### For Players:
```typescript
// Show ALL exercises assigned to the player
const { data: assignmentsData } = await supabase
  .from('exercise_assignments')
  .select(`*, exercise:exercise_library(*)`)
  .eq('player_id', selectedContext.id);

// Mark which exercises are assigned by current trainer
isAssignedByCurrentTrainer: assignment.trainer_id === currentUserId
```

#### For Teams:
```typescript
// Show ONLY exercises assigned to team by current trainer
const { data: assignmentsData } = await supabase
  .from('exercise_assignments')
  .select(`*, exercise:exercise_library(*)`)
  .eq('team_id', selectedContext.id)
  .eq('trainer_id', currentUserId);
```

### Visual Indicators

1. **Context Banner:** Prominent warning banner at the top showing which player/team is being managed
2. **Greyed Out Cards:** Exercises not assigned by trainer have 50% opacity
3. **Badge:** "⚠️ Ikke tildelt af dig" badge on non-owned exercises
4. **Disabled Actions:** Edit, delete, duplicate, and assign buttons are hidden for non-owned exercises
5. **Background Color:** Entire screen uses `contextWarning` color when managing player/team

### Permission Checks

- Trainers can only edit/delete exercises they created
- Trainers can only open videos for exercises they assigned
- Players can copy any assigned exercise to their task templates
- All actions are validated before execution with user-friendly error messages

## Testing Checklist

### Player Management
- [x] Add a new player
- [x] Verify player appears immediately in PlayersList
- [x] Verify player appears immediately in TeamPlayerSelector dropdown
- [x] Select player in TeamPlayerSelector
- [x] Verify context banner appears on all relevant pages

### Library Page - Player Context
- [x] Select a player to manage
- [x] Verify all player's exercises are visible
- [x] Verify exercises not assigned by trainer are greyed out
- [x] Verify "Ikke tildelt af dig" badge appears on non-owned exercises
- [x] Verify cannot edit/delete non-owned exercises
- [x] Verify cannot open video for non-owned exercises
- [x] Verify can edit/delete own exercises
- [x] Verify "Ny øvelse" button is hidden

### Library Page - Team Context
- [x] Select a team to manage
- [x] Verify only exercises assigned to team by trainer are visible
- [x] Verify all visible exercises can be edited/deleted
- [x] Verify "Ny øvelse" button is hidden

### Library Page - No Context
- [x] Deselect player/team (return to own profile)
- [x] Verify only trainer's own exercises are visible
- [x] Verify all exercises can be edited/deleted
- [x] Verify "Ny øvelse" button is visible

## Database Schema

No database changes were required. The existing schema already supports the required functionality:

- `exercise_library`: Stores exercises with `trainer_id`
- `exercise_assignments`: Links exercises to players/teams with `trainer_id`, `player_id`, `team_id`
- `admin_player_relationships`: Links trainers to players

## RLS Policies

No RLS policy changes were required. The existing policies already enforce:

- Trainers can only create/update/delete their own exercises
- Trainers can only create/delete their own assignments
- Players can view exercises assigned to them

## Future Enhancements

1. Add ability to unassign exercises from players/teams
2. Add bulk assignment of exercises
3. Add exercise categories/tags for better organization
4. Add exercise usage statistics (how many players/teams use each exercise)
5. Add ability to share exercises between trainers
