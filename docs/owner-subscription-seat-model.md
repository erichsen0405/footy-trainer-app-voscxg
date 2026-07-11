# Owner Subscription And Seat Model

## Purpose

Issue #281 moves coach subscription, licensing and seat limits onto the
`OwnerAccount` architecture from #313.

The commercial owner scope is `owner_account_id`, not a standalone Base44
entity and not only `user_id`, `trainer_id`, `coach_account_id` or `club_id`.

## Plan Tiers

The first private coach business tiers are:

| Plan | Players | Admins | Coaches | Assistant coaches | Parents | Coach features |
| --- | ---: | ---: | --- | --- | --- | --- |
| `trainer_basic` | 5 | 1 | Unlimited | Unlimited | Unlimited | programs |
| `trainer_standard` | 15 | 2 | Unlimited | Unlimited | Unlimited | reports, programs, video feedback |
| `trainer_premium` | 50 | 4 | Unlimited | Unlimited | Unlimited | reports, programs, video feedback, booking |

These are stored in `owner_subscription_plans.seat_limits` and
`owner_subscription_plans.feature_flags`.

Existing player subscription tiers stay user/profile-oriented. They are not
moved into owner licensing by #281.

## Effective Seats

There is one effective seat truth:

```text
effective seats per role = super admin override ?? plan baseline
effective seats per role += active super admin add-ons
```

This means Apple seats and super admin seats are not two independent truths.
Apple provides the plan baseline for a private coach business. Super admin can
replace that baseline for a role with an override, or add extra seats with an
add-on.

The function `get_owner_effective_seats(owner_account_id)` returns:

- `plan_seats`
- `override_seats`
- `add_on_seats`
- `effective_seats`
- `seats_used`
- `seats_available`
- `source`

The payload function `get_owner_seat_status_payload(owner_account_id)` wraps the
seat rows with plan, subscription and feature flag metadata.

`coach`, `assistant_coach` and `parent` are count-only rows. They have
`isUnlimited: true`, keep reporting `seatsUsed`, and expose no numeric
`effectiveSeats` or `seatsAvailable` cap in the payload.

## Apple Subscription To Owner Access

When a trainer has an active Apple entitlement for a coach plan,
`sync_private_coach_owner_subscription(...)` must:

1. upsert `apple_entitlements`,
2. ensure a personal `coach_accounts` row exists,
3. ensure a `private_coach_business` owner account exists,
4. grant the subscribing user active `owner`, `admin` and `coach` roles on that
   owner account,
5. upsert the Apple-backed `owner_subscriptions` row,
6. return the owner seat-status payload.

This is what lets the trainer log into the webapp as owner/admin/coach without a
club invite.

Expiry, cancellation or revocation must not delete users, owner accounts,
memberships, players or historical data. It only changes the active commercial
state used by effective seats and feature gating.

## Provisioning Boundary

Owner/coach workspaces must not be created just because legacy trainer/team
data, direct table writes or helper functions touch coach-scoped rows.

New `owner_accounts` and new personal `coach_accounts` for private coach
businesses may only be provisioned by:

- active Apple trainer subscription sync through
  `sync_private_coach_owner_subscription(...)`
- platform admin/super admin provisioning through
  `create_owner_account_as_platform_admin(...)`

Legacy/default helpers may return existing workspaces and repair memberships,
but they must not create a new workspace automatically.

## Super Admin Provisioning

Super admin provisioning uses:

- `create_owner_account_as_platform_admin(...)`
- `upsert_owner_seat_adjustment_as_platform_admin(...)`

Super admin can create `club` and `private_coach_business` owner accounts and
set role limits for:

- `owner`
- `admin`
- `player`

`coach`, `assistant_coach` and `parent` are not provisioned as limited seats.
They are shown as counts only.

Legacy `club_licenses.seats_total` is mirrored into owner licensing as a
`player` override so the existing club admin flow keeps working while the
effective seat APIs become owner-aware.

## Web And Mobile Gating

Mobile can continue using tier-derived feature flags locally for immediate UI
gating. Web/Base44 should read owner seat status from Supabase/Edge Functions
and use `featureFlags` from the payload for owner-scoped coach features:

- `reports`
- `programs`
- `video_feedback`
- `booking`

Before creating players or other capped seats, server-side flows should call
`assert_owner_seat_available(...)` or the `assertOwnerSeatAvailable` Edge
Function. Client-side checks are UX only. Do not use seat assertions for
`coach`, `assistant_coach` or `parent`; those roles are unlimited count-only
roles.

## Base44 Rules

Base44 is only the web UI layer. It must not create Base44-internal entities for
plans, seats, subscriptions, owner accounts, players or memberships as source of
truth.

Use the existing login-protected webapp/`KlubAdmin` flow and adapt it to the
owner account layer:

- dashboard
- members/staff/players
- invites
- activities
- tasks
- license/subscription
- settings

Cross-user writes still go through Supabase RPCs or service-backed Edge
Functions that validate owner roles and RLS.

## QA

Minimum manual checks:

- Active `trainer_basic` Apple entitlement creates a `private_coach_business`
  owner account and gives the purchaser `owner`, `admin` and `coach`.
- Owner seat status shows plan name, player limit, used players, remaining
  players and count-only totals for coaches, assistant coaches and parents.
- Adding a player is blocked with `SEAT_LIMIT_REACHED` when player seats are
  exhausted.
- Super admin override replaces the Apple baseline for capped roles.
- Super admin add-on increases seats above the plan baseline for capped roles.
- Expired/revoked Apple entitlement does not delete historical data.
- Existing player subscriptions and club license flows still work.
