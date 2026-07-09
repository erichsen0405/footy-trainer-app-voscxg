# Base44 Prompt: Owner Training Templates

Brug denne prompt i den eksisterende login-beskyttede Base44/KlubAdmin webapp.
Byg ikke en ny portal, og opret ikke Base44-interne business entities til
training-template data.

## Formaal

Tilpas eksisterende `KlubOpgaver`/task-template flow til `OwnerAccount`, saa
baade klubber og private coach businesses kan oprette, redigere, duplikere,
arkivere og genbruge:

- task-skabeloner
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
  "durationMinutes": 75,
  "defaultActivityCategoryName": "Training",
  "status": "active",
  "sourceTaskTemplateId": null,
  "items": [
    {
      "itemType": "exercise",
      "title": "Interval finishing",
      "description": "Two-touch pattern before finishing.",
      "dayOffset": 0,
      "startTime": "10:15",
      "durationMinutes": 18,
      "sortOrder": 0,
      "config": {
        "task": {
          "title": "Interval finishing",
          "description": "Two-touch pattern before finishing.",
          "categoryIds": [],
          "subtasks": [
            { "title": "Right foot" },
            { "title": "Left foot" }
          ],
          "videoUrls": ["https://example.com/drill.mp4"],
          "mediaNames": ["Drill video"],
          "reminderMinutes": 10,
          "afterTrainingEnabled": true,
          "afterTrainingDelayMinutes": 15,
          "afterTrainingFeedbackEnableScore": true,
          "afterTrainingFeedbackScoreExplanation": "Rate technique",
          "afterTrainingFeedbackEnableNote": true,
          "taskDurationEnabled": true,
          "taskDurationMinutes": 18,
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
- `session`
- `week`

`itemType` kan vaere:

- `task_template`: kun i session templates
- `exercise`: kun i session templates, med `config.task` og `config.timer`
- `feedback_requirement`: kun i session templates
- `session_template`: kun i week templates
- `focus`: session og week templates
- `note`: session og week templates

Task templates har ikke item-liste. De gemmer opgavefelterne direkte i
`metadata.task` via `taskConfig`:

```json
{
  "action": "upsertTemplate",
  "ownerAccountId": "<owner_account uuid>",
  "templateType": "task",
  "title": "Solo touch work",
  "taskConfig": {
    "subtasks": [{ "title": "Wall passes" }],
    "videoUrls": ["https://example.com/touch.png"],
    "mediaNames": ["Technique image"],
    "reminderMinutes": 0,
    "afterTrainingEnabled": false,
    "taskDurationEnabled": true,
    "taskDurationMinutes": 12
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
      "subtasks": [{ "title": "Plank" }],
      "videoUrls": [],
      "mediaNames": [],
      "afterTrainingEnabled": true,
      "afterTrainingDelayMinutes": 0,
      "taskDurationEnabled": true,
      "taskDurationMinutes": 8
    },
    "timer": {
      "activeSeconds": 40,
      "restSeconds": 20,
      "rounds": 5
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
    templateType: 'task' | 'session' | 'week';
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
  summary: {
    total: number;
    active: number;
    archived: number;
    task: number;
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
- type filter: task, session, week
- status filter: active, archived
- folder/kategori filter
- liste med titel, type, varighed, fokusomraader, item count og version
- handlinger: opret, rediger, dupliker, arkiver, gendan
- builder med ordered items, drag/reorder, day offset, duration og preview

Session-template:

- er selve sessionen/aktiviteten og kan have default aktivitetskategori
- kan indeholde task-template items, exercise items, feedback requirements,
  notes og focus items
- task og exercise items skal have samme opgavefelter som normale task
  templates: medier, subtasks, reminder, feedback og task time
- exercise items skal ogsaa have intervaltimer med aktiv tid, pause og runder

Week-template:

- kan indeholde flere session templates eller focus/note items med `dayOffset`
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
- Efter deployment returnerer `supabase db push --dry-run`: remote database is
  up to date.
- Edge Function `manageTrainingTemplates` er deployet og `ACTIVE` version 2,
  opdateret `2026-07-09 15:07:26 UTC`.
- No-auth smoke test returnerer `401` med `UNAUTHORIZED_NO_AUTH_HEADER`, ikke
  `404`.
- `supabase migration list --linked` viser baade `20260709150000` og
  `20260709162000` som remote-applied.

Verificeringskommandoer:

```bash
supabase functions list --project-ref lhpczofddvwcyrgotzha
supabase db push --dry-run
curl -i -X POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingTemplates \
  -H 'Content-Type: application/json' \
  --data '{"action":"context"}'
```
