# Base44 Prompt: Åbn Og Rediger Aktiviteter Og Opgaver I Klubmodul

Brug denne prompt i Base44 for web-klubmodulet. Målet er, at klubadmins, klubtrænere og platform admins kan åbne og redigere aktiviteter og opgaver fra web, så ændringerne vises og fungerer i mobilappen på præcis samme måde som når de håndteres i appen.

Denne prompt bygger videre på `docs/base44-club-create-activities-tasks-prompt.md`. Den handler om åbning, detaljevisning, redigering og media-upload på opgaver.

## Mål

Udvid klubmodulet med:

- Klik/åbn aktivitet fra klubmodulets aktivitetsliste eller kalender.
- Rediger aktivitetens felter i samme logik som appens aktivitetsdetaljer.
- Klik/åbn opgaver på en aktivitet.
- Rediger lokale aktivitetsopgaver og opgaveskabeloner.
- Upload media til opgaver: PNG, JPG/JPEG og PDF. Behold også eksisterende video-support, så opgaver kan have flere videoer, billeder og PDF'er.
- Vis samme swipe-funktion som appen, så brugeren kan swipe vandret gennem flere videoer, billeder og PDF'er på en opgave.

Alt skal gemmes i Supabase-tabellerne, som appen allerede læser. Brug ikke Base44-interne entities som source of truth.

## Source Of Truth I Appen

Brug disse app-filer som kontrakt:

- Aktivitetsdetaljer og edit-flow: `app/activity-details.tsx`
- Aktivitets-write service: `services/activityService.ts`
- Opgaveskabelon-write service: `services/taskService.ts`
- Lokal aktivitetsopgave-modal: `components/CreateActivityTaskModal.tsx`
- Opgavedetalje-modal: `components/TaskDetailsModal.tsx`
- Swipe media viewer: `components/SwipeVideoPlayer.tsx`
- Media-normalisering: `utils/taskVideos.ts`
- Upload til Supabase Storage: `utils/taskVideoUpload.ts`
- Klubaktivitet mirror endpoint: `supabase/functions/_shared/clubActivities.ts`

Vigtigt:

- Brug `task_templates`, `activity_tasks` og `external_event_tasks`. Brug ikke `public.tasks`.
- Brug `video_urls` som liste for flere medier. Brug `video_url` som legacy/primær URL, når kolonnen findes.
- Gem ikke media-links i `description` som primær løsning.
- Uploadede filer skal ligge i samme Supabase Storage bucket som appen: `drill-videos`.

## Eksisterende Klub Endpoints

Kald Supabase Edge Functions via:

```ts
await supabase.functions.invoke('<functionName>', { body });
```

Brug disse eksisterende endpoints:

- `getCurrentUserClubContext`
  - body: `{}`
  - bruges til brugerens klubber, rolle og platform-admin status.
- `getClubActivityFilters`
  - body: `{ "clubId": "<uuid>" }`
  - bruges til target picker for medlem/hold.
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

- `getClubActivityCategories`
  - body: `{ "clubId": "<uuid>" }`
  - bruges til kategorier i edit-formularer.
- `createClubActivityCategory`, `updateClubActivityCategory`, `deleteClubActivityCategory`
  - bruges hvis webmodulet allerede tillader kategoriadministration fra samme flow.
- `getClubMemberManagementData`
  - body: `{ "clubId": "<uuid>" }`
  - kan bruges til medlemmer, hold og coachrelationer, hvis edit-flowet skal vise kontekst.

Efter hver gem-handling skal `getClubActivityMirror` refetches for samme `clubId`, `targetType`, `targetId`, `dateFrom`, `dateTo`.

## Påkrævet Udvidelse Af Mirror Response

`getClubActivityMirror` henter allerede `activity_tasks (*)` og `external_event_tasks (*)`, men den normaliserede `ClubActivityTaskMirror` skal udvides, så Base44 kan vise og redigere media korrekt.

Tilføj disse felter til hver aktivitet:

