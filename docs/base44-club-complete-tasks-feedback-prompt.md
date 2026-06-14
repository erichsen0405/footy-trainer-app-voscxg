# Base44 Prompt: Fuldfør Opgaver Og Feedback-Opgaver I Klubmodul

Brug denne prompt i Base44 for web-klubmodulet. Målet er, at klubadmins, klubtrænere og platform admins kan fuldføre almindelige opgaver og feedback-opgaver fra web på samme måde som i iOS-appen.

Det vigtigste krav: feedback-opgaver må ikke fuldføres som en simpel checkbox. De skal åbne samme score/note-modal som i iOS-appen og gemme samme data i Supabase.

## Mål

Udvid klubmodulet med:

- Åbn almindelige opgaver i samme type modal som i iOS-appens `TaskDetailsModal`.
- Fuldfør eller fortryd almindelige opgaver fra modalens primære knap.
- Åbn feedback-opgaver i samme type modal som i iOS-appens `TaskScoreNoteModal`.
- Gem feedback-score og note på feedback-opgaver.
- Markér feedback-opgaven som fuldført, når feedback gemmes.
- Markér feedback-opgaven som ikke fuldført, når feedback clear/fortrydes.
- Refetch klubaktivitetens mirror-data efter alle ændringer.

Alt skal bruge Supabase-tabellerne, som appen allerede bruger. Brug ikke Base44-interne entities som source of truth.

## Source Of Truth I Appen

Brug disse filer som adfærdskontrakt:

- Normal opgave-modal: `components/TaskDetailsModal.tsx`
- Feedback score/note-modal: `components/TaskScoreNoteModal.tsx`
- Feedback route/screen: `app/(modals)/task-feedback-note.tsx`
- Opgave completion service: `services/taskService.ts`
- Feedback service: `services/feedbackService.ts`
- Score options: `utils/scoreScale.ts`
- Completion events: `utils/taskEvents.ts`
- Celebration/completion logic: `utils/celebrationRuntime.ts`
- Klubaktivitet mirror: `supabase/functions/_shared/clubActivities.ts`

Vigtigt:

- Almindelige opgaver bruger `activity_tasks.completed` eller `external_event_tasks.completed`.
- Feedback-opgaver bruger både:
  - `task_template_self_feedback`
  - `activity_tasks.completed` eller `external_event_tasks.completed`
- Feedback-opgaver identificeres med `feedback_template_id`, `is_feedback_task`, marker i description, eller titel der starter med `Feedback på` / `Feedback pa`.
- Brug `task_instance_id`, ellers kan flere feedback-opgaver med samme template kollidere.

## Eksisterende Endpoints Til Læsning

Brug disse eksisterende Edge Functions:

- `getCurrentUserClubContext`
  - body: `{}`
- `getClubActivityFilters`
  - body: `{ "clubId": "<uuid>" }`
- `getClubActivityMirror`
  - body:

```json
{
  "clubId": "<uuid>",
  "targetType": "member",
  "targetId": "<member auth user id>",
  "dateFrom": "2026-03-01",
  "dateTo": "2026-03-31"
}
```

Efter completion/clear skal `getClubActivityMirror` refetches for samme `clubId`, `targetType`, `targetId`, `dateFrom`, `dateTo`.

## Krav Til Mirror Data

`getClubActivityMirror` skal give nok data til at åbne de rigtige modaler.

Hver aktivitet skal mindst have:

```ts
{
  id: string;
  sourceType: 'internal' | 'external';
  title: string;
  activityDate: string;
  activityTime: string;
  externalEventRowId: string | null; // events_external.id ved external
  ownerUserId: string | null;
  playerId: string | null;
  teamId: string | null;
  category: {
    id: string | null;
    name: string | null;
    color: string | null;
    emoji: string | null;
  } | null;
  tasks: ClubActivityTaskMirror[];
}
```

Hver opgave skal mindst have:

```ts
{
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  reminderMinutes: number | null;
  videoUrl: string | null;
  videoUrls: string[];
  feedbackTemplateId: string | null;
  taskTemplateId: string | null;
  isFeedbackTask: boolean;
  feedback: {
    id: string;
    userId: string;
    taskTemplateId: string;
    taskInstanceId: string | null;
    activityId: string;
    rating: number | null;
    note: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  feedbackEntries: Array<{
    id: string;
    userId: string;
    userName: string | null;
    userEmail: string | null;
    taskTemplateId: string;
    taskInstanceId: string | null;
    activityId: string;
    rating: number | null;
    note: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}
```

