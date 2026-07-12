# Base44 Follow-up Prompt: Program Week Labels and Card Duration v5 (#285)

Apply these two focused presentation fixes inside the existing authenticated
Base44/KlubAdmin Training Programs flow. Keep the existing portal shell,
program list, Program Builder State v4 contract, API adapter and visual style.
Do not create a new route, portal or Base44 business-data entity. Supabase
remains the source of truth.

This prompt fixes:

1. the ambiguous bare `W1` shown beside content in every phase; and
2. program cards showing `0 weeks` even though the persisted program has a
   valid duration such as two weeks.

These are presentation/normalization fixes. Do not change the database schema
or the semantic save payload from v4.

## Verified API contract

```http
POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingPrograms
Authorization: Bearer <signed-in Supabase user access token>
apikey: <Supabase anon publishable key>
Content-Type: application/json
```

List request:

```json
{
  "action": "list",
  "ownerAccountId": "<selected owner UUID>"
}
```

The unwrapped response contains `programs`. Rows from `list`, and the
`savedProgram` returned after `upsert`, use persisted database field names such
as `duration_weeks`. Builder/enrollment preview objects use normalized
camelCase fields such as `durationWeeks`.

The Base44 adapter must handle this boundary exactly once. Never expose the
service-role key and never query program tables directly from Base44. Handle
`400`, `401`, `403`, `404`, `409` and `500` using the existing error pattern.

## Fix 1: replace ambiguous `W1`

`weekInPhase` is a one-based week inside the selected phase. It is not always
the same as the program week:

```ts
programWeek = phase.startsInWeek + item.weekInPhase - 1;
```

Examples:

- Phase 1 starts in program week 1. Its phase week 1 is program week 1.
- Phase 2 starts in program week 2. Its phase week 1 is program week 2.
- A three-week phase starting in program week 2 has:
  - phase week 1 = program week 2
  - phase week 2 = program week 3
  - phase week 3 = program week 4

A bare `W1` does not communicate this distinction and must not be rendered.

### One-week phases

When `phase.durationWeeks === 1`:

- hide the week badge and week dropdown completely;
- keep `item.weekInPhase = 1` in canonical state and in the save payload;
- show the actual program week once in the phase header, for example
  `Program week 2`;
- render only the weekday dropdown beside each item.

For the reported two-week program, the Content step should look conceptually
like this:

```text
Phase 1                                      Program week 1
Monday      Etter
Wednesday   Warm-up drill

Phase 2                                      Program week 2
Tuesday     Etter
Thursday    Test Session
```

There must be no `W1` badge in either phase because neither item has a week
choice to make.

### Multi-week phases

When `phase.durationWeeks > 1`, retain a real dropdown but label it
`Week in phase`. Its options must show both meanings:

```ts
function buildPhaseWeekOptions(phase) {
  return Array.from({ length: phase.durationWeeks }, (_, index) => {
    const weekInPhase = index + 1;
    const programWeek = phase.startsInWeek + index;
    return {
      value: weekInPhase,
      label: `Phase week ${weekInPhase} · Program week ${programWeek}`,
    };
  });
}
```

Do not label an option only `W1`, `W2` or `Week 1`. The selected value stored
and sent remains the one-based `weekInPhase`; the program week is explanatory
display text only. Do not send `programWeek`, `weekOffset` or `dayOffset`.

The phase header must show:

- `Program week X` for a one-week phase; or
- `Program weeks X–Y` for a multi-week phase.

Sort items inside a phase by `weekInPhase`, then Monday through Sunday. Keep
the weekday dropdown behavior from v4 unchanged.

If reducing a phase duration makes an existing item's `weekInPhase` invalid,
show that item as needing a valid week and block Next/Save. Do not silently
move it to another week.

## Fix 2: never show a false `0 weeks` on program cards

