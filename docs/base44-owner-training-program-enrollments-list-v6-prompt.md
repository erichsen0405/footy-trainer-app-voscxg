# Base44 Replacement Prompt: Program Enrollments List v6 (#285)

Apply this in the existing authenticated Base44/KlubAdmin Programs module. Do
not create a new portal, Base44 enrollment entity or direct table query.
Supabase remains source of truth.

## Bug and root cause

Enrollment succeeds, but clicking `Enrollments` shows `No enrollments yet`.
The old modal reads the broad `list.enrollments` array, which contains raw
database fields such as `program_id`, and then filters it with camelCase
`programId` and/or stale list state. A valid enrollment is therefore filtered
out locally.

Do not add another snake_case fallback to that modal. Replace its data source
with the server-composed endpoint below.

## Endpoint

```http
POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingPrograms
Authorization: Bearer <signed-in Supabase access token>
apikey: <Supabase anon publishable key>
Content-Type: application/json
```

```json
{
  "action": "programEnrollments",
  "ownerAccountId": "<selected owner UUID>",
  "programId": "<selected program UUID>"
}
```

Never expose a service-role key. Unauthenticated requests return `401`.

## Canonical response

Unwrap the normal `{ success: true, data: ... }` envelope once. The inner
response is already camelCase and must not be normalized again:

```ts
type ProgramEnrollmentsV1 = {
  apiVersion: 1;
  ownerAccountId: string;
  program: {
    id: string;
    title: string;
    durationWeeks: number;
    status: 'draft' | 'published' | 'archived';
  };
  enrollments: Array<{
    enrollmentId: string;
    programId: string;
    programVersionId: string;
    versionNumber: number;
    player: {
      playerId: string;
      displayName: string;
      email: string | null;
      ownerRosterStatus: string;
    };
    sourceTeam: { teamId: string; name: string | null } | null;
    startDate: string;
    endDate: string;
    durationWeeks: number;
    status: 'active' | 'paused' | 'completed' | 'cancelled';
    pausedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
    items: Array<{
      id: string;
      programItemId: string | null;
      scheduledDate: string;
      itemType: string;
      title: string;
      status: string;
      activityId: string | null;
      taskId: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    scheduledItemCount: number;
    linkedActivityItemCount: number;
    linkedTaskItemCount: number;
    allowedActions: Array<'pause' | 'resume' | 'complete' | 'cancel'>;
  }>;
  summary: {
    total: number;
    active: number;
    paused: number;
    completed: number;
    cancelled: number;
  };
};
```

Player names come only from the owner-scoped player/profile/CRM path. Do not
merge memberships, parents, guardians or invites into this response.

## Replace the modal dataflow

When `Enrollments` is clicked:

1. Capture the exact `{ ownerAccountId, programId }` for the clicked card.
2. Clear the previous modal result and error.
3. Open the modal in a loading state.
4. Call `programEnrollments` with those IDs.
5. Reject the response unless:
   - `data.apiVersion === 1`
   - `data.ownerAccountId === ownerAccountId`
   - `data.program.id === programId`
6. Replace the complete modal model with the response.
7. Ignore any late response whose owner/program no longer matches the open
   modal.

Do not derive this modal from:

- `list.enrollments`
- a program card's cached enrollment count
- direct reads of `program_enrollments`
- Base44 entities
- data retained from a previously opened program

The empty state is valid only after a successful response with
`data.enrollments.length === 0`. Loading, auth and network failures must show
their own states and must never fall through to `No enrollments yet`.

## Render each enrollment

Use `enrollment.enrollmentId` as the row key and status-action identifier.
Show:

- `player.displayName`
- `player.email` as optional secondary text
- status badge
- `startDate` to `endDate`
- source team when present
- `scheduledItemCount`
- the dated `items` list when expanded

Do not label `linkedTaskItemCount` as the total number of session tasks. It
counts only program items directly linked to standalone task records. Do not
present item status counts as verified player progression until task/activity
completion synchronization exists.

Historical inactive players must remain visible in enrollment history; show
their `ownerRosterStatus` instead of filtering them out.

## Refresh after enrollment

After `action: "enroll"` succeeds:

1. Await a fresh `programEnrollments` request for the same owner/program.
2. Replace the enrollments modal/cache with that canonical result.
3. Only then show success and close/reset the enrollment form.

Do not append a locally constructed row and do not expect the broad enroll
response's raw `enrollments` array to match this canonical contract.

## Lifecycle actions

Render only actions included in `enrollment.allowedActions`:

| UI action | `setEnrollmentStatus.status` |
|---|---|
| Pause | `paused` |
| Resume | `active` |
| Complete | `completed` |
| Cancel | `cancelled` |

Request:

```json
{
  "action": "setEnrollmentStatus",
  "ownerAccountId": "<same owner UUID>",
  "enrollmentId": "<enrollment.enrollmentId>",
  "status": "paused"
}
```

Completed and cancelled enrollments are terminal. After every successful
status action, refetch `programEnrollments`; never mutate the row optimistically
without the canonical refresh. Show `409` transition conflicts and preserve the
current row.

## Required states

- Loading: skeleton/spinner with `Loading enrollments…`
- Error: actual API message plus `Try again`
- Empty: only a successful, verified empty array
- Populated: enrollment cards/rows
- Status mutation: disable actions only for the affected row

## QA for the reported program

For `Demo 2 ugers program` after enrolling Michael:

1. Open `Enrollments` and verify one row appears immediately.
2. The row shows Michael, the chosen start date, `active`, and four scheduled
   program items.
3. Reopen the modal; the same server row still appears without relying on local
   state.
4. Refresh the page and reopen; it still appears.
5. Pause and refetch; status becomes `paused` and only Resume/Complete/Cancel
   remain.
6. Resume and refetch; status returns to `active`.
7. Opening another program never shows this enrollment.
8. A request failure shows Error, never the empty state.

## Remote backend status

- Project ref: `lhpczofddvwcyrgotzha`
- `manageTrainingPrograms`: deployed, `ACTIVE`, version 12, including
  `programEnrollments`
- Required program/enrollment migrations are already remote
- Protected endpoint smoke test returns `401`, not `404`

Do not report the Base44 fix complete from a successful build alone. Verify the
exact existing enrollment shown in the reported flow.