```ts
{
  id: string;
  sourceType: 'internal' | 'external';
  seriesId: string | null;          // fra activities.series_id
  seriesInstanceDate: string | null; // fra activities.series_instance_date
  title: string;
  activityDate: string;
  activityTime: string;
  activityEndDate: string | null;
  activityEndTime: string | null;
  location: string | null;
  ownerUserId: string | null;
  playerId: string | null;
  teamId: string | null;
  intensity: number | null;
  intensityEnabled: boolean;
  intensityNote: string | null;
  category: {
    id: string | null;
    name: string | null;
    color: string | null;
    emoji: string | null;
  } | null;
  tasks: ClubActivityTaskMirror[];
}
```

Tilføj disse felter til hver opgave:

```ts
{
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  reminderMinutes: number | null;
  videoUrl: string | null;
  videoUrls: string[];
  video_url: string | null;
  video_urls: string[] | null;
  afterTrainingEnabled: boolean;
  afterTrainingDelayMinutes: number | null;
  taskDurationEnabled: boolean;
  taskDurationMinutes: number | null;
  feedbackTemplateId: string | null;
  taskTemplateId: string | null;
  isFeedbackTask: boolean;
  subtasks: Array<{
    id: string;
    title: string;
    completed: boolean;
    sortOrder: number;
  }>;
  feedback: unknown | null;
  feedbackEntries: unknown[];
}
```

I `attachTasks` i `supabase/functions/_shared/clubActivities.ts` skal media normaliseres sådan:

```ts
const mediaUrls = normalizeTaskMediaUrls([
  record.video_urls,
  record.video_url,
]);

return {
  ...
  videoUrl: mediaUrls[0] ?? null,
  videoUrls: mediaUrls,
  video_url: mediaUrls[0] ?? null,
  video_urls: mediaUrls.length ? mediaUrls : null,
  isFeedbackTask:
    record.is_feedback_task === true ||
    Boolean(record.feedback_template_id) ||
    String(record.title ?? '').toLowerCase().startsWith('feedback på') ||
    String(record.title ?? '').toLowerCase().startsWith('feedback pa'),
};
```

Lav `normalizeTaskMediaUrls` med samme regler som appens `utils/taskVideos.ts`:

- Input kan være string, array eller JSON-string array.
- Trim tomme værdier væk.
- Fjern dubletter case-insensitive.
- Tillad kun:
  - video-URL'er, som appen kan afspille.
  - `jpg`, `jpeg`, `png`.
  - `pdf`.
- Returnér altid et array.

## UI: Åbn Aktivitet

Når brugeren klikker på en aktivitet i klubmodulet, skal der åbnes en detaljevisning, ikke en ny landingpage.

Detaljevisningen skal vise:

- Titel.
- Dato, starttid og sluttid.
- Lokation.
- Kategori med farve og emoji.
- Intensitet, hvis aktiv.
- Opgaver på aktiviteten.
- Tydelig markering af ekstern kalenderaktivitet, hvis `sourceType = external`.
- Handling: `Rediger aktivitet`.
- Handling på hver normal opgave: `Åbn` og `Rediger`.

Design:

- Match appens rolige, kompakte aktivitetsdetalje-layout.
- Brug kategoriens farve som accent, ikke som helsidefarve.
- Opgaver vises som scannable rækker med titel, status, reminder og media-indikator.
- Hvis en opgave har flere medier, vis en lille tekst som `3 filer - swipe`.
- Brug dansk UI-tekst i webmodulet.

Tekster:

- `Rediger aktivitet`
- `Gem ændringer`
- `Annuller`
- `Aktiviteten er opdateret`
- `Aktiviteten kunne ikke opdateres`
- `Opgaver`
- `Ingen opgaver på aktiviteten`

## UI: Rediger Aktivitet

Formularen skal genbruge samme felter og validering som appen:

- `Titel`
  - påkrævet for interne aktiviteter.
- `Kategori`
  - påkrævet.
- `Dato`
  - påkrævet for interne aktiviteter.
  - format `YYYY-MM-DD`.
- `Starttid`
  - påkrævet for interne aktiviteter.
  - format `HH:mm`.
- `Sluttid`
  - valgfri.
  - format `HH:mm`.
  - hvis sat, skal sluttid være efter starttid.
- `Lokation`
  - valgfri.
  - hvis tom ved intern aktivitet, gem samme fallback som appen bruger i create-flowet, typisk `No location`.
- `Intensitet`
  - toggle `intensity_enabled`.
  - score `1-5`.
  - hvis toggle slukkes, gem `intensity = null`, `intensity_enabled = false` og ryd `intensity_note`.
