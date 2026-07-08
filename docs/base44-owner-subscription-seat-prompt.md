# Base44 Prompt: Owner Subscription, Seats And Coach Licensing

Brug denne prompt i den eksisterende login-beskyttede Base44 webapp. Byg ikke
greenfield og opret ikke Base44-interne entities som source of truth for
business data.

## Formål

Tilpas det eksisterende `KlubAdmin`-flow, så både klubber og private coach
businesses arbejder gennem `OwnerAccount`-laget.

Tenant scope er:

```text
owner_account_id
```

`owner_type` kan være:

- `club`
- `private_coach_business`

## Supabase Er Source Of Truth

Læs og skriv business data via Supabase-tabeller, RPCs og Edge Functions:

- `owner_accounts`
- `owner_memberships`
- `owner_membership_roles`
- `owner_players`
- `owner_player_guardians`
- `owner_subscription_plans`
- `owner_subscriptions`
- `owner_seat_adjustments`
- `getOwnerSeatStatus`
- `assertOwnerSeatAvailable`

Service role må aldrig ligge i Base44/webklienten. Cross-user writes skal gå
gennem service-backed Edge Functions.

## Existing Webapp Reuse

Genbrug eksisterende KlubAdmin-moduler og tilpas dem til owner scope:

- dashboard
- members/staff/players
- invites
- activities
- tasks
- license/subscription
- settings

Bevar iOS-paritet for activities/tasks/categories/feedback. Brug eksisterende
mønstre som `activityWriteService.jsx`, `KlubAktiviteter` og `KlubOpgaver`,
medmindre et senere issue ændrer det.

## Subscription And Seat UI

License/subscription view skal vise:

- aktiv plan
- owner type
- subscription status
- player seats used/available
- role seat rows for owner/admin/player
- count-only rows for coach/assistant_coach/parent
- feature flags for reports/programs/video feedback/booking

Brug `getOwnerSeatStatus` som læse-API.

Før Base44 opretter en spiller eller anden begrænset seat, skal den kalde
`assertOwnerSeatAvailable`. Base44 maa ikke kalde seat assertion for `coach`,
`assistant_coach` eller `parent`, da de er ubegrænsede count-only roller. Hvis
svaret er `SEAT_LIMIT_REACHED`, skal UI blokere player-flowet og vise
upsell/kontakt super admin. Hvis svaret er `LICENSE_INACTIVE`, skal UI vise at
licensen ikke er aktiv.

## Apple Trainer Subscription

Når en trainer har aktiv Apple subscription, skal brugeren kunne tilgå webapp
som `owner`, `admin` og `coach` på en `private_coach_business` owner account
uden klub-invite.

Base44 skal ikke selv verificere Apple receipts. Det sker via app/backend og
`sync_private_coach_owner_subscription`.

Ved expiry/revocation må Base44 ikke slette historiske data. UI skal afspejle
den nye seat/licens-tilstand fra owner seat-status payloaden.

## Multi-Role

Antag aldrig at en bruger kun har én rolle. Samme email/user kan have flere
aktive roller på samme owner account, fx:

```text
owner + admin + coach
```

Permission og navigation skal bruge summen af aktive roller fra
`owner_membership_roles`.
