# Base44 Replacement Prompt: Program Builder State v4 (#285)

Replace the state hydration, phase/item relationship and save round-trip in the
existing authenticated Base44/KlubAdmin Training Program builder. Keep the
existing portal shell, program list, four builder steps and visual style. Do
not create a parallel portal or Base44 business-data entities. Supabase remains
the source of truth.

This prompt supersedes the builder-state and draft-loading instructions in all
earlier #285 prompts. Keep the server-composed EnrollmentModal v2 flow from
`base44-owner-training-program-enrollment-preview-v2-prompt.md`.

After applying this state contract, apply the focused display corrections in
`base44-owner-training-program-display-ux-v5-prompt.md` for unambiguous phase
week labels and correct program-card duration.

## Bug being fixed

The Content step can show valid sessions under the current phases while a red
banner says that another item references a phase that no longer exists. In the
reported case the visible items are named `Test Session`, while the error names
the hidden item `Etter`.

This proves that `draft.items` contains an orphan left by a previous builder
open, a deleted/regenerated phase or legacy persisted data. The current UI
groups items by valid phases, so the orphan is invisible, but validation still
blocks Next. Do not weaken that validation and do not silently discard the
item. Fix the state lifecycle and make every orphan actionable.

## Verified API

```http
POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingPrograms
Authorization: Bearer <signed-in Supabase user access token>
apikey: <Supabase anon publishable key>
Content-Type: application/json
```

Never expose a service-role key. Successful responses use
`{ "success": true, "data": ... }`; the existing Base44 adapter must unwrap
`data`. Render server error messages and handle `400`, `401`, `403`, `404`,
`409` and `500`. Do not write program tables directly from Base44.

The deployed endpoint supports `list`, `upsert`, `enrollmentPreview`,
`programEnrollments`, `publish`, `enroll`, `setEnrollmentStatus`, `archive`
and `delete`. `upsert` also returns these
backward-compatible fields alongside the normal owner payload:

```ts
{
  savedProgramId: string;
  savedProgram: RawPersistedProgram;
  phaseIdMap: Record<string, string>; // submitted phase ID -> persisted UUID
  owner: unknown;
  programs: RawPersistedProgram[];
  enrollments: unknown[];
  players: unknown[];
  teams: unknown[];
}
```

## One canonical builder state

Use one reducer/state object and no parallel phase/item caches:

```ts
type BuilderPhase = {
  id: string;
  title: string;
  description: string;
  startsInWeek: number; // one-based
  durationWeeks: number;
};

type BuilderItem = {
  id: string; // UI key
  phaseId: string;
  itemType: 'task_template' | 'exercise_template' | 'session_template' | 'focus';
  trainingTemplateId?: string;
  title: string;
  description: string;
  weekInPhase: number; // one-based within the phase
  weekday: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
};

type ProgramBuilderDraft = {
  programId: string | null;
  title: string;
  description: string;
  audience: string;
  level: 'all' | 'beginner' | 'intermediate' | 'advanced' | 'elite';
  durationWeeks: number;
  phases: BuilderPhase[];
  items: BuilderItem[];
};
```

Derive orphan items from this one array; do not keep a second orphan state that
can drift:

```ts
const phaseIds = new Set(draft.phases.map((phase) => phase.id));
const attachedItems = draft.items.filter((item) => phaseIds.has(item.phaseId));
const orphanItems = draft.items.filter((item) => !phaseIds.has(item.phaseId));
```

Phase IDs must be unique and non-empty. Generate an ID exactly once when Add
phase is pressed. Changing a phase title, week, duration or order must preserve
that ID. Never generate IDs during render, normalization, step changes or
validation, and never use title or array index as the relationship.

## Atomic hydration when opening a builder

The wizard must start a fresh edit session for every New/Edit/Duplicate open.
On close, owner change or program change, invalidate any pending load and reset
the entire draft. Never merge or append incoming phases/items into previous
local state.

