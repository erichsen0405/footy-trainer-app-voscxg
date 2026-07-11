# Base44 Prompt: Fix Owner Account Delete Flow

Brug denne prompt i den eksisterende login-beskyttede Base44 webapp. Maalet er,
at platform admin/super admin kan slette owner accounts, og at den slettede
row forsvinder fra listen med det samme og efter refetch.

Byg ikke en ny portal. Genbrug eksisterende PlatformAdmin/OwnerAccountsTable og
slette-dialogen. Supabase Edge Functions er source of truth.

## Faktisk Fund Fra Remote DB

Remote project:

```text
lhpczofddvwcyrgotzha
```

Der har vaeret flere rows med navnet `Jeppe's workspace`.

Denne row blev allerede slettet via backend audit-log:

```text
deleted ownerAccountId: 9f1f6e7a-f971-4b29-8d40-0ae8fc5c6c0f
deleted coachAccountId: 025e0cc0-69ac-4bbd-bd74-5eac6dd56e1a
deletedAt: 2026-07-10T11:21:04Z
```

Men denne row findes stadig som aktiv og kommer stadig fra
`listPlatformAdminOwnerAccounts`:

```text
ownerAccountId: e6a68cb1-53d5-491e-bca6-1d4ce660919f
ownerName: Jeppe's workspace
ownerStatus: active
ownerType: private_coach_business
coachAccountId: 1221dc9a-7af2-4d36-a3de-c85f7b47d1bf
ownerUserId: fea5a82e-7855-4a76-b7ed-3b5d3d4c3e3e
createdAt: 2026-07-10T11:21:04.116709+00:00
```

Konklusion per 2026-07-11: delete-endpointet slettede den row-id, der blev
sendt, men den linkede legacy `coach_account` blev straks genoprettet via
legacy auto-provision triggers, naar FK'er blev sat til `null`. Backend er
rettet i migration
`20260711110000_delete_owner_account_prevent_legacy_reprovision.sql`, saa
platform-admin delete nu saetter et transaction-flag, der stopper legacy
auto-provision under selve delete-kaldet.

Base44 skal stadig rette sit UI-flow, saa den slettede row fjernes straks,
listen refetches, og der aldrig bruges stale id, `coachAccountId` eller navn
som identitet.

## Endpoint

Brug kun denne Edge Function:

```text
POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/deleteOwnerAccount
```

Hvis Supabase JS bruges:

```ts
await supabase.functions.invoke('deleteOwnerAccount', {
  body: {
    ownerAccountId: row.ownerAccountId,
  },
});
```

HTTP headers ved direkte fetch:

```http
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_anon_publishable_key>
Content-Type: application/json
```

Brug aldrig service role key i browseren/Base44.

## Absolutte Regler For Sletning

- Slet altid ud fra `row.ownerAccountId` fra den seneste
  `listPlatformAdminOwnerAccounts` response.
- Brug aldrig `ownerName` som identitet. Flere rows kan have samme navn.
- Brug aldrig `coachAccountId` som `ownerAccountId`.
- Brug aldrig en hardcoded id fra tidligere debugging.
- Slette-dialogen skal gemme hele den valgte row eller mindst
  `{ ownerAccountId, ownerName, coachAccountId }` fra den aktuelle liste.
- Foer kald til `deleteOwnerAccount`: valider at `selectedRow.ownerAccountId`
  stadig findes i den nuvaerende liste. Hvis ikke, luk dialogen, refetch listen
  og bed brugeren vaelge rowen igen.
- Log i dev console under fejlfinding:
  - selected `ownerAccountId`
  - selected `ownerName`
  - selected `coachAccountId`
  - request payload
  - response payload
  Fjern eller nedton logningen naar fejlen er loest.

## Korrekt Delete Flow

1. Listen hentes med `listPlatformAdminOwnerAccounts`.
2. Tabellen renders med `row.ownerAccountId` som stabil key.
3. Naar brugeren klikker slet, sendes den konkrete row til dialogen.
4. Dialogen viser navn til brugeren, men bruger kun `ownerAccountId` i payload.
5. Ved confirm kaldes:

```ts
const selectedOwnerAccountId = selectedRow.ownerAccountId;

const response = await supabase.functions.invoke('deleteOwnerAccount', {
  body: {
    ownerAccountId: selectedOwnerAccountId,
  },
});
```

