# Base44 Replacement Prompt: Program Builder Schedule v3 (#285)

Replace the save/load scheduling logic in the existing authenticated
Base44/KlubAdmin Training Program builder. Keep the existing portal shell and
visual style. Supabase remains source of truth.

This prompt supersedes every old builder instruction that asks the user to
enter a numeric `dayOffset` or asks Base44 to calculate an absolute program
day. The server now accepts human week numbers, phase-local week selection and
weekday names.

## Problems fixed by this contract

- Human phase weeks were not always persisted as the correct zero-based
  backend offsets.
- Base44 temporary phase IDs could be replaced by server UUIDs without mapping
  session items to the new IDs, leaving saved sessions unassigned.
- Content scheduling exposed a numeric day from program start instead of an
  actual weekday.
- An arbitrary enrollment start date made client-calculated weekday offsets
  unreliable.

The deployed server now maps temporary phase IDs to server UUIDs, maps item
aliases such as `session` to `session_template`, and calculates persisted
schedule data from `startsInWeek`, `weekInPhase` and `weekday`.

## Builder state

Use one stable client ID for every phase while the builder is open. A UUID is
preferred, but the server also maps stable temporary strings.

```ts
type PhaseDraftV3 = {
  id: string;              // stable client ID
  title: string;
  description?: string;
  startsInWeek: number;    // human one-based value: 1, 2, 3...
  durationWeeks: number;
};

type ProgramItemDraftV3 = {
  id: string;              // local UI key only
  phaseId: string;         // exact PhaseDraftV3.id
  itemType: 'task_template' | 'exercise_template' | 'session_template' | 'focus';
  trainingTemplateId?: string;
  title: string;
  description?: string;
  weekInPhase: number;     // one-based, 1..phase.durationWeeks
  weekday: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
};
```

Never replace a phase ID after an item has been attached to it. Never use array
index as the persistent relationship. The item `phaseId` must equal the phase
`id` sent in the same request.

## Phase UI

Show:

- Phase name
- Starts in week
- Duration (weeks)
- `Runs from week X to week Y`

State stores `startsInWeek` exactly as shown. Do not convert it in Base44. The
server converts it to `week_offset`.

When adding a phase, suggest the week after the latest phase ends. Overlap is
allowed only if the coach explicitly changes the suggestion.

## Content UI: week + weekday

Group content under each phase. After choosing a saved Task, Exercise or
Session template, show scheduling dropdowns:

1. `Week`
   - Hide this dropdown when the phase lasts one week, or show its only value.
   - For a three-week phase, options are `Phase week 1`, `Phase week 2`,
     `Phase week 3`.
2. `Weekday`
   - Monday
   - Tuesday
   - Wednesday
   - Thursday
   - Friday
   - Saturday
   - Sunday

Default new items to phase week 1 and Monday. Do not show `Program day`,
`dayOffset` or “days from program start” anywhere.

An enrollment may start on any calendar date. Base44 must not calculate the
final date. The server resolves the selected weekday inside each seven-day
program week. Example: if enrollment starts Sunday 2026-07-12, an item set to
Monday in phase week 1 is scheduled on 2026-07-13.

## Save request

```http
POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingPrograms
Authorization: Bearer <signed-in Supabase user access token>
apikey: <Supabase anon publishable key>
Content-Type: application/json
```

```json
{
  "action": "upsert",
  "ownerAccountId": "<owner UUID>",
  "programId": null,
  "title": "8-week finishing",
  "description": "Progressive finishing program",
  "audience": "U15",
  "level": "advanced",
  "durationWeeks": 8,
  "phases": [
    {
      "id": "phase-client-1",
      "title": "Foundation",
      "startsInWeek": 1,
      "durationWeeks": 2
    },
    {
      "id": "phase-client-2",
      "title": "Build",
      "startsInWeek": 3,
      "durationWeeks": 2
    }
  ],
  "items": [
    {
      "phaseId": "phase-client-1",
      "itemType": "session_template",
      "trainingTemplateId": "<session template UUID>",
      "title": "Finishing session",
      "weekInPhase": 1,
      "weekday": "monday"
    },
    {
      "phaseId": "phase-client-2",
      "itemType": "task_template",
      "trainingTemplateId": "<task template UUID>",
      "title": "First touch homework",
      "weekInPhase": 2,
      "weekday": "thursday"
    }
  ]
}
```

Do not send `startsInWeek - 1`. Do not send `dayOffset`. Do not omit the
`items` array. Do not rename it to local component state names.

The server accepts `type: "session"` and `templateId` aliases defensively, but
Base44 should send the canonical fields above.

## Required save validation

Before calling the API:

- every phase has a stable non-empty ID
- startsInWeek >= 1
- durationWeeks >= 1
- phase end does not exceed program duration
- every item references an ID in the outgoing phases array
- every item has a valid weekday
- weekInPhase is between 1 and the selected phase duration
- saved template items have a non-null trainingTemplateId

Log this in Base44 development mode:

```ts
console.debug('[program builder save v3]', {
  phases: payload.phases.map(p => ({
    id: p.id,
    startsInWeek: p.startsInWeek,
    durationWeeks: p.durationWeeks,
  })),
  items: payload.items.map(i => ({
    phaseId: i.phaseId,
    itemType: i.itemType,
    trainingTemplateId: i.trainingTemplateId,
    weekInPhase: i.weekInPhase,
    weekday: i.weekday,
  })),
});
```

If the response is an error, keep the builder open and show the server message.
Do not clear phases/items.

## Mandatory server round-trip before Publish

After upsert succeeds, call `enrollmentPreview` for the returned program ID
with any current ISO start date. Use that server-composed response to verify:

- `program.durationWeeks` equals the builder
- phase `startWeek` values equal submitted `startsInWeek`
- every submitted item is present below exactly one phase
- every session has `itemType = session_template`
- each item returns the submitted `weekInPhase` and `weekday`
- `scheduledDate` matches the chosen weekday in the relevant program week

If any assertion fails, show `Program could not be verified after save`, keep
it as draft and disable Publish. Never display a successful save if sessions
were lost.

## Loading an existing draft

Use the persisted phase/item values returned by the program API. For legacy
items without scheduling config, use enrollmentPreview v2 values
`weekInPhase`, `weekday` and `weekdayLabel` as the migration-compatible display
values. Saving the draft again writes semantic scheduling config.

Published programs remain immutable. Recreate an incorrectly published legacy
program as a corrected draft.

## QA

1. Create a four-week program with phases starting in weeks 1, 2, 3 and 4.
2. Use temporary phase IDs such as `phase-client-1` to prove server mapping.
3. Add at least one session to every phase.
4. Assign different weekdays, including Monday and Sunday.
5. Save and verify every session survives the server round-trip under the
   correct phase.
6. Enroll with a Sunday start date and verify Monday content lands the next
   day, not Sunday.
7. Edit the draft and verify week/weekday dropdowns restore correctly.
8. Ensure failed validation or network errors never clear content.

