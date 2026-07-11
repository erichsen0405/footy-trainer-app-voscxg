# Base44 Complete Prompt: Issue 286 Plan And Training Templates

Brug hele denne prompt i den eksisterende login-beskyttede Base44/KlubAdmin
webapp. Dette er en videreudvikling af den eksisterende portal. Byg ikke en ny
portal, et parallelt bibliotek eller Base44-interne business entities.

## Maal

Implementer den samlede Plan-oplevelse for traenere og spillere med fire
genbrugelige template-typer:

- Task
- Exercise
- Session
- Week

Plan skal erstatte det gamle separate bibliotek og samle oprettelse, genbrug,
filtrering og senere tildeling i en sammenhaengende oplevelse. Base44 er UI- og
host-lag. Supabase er source of truth for owner accounts, roller, templates,
items, versioner, aktiviteter, tasks og assignments.

Alle nye og beroerte systemtekster i UI skal vaere paa engelsk. Oversaet ikke
brugeroprettede titler, beskrivelser eller kategorinavne automatisk.

## Ikke Til Forhandling

1. Genbrug eksisterende `KlubOpgaver`, `KlubAktiviteter`, `KlubDashboard`,
   `clubAdminApi`, `roleRedirect` og `activityWriteService.jsx`.
2. Tenant scope er altid `owner_account_id`.
3. `owner_type` er `club` eller `private_coach_business`.
4. Samme bruger/mail kan have flere roller paa samme owner account, fx
   `owner`, `admin` og `coach`.
5. Cross-user writes og adminhandlinger maa ikke ske som direkte browser-writes
   til flere tabeller. Brug Edge Function, RPC eller eksisterende server-side
   service.
6. Opret ikke en Base44-only kopi af templates, activities eller assignments.
7. Bevar eksisterende navigation, auth, workspace switcher, player/team
   kontekst og design tokens.
8. Lav ikke en ny landing page. Plan skal aabne direkte i det brugbare
   template-/task-workspace.

## Supabase Endpoints

Base URL:

```text
https://lhpczofddvwcyrgotzha.supabase.co/functions/v1
```

Headers ved direkte HTTP-kald:

```http
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_anon_publishable_key>
Content-Type: application/json
```

Service-role key maa aldrig ligge i browseren eller Base44 client code.

### Training Templates

Endpoint:

```text
manageTrainingTemplates
```

Anbefalet kald:

```ts
const { data, error } = await supabase.functions.invoke(
  'manageTrainingTemplates',
  { body: requestBody }
);
```

Understoettede actions:

```json
{ "action": "context" }
```

```json
{
  "action": "list",
  "ownerAccountId": "<owner_account uuid>"
}
```

```json
{
  "action": "duplicateTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "templateId": "<training_template uuid>"
}
```

```json
{
  "action": "archiveTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "templateId": "<training_template uuid>"
}
```

```json
{
  "action": "restoreTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "templateId": "<training_template uuid>"
}
```

```json
{
  "action": "upsertFolder",
  "ownerAccountId": "<owner_account uuid>",
  "folderId": null,
  "name": "Technical",
  "color": "#4CAF50"
}
```

List-response indeholder:

- `ownerAccount`
- `actor`
- `folders`
- `templates`
- `summary`
- `libraryItems`

Brug response-data direkte og refetch efter writes. Antag ikke at Base44s
lokale state er source of truth.

Relevant response shape:

```ts
type TrainingTemplateType = 'task' | 'exercise' | 'session' | 'week';
type TrainingTemplateStatus = 'active' | 'archived';
type TrainingTemplateItemType =
  | 'task_template'
  | 'exercise'
  | 'session_template'
  | 'note'
  | 'focus'
  | 'feedback_requirement';

type TrainingTemplateItem = {
  id: string;
  templateId: string;
  parentItemId: string | null;
  itemType: TrainingTemplateItemType;
  sourceTaskTemplateId: string | null;
  sourceActivitySeriesId: string | null;
  linkedTemplateId: string | null;
  title: string;
  description: string | null;
  dayOffset: number;
  startTime: string | null;
  durationMinutes: number | null;
  sortOrder: number;
  config: Record<string, unknown>;
};

type TrainingTemplateSummary = {
  id: string;
  ownerAccountId: string;
  templateType: TrainingTemplateType;
  title: string;
  description: string | null;
  status: TrainingTemplateStatus;
  folderId: string | null;
  folderName: string | null;
  focusAreas: string[];
  durationMinutes: number | null;
  defaultActivityCategoryId: string | null;
  defaultActivityCategoryName: string | null;
  sourceTaskTemplateId: string | null;
  metadata: Record<string, unknown>;
  itemCount: number;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  items: TrainingTemplateItem[];
};
```

Tilladte item-kombinationer:

- Task template: ingen items, task config ligger i `metadata.task`.
- Exercise template: ingen items, task config ligger i `metadata.task`, timer i
  `metadata.timer`.
- Session template: `task_template`, `exercise`, `note`, `focus` og
  `feedback_requirement`.
- Week template: kun `session_template` med `linkedTemplateId`.

## Template Payloads

### Task

```json
{
  "action": "upsertTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "id": null,
  "templateType": "task",
  "title": "First-touch review",
  "description": "Review three clips and note the next action.",
  "folderId": null,
  "focusAreas": ["First touch", "Decision making"],
  "status": "active",
  "taskConfig": {
    "title": "First-touch review",
    "description": "Review three clips and note the next action.",
    "categoryIds": ["<activity_category uuid>"],
    "videoUrls": ["https://example.com/clip.mp4"],
    "mediaNames": ["Match clip"],
    "reminderMinutes": 10,
    "afterTrainingEnabled": true,
    "afterTrainingDelayMinutes": 0,
    "afterTrainingFeedbackEnableScore": true,
    "afterTrainingFeedbackScoreExplanation": "Rate the decision",
    "afterTrainingFeedbackEnableIntensity": true,
    "afterTrainingFeedbackEnableNote": true,
    "autoAddToActivities": true
  },
  "exerciseTimer": null,
  "items": []
}
```

### Exercise

Exercise har praecis de samme task-felter og features som Task. Den eneste
funktionelle forskel er intervaltimeren.

```json
{
  "action": "upsertTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "id": null,
  "templateType": "exercise",
  "title": "Sprint intervals",
  "description": "High-quality accelerations with full control.",
  "focusAreas": ["Speed"],
  "status": "active",
  "taskConfig": {
    "title": "Sprint intervals",
    "description": "High-quality accelerations with full control.",
    "categoryIds": ["<activity_category uuid>"],
    "videoUrls": ["https://example.com/sprint.mp4"],
    "mediaNames": ["Sprint demo"],
    "reminderMinutes": 10,
    "afterTrainingEnabled": true,
    "afterTrainingDelayMinutes": 0,
    "afterTrainingFeedbackEnableScore": true,
    "afterTrainingFeedbackScoreExplanation": "Rate sprint quality",
    "afterTrainingFeedbackEnableIntensity": true,
    "afterTrainingFeedbackEnableNote": true,
    "autoAddToActivities": true
  },
  "exerciseTimer": {
    "activeSeconds": 45,
    "restSeconds": 15,
    "rounds": 4
  },
  "items": []
}
```

Timer-editoren skal forklare enheden og betydningen af hvert felt:

- `Active work`: seconds of active work per round
- `Rest`: seconds between rounds
- `Rounds`: number of work rounds

### Session

En Session er en genbrugelig blueprint for en konkret aktivitet samme dag. Den
er ikke en ekstra konkurrerende aktivitetstype i kalenderen, foer den bliver
tildelt og materialiseret.

