# Base44 Prompt: Owner Training Programs (#285)

Use this prompt in the existing authenticated Base44/KlubAdmin webapp. Extend the existing owner portal; do not create a parallel portal or Base44 business-data entities. Supabase remains source of truth.

## Outcome

Add `Programs` under the existing planning area for both `club` and `private_coach_business` owners. Reuse `KlubAktiviteter`, `KlubOpgaver`, `clubAdminApi`, `activityWriteService.jsx`, the owner selector, role redirect and existing loading/error patterns.

Coaches must be able to list drafts/published/archived programs, use a guided builder, preview a dated timeline, publish an immutable version, enroll players or an existing club team, and pause/resume/complete an enrollment. Do not add checkout/payment; that belongs to #305. Advanced CRM filters/exclusions belong to #287.

## Supabase API

Base URL:

```text
https://lhpczofddvwcyrgotzha.supabase.co/functions/v1
```

Endpoint:

```text
POST /manageTrainingPrograms
Authorization: Bearer <supabase user access token>
apikey: <Supabase anon key>
Content-Type: application/json
```

Never expose the service-role key in Base44.

Actions:

- `{ "action":"list", "ownerAccountId":"<uuid>" }`
- `{ "action":"upsert", "ownerAccountId":"<uuid>", "programId":null, "title":"8-week finishing", "description":"...", "audience":"U15", "level":"advanced", "durationWeeks":8, "phases":[{"id":"<stable client id>","title":"Foundation","startsInWeek":1,"durationWeeks":2}], "items":[{"phaseId":"<same client id>","itemType":"session_template","trainingTemplateId":"<uuid>","title":"Finishing session","weekInPhase":1,"weekday":"monday"}] }`
- `{ "action":"publish", "ownerAccountId":"<uuid>", "programId":"<uuid>" }`
- `{ "action":"enroll", "ownerAccountId":"<uuid>", "programId":"<uuid>", "playerIds":["<uuid>"], "teamId":null, "startDate":"2026-07-20" }`
- `{ "action":"setEnrollmentStatus", "ownerAccountId":"<uuid>", "enrollmentId":"<uuid>", "status":"paused|active|completed|cancelled" }`
- `{ "action":"archive", "ownerAccountId":"<uuid>", "programId":"<uuid>" }`
- `{ "action":"delete", "ownerAccountId":"<uuid>", "programId":"<uuid>" }`

Successful responses use `{ "success": true, "data": ... }`. In addition to
the normal owner payload, a successful `upsert` returns `savedProgramId`,
`savedProgram` and `phaseIdMap`, so the builder can replace temporary phase IDs
with the canonical saved state. Render API error messages and handle `400`,
`401`, `403`, `404`, `409` and `500`. A protected deployed endpoint returns
`401` without auth; `404` means it has not been deployed.

## Builder and safety

Use steps: details → phases/weeks → content → enrollment preview. Content selects existing #286 training templates. Show relative and calculated dates before enrollment. Require explicit confirmation for publish, team enrollment, cancellation and archive. Published programs are immutable; offer duplication as a new draft rather than editing history.

On the details step, `Level` must be a predefined single-select instead of a
free-text field. Web and mobile use the same stored values:

| Label | API value |
|---|---|
| All levels | `all` |
| Beginner | `beginner` |
| Intermediate | `intermediate` |
| Advanced | `advanced` |
| Elite | `elite` |

Render Level as an accessible dropdown/select on both web and mobile. Do not
render all levels as permanently visible chips. Store the API value in
`training_programs.level`; do not translate labels into new backend values.

### Content-step template picker

Replace a long inline list of saved templates with an intuitive dropdown-style
picker for each phase/week. The closed control says
`Choose task, exercise or session` and clearly shows which phase receives the
selection.

Opening the control presents a searchable picker with:

- a search field that matches title, description and focus areas
- type filters: `All`, `Task`, `Exercise`, `Session`
- result count and an understandable empty state
- result cards with title, type badge, short description and focus areas
- one clear action: `Add to <phase name>`

Only active owner-scoped templates from `manageTrainingTemplates.list` may be
shown. Exclude archived templates and week templates from this picker. Search
and filtering happen against the already owner-scoped result and must work
together. Preserve the current search text while changing type filter, and
clear picker state after a template is added or the picker is closed.

Group added content by phase instead of showing one unstructured item list.
Each phase shows its own saved items plus its own picker trigger. A selected
template must be saved with that phase's stable `phaseId`. Schedule it with a
`Week` dropdown inside the phase and a Monday–Sunday `Weekday` dropdown. Never
show or submit a numeric day from program start. Apply the authoritative
builder contract in
`docs/base44-owner-training-program-builder-state-v4-prompt.md`.

### Delete program

Show `Delete` for programs on both web and mobile with a destructive
confirmation explaining that deletion is permanent. Call:

```json
{
  "action": "delete",
  "ownerAccountId": "<selected owner UUID>",
  "programId": "<program UUID>"
}
```

