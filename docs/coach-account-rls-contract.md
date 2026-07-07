# Coach Account RLS / API Contract

## Purpose

Issue #278 hardens the multi-tenant boundary for the B2B coach platform. New
coach-platform tables should be scoped by `coach_account_id`, and write APIs
must validate that account scope on the server before touching player, report,
goal, feedback, task or billing data.

This issue does not add a web UI. Base44 is not required for #278.

## Access Matrix

| Actor | Read workspace | Manage workspace | Read player-scoped data | Write coach-scoped player data |
| --- | --- | --- | --- | --- |
| Owner | Own coach account | Yes | Players linked to own workspace | Players linked to own workspace |
| Admin | Own coach account | Yes | Players linked to own workspace | Players linked to own workspace |
| Coach | Own coach account | No | Players linked to own workspace | Players linked to own workspace |
| Assistant | Own coach account | No | Players linked to own workspace | Players linked to own workspace |
| Player | No coach workspace access by default | No | Own player data only | No coach-scoped writes |
| Parent/guardian | No coach workspace access by default | No | None until an explicit child link exists | No |
| Service role | Backfills and Edge Functions only | Backfills and Edge Functions only | Only with a verified actor user id | Only with a verified actor user id |

Parent/guardian access must never be inferred from email, profile text or a
client-supplied role. It should remain denied until a dedicated relation table
links the guardian user to the child player.

## Server-Side Rules

- Normal RPCs should use the `current_user` helpers, which derive the actor from
  `auth.uid()`.
- Edge Functions that use the service role may use the `actor` helpers only
  after verifying the user JWT server-side.
- Client-supplied `role`, `coach_account_id`, `player_id` or workspace context
  is treated as untrusted input until these helpers validate it.
- Direct authenticated creation of a coach account is limited to active
  `personal_coach` workspaces owned by the current user.
- Anonymous access is revoked from `coach_accounts` and `coach_memberships`.

## Helper Contract

The migration adds current-user helpers for Supabase RPC usage:

- `get_current_coach_account_role(coach_account_id)`
- `assert_current_coach_account_member(coach_account_id)`
- `assert_current_coach_account_admin(coach_account_id)`
- `assert_current_coach_account_coach_access(coach_account_id)`
- `can_current_user_read_player_scoped_data(player_id, coach_account_id)`
- `assert_current_user_can_read_player_scoped_data(player_id, coach_account_id)`
- `can_current_user_write_coach_scoped_player_data(coach_account_id, player_id)`
- `assert_current_user_can_write_coach_scoped_player_data(coach_account_id, player_id)`

The migration also adds service-role-only helpers for Edge Functions:

- `get_coach_account_role(coach_account_id, actor_user_id)`
- `assert_actor_coach_account_member(coach_account_id, actor_user_id)`
- `assert_actor_coach_account_admin(coach_account_id, actor_user_id)`
- `assert_actor_coach_account_coach_access(coach_account_id, actor_user_id)`
- `can_actor_read_player_scoped_data(actor_user_id, player_id, coach_account_id)`
- `assert_actor_can_read_player_scoped_data(actor_user_id, player_id, coach_account_id)`
- `can_actor_write_coach_scoped_player_data(coach_account_id, actor_user_id, player_id)`
- `assert_actor_can_write_coach_scoped_player_data(coach_account_id, actor_user_id, player_id)`

The actor-id helpers are intentionally not executable by normal authenticated
users, because accepting an arbitrary actor id from a client would bypass the
tenant boundary.

## Legacy Table Review

The existing app still stores many player workflows without `coach_account_id`.
This issue keeps those policies intact and adds bridge helpers instead of
rewriting stable flows mid-release.

Reviewed legacy areas:

- `profiles`
- `admin_player_relationships`
- `teams`
- `team_members`
- `activities`
- `activity_tasks`
- `task_templates`
- `exercise_library`
- `exercise_assignments`
- `training_reflections`
- `trainer_activity_feedback`
- `clubs`
- `club_members`
- `club_licenses`

For the current bridge, a coach account can access a legacy player only when:

1. the actor is an active `owner`, `admin`, `coach` or `assistant` in that coach
   account, and
2. the player is linked through `admin_player_relationships` to an active coach
   account member.

When #279 introduces `coach_players`, new player-scoped tables should use that
first-class relation instead of adding more direct dependencies on
`admin_player_relationships`. #283 should extend that roster with CRM fields.

## QA Matrix

Use at least two coaches and two players when testing policy behavior:

| Scenario | Expected result |
| --- | --- |
| Coach A reads Coach A player data | Allowed |
| Coach A writes Coach A player report/goal/feedback | Allowed |
| Coach A reads Coach B-only player data | Denied |
| Coach A writes Coach B-only player report/goal/feedback | Denied |
| Player A reads Player A assignments/goals/reports/feedback | Allowed |
| Player A reads Player B assignments/goals/reports/feedback | Denied |
| Parent without an explicit child link reads Player A data | Denied |
| Client sends another user's role or actor id | Ignored by current-user RPC helpers |

Regression checks should include the existing trainer assignment flows for
activities, activity tasks, task templates, exercise assignments and trainer
feedback.