The program in the reported card is not zero weeks. The list row contains the
persisted field `duration_weeks`, while the card is reading `durationWeeks`
and falling back to zero. Fix this at the adapter boundary, not in the JSX.

Use one canonical program-summary normalizer for all `list` and mutation
responses:

```ts
function positiveIntegerOrNull(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
}

function normalizeProgramSummary(raw) {
  return {
    id: String(raw.id),
    title: raw.title ?? '',
    description: raw.description ?? '',
    audience: raw.audience ?? '',
    level: raw.level ?? 'all',
    status: raw.status,
    durationWeeks: positiveIntegerOrNull(
      raw.durationWeeks ?? raw.duration_weeks,
    ),
    phaseCount: Array.isArray(raw.phases) ? raw.phases.length : 0,
    raw,
  };
}
```

Apply this normalizer after:

- `list`;
- `upsert`;
- `publish`;
- `archive`;
- `delete`; and
- every refresh/retry that replaces the program collection.

Do not concatenate a normalized program with an older raw card object. Replace
the collection from the latest response and normalize every row exactly once.

Render duration from the canonical field only:

```tsx
function formatDurationWeeks(durationWeeks) {
  if (durationWeeks === null) return 'Duration unavailable';
  return `${durationWeeks} ${durationWeeks === 1 ? 'week' : 'weeks'}`;
}

<span>{formatDurationWeeks(program.durationWeeks)}</span>
```

Never use any of these fallbacks:

```ts
program.durationWeeks || 0
raw.durationWeeks || 0
program.phases.length
parseInt(program.title)
```

If both duration fields are absent or invalid, show `Duration unavailable`,
log the program ID in development mode and keep Edit available. Never display
`0 weeks`, because zero is not a valid program duration.

## Save contract remains unchanged

Continue sending v4 semantic fields:

```json
{
  "phases": [
    {
      "id": "phase-client-2",
      "title": "Phase 2",
      "startsInWeek": 2,
      "durationWeeks": 1
    }
  ],
  "items": [
    {
      "phaseId": "phase-client-2",
      "itemType": "session_template",
      "trainingTemplateId": "<template UUID>",
      "title": "Test Session",
      "weekInPhase": 1,
      "weekday": "thursday"
    }
  ]
}
```

Hiding the week control for a one-week phase must not remove
`weekInPhase: 1` from the outgoing item.

## Acceptance QA

1. Refresh the existing draft `Demo 2 ugers program`. Its card shows
   `2 weeks`, never `0 weeks`.
2. Open the draft. Phase 1 shows `Program week 1`; Phase 2 shows
   `Program week 2`.
3. Neither one-week phase renders a `W1` badge or week dropdown.
4. The weekday dropdowns and item titles remain unchanged.
5. Save and reopen the draft. Every item still sends/returns
   `weekInPhase: 1` and the selected weekday.
6. Create a three-week phase starting in program week 2. Its week dropdown
   offers exactly:
   - `Phase week 1 · Program week 2`
   - `Phase week 2 · Program week 3`
   - `Phase week 3 · Program week 4`
7. Select phase week 2, save and reopen. The item restores phase week 2 and
   displays program week 3.
8. Verify Drafts, Published, Archived, search and refresh all use the same
   duration normalizer.
9. Mock an invalid/missing duration. The card shows `Duration unavailable`,
   never `0 weeks`.
10. Enrollment preview dates and server payloads remain unchanged.

## Remote status verified 2026-07-12

- Project ref: `lhpczofddvwcyrgotzha`
- `manageTrainingPrograms`: deployed, `ACTIVE`, version 12
- Migration `20260712120000`: present locally and remotely
- Atomic enrollment migrations `20260712213000` and `20260712213100`: present
  locally and remotely
- Safe complete-materialization migration `20260712221500`: present locally and
  remotely
- Unauthenticated endpoint smoke test: `401`, not `404`

Do not report this complete from a successful Base44 build alone. Verify the
reported two-week draft card and both phase layouts in Base44 Preview.