`isFeedbackTask` skal sættes sådan:

```ts
const isFeedbackTask =
  row.is_feedback_task === true ||
  Boolean(row.feedback_template_id) ||
  /^feedback\s+p[åa]/i.test(String(row.title ?? '').trim()) ||
  parseTemplateIdFromMarker(row.description) !== null ||
  parseTemplateIdFromMarker(row.title) !== null;
```

Ved visning skal en feedback-opgave betragtes som fuldført hvis:

```ts
task.completed === true ||
feedbackHasAnswer(task.feedback) ||
task.feedbackEntries.some(feedbackHasAnswer)
```

hvor:

```ts
function feedbackHasAnswer(row) {
  return row && (typeof row.rating === 'number' || String(row.note ?? '').trim().length > 0);
}
```

Dette matcher appens logik: en feedback-opgave kan være "done" via selve task-rækken eller via besvaret self-feedback.

## UI: Almindelig Opgave Modal

Når brugeren klikker på en almindelig opgave, åbnes en modal svarende til iOS-appens `TaskDetailsModal`.

Vis:

- Titel.
- Video/billede/PDF carousel, hvis opgaven har media.
- Beskrivelse.
- Reminder-chip, hvis `reminderMinutes` findes.
- Primær knap:
  - Hvis `completed=false`: `Mark as completed`
  - Hvis `completed=true`: `Mark as not completed`

Designparitet med iOS:

- Dark blurred backdrop.
- Hvid modal-card.
- Titel i kategoriens accentfarve.
- Luk-knap øverst til højre med `X`.
- Primær knap nederst med grøn/blå gradient.
- Loading spinner i knappen, mens der gemmes.

Hvis klubmodulet bruger dansk UI generelt, må labels oversættes senere, men første implementering skal matche iOS-teksterne for at sikre parity.

## Write: Fuldfør Almindelig Opgave

Almindelige interne opgaver ligger i `public.activity_tasks`.

Almindelige eksterne opgaver ligger i `public.external_event_tasks`.

Når brugeren trykker `Mark as completed` eller `Mark as not completed`:

```ts
const nextCompleted = !task.completed;
const nowIso = new Date().toISOString();

if (activity.sourceType === 'internal') {
  await supabase
    .from('activity_tasks')
    .update({
      completed: nextCompleted,
      updated_at: nowIso,
    })
    .eq('id', task.id)
    .eq('activity_id', activity.id);
}

if (activity.sourceType === 'external') {
  await supabase
    .from('external_event_tasks')
    .update({
      completed: nextCompleted,
      updated_at: nowIso,
    })
    .eq('id', task.id)
    .eq('local_meta_id', activity.id);
}
```

Efter succes:

- Luk modalen.
- Refetch `getClubActivityMirror`.
- Opdater UI, så checkbox/status matcher ny `completed`.

Hvis almindelig authenticated client blokeres af RLS, skal Base44 bruge en service-backed Edge Function. Service role må aldrig ligge i webklienten.

## UI: Feedback-Opgave Modal

Når brugeren klikker på en feedback-opgave, må den ikke toggle direkte.

Åbn en modal svarende til iOS-appens `TaskScoreNoteModal`.

Modal props skal matche iOS:

```ts
{
  title: `Feedback on ${stripLeadingFeedbackPrefix(task.title)}`,
  introText: 'How did it go?',
  helperText: config.enableScore
    ? (config.scoreExplanation ?? 'How well did you do on your focus points')
    : null,
  scorePlaceholder: 'Choose feedback',
  noteLabel: 'Notes (optional)',
  notePlaceholder: 'Write what went well or poorly...',
  primaryButtonLabel: 'Mark as completed',
  clearLabel: 'Mark as not completed',
  missingScoreTitle: 'Missing score',
  missingScoreMessage: 'Choose a score first.',
}
```

Score dropdown options skal være præcis:

```ts
[
  { value: 1, label: 'Very difficult today' },
  { value: 2, label: 'A little difficult today' },
  { value: 3, label: 'Okay today' },
  { value: 4, label: 'Good today' },
  { value: 5, label: 'Very good today' },
]
```

