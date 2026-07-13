# Base44 Complete Prompt: Owner Bulk Assignment V2 (#287)

Brug hele denne prompt i den eksisterende login-beskyttede
Base44/KlubAdmin-webapp. Udvid den eksisterende owner-portal og dens
aktivitets-, opgave-, Plan-, template- og programflows. Byg ikke en ny portal,
et parallelt assignment-system eller Base44-interne business entities.

Denne prompt beskriver webdelen af issue #287. Den samme Supabase-backend er
kontrakten for web, iOS og Android.

## Maal

Giv `owner`, `admin`, `coach` og tilladte `assistant_coach`-brugere et sikkert
bulk-flow til at tildele, opdatere og fjerne assignments for mange spillere.

Flowet skal understoette:

- activities
- exercises
- training templates
- published training programs
- direkte valgte spillere
- teams
- CRM tags og CRM status
- alder
- niveau
- position
- program enrollment og enrollment-status
- team- og spiller-exclusions
- serverberegnet preview foer enhver write
- kontrolleret duplicate/conflict-haandtering
- audit via assignment batches
- sikker rollback, naar backend vurderer at den er mulig

Bulk assignment skal virke for begge owner-typer:

- `club`
- `private_coach_business`

Tenant scope er altid `owner_account_id` / API-feltet `ownerAccountId`.

## Ikke Til Forhandling

1. Genbrug den eksisterende Base44/KlubAdmin-shell, auth, navigation,
   workspace switcher, rolle-gating, design tokens og Supabase-klient.
2. Genbrug og tilpas eksisterende moduler som `KlubAktiviteter`,
   `KlubOpgaver`, Plan/Assignments, Programs/Templates,
   `clubAdminApi`, `roleRedirect` og `activityWriteService.jsx`.
3. Base44 er UI- og host-lag. Supabase er eneste source of truth for owner,
   roster, CRM, teams, content, assignments, batches og rollback-resultater.
4. Opret ikke Base44 entities eller en lokal kopi af spillere, teams,
   templates, programmer, recipients, assignments eller batches.
5. Samme bruger/mail kan have flere samtidige roller paa samme owner account.
   Beregn adgang ud fra summen af aktive roller, ikke en enkelt `user_roles`
   vaerdi.
6. Cross-user writes maa kun ske gennem den beskyttede Supabase Edge Function
   og dens server-side RPC/transaktioner. Base44 maa ikke skrive direkte til
   assignment-, activity-, task-, program- eller batch-tabeller.
7. `preview` er autoritativt. Base44 maa ikke selv beregne den endelige
   modtagerliste ud fra en lokalt filtreret roster.
8. `apply` maa ikke kaldes uden et gyldigt `previewToken`, en stabil
   `idempotencyKey` og eksplicit brugerbekraeftelse.
9. Web og mobil bruger samme action-navne, payloads, responsfelter,
   permissions og Supabase-data.
10. Alle nye eller beroerte faste UI-tekster skal vaere paa engelsk, saa de
    matcher den eksisterende Plan-oplevelse. Oversaet ikke brugeroprettede
    navne eller beskrivelser.

## Genbrug Den Eksisterende Webapp

Udvid det eksisterende assignment-workspace; opret ikke en ny top-level app.

Anbefalede entry points i den eksisterende navigation:

- `Plan > Assignments`: samlet bulk assignment-liste og batch history.
- `KlubAktiviteter`: `Assign` paa en eksisterende activity aabner samme wizard
  med content forudvalgt.
- `KlubOpgaver` / Plan template cards: `Assign` aabner samme wizard med task,
  exercise, session eller week template forudvalgt.
- `Programs`: `Assign` paa et publiceret program aabner samme wizard med
  programmet forudvalgt.

Der maa gerne laves en genbrugelig Base44-komponent/service til wizardens UI,
men den skal monteres i de eksisterende moduler og bruge den eksisterende
Supabase-session, owner selector og error/loading patterns.

Bevar de eksisterende direct player/team assignment-flows. De maa gerne sende
brugeren ind i den nye wizard med prefilled selection, men de maa ikke slettes
eller erstattes med direkte browser-writes.

## Supabase API

Project ref:

```text
lhpczofddvwcyrgotzha
```

Base URL:

```text
https://lhpczofddvwcyrgotzha.supabase.co/functions/v1
```

Endpoint:

```text
POST /manageOwnerBulkAssignments
```

Headers ved direkte HTTP-kald:

```http
Authorization: Bearer <signed-in Supabase user access token>
apikey: <Supabase anon/publishable key>
Content-Type: application/json
```

Anbefalet kald med den eksisterende Supabase-klient:

```ts
const { data, error } = await supabase.functions.invoke(
  'manageOwnerBulkAssignments',
  { body: requestBody }
);
```

Service-role key maa aldrig ligge i Base44, browserkode, local storage eller en
Base44 secret, der sendes til klienten.

Endpointet bruger API version `1` og actions:

- `context`
- `preview`
- `apply`
- `batchDetail`
- `rollback`

## Faelles Response Envelope

Succes:

```ts
{
  success: true;
  data: unknown;
}
```

Fejl:

```ts
{
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

Brug responsen fra Supabase som source of truth efter alle writes. Optimistic
UI maa kun bruges som kortvarig pending-state og skal erstattes af
`apply`/`batchDetail`-responsen.

## Action: Context

`context` henter workspaces, den valgte owner, owner-scoped roster,
filtermuligheder og assignable content til wizardens foerste load.

Request med valgt workspace:

```json
{
  "action": "context",
  "ownerAccountId": "<selected owner UUID>"
}
```

Ved foerste load, hvor der endnu ikke er valgt workspace, send kun:

```json
{ "action": "context" }
```

Brug derefter `selectedOwnerAccountId` fra responsen. Naar brugeren skifter
workspace, kald `context` igen med det nye owner-id og nulstil al selection,
preview og confirmation state.

Response `data`:

```ts
type BulkAssignmentContextV1 = {
  apiVersion: 1;
  workspaces: Array<{
    ownerAccountId: string;
    ownerType: 'club' | 'private_coach_business';
    name: string;
    roles: string[];
  }>;
  selectedOwnerAccountId: string | null;
  owner: {
    ownerAccountId: string;
    ownerType: 'club' | 'private_coach_business';
    name: string;
  } | null;
  roster: Array<{
    playerId: string;
    name: string;
    status: string;
    crmStatus: string;
    dateOfBirth: string | null;
    age: number | null;
    playingLevel: string | null;
    positions: string[];
    tags: Array<{ id: string; name: string; color: string | null }>;
    teams: Array<{ id: string; name: string }>;
    programEnrollments: Array<{
      programId: string;
      status: string;
    }>;
  }>;
  filters: {
    teams: Array<{ id: string; name: string }>;
    tags: Array<{ id: string; name: string; color: string | null }>;
    crmStatuses: string[];
    playingLevels: string[];
    positions: string[];
    enrollmentStatuses: string[];
  };
  content: {
    activities: Array<{
      id: string;
      title: string;
      status: 'active';
      activityDate: string | null;
      activityTime: string | null;
      location: string | null;
      isExternal: false;
      updatedAt: string | null;
    }>;
    exercises: Array<{
      id: string;
      title: string;
      status: 'active';
      description: string | null;
      isSystem: boolean;
      updatedAt: string | null;
    }>;
    trainingTemplates: Array<{
      id: string;
      title: string;
      status: string;
      templateType: 'task' | 'exercise' | 'session' | 'week';
      description: string | null;
      updatedAt: string | null;
    }>;
    programs: Array<{
      id: string;
      title: string;
      status: 'published';
      level: string | null;
      durationWeeks: number;
      publishedVersion: number;
      updatedAt: string | null;
    }>;
  };
};
```

Render kun content, som endpointet returnerer. Base44 maa ikke udvide listen
med globale eller cross-owner records fra egne queries. Et program skal vaere
publiceret/assignable ifoelge API-responsen; UI maa ikke omgaa statuskravet.

Roster-responsen kan bruges til hurtig visning, search og forklaring af filtre,
men den endelige recipient-resolver koerer server-side i `preview`.

## Faelles Request Model For Preview Og Apply

### Operation

Tillad kun:

```ts
type BulkOperation = 'assign' | 'update' | 'remove';
```

- `assign`: opret manglende assignments og haandter eksisterende duplicates
  efter serverens regler.
- `update`: opdater kun eksisterende assignments, som serveren matcher til
  valgt content og recipients.
- `remove`: fjern kun assignments, som serveren kan identificere sikkert.

`update` og `remove` er destructive flows og skal have staerkere confirmation
end `assign`.

### Content

Send altid content som et objekt fra `context.content`:

```ts
type BulkAssignmentContent = {
  type: 'activity' | 'exercise' | 'training_template' | 'program';
  id: string;
};
```

Eksempel:

```json
{
  "type": "program",
  "id": "<published program UUID>"
}
```

Brug ikke titlen eller et lokalt Base44-id som identifier. `id` er det
Supabase-id, som `context` returnerer.

### Direkte Spillere Og Filtergrupper

Direkte recipients sendes i `playerIds`.

Hele den aktive owner-roster maa kun vaelges med et eksplicit flag:

```ts
includeAllPlayers?: boolean;
```

Send kun `includeAllPlayers: true`, naar brugeren aktivt har valgt og kan se
valget `All eligible players`. En manglende eller falsk vaerdi betyder ikke
"alle". Tomme `playerIds` og `filters` uden dette eksplicitte flag skal afvises;
det beskytter mod utilsigtede assignment til hele owner-rosteren.

Avancerede filtre sendes som en array:

```ts
type RecipientFilter =
  | {
      field: 'team' | 'tag' | 'crm_status' | 'playing_level' | 'position';
      values: string[];
      operator?: 'in';
    }
  | {
      field: 'age';
      values: number[];
      operator: 'between';
    }
  | {
      field: 'program_enrollment';
      values: string[];
      operator?: 'in';
      programId: string;
    };
