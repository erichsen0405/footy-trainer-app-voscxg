# Base44 Prompt: Unlimited Staff And Parent Counts

Brug denne prompt i den eksisterende login-beskyttede Base44/KlubAdmin webapp.
Byg ikke en ny portal, og brug stadig Supabase som source of truth.

## Backend Contract

Supabase owner seat-status er opdateret:

- `player` er stadig en begrænset seat-rolle.
- `owner` og `admin` er stadig begrænsede administrative roller.
- `coach`, `assistant_coach` og `parent` er ubegrænsede count-only roller.

For count-only roller returnerer `getOwnerSeatStatus` seat rows med:

```ts
{
  role: 'coach' | 'assistant_coach' | 'parent',
  isUnlimited: true,
  planSeats: null,
  overrideSeats: null,
  addOnSeats: null,
  effectiveSeats: null,
  seatsUsed: number,
  seatsAvailable: null,
  source: 'unlimited'
}
```

For `player`, `owner` og `admin` er `isUnlimited: false`, og de numeriske
seat-felter fungerer som hidtil.

## UI Changes

I licens/seat-oversigten:

- Vis `player`, `owner` og `admin` som begrænsede seats med brugt/loft/ledig.
- Vis `coach`, `assistant_coach` og `parent` som simple tællere, fx:
  - `Trænere: 4 tilknyttet`
  - `Assistenttrænere: 2 tilknyttet`
  - `Forældre/værger: 18 tilknyttet`
- Vis ikke upsell, ledige seats eller seat-loft for count-only roller.
- Vis ikke super-admin controls til at tildele/add-on/override seats for
  `coach`, `assistant_coach` eller `parent`.

## Flow Changes

Base44 skal kun bruge `assertOwnerSeatAvailable` til roller med faktiske limits:

- `player`
- `owner`
- `admin`

Base44 maa ikke kalde `assertOwnerSeatAvailable` for:

- `coach`
- `assistant_coach`
- `parent`

Guardian invite accept kan stadig returnere seat-status til UI, men parent
access maa ikke blokeres af `SEAT_LIMIT_REACHED` eller `LICENSE_INACTIVE`.

## Error Handling

`SEAT_LIMIT_REACHED` og `LICENSE_INACTIVE` skal stadig vises for player-limit
og andre begrænsede roller, men ikke bruges som forventede fejl for guardian,
coach eller assistant coach tilknytning.

## QA

- En Basic owner kan invitere en parent/guardian uden parent seat provisioning.
- En owner kan have flere coaches end planens gamle coach-tal uden seat-fejl.
- En owner kan have flere assistant coaches end planens gamle assistant-tal
  uden seat-fejl.
- Seat/licensoversigten viser count-only roller som antal tilknyttet, ikke
  brugt/loft.
- Player-limit virker stadig og blokerer med `SEAT_LIMIT_REACHED`, naar player
  seats er opbrugt.