Info-knap:

- Vis `ⓘ` ved siden af `How did it go?`.
- Accessibility label: `Show info in feedback score`.
- Info modal titel: `How to give your feedback score`.
- Info modal linjer:

```text
Choose a focal point in the library that you would like to improve.
After training, you give yourself a score for how well you did on the focal point.
Be honest. It helps you the most.
It is not a competition with others. It is your own development.
If you set the score too high, you may change focus too early.
Stay with the same focus point until you truly master it.
```

Button-state skal matche iOS:

- Hvis feedback ikke er besvaret:
  - Kræv score, hvis `enableScore=true`.
  - Primær knap: `Mark as completed`.
- Hvis feedback allerede er besvaret og intet er ændret:
  - Primær knap: `Mark as not completed`.
- Hvis feedback allerede er besvaret og brugeren ændrer score/note:
  - Primær knap: `Opdater score`.
- Hvis score mangler og score er enabled:
  - Vis alert: `Missing score` / `Choose a score first.`

Luk-adfærd:

- Hvis der er usavede ændringer, vis confirm:
  - Titel: `leave without saving?`
  - Body: `Your changes will not be saved.`
  - Knapper: `Stay`, `Leave`

## Feedback Konfiguration

Når feedback-modal åbnes, hent template config:

```ts
const { data: template } = await supabase
  .from('task_templates')
  .select(`
    id,
    after_training_feedback_enable_score,
    after_training_feedback_score_explanation,
    after_training_feedback_enable_note
  `)
  .eq('id', feedbackTemplateId)
  .maybeSingle();

const config = {
  enableScore: template?.after_training_feedback_enable_score ?? true,
  scoreExplanation: trimOrNull(template?.after_training_feedback_score_explanation),
  enableNote: template?.after_training_feedback_enable_note ?? true,
};
```

Hvis template ikke kan hentes:

```ts
{
  enableScore: true,
  scoreExplanation: null,
  enableNote: true
}
```

## Feedback Owner / Hvem Gemmes Feedback For?

iOS gemmer feedback for den indloggede bruger. I klubmodulet er der target-kontekst, så Base44 skal være eksplicit.

Regler:

- Hvis `targetType = member`, gem feedback med:
  - `user_id = targetId`
- Hvis `targetType = team`, må Base44 ikke gætte bruger.
  - Vis en spiller-vælger i modalens start eller før modal åbnes.
  - `user_id = selectedPlayerUserId`
  - Hvis der kun er én relevant spiller, må den forvælges.
- Hvis den indloggede bruger fuldfører sin egen opgave, er `user_id = session.user.id`.
- Gem aldrig feedback på klubadminens user id, hvis klubadmin er ved at fuldføre en spillers feedback-opgave.

Hvis RLS forhindrer klubadmin/coach i at skrive feedback på vegne af den valgte spiller, skal Base44 bruge en service-backed Edge Function med klubadgangskontrol.

## Activity ID Til Feedback

`task_template_self_feedback.activity_id` er ikke altid det samme som aktivitetens mirror `id`.

Regler:

- Intern aktivitet:
  - `feedbackActivityId = activities.id`
- Ekstern aktivitet:
  - `feedbackActivityId = events_external.id`
  - Brug `activity.externalEventRowId` fra mirror, hvis det findes.
  - Hvis mirror kun har `events_local_meta.id`, slå op:

```ts
const { data: meta } = await supabase
  .from('events_local_meta')
  .select('id, external_event_id')
  .eq('id', activity.id)
  .maybeSingle();

const feedbackActivityId = meta?.external_event_id;
```

Baggrund: `task_template_self_feedback.activity_id` valideres mod `activities.id` eller `events_external.id`. Brug ikke `events_local_meta.id` som endelig feedback activity id.

## Hydrate Eksisterende Feedback

Når feedback-modal åbnes, skal den udfyldes med eksisterende score/note.

Find:

- `feedbackUserId` efter reglerne ovenfor.
- `feedbackTemplateId`:
  - `task.feedbackTemplateId`
  - fallback: `task.feedback_template_id`
  - fallback: marker i `description` eller `title`
  - fallback: `task.taskTemplateId`
- `taskInstanceId`:
  - `task.id` hvis det er en UUID.
  - ellers `feedbackTemplateId`.