- `Intensitetsnote`
  - valgfri tekst.

For interne gentagende aktiviteter med `seriesId`:

- Vis valg:
  - `Kun denne aktivitet`
  - `Hele serien`
- `Kun denne aktivitet` opdaterer kun rækken i `activities`.
- `Hele serien` opdaterer `activity_series` og alle `activities` med samme `series_id`.
- Dato ændres kun for enkeltaktivitet. Hele serien ændrer fælles felter som titel, lokation, kategori, starttid og sluttid.

For eksterne aktiviteter:

- Redigér ikke den originale eksterne kalenderbegivenhed.
- Tillad som minimum kategori, intensitet og intensitetsnote.
- Titel kan kun gemmes som lokal override i `events_local_meta.local_title_override`, hvis produktet eksplicit ønsker det i webflowet.
- Dato, tid og lokation bør vises som read-only for eksterne events.

## Write: Rediger Intern Enkeltaktivitet

Tabel: `public.activities`

Update:

```ts
await supabase
  .from('activities')
  .update({
    title,
    location,
    activity_date: date,              // YYYY-MM-DD
    activity_time: startTime,         // HH:mm
    activity_end_time: endTime ?? null,
    category_id: categoryId,
    intensity: intensityEnabled ? intensity : null,
    intensity_enabled: intensityEnabled,
    intensity_note: intensityEnabled ? intensityNoteOrNull : null,
    manually_set_category: true,
    category_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq('id', activityId);
```

Hvis Base44 skriver med almindelig authenticated client, må den kun skrive rækker, som RLS tillader. Hvis klubadmin/coach skal redigere aktiviteter ejet af andre klubbrugere og RLS blokerer, skal Base44 bruge en service-backed Edge Function. Service role må aldrig ligge i webklienten.

## Write: Rediger Hele Serien

Tabel: `public.activity_series`

Update `activity_series`:

```ts
await supabase
  .from('activity_series')
  .update({
    title,
    location,
    category_id: categoryId,
    activity_time: startTime,
    activity_end_time: endTime ?? null,
    intensity_enabled: intensityEnabled,
    updated_at: new Date().toISOString(),
  })
  .eq('id', seriesId);
```

Update alle aktiviteter i serien:

```ts
await supabase
  .from('activities')
  .update({
    title,
    location,
    category_id: categoryId,
    activity_time: startTime,
    activity_end_time: endTime ?? null,
    intensity: intensityEnabled ? intensity : null,
    intensity_enabled: intensityEnabled,
    intensity_note: intensityEnabled ? intensityNoteOrNull : null,
    manually_set_category: true,
    category_updated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq('series_id', seriesId);
```

Hvis `intensityEnabled = false`, skal både `activity_series.intensity_enabled` og alle berørte `activities.intensity_enabled` være false, og `activities.intensity` skal være null.

## Write: Rediger Ekstern Aktivitet

Tabel: `public.events_local_meta`

`activity.id` fra mirror er normalt `events_local_meta.id`, når metadata findes. Hvis der ikke findes metadata, skal der oprettes en `events_local_meta`-række for den eksterne event, præcis som appens `updateActivitySingle(..., isExternal=true)` gør.

Update:

```ts
await supabase
  .from('events_local_meta')
  .update({
    category_id: categoryId,
    manually_set_category: true,
    category_updated_at: new Date().toISOString(),
    intensity: intensityEnabled ? intensity : null,
    intensity_enabled: intensityEnabled,
    intensity_note: intensityEnabled ? intensityNoteOrNull : null,
    last_local_modified: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  .eq('id', localMetaId);
```

Hvis titel-overwrite aktiveres i produktet:

```ts
local_title_override: title
```

Brug ikke update direkte på `events_external` fra klubmodulet.

## Foreslåede Edge Functions Hvis RLS Blokerer

Hvis Base44 ikke kan udføre writes sikkert med authenticated client, skal der laves Edge Functions med service client og eksisterende klubadgangskontrol fra `supabase/functions/_shared/clubActivities.ts`.

### `updateClubActivity`

Body:

```ts
{
  clubId: string;
  sourceType: 'internal' | 'external';
  activityId: string;
  scope: 'single' | 'series';
  seriesId?: string | null;
  targetType: 'member' | 'team';
  targetId: string;
  updates: {
    title?: string;
    categoryId?: string;
    date?: string;
    startTime?: string;
    endTime?: string | null;
    location?: string | null;
    intensityEnabled?: boolean;
    intensity?: number | null;
    intensityNote?: string | null;
  };
}
```

Authorization:

- Platform admin: må redigere alle klubaktiviteter.
- Club owner/admin: må redigere alle klubaktiviteter.
- Coach: må kun redigere egne og linkede spilleres aktiviteter samt hold, hvor coachen har adgang.
- Player: ingen klubmodul edit-adgang.

Response:

```ts
{
  success: true;
  data: {
    activityId: string;
    sourceType: 'internal' | 'external';
    updatedScope: 'single' | 'series';
  };
}
```

### `updateClubActivityTask`

Body:

```ts
{
  clubId: string;
  sourceType: 'internal' | 'external';
  activityId: string; // activities.id eller events_local_meta.id
  taskId: string;
  updates: {
    title: string;
    description: string;
    reminderMinutes: number | null;
    mediaUrls: string[];
    subtasks?: Array<{ title: string }>;
    afterTrainingEnabled: boolean;
    afterTrainingDelayMinutes: number | null;
    taskDurationEnabled: boolean;
    taskDurationMinutes: number | null;
  };
}
```

Response:

```ts
{
  success: true;
  data: {
    taskId: string;
    taskTemplateId: string | null;
    mediaUrls: string[];
  };
}
```

### `updateClubTaskTemplate`

Body:

```ts
{
  clubId: string;
  targetType: 'member' | 'team';
  targetId: string;
  taskTemplateId: string;
  updates: {
    title: string;
    description: string;
    categoryIds: string[];
    reminderMinutes: number | null;
    mediaUrls: string[];
    subtasks: Array<{ title: string }>;
    afterTrainingEnabled: boolean;
    afterTrainingDelayMinutes: number | null;
    afterTrainingFeedbackEnableScore: boolean;
    afterTrainingFeedbackScoreExplanation: string | null;
    afterTrainingFeedbackEnableNote: boolean;
    taskDurationEnabled: boolean;
    taskDurationMinutes: number | null;
  };
}
```

Response:

```ts
{
  success: true;
  data: {
    taskTemplateId: string;
  };
}
```

## UI: Åbn Opgave

Når brugeren klikker på en normal opgave:

- Åbn en modal/panel svarende til appens `TaskDetailsModal`.
- Vis titel, description, reminder og media.
- Hvis opgaven mangler description eller media, men har `taskTemplateId` eller `feedbackTemplateId`, hydrer fra `task_templates`.
- Brug samme fallback som appens `hydrateTaskForModal`:

```ts
const { data } = await supabase
  .from('task_templates')
  .select('id, title, description, video_url, video_urls')
  .eq('id', templateId)
  .maybeSingle();
```

Normalisering:

- Lokal opgaveværdi vinder over template-værdi.
- Hvis lokal description er tom, brug template description.
- Hvis lokal `video_urls` er tom, brug template `video_urls` eller `video_url`.
- Vis aldrig rå media-link to gange.

Feedback-opgaver:

- Hvis `isFeedbackTask = true`, `feedbackTemplateId != null`, eller titlen starter med `Feedback på`/`Feedback pa`, skal opgaven ikke redigeres som normal lokal opgave.
- Vis den som feedback-opgave eller read-only, med link/handling til feedbackvisning hvis klubmodulet har det.

## UI: Swipe Media Viewer

Opgaver skal have samme mediaoplevelse som appens `SwipeVideoPlayer`.

Krav:

- Vandret swipe/paging gennem alle media-URL'er.
- Videoer afspilles i en video-player.
- Billeder vises med `object-fit: contain` på sort baggrund.
- PDF vises som slide med PDF-ikon/label og åbnes i ny fane ved klik.
- Ved mere end én fil:
  - vis counter, fx `1/3`.
  - vis dots nederst.
  - vis hint, fx `Swipe for næste fil`.
- På desktop må der gerne tilføjes pil-knapper, men swipe/touch skal stadig virke.
- Brug et stabilt mediafelt, så layout ikke hopper når brugeren swiper.
- Hvis ingen media findes, skjul mediaområdet.