```

Eksempel:

```json
[
  {
    "field": "team",
    "values": ["<U15 team UUID>", "<U16 team UUID>"],
    "operator": "in"
  },
  {
    "field": "tag",
    "values": ["<Elite tag UUID>", "<Talent tag UUID>"],
    "operator": "in"
  },
  {
    "field": "crm_status",
    "values": ["active"],
    "operator": "in"
  },
  {
    "field": "age",
    "values": [13, 16],
    "operator": "between"
  },
  {
    "field": "playing_level",
    "values": ["advanced", "elite"],
    "operator": "in"
  },
  {
    "field": "position",
    "values": ["forward", "winger"],
    "operator": "in"
  },
  {
    "field": "program_enrollment",
    "programId": "<program UUID>",
    "values": ["active", "paused"],
    "operator": "in"
  }
]
```

Filterlogik:

- Forskellige filtergrupper kombineres med `AND`.
- Flere values i samme `in`-gruppe kombineres som OR.
- `age` med `between` bruger `[minimumAge, maximumAge]`, inklusive begge
  graenser.
- `program_enrollment` bruger `programId` plus de valgte enrollment-statusser
  i `values`.
- `playerIds` laegges til som direkte inkluderede recipients, men de er stadig
  underlagt owner-access, eligibility og exclusions server-side.
- En tom `filters` array er kun tilladt, hvis mindst en gyldig `playerIds`-vaerdi
  er valgt, eller brugeren eksplicit har valgt `includeAllPlayers: true`.
- UI maa ikke udlede "alle" af tomme arrays eller af den lokalt synlige side i
  en pagineret liste. Hele rosteren kraever `includeAllPlayers: true` og et nyt
  server-preview.

### Exclusions

```ts
type BulkExclusions = {
  playerIds?: string[];
  teamIds?: string[];
};
```

- `playerIds` ekskluderer konkrete spillere, uanset hvordan de ellers blev
  inkluderet.
- `teamIds` ekskluderer spillere via deres aktive membership paa det valgte
  team.
- Exclusions har altid hoejere prioritet end direct selection og filters.
- Brug kun player/team ids fra det aktive owner context.
- Preview skal vise hvilken exclusion, der fjernede en spiller.

Genbrug eksisterende `activity_assignment_team_exclusions` server-side, hvor
det er relevant for activity assignments. Base44 maa ikke selv synkronisere
den tabel.

### Assignment Options

Send content-afhaengige valg i `assignment`:

```ts
type BulkAssignmentOptions = {
  startDate?: string;
  enrollmentStatus?: 'active' | 'paused';
  activityDate?: string;
  activityTime?: string;
  location?: string;
  title?: string;
  sourceTeamId?: string;
};
```

Regler:

- Training program assignment kraever `startDate` som lokal kalenderdato i
  formatet `YYYY-MM-DD`. `enrollmentStatus` er valgfri og maa kun vaere
  `active` eller `paused`; udeladt vaerdi betyder `active` ved assign og
  bevarer den eksisterende status ved update.
- Training-template assignment bruger i v1 `startDate`; tider, lokationer og
  titler kommer fra den immutable template-version/materialiseringsplan.
- Raw exercise assignment har ingen schedule-options i v1.
- Activity assignment genbruger activityens eksisterende dato, tid, location
  og title. Ved `update` kan de navngivne `activityDate`, `activityTime`,
  `location` og `title` sendes som eksplicitte overrides.
- `sourceTeamId` maa kun vaelges fra den aktive owners teams og bruges, naar
  backend-flowet skal bevare en konkret team source/scope.
- `update` maa kun aendre de samme navngivne assignment-felter, som backend
  tillader for den valgte contenttype. Byg ikke en arbitrary JSON editor.
- `remove` sender ikke assignment options, medmindre endpointet eksplicit
  kraever et scope-felt som `sourceTeamId`.
- Base44 maa ikke selv materialisere program items, activities, tasks eller
  template instances. Det sker server-side.

### Target Batch Ved Update/Remove

Preview/apply-input understoetter desuden:

```ts
targetBatchId?: string;
```

Brug `targetBatchId`, naar `update` eller `remove` aabnes fra et konkret
assignment batch/resultat, saa serveren kan afgraense de eksisterende
assignments sikkert. Vaerdien skal vaere `batch.batchId` fra samme aktive owner.
Omit feltet ved en normal ny `assign`. Et batch-id maa aldrig bruges som en
browser-side genvej til at springe recipient preview over.

## Action: Preview

Kald `preview`, hver gang content, operation, recipients, filters, exclusions
eller assignment options aendres. Debounce hurtige filteraendringer, annuller
eller ignorer forrige requests, og accepter kun seneste response for den
aktive owner.

Request-eksempel:

```json
{
  "action": "preview",
  "ownerAccountId": "<selected owner UUID>",
  "operation": "assign",
  "content": {
    "type": "program",
    "id": "<published program UUID>"
  },
  "includeAllPlayers": false,
  "playerIds": ["<direct player UUID>"],
  "filters": [
    {
      "field": "team",
      "values": ["<team UUID>"],
      "operator": "in"
    },
    {
      "field": "crm_status",
      "values": ["active"],
      "operator": "in"
    }
  ],
  "exclusions": {
    "playerIds": ["<excluded player UUID>"],
    "teamIds": []
  },
  "assignment": {
    "startDate": "2026-07-20"
  }
}
```

Response `data`:

```ts
type BulkAssignmentPreviewV1 = {
  apiVersion: 1;
  ownerAccountId: string;
  previewToken: string;
  expiresAt: string;
  operation: 'assign' | 'update' | 'remove';
  content: {
    type: 'activity' | 'exercise' | 'training_template' | 'program';
    id: string;
    title?: string;
  };
  summary: {
    matched: number;
    included: number;
    excluded: number;
    duplicates: number;
    conflicts: number;
    willCreate: number;
    willUpdate: number;
    willRemove: number;
  };
  recipients: Array<{
    playerId: string;
    name: string;
    reasons: string[];
    status?: 'create' | 'update' | 'remove' | 'duplicate' | 'conflict';
    conflictCode?: string | null;
  }>;
  excluded: Array<{
    playerId: string;
    name: string;
    reasons: string[];
    status?: 'create' | 'update' | 'remove' | 'duplicate' | 'conflict';
  }>;
  conflicts: Array<{
    playerId: string;
    name: string;
    reasons: string[];
    status?: 'create' | 'update' | 'remove' | 'duplicate' | 'conflict';
    conflictCode?: string | null;
  }>;
};
```

Valider responsen foer render:

```ts
if (
  data.apiVersion !== 1 ||
  data.ownerAccountId !== selectedOwnerAccountId
) {
  throw new Error('Bulk assignment response does not match the active workspace.');
}
```

`matched` er antal spillere foer exclusions/eligibility-konflikter.
`included` er de recipients, som serveren vil behandle. `willCreate`,
`willUpdate` og `willRemove` er den autoritative write-effekt.

Vis ikke kun totalen. Brugeren skal kunne aabne listerne for:

- included recipients
- explicitly excluded recipients
- duplicates/already assigned
- conflicts/blocked recipients

Render `reasons`, `status` og `conflictCode` fra serveren. Udled ikke
conflict-status ud fra lokale rows.

Previewet er tidsbegraenset. Vis `expiresAt` som en diskret state, og kald nyt
preview, hvis tokenet udloeber eller endpointet returnerer stale/expired.

## Action: Apply

`apply` skal sende samme operation, content, recipient-definition, exclusions
og assignment options som det preview, brugeren netop har bekraeftet, plus
`previewToken` og `idempotencyKey`.

Generer en stabil unik string som `idempotencyKey`, naar confirmation-steppet
aabnes. Bevar samme key ved network retry af den samme tilsigtede handling.
Generer foerst en ny key, hvis brugeren aendrer input og laver et nyt preview/en
ny handling.

Request-eksempel:

```json
{
  "action": "apply",
  "ownerAccountId": "<selected owner UUID>",
  "operation": "assign",
  "content": {
    "type": "program",
    "id": "<published program UUID>"
  },
  "includeAllPlayers": false,
  "playerIds": ["<direct player UUID>"],
  "filters": [
    {
      "field": "team",
      "values": ["<team UUID>"],
      "operator": "in"
    },
    {
      "field": "crm_status",
      "values": ["active"],
      "operator": "in"
    }
  ],
  "exclusions": {
    "playerIds": ["<excluded player UUID>"],
    "teamIds": []
  },
  "assignment": {
    "startDate": "2026-07-20"
  },
  "previewToken": "<opaque preview token>",
  "idempotencyKey": "<client-generated unique key>"
}
```

Successful response `data`:

```ts
type BulkAssignmentApplyResultV1 = {
  apiVersion: 1;
  ownerAccountId: string;
  batch: BulkAssignmentBatchV1;
  items: BulkAssignmentBatchItemV1[];
};

