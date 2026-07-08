# Base44 Prompt: Owner Seat Endpoints Are Deployed

Brug denne prompt i den eksisterende login-beskyttede Base44 webapp. Formaalet
er at erstatte 404/fallback-til-0 adfaerd med de deployede Supabase Edge
Functions for owner seats.

## Status

Disse Supabase Edge Functions er deployet til projektet
`lhpczofddvwcyrgotzha`:

- `getOwnerSeatStatus`
- `assertOwnerSeatAvailable`
- `createOwnerAccount`
- `upsertOwnerSeatAdjustment`
- `listPlatformAdminOwnerAccounts`
- `deleteOwnerAccount`

Base URL:

```text
https://lhpczofddvwcyrgotzha.supabase.co/functions/v1
```

Uden auth svarer endpoints `401`, hvilket betyder at function-navnet findes og
auth-gaten koerer. Hvis Base44 stadig ser `404`, bruger Base44 forkert project
URL, forkert function-navn eller en cache/proxy peger paa et andet projekt.

## Headers

Hvis Base44 bruger Supabase JS med en autentificeret client, brug:

```ts
await supabase.functions.invoke('getOwnerSeatStatus', { body });
```

Hvis Base44 kalder HTTP direkte:

```http
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_anon_publishable_key>
Content-Type: application/json
```

Brug aldrig service-role key i Base44/browseren. Platform-admin write flows gaar
gennem Edge Functions, som selv bruger server-side service client og validerer
actorens platform-admin rolle i Supabase.

## 1. Read Current Seat Status

Function:

```text
getOwnerSeatStatus
```

Request:

```ts
await supabase.functions.invoke('getOwnerSeatStatus', {
  body: {
    ownerAccountId: '<owner_account uuid>',
  },
});
```

Success response:

```ts
{
  success: true,
  data: {
    ownerAccountId: string;
    ownerType: 'club' | 'private_coach_business';
    ownerStatus: string;
    planCode: string | null;
    planName: string | null;
    subscriptionStatus: string | null;
    validUntil: string | null;
    featureFlags: Record<string, boolean>;
    seats: Array<{
      role: 'owner' | 'admin' | 'coach' | 'assistant_coach' | 'player' | 'parent';
      planSeats: number;
      overrideSeats: number | null;
      addOnSeats: number;
      effectiveSeats: number;
      seatsUsed: number;
      seatsAvailable: number;
      source: string;
      planCode: string | null;
    }>;
    playerSeats: {
      role: 'player';
      planSeats: number;
      overrideSeats: number | null;
      addOnSeats: number;
      effectiveSeats: number;
      seatsUsed: number;
      seatsAvailable: number;
      source: string;
      planCode: string | null;
    } | null;
    canAddPlayers: boolean;
  };
}
```

UI rule:

- Vis `effectiveSeats`, `seatsUsed` og `seatsAvailable` fra response.
- Fald ikke tilbage til `0`, hvis request fejler. Vis en fejlstate og retry.

## 2. Check Seat Before Assignment

Function:

```text
assertOwnerSeatAvailable
```

Request:

```ts
await supabase.functions.invoke('assertOwnerSeatAvailable', {
  body: {
    ownerAccountId: '<owner_account uuid>',
    role: 'player',
  },
});
```

Tilladte roller:

- `owner`
- `admin`
- `coach`
- `assistant_coach`
- `player`
- `parent`

Alias:

- `assistant` maa sendes, men normaliseres til `assistant_coach`.

Success response:

```ts
{
  success: true,
  data: {
    ok: true;
    seat: {
      role: string;
      seatsAvailable: number;
      effectiveSeats: number;
      seatsUsed: number;
    };
    seatStatus: OwnerSeatStatus;
  };
}
```

Error handling:

- `SEAT_LIMIT_REACHED`: bloker flowet og vis upgrade/kontakt super admin.
- `LICENSE_INACTIVE`: bloker flowet og vis at licensen ikke er aktiv.
- `FORBIDDEN`: brugeren har ikke adgang til owner account.

## 3. Platform Admin Creates Owner Account

Function:

```text
createOwnerAccount
```

Kun platform admins maa bruge denne. Genbrug eksisterende super-admin UI, der
tidligere oprettede klubber, men skriv til owner account-laget.

Club request:

```ts
await supabase.functions.invoke('createOwnerAccount', {
  body: {
    ownerType: 'club',
    ownerName: 'B93',
    ownerUserId: null,
    planCode: 'club_pro',
    seatOverrides: {
      owner: 1,
      admin: 3,
      coach: 10,
      assistant_coach: 5,
      player: 200,
      parent: 0,
    },
  },
});
```