- `feedbackActivityId` efter reglerne ovenfor.

Læs:

```ts
const { data: feedbackRows } = await supabase
  .from('task_template_self_feedback')
  .select('*')
  .eq('user_id', feedbackUserId)
  .eq('task_template_id', feedbackTemplateId)
  .eq('activity_id', feedbackActivityId)
  .order('created_at', { ascending: false });
```

Vælg række:

1. Først række hvor `task_instance_id = task.id`.
2. Ellers nyeste række for samme `activity_id + task_template_id`.
3. Ellers tom modal.

Initial state:

```ts
initialScore = normalizeFivePointScore(selectedFeedback?.rating);
initialNote = selectedFeedback?.note ?? '';
```

Hvis `task.completed=false` og der ikke findes feedback med rating/note, skal modal starte tom.

## Write: Gem Feedback-Opgave Som Fuldført

Når brugeren trykker `Mark as completed` eller `Opdater score`:

1. Valider score, hvis `enableScore=true`.
2. Upsert feedback i `task_template_self_feedback`.
3. Markér den konkrete feedback task-row som `completed=true`.
4. Refetch mirror.

Payload til `task_template_self_feedback`:

```ts
const payload = {
  user_id: feedbackUserId,
  task_template_id: feedbackTemplateId,
  task_instance_id: taskInstanceId,
  activity_id: feedbackActivityId,
  rating: enableScore ? normalizeFivePointScore(score) : null,
  note: enableNote && note.trim().length ? note.trim() : null,
};

const { data: savedFeedback } = await supabase
  .from('task_template_self_feedback')
  .upsert(payload, {
    onConflict: 'user_id,activity_id,task_instance_id',
  })
  .select()
  .single();
```

Efter upsert skal dubletter ryddes som appen gør:

```ts
await supabase
  .from('task_template_self_feedback')
  .delete()
  .eq('user_id', feedbackUserId)
  .eq('task_template_id', feedbackTemplateId)
  .eq('activity_id', feedbackActivityId)
  .neq('id', savedFeedback.id);

if (taskInstanceId !== feedbackTemplateId) {
  await supabase
    .from('task_template_self_feedback')
    .delete()
    .eq('user_id', feedbackUserId)
    .eq('task_template_id', feedbackTemplateId)
    .eq('task_instance_id', taskInstanceId)
    .neq('activity_id', feedbackActivityId);
}
```

Markér feedback task-row completed:

```ts
if (activity.sourceType === 'internal') {
  await supabase
    .from('activity_tasks')
    .update({
      completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)
    .eq('activity_id', activity.id);
}

if (activity.sourceType === 'external') {
  await supabase
    .from('external_event_tasks')
    .update({
      completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)
    .eq('local_meta_id', activity.id);
}
```

Hvis task-row update ikke matcher nogen rækker, skal der vises fejl. Feedback og task completion bør helst gemmes i samme Edge Function, så de ikke kommer ud af sync.

## Write: Markér Feedback-Opgave Som Ikke Fuldført

Når feedback allerede er besvaret og brugeren trykker `Mark as not completed`:

1. Upsert feedback-række med `rating=null` og `note=null`.
2. Markér feedback task-row som `completed=false`.
3. Refetch mirror.

Appen hard-deleter ikke feedback-rækken i clear-flowet; den upserter tom feedback, så seneste status ikke længere tæller som besvaret.

```ts
await supabase
  .from('task_template_self_feedback')
  .upsert(
    {
      user_id: feedbackUserId,
      task_template_id: feedbackTemplateId,
      task_instance_id: taskInstanceId,
      activity_id: feedbackActivityId,
      rating: null,
      note: null,
    },
    {
      onConflict: 'user_id,activity_id,task_instance_id',
    }
  );

if (activity.sourceType === 'internal') {
  await supabase
    .from('activity_tasks')
    .update({
      completed: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)
    .eq('activity_id', activity.id);
}

if (activity.sourceType === 'external') {
  await supabase
    .from('external_event_tasks')
    .update({
      completed: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id)
    .eq('local_meta_id', activity.id);
}
```

## Foreslået Edge Function: `completeClubActivityTask`

Brug denne hvis almindelig Supabase client ikke har RLS-adgang til at update task rows på vegne af klubmodulet.

Body:

