# Base44 Replacement Prompt: Enrollment Preview API v2 (#285)

Replace the current Training Program enrollment modal data flow in the existing
authenticated Base44/KlubAdmin app. Do not patch the old timeline calculations
again. Remove the old enrollment modal's use of raw program rows,
`owner_memberships`, invitations and guardian/parent data.

The previous adapter fix has demonstrably not taken effect: the UI still shows
program duration as 0, all phases in week 1, no saved sessions, and a parent as
the player choice. Use the new server-composed preview response below as the
only source for this modal.

## Endpoint

```http
POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingPrograms
Authorization: Bearer <signed-in Supabase user access token>
apikey: <Supabase anon publishable key>
Content-Type: application/json
```

```json
{
  "action": "enrollmentPreview",
  "ownerAccountId": "<selected owner UUID>",
  "programId": "<program UUID>",
  "startDate": "2026-07-12"
}
```

The function is deployed and protected. Without auth it returns `401`, not
`404`.

## Use the response directly

The successful response is already camelCase and fully composed:

```ts
type EnrollmentPreviewV2 = {
  apiVersion: 2;
  ownerAccountId: string;
  startDate: string;
  program: {
    id: string;
    title: string;
    description: string | null;
    audience: string | null;
    level: string | null;
    durationWeeks: number;
    status: 'draft' | 'published' | 'archived';
    phases: Array<{
      id: string;
      title: string;
      description: string | null;
      weekOffset: number;
      durationWeeks: number;
      startWeek: number;
      endWeek: number;
      startDate: string;
      endDate: string;
      sortOrder: number;
      items: Array<{
        id: string;
        phaseId: string;
        itemType: string;
        trainingTemplateId: string | null;
        title: string;
        description: string | null;
        dayOffset: number;
        programDay: number;
        weekInPhase: number;
        weekday: string;
        weekdayLabel: string;
        scheduledDate: string;
        sortOrder: number;
        config: Record<string, unknown>;
      }>;
    }>;
    unassignedItems: unknown[];
  };
  players: Array<{
    playerId: string;
    displayName: string;
    email: string | null;
    ownerRosterStatus: 'active';
  }>;
  teams: Array<{
    id: string;
    name: string;
    memberCount: number;
  }>;
};
```

Do not normalize this response again. Do not read snake_case fields. Do not
calculate phase weeks, date ranges or item dates in Base44. The server has
already done it from persisted data.

## Required modal implementation

When Enroll opens or the start date changes:

1. Set a loading state.
2. Call `enrollmentPreview` using the current owner, program and ISO start date.
3. Reject a response unless `data.apiVersion === 2` and
   `data.ownerAccountId === selectedOwnerAccountId`.
4. Replace the entire modal model with the returned payload.
5. Clear any previously selected players/team when owner or program changes.

Render:

```tsx
preview.program.durationWeeks
preview.program.phases.map(phase => ...)
phase.startWeek
phase.endWeek
phase.startDate
phase.endDate
phase.items.map(item => ...)
item.itemType
item.title
item.weekdayLabel
item.scheduledDate
```

Use `No content in this phase` only when `phase.items.length === 0`. Never show
`No sessions in this phase` while ignoring task/exercise/focus items.

The screenshot case must now show different weeks if persisted offsets differ,
and every persisted session is already nested under the correct phase by the
server.

## Player picker

Render player choices exclusively from:

```ts
preview.players
```

Use `player.playerId` as the checkbox value and enrollment `playerIds` value.
Use `player.displayName` as the primary label and email only as secondary text.
Do not merge this array with memberships, user roles, invites, guardians,
parents or club-member lists. The endpoint starts from active `owner_players`
rows, so a parent-only account cannot be returned.

Render teams exclusively from `preview.teams` and submit `team.id` as
`teamId`.

## Enrollment submit

Keep the existing protected submit action:

```json
{
  "action": "enroll",
  "ownerAccountId": "<same owner UUID>",
  "programId": "<same program UUID>",
  "playerIds": ["<selected playerId>"],
  "teamId": null,
  "startDate": "2026-07-12"
}
```

Disable Enroll until preview v2 is loaded and at least one returned player or
team is selected.

## Remove obsolete code

Delete or bypass all enrollment-modal code that:

- reads `duration_weeks`, `week_offset`, `phase_id`, `item_type` or
  `day_offset` directly
- falls back to `weekOffset || 0`
- calculates phase dates in Base44
- joins sessions to phases client-side
- queries `owner_memberships`, roles, invites or guardian data for player
  options
- reuses a player list cached for another owner

There must be one modal data source: `enrollmentPreview` response v2.

## Diagnostics and QA

In development only, log:

```ts
console.debug('[program enrollment preview v2]', {
  apiVersion: preview.apiVersion,
  ownerAccountId: preview.ownerAccountId,
  durationWeeks: preview.program.durationWeeks,
  phases: preview.program.phases.map(p => ({
    id: p.id,
    startWeek: p.startWeek,
    endWeek: p.endWeek,
    itemCount: p.items.length,
  })),
  players: preview.players.map(p => ({ playerId: p.playerId, displayName: p.displayName })),
});
```

Verify with a newly saved program containing sequential phases and at least one
session:

1. The modal's duration matches Details.
2. Phase week labels and dates differ according to persisted offsets.
3. Each added session appears under its phase.
4. The real web-created player appears by display name.
5. A parent-only account does not appear.
6. Changing start date refetches and updates every returned date.
7. Changing owner/program clears stale preview and selection immediately.
8. Network/error state never falls back to the old incorrect data path.