Media-URL'er kommer fra:

```ts
normalizeTaskMediaUrls([
  task.videoUrls,
  task.video_urls,
  task.videoUrl,
  task.video_url,
]);
```

## UI: Rediger Opgave På Aktivitet

Tilføj `Rediger` på normale opgaver i aktivitetens detaljevisning.

Felter:

- `Titel`
  - påkrævet.
- `Beskrivelse`
  - valgfri.
- `Reminder`
  - valgfri antal minutter før.
- `Media`
  - liste over eksisterende media.
  - upload ny fil.
  - indsæt media-link.
  - fjern media fra listen.
  - sortering via drag/drop eller op/ned-knapper.
- `Underopgaver`
  - understøttes for interne `activity_tasks`.
  - tomme underopgaver gemmes ikke.
- `Feedback efter træning`
  - toggle.
  - delay minutes.
- `Varighed`
  - toggle.
  - minutter.

Tekster:

- `Rediger opgave`
- `Gem opgave`
- `Tilføj media`
- `Upload billede, video eller PDF`
- `Indsæt media-link`
- `Fjern`
- `Opgaven er opdateret`
- `Opgaven kunne ikke opdateres`

Validering:

- Titel må ikke være tom.
- Hvis upload kører, må gem ikke kunne klikkes.
- Media-link skal være en understøttet video, JPG, PNG eller PDF.
- `taskDurationMinutes` og `afterTrainingDelayMinutes` skal være heltal mellem 0 og 600.

## Write: Rediger Lokal Aktivitetsopgave

Interne aktiviteter bruger `public.activity_tasks`.
Eksterne aktiviteter bruger `public.external_event_tasks`.

Linkkolonne:

- Intern: `activity_id = activity.id`
- Ekstern: `local_meta_id = activity.id`

Før update skal Base44 bygge media payload:

```ts
function buildTaskMediaPayload(mediaUrls: unknown[]) {
  const urls = normalizeTaskMediaUrls(mediaUrls);
  return {
    video_url: urls[0] ?? null,
    video_urls: urls.length ? urls : null,
    videoUrl: urls[0] ?? null,
    videoUrls: urls,
  };
}
```

Update payload:

```ts
const mediaPayload = buildTaskMediaPayload(mediaUrls);

const taskPayload = {
  title: title.trim(),
  description: description.trim(),
  reminder_minutes: reminderMinutes,
  video_url: mediaPayload.video_url,
  video_urls: mediaPayload.video_urls,
  after_training_enabled: afterTrainingEnabled,
  after_training_delay_minutes: afterTrainingEnabled ? afterTrainingDelayMinutes : null,
  task_duration_enabled: taskDurationEnabled,
  task_duration_minutes: taskDurationEnabled ? taskDurationMinutes : null,
  updated_at: new Date().toISOString(),
};
```

Intern update:

```ts
await supabase
  .from('activity_tasks')
  .update(taskPayload)
  .eq('id', taskId)
  .eq('activity_id', activityId);
```

Ekstern update:

```ts
await supabase
  .from('external_event_tasks')
  .update(taskPayload)
  .eq('id', taskId)
  .eq('local_meta_id', localMetaId);
```

Hvis en gammel database mangler enkelte kolonner, må Base44 retry uden de manglende local option columns, men i nuværende schema findes `video_urls`, `after_training_enabled`, `after_training_delay_minutes`, `task_duration_enabled` og `task_duration_minutes`.

## Sync Lokal Task Template

Når en lokal aktivitetsopgave oprettes eller redigeres, bruger appen også en lokal `task_templates`-række med:

```ts
source_folder: 'activity_local_task'
```

Ved redigering af en lokal aktivitetsopgave:

1. Find eksisterende `task_template_id`.
2. Hvis template findes, ejes af samme bruger og `source_folder = 'activity_local_task'`, opdater den.
3. Ellers opret en ny lokal template og sæt `task_template_id` på opgaven.

Template payload:

