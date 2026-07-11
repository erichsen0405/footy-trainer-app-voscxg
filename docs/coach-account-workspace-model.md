# Coach Account / Workspace Model

## Purpose

The B2B coach platform needs a first-class owner scope above players,
activities and tasks:

```text
OwnerAccount -> Staff/Roles -> Players -> Programs/Activities -> Tasks -> Feedback/Progression
```

The existing app remains player-friendly. Players should still experience the
product as "my activities, my tasks and my development", while coaches get a
workspace where CRM, programs, reports, reminders and assistant coaches can
live.

## New Foundation

Issue #277 introduces two tables:

- `coach_accounts`: the top-level personal coach workspace.
- `coach_memberships`: users who can access a coach account.

`coach_accounts.owner_user_id` is the immutable owner of the workspace.
`coach_memberships.role` supports:

- `owner`
- `admin`
- `coach`
- `assistant`

Future B2B coach tables should include a `coach_account_id` foreign key instead
of relying only on `user_id`, `trainer_id`, `admin_id` or implicit context.

## Relationship to Clubs

The existing `clubs`, `club_members` and `club_licenses` module is an
organization/club B2B model. It should stay separate from personal coach
accounts in the first implementation.

Rationale:

- Clubs are license/organization-led and can contain many coaches and players.
- Personal coach accounts are coach/business-led and need CRM, branding,
  booking, waitlist and package sales around one coaching business.
- Keeping them separate avoids forcing private coaches into the club data model.

The `coach_accounts.source` field reserves a `club_bridge` value for a later
bridge if a club coach also needs a personal coach workspace, or if club-owned
coach workspaces are introduced.

## Owner Account Unification

Issue #313 supersedes the two-track product direction with a unified owner
account contract:

```text
owner_accounts
  owner_type: club | private_coach_business
```

`coach_accounts` and `clubs` remain compatibility/source tables, but new B2B
platform features should scope data by `owner_account_id`.

The #313 owner layer supports multi-role users. A private coach business owner
can be `owner`, `admin` and `coach` on the same email/user, and permission
checks should use the sum of active roles from `owner_membership_roles`.

## Migration Path

The migration should be incremental:

1. Preserve existing `coach_accounts` rows and repair memberships for those
   rows where needed.
2. Do not auto-create new default `coach_accounts` rows from legacy/default
   helper flows. New private coach workspaces are provisioned only by Apple
   trainer subscription sync or platform-admin creation.
3. Create an active `owner` row in `coach_memberships` only for existing or
   explicitly provisioned coach accounts.
4. Keep existing `admin_player_relationships`, `teams`, `team_members`,
   activity assignment RPCs and trainer feedback flows working as-is.
5. #313 adds `owner_account_id` as the new shared top-level scope for clubs and
   private coach businesses.
6. #281 adds owner-aware subscription plans, owner subscriptions, super admin
   seat adjustments and effective seat RPCs on `owner_account_id`.
7. Later issues should add `owner_account_id` to new B2B tables such as CRM,
   programs, goals, reports, reminders, chat, tests, booking and payments.
8. Existing player activity/task history should not be moved or rewritten until
   a dedicated migration issue explicitly handles that scope.

This lets `Player -> Activities -> Tasks` continue to work while the new
`CoachAccount -> Players -> Programs/Activities -> Tasks` model is introduced
above it.

## RLS Rules

The foundation adds security-definer helpers:

- `is_coach_account_member(coach_account_id, user_id)`
- `is_coach_account_admin(coach_account_id, user_id)`
- `has_coach_account_coach_access(coach_account_id, user_id)`
- `get_default_coach_account_id(user_id)`
- `ensure_default_coach_account(user_id, account_name)`

RLS rules allow:

- active members to read their coach account and memberships,
- authenticated users to read/use existing coach accounts they are members of,
- owners/admins to update account settings and memberships,
- owner membership to remain tied to the immutable account owner.

Authenticated clients must not insert new `coach_accounts` directly. New
personal coach workspaces are created only through the guarded Apple trainer
subscription sync or the guarded platform-admin provisioning flow.

The service role can still perform controlled backfills and platform migrations,
but automatic workspace creation is restricted to the explicit Apple trainer
subscription and platform-admin provisioning flows.

## Next Issues

- #278 should harden RLS/API usage across new and existing coach data.
- #279 should backfill existing trainer/player/club relations into coach
  workspaces and introduce the compatibility `coach_players` roster.
- #313 should introduce the unified `owner_accounts` layer for clubs and
  private coach businesses.
- #281 adds the owner subscription/seat/licensing contract on
  `owner_account_id`.
- #280 and #283 should build on `owner_account_id` as their primary tenant
  scope.
