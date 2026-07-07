# Base44 Prompt: Owner-Aware Coach Portal Shell

Brug denne prompt i den eksisterende login-beskyttede Base44 webapp. Byg ikke
en ny separat portal. Tilpas det eksisterende `KlubAdmin`-flow og eksisterende
moduler til `OwnerAccount`-laget.

## Formaal

Etabler en web-first arbejdsflade for personlige coaches og klubber, hvor
coachens daglige adminarbejde foregaar effektivt paa web, mens mobilappen
fortsat er let for spillere.

Tenant scope er altid:

```text
owner_account_id
```

`owner_type` kan vaere:

- `club`
- `private_coach_business`

## Reuse Existing Webapp

Genbrug den eksisterende Base44 webapp, der tidligere var bygget til klubber.
Base44 er kun host/UI-lag; Supabase er source of truth for business data.

Tilpas eksisterende `KlubAdmin`-moduler til owner scope:

- dashboard
- members/staff/players
- invites
- activities
- tasks
- license/subscription
- settings

Bevar eksisterende iOS-paritet for activities/tasks/categories/feedback. Brug
eksisterende webapp-moenstre som `activityWriteService.jsx`,
`KlubAktiviteter` og `KlubOpgaver`, medmindre et senere issue aendrer dem.

## Navigation

Primær navigation i owner-portalen:

- Dashboard
- Players
- Programs
- Library
- Reports
- Calendar
- Settings

Hvis brugeren har flere owner accounts, skal der vaere en hurtig workspace
switcher. Switcheren skal vise baade `club` og `private_coach_business`
accounts, som brugeren har adgang til.

## Access And Roles

Brug multi-role modellen fra `owner_membership_roles`. Antag aldrig at en
bruger kun har en enkelt rolle.

Giv adgang til portalen hvis brugeren har mindst en af disse aktive roller paa
owner account:

- `owner`
- `admin`
- `coach`
- `assistant_coach`

Platform admins maa ogsaa tilgaa portalen og owner provisioning.

Brug ikke den gamle enkeltrolle fra `user_roles` som portal-gate. En bruger kan
fx have `owner + admin + coach` paa samme `owner_account_id`.

## Supabase API

Kald eksisterende Supabase Edge Functions via:

```ts
supabase.functions.invoke('<name>', { body })
```

Opret eller brug ikke Base44-interne entities som source of truth for business
data. Hvis et owner-flow mangler i Base44, skal det loeses i den eksisterende
Base44 webapp/API-service omkring Supabase, ikke ved at bygge webkode i
Expo/app-repoet.

### Owner Context

Til workspace switcher og gating skal Base44 hente owner context fra
Supabase-tabellerne/RPC'erne, der allerede findes i owner-laget:

- `owner_accounts`
- `owner_memberships`
- `owner_membership_roles`
- `get_owner_account_roles`
- `has_owner_account_role`
- `is_owner_account_member`
- `is_owner_account_admin`

Context payload i Base44 skal normaliseres til:

```ts
{
  userId: string;
  email: string;
  isPlatformAdmin: boolean;
  workspaces: Array<{
    ownerAccountId: string;
    ownerType: 'club' | 'private_coach_business';
    name: string;
    status: string;
    clubId: string | null;
    coachAccountId: string | null;
    roles: Array<'owner' | 'admin' | 'coach' | 'assistant_coach' | 'player'>;
    canAccessPortal: boolean;
    canManageOwner: boolean;
    canManageMembers: boolean;
    canCoach: boolean;
  }>;
  defaultWorkspaceId: string | null;
}
```

Brug `defaultWorkspaceId` som aktiv workspace ved foerste load, medmindre
brugeren allerede har valgt en gyldig workspace.

### License And Seats

- `getOwnerSeatStatus`
  - body: `{ "ownerAccountId": "<uuid>" }`
  - bruges til at vise effective seats, plan, status og feature flags.
- `assertOwnerSeatAvailable`
  - body: `{ "ownerAccountId": "<uuid>", "role": "player" }`
  - kaldes foer oprettelse af player/staff/parent seats.

Hvis `assertOwnerSeatAvailable` returnerer `SEAT_LIMIT_REACHED`, skal UI blokere
flowet og vise upsell/kontakt super admin. Hvis svaret er `LICENSE_INACTIVE`,
skal UI vise at licensen ikke er aktiv.

### Platform Admin Owner Provisioning

Den eksisterende platform admin/super admin funktion, der tidligere oprettede
klubber, skal udvides til owner accounts. Genbrug den eksisterende platform
admin/club admin UI og data-service. Den server-side Supabase-kontrakt er:

- `create_owner_account_as_platform_admin`
- `upsert_owner_seat_adjustment_as_platform_admin`

De RPC'er er service-role flows og maa ikke kaldes direkte fra browseren med
service role. Base44 skal bruge sit eksisterende server-side/API-lag til at
kalde dem.

Create owner payload i Base44:

```json
{
  "ownerType": "club",
  "ownerName": "B93",
  "ownerUserId": null,
  "planCode": "club_pro",
  "seatOverrides": {
    "owner": 1,
    "admin": 3,
    "coach": 10,
    "assistant_coach": 5,
    "player": 200,
    "parent": 0
  }
}
```

For private coach businesses:

```json
{
  "ownerType": "private_coach_business",
  "ownerName": "ME Training",
  "ownerUserId": "<auth user uuid>",
  "planCode": "trainer_standard",
  "seatOverrides": {
    "owner": 1,
    "admin": 1,
    "coach": 1,
    "assistant_coach": 0,
    "player": 20
  }
}
```

Seat adjustment payload i Base44:

```json
{
  "ownerAccountId": "<uuid>",
  "role": "player",
  "adjustmentType": "override",
  "seats": 30,
  "reason": "Super admin provisioning",
  "validUntil": null
}
```

Tillad rollerne:

- `owner`
- `admin`
- `coach`
- `assistant_coach`
- `player`
- `parent`

Aliaset `assistant` maa gerne mappes til `assistant_coach`.

Seat-konfiguration skal skrives via disse Edge Function/RPC/server-side flows,
ikke via Base44 DB eller direkte service role i browseren.

## Apple Trainer Subscription

En aktiv Apple trainer subscription skal give/oprette adgang til en
`private_coach_business` owner account, hvor abonnenten har rollerne:

- `owner`
- `admin`
- `coach`

Base44 skal ikke verificere Apple receipts. Det sker via app/backend og
`sync_private_coach_owner_subscription`.

Ved expiry/revocation maa Base44 ikke slette historiske data. UI skal afspejle
licens- og seat-tilstanden fra owner seat-status payloaden.

## Desktop Layout

Prioriter desktop/tablet ergonomi:

- venstre navigation paa desktop
- kompakt topbar med workspace switcher
- tabeller/lister til players, programs, reports og settings
- responsive fallback paa small viewport

Dette er en arbejdsflade, ikke en landing page.