```json
{
  "action": "upsertTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "id": null,
  "templateType": "session",
  "title": "Finishing session",
  "description": "Build-up, finishing and reflection.",
  "folderId": null,
  "focusAreas": ["Finishing"],
  "defaultActivityCategoryName": "Training",
  "status": "active",
  "sessionStartTime": null,
  "durationMinutes": null,
  "items": [
    {
      "itemType": "task_template",
      "title": "Review finishing clips",
      "description": "Choose the best option in each clip.",
      "dayOffset": 0,
      "startTime": null,
      "durationMinutes": null,
      "sortOrder": 0,
      "config": {
        "task": {
          "title": "Review finishing clips",
          "description": "Choose the best option in each clip.",
          "categoryIds": [],
          "videoUrls": [],
          "mediaNames": [],
          "reminderMinutes": null,
          "afterTrainingEnabled": true,
          "autoAddToActivities": false
        }
      }
    },
    {
      "itemType": "exercise",
      "title": "Four finishing rounds",
      "description": "Alternate first-time and controlled finishes.",
      "dayOffset": 0,
      "startTime": null,
      "durationMinutes": null,
      "sortOrder": 1,
      "config": {
        "task": {
          "title": "Four finishing rounds",
          "description": "Alternate first-time and controlled finishes.",
          "categoryIds": [],
          "videoUrls": [],
          "mediaNames": [],
          "reminderMinutes": null,
          "afterTrainingEnabled": true,
          "autoAddToActivities": false
        },
        "timer": {
          "activeSeconds": 45,
          "restSeconds": 15,
          "rounds": 4
        }
      }
    }
  ]
}
```

Session-regler:

- Session kan indeholde `task_template` og `exercise` items.
- Session kan desuden indeholde `note`, `focus` og `feedback_requirement`, men
  disse er ikke selvstaendige Task/Exercise templates.
- Session maa ikke vise en Day-vaelger. Alle items ligger paa sessionens dag.
- Session kan have en foreslaaet aktivitetskategori.
- Dato, starttid og konkret varighed vaelges foerst ved assignment.
- Gem ikke kalenderdato eller starttid paa session-template.
- Session-kortet skal vise navnene paa alle indeholdte tasks og exercises i en
  rolig `Included`-liste. Vis ikke kun et item count. Note/focus/feedback
  requirements skal ikke blandes ind i denne opgaveliste.
- Vis et task-ikon ved task-items og timer-ikon ved exercise-items.
- Lange item-navne maa bruge to linjer. Skjul ikke resten af listen.

### Week

Week er en blueprint, der kun bestaar af gemte Session templates.

```json
{
  "action": "upsertTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "id": null,
  "templateType": "week",
  "title": "Match preparation week",
  "description": "Three sessions leading into match day.",
  "focusAreas": ["Match preparation"],
  "status": "active",
  "durationMinutes": null,
  "items": [
    {
      "itemType": "session_template",
      "linkedTemplateId": "<saved_session_template uuid>",
      "title": "Technical session",
      "dayOffset": 1,
      "startTime": null,
      "durationMinutes": null,
      "sortOrder": 0,
      "config": {
        "source": {
          "kind": "saved_template",
          "templateId": "<saved_session_template uuid>"
        }
      }
    }
  ]
}
```

Week-regler:

- Week maa kun indeholde `session_template` items.
- Sessionen skal vaelges fra `Saved`.
- Vis Day/dayOffset for hver session i week-builderen.
- Day er et forslag, ikke en laast dato.
- Ved assignment skal coachen kunne override dag, dato og starttid pr. session
  og pr. spiller/hold.
- Vis ikke Task, Exercise, Library, Note eller Focus som direkte item-valg i
  Week-builderen.
- Gem ikke konkret startuge eller kalenderdato paa Week-template.

## Reuse, Saved Og Library

I Session-builderen skal coachen kunne tilfoeje Task og Exercise paa tre
maader:

- `New`: udfyld alle felter direkte i sessionen.
- `Saved`: vaelg en eksisterende Task- eller Exercise-template.
- `Library`: vaelg et element fra `libraryItems`/`exercise_library`.

Saved og Library skal aabne i modal, popup eller bottom sheet med de samme
moderne kort som resten af Plan. Vis ikke lange inline-lister i formularen.

