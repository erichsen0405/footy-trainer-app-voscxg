# Base44 Prompt: Player Coach Links And Team Memberships

Use this prompt in Base44 for the web admin app.

## Goal

Fix player management so coach assignments and team memberships are persisted in the exact Supabase tables the mobile app reads from.

## Database Contract

The mobile app does not read a coach field from `profiles`.

Coach-to-player access must be stored in:

- `public.admin_player_relationships`
- Columns: `admin_id`, `player_id`
- Unique key: `(admin_id, player_id)`
- `admin_id` is the coach/trainer/admin auth user id.
- `player_id` is the player auth user id.

Team membership must be stored in:

- `public.team_members`
- Columns: `team_id`, `player_id`
- Unique key: `(team_id, player_id)`
- `team_id` references `public.teams.id`
- `player_id` references the player auth user id.

Teams are owned by:

- `public.teams.admin_id`

Roles are stored in:

- `public.user_roles`
- Valid roles include `admin`, `trainer`, and `player`.

## Required Fixes

1. Fix "add coach to player"

- When a coach is selected for a player, insert or upsert into `public.admin_player_relationships`.
- Do not only update a field on the player/profile record.
- Use the selected coach user id as `admin_id`.
- Use the selected player user id as `player_id`.
- Make the write idempotent with `onConflict: 'admin_id,player_id'` or an equivalent existence check before insert.
- After saving, reload the player row from `admin_player_relationships` so the UI reflects the persisted link.

2. Add team assignment directly from player list and member list

- Add a "Team" action/control on both the player list and the members list.
- It must allow adding a player to one or more existing teams.
- On save, write to `public.team_members`.
- Use `team_id` from `public.teams.id`.
- Use the player auth user id as `player_id`.
- Make writes idempotent with `onConflict: 'team_id,player_id'` or by skipping rows already present.
- Refresh team membership after saving.

3. Validation

- Validate that the selected player has role `player` in `public.user_roles`.
- Validate that the selected coach has role `admin` or `trainer`.
- Validate that selected teams belong to the relevant coach/admin context via `public.teams.admin_id`.
- If the user is a club/platform admin operating across coaches, use the active coach/admin context to determine allowed teams.

## Suggested Supabase Operations

Add coach to player:

```ts
await supabase
  .from('admin_player_relationships')
  .upsert(
    { admin_id: coachUserId, player_id: playerUserId },
    { onConflict: 'admin_id,player_id' },
  );
```

Add player to teams:

```ts
await supabase
  .from('team_members')
  .upsert(
    teamIds.map((teamId) => ({ team_id: teamId, player_id: playerUserId })),
    { onConflict: 'team_id,player_id' },
  );
```

Fetch player with coach:

```ts
const { data } = await supabase
  .from('admin_player_relationships')
  .select('admin_id, player_id, created_at')
  .eq('player_id', playerUserId);
```

Fetch player teams:

```ts
const { data } = await supabase
  .from('team_members')
  .select('team_id, teams(id, name, admin_id)')
  .eq('player_id', playerUserId);
```

## Acceptance Criteria

- Assigning a coach to a player creates a row in `admin_player_relationships`.
- Reassigning/saving the same coach-player pair does not create duplicates or errors.
- The mobile app profile/player views show the assigned coach after refresh.
- Adding a player to a team from either list creates a row in `team_members`.
- Re-saving the same team-player pair is safe and does not error.
- Team lists in the mobile app include the player after refresh.
- No logic depends on a non-canonical coach field on `profiles`.
