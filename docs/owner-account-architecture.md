# Owner Account Architecture

## Purpose

Issue #313 consolidates the platform around one top-level owner scope:

```text
OwnerAccount -> Staff/Roles -> Players -> Programs/Activities -> Tasks -> Feedback/Progression
```

An owner account can represent either:

- a club
- a private coach business

This replaces the product direction where `coach_accounts` and `clubs` were
treated as two separate future tracks. They remain compatibility/source tables,
but new B2B platform work should use `owner_account_id` as the top-level scope.

## Data Model

```text
owner_accounts
  owner_type: club | private_coach_business
  coach_account_id: optional compatibility source
  club_id: optional compatibility source

owner_memberships
  owner_account_id
  user_id
  status

owner_membership_roles
  owner_account_id
  user_id
  role: owner | admin | coach | assistant_coach | player

owner_players
  owner_account_id
  player_id
  source: coach_player | club_member | team_member | manual | migration

owner_player_guardians
  owner_account_id
  player_id
  guardian_user_id
  relation: parent | guardian
```

## Multi-Role Users

A single user/email can have multiple roles in the same owner account.

Example:

```text
michael@trainingco.dk
  owner_account: ME Training
  roles:
    - owner
    - admin
    - coach
```

This is required for private coach businesses where the business owner often
also runs operations and personally trains players. Permission checks should use
the sum of all active roles, not a single role string.

## Role Meaning

`owner` controls commercial ownership: subscription/license, seats, settings,
branding and closing/deleting the owner account.

`admin` manages operations: staff, players, groups, invitations and day-to-day
setup.

`coach` works with assigned players/groups, programs, tasks, feedback and
progression.

`assistant_coach` has limited coach access for assigned players/groups.

`player` is a participant. Player product access stays focused on own
activities, tasks, feedback and progression.

`parent` or `guardian` access is not a membership role by default. It comes
from an explicit `owner_player_guardians` row linking a guardian user to a child
player.

## Migration Strategy

#313 is intentionally non-destructive:

1. Backfill `owner_accounts` from existing `coach_accounts` as
   `private_coach_business`.
2. Backfill `owner_accounts` from existing `clubs` as `club`.
3. Backfill `owner_memberships` and `owner_membership_roles` from
   `coach_memberships` and `club_members`.
4. Backfill `owner_players` from `coach_players`, player `club_members` and
   club `team_members`.
5. Keep sync triggers in place while older app flows still write to
   `coach_accounts`, `coach_memberships`, `clubs`, `club_members`,
   `coach_players` and `team_members`.

No player activity, task, feedback or performance history is rewritten by this
issue.

## Compatibility Rules

- Existing mobile and club flows can continue to use their current tables during
  the transition.
- New B2B tables should use `owner_account_id`.
- Old `coach_account_id` helpers remain compatibility helpers for existing
  code.
- Club-specific licensing data can stay in `club_licenses` until the
  subscription/seat issue moves commercial logic onto owner accounts.

## Base44 And EAS

Base44 is not required for #313 unless the scope changes to include web UI.

This issue must not be deployed with `eas update`; app release remains a final
build/App Store decision.

## QA And Audit

Use `get_owner_account_unification_audit()` with service role after deployment.
All counts should be zero before building downstream features on the owner
account layer.

QA cases:

- Private coach business where one user has `owner`, `admin` and `coach`.
- Club where owner, admin, coach and player are different users.
- Coach without owner/admin cannot update billing/settings.
- Admin without owner cannot close/delete the owner account.
- Player can read own owner-player link only.
- Guardian cannot read player data until an explicit guardian relation exists.
