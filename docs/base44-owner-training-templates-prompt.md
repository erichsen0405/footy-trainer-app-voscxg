# Base44 Prompt: Owner Training Templates

Brug denne prompt i den eksisterende login-beskyttede Base44/KlubAdmin webapp.
Byg ikke en ny portal, og opret ikke Base44-interne business entities til
training-template data.

## Formaal

Tilpas eksisterende `KlubOpgaver`/task-template flow til `OwnerAccount`, saa
baade klubber og private coach businesses kan oprette, redigere, duplikere,
arkivere og genbruge:

- task-skabeloner
- exercise-skabeloner
- session-skabeloner
- uge-skabeloner

Tenant scope er altid:

```text
owner_account_id
```

`owner_type` kan vaere:

- `club`
- `private_coach_business`

## Reuse Existing Base44/KlubAdmin

Genbrug den eksisterende Base44 webapp, navigation og KlubAdmin-moduler. Byg
videre paa eksisterende:

- `KlubOpgaver`
- `KlubAktiviteter`
- `KlubDashboard`
- `clubAdminApi`
- `roleRedirect`
- `activityWriteService.jsx`

Base44 er kun host/UI-lag. Supabase er source of truth for owner, roller,
templates, items, versioner, assignments, aktiviteter og tasks.

## Navigation

I webappen skal training templates ligge under coach/owner portalens plan- eller
opgaveomraade. Brug et navn som `Plan` eller `Skabeloner`, men behold placering
i den eksisterende owner portal.

Mobilappen placerer samme feature under:

```text
Plan > Opret
```

Eksisterende skabeloner vises under Plan-visningerne `Opgaver`, `Exercise`,
`Session` og `Week`; der er ikke laengere en separat `Skabeloner`-knap i
mobilnavigationen.

Web og mobil skal bruge samme backend-kontrakt og samme owner permissions.

## Supabase API

Base URL:

```text
https://lhpczofddvwcyrgotzha.supabase.co/functions/v1
```

Function:

```text
manageTrainingTemplates
```

Hvis Base44 bruger Supabase JS:

```ts
await supabase.functions.invoke('manageTrainingTemplates', {
  body: {
    action: 'list',
    ownerAccountId: selectedOwnerAccountId,
  },
});
```

Hvis Base44 kalder HTTP direkte:

```http
POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingTemplates
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_anon_publishable_key>
Content-Type: application/json
```

Service-role key maa aldrig ligge i Base44/browseren.

## Actions

### Context

```json
{
  "action": "context"
}
```

Returnerer owner workspaces, som brugeren kan arbejde i.

### List

```json
{
  "action": "list",
  "ownerAccountId": "<owner_account uuid>"
}
```

Returnerer owner, actor, folders, templates og summary.
Response indeholder ogsaa `libraryItems`, som Base44 kan bruge til at lade
coach vaelge oevelser fra `exercise_library`.

### Create Or Update Template

```json
{
  "action": "upsertTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "id": null,
  "templateType": "session",
  "title": "Finishing session",
  "description": "High repetition finishing session.",
  "folderId": null,
  "focusAreas": ["Finishing", "First touch"],
  "sessionStartTime": null,
  "durationMinutes": null,
  "metadata": {},
  "defaultActivityCategoryName": "Training",
  "status": "active",
  "sourceTaskTemplateId": null,
  "items": [
    {
      "itemType": "exercise",
      "title": "Interval finishing",
      "description": "Two-touch pattern before finishing.",
      "dayOffset": 0,
      "startTime": null,
      "durationMinutes": null,
      "sortOrder": 0,
      "config": {
        "task": {
          "title": "Interval finishing",
          "description": "Two-touch pattern before finishing.",
          "categoryIds": [],
          "videoUrls": ["https://example.com/drill.mp4"],
          "mediaNames": ["Drill video"],
          "reminderMinutes": 10,
          "afterTrainingEnabled": true,
          "afterTrainingDelayMinutes": 15,
          "afterTrainingFeedbackEnableScore": true,
          "afterTrainingFeedbackScoreExplanation": "Rate technique",
          "afterTrainingFeedbackEnableNote": true,
          "autoAddToActivities": false
        },
        "timer": {
          "activeSeconds": 45,
          "restSeconds": 15,
          "rounds": 4
        }
      }
    }
  ],
  "changeNote": "Base44 edit"
}
```