```ts
{
  user_id: ownerUserId,
  title,
  description,
  reminder_minutes: reminderMinutes,
  video_url: mediaPayload.video_url,
  video_urls: mediaPayload.video_urls,
  after_training_enabled: afterTrainingEnabled,
  after_training_delay_minutes: afterTrainingEnabled ? afterTrainingDelayMinutes : null,
  after_training_feedback_enable_score: true,
  after_training_feedback_score_explanation: null,
  after_training_feedback_enable_note: true,
  after_training_feedback_enable_intensity: true,
  task_duration_enabled: taskDurationEnabled,
  task_duration_minutes: taskDurationEnabled ? taskDurationMinutes : null,
  source_folder: 'activity_local_task',
  updated_at: new Date().toISOString(),
}
```

Hvis der oprettes ny template, skal `user_id` være den authenticated actor, medmindre en service-backed Edge Function eksplicit validerer og skriver på vegne af en klubkontekst.

## Sync Underopgaver

Kun interne `activity_tasks` har underopgaver via `activity_task_subtasks`.

Ved gem:

```ts
await supabase
  .from('activity_task_subtasks')
  .delete()
  .eq('activity_task_id', taskId);

const rows = subtasks
  .map((item, index) => ({
    activity_task_id: taskId,
    title: item.title.trim(),
    sort_order: index,
  }))
  .filter((row) => row.title.length > 0);

if (rows.length) {
  await supabase.from('activity_task_subtasks').insert(rows);
}
```

For `external_event_tasks` skal Base44 ikke forsøge at skrive underopgaver, medmindre der senere indføres en separat ekstern subtask-tabel.

## Sync Feedback Efter Træning

Hvis `afterTrainingEnabled` slås til/fra på en lokal aktivitetsopgave, skal tilhørende feedback-opgave synkes på samme måde som appens `CreateActivityTaskModal`.

Regler:

- Feedback-opgaven ligger i samme tabel som parent-opgaven:
  - `activity_tasks` for intern aktivitet.
  - `external_event_tasks` for ekstern aktivitet.
- Feedback-opgaven har:
  - `title = Feedback på <taskTitle>`
  - `description` med template marker, så appen kan finde feedback-template.
  - `reminder_minutes = afterTrainingDelayMinutes`
  - `task_template_id = null`
  - `feedback_template_id = localTemplateId`
  - `is_feedback_task = true`
- Hvis `afterTrainingEnabled = false`, slet matchende feedback-opgaver.
- Hvis flere gamle feedback-opgaver matcher, behold den ældste/primære og slet dubletter.

Hvis Base44 ikke implementerer feedback-sync, vil appen og web hurtigt komme ud af sync. Derfor skal feedback-sync med i første version.

## UI: Rediger Opgaveskabelon

Hvis klubmodulet har en `Opgaver`-sektion for skabeloner, skal åbning/redigering matche appens `Tasks`-flow.

Felter:

- `Titel`
- `Beskrivelse`
- `Kategorier`
- `Reminder`
- `Media`
- `Underopgaver`
- `Feedback efter træning`
- `Varighed`

Læs:

```ts
await supabase
  .from('task_templates')
  .select(`
    id,
    user_id,
    player_id,
    team_id,
    title,
    description,
    reminder_minutes,
    video_url,
    video_urls,
    source_folder,
    archived_at,
    after_training_enabled,
    after_training_delay_minutes,
    after_training_feedback_enable_score,
    after_training_feedback_score_explanation,
    after_training_feedback_enable_intensity,
    after_training_feedback_enable_note,
    task_duration_enabled,
    task_duration_minutes,
    task_template_categories(category_id),
    task_template_subtasks(id, title, sort_order)
  `);
```

Update `task_templates`:

```ts
await supabase
  .from('task_templates')
  .update({
    title,
    description,
    reminder_minutes: reminderMinutes,
    video_url: mediaPayload.video_url,
    video_urls: mediaPayload.video_urls,
    after_training_enabled: afterTrainingEnabled,
    after_training_delay_minutes: afterTrainingEnabled ? afterTrainingDelayMinutes : null,
    after_training_feedback_enable_score: enableScore,
    after_training_feedback_score_explanation: enableScore ? scoreExplanationOrNull : null,
    after_training_feedback_enable_intensity: afterTrainingEnabled,
    after_training_feedback_enable_note: enableNote,
    task_duration_enabled: taskDurationEnabled,
    task_duration_minutes: taskDurationEnabled ? taskDurationMinutes : null,
    updated_at: new Date().toISOString(),
  })
  .eq('id', taskTemplateId);
```

