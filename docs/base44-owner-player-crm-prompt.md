# Base44 Prompt: Owner Player CRM

Brug denne prompt i den eksisterende login-beskyttede Base44/KlubAdmin webapp.
Byg ikke en ny portal og brug ikke Base44-interne entities som source of truth.

## Formaal

Tilpas det eksisterende spiller-/holdomraade i KlubAdmin, saa klubber og
private coach businesses kan arbejde med samme spiller-CRM paa web som i
mobilappen.

Mobil og web skal have funktionsparitet. Web maa gerne vaere mere effektivt til
bulk og bred skærm, men det maa ikke introducere felter, statusser eller flows,
som mobilappen ikke ogsaa kan se og redigere.

Tenant scope er altid:

```text
owner_account_id
```

`owner_type` kan vaere:

- `club`
- `private_coach_business`

## Navigation

Genbrug eksisterende KlubAdmin navigation og tilpas spilleromraadet til owner
scope. Den relevante webside/menu kan hedde `Players`, `Spiller CRM` eller den
eksisterende KlubAdmin label, men den skal ligge i den eksisterende owner portal.

Mobilappen har en dedikeret `CRM` tab/menu-indgang for traenere/admins. Web skal
matche samme informationsarkitektur:

- spilleroversigt
- spillerkort
- CRM-profilfelter
- tags
- coach-private noter
- guardian/parent kontaktdata
- guardian invite, resend, cancel og revoke access
- hold/team-overblik og teammedlemskaber

## Supabase API

Base URL:

```text
https://lhpczofddvwcyrgotzha.supabase.co/functions/v1
```

Function:

```text
manageOwnerPlayerCrm
```

Remote status per 2026-07-08:

- Migrations `20260708143000_owner_player_crm` and
  `20260708144500_owner_player_crm_tag_fk_hardening` are applied on project
  `lhpczofddvwcyrgotzha`.
- Migration `20260708152000_owner_player_guardian_invites` is applied on
  project `lhpczofddvwcyrgotzha`.
- `manageOwnerPlayerCrm` is deployed and active with guardian invite actions.
- `acceptOwnerPlayerGuardianInvite` is deployed and active.
- `create-player` is deployed with `ownerAccountId` seat-check support.
- No-auth smoke test returns `401`, not `404`, for `manageOwnerPlayerCrm`,
  `acceptOwnerPlayerGuardianInvite` and `create-player`.

Hvis Base44 bruger Supabase JS:

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', { body });
```

Hvis Base44 kalder HTTP direkte:

```http
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_anon_publishable_key>
Content-Type: application/json
```

Service-role key maa aldrig ligge i Base44/browseren.

## Access

Adgang gives kun til brugere med aktiv owner adgang:

- `owner`
- `admin`
- `coach`
- `assistant_coach`

Platform admins maa ogsaa tilgaa CRM.

Brug ikke kun `user_roles` som gate. Samme bruger/mail kan have flere roller paa
samme eller forskellige `owner_account_id`.

## Action: Context

Bruges til workspace switcher.

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: { action: 'context' },
});
```

Response:

```ts
{
  success: true,
  data: {
    isPlatformAdmin: boolean;
    defaultOwnerAccountId: string | null;
    workspaces: Array<{
      ownerAccountId: string;
      ownerType: 'club' | 'private_coach_business';
      name: string;
      status: string;
      coachAccountId: string | null;
      clubId: string | null;
      roles: string[];
      canAccessCrm: boolean;
    }>;
  };
}
```

## Action: List

Henter spillerliste, tags og team summaries for aktiv owner.

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'list',
    ownerAccountId: '<owner_account uuid>',
  },
});
```

Response `data`:

```ts
{
  ownerAccount: {
    ownerAccountId: string;
    ownerType: 'club' | 'private_coach_business';
    name: string;
    status: string;
    coachAccountId: string | null;
    clubId: string | null;
  };
  players: Array<{
    ownerPlayerId: string;
    playerId: string;
    displayName: string;
    ownerRosterStatus: string;
    source: string;
    crmStatus: 'active' | 'trial' | 'paused' | 'former';
    positions: string[];
    primaryPosition: string | null;
    playingLevel: string | null;
    clubName: string | null;
    dateOfBirth: string | null;
    age: number | null;
    phoneNumber: string | null;
    email: string | null;
    emailVisibleToStaff: boolean;
    phoneVisibleToStaff: boolean;
    tags: Array<{ id: string; name: string; color: string }>;
    teams: Array<{ id: string; name: string; description: string | null }>;
    guardianContactsCount: number;
    notesCount: number;
    latestNotePreview: string | null;
    updatedAt: string | null;
  }>;
  tags: Array<{ id: string; name: string; color: string }>;
  teams: Array<{ id: string; name: string; description: string | null; memberCount: number }>;
}
```

## Action: Detail

Henter spillerkort inkl. noter, guardian contacts og timeline.

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'detail',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
  },
});
```