Picker-kort skal vise:

- title
- source/type
- description
- media preview eller diskret media counter
- categories og focus tags
- interval timer for Exercise

Naar en ny inline Task/Exercise eller et Library-item gemmes i en Session, skal
backendens genbrugslogik ogsaa oprette/genbruge en selvstaendig Task- eller
Exercise-template. Base44 maa ikke lave dobbelte templates med egne browser
loops.

## Plan Information Architecture

### Plan Erstatter Library

- Fjern den separate Library-side for coach og player.
- Plan er det nye bibliotek for Tasks, Exercises, Sessions og Weeks.
- Playerens gamle `Tasks`-side skal hedde `Plan`.
- Coach har `Assignments`; player har ikke `Assignments`.
- Coach kan tildele til spillere/hold. Player kan kun arbejde med eget indhold.

### Plan Landing

Plan skal aabne direkte i `Tasks`, ikke i et marketing- eller summary-dashboard.

Toppen skal have:

1. En tydelig `Create`-handling.
2. En samlet View-dropdown.
3. Soegning og relevante filtre.
4. Den valgte listes kort.

Create aabner en popup med fire valg og et info-ikon ved hvert valg:

- Task: one reusable task with media, categories, reminder and feedback.
- Exercise: a task with an interval timer, active work, rest and rounds.
- Session: one same-day activity blueprint built from tasks and exercises.
- Week: a weekly blueprint built from saved sessions.

View-dropdown:

- Tasks
- Exercises
- Sessions
- Weeks
- Assignments, coach only

Brug samme sideopsætning og listeadfaerd i alle views. Opret ikke separate gamle
subpages med forskellig navigation.

### Filters

Vis kun filtre, der har direkte relation til listen:

- search
- source
- focus tags, multi-select
- category, hvor relevant
- Active/Archived for Task og Exercise

Source skal kunne skelne mellem:

- My
- Coach
- Workspace
- Library

Session og Week skal ikke have Active/Archived-toggle. De er blueprints og
bliver ikke auto-added som Task/Exercise.

Undgaa dobbelte filterknapper, summary cards, en ekstra `Templates`-knap eller
en stor introsektion over listen.

## Card Design Contract

Task, Exercise, Session og Week skal bruge samme moderne kortsprog. Bevar alle
relevante informationer, men goer kortet roligt og let at scanne.

### Card Header

- Subtle border, soft shadow, approximately 18px radius.
- Type icon, title and compact action row.
- Source er et ikon, ikke en stor `Source`-faktaboks:
  - own template: green person icon
  - coach template: blue coach/group icon
  - workspace template: building icon
  - library template: book icon
- Source-ikonet skal stadig have tooltip/accessibility label med den praecise
  source.
- Copy, edit og archive er neutrale graa ikoner.
- Delete maa vaere roed.
- Assign er den eneste store primaere groenne handling.

### Description Og Media

- Description staar direkte under title uden en stor `Description` label.
- Media vises direkte paa kortet i en swipe/carousel.
- Vis kun et media ad gangen.
- Billeder vises direkte.
- Video afspilles inline fra kort/listen.
- Vis en diskret counter som `1/2`.
- Vis ikke de synlige tekster `Media`, `2 files`, `Swipe for next file` eller en
  lang liste af media under hinanden.
- Bevar filantal som accessibility metadata.
- Session kan aggregere media fra indeholdte Task/Exercise items.
- Week kan aggregere media fra loaded linked sessions, men maa ikke lave N+1
  browser queries kun for previews.

### Detail Rows Og Tags

Efter media bruges en diskret separator og en fast label/value-grid:

- labelkolonne og value/badge-kolonne skal flugte lodret
- ens afstand mellem alle rækker
- `Feedback` viser et lille `On` eller `Off` badge
- `Auto-add` viser et lille `On` eller `Off` badge
- Feedback- og Auto-add-badges starter paa samme x-position som category- og
  focus-tags
