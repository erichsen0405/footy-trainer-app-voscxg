
# Team and Player Management Implementation

## Overview

This implementation adds comprehensive team management and player/team selection functionality to the app. Admins can now:

1. **Create and manage teams**
2. **Assign players to teams**
3. **Select a specific player or team** before managing activities
4. **All activities, categories, tasks, and performance data are now contextualized** to the selected player or team

## Database Changes

### New Tables

#### `teams`
- Stores team information
- Fields: `id`, `admin_id`, `name`, `description`, `created_at`, `updated_at`
- RLS policies ensure admins can only manage their own teams

#### `team_members`
- Junction table linking teams and players
- Fields: `id`, `team_id`, `player_id`, `created_at`
- Unique constraint on `(team_id, player_id)` to prevent duplicates
- RLS policies ensure admins can only manage members of their own teams

### Modified Tables

The following tables now have `team_id` and `player_id` columns to support contextualization:

- `activities`
- `activity_categories`
- `task_templates`
- `activity_series`
- `weekly_performance`
- `external_calendars`
- `events_local_meta`

### Updated RLS Policies

RLS policies have been updated to allow:
- Admins to view/manage data for their selected team/player
- Players to view data assigned to them or their teams
- Proper data isolation between different contexts

## New Components

### `TeamPlayerContext` (`contexts/TeamPlayerContext.tsx`)

Central context for managing teams, players, and selection state:

**State:**
- `teams`: List of all teams
- `players`: List of all players
- `selectedContext`: Currently selected player or team
- `loading`: Loading state

**Functions:**
- `setSelectedContext(context)`: Set the active player/team
- `createTeam(name, description)`: Create a new team
- `updateTeam(teamId, name, description)`: Update team details
- `deleteTeam(teamId)`: Delete a team
- `addPlayerToTeam(teamId, playerId)`: Add player to team
- `removePlayerFromTeam(teamId, playerId)`: Remove player from team
- `getTeamMembers(teamId)`: Get all members of a team
- `refreshTeams()`: Reload teams from database
- `refreshPlayers()`: Reload players from database

**Selection Persistence:**
- Selected context is saved to AsyncStorage
- Automatically restored on app restart

### `TeamManagement` (`components/TeamManagement.tsx`)

Full-featured team management interface:

**Features:**
- List all teams with descriptions
- Create new teams
- Edit team details
- Delete teams
- View team members
- Add/remove players from teams
- Empty states for no teams/members

**UI Elements:**
- Team cards with icons and actions
- Modal for creating teams
- Modal for editing teams
- Modal for managing team members
- Add/remove player buttons

### `TeamPlayerSelector` (`components/TeamPlayerSelector.tsx`)

Selection interface for choosing active context:

**Features:**
- Prominent selector button showing current selection
- Warning when no selection is made
- Modal with separate sections for players and teams
- Visual indication of selected item
- Icons differentiate between players and teams

**User Experience:**
- Clear visual feedback for selection state
- Warning box when no context is selected
- Easy switching between players and teams

## Updated Components

### `admin.tsx`

Updated admin screen to include:
- Team/Player selector at the top
- Team management section
- Updated info text to mention teams
- Refresh players list after creating new player

### `_layout.tsx`

Updated to wrap the app with `TeamPlayerProvider`:
```tsx
<SubscriptionProvider>
  <TeamPlayerProvider>
    <FootballProvider>
      {/* App content */}
    </FootballProvider>
  </TeamPlayerProvider>
</SubscriptionProvider>
```

## Usage Flow

### For Admins

1. **Initial Setup:**
   - Create players (existing functionality)
   - Create teams
   - Assign players to teams

2. **Before Managing Activities:**
   - Select a player or team from the selector
   - The selection is saved and persists across app restarts

3. **Managing Activities:**
   - All created activities are automatically associated with the selected context
   - Activities are filtered to show only those for the selected context

### For Players

- Players can only see activities assigned to them or their teams
- No access to team management or player creation
- Simplified interface focused on their own activities

## Data Isolation

### How It Works

1. **Creation:**
   - When an admin creates an activity, it's automatically tagged with:
     - `user_id`: The admin who created it
     - `team_id` or `player_id`: The selected context

2. **Retrieval:**
   - RLS policies filter data based on:
     - Admin: Can see all data for their players/teams
     - Player: Can only see data assigned to them or their teams

3. **Updates/Deletes:**
   - Only the creating admin can modify/delete data
   - Players have read-only access

## Migration Notes

### Existing Data

- Existing activities, categories, and tasks will have `NULL` for `team_id` and `player_id`
- These will still be visible to the admin who created them
- Admins should:
  1. Select a player/team
  2. Manually reassign existing data if needed

### Backward Compatibility

- The app continues to work without a selection
- However, a warning is shown to encourage selection
- New data creation requires a selection

## Future Enhancements

Potential improvements for future versions:

1. **Bulk Assignment:**
   - Tool to bulk-assign existing activities to teams/players

2. **Team Statistics:**
   - Aggregate performance metrics for entire teams
   - Team leaderboards

3. **Multi-Team Players:**
   - Better UI for players who belong to multiple teams
   - Team-specific views

4. **Team Calendars:**
   - Shared calendars for entire teams
   - Team-wide events

5. **Permissions:**
   - Team captains with limited admin rights
   - Parent/guardian access

## Testing Checklist

- [ ] Create a team
- [ ] Add players to team
- [ ] Remove players from team
- [ ] Edit team details
- [ ] Delete team
- [ ] Select a player
- [ ] Select a team
- [ ] Create activity with player selected
- [ ] Create activity with team selected
- [ ] Verify data isolation (player can't see other player's data)
- [ ] Verify selection persists after app restart
- [ ] Test with no selection (warning should appear)

## Technical Notes

### Performance Considerations

- Indexes added on `team_id` and `player_id` columns for fast filtering
- RLS policies optimized to use indexes
- Selection state cached in AsyncStorage to avoid database queries

### Security

- RLS policies prevent unauthorized access
- Players cannot see other players' data
- Admins can only manage their own teams/players
- Cascade deletes ensure data consistency

### Error Handling

- Comprehensive error messages for all operations
- Graceful handling of network failures
- Validation before database operations
- User-friendly alerts for all errors

## API Reference

### TeamPlayerContext

```typescript
interface TeamPlayerContextType {
  teams: Team[];
  players: Player[];
  selectedContext: SelectedContext;
  loading: boolean;
  setSelectedContext: (context: SelectedContext) => Promise<void>;
  refreshTeams: () => Promise<void>;
  refreshPlayers: () => Promise<void>;
  createTeam: (name: string, description?: string) => Promise<Team>;
  updateTeam: (teamId: string, name: string, description?: string) => Promise<void>;
  deleteTeam: (teamId: string) => Promise<void>;
  addPlayerToTeam: (teamId: string, playerId: string) => Promise<void>;
  removePlayerFromTeam: (teamId: string, playerId: string) => Promise<void>;
  getTeamMembers: (teamId: string) => Promise<Player[]>;
}
```

### Types

```typescript
interface Team {
  id: string;
  admin_id: string;
  name: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

interface Player {
  id: string;
  email: string;
  full_name: string;
  phone_number?: string;
}

type SelectionType = 'player' | 'team' | null;

interface SelectedContext {
  type: SelectionType;
  id: string | null;
  name: string | null;
}
```

## Conclusion

This implementation provides a robust foundation for multi-player and multi-team management. The architecture is scalable and can be extended with additional features as needed. The data isolation ensures proper security and privacy for all users.