type BulkAssignmentBatchV1 = {
    batchId: string;
    ownerAccountId: string;
    operation: 'assign' | 'update' | 'remove';
    status:
      | 'applied'
      | 'partially_applied'
      | 'rolled_back'
      | 'partially_rolled_back'
      | 'failed';
    content: {
      type: 'activity' | 'exercise' | 'training_template' | 'program';
      id: string;
      title?: string | null;
    };
    summary: {
      matched: number;
      included: number;
      excluded: number;
      duplicates: number;
      conflicts: number;
      created: number;
      updated: number;
      removed: number;
      skipped: number;
      failed: number;
      rollbackEligible?: number;
      rollbackConflicts?: number;
      rolledBack?: number;
    };
    createdAt: string;
    appliedAt: string | null;
    rolledBackAt?: string | null;
};

type BulkAssignmentBatchItemV1 = {
    itemId: string;
    playerId: string;
    name?: string | null;
    status:
      | 'created'
      | 'updated'
      | 'removed'
      | 'duplicate'
      | 'conflict'
      | 'skipped'
      | 'failed'
      | 'rolled_back'
      | 'rollback_conflict';
    targetType?:
      | 'activity'
      | 'exercise_assignment'
      | 'training_template_assignment'
      | 'program_enrollment';
    targetId?: string | null;
    reasonCode?: string | null;
    message?: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    createdAt: string;
    rolledBackAt?: string | null;
};
```

Efter succes:

1. Vis resultatsiden fra `batch` og `items`.
2. Refetch `batchDetail` med `batch.batchId`.
3. Refetch de beroerte eksisterende activity/task/program views fra Supabase.
4. Bevar filters/selection kun hvis brugeren vaelger `Create another`.
5. Vis ikke en samlet success-state, hvis batchen indeholder conflicts eller
   failed items. Vis den faktiske status og antal.

Hvis browseren mister svaret efter requesten, retry med samme
`idempotencyKey`. Opret ikke et nyt batch ved network retry.

Hvis `apply` returnerer `BULK_PREVIEW_STALE` (`409`) eller en anden dokumenteret
preview-expiry/recipient-conflict, skal UI gaa tilbage til Preview, hente en ny
serverberegning og kraeve ny bekraeftelse. Anvend aldrig et gammelt recipient
snapshot.

## Action: Batch Detail

Brug batch detail til resultatside, history drawer og til at kontrollere den
aktuelle rollback-status.

Request:

```json
{
  "action": "batchDetail",
  "ownerAccountId": "<selected owner UUID>",
  "batchId": "<assignment batch UUID>"
}
```

Response `data`:

```ts
type BulkAssignmentBatchDetailV1 = BulkAssignmentApplyResultV1 & {
  rollback: {
    eligible: boolean;
    eligibleCount: number;
    conflictCount: number;
    reasonCode?: string | null;
  };
};
```

Render responsen direkte; sammenflet ikke med cached batch-data fra et andet
workspace.

Et batch-id fra en anden owner skal give `403` eller `404` og maa aldrig kunne
vises via Base44.

## Action: Rollback

Rollback er en ny server-side handling, ikke en browser-side sletning.

Vis kun rollback CTA, naar `batchDetail.rollback.eligible === true`. Vis
`eligibleCount`, `conflictCount` og eventuel `reasonCode`, foer brugeren
bekraefter den destructive modal.

Request:

```json
{
  "action": "rollback",
  "ownerAccountId": "<selected owner UUID>",
  "batchId": "<assignment batch UUID>",
  "idempotencyKey": "<client-generated unique key for this rollback>"
}
```

Genbrug samme rollback-idempotency key ved retry af samme rollback-forsog.

Successful response `data`:

```ts
type BulkAssignmentRollbackResultV1 = BulkAssignmentApplyResultV1 & {
  summary: BulkAssignmentBatchV1['summary'];
};
```

Rollback maa ikke:

- slette player progression
- slette completed tasks eller activity history
- overskrive et assignment, der er aendret efter batchen
- fjerne content, som ikke sikkert kan spores til batchen
- skjule konflikter som success

Hvis nogle items ikke kan rulles tilbage sikkert, vis dem som konflikter med
serverens forklaring. Efter rollback skal UI kalde `batchDetail` igen og
refetche de beroerte assignment/activity/program views.

## Permissions Og Multi-Role

Adgang vurderes for den valgte `OwnerAccount` og alle brugerens aktive roller.

- `owner`: preview, assign, update, remove og rollback.
- `admin`: preview, assign, update, remove og rollback inden for owneren.
- `coach`: preview og de write-actions, som owner permissions tillader.
- `assistant_coach`: kun de actions og recipients, som serverens relationer og
  permissions tillader.
- `player` og `parent`: ingen adgang til bulk admin-flowet.
- platform admin: kun hvis den eksisterende portal/backend giver eksplicit
  owner access; UI maa ikke antage service-role adgang.

En bruger med `owner + admin + coach` skal se den samlede hoejeste tilladte
funktionalitet. Brug ikke `roles[0]` som gate.

Serveren er den endelige permission-kontrol. Skjul/disable utilgaengelige CTA'er
ud fra context, men haandter stadig `403` korrekt.

Naar workspace skifter:

- annuller/ignorer in-flight requests fra forrige owner
- ryd content selection
- ryd direct player selection og filtre
- ryd exclusions
- ryd preview token og idempotency key
- ryd batch detail
- hent ny `context`

Ingen state fra owner A maa vises eller sendes i owner B.

## Web UX: Bulk Assignment Wizard

Brug et desktop-effektivt workspace med tabel/liste, filterpanel og sidepanel
eller modal. Det skal fortsat fungere responsivt, men det er ikke en ny landing
page.

### Step 1: Choose Action And Content

Vis:

- operation: `Assign`, `Update` eller `Remove`
- content tabs/type filter: Activities, Exercises, Templates, Programs
- search paa titel/beskrivelse
- owner-scoped results fra `context.content`
- status/type metadata fra API'en

Prefill content, naar wizard aabnes fra et eksisterende activity-, template-
eller programkort. Tillad at brugeren skifter content, men aldrig til et id fra
et andet workspace.

Programmer, der ikke er publiceret/assignable, skal vaere disabled eller
udeladt efter backend context. Vis ikke et lokalt workaround for draft
programmer.

### Step 2: Choose Recipients

Vis to parallelle muligheder:

- et eksplicit `All eligible players`-valg, der sender
  `includeAllPlayers: true` og tydeligt viser det brede scope
- direkte player search/multi-select fra `context.roster`
- server-understoettede filtergrupper fra `context.filters`

Hvis `All eligible players` er aktivt, skal direkte valg og filtergrupper vaere
disabled/ignoreret i requesten. Slukker brugeren valget igen, skal mindst en
direkte spiller eller filtergruppe vaelges, foer preview kan kaldes.

Filter-controls:

- Team: multi-select
- Tags: multi-select
- CRM status: multi-select
- Age: min/max
- Playing level: multi-select
- Position: multi-select
- Program enrollment: program + enrollment statuses

Vis aktive filters som removable chips. Vis en menneskelaeselig expression,
for eksempel:

```text
(U15 A or U16 A) and (Elite or Talent) and CRM status is Active
```

Det lokale roster count maa kun vaere en foreloebig indikator. Det endelige
antal kommer fra `preview.summary`.

### Step 3: Exclusions

Vis:

- explicit player exclusions med search
- team exclusions
- forklaring af at exclusions vinder over direct selection og filters
- en synlig liste/chips over alle exclusions

Giv mulighed for at fjerne en exclusion inden preview. Send kun IDs fra aktiv
owner.

### Step 4: Preview

Kald `preview` og render serverens resultat.

Summary cards:

- Matched
- Included
- Excluded
- Duplicates
- Conflicts
- Will create / update / remove afhængigt af operation

Recipient-tabellen skal mindst have:

- checkbox eller row selection kun til inspektion, ikke til at omskrive
  server-previewet
- player name
- inclusion reasons
- current/result status
- conflict/duplicate badge
- exclusion reason, hvis relevant

Tilbyd tabs eller filters for `Included`, `Excluded`, `Duplicates` og
`Conflicts`. Det skal vaere muligt at gaa tilbage og aendre selection;
enhver aendring invalidates preview-tokenet og kraever et nyt preview.

Disable Continue hvis:

- preview loader eller fejler
- token er udloebet
- owner/content har skiftet
- `included` er `0`
- operationen ikke har nogen faktisk effekt
- backend returnerer en blokerende konflikt

### Step 5: Confirm

Vis en final summary med content, owner, operation og de autoritative counts.

For `assign`:

```text
Assign <content title> to <included count> players?
```

For `update` og `remove` skal modalens destructive character vaere tydelig.
Vis fx:

```text
Remove this assignment from <willRemove count> players?
```

Kraev en ekstra checkbox eller tekstbekraeftelse ved bulk `remove`. Disable
confirm under request. Double-click maa ikke sende flere forskellige
idempotency keys.

### Step 6: Result And History

Vis:

- batch status og timestamp
- created, updated, removed, skipped, duplicate, conflict og failed counts
- item-level resultat
- `View assignments`
- `Create another`
- `Rollback`, kun hvis backend tillader det

Tilfoej batch history i det eksisterende `Plan > Assignments` workspace, hvis
context/batch-list data allerede findes i implementeringen. Hvis v1 kun har
`batchDetail`, maa Base44 ikke opfinde en history-liste fra local storage;
vis i stedet detail for batches returneret af de eksisterende views/API'er.

## Bulk Update Og Remove

Brug samme wizard og server-preview som ved assign.

- Content og recipient-definition identificerer de assignments, der kan
  beroeres.
- Preview skal vise `willUpdate` eller `willRemove` foer confirm.
- Duplicates, allerede fjernede assignments og player progress maa ikke
  behandles som tavs success.
- Base44 maa ikke opdatere/fjerne direct player assignments, team-derived
  assignments eller program materialization med egne ad hoc queries.
- Hvis serveren afviser en unsafe update/remove, behold wizard state og vis
  conflict reason.

## Loading, Empty, Error Og Race States

Implementer mindst:

- context loading skeleton
- content list loading/empty/no-results
- roster/filter empty state
- preview idle/loading/success/expired/stale/error
- apply pending/success/partial/conflict/error
- batch detail loading/not found/forbidden
- rollback pending/success/partial/conflict/error
- owner switch state
- offline/network failure med manuel retry

Undgaa stale response races:

- bind hver request til active `ownerAccountId`
- behold en request sequence eller AbortController
- ignorer en response, hvis owner eller input revision har aendret sig
- invalider preview straks ved enhver inputaendring
- send aldrig apply fra preview state for en tidligere revision

Efter `401` maa UI ikke genbruge tokenet blindt. Brug eksisterende
session-refresh/login-flow og hent derefter ny context/preview.

## Error Handling

Haandter HTTP-status og serverens `error.code`.

### `400` Validation

Eksempler:

- `VALIDATION_ERROR`
- `INVALID_ACTION`
- `UNSUPPORTED_OPERATION`
- `UNSUPPORTED_CONTENT_TYPE`
- `INVALID_FILTER`
- `INVALID_ASSIGNMENT_OPTIONS`

Vis felt-/step-naer fejl og behold wizard state. Send ikke requesten igen uden
at input aendres.

### `401` Authentication

Eksempler:

- `UNAUTHORIZED`
- `UNAUTHORIZED_NO_AUTH_HEADER`
- `INVALID_TOKEN`

Koer eksisterende session refresh/login flow. Ryd preview token og hent ny
context efter gyldig session.

### `403` Permission / Owner Scope

Eksempler:

- `FORBIDDEN`
- `OWNER_ACCESS_DENIED`
- `PLAYER_ACCESS_DENIED`
- `CONTENT_ACCESS_DENIED`

Vis at brugeren mangler adgang til den valgte workspace/action. Skift ikke til
direkte Supabase table writes som fallback.

### `404` Missing Resource

Eksempler:

- `OWNER_ACCOUNT_NOT_FOUND`
- `CONTENT_NOT_FOUND`
- `BATCH_NOT_FOUND`

Refetch context eller relevant list. Fjern en stale selection fra UI.

Et unauthenticated smoke test-resultat paa `404` betyder, at Edge Function ikke
er deployed; det er ikke en normal auth-state.

### `409` Conflict / Stale Preview

Eksempler:

- `BULK_PREVIEW_STALE`
- `PREVIEW_EXPIRED`
- `RECIPIENT_COUNT_MISMATCH`
- `IDEMPOTENCY_CONFLICT`
- `DUPLICATE_ASSIGNMENT`
- `ASSIGNMENT_CONFLICT`
- `ROLLBACK_CONFLICT`
- `BATCH_NOT_ROLLBACKABLE`

Ved stale/expired preview: hent nyt preview og kraev ny confirmation.

Ved idempotency conflict: behold samme intended action synlig, hent batch
detail hvis backend returnerer batch-id, og generer ikke automatisk en ny key.

Ved rollback conflict: vis item-level conflicts og behold historikken.

### `500` Server Error

Vis en stabil generic fejl og manuel retry. Start ikke en automatisk retry-loop
for writes. Ved ukendt apply-resultat skal retry bruge samme idempotency key.

## Supabase Data Og Server-Side Ansvar

Base44 maa kun kende API-kontrakten. Backend er ansvarlig for:

- owner membership og multi-role permission checks
- owner-scoped roster- og CRM-filter resolution
- team memberships og exclusions
- duplicate detection
- content eligibility og published status
- atomic/idempotent assignment writes
- program/template materialization
- audit i `assignment_batches` og `assignment_batch_items`
- eksisterende direct player/team assignment compatibility
- `activity_assignment_team_exclusions`, hvor relevant
- preview token/hash og stale detection
- sikker rollback og protection af progression/senere aendringer

Web maa ikke laese/skrive disse tabeller direkte for at efterligne endpointet.

## App / iOS / Android Parity

Mobilappen skal bruge samme `manageOwnerBulkAssignments` endpoint og samme
v1-kontrakt. Base44 maa ikke skabe et web-only assignment-format.

Forretningsparitet betyder, at coach/owner/admin/tilladt assistant coach paa
baade web og mobil kan:

- vaelge content
- vaelge direkte spillere og samme filtertyper
- tilfoeje player/team exclusions
- se samme serverberegnede preview og konflikter
- confirm assign/update/remove
- se batchresultat
- anmode om rollback, naar backend tillader det

Mobil UX er native og trinvis med search, chips, cards/bottom sheets, tydeligt
recipient count og ekstra destructive confirmation. Base44 skal ikke diktere
en komprimeret desktop-tabel til mobil.

Playerens modtagelse af content genbruger den eksisterende mobile
activity/task/program-oplevelse. #287 maa ikke bygge en ny player portal eller
et parallelt player assignment view i Base44.

Kontroller parity ved at oprette paa web og laese paa mobil samt oprette paa
mobil og laese batch/resultat paa web.

## Web QA

Test mindst foelgende i den faktiske Base44-app:

### Owner Og Permissions

- `club` owner med admin/coach roller
- `private_coach_business` med samme bruger som `owner + admin + coach`
- tilladt `assistant_coach`
- player-only og parent-only bruger afvises
- bruger med flere workspaces kan skifte uden stale selection/data
- cross-owner player/content/batch ids afvises
- Apple-created private coach business kan bruge flowet via sin normale
  owner-session; Base44 verifierer ikke Apple receipt

### Content

- assign eksisterende activity
- assign exercise
- assign hver understoettet training template type
- assign publiceret training program med start date
- draft/archived/non-assignable content kan ikke anvendes
- entry point fra `KlubAktiviteter`, `KlubOpgaver`, Plan og Programs prefiller
  korrekt content

### Recipients Og Filters

- direct player only
- et team
- flere teams med OR inden for gruppen
- tag-filter
- CRM status
- inclusive age range
- playing level
- position
- program enrollment + status
- flere filtergrupper bruger AND
- direct player plus filters deduplikeres server-side
- player exclusion vinder over direct selection/filter
- team exclusion virker og forklares i preview
- no-match og all-excluded states blokerer apply

### Preview Og Apply

- summary counts matcher recipient/excluded/conflict rows
- duplicates vises uden dobbelt assignment
- conflicts vises med serverens code/reason
- inputaendring invalidates preview
- udloebet/stale token kraever nyt preview og confirmation
- double click giver kun eet batch
- retry med samme idempotency key giver ikke duplicates
- assign/update/remove viser korrekt `willCreate`/`willUpdate`/`willRemove`
- partial/conflict result vises ikke som fuld success

### Batch Og Rollback

- batch detail matcher apply-resultatet efter refetch
- anden owner kan ikke aabne batch-id'et
- rollback CTA vises kun ved `batchDetail.rollback.eligible`
- safe rollback opdaterer batch og affected views
- player progression/senere edit giver conflict og bevares
- rollback retry er idempotent
- rollback-conflicts vises item-level

### Regression Og Parity

- eksisterende direct player assignment virker fortsat
- eksisterende team assignment virker fortsat
- eksisterende activity team exclusions virker fortsat
- web-created assignments vises korrekt i iOS og Android
- mobile-created batch/resultat kan laeses korrekt paa web
- player ser assignments i eksisterende activity/task/program flows
- ingen Base44 business entity eller browser-side service-role key er oprettet

## Acceptance Checklist

- [ ] Eksisterende login-beskyttede Base44/KlubAdmin-app er genbrugt.
- [ ] Der er ikke bygget en greenfield eller parallel portal.
- [ ] Supabase er eneste source of truth.
- [ ] Owner scope er altid `ownerAccountId`.
- [ ] `club` og `private_coach_business` er understoettet.
- [ ] Multi-role permissions bruger alle aktive roller.
- [ ] Context kommer fra `manageOwnerBulkAssignments.context`.
- [ ] Activity, exercise, training template og program kan vaelges.
- [ ] Direct players, teams og alle CRM/program-filtre kan kombineres.
- [ ] AND/OR-logikken er synlig og matcher serveren.
- [ ] Player- og team-exclusions vinder over inclusions.
- [ ] Preview er serverberegnet og viser praecise recipients.
- [ ] Duplicates, exclusions og conflicts kan inspiceres.
- [ ] Apply kraever preview token, idempotency key og confirmation.
- [ ] Assign, update og remove bruger samme sikre flow.
- [ ] Batch detail viser item-level resultat.
- [ ] Rollback vises kun, naar backend tillader det.
- [ ] Unsafe rollback bevarer progression og senere aendringer.
- [ ] Workspace-skift rydder al stale state.
- [ ] Cross-user writes sker kun server-side.
- [ ] Eksisterende direct player/team flows bestaar regression.
- [ ] Web, iOS og Android bruger samme backend-kontrakt.
- [ ] Loading, empty, error, stale og partial states er implementeret.
- [ ] Alle nye/touched systemtekster er paa engelsk.

## Remote Backend Status — Verified 2026-07-13

Backend-kontrakten er klar til Base44-integration mod dette target:

- Project ref: `lhpczofddvwcyrgotzha`
- Base URL: `https://lhpczofddvwcyrgotzha.supabase.co/functions/v1`
- API version: `1`
- `manageOwnerBulkAssignments`: deployed, `ACTIVE`, version `1`
- `manageTrainingTemplates`: redeployed, `ACTIVE`, version `7`
- `manageTrainingPrograms`: redeployed, `ACTIVE`, version `13`
- Migration `20260713120000_owner_bulk_assignments.sql`: present locally and
  remotely; assignment batch tables, policies and RPC'er er deployed