`templateType` kan vaere:

- `task`
- `exercise`
- `session`
- `week`

`itemType` kan vaere:

- `task_template`: kun i session templates
- `exercise`: kun i session templates, med `config.task` og `config.timer`
- `feedback_requirement`: kun i session templates
- `session_template`: kun i week templates og skal linke til en gemt session
  template via `linkedTemplateId`
- `focus`: kun i session templates
- `note`: kun i session templates

Task og exercise templates har ikke item-liste. De gemmer opgavefelterne direkte
i `metadata.task` via `taskConfig`. Exercise templates gemmer desuden timer i
`metadata.timer` via `exerciseTimer`.

Session templates gemmer ikke dato, starttid eller varighed. Det saettes foerst,
naar coachen vaelger `Tildel` og materialiserer sessionen til en konkret
aktivitet i spillerens kalender. Hvis klienten sender `sessionStartTime`,
`startTime`, `metadata.session.startTime` eller `durationMinutes` paa en
session template, ignorerer Edge Function disse felter.

Task og exercise maa ikke have subtasks eller egen task time. Hvis klienten
sender `subtasks`, `taskDurationEnabled` eller `taskDurationMinutes`, ignorerer
Edge Function disse felter og gemmer `subtasks: []`,
`taskDurationEnabled: false` og `taskDurationMinutes: null`.

```json
{
  "action": "upsertTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "templateType": "task",
  "title": "Solo touch work",
  "taskConfig": {
    "videoUrls": ["https://example.com/touch.png"],
    "mediaNames": ["Technique image"],
    "reminderMinutes": 0,
    "afterTrainingEnabled": false
  }
}
```

Exercise template:

```json
{
  "action": "upsertTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "templateType": "exercise",
  "title": "Repeat sprints",
  "taskConfig": {
    "categoryIds": ["<activity_category uuid>"],
    "videoUrls": ["https://example.com/sprint.mp4"],
    "mediaNames": ["Sprint demo"],
    "reminderMinutes": 20,
    "afterTrainingEnabled": true,
    "afterTrainingDelayMinutes": 30,
    "afterTrainingFeedbackEnableScore": true,
    "afterTrainingFeedbackScoreExplanation": "Rate sprint quality",
    "afterTrainingFeedbackEnableNote": true,
    "autoAddToActivities": true
  },
  "exerciseTimer": {
    "activeSeconds": 30,
    "restSeconds": 20,
    "rounds": 8
  }
}
```

Session templates er selve aktivitets-/traeningssessionen. Brug
`defaultActivityCategoryId` eller `defaultActivityCategoryName` paa sessionen,
ikke et `activity` item.

Exercise er en opgave med praecis samme opgavefelter som normale tasks plus
intervaltimer. Det inkluderer `categoryIds`, medier, reminder,
post-training feedback og `autoAddToActivities`:

```json
{
  "itemType": "exercise",
  "title": "Core finisher",
  "config": {
    "task": {
      "videoUrls": [],
      "mediaNames": [],
      "afterTrainingEnabled": true,
      "afterTrainingDelayMinutes": 0
    },
    "timer": {
      "activeSeconds": 40,
      "restSeconds": 20,
      "rounds": 5
    }
  }
}
```

### Reuse And Library Items

Naar Base44 opretter eller redigerer en `session`, skal `Task` og `Exercise`
items kunne komme fra tre kilder:

- `New`: coach udfylder felterne direkte i session builderen.
- `Saved`: coach vaelger en eksisterende `training_templates` row med
  `templateType: 'task'` eller `templateType: 'exercise'`.
- `Library`: coach vaelger en row fra responsefeltet `libraryItems`, som kommer
  fra `exercise_library`.

For `Saved` skal itemet sende `linkedTemplateId` til den valgte template.

For `New` og `Library` maa `linkedTemplateId` vaere `null`. Edge Function
opretter da automatisk en selvstaendig `task` eller `exercise` template og
gemmer den nye template-id tilbage paa itemets `linkedTemplateId` samt
`config.reusableTemplateId`.

Naar Base44 opretter eller redigerer en `week`, maa item-listen kun indeholde
`session_template` items. Hvert item skal vaelges fra `Saved` og sende
`linkedTemplateId` til en eksisterende `training_templates` row med
`templateType: 'session'`. Week builderen maa ikke tilbyde `New`, `Library`,
`task_template`, `exercise`, `focus` eller `note` som item-valg.

Library item eksempel:

```json
{
  "itemType": "exercise",
  "linkedTemplateId": null,
  "title": "Library sprint drill",
  "config": {
    "libraryExerciseId": "<exercise_library uuid>",
    "source": {
      "kind": "exercise_library",
      "libraryExerciseId": "<exercise_library uuid>"
    },
    "task": {
      "title": "Library sprint drill",
      "description": "From exercise_library",
      "videoUrls": ["https://example.com/library.mp4"],
      "mediaNames": ["Library media"]
    },
    "timer": {
      "activeSeconds": 30,
      "restSeconds": 20,
      "rounds": 6
    }
  }
}
```

### Duplicate

```json
{
  "action": "duplicateTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "templateId": "<training_template uuid>"
}
```

### Archive

```json
{
  "action": "archiveTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "templateId": "<training_template uuid>"
}
```

### Restore

```json
{
  "action": "restoreTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "templateId": "<training_template uuid>"
}
```

### Folder

```json
{
  "action": "upsertFolder",
  "ownerAccountId": "<owner_account uuid>",
  "folderId": null,
  "name": "U13 finishing",
  "color": "#2563eb"
}
```

## Response Contract

