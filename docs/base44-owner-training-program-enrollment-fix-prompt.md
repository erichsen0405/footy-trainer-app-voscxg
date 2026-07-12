# Base44 Fix Prompt: Training Program Enrollment Preview (#285)

Apply this fix inside the existing authenticated Base44/KlubAdmin webapp. Do
not build a new portal and do not create Base44 business-data entities.
Supabase remains source of truth.

## Bugs to fix

The enrollment modal currently has three connected data-contract bugs:

1. Every phase is rendered in week 1 even when the saved program uses later
   weeks.
2. Saved session/template items are not rendered below their phase.
3. The player picker can show a parent/guardian or membership email instead of
   the active player created in the owner workspace.

Fix the underlying adapters and data sources. Do not patch the display with
hard-coded week numbers or email-role guesses.

## Verified endpoints

Base URL:

```text
https://lhpczofddvwcyrgotzha.supabase.co/functions/v1
```

Use the signed-in Supabase user's access token and the public anon key:

```http
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_anon_publishable_key>
Content-Type: application/json
```

Never expose a service-role key in Base44.

Programs:

```json
POST /manageTrainingPrograms
{
  "action": "list",
  "ownerAccountId": "<selected owner UUID>"
}
```

Player roster:

```json
POST /manageOwnerPlayerCrm
{
  "action": "list",
  "ownerAccountId": "<the same selected owner UUID>"
}
```

Both functions are deployed and protected. An unauthenticated request returns
`401`; `404` means the URL/function name is wrong.

## One explicit API adapter

`manageTrainingPrograms.list` currently returns database-shaped program rows.
The response fields used here are snake_case. Normalize exactly once when data
enters Base44; every component must then use only the normalized camelCase
model.

```ts
function normalizeProgram(raw) {
  return {
    id: raw.id,
    ownerAccountId: raw.owner_account_id,
    title: raw.title,
    description: raw.description ?? '',
    audience: raw.audience ?? '',
    level: raw.level ?? 'all',
    durationWeeks: Number(raw.duration_weeks),
    status: raw.status,
    publishedVersion: Number(raw.published_version ?? 0),
    phases: (raw.phases ?? [])
      .map((phase) => ({
        id: phase.id,
        programId: phase.program_id,
        title: phase.title,
        description: phase.description ?? '',
        weekOffset: Number(phase.week_offset),
        durationWeeks: Number(phase.duration_weeks),
        sortOrder: Number(phase.sort_order ?? 0),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder),
    items: (raw.items ?? [])
      .map((item) => ({
        id: item.id,
        programId: item.program_id,
        phaseId: item.phase_id,
        itemType: item.item_type,
        trainingTemplateId: item.training_template_id,
        title: item.title,
        description: item.description ?? '',
        dayOffset: Number(item.day_offset),
        sortOrder: Number(item.sort_order ?? 0),
        config: item.config ?? {},
      }))
      .sort((a, b) => a.dayOffset - b.dayOffset || a.sortOrder - b.sortOrder),
  };
}
```

Do not use fallbacks such as `phase.weekOffset || 0` directly against the raw
API response. That is the cause of every phase appearing in week 1. Do not mix
`phase_id` and `phaseId` after normalization.

## Correct phase dates

The API's `week_offset` is zero-based:

- `0` starts in human week 1
- `1` starts in human week 2
- `2` starts in human week 3

Use local calendar-day helpers that do not introduce UTC/timezone drift:

```ts
const parseDateOnly = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
};

const addCalendarDays = (value, days) => {
  const date = typeof value === 'string' ? parseDateOnly(value) : new Date(value);
  date.setDate(date.getDate() + days);
  return date;
};

const phaseStartDate = (startDate, phase) =>
  addCalendarDays(startDate, phase.weekOffset * 7);

const phaseEndDate = (startDate, phase) =>
  addCalendarDays(startDate, (phase.weekOffset + phase.durationWeeks) * 7 - 1);

const humanStartWeek = (phase) => phase.weekOffset + 1;
const humanEndWeek = (phase) => phase.weekOffset + phase.durationWeeks;
```

For sequential one-week phases with offsets `0`, `1`, `2`, `3`, the enrollment
preview must render weeks `1`, `2`, `3`, `4`, with four different date ranges.
Overlapping phases are valid only when their persisted offsets overlap.

## Render persisted sessions/items under the correct phase

