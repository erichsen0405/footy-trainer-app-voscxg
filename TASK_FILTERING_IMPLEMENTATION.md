
# Task and Activity Filtering Implementation

## Overview
This document describes the implementation of task and activity filtering based on trainer/player selection and team management.

## Requirements (Danish)
1. **Opgaveside**: Skal kun vise opgaver oprettet på den bruger der er logget ind, eller opgaver tildelt af en træner
2. **Træner opgaveskabeloner**: Trænere kan oprette opgaveskabeloner på spillere, som bliver synlige på spillerens profil
3. **Træner spiller-valg**: Når en træner vælger en spiller, vises kun aktiviteter og opgaver for den valgte spiller
4. **Træner team-valg**: Når en træner vælger et team, vises kun aktiviteter og opgaver fælles for alle spillere i teamet

## Database Schema

### Key Fields Added
All relevant tables now have these fields:
- `player_id` (uuid, nullable): References the player this item is assigned to
- `team_id` (uuid, nullable): References the team this item is assigned to

### Tables Updated
- `activities`: Activities can be assigned to specific players or teams
- `task_templates`: Task templates can be assigned to specific players or teams
- `activity_categories`: Categories can be assigned to specific players or teams
- `external_calendars`: External calendars can be assigned to specific players or teams
- `activity_series`: Recurring activity series can be assigned to specific players or teams
- `events_local_meta`: External event metadata can be assigned to specific players or teams
- `weekly_performance`: Performance tracking can be assigned to specific players or teams

### RLS Policies
The existing RLS policies already support the new fields:
- Users can view their own data (`user_id = auth.uid()`)
- Users can view data assigned to them (`player_id = auth.uid()`)
- Users can view data for teams they're members of (`team_id IN (SELECT team_id FROM team_members WHERE player_id = auth.uid())`)
- Admins can view their players' data through `admin_player_relationships`

## Implementation

### 1. TeamPlayerContext
The `TeamPlayerContext` manages the selected context (player or team):

```typescript
export interface SelectedContext {
  type: 'player' | 'team' | null;
  id: string | null;
  name: string | null;
}
```

- Persists selection to AsyncStorage
- Provides functions to manage teams and players
- Used by `useFootballData` to filter data

### 2. useFootballData Hook
Updated to filter all data based on selected context:

#### For Trainers/Admins:
- **No selection**: Show only trainer's own data
- **Player selected**: Show trainer's data + data assigned to selected player
- **Team selected**: Show trainer's data + data assigned to selected team

#### For Players:
- Always show own data + data assigned to them (via `player_id`)

#### Filtering Logic:
```typescript
// Example for activities
if (userRole === 'trainer' || userRole === 'admin') {
  if (selectedContext.type === 'player' && selectedContext.id) {
    query = query.or(`user_id.eq.${userId},player_id.eq.${selectedContext.id}`);
  } else if (selectedContext.type === 'team' && selectedContext.id) {
    query = query.or(`user_id.eq.${userId},team_id.eq.${selectedContext.id}`);
  } else {
    query = query.eq('user_id', userId);
  }
} else {
  // Player
  query = query.or(`user_id.eq.${userId},player_id.eq.${userId}`);
}
```

### 3. Creating Data with Context
When trainers create activities, tasks, or other data:

```typescript
// Determine player_id and team_id based on selected context
let player_id = null;
let team_id = null;

if (userRole === 'trainer' || userRole === 'admin') {
  if (selectedContext.type === 'player' && selectedContext.id) {
    player_id = selectedContext.id;
  } else if (selectedContext.type === 'team' && selectedContext.id) {
    team_id = selectedContext.id;
  }
}

// Include in insert
await supabase.from('activities').insert({
  user_id: userId,
  // ... other fields
  player_id,
  team_id,
});
```

### 4. UI Updates

#### Trainer Page
- Shows `TeamPlayerSelector` component at the top
- Allows trainers to select a player or team
- Selection persists across app restarts

#### Tasks Page
- Shows context info for trainers (which player/team is selected)
- Shows info for players about seeing their own + assigned tasks
- Task templates created by trainers are automatically assigned based on selected context

#### Home Page
- Filters activities based on selected context
- Shows only relevant activities for the selected player/team

## User Flows

### Trainer Creating Task for Player
1. Trainer opens trainer page
2. Selects a specific player from TeamPlayerSelector
3. Navigates to tasks page
4. Creates a new task template
5. Task template is automatically assigned to selected player (`player_id` set)
6. Player can now see this task template on their tasks page

### Trainer Creating Activity for Team
1. Trainer opens trainer page
2. Selects a specific team from TeamPlayerSelector
3. Navigates to home page
4. Creates a new activity
5. Activity is automatically assigned to selected team (`team_id` set)
6. All players in the team can now see this activity

### Player Viewing Tasks
1. Player opens tasks page
2. Sees their own task templates (`user_id = player_id`)
3. Also sees task templates assigned to them by trainer (`player_id = player_id`)
4. Task templates are automatically applied to matching activities

## Benefits

1. **Data Isolation**: Each user only sees relevant data
2. **Flexible Management**: Trainers can manage individual players or entire teams
3. **Automatic Assignment**: Data is automatically assigned based on selected context
4. **Persistent Selection**: Selected context persists across app restarts
5. **RLS Security**: Database-level security ensures data access control

## Testing Checklist

- [ ] Player can see own tasks and tasks assigned by trainer
- [ ] Trainer can select a player and see only that player's data
- [ ] Trainer can select a team and see only team-wide data
- [ ] Trainer can create tasks for specific players
- [ ] Trainer can create activities for specific teams
- [ ] Selection persists after app restart
- [ ] RLS policies prevent unauthorized access
- [ ] Home page shows filtered activities
- [ ] Tasks page shows filtered task templates
- [ ] Performance page shows filtered performance data

## Future Enhancements

1. **Bulk Assignment**: Allow trainers to assign tasks to multiple players at once
2. **Task Templates Library**: Create a library of common task templates
3. **Team Templates**: Create templates specifically for teams
4. **Assignment History**: Track when tasks were assigned to players
5. **Notification System**: Notify players when new tasks are assigned