Replace categories:

```ts
await supabase
  .from('task_template_categories')
  .delete()
  .eq('task_template_id', taskTemplateId);

if (categoryIds.length) {
  await supabase.from('task_template_categories').insert(
    categoryIds.map((categoryId) => ({
      task_template_id: taskTemplateId,
      category_id: categoryId,
    }))
  );
}
```

Replace subtasks:

```ts
await supabase
  .from('task_template_subtasks')
  .delete()
  .eq('task_template_id', taskTemplateId);

if (subtasks.length) {
  await supabase.from('task_template_subtasks').insert(
    subtasks
      .map((subtask, index) => ({
        task_template_id: taskTemplateId,
        title: subtask.title.trim(),
        sort_order: index,
      }))
      .filter((row) => row.title.length > 0)
  );
}
```

Efter template update:

```ts
await supabase.rpc('update_all_tasks_from_template', {
  p_template_id: taskTemplateId,
  p_dry_run: false,
});
```

Dette sikrer, at appens eksisterende aktivitetsopgaver og eksterne event-opgaver synkes med skabelonen.

## Upload: PNG, JPG, PDF Og Video Til Opgaver

Upload skal fungere som appens `utils/taskVideoUpload.ts`.

Storage:

- Bucket: `drill-videos`
- Public bucket.
- Path-format:

```ts
task-videos/<authenticated-user-id>/<safe-file-name>-<timestamp>-<random>.<extension>
```

Brug altid authenticated actor user id i path. Storage-RLS tillader upload til brugerens egen folder:

```sql
bucket_id = 'drill-videos'
and (storage.foldername(name))[1] = 'task-videos'
and (storage.foldername(name))[2] = auth.uid()::text
```

Filtyper:

- PNG: `image/png`, `.png`
- JPG/JPEG: `image/jpeg`, `.jpg`, `.jpeg`
- PDF: `application/pdf`, `.pdf`
- Behold eksisterende videosupport:
  - `video/mp4`, `.mp4`
  - `video/quicktime`, `.mov`
  - `video/x-m4v`, `.m4v`
  - `video/webm`, `.webm`
  - `video/mpeg`, `.mpeg`
  - `video/ogg`, `.ogv`

File input:

```html
<input
  type="file"
  accept="image/png,image/jpeg,application/pdf,video/mp4,video/quicktime,video/webm,.png,.jpg,.jpeg,.pdf,.mp4,.mov,.m4v,.webm,.mpeg,.ogv"
/>
```

Maks filstørrelse:

- 150 MB, samme som appen.

Upload-flow:

```ts
const file = selectedFile;
const extension = inferExtension(file);
const contentType = inferContentType(file, extension);
const path = `task-videos/${session.user.id}/${safeBaseName}-${Date.now()}-${random}.${extension}`;

const { error } = await supabase.storage
  .from('drill-videos')
  .upload(path, file, {
    cacheControl: '3600',
    contentType,
    upsert: false,
  });

if (error) throw error;

const { data } = supabase.storage.from('drill-videos').getPublicUrl(path);
const publicUrl = data.publicUrl;
```

Efter upload:

- Tilføj `publicUrl` til opgavens media-liste.
- Normalisér listen.
- Gem listen i `video_urls`.
- Gem første URL i `video_url`.

Fejltekster:

- `Du skal være logget ind for at uploade filer.`
- `Vælg en JPG, PNG, PDF eller understøttet videofil.`
- `Filen er for stor. Maksimal størrelse er 150 MB.`
- `Filen kunne ikke uploades.`

## Media URL Validering

Base44 skal validere links før gem:

Tillad:

- `https://...mp4`, `mov`, `m4v`, `webm`, `mpeg`, `ogv`.
- YouTube/Instagram/video-links som appens video parser accepterer.
- `https://...jpg`, `jpeg`, `png`.
- `https://...pdf`.
- Supabase public URLs fra `drill-videos`.

Afvis:

- Tomme links.
- Ikke-http(s)-links.
- Ukendte filtyper.
- Dubletter.

Dansk fejl:

```text
Ugyldigt media-link. Brug video, JPG, PNG eller PDF.
```