Response er samme som `list`, plus:

```ts
{
  player: PlayerListItem;
  notes: Array<{
    id: string;
    body: string;
    visibility: 'coach_private';
    createdBy: string;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  guardianContacts: Array<{
    id: string;
    guardianUserId: string | null;
    fullName: string;
    email: string | null;
    phoneNumber: string | null;
    relation: 'parent' | 'guardian' | 'other';
    status: 'active' | 'pending' | 'inactive' | 'removed';
    notes: string | null;
    permissions: Record<string, unknown>;
    inviteId: string | null;
    inviteStatus: 'pending' | 'accepted' | 'cancelled' | 'expired' | 'revoked' | null;
    inviteExpiresAt: string | null;
    inviteLastSentAt: string | null;
    accessId: string | null;
    accessStatus: 'active' | 'pending' | 'inactive' | 'removed' | null;
    createdAt: string;
    updatedAt: string;
  }>;
  timeline: Array<{
    id: string;
    type: 'activity' | 'feedback';
    title: string;
    subtitle: string | null;
    occurredAt: string;
  }>;
}
```

## Action: Update CRM Profile

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'updateProfile',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    profile: {
      crmStatus: 'active',
      positions: ['Striker', 'Winger'],
      playingLevel: 'U15 elite',
      clubName: 'Current club',
      dateOfBirth: '2011-04-12',
      phoneNumber: '+45...',
      email: 'player@example.com',
      emailVisibleToStaff: true,
      phoneVisibleToStaff: true,
    },
  },
});
```

Response returnerer opdateret `detail`.

## Actions: Notes

Coach-private noter maa kun vises for owner staff med CRM-adgang. De maa ikke
vises for spiller eller guardian.

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'createNote',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    body: 'Private coach note',
  },
});
```

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'deleteNote',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    noteId: '<note uuid>',
  },
});
```

## Actions: Tags

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'upsertTag',
    ownerAccountId: '<owner_account uuid>',
    name: 'Talent',
    color: '#2563eb',
  },
});
```

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'setPlayerTags',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    tagIds: ['<tag uuid>'],
  },
});
```

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'deleteTag',
    ownerAccountId: '<owner_account uuid>',
    tagId: '<tag uuid>',
  },
});
```

## Actions: Guardian Contacts

Guardian contacts er CRM-kontaktdata og adgangsstyringens udgangspunkt.
Kontaktdata giver ikke i sig selv parent/guardian app-adgang. Adgang aktiveres
kun naar en guardian accepterer en sikker invite-mail. Accept-flowet opretter en
aktiv `owner_player_guardians` relation og seat-checker rollen `parent`.

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'createGuardianContact',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    fullName: 'Parent Name',
    email: 'parent@example.com',
    phoneNumber: '+45...',
    relation: 'parent',
    status: 'active',
    notes: 'Prefers SMS',
  },
});
```

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'updateGuardianContact',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    contactId: '<contact uuid>',
    fullName: 'Parent Name',
    email: 'parent@example.com',
    phoneNumber: '+45...',
    relation: 'guardian',
    status: 'active',
    notes: null,
  },
});
```

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'deleteGuardianContact',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    contactId: '<contact uuid>',
  },
});
```

### Invite Guardian

Vis kun invite-knappen naar kontakten har email, ikke allerede har
`accessStatus: 'active'`, og ikke har `inviteStatus: 'pending'`.

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'inviteGuardianContact',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    contactId: '<guardian contact uuid>',
  },
});
```

Response returnerer opdateret `detail` plus:

```ts
guardianInviteDelivery?: {
  status: 'sent' | 'skipped' | 'failed';
  authLinkType: 'invite' | 'magiclink' | null;
  ownerName: string | null;
  playerName: string | null;
  landingUrl: string | null;
  provider: 'aws_ses' | 'none';
  warning: string | null;
};
```

