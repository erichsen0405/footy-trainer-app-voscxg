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
  "status": "active",
  "sourceTaskTemplateId": null,
  "items": [
    {
      "itemType": "task_template",
      "title": "First touch warm-up",
      "description": "Two-touch pattern before finishing.",
      "dayOffset": 0,
      "startTime": null,
      "durationMinutes": 15,
      "sortOrder": 0,
      "config": {}
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

- `task_template`
- `activity`
- `session_template`
- `focus`
- `note`

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
    sourceTaskTemplateId: string | null;
    activeVersionId: string | null;
    versionNumber: number;
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
- `activity_series`
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

- kan indeholde task-template items, activity items, notes og focus items
- viser samlet varighed og fokusomraader

Week-template:

- kan indeholde flere sessioner eller items med `dayOffset`
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
- Efter deployment returnerer `supabase db push --dry-run`: remote database is
  up to date.
- Edge Function `manageTrainingTemplates` er deployet og `ACTIVE`.
- No-auth smoke test returnerer `401` med `UNAUTHORIZED_NO_AUTH_HEADER`, ikke
  `404`.
- `supabase migration list --linked` blev forsøgt, men Supabase pooler-auth
  fejlede efter retries og bad om `SUPABASE_DB_PASSWORD`. Brug `db push
  --dry-run` status ovenfor som remote migration-verifikation for denne branch.

Verificeringskommandoer:

```bash
supabase functions list --project-ref lhpczofddvwcyrgotzha
supabase db push --dry-run
curl -i -X POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingTemplates \
  -H 'Content-Type: application/json' \
  --data '{"action":"context"}'
```