Use a request sequence or `AbortController` so a late response for Program A
cannot hydrate Program B. The currently active `{ownerAccountId, programId,
openCycle}` must still match before applying a response.

For New program, atomically install a clean default draft with empty
`phases` and `items`.

For Edit program, use `enrollmentPreview` as the single normalized hydration
source:

```json
{
  "action": "enrollmentPreview",
  "ownerAccountId": "<selected owner UUID>",
  "programId": "<persisted program UUID>",
  "startDate": "2026-07-12"
}
```

The chosen ISO date is only needed by the preview endpoint. Do not store its
calculated dates in builder scheduling state. Require `apiVersion === 2` and a
matching `ownerAccountId`, then build one complete next draft before one state
replacement:

```ts
const nextPhases = preview.program.phases.map((phase) => ({
  id: String(phase.id),
  title: phase.title ?? '',
  description: phase.description ?? '',
  startsInWeek: Number(phase.startWeek),
  durationWeeks: Number(phase.durationWeeks),
}));

const nextAttachedItems = preview.program.phases.flatMap((phase) =>
  phase.items.map((item) => ({
    id: String(item.id),
    phaseId: String(phase.id),
    itemType: item.itemType,
    trainingTemplateId: item.trainingTemplateId ?? undefined,
    title: item.title ?? '',
    description: item.description ?? '',
    weekInPhase: Number(item.weekInPhase),
    weekday: item.weekday,
  })),
);

const nextLegacyOrphans = (preview.program.unassignedItems ?? []).map((item) => ({
  id: String(item.id),
  phaseId: item.phaseId ? String(item.phaseId) : '',
  itemType: item.itemType,
  trainingTemplateId: item.trainingTemplateId ?? undefined,
  title: item.title ?? '',
  description: item.description ?? '',
  weekInPhase: Math.max(1, Number(item.weekInPhase) || 1),
  weekday: item.weekday || 'monday',
}));

setDraft({
  programId: preview.program.id,
  title: preview.program.title ?? '',
  description: preview.program.description ?? '',
  audience: preview.program.audience ?? '',
  level: preview.program.level ?? 'all',
  durationWeeks: Number(preview.program.durationWeeks),
  phases: nextPhases,
  items: [...nextAttachedItems, ...nextLegacyOrphans],
});
```

Do not concatenate this with `program.items`, `program.programItems`, component
props, a previous preview or cached wizard state. Do not normalize the same
response twice. If the current shell keeps the wizard mounted, give each edit
session a key/open-cycle that guarantees the reset above.

## Visible orphan recovery

At the top of Content, render a prominent `Content needing a phase` panel when
`orphanItems.length > 0`. Every orphan must show:

- title and type
- its previous phase ID when available
- an `Assign to phase` dropdown containing all current phases
- a destructive `Remove content` action

Assign updates that item's `phaseId` in the single canonical array. Remove
deletes that item from the same array. After either action, derive orphans
again. Do not auto-assign, silently remove or hide legacy content.

While orphans exist, disable Next and Save, focus/scroll to this panel and show
`Assign or remove all content that is missing a phase.` The error banner may
name `Etter`, but `Etter` must also be visible in this panel so the coach can
fix it.

## Phase deletion and template picker guards

Deleting a phase with attached content requires confirmation:

`Deleting this phase also removes N content item(s). This cannot be undone.`

On confirm, remove the phase and all attached items in one functional state
update. Cancel changes nothing:

```ts
setDraft((current) => ({
  ...current,
  phases: current.phases.filter((phase) => phase.id !== phaseId),
  items: current.items.filter((item) => item.phaseId !== phaseId),
}));
```

If a template picker targets a phase that is deleted, close the picker. Before
appending a selected template, re-check that its target phase still exists;
otherwise show an error and append nothing.

## Duplicate without broken relationships

