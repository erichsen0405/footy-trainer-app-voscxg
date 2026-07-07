# Coach Workspace Legacy Migration Plan

## Purpose

Issue #279 migrates the existing trainer/player/team/club foundation into the
new coach workspace model without removing or rewriting player history.

This issue does not add a web UI. Base44 is not required for #279.

This issue must not be deployed with `eas update`. App release remains a final
App Store build/release decision.

## Migrated Data

The migration creates `coach_players`, a compatibility roster scoped by
`coach_account_id`.

Backfill sources:

- `admin_player_relationships`
- accepted `player_invitations`
- accepted `admin_player_link_requests`
- `teams`
- `team_members`
- active club staff in `club_members` with role `owner`, `admin` or `coach`

Team-derived roster links preserve `teams.club_id` in `coach_players.club_id`
when the team belongs to an existing club.

The migration also adds nullable `coach_account_id` columns to:

- `teams`
- `player_invitations`
- `admin_player_link_requests`

Existing app flows keep using the legacy tables during the transition. Triggers
keep new legacy writes synced into the workspace layer.

## Safety Rules

- No `activities`, `activity_tasks`, `task_templates`, `training_reflections`,
  `trainer_activity_feedback`, `weekly_performance` or player history rows are
  updated by this migration.
- Team memberships are preserved and copied into `coach_players`.
- Pending invitations are preserved even when `player_id` is still null.
- Accepted invitations and accepted link requests are linked to the relevant
  coach account and player.
- Club memberships remain in the club module. The migration creates personal
  coach workspaces for active club staff, but does not grant every club coach
  access to every club player unless there is also a trainer/player, invitation,
  request or team membership relation.

## Compatibility Layer

The migration adds:

- `get_coach_workspace_legacy_relationships(coach_account_id)`
- `get_coach_workspace_migration_audit()`
- triggers that sync legacy writes into `coach_players`

The #278 helper `can_coach_account_access_legacy_player(...)` now checks
`coach_players` first and falls back to `admin_player_relationships` during the
transition.

## QA Matrix

Test with seed data covering:

| Case | Expected result |
| --- | --- |
| Single trainer with accepted player link | trainer gets a coach account and `coach_players` row |
| Trainer with pending invitation | invitation gets `coach_account_id`; no player row until accepted |
| Trainer with accepted invitation | invitation gets `coach_account_id` and active `coach_players` row |
| Trainer with team and team members | team gets `coach_account_id`; members get active `coach_players` rows |
| Club team with team members | team-derived `coach_players` rows preserve `club_id` |
| Active club owner/admin/coach | user gets a migration coach account and owner membership |
| Club player with no direct trainer/team relation | no personal coach access is granted automatically |

Run `get_coach_workspace_migration_audit()` with service role after deployment.
All issue counts should be zero before production rollout.

## Rollback Plan

Before production rollout:

1. Run `get_coach_workspace_migration_audit()` and export result rows.
2. Confirm a database backup or point-in-time recovery window exists.
3. Confirm no app code depends exclusively on `coach_players`.

If rollback is required before app code depends on the new layer:

1. Disable new sync triggers on `admin_player_relationships`,
   `player_invitations`, `admin_player_link_requests`, `teams` and
   `team_members`.
2. Drop `coach_players`.
3. Drop nullable `coach_account_id` columns from `teams`, `player_invitations`
   and `admin_player_link_requests`.
4. Keep `coach_accounts` and `coach_memberships` unless rolling back #277 as
   well.

Do not delete or rewrite legacy player history tables during rollback.
