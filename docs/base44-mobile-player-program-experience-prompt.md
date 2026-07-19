# Base44 prompt — issue #306 player program fallback

## Deployment status

`manageTrainingPrograms` action `playerExperience` is deployed to project `lhpczofddvwcyrgotzha` as active function version 14. The protected endpoint and dependent migrations are verified remote. The Base44 integration can use the endpoint below; authenticated player-data validation remains an explicit acceptance-QA step because this repo does not contain an approved production player token/fixture.

## Base44 instruction

Extend the existing login-protected Base44/KlubAdmin application. Do not create a new portal, a parallel player database, or new Base44 business entities.

Supabase remains source of truth. Reuse the existing Supabase auth session, `roleRedirect`, shared navigation shell and current owner-aware UI conventions. Existing owner/admin/coach program management remains unchanged.

Add a read-only `My programs` fallback for an authenticated user whose effective role union includes `player`. The same flow must work when the assigning owner has `owner_type: club` or `owner_type: private_coach_business`.

### Endpoint

```text
POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/manageTrainingPrograms
Authorization: Bearer <current Supabase access token>
apikey: <existing Supabase anon key>
Content-Type: application/json

{"action":"playerExperience"}
```

Do not send `ownerAccountId` or `playerId`. The Edge Function derives the player from the validated access token and only returns that user's enrollments. Do not query CRM notes, player tags, internal alerts or other users from Base44.

Expected success contract:

```json
{
  "data": {
    "apiVersion": 2,
    "generatedAt": "ISO timestamp",
    "today": "YYYY-MM-DD",
    "activeEnrollmentId": "uuid or null",
    "nextAction": {
      "enrollmentId": "uuid",
      "id": "enrollment item uuid",
      "scheduledDate": "YYYY-MM-DD",
      "itemType": "string",
      "title": "string",
      "status": "today | overdue | upcoming | completed | skipped",
      "activityId": "uuid or null",
      "taskId": "uuid or null"
    },
    "enrollments": []
  }
}
```

Each enrollment contains only safe owner identity/branding, program summary, dates, status, calculated progress, next item and dated player items. Treat the response as read-only.

### UI

- Add `My programs` within the existing authenticated navigation; do not introduce a second shell.
- Show the active program first with owner logo/name, progress, dates and next action.
- Group dated items in a compact responsive timeline.
- Use status labels for today, needs attention, upcoming, done and skipped.
- If `activityId` is present, link into the existing player activity surface if the Base44 player fallback supports it; otherwise show the item read-only.
- If no enrollment exists, explain that assigned programs will appear here. Do not show coach/admin controls.
- Loading: skeleton inside the existing page shell.
- `401`: clear/refresh the existing Supabase session and return to the existing login flow.
- `403`: show the existing permission state; never retry as another player.
- `5xx` or network error: keep the shell available and show retry.

Goals, skills, weekly focus, reports, chat and timestamped video feedback are not created by issue #306. Add those sections only when their dedicated backend issues are deployed; do not create placeholders that look actionable.

### Permissions and parity QA

- Player sees only their own enrollments.
- Owner/admin/coach management continues through the existing program/KlubAdmin flows.
- Multi-role users keep the union of their active owner roles.
- Verify both `club` and `private_coach_business` owner branding.
- Verify player with active program, paused program, completed history and no program.
- Verify responsive desktop/mobile web states and no regression in existing program administration.

## Remote verification

- [x] `supabase functions list --project-ref lhpczofddvwcyrgotzha` shows `manageTrainingPrograms` active at version 14 (2026-07-19 13:34 UTC).
- [x] Unauthenticated POST to the endpoint returns `401`, not `404`.
- [x] `supabase migration list --linked` and `supabase db push --dry-run` confirm that remote is up to date.
- [ ] Authenticated smoke confirms `apiVersion: 2` without exposing another player's data.