Never reuse persisted phase UUIDs in a duplicate. First build an
`oldPhaseId -> newClientPhaseId` map for every source phase, then clone phases
and rewrite every cloned item `phaseId` through that map. Use fresh item UI
IDs, set `programId: null`, and never match by title, index or week. A source
orphan remains visible in the recovery panel; do not guess its phase.

## Schedule UI and save payload

For each attached item show a phase-local Week dropdown (`1` through the
selected phase duration) and a Monday-Sunday Weekday dropdown. Never show or
send `dayOffset`, `programDay` or days from program start.

Send human values unchanged:

```json
{
  "action": "upsert",
  "ownerAccountId": "<selected owner UUID>",
  "programId": "<UUID for edit, null for create/duplicate>",
  "title": "Example program",
  "description": "",
  "audience": "U15",
  "level": "advanced",
  "durationWeeks": 3,
  "phases": [
    { "id": "phase-client-a", "title": "Phase 1", "startsInWeek": 1, "durationWeeks": 1 },
    { "id": "phase-client-b", "title": "Phase 2", "startsInWeek": 2, "durationWeeks": 1 }
  ],
  "items": [
    {
      "phaseId": "phase-client-a",
      "itemType": "session_template",
      "trainingTemplateId": "<template UUID>",
      "title": "Test Session",
      "weekInPhase": 1,
      "weekday": "monday"
    }
  ]
}
```

Do not subtract one from `startsInWeek`. Do not send `weekOffset`. The server
performs the database offset conversion. Build this payload only from the
current canonical draft; do not append prop/cached/server arrays.

Before the request validate unique phase IDs, phase ranges, template IDs,
weekdays, week-in-phase ranges and `orphanItems.length === 0`. Log the exact
outgoing phase IDs/item phase IDs and counts in development mode.

## Mandatory post-save replacement and verification

Read `savedProgramId` from the unwrapped upsert response. Immediately call
`enrollmentPreview` for that ID. Verify phase start weeks, phase count, item
count, template IDs, item types, `weekInPhase` and `weekday`. Match returned
phases using `phaseIdMap` or the returned phase order; do not expect a temporary
client ID to remain a persisted UUID.

If verification succeeds, atomically replace the complete draft using the
same preview hydrator above. Never merge server phases/items into pre-save
state. If verification fails, keep the program as a draft, keep the builder
open, disable Publish and show `Program could not be verified after save` with
the missing/mismatched item names.

## Acceptance QA

1. Reopen the reported draft: `Etter` is either absent after a clean reload or
   visible under `Content needing a phase`; it is never an invisible blocker.
2. Assign `Etter` to a phase and verify it moves into that phase immediately.
3. Alternatively remove `Etter` and verify Next becomes enabled.
4. Open Program A, close it, then open Program B quickly; no phase or item from
   A appears in B, even if A's request finishes late.
5. Edit a phase title/week/duration and move between steps; its ID and all item
   relationships stay unchanged.
6. Delete a phase with content: Cancel preserves everything; Confirm removes
   the phase and its attached content atomically.
7. Duplicate a program and verify every cloned item references a newly cloned
   phase and `programId` is null.
8. Save phases starting in weeks 1, 2 and 3 with a session in each. The preview
   returns all three sessions under the correct phases.
9. Start an enrollment on Sunday and verify Monday content is scheduled on the
   following day by the server.
10. Close and reopen the saved draft. Item count, phase relationships, weeks
    and weekdays remain unchanged.

## Remote deployment status

- Project ref: `lhpczofddvwcyrgotzha`
- Function: `manageTrainingPrograms` version 12 is deployed and `ACTIVE`
- Required migration: `20260712120000_owner_training_programs.sql` is remote
- Atomic enrollment migrations `20260712213000` and `20260712213100` are remote
- Safe complete-materialization migration `20260712221500` is remote
- An unauthenticated endpoint request returns `401`, not `404`

Do not report this fix complete from a successful build alone. Exercise the
reported edit flow and all acceptance checks above in Base44 Preview.