- reminder vises kun, naar den er sat
- legacy task duration kan vises read-only, hvis den findes i returned legacy
  task data, men maa ikke genindfoeres som session item scheduling
- Exercise timer vises med rounds, work seconds og rest seconds
- Categories vises som bløde farvede tags
- Focus vises som bløde tags
- undgaa kraftige outlines og mange konkurrerende farver

Session-kort viser desuden `Included` med navnet paa alle tasks/exercises.

Primary Assign button ligger nederst og skal have samme placering paa alle kort,
hvor actor maa tildele.

## Task Og Exercise Features

Task og Exercise skal begge understoette:

- title
- description
- image/video/PDF upload og links
- multiple media files med swipe
- media names
- categories
- custom focus tags
- existing focus tag selection
- reminder
- post-training feedback
- score explanation
- intensity feedback
- note feedback
- auto-add to matching activities
- duplicate/edit/archive/restore
- Assign CTA

Exercise har derudover intervaltimeren. Exercise maa ikke vaere en reduceret
library exercise uden task-felterne.

Subtasks skal ikke vises eller kunne oprettes. Sessionens Tasks/Exercises er den
naturlige item-struktur.

Dato og starttid hoerer til Session/Week assignment, ikke til Task/Exercise.

## Activity Integration

Eksisterende activity flow skal kunne tilfoeje baade Task og Exercise direkte
fra templates.

I `KlubAktiviteter`/activity editor:

- `Add item` eller tilsvarende skal kunne vaelge `Tasks` og `Exercises`.
- Exercise-listen kommer fra ownerens aktive `training_templates` med
  `template_type = 'exercise'`.
- Ved valg kopieres task fields, media, feedback config, categories og timer til
  activity item-instansen.
- Gem relationen til `training_template_id` og
  `training_template_type = 'exercise'`.
- Gem timer config i `exercise_timer`.
- Undgaa samme template flere gange paa samme activity via den deployede unique
  constraint og tydelig UI feedback.
- Understoet baade normale activities og external event activity tasks via de
  eksisterende write services.
- Base44 maa ikke omgaa RLS med direkte cross-user inserts.

## Assignment

Alle template-kort for coach/admin skal have en synlig `Assign` CTA. Player maa
ikke se coach assignment controls.

Den endelige generic template assignment/materialization backend er endnu ikke
implementeret i `manageTrainingTemplates`. Base44 maa derfor ikke simulere en
successful assignment med lokale state updates eller direkte writes til flere
tabeller.

Indtil backend er klar skal `Assign` enten:

- aabne et eksisterende, reelt server-side assignment flow, hvis den valgte
  type allerede er understoettet, eller
- vaere disabled/placeholder med en tydelig forklaring.

Det fremtidige flow skal materialisere:

- Task/Exercise til valgt activity/date med alle task fields bevaret.
- Session til en konkret activity med de indeholdte task/exercise instances.
- Week til flere concrete Session activities.

Ved Session assignment vaelges dato, starttid og eventuel varighed.

Ved Week assignment vaelges startuge, og coachen kan override day/date/time for
hver session og for hver recipient uden at aendre den gemte Week-template.

## Responsive Navigation Parity

Paa responsive coach views:

- coach lander paa `Overview`, ikke en skjult `Home` uden navigation entry
- primaer navigation er reduceret og rolig, fx Overview, Players og Plan
- sider, der er samlet under et hovedomraade, tilgaas via dropdowns eller lokale
  section actions i stedet for flere bundmenuikoner
- Overview viser kun relevante section choices som Activities og Progress
- fjern ekstra Profile shortcut i indholdet, naar profile allerede findes i
  top-right
- player tags/alerts/saved/active filters ligger direkte over player-listen,
  ikke oppe ved sidens globale navigation
- Plan indeholder Tasks, Exercises, Sessions, Weeks og Assignments i samme
  workspace

Hvis Base44 desktop-navigationen ikke bruger bottom tabs, skal den eksisterende
desktop shell bevares. Implementer informationsarkitekturen, ikke en kunstig
mobil-tabbar paa desktop.

## Player Plan