- `supabase db push --dry-run --linked`: `Remote database is up to date.`
- Unauthenticated endpoint smoke:
  - `manageOwnerBulkAssignments`: `401` (protected; not `404`)
  - `manageTrainingTemplates`: `401` (protected; not `404`)
  - `manageTrainingPrograms`: `401` (protected; not `404`)
- `supabase db lint --linked`: gennemfoert. De rapporterede errors tilhoerer
  eksisterende legacy-funktioner uden for #287; #287-RPC'erne har alene
  ikke-funktionelle unused-variable warnings.
- Authenticated `context`/`preview`/`apply`/`batchDetail`/`rollback` production
  smoke: **ikke koert**, fordi der ikke er en godkendt, sikker authenticated
  produktionsfixture/token i repoet. Koer dette som del af Base44 acceptance QA
  med en rigtig `owner`/`admin`/`coach` testbruger og kontroller audit/rollback.

Remote infrastructure er dermed verificeret og prompten maa implementeres i
den eksisterende Base44/KlubAdmin-app. Det erstatter ikke den autentificerede
acceptance QA og er ikke tilladelse til direkte table writes eller simuleret
assignment success.

## Delivery Fra Base44

Returner efter Base44-implementering:

1. Liste over beroerte eksisterende pages, components og services.
2. Beskrivelse af hvilke KlubAdmin/Plan/Programs flows der blev genbrugt.
3. Bekraeftelse paa at der ikke er lavet en ny portal eller Base44 business
   entities.
4. Screenshots af content, filters, exclusions, preview, confirmation, result
   og rollback paa desktop og responsive width.
5. Network evidence for alle fem actions med service-role secrets redacted.
6. QA-resultater for begge owner-typer og multi-role.
7. QA-resultater for direct players, teams, tags, CRM filters, enrollment og
   exclusions.
8. Bevis for idempotent retry, stale preview og duplicate/conflict handling.
9. Bevis for safe rollback og preserved player progress.
10. Web/iOS/Android parity-resultater og en liste over eventuelle reelle
    backend-blockers.

Marker ikke UI placeholders, disabled actions eller lokalt simulerede writes
som en faerdig #287-leverance.