## Kategori-Regler Ved Edit

Brug samme kategori-regler som create-prompten:

- Kategori er obligatorisk på aktiviteter.
- Når en klub-masterkategori vælges, skal den kategori-id, der gemmes på aktiviteten eller task template, være læsbar i den konkrete target-kontekst.
- Gem ikke blindt en klub-masterkategori på en spilleraktivitet, hvis appen ikke kan læse den for spilleren.
- Brug `getClubActivityCategories` til klubkategorier og find/opret korrekt synlig kopi efter eksisterende klubkategori-flow.

Fejltekst:

```text
Vælg en kategori.
```

## Refetch Og Cache

Efter hver succesfuld update:

1. Luk modal eller vis saved-state.
2. Refetch `getClubActivityMirror` for aktivt target og dato-interval.
3. Opdater eventuelle task template lister, hvis en template er ændret.
4. Undgå stale optimistic state, når media er ændret.

Base44 må gerne vise optimistic UI, men den endelige sandhed skal komme fra Supabase efter refetch.

## Acceptkriterier

- En klubadmin kan åbne en intern aktivitet i klubmodulet.
- En klubadmin kan redigere titel, kategori, dato, tid, sluttid, lokation og intensitet på en intern aktivitet.
- En klubadmin kan vælge `Kun denne aktivitet` eller `Hele serien`, når aktiviteten har `seriesId`.
- En ekstern kalenderaktivitet kan åbnes, og kategori/intensitet kan redigeres via `events_local_meta`.
- En normal opgave kan åbnes fra aktiviteten.
- En normal opgave viser video, billede og PDF i samme swipe-viewer.
- Flere mediafiler kan swipes vandret med counter og dots.
- En opgave kan redigeres med titel, beskrivelse, reminder, media, feedback efter træning og varighed.
- PNG, JPG/JPEG og PDF kan uploades fra web og gemmes i `drill-videos/task-videos/<userId>/...`.
- Uploadede media-URL'er gemmes i `video_urls`, og første URL gemmes i `video_url`.
- Opgaver oprettet/redigeret på web vises korrekt i appen.
- Opgaver redigeret i appen vises korrekt i web.
- Feedback-opgaver bliver ikke fejlagtigt redigeret som normale opgaver.
- Efter gem refetches `getClubActivityMirror`, og UI viser opdaterede data.

## Manuel Testplan For Base44

1. Log ind som klubadmin i `FC DEMO KLUB`.
2. Åbn klubmodulet og vælg en spiller.
3. Åbn en intern aktivitet.
4. Rediger titel, tid, kategori og intensitet.
5. Gem og bekræft, at aktiviteten ændres i weblisten.
6. Åbn samme aktivitet i mobilappen og bekræft samme ændringer.
7. Åbn en aktivitet med opgaver.
8. Åbn en normal opgave og bekræft, at eksisterende video/media vises.
9. Rediger opgaven og upload:
   - én PNG.
   - én JPG/JPEG.
   - én PDF.
10. Tilføj også en eksisterende video-URL.
11. Gem opgaven.
12. Åbn opgaven igen og swipe gennem alle filer.
13. Åbn samme opgave i appen og bekræft, at swipe-viewer viser samme filer.
14. Fjern en mediafil fra web, gem og bekræft, at den ikke længere vises i appen.
15. Rediger en ekstern kalenderaktivitet og skift kategori/intensitet.
16. Bekræft, at original ekstern dato/tid/lokation ikke overskrives.
17. Test en feedback-opgave og bekræft, at den ikke åbnes som normal edit-opgave.

## Teknisk Testplan

Kør relevante tests i repoet efter implementering:

```bash
npm run typecheck
npm run lint
npm test -- __tests__/taskVideos.test.ts __tests__/swipeVideoPlayer.component.test.tsx __tests__/clubActivitiesBackend.test.ts __tests__/taskService.updateTask.category-sync.test.ts
```

Hvis der ændres Edge Functions eller databasekontrakter:

```bash
npm test -- __tests__/clubActivitiesBackend.test.ts __tests__/clubCategoriesBackend.test.ts __tests__/clubAdminBackend.test.ts
```

Maestro skal ikke køres, medmindre det specifikt bliver bedt om.
