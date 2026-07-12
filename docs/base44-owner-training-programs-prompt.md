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
- `{ "action":"upsert", "ownerAccountId":"<uuid>", "programId":null, "title":"8-week finishing", "description":"...", "audience":"U15", "level":"advanced", "durationWeeks":8, "phases":[{"id":"<client uuid>","title":"Foundation","weekOffset":0,"durationWeeks":2}], "items":[{"phaseId":"<same uuid>","itemType":"session_template","trainingTemplateId":"<uuid>","title":"Finishing session","dayOffset":0}] }`
- `{ "action":"publish", "ownerAccountId":"<uuid>", "programId":"<uuid>" }`
- `{ "action":"enroll", "ownerAccountId":"<uuid>", "programId":"<uuid>", "playerIds":["<uuid>"], "teamId":null, "startDate":"2026-07-20" }`
- `{ "action":"setEnrollmentStatus", "ownerAccountId":"<uuid>", "enrollmentId":"<uuid>", "status":"paused|active|completed|cancelled" }`
- `{ "action":"archive", "ownerAccountId":"<uuid>", "programId":"<uuid>" }`

Successful responses use `{ "success": true, "data": ... }`. Render API error messages and handle `401`, `403`, `404`, `409` and `500`. A protected deployed endpoint returns `401` without auth; `404` means it has not been deployed.

## Builder and safety

Use steps: details → phases/weeks → content → enrollment preview. Content selects existing #286 training templates. Show relative and calculated dates before enrollment. Require explicit confirmation for publish, team enrollment, cancellation and archive. Published programs are immutable; offer duplication as a new draft rather than editing history.

### Phase-step UX — do not expose offsets

The phase step must use human week numbers. Never show labels such as `wk off`,
`week offset` or a zero-based start value to the user.

Each phase row must show:

- `Phase name`
- `Starts in week` — a one-based week number, where `1` means the first week
  of the program
- `Duration (weeks)` — how many weeks the phase lasts
- a live summary such as `Runs from week 3 to week 5`

The API field is still zero-based. Convert only at the API boundary:

```ts
// UI -> API
weekOffset = startsInWeek - 1;

// API -> UI
startsInWeek = weekOffset + 1;

// Human-readable inclusive end week
endsInWeek = startsInWeek + durationWeeks - 1;
```

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

## Remote deployment status (verified 2026-07-12)

- Project ref: `lhpczofddvwcyrgotzha`
- `manageTrainingPrograms`: deployed and `ACTIVE`
- Migration `20260712120000_owner_training_programs.sql`: present locally and remotely
- `supabase db push --dry-run`: remote database is up to date
- Unauthenticated endpoint smoke test: `401` (protected endpoint exists; it is not a `404`)

Base44 may connect to the endpoint contract above. Authenticated role and end-to-end UI QA must still be completed in the Base44 environment.
