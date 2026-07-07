# Coach Account RLS / API Contract

## Purpose

Issue #278 hardens the multi-tenant boundary for the B2B coach platform. New
coach-platform tables were initially scoped by `coach_account_id`. After #313,
new platform tables should use `owner_account_id`, and write APIs must validate
that owner scope on the server before touching player, report, goal, feedback,
task or billing data.

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

## Owner Account Rules

#313 adds owner-account helpers and tables:

- `owner_accounts`
- `owner_memberships`
- `owner_membership_roles`
- `owner_players`
- `owner_player_guardians`

Owner accounts can represent `club` or `private_coach_business` tenants. A user
can have multiple active roles in the same owner account, for example `owner`,
`admin` and `coach`. Permission checks should use the sum of active roles from
`owner_membership_roles`.

New B2B features should use these helpers:

- `get_current_owner_account_roles(owner_account_id)`
- `has_owner_account_role(owner_account_id, user_id, roles)`
- `is_owner_account_admin(owner_account_id, user_id)`
- `has_owner_account_coach_access(owner_account_id, user_id)`
- `can_owner_account_access_player(owner_account_id, actor_user_id, player_id)`
- `assert_current_owner_account_admin(owner_account_id)`
- `assert_current_owner_account_coach_access(owner_account_id)`
- `get_owner_seat_status(actor_user_id, owner_account_id)`
- `assert_owner_seat_available(actor_user_id, owner_account_id, role)`

`owner_player_guardians` is the explicit parent/guardian relation. Guardian
access remains denied unless an active guardian row exists for that player.

Subscription and seat writes are server-side only. Normal clients can read
owner seat status through RPC/Edge helpers, but super admin provisioning and
cross-user seat changes must go through service-backed flows that validate the
actor first.

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
`admin_player_relationships`. After #313, new product tables should use
`owner_players` and `owner_account_id` as the primary tenant/player relation.

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
