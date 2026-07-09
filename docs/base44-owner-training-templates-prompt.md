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
Plan > Skabeloner
```

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
  "sessionStartTime": "17:30",
  "durationMinutes": 75,
  "metadata": {
    "session": {
      "startTime": "17:30"
    }
  },
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

- `task_template`: i session og week templates
- `exercise`: i session og week templates, med `config.task` og `config.timer`
- `feedback_requirement`: kun i session templates
- `session_template`: kun i week templates
- `focus`: session og week templates
- `note`: session og week templates

Task og exercise templates har ikke item-liste. De gemmer opgavefelterne direkte
i `metadata.task` via `taskConfig`. Exercise templates gemmer desuden timer i
`metadata.timer` via `exerciseTimer`.

Session templates gemmer starttid paa selve sessionen via `sessionStartTime`
eller `metadata.session.startTime`. Varighed gemmes paa `durationMinutes`.
Starttid og varighed maa ikke gemmes paa task/exercise items i en session.

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
    "videoUrls": ["https://example.com/sprint.mp4"]
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

Exercise er en opgave med samme opgavefelter som normale tasks plus
intervaltimer:

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

Naar Base44 opretter eller redigerer en `session` eller `week`, skal `Task` og
`Exercise` items kunne komme fra tre kilder:

- `New`: coach udfylder felterne direkte i session/week builderen.
- `Saved`: coach vaelger en eksisterende `training_templates` row med
  `templateType: 'task'` eller `templateType: 'exercise'`.
- `Library`: coach vaelger en row fra responsefeltet `libraryItems`, som kommer
  fra `exercise_library`.

For `Saved` skal itemet sende `linkedTemplateId` til den valgte template.

For `New` og `Library` maa `linkedTemplateId` vaere `null`. Edge Function
opretter da automatisk en selvstaendig `task` eller `exercise` template og
gemmer den nye template-id tilbage paa itemets `linkedTemplateId` samt
`config.reusableTemplateId`.

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
- status filter: active, archived
- folder/kategori filter
- liste med titel, type, session-starttid/varighed, fokusomraader, item count og
  version
- handlinger: opret, rediger, dupliker, arkiver, gendan
- builder med ordered items, drag/reorder og preview
- paa mobil skal valg af `Saved` eller `Library` aabne en popup/bottom sheet med
  de samme kort-typer som resten af template/library UI'et; vis ikke saved eller
  library listen som smaa inline chips i formularen

Session-template:

- er selve sessionen/aktiviteten og kan have default aktivitetskategori
- har starttidspunkt paa `sessionStartTime`/`metadata.session.startTime` og
  varighed paa `durationMinutes`
- session items ligger per default paa samme dag som sessionen; vis ikke
  `dayOffset`/Day-vaelger i session builderen
- starttid og varighed hoerer til sessionen, ikke til task/exercise items
- kan indeholde task-template items, exercise items, feedback requirements,
  notes og focus items
- task og exercise items kan oprettes som nye inline items, vaelges fra gemte
  task/exercise templates eller vaelges fra `libraryItems`
- task og exercise items skal have samme opgavefelter som normale task
  templates: medier, reminder og feedback
- exercise items skal ogsaa have intervaltimer med aktiv tid, pause og runder

Week-template:

- kan indeholde task-template items, exercise items, session templates eller
  focus/note items med `dayOffset`
- vis Day-vaelgeren i week builderen, da week items fordeles paa dag 1, dag 2
  osv.
- vis kun starttid og varighed paa `session_template` items i week builderen
- task og exercise items bruger samme `New`/`Saved`/`Library` flow som session
  templates
- preview skal vise dag 1, dag 2 osv.

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
  templates og task/exercise reuse i session/week templates.
- Edge Function `manageTrainingTemplates` er deployet og `ACTIVE` version 5,
  opdateret `2026-07-09 16:21:53 UTC`.
- No-auth smoke test returnerer `401` med `UNAUTHORIZED_NO_AUTH_HEADER`, ikke
  `404`.
- `supabase migration list --linked` viser baade `20260709150000` og
  `20260709162000` og `20260709173000` som remote-applied.
- Efter push fejlede et ekstra `supabase db push --dry-run` paa Supabase CLI
  temp-role auth/circuit-breaker. Remote status er derfor verificeret med
  `functions list`, no-auth smoke-test og `migration list --linked`.

Verificeringskommandoer:

```bash
supabase functions list --project-ref lhpczofddvwcyrgotzha
supabase db push --dry-run
curl -i -X POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingTemplates \
  -H 'Content-Type: application/json' \
  --data '{"action":"context"}'
```