Playerens Plan skal:

- vise playerens egne templates
- vise templates delt/oprettet af coach
- have source filter for `My` og `Coach`
- bruge samme kortdesign og media playback som coach
- ikke vise Assignments view
- ikke vise admin actions, som player ikke har permission til
- beholde mulighed for egne task actions, hvor backend tillader det

## English Copy And Legacy Tags

Alle faste labels og systembeskeder skal vaere paa engelsk. Det gaelder ogsaa
modals, errors, empty states, filters, card labels og timer explanations.

Normaliser kendte legacy focus tags ved visning og redigering:

- `Midtbane` -> `Midfielder`
- `Teknik` -> `Technique`
- `Afslutning`/`Afslutninger` -> `Finishing`
- `Boldkontrol` -> `Ball control`
- `Pasning`/`Pasninger` -> `Passing`
- `Forsvar`/`Forsvarsspil` -> `Defense`
- `Fysisk`/`Fysik` -> `Physical`
- `Hurtighed` -> `Speed`
- `Modtagelser` -> `First touch`
- `Analyse` -> `Analysis`
- `Skudtraening` -> `Shooting`

Oversaet ikke arbitrary user-created content ud over den kendte legacy mapping.

## Owner Account Safeguards Fra Samme Arbejde

### Ingen Automatisk Coach/Owner Provisioning

Base44 maa ikke automatisk oprette owner account eller coach account ved
almindelig login, profile load, manglende workspace eller navigation til Plan.

Nye owner accounts maa kun oprettes via:

1. Aktiv Apple trainer subscription sync, som provisionerer en
   `private_coach_business` owner account og giver brugeren `owner + admin +
   coach`.
2. Platform/super admin creation gennem det eksisterende club/owner module.

Hvis en bruger ikke har owner workspace, vis en relevant empty/access state.
Kald ikke `createOwnerAccount` som fallback.

### Delete Owner Account

Endpoint:

```text
deleteOwnerAccount
```

Request:

```json
{
  "ownerAccountId": "<owner_accounts.id from the selected list row>"
}
```

Kald:

```ts
await supabase.functions.invoke('deleteOwnerAccount', {
  body: { ownerAccountId: selectedRow.ownerAccountId }
});
```

Delete flow skal:

1. Bruge den aktuelle rows `ownerAccountId`, ikke coach account id, user id,
   cached id eller hardcoded id.
2. Vente paa success response.
3. Kontrollere returned `deletedOwnerAccountId`/success contract.
4. Refetch listen fra `listPlatformAdminOwnerAccounts`.
5. Fjerne row fra UI efter success og refetch.
6. Vise fejl og beholde row ved failed delete.
7. Ikke auto-provisionere owneren igen efter delete.

Genbrug den komplette delete-kontrakt i:

```text
docs/base44-delete-owner-account-fix-prompt.md
```

## Permissions

- Owner/Admin: manage owner templates og owner settings.
- Coach: create/edit/use templates inden for eksisterende owner permission.
- Player: read egne og delte templates og manage egne data efter eksisterende
  policy.
- Platform admin: owner account administration gennem server-side endpoints.
- Admin uden owner-role maa ikke lukke/slette owner account.
- UI maa ikke vaere den eneste permission-kontrol.

## Loading, Empty And Error States

Implementer:

- initial loading skeleton
- refresh state
- empty state per selected view
- no-results state for filters/search
- disabled busy actions under writes
- stable error banner/toast
- retry/refetch

HTTP/error handling:

- `401`: session expired, request login/refresh auth
- `403`: actor lacks owner permission
- `404`: refetch selected resource/list
- `400`: show validation message at field or modal
- `409`: show duplicate/conflict message and refetch
- `500`: generic error, no automatic retry loop

## Acceptance Checklist

Implementeringen er ikke faerdig, foer alle punkter er testet:

- [ ] Eksisterende Base44/KlubAdmin shell er genbrugt.
- [ ] Supabase er eneste source of truth.
- [ ] Plan aabner direkte i Tasks.
- [ ] Create popup viser Task, Exercise, Session og Week med forklaringer.
- [ ] View-dropdown viser de korrekte views.
- [ ] Player ser ikke Assignments.
- [ ] Separate gamle Library/Template entry points er fjernet eller redirected.
- [ ] Search, source og multi-select focus filters virker paa den viste liste.
- [ ] Active/Archived vises kun for Task/Exercise.
- [ ] Task og Exercise har samme felter; Exercise har desuden timer.
- [ ] Timerfelter forklarer seconds og rounds.
- [ ] Session har ingen Day-vaelger.
- [ ] Session kan bruge New, Saved og Library Tasks/Exercises.
- [ ] Session-kort viser navnene paa alle included Tasks/Exercises.
- [ ] Week kan kun bruge Saved Sessions.
- [ ] Week har dayOffset-forslag, som senere kan overrides ved assignment.
- [ ] Subtasks findes ikke i Task/Exercise builders.
- [ ] Media er swipe-baseret og video kan afspilles inline.
- [ ] Kort viser ikke `Media` eller `2 files` som synlig header.
- [ ] Source vises med korrekt own/coach/workspace/library icon.
- [ ] Feedback viser On/Off badge.
- [ ] Auto-add viser On/Off badge.
- [ ] Statusbadges, categories og focus flugter i samme value-kolonne.
- [ ] Categories og Focus bruger rolige soft-filled tags.
- [ ] Assign er den eneste store primaere handling paa kortet.
- [ ] Activity editor kan tilfoeje Exercise fra templates.
- [ ] UI viser ikke falsk assignment success uden backend-materialisering.
- [ ] Alle nye/touched systemtekster er paa engelsk.
- [ ] Owner workspace oprettes ikke automatisk ved login eller missing context.
- [ ] Owner creation sker kun via Apple trainer sync eller platform admin.
- [ ] deleteOwnerAccount bruger selected rows rigtige ownerAccountId og refetcher.
- [ ] Responsive mobile og desktop layouts er uden overlap og afskaaret tekst.
- [ ] Loading, empty, error og permission states er testet.

## Remote Backend Status Verificeret 2026-07-11

Project:

```text
lhpczofddvwcyrgotzha
```

Verificeret remote:

- `manageTrainingTemplates`: ACTIVE version 6, updated 2026-07-09 19:47:49 UTC.
- `deleteOwnerAccount`: ACTIVE version 3, updated 2026-07-08 16:48:37 UTC.
- Begge protected endpoints returnerer `401 UNAUTHORIZED_NO_AUTH_HEADER` uden
  auth, ikke `404`.
- Training template migrations er remote-applied:
  - `20260709150000`
  - `20260709162000`
  - `20260709173000`
  - `20260709174500`
- Owner delete/provision safeguards er remote-applied:
  - `20260711110000`
  - `20260711113000`
  - `20260711120500`
- Focus-tag support er remote-applied:
  - `20260711133000`
- Activity Exercise template instances er remote-applied:
  - `20260711154500`

`manageTrainingTemplates` understoetter template CRUD/reuse, men den generiske
assignment/materialization action er ikke deployet. Marked assignment maa ikke
implementeres som en Base44-only workaround.

## Delivery Fra Base44

Returner efter implementering:

1. Liste over beroerte pages/components/services.
2. Kort beskrivelse af genbrugte eksisterende flows.
3. Screenshots for desktop og mobile widths af alle fem Plan views.
4. Testbevis for Task, Exercise, Session og Week create/edit flows.
5. Testbevis for source/focus/category filters.
6. Testbevis for Session Included items og card media carousel.
7. Testbevis for player permissions og manglende Assignments.
8. Testbevis for deleteOwnerAccount med korrekt ownerAccountId og refetch.
9. Bekraeftelse paa at ingen browser-side service-role key eller parallel
   Base44 business entity er oprettet.
10. En liste over eventuelle reelle backend-blockers. Marker ikke placeholder
    assignment som faerdig assignment.