Build the timeline from the persisted program returned by a fresh `list`
request—not from stale builder state.

```ts
const itemsForPhase = (program, phaseId) =>
  program.items
    .filter((item) => item.phaseId === phaseId)
    .sort((a, b) => a.dayOffset - b.dayOffset || a.sortOrder - b.sortOrder);

const itemDate = (enrollmentStartDate, item) =>
  addCalendarDays(enrollmentStartDate, item.dayOffset);
```

Render every persisted item type. At minimum, visibly distinguish:

- `session_template` as Session
- `week_template` as Week template
- `task_template` as Task
- `exercise_template` as Exercise
- `focus` as Focus
- `note`, `video` and `test` when present

Do not display `No sessions in this phase` merely because the UI filtered only
one item type. Display `No content in this phase` only when
`itemsForPhase(...).length === 0`.

`dayOffset` is an absolute day offset from the program enrollment start—not a
day offset from the start of the phase. When the builder lets the user choose a
day inside a phase, save it as:

```ts
dayOffset = phase.weekOffset * 7 + (dayInPhase - 1);
```

## Save and refetch contract

Before calling `upsert`, build one request payload and log it in development.
The phase/item fields sent to the API are camelCase:

```ts
{
  phases: [{ id, title, weekOffset, durationWeeks }],
  items: [{ phaseId, itemType, trainingTemplateId, title, dayOffset }]
}
```

After a successful `upsert`, discard stale builder data and use the returned
payload or immediately run `list` again. Before enabling Publish, assert:

- phase count matches the builder
- every persisted `week_offset` matches the submitted `weekOffset`
- item count matches the builder
- every item has the expected persisted `phase_id`
- every selected session template has `item_type = session_template` and a
  non-null `training_template_id`

If round-trip validation fails, show an error and keep the program as a draft.
Never publish a program whose phases/items differ from the builder preview.

## Correct player source: CRM roster only

The enrollment player picker must use only
`manageOwnerPlayerCrm { action: "list" }` for the selected owner.

```ts
const selectablePlayers = (crmResponse.data.players ?? [])
  .filter((player) => player.ownerRosterStatus === 'active')
  .map((player) => ({
    id: player.playerId,
    label: player.displayName || 'Unnamed player',
    email: player.email ?? null,
  }));
```

Rules:

- Enrollment sends `player.id` as `playerIds`.
- Match by `playerId`, never by email.
- Never construct player choices from `owner_memberships`,
  `owner_membership_roles`, club invites, guardian contacts or parent access.
- Never include `parent`, guardian, owner, admin or coach memberships unless
  that same user independently exists as an active `owner_players` row and is
  returned by CRM as a player.
- Do not show guardian/parent email as a player label.
- Use CRM `teams` for the team picker; show `memberCount` and submit the team's
  `id` as `teamId`.

Keep player and program requests scoped to the exact same
`selectedOwnerAccountId`. Clear cached player/team selections whenever the
owner changes.

## Existing broken programs

Do not silently invent corrected offsets or missing items in the enrollment
modal. Inspect the fresh raw `list` response:

- If raw `week_offset` values and raw `items` are correct, the adapter fix above
  repairs the preview.
- If raw values are already all `0` or `items` is empty, the old Base44 builder
  saved incorrect data. A draft must be edited and saved again with the fixed
  builder.
- A published program/version is immutable. Recreate it as a new corrected
  draft and publish that; do not rewrite existing enrollment history.

## Required QA

Use a real owner-scoped test player created through the existing web player
flow and a program containing four one-week phases plus at least one saved
session in each phase.

Verify:

1. Saved offsets are `0`, `1`, `2`, `3` in the raw `list` response.
2. Preview labels are Week 1, Week 2, Week 3 and Week 4.
3. Each phase has a different correct date range from the chosen start date.
4. Each persisted session appears under the phase referenced by its
   `phase_id`.
5. Session dates use their absolute `day_offset`.
6. The created player appears by `displayName` and is selectable.
7. A parent/guardian-only account does not appear.
8. Submitted enrollment contains the selected player's `playerId` UUID.
9. Switching owner accounts clears stale players, teams and selections.
10. Empty, loading, `401`, `403`, `409` and retry states remain usable.

Also apply the shared Content-step searchable template picker, Level dropdown
and safe program deletion contract from
`docs/base44-owner-training-programs-prompt.md`. The enrollment adapter fix and
the builder picker must use the same normalized phase and item model.
