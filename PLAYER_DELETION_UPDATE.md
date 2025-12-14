
# Player Deletion Feature Update

## Overview
The player deletion functionality has been modified to preserve player accounts and their self-created content when a trainer removes a player from their profile.

## Previous Behavior
- When a trainer deleted a player, the system would:
  - Remove the `admin_player_relationships` entry
  - Check if the player had relationships with other trainers
  - If no other relationships existed, **completely delete the player from `auth.users`**
  - This resulted in permanent loss of the player's account and all data

## New Behavior
When a trainer removes a player from their profile:

1. **Player Account Preserved**: The player's account in `auth.users` is **NOT** deleted
2. **Relationship Removed**: Only the `admin_player_relationships` entry is deleted
3. **Trainer-Assigned Content Deleted**: All content assigned by the trainer to the player is removed:
   - Task templates (`task_templates` where `user_id` = trainer AND `player_id` = player)
   - Exercise assignments (`exercise_assignments` where `trainer_id` = trainer AND `player_id` = player)
   - Activities (`activities` where `user_id` = trainer AND `player_id` = player)
   - Activity categories (`activity_categories` where `user_id` = trainer AND `player_id` = player)
   - Activity series (`activity_series` where `user_id` = trainer AND `player_id` = player)
   - External calendars (`external_calendars` where `user_id` = trainer AND `player_id` = player)
   - Events local meta (`events_local_meta` where `user_id` = trainer AND `player_id` = player)
   - Weekly performance (`weekly_performance` where `user_id` = trainer AND `player_id` = player)

4. **Player-Created Content Preserved**: The player retains:
   - Their user account
   - Their profile
   - Self-created tasks and activities
   - Self-created categories
   - Any content from other trainers they may be connected to

## Technical Implementation

### Edge Function: `delete-player`
**Location**: `supabase/functions/delete-player/index.ts`

**Key Changes**:
- Removed the logic that deleted users from `auth.users`
- Added systematic deletion of trainer-assigned content across all relevant tables
- Updated role check to accept both 'trainer' and 'admin' roles
- Updated response messages to reflect the new behavior

**Deletion Order**:
1. Task templates
2. Exercise assignments
3. Activities (cascade deletes activity_tasks)
4. Activity categories
5. Activity series
6. External calendars
7. Events local meta
8. Weekly performance
9. Admin-player relationship

### UI Component: `PlayersList`
**Location**: `components/PlayersList.tsx`

**Key Changes**:
- Updated confirmation dialog text to explain the new behavior
- Changed success message to clarify that the player account is retained
- Updated icon from "trash" to "person.badge.minus" / "person_remove" to better represent removal vs deletion
- Updated all user-facing text from "slet" (delete) to "fjern" (remove)

## User Experience

### Confirmation Dialog
```
Fjern spiller

Er du sikker på at du vil fjerne [Player Name] fra din profil?

Spilleren vil blive fjernet fra din liste, og alle opgaver og aktiviteter 
du har tildelt spilleren vil blive slettet.

Spilleren beholder sin egen konto og selvoprettede opgaver og aktiviteter.
```

### Success Message
```
[Player Name] er blevet fjernet fra din profil.

Spilleren beholder sin egen konto og selvoprettede opgaver og aktiviteter.

De opgaver og aktiviteter du har tildelt spilleren er blevet slettet.
```

## Database Impact

### Tables Modified (Content Deleted)
- `task_templates` - Trainer's templates assigned to player
- `exercise_assignments` - Trainer's exercise assignments to player
- `activities` - Trainer's activities for player
- `activity_categories` - Trainer's categories for player
- `activity_series` - Trainer's recurring activities for player
- `external_calendars` - Trainer's calendar syncs for player
- `events_local_meta` - Trainer's event metadata for player
- `weekly_performance` - Trainer's performance records for player
- `admin_player_relationships` - The trainer-player connection

### Tables Preserved (Player's Content)
- `auth.users` - Player's account
- `profiles` - Player's profile
- `user_roles` - Player's role
- All content where `user_id` = player (self-created)
- All content from other trainers

## Benefits

1. **Player Autonomy**: Players maintain their accounts and can continue using the app independently
2. **Multi-Trainer Support**: Players can work with multiple trainers without risk of account deletion
3. **Data Preservation**: Players don't lose their self-created content when a trainer removes them
4. **Cleaner Separation**: Clear distinction between trainer-assigned and player-created content
5. **Better UX**: More intuitive behavior that matches user expectations

## Testing Recommendations

1. **Single Trainer Scenario**: 
   - Create a player with one trainer
   - Assign tasks and activities from trainer to player
   - Remove player from trainer's profile
   - Verify player can still log in
   - Verify player's self-created content remains
   - Verify trainer's assigned content is deleted

2. **Multiple Trainer Scenario**:
   - Create a player with two trainers
   - Assign content from both trainers
   - Remove player from one trainer's profile
   - Verify player still has access to other trainer's content
   - Verify only the removing trainer's content is deleted

3. **Edge Cases**:
   - Player with no self-created content
   - Player with only trainer-assigned content
   - Cascading deletions (activities → tasks → subtasks)

## Migration Notes

- No database migration required
- Existing players are unaffected
- Change is backward compatible
- Only affects future deletion operations

## API Response

The Edge Function now returns:
```json
{
  "success": true,
  "message": "Player removed from your profile successfully",
  "playerAccountRetained": true
}
```

The `playerAccountRetained` flag indicates the new behavior and can be used by the UI to provide appropriate feedback.