The server permits hard deletion only when the program has no enrollments. If
the endpoint returns `409` with `Programs with enrollments cannot be deleted`,
keep the program visible and offer Archive instead. Never delete enrollments or
player history to make deletion succeed.

### Phase-step UX — do not expose offsets

The phase step must use human week numbers. Never show labels such as `wk off`,
`week offset` or a zero-based start value to the user.

Each phase row must show:

- `Phase name`
- `Starts in week` — a one-based week number, where `1` means the first week
  of the program
- `Duration (weeks)` — how many weeks the phase lasts
- a live summary such as `Runs from week 3 to week 5`

Base44 sends the human value directly. The Edge Function—not Base44—converts
it to the zero-based database field:

```ts
// UI -> Edge Function
payload.startsInWeek = startsInWeek;

// Only when loading a legacy raw database row instead of the canonical preview
startsInWeek = week_offset + 1;

// Human-readable inclusive end week
endsInWeek = startsInWeek + durationWeeks - 1;
```

Never send `weekOffset` or subtract one in Base44.

When the user adds the first phase, default it to start in week `1`. When the
user adds another phase, automatically suggest the first week after the latest
existing phase ends. Example: if phase 1 runs in weeks 1–2, the next phase
defaults to start in week 3. Users may change the suggestion and create
overlapping phases intentionally.

Validate inline that:

- start week is at least `1`
- duration is at least `1`
- the calculated end week does not exceed the program duration

Show the program duration above the phase rows, for example `8-week program`,
and show an understandable error such as `This phase ends in week 9, but the
program lasts 8 weeks.` Do not ask the user to calculate or enter offsets.

Example for four sequential one-week phases:

| Phase | Starts in week | Duration (weeks) | Summary |
|---|---:|---:|---|
| Phase 1 | 1 | 1 | Week 1 |
| Phase 2 | 2 | 1 | Week 2 |
| Phase 3 | 3 | 1 | Week 3 |
| Phase 4 | 4 | 1 | Week 4 |

Support empty, skeleton/loading, retry, validation, forbidden and partial-failure states. Derive permissions from all active roles on the owner account. `owner`, `admin`, `coach` and permitted `assistant_coach` users may manage programs. Players cannot use the admin builder.

## Shared platform contract

The mobile app uses the same endpoint and tables. Do not write cross-user activities/tasks directly from Base44. Enrollment and later materialization must stay server-side and preserve `program_versions` plus `program_enrollment_items` snapshots so template edits never rewrite player history.

## QA

Test both owner types, a multi-role account, forbidden cross-owner access, draft validation, immutable publishing, duplicate enrollment, individual/team enrollment, correct relative dates, pause/resume/complete, mobile/web parity and player-only visibility.

For the required enrollment field adapter, phase/session timeline logic and
CRM-only player source, apply the corrective prompt in
`docs/base44-owner-training-program-enrollment-fix-prompt.md`. In particular,
never read raw `week_offset`, `phase_id`, `item_type` or `day_offset` as if they
were camelCase, and never populate enrollment players from memberships or
guardian/parent data.

If the existing Base44 enrollment modal still uses the old data path, replace
it entirely with the server-composed API v2 flow in
`docs/base44-owner-training-program-enrollment-preview-v2-prompt.md`. This is
the authoritative enrollment-modal contract: one endpoint returns calculated
phase dates, nested persisted content, active players and teams.

For all new saves, draft edits, draft hydration, duplication and orphan-content
recovery, the authoritative builder contract is
`docs/base44-owner-training-program-builder-state-v4-prompt.md`. It supersedes
the v3 builder-state instructions and all client-side `weekOffset` and
`dayOffset` calculations.

For the authoritative presentation of phase-local weeks and normalization of
program-card duration, also apply
`docs/base44-owner-training-program-display-ux-v5-prompt.md`. It hides the
redundant week control for one-week phases, labels multi-week choices with both
phase week and program week, and prevents raw `duration_weeks` from becoming a
false `0 weeks` display.

## Remote deployment status (verified 2026-07-12)

- Project ref: `lhpczofddvwcyrgotzha`
- `manageTrainingPrograms`: deployed and `ACTIVE` (version 9)
- Migration `20260712120000_owner_training_programs.sql`: present locally and remotely
- Migrations `20260712213000_atomic_program_enrollment.sql` and
  `20260712213100_atomic_program_enrollment_permissions.sql`: present locally
  and remotely
- Migration `20260712221500_safe_complete_program_enrollment.sql`: present
  locally and remotely
- `supabase db push --dry-run`: remote database is up to date
- Unauthenticated endpoint smoke test: `401` (protected endpoint exists; it is not a `404`)

Version 9 keeps the Base44 request contract unchanged. Enrollment now creates
the enrollment, dated standalone tasks/exercises, session activities and their
session tasks in one transaction, supplies the required activity time, and
safely repairs only the proven legacy partial enrollment left by the earlier
flow. Any enrollment with player progress is preserved and returns a conflict
instead of being rebuilt.

Base44 may connect to the endpoint contract above. Authenticated role and end-to-end UI QA must still be completed in the Base44 environment.