Super-admin private coach business request:

```ts
await supabase.functions.invoke('createOwnerAccount', {
  body: {
    ownerType: 'private_coach_business',
    ownerName: 'ME Training',
    ownerUserId: null,
    planCode: null,
    seatOverrides: {
      owner: 1,
      admin: 1,
      coach: 1,
      assistant_coach: 0,
      player: 20,
    },
  },
});
```

`ownerUserId: null` is valid for a blank super-admin-created coach workspace.
Do not filter these rows out in Base44. iOS subscription-created coach
workspaces may have `ownerUserId` and `planCode`; super-admin-created blank
workspaces should use seat overrides and no plan.

Success response is the same owner seat-status payload as
`getOwnerSeatStatus`.

## 4. Platform Admin Lists Owner Accounts

Function:

```text
listPlatformAdminOwnerAccounts
```

Use this for the platform-admin owner/coach account list. Do not read
`owner_accounts` directly from the browser for this list: RLS only exposes owner
accounts where the current user is linked as a member/player/guardian, so blank
super-admin-created workspaces with `ownerUserId: null` and
`coachAccountId: null` will not appear via direct table reads.

Request:

```ts
await supabase.functions.invoke('listPlatformAdminOwnerAccounts');
```

Success response:

```ts
{
  success: true,
  data: {
    userId: string;
    email: string;
    isPlatformAdmin: true;
    ownerAccounts: Array<{
      ownerAccountId: string;
      ownerType: 'club' | 'private_coach_business';
      ownerName: string;
      ownerStatus: string;
      source: string;
      ownerUserId: string | null;
      ownerEmail: string | null;
      coachAccountId: string | null;
      clubId: string | null;
      createdAt: string | null;
      updatedAt: string | null;
      seatStatus: OwnerSeatStatus;
    }>;
  };
}
```

UI/list rules:

- Unwrap `response.data`.
- For coach workspace list, show rows where
  `ownerType === 'private_coach_business'`.
- Do not filter out rows where `ownerUserId` is `null`.
- Do not filter out rows where `coachAccountId` is `null`.
- Show player seats from `row.seatStatus.playerSeats`.
- After `createOwnerAccount` succeeds, refetch this endpoint so the new owner
  appears without manual reload.

## 5. Platform Admin Deletes Owner Account

Function:

```text
deleteOwnerAccount
```

Kun platform admins maa bruge denne. Brug den fra slette-dialogen i
platform-admin owner account listen. Base44 maa ikke slette fra tabeller
direkte.

Request:

```ts
await supabase.functions.invoke('deleteOwnerAccount', {
  body: {
    ownerAccountId: '<owner_account uuid>',
  },
});
```

Success response:

```ts
{
  success: true,
  data: {
    ownerAccountId: string;
    deleted: true;
    ownerType: 'club' | 'private_coach_business';
    ownerName: string;
    coachAccountId: string | null;
    clubId: string | null;
    linkedWorkspaceDeleted: boolean;
  };
}
```

UI rules:

- Efter success: vis normal success-toast, luk dialogen og refetch
  `listPlatformAdminOwnerAccounts`.
- Fjern den slettede row optimistisk kun hvis requesten returnerer
  `success: true`.
- Hvis requesten fejler: vis backend-fejlen og behold rowen i listen.
- Kald aldrig `owner_accounts.delete()` eller andre direkte table deletes fra
  Base44/browseren.

## 6. Platform Admin Adjusts Seats

Function:

```text
upsertOwnerSeatAdjustment
```

Request:

```ts
await supabase.functions.invoke('upsertOwnerSeatAdjustment', {
  body: {
    ownerAccountId: '<owner_account uuid>',
    role: 'player',
    adjustmentType: 'override',
    seats: 30,
    reason: 'Super admin provisioning',
    validUntil: null,
  },
});
```

`adjustmentType`:

- `override`: replace baseline for that role.
- `add_on`: add seats on top of plan/override.

Success response:

```ts
{
  success: true,
  data: OwnerSeatStatus & {
    adjustmentId: string | null;
  };
}
```

## Important Base44 Rules

- Base44 maa ikke oprette Base44 DB entities som source of truth for seats.
- Base44 maa ikke beregne effective seats selv fra tabeller.
- Brug owner seat-status payloaden som single source of truth.
- Hvis request fejler, vis fejlstate i dashbordet i stedet for `0/0`.
- Brug `owner_account_id` som tenant scope, ikke `club_id` som fremtidigt
  primært scope.
- Bevar eksisterende `KlubAdmin`-moduler og tilpas dem til `OwnerAccount`;
  byg ikke en ny separat portal.