6. Hvis response fejler: vis backend-fejlen, behold rowen i listen og lad
   dialogen blive aaben eller tydeligt fejle.
7. Hvis response lykkes: unwrap `response.data` korrekt.
8. Kontroller at `response.data.ownerAccountId === selectedOwnerAccountId`.
   Hvis den ikke matcher, vis en blocking error og refetch listen.
9. Fjern straks den slettede row fra lokal state med
   `selectedOwnerAccountId`/`response.data.ownerAccountId`.
10. Luk dialogen og ryd `selectedRow`.
11. Refetch `listPlatformAdminOwnerAccounts`.
12. Erstat lokal liste med den nye response-liste. Merge aldrig med gammel
    state.

## Korrekt State Update

Efter succes:

```ts
const deletedId = result.ownerAccountId;

setOwnerAccounts((current) =>
  current.filter((row) => row.ownerAccountId !== deletedId)
);

const refreshed = await listPlatformAdminOwnerAccounts();
setOwnerAccounts(refreshed.ownerAccounts ?? []);
```

Vigtigt:

- Brug `filter`, ikke `map`.
- Brug `ownerAccountId`, ikke `id`, `coachAccountId`, `ownerUserId` eller navn.
- `setOwnerAccounts(refreshed.ownerAccounts ?? [])` skal erstatte hele listen.
- Hvis Base44 bruger React Query/SWR/cache, skal cache invalidates for samme key
  som listen bruger, og den gamle liste maa ikke rehydreres bagefter.

## Jeppe Test Case

Foer backend-rettelsen blev der oprettet nye aktive Jeppe-rows efter hvert
delete-kald. Den seneste aktive row blev slettet efter migrationen:

```text
deleted ownerAccountId: 58b2b944-1084-4e7a-a78e-bb0e700424c0
deleted coachAccountId: edb22488-b04e-450f-b118-00979d5e4e15
```

Efter delete og refetch gav remote verifikation:

```text
owner_accounts_name_jeppe_count: 0
coach_accounts_name_jeppe_count: 0
list_rpc_jeppe_count: 0
```

Hvis Base44 igen viser en aktiv `Jeppe's workspace`, skal slette-dialogen sende
den rows aktuelle `ownerAccountId` fra `listPlatformAdminOwnerAccounts`, ikke en
af de gamle id'er. Eksempel paa en tidligere aktiv row, der nu er slettet:

```json
{
  "ownerAccountId": "e6a68cb1-53d5-491e-bca6-1d4ce660919f"
}
```

Den maa ikke sende:

```text
9f1f6e7a-f971-4b29-8d40-0ae8fc5c6c0f
025e0cc0-69ac-4bbd-bd74-5eac6dd56e1a
46ce0196-8f6a-4f8c-9817-8b512ecb2ac6
58b2b944-1084-4e7a-a78e-bb0e700424c0
Jeppe's workspace
```

De vaerdier er enten tidligere slettede owner rows, en coach account id, et
andet gammelt id eller et navn. Brug altid den aktuelle rows `ownerAccountId`
fra seneste liste-response.

## Acceptance Krav

- Sletning af en owner account sender altid den aktuelle rows `ownerAccountId`.
- Efter success forsvinder rowen straks fra tabellen uden reload.
- Efter refetch kommer rowen ikke tilbage, medmindre backend stadig returnerer
  den som aktiv.
- Hvis to rows har samme navn, slettes kun den row, brugeren klikkede paa.
- Delete-dialogen nulstiller `selectedRow` efter success.
- Listen fra `listPlatformAdminOwnerAccounts` erstatter local state fuldt ud.
- Der er ingen direkte table deletes fra Base44/browseren.
- Der er ingen hardcoded special-case for Jeppe. Jeppe-casen bruges kun som
  test/debug eksempel.

## Manuel Test

1. Aabn PlatformAdmin owner account listen.
2. Klik slet paa en test-row.
3. Verificer i dev console at payload indeholder den rows `ownerAccountId`.
4. Confirm delete.
5. Verificer at success response returnerer samme `ownerAccountId`.
6. Verificer at rowen fjernes straks.
7. Verificer at refetch ikke bringer rowen tilbage.
8. Opret eller find to rows med samme navn og slet den ene. Kun den valgte row
   maa forsvinde.