```ts
{
  clubId: string;
  targetType: 'member' | 'team';
  targetId: string;
  sourceType: 'internal' | 'external';
  activityId: string; // activities.id eller events_local_meta.id
  taskId: string;
  completed: boolean;
}
```

Authorization:

- Platform admin: må fuldføre alle opgaver i klubben.
- Club owner/admin: må fuldføre alle opgaver i klubben.
- Coach: må kun fuldføre egne, linkede spilleres eller egne holds opgaver.
- Player: ingen klubmodul-admin adgang.

Handling:

- Validér at activity/task hører til `clubId` og `targetId`.
- Update `activity_tasks.completed` eller `external_event_tasks.completed`.
- Returnér opdateret task id og completed status.

Response:

```ts
{
  success: true;
  data: {
    taskId: string;
    completed: boolean;
    sourceType: 'internal' | 'external';
  };
}
```

## Foreslået Edge Function: `completeClubFeedbackTask`

Brug denne til feedback-opgaver. Den bør udføre feedback-upsert og task-row update i én server-side handling.

Body:

```ts
{
  clubId: string;
  targetType: 'member' | 'team';
  targetId: string;
  feedbackUserId: string;
  sourceType: 'internal' | 'external';
  activityId: string;          // activities.id eller events_local_meta.id fra mirror
  externalEventRowId?: string; // events_external.id ved external
  taskId: string;
  feedbackTemplateId: string;
  taskInstanceId: string;
  completed: boolean;
  rating: number | null;
  note: string | null;
}
```

Server-side normalisering:

- `rating` skal være `1-5` eller `null`.
- `note` trimmes; tom note gemmes som `null`.
- Hvis `completed=true` og template kræver score, skal `rating` være sat.
- Hvis `sourceType=external`, resolve `feedbackActivityId` til `events_external.id`.
- Hvis `sourceType=internal`, `feedbackActivityId = activities.id`.

Handling ved `completed=true`:

- Upsert `task_template_self_feedback` med conflict `user_id,activity_id,task_instance_id`.
- Ryd dubletter.
- Update task row `completed=true`.

Handling ved `completed=false`:

- Upsert tom feedback-række med `rating=null`, `note=null`.
- Update task row `completed=false`.

Response:

```ts
{
  success: true;
  data: {
    taskId: string;
    feedbackId: string | null;
    feedbackUserId: string;
    feedbackActivityId: string;
    feedbackTemplateId: string;
    taskInstanceId: string;
    completed: boolean;
    rating: number | null;
    note: string | null;
  };
}
```

## RLS Og Sikkerhed

Direkte client writes må kun bruges, hvis RLS tillader dem.

Kendte RLS-forhold:

- `task_template_self_feedback` tillader brugerens egne rows og nogle admin-player relationer.
- Klubadmin/coach adgang via klubmedlemskab er ikke nødvendigvis det samme som RLS adgang.
- Service role må aldrig eksponeres i Base44/webklienten.

Hvis Base44 arbejder på vegne af en spiller eller et hold, er Edge Function-løsningen den sikreste.

Edge Functions skal genbruge klubadgangskontrol fra:

- `supabase/functions/_shared/clubActivities.ts`
- `supabase/functions/_shared/clubAdmin.ts`

## Team Target UX

Når `targetType=team`, er feedback per spiller.

Krav:

- Normal task completion på team-task må gerne toggles direkte på task-row.
- Feedback task completion kræver `feedbackUserId`.
- Vis spiller-vælger i feedback-modal:
  - Label: `Spiller`
  - Vælg mellem aktive teammedlemmer.
  - Hvis der findes eksisterende `feedbackEntries`, vis status per spiller.
- Når en spiller vælges, hydrer modal med den spillers eksisterende score/note.
- Gem feedback med `user_id = valgt spiller`.
- Refetch mirror efter gem.

Base44 må ikke gemme team-feedback med klubadminens user id, medmindre klubadmin faktisk er valgt som feedback-user.

## Statusvisning I Opgavelisten

Opgavelisten i aktivitetsdetaljen skal vise:

- Almindelig opgave:
  - completed checkbox/status ud fra `task.completed`.
- Feedback-opgave:
  - completed hvis `task.completed=true` eller seneste feedback for relevant bruger har `rating` eller `note`.
  - ved team target: vis evt. `2/8 besvaret` for feedback-opgaver.