`list`, `upsertTemplate`, `duplicateTemplate`, `archiveTemplate`,
`restoreTemplate` og `upsertFolder` returnerer:

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
  actor: {
    userId: string;
    roles: string[];
    canManageTemplates: boolean;
  };
  folders: Array<{
    id: string;
    ownerAccountId: string;
    name: string;
    color: string;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
  }>;
  templates: Array<{
    id: string;
    ownerAccountId: string;
    templateType: 'task' | 'exercise' | 'session' | 'week';
    title: string;
    description: string | null;
    status: 'active' | 'archived';
    folderId: string | null;
    folderName: string | null;
    focusAreas: string[];
    durationMinutes: number | null;
    defaultActivityCategoryId: string | null;
    defaultActivityCategoryName: string | null;
    sourceTaskTemplateId: string | null;
    activeVersionId: string | null;
    versionNumber: number;
    metadata: Record<string, unknown>;
    itemCount: number;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
    archivedAt: string | null;
    items: TrainingTemplateItem[];
  }>;
  libraryItems: Array<{
    id: string;
    title: string;
    description: string | null;
    videoUrl: string | null;
    videoUrls: string[];
    mediaNames: string[];
    categoryPath: string | null;
    isSystem: boolean;
    trainerId: string | null;
  }>;
  summary: {
    total: number;
    active: number;
    archived: number;
    task: number;
    exercise: number;
    session: number;
    week: number;
  };
}
```

## Database

Supabase tabeller:

- `training_template_folders`
- `training_templates`
- `training_template_items`
- `template_versions`

Eksisterende tabeller, der kan linkes til:

- `task_templates`
- `task_template_categories`
- `exercise_library`

Versioner oprettes efter hver create/update/duplicate/archive/restore, saa
senere assignments kan pege paa et stabilt snapshot.

## Access

Adgang gives kun til brugere med aktiv owner adgang:

- `owner`
- `admin`
- `coach`
- `assistant_coach`

Platform admins maa ogsaa tilgaa templates via eksisterende platform-admin
owner-selection flow.

Brug ikke den gamle enkeltrolle fra `user_roles` som gate. Samme bruger/mail kan
have flere roller paa samme `owner_account_id`.

Player og guardian maa ikke have template-admin adgang.

## UI Flow

Byg en desktop-effektiv template builder i eksisterende owner portal:

- owner/workspace switcher, hvis brugeren har flere owners
- type filter: task, exercise, session, week
- status filter: active, archived for task/exercise
- folder/kategori filter
- liste med titel, type, fokusomraader, item count og version
- handlinger: opret, rediger, dupliker, arkiver/gendan for task/exercise
- builder med ordered items, drag/reorder og preview
- paa mobil skal valg af `Saved` eller `Library` aabne en popup/bottom sheet med
  de samme kort-typer som resten af template/library UI'et; vis ikke saved eller
  library listen som smaa inline chips i formularen

Session-template:

- er selve sessionen/aktiviteten og kan have default aktivitetskategori
- har ikke fast starttidspunkt, dato eller varighed i selve skabelonen
- tidspunkter og varighed skal foerst vaelges ved `Tildel`, hvor coachen
  materialiserer sessionen til en konkret aktivitet for en spiller
- session items ligger per default paa samme dag som sessionen; vis ikke
  `dayOffset`/Day-vaelger i session builderen
- starttid og varighed hoerer til tildelingen, ikke til task/exercise items
- kan indeholde task-template items, exercise items, feedback requirements,
  notes og focus items
- task og exercise items kan oprettes som nye inline items, vaelges fra gemte
  task/exercise templates eller vaelges fra `libraryItems`
- task og exercise items skal have samme opgavefelter som normale task
  templates: kategorier, auto-add, medier, reminder og feedback
- exercise items skal ogsaa have intervaltimer med aktiv tid, pause og runder

Week-template:

- kan kun indeholde gemte session templates med `dayOffset`
- vis Day-vaelgeren i week builderen, da week items fordeles paa dag 1, dag 2
  osv.
- gem kun foreslaaet dag via `dayOffset`; vis ikke starttid eller varighed paa
  `session_template` items i week builderen
- startdato, uge og konkrete session-tidspunkter skal foerst vaelges ved
  `Tildel`, hvor coachen kan override de foreslaaede dage pr. spiller
- vis ikke task, exercise, focus eller note som item-valg i week builderen
- session items i week bruger `Saved` flowet og maa ikke kunne vaelges fra
  `Library`
- preview skal vise dag 1, dag 2 osv.

## Latest Plan And Card UX Requirements

Denne sektion samler de seneste mobilkrav, som Base44/web skal matche i logik
og informationsstruktur. Web maa gerne bruge desktop-layout, men begreber,
labels, filtre og handlinger skal vaere de samme som i mobilappen.

### Plan Erstatter Det Gamle Bibliotek

`Plan` er det nye samlede bibliotek for baade traenere og spillere.

- Der skal ikke bygges en separat `Bibliotek`-oplevelse for traenere/spillere
  til tasks/exercises. Skabeloner er det nye bibliotek.
- Traenerens Plan viser:
  - `Opgaver`
  - `Exercise`
  - `Session`
  - `Week`
  - `Tildelinger`
- Spillerens opgaveside skal hedde `Plan`.
- Spilleren maa kunne se egne skabeloner og skabeloner delt/tildelt fra
  traeneren.
- Spilleren skal ikke have `Tildelinger` som knap/visning, da spilleren ikke
  tildeler til andre.

### Plan Landing Og Navigation

Plan skal have en tydelig primær opret-handling.

- Brug en primær `Opret` CTA, ikke en knap der hedder `Skabeloner`.
- Ved klik paa `Opret` skal Base44 vise en modal/popup med fire valg:
  - `Task`
  - `Exercise`
  - `Session`
  - `Week`
- Hver type skal have et lille `i`/info-ikon eller helpertekst:
  - `Task`: enkelt genbrugelig opgave med media, kategorier, reminder og
    feedback.
  - `Exercise`: task med samme opgavefelter plus intervaltimer.
  - `Session`: traeningssession/aktivitet samme dag, bygget af tasks,
    exercises, noter, fokus og feedback.
  - `Week`: ugeforloeb bygget af gemte sessioner fordelt paa dage.
- Visningsvalg skal ligge samlet og logisk som dropdown/select, ikke som mange
  rodede knapper i samme raekke.
- Dropdownen skal kunne filtrere praecist paa type:
  - alle typer
  - opgaver/task
  - exercise
  - session
  - week
  - tildelinger, kun for traener/owner/admin

### Ens Sideopsætning For Alle Plan-visninger

`Opgaver`, `Exercise`, `Session`, `Week` og `Tildelinger` skal bruge samme
grundlayout:

- top: `Opret` CTA
- visning/type dropdown
- soegning
- kildefilter
- liste/folders
- ens kortkomponenter

Undgaa ekstra summary-kort, dobbelte filterkort eller standalone `Ny
skabelon`-knapper under listen, hvis `Opret` allerede findes som primær CTA.
Base44 skal ikke vise en separat `Skabeloner`-boks oven over listen, hvis listen
i sig selv allerede er skabelonbiblioteket.

### Filterlogik

Filtre skal vaere selvforklarende og ikke fylde unødigt.

- Typefilter skal vaere en dropdown/select.
- Kildefilter skal kunne skelne mellem:
  - `Alle`
  - `Mine`
  - `Workspace`/`Fra traener`
- Paa spillerens Plan skal kildefilteret vise om skabelonen er spillerens egen
  eller kommer fra traeneren.
- `Active`/`Archived` skal kun bruges hvor det giver mening:
  - task templates
  - exercise templates
- `Session` og `Week` skal ikke have aktiv/archive som primær workflow, da de
  ikke auto-tildeles til aktiviteter. Hvis backend stadig returnerer `status`,
  maa Base44 vise status diskret, men undgaa at gøre arkiv til hovedfilter for
  session/week.

### Kortdesign For Task, Exercise, Session Og Week

Alle kort skal forklare hvad informationen betyder. Vis ikke kun værdier uden
label.

Kort skal bruge label/value-felter som fx:

- `Type`: Task, Exercise, Session eller Week
- `Kilde`: Mine, Workspace, Fra traener eller FootballCoach
- `Version`: fx `v3`
- `Indhold`: antal items eller "Selvstændig skabelon"
- `Kategorier`: antal eller navne
- `Feedback`: Aktiv/Inaktiv
- `Reminder`: fx `15 min foer`
- `Timer`: fx `4 runder · 45 sek aktiv · 15 sek pause`
- `Media`: antal filer
- `Mappe`: foldernavn, hvis findes
- `Fokus`: fokusomraader, hvis findes

Beskrivelse skal have en tydelig label som `Beskrivelse`. Kort maa ikke vise en
los tekstblok, hvor brugeren ikke kan se, hvilket felt teksten kommer fra.

### Media Direkte Paa Kort

Task-, exercise-, session- og week-kort skal kunne vise media direkte paa
kortet, naar der findes media i skabelonen eller i underliggende items.

- Vis billeder direkte i kortet.
- Vis PDF som preview/aabn-link.
- Video skal kunne afspilles direkte fra kortet/listen, ikke kun via en separat
  detaljeside.
- Hvis der er flere filer, vis swipe/carousel eller en tilsvarende desktop
  media-strip.
- Session-kort skal aggregere media fra task/exercise items, saa coachen kan se
  hvilke medier sessionen indeholder.
- Week-kort maa aggregere media fra de linkede sessioner, hvis data er
  tilgaengelig i klientens loaded state. Hvis linked session content ikke er
  loaded, vis `Media` som ukendt/ikke vist fremfor at lave ekstra uautoriserede
  table reads.

### Tildel-knap Paa Alle Kort

Alle kort skal have en synlig `Tildel` handling for roller, der maa tildele.

- Task-kort: `Tildel`
- Exercise-kort: `Tildel`
- Session-kort: `Tildel`
- Week-kort: `Tildel`
- Tildelingskort: relevant `Se`, `Rediger` eller `Tildel igen`, afhængigt af
  backend-flowet

Vigtigt: Base44 maa ikke fake tildeling lokalt. Hvis backend endpoint/RPC til at
materialisere training templates til konkrete aktiviteter/tasks endnu ikke er
tilgaengeligt, skal `Tildel` enten:

- aabne en modal med tydelig "kommer naar backend assignment-flowet er klar",
  eller
- vaere disabled med forklaring.

Base44 maa ikke skrive direkte i flere tabeller fra browseren for at simulere
tildeling. Cross-user writes skal gaa via Supabase Edge Function/RPC/server-side
flow.

### Assignment Flow Der Skal Bygges Naar Backend Er Klar

Naar backend-understoettelse til `Tildel` findes, skal flowet vaere:

- Vaelg modtagere:
  - enkelt spiller
  - flere spillere
  - hold/team, hvis owner har teams
- For `Task` og `Exercise`:
  - vaelg dato eller aktivitet/session hvor opgaven skal ligge
  - behold task/exercise felterne fra skabelonen: media, kategorier, reminder,
    feedback og auto-add regler
- For `Session`:
  - vaelg dato
  - vaelg starttidspunkt
  - vaelg varighed, hvis relevant
  - materialiser sessionen som en aktivitet med tilhoerende task/exercise items
- For `Week`:
  - vaelg startdato/uge
  - vis weekens sessioner med foreslaaet `dayOffset`
  - lad coachen override dato/starttid pr. session pr. spiller/hold
  - materialiser hver session som konkrete aktiviteter

Dato, starttid og varighed maa ikke gemmes paa selve session/week skabelonen.
De hoerer til tildelingen/materialiseringen.

### Task Og Exercise Felter

`Exercise` skal have praecis samme egenskaber som `Task`. Den eneste forskel er
intervaltimeren.

Baade task og exercise skal understøtte:

- titel
- beskrivelse
- video/billeder/PDF
- media-navne
- kategorier
- auto-add til aktiviteter baseret paa kategori
- reminder
- post-training feedback
- feedback score-forklaring

Exercise skal desuden understøtte:

- `Aktiv tid`: antal sekunder med arbejde
- `Pause`: antal sekunder mellem runder
- `Runder`: antal gentagelser

Vis disse timerfelter med forklaring i UI. Brug ikke kun tomme inputfelter uden
label/helpertekst.

### Subtasks Og Tid Paa Task/Exercise

Subtasks skal ikke vises eller kunne oprettes for task/exercise templates.
Feature bruges ikke.

Task/exercise skal heller ikke have eget tidspunkt eller egen varighed i
template builderen. Tidspunkt, dato og varighed saettes paa session/tildeling,
ikke paa task/exercise niveau.

### Session Og Week Item-regler

Session:

- er en samlet aktivitet paa samme dag
- maa ikke have Day-vaelger
- kan indeholde tasks og exercises
- task/exercise items kan komme fra `New`, `Saved` eller `Library`
- nye/library task/exercise items skal automatisk gemmes som selvstaendige
  templates, saa de kan genbruges senere

Week:

- maa kun indeholde gemte session templates
- skal have Day-vaelger/day offset for hver session
- maa ikke lade coachen vaelge task/exercise direkte
- coachen skal kunne override weekens foreslaaede dage/tidspunkter ved
  tildeling

### Saved Og Library Picker

Naar brugeren vaelger `Saved` eller `Library`, skal listen vises som en
modal/popup/bottom sheet med flotte kort.

Kort i pickeren skal vise:

- titel
- type/kilde
- beskrivelse med label
- media count og gerne preview
- timer-info for exercise
- kategori/fokus, hvis findes

Vis ikke saved/library som en lang inline liste inde i selve formularen.

### Spillerens Plan

For spillere skal `Opgaver` omdoebes til `Plan`.

Spillerens Plan skal:

- vise egne skabeloner
- vise skabeloner fra traeneren
- bruge samme kortdesign som traenerens Plan
- ikke vise `Tildelinger`
- ikke vise actions som arkiver/dupliker, medmindre spilleren ejer
  skabelonen og backend tillader det
- have kildefilter, saa spilleren kan skelne mellem `Mine` og `Fra traener`

### Mobile/Web Parity Acceptance

Base44-implementeringen er klar, naar:

- Plan bruger `Opret` som primær create-handling.
- Task, Exercise, Session, Week og Tildelinger bruger samme liste/kortlogik.
- Kort viser forklarende labels, ikke kun værdier.
- Media vises paa kort, og video kan afspilles direkte fra kort/listen.
- Alle relevante kort har en `Tildel` knap eller en disabled/placeholder state,
  hvis backend assignment endnu mangler.
- Session viser ikke Day-vaelger.
- Week viser Day-vaelger og tillader kun gemte sessioner.
- Task/exercise viser ikke subtasks eller eget tidspunkt/varighed.
- Exercise har samme task-features som task plus timer med forklaringer.
- Saved/library vises i modal/popup med kort.
- Spillerens Plan erstatter den gamle opgaveside/biblioteklogik og viser egne
  samt traenerens skabeloner.

## Error Handling

Vis stabile fejl:

- `401` Unauthorized: brugeren skal logge ind igen.
- `403` Forbidden: brugeren har ikke owner coach access.
- `404` Template/folder not found: refetch listen.
- `400` Validation: vis valideringsbesked ved feltet eller i formularen.
- `500` Internal: vis generisk fejl og refetch ikke automatisk i loop.

## Remote Status

Remote status per 2026-07-09 paa project `lhpczofddvwcyrgotzha`:

- Migration `20260709150000_owner_training_templates.sql` er pushed med
  `supabase db push --yes`.
- Migration `20260709162000_training_template_item_logic.sql` er pushed med
  `supabase db push --yes`. Migrationen migrerer legacy `activity` items til
  `exercise` og laegger den nye item-type constraint paa.
- Migration `20260709173000_training_template_exercise_reuse.sql` er pushed med
  `supabase db push --yes`. Migrationen aktiverer top-level `exercise`
  templates og task/exercise reuse i session templates.
- Migration `20260709174500_training_template_week_sessions_only.sql` er pushed
  med `supabase db push --yes`. Migrationen opdaterer DB-kommentaren, saa week
  beskrives som gemte session templates.
- Edge Function `manageTrainingTemplates` er deployet og `ACTIVE` version 6,
  opdateret `2026-07-09 19:47:49 UTC`.
- No-auth smoke test returnerer `401` med `UNAUTHORIZED_NO_AUTH_HEADER`, ikke
  `404`.
- `supabase migration list --linked` viser `20260709150000`, `20260709162000`,
  `20260709173000` og `20260709174500` som remote-applied.

Verificeringskommandoer:

```bash
supabase functions list --project-ref lhpczofddvwcyrgotzha
supabase migration list --linked
curl -i -X POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingTemplates \
  -H 'Content-Type: application/json' \
  --data '{"action":"context"}'
```