Hvis `status !== 'sent'`, skal Base44 vise warningen til traeneren. Inviten er
stadig oprettet, men mailen blev ikke sendt.

### Resend / Cancel Pending Invite

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'resendGuardianInvite',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    inviteId: '<guardian invite uuid>',
  },
});
```

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'cancelGuardianInvite',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    inviteId: '<guardian invite uuid>',
  },
});
```

### Revoke Guardian Access

Vis revoke naar `accessStatus: 'active'`.

```ts
await supabase.functions.invoke('manageOwnerPlayerCrm', {
  body: {
    action: 'revokeGuardianAccess',
    ownerAccountId: '<owner_account uuid>',
    playerId: '<player user uuid>',
    contactId: '<guardian contact uuid>',
  },
});
```

### Accept Guardian Invite

Mailen sender brugeren gennem Supabase auth-link med redirect-param
`guardianInviteToken`. Efter login skal Base44 kalde:

```ts
await supabase.functions.invoke('acceptOwnerPlayerGuardianInvite', {
  body: {
    token: '<guardian invite token>',
    fullName: null,
  },
});
```

Accept kræver at den loggede brugers email matcher invite-emailen. Ved accept
oprettes/reaktiveres `owner_player_guardians`, guardian contact opdateres til
`status: 'active'`, og parent-seat kontrolleres. Ved seat/licens-fejl skal UI
vise `LICENSE_INACTIVE` eller `SEAT_LIMIT_REACHED`.

## Add/Invite Player

Genbrug eksisterende player invite/search-flow. Naar Base44 tilfoejer en spiller
fra CRM, skal `ownerAccountId` sendes med, saa backend laver seat/licens-check.

```ts
await supabase.functions.invoke('create-player', {
  body: {
    action: 'search',
    email: 'player@example.com',
  },
});

await supabase.functions.invoke('create-player', {
  body: {
    action: 'add',
    playerId: '<player user uuid>',
    ownerAccountId: '<owner_account uuid>',
  },
});
```

Hvis backend returnerer `SEAT_LIMIT_REACHED` eller `LICENSE_INACTIVE`, skal UI
blokere oprettelsen og vise en tydelig seat/licens state. Fald ikke tilbage til
lokal oprettelse.

## Teams

Genbrug eksisterende KlubAdmin team-flow og tilpas det til owner scope. CRM
listen returnerer team summaries, men team writes skal stadig gaa gennem de
eksisterende sikre Supabase flows eller server-side API. Cross-user writes maa
ikke ske direkte fra browseren med service role.

Web og mobil skal kunne:

- oprette hold
- redigere hold
- slette hold
- tilfoeje/fjerne spillere paa hold
- se teammedlemskaber paa spillerkortet

## Error Handling

Edge Function errors returnerer:

```ts
{
  success: false,
  error: {
    code: string;
    message: string;
  };
}
```

Haandter mindst:

- `UNAUTHORIZED`
- `FORBIDDEN`
- `OWNER_ACCOUNT_NOT_FOUND`
- `PLAYER_NOT_FOUND`
- `NOTE_NOT_FOUND`
- `TAG_NOT_FOUND`
- `GUARDIAN_CONTACT_NOT_FOUND`
- `INVITE_ALREADY_PENDING`
- `INVITE_NOT_FOUND`
- `VALIDATION_ERROR`
- `LICENSE_INACTIVE`
- `SEAT_LIMIT_REACHED`

Ved `401` skal brugeren tilbage gennem login/session refresh. Ved `403` skal
Base44 vise manglende owner adgang. Ved `409` skal Base44 vise seat/licens state.

## QA

Test mindst:

- private coach owner med `owner + admin + coach`
- club owner med admin/coach rolle
- bruger med flere owner workspaces
- platform admin med owner switcher
- spillerliste filtreret paa status, tag og team
- spillerkort update paa web vises i mobil efter refresh
- spillerkort update paa mobil vises i web efter refresh
- note oprettet paa web vises kun for staff, ikke spiller/guardian
- guardian contact oprettet paa web vises i mobil CRM
- guardian invite oprettet paa web vises som pending i mobil CRM
- guardian invite oprettet paa mobil vises som pending i web
- accept-link opretter aktiv guardian access og access kan revokes fra web/mobil
- `create-player` med `ownerAccountId` blokerer ved seat limit

Efter writes skal Base44 altid refetche fra Supabase. Optimistic UI er ok, men
Supabase response er source of truth.