Klikadfærd:

- Almindelig opgave -> `TaskDetailsModal`.
- Feedback-opgave -> `TaskScoreNoteModal`.
- Checkbox på feedback-opgave må ikke toggle uden modal.

## Fejltekster

Brug disse fejltekster:

- `Can't open` / `Missing required parameters (activityId/templateId).`
- `Du er ikke logget ind.`
- `Missing score` / `Choose a score first.`
- `Failed to save` / `Feedback could not be saved. Try again.`
- `Could not remove` / `Feedback could not be removed. Try again.`
- `Task completion update matched no rows.`

Ved web/dansk UI kan der laves danske labels, men modalens adfærd og button-state skal matche iOS.

## Refetch Og Optimistic UI

Base44 må gerne opdatere UI optimistisk, men efter server success skal der altid refetches:

```ts
await supabase.functions.invoke('getClubActivityMirror', {
  body: {
    clubId,
    targetType,
    targetId,
    dateFrom,
    dateTo,
  },
});
```

Hvis save fejler:

- Rul optimistic status tilbage.
- Vis fejl.
- Lad modal blive åben, undtagen hvis clear-flow allerede har lukket den efter iOS-paritet. I så fald skal refetch rette UI tilbage.

## Acceptkriterier

- Almindelige opgaver kan åbnes fra klubmodulet i en modal svarende til iOS-appens `TaskDetailsModal`.
- Almindelige opgaver kan markeres fuldført og ikke fuldført.
- Almindelige interne opgaver opdaterer `activity_tasks.completed`.
- Almindelige eksterne opgaver opdaterer `external_event_tasks.completed`.
- Feedback-opgaver åbner score/note-modal, ikke almindelig task modal.
- Feedback-modal viser samme score options som iOS.
- Feedback-modal respekterer template config for score og note.
- Feedback-modal kan gemme score/note og markere opgaven fuldført.
- Feedback-modal kan markere opgaven som ikke fuldført.
- Feedback gemmes i `task_template_self_feedback` med korrekt `user_id`, `activity_id`, `task_template_id` og `task_instance_id`.
- Eksterne feedback-opgaver bruger `events_external.id` som feedback `activity_id`.
- Team-feedback kræver valgt spiller/feedbackUserId.
- Efter gem/clear refetches `getClubActivityMirror`.
- iOS-appen viser samme completion- og feedbackstatus efter ændringer fra web.

## Manuel Testplan For Base44

1. Log ind som klubadmin i `FC DEMO KLUB`.
2. Åbn klubmodulet og vælg en spiller.
3. Åbn en aktivitet med en almindelig opgave.
4. Åbn opgaven og tryk `Mark as completed`.
5. Bekræft at opgaven står fuldført i web.
6. Åbn samme aktivitet i iOS-appen og bekræft, at opgaven står fuldført.
7. Åbn opgaven igen i web og tryk `Mark as not completed`.
8. Bekræft at status også ændres i iOS.
9. Åbn en aktivitet med feedback-opgave.
10. Klik feedback-opgaven og bekræft, at score/note-modal åbner.
11. Forsøg at gemme uden score, hvis score er enabled, og bekræft fejl.
12. Vælg score og skriv note.
13. Tryk `Mark as completed`.
14. Bekræft at `task_template_self_feedback` har row med korrekt `task_instance_id`.
15. Bekræft at feedback-opgaven står fuldført i web og iOS.
16. Åbn feedback-opgaven igen og bekræft, at score/note er hydreret.
17. Tryk `Mark as not completed`.
18. Bekræft at opgaven ikke længere står fuldført.
19. Test samme flow på en ekstern kalenderaktivitet.
20. Test team target og vælg en spiller, før feedback gemmes.

## Teknisk Testplan

Kør relevante tests efter implementering:

```bash
npm run typecheck
npm run lint
npm test -- __tests__/taskDetailsModal.component.test.tsx __tests__/taskScoreNoteModal.component.test.tsx __tests__/task-feedback-note.screen.test.tsx __tests__/clubActivitiesBackend.test.ts
```

Hvis der laves nye Edge Functions:

```bash
npm test -- __tests__/clubActivitiesBackend.test.ts __tests__/clubAdminBackend.test.ts
```

Maestro skal ikke køres, medmindre det specifikt bliver bedt om.
