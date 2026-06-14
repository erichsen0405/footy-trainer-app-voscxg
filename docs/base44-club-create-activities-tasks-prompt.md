# Base44 Prompt: Opret Aktiviteter Og Opgaver Fra Klubmodul

Brug denne prompt i Base44 for web-klubmodulet. Målet er, at klubadmins, klubtrænere og platform admins kan oprette aktiviteter og opgaver fra web, så de vises og fungerer i mobilappen på samme måde som når de oprettes i appen.

## Mål

Udvid klubmodulet med create-flows for:

- Aktiviteter i en klub-kontekst.
- Opgaveskabeloner, som svarer til appens `Opgaver`-fane.
- Lokale opgaver på en konkret aktivitet, som svarer til appens `Tilføj opgave` på aktivitetsdetaljer.

Designet skal matche appens flows og være kompakt, administrativt og dansk i web-klubmodulet. Det må ikke blive en marketing/landing-side. Det skal være en reel arbejdsflade i klubmodulet.

## Source Of Truth I Appen

Brug disse app-filer som adfærdskontrakt:

- Aktivitetsmodal: `components/CreateActivityModal.tsx`
- Aktivitets-write service: `services/activityService.ts`
- Opgaveskabelon-write service: `services/taskService.ts`
- Lokal aktivitetsopgave-modal: `components/CreateActivityTaskModal.tsx`
- Appens activity scope filter: `hooks/useHomeActivities.ts`
- Klub-læseendpoints: `supabase/functions/_shared/clubActivities.ts`

Vigtigt:

- Brug ikke `public.tasks` til nye opgaver. Appens aktive opgavekontrakt er `public.task_templates`.
- Brug ikke `is_template` på `task_templates`. `task_templates` er skabeloner per definition.
- Brug ikke kun Base44-interne entities. Alt skal ende i Supabase-tabellerne nedenfor, ellers ser mobilappen det ikke.

## Eksisterende Endpoints Til Klubmodulet

Kald Supabase Edge Functions via `supabase.functions.invoke('<name>', { body })`.

### Klubvalg Og Adgang

- `getCurrentUserClubContext`
  - body: `{}`
  - bruges til at finde brugerens klubber, rolle og om brugeren er platform admin.
- `listPlatformAdminClubs`
  - body: `{}`
  - bruges kun for platform admins, hvis webdelen allerede bruger denne til klublisten.

### Medlemmer, Hold Og Coachrelationer

- `getClubMemberManagementData`
  - body: `{ "clubId": "<uuid>" }`
  - response indeholder `actorRole`, `permissions`, `members`, `trainerPlayerLinks`, `teams`.
- `createClubTeam`
  - body: `{ "clubId": "<uuid>", "name": "U15 A", "description": null, "coachUserId": "<uuid>", "playerUserIds": ["<uuid>"] }`
- `updateClubTeam`
  - body: `{ "teamId": "<uuid>", "clubId": "<uuid>", "name": "U15 A", "description": null, "coachUserId": "<uuid>", "playerUserIds": ["<uuid>"] }`
- `assignClubPlayerToCoach`
  - body: `{ "clubId": "<uuid>", "coachUserId": "<uuid>", "playerUserId": "<uuid>" }`
- `removeClubPlayerFromCoach`
  - body: `{ "clubId": "<uuid>", "coachUserId": "<uuid>", "playerUserId": "<uuid>" }`

### Aktivitetsvisning

- `getClubActivityFilters`
  - body: `{ "clubId": "<uuid>" }`
  - response:

```ts
{
  success: true,
  data: {
    clubId: string;
    members: Array<{
      targetType: 'member';
      targetId: string; // auth user id
      memberId: string;
      fullName: string | null;
      email: string;
      role: 'owner' | 'admin' | 'coach' | 'player';
      status: 'active' | 'inactive';
      label: string;
    }>;
    teams: Array<{
      targetType: 'team';
      targetId: string; // teams.id
      teamId: string;
      name: string;
      adminUserId: string | null;
      adminName: string | null;
      memberCount: number;
      label: string;
    }>;
    defaultTarget: { targetType: 'member' | 'team'; targetId: string } | null;
  };
}
```

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

  - `targetType` er enten `member` eller `team`.
  - bruges efter create/update til at refetche aktivitetslisten.

### Klubkategorier

- `getClubActivityCategories`
  - body: `{ "clubId": "<uuid>" }`
- `createClubActivityCategory`
  - body: `{ "clubId": "<uuid>", "name": "Recovery", "color": "#4ECDC4", "emoji": "R" }`
- `updateClubActivityCategory`
  - body: `{ "clubId": "<uuid>", "categoryId": "<uuid>", "name": "Recovery", "color": "#4ECDC4", "emoji": "R" }`
- `deleteClubActivityCategory`
  - body: `{ "categoryId": "<uuid>" }`

Disse endpoints administrerer klubbens master-kategorier. Når en aktivitet eller opgave gemmes på en spiller eller et hold, skal `category_id` pege på en kategori-række, som appen kan læse i den konkrete kontekst.

## Aktivitet Scope-Regler

Appen læser aktiviteter sådan:

- Egen/sædvanlig brugerflade:
  - `user_id = currentUser.id AND player_id IS NULL AND team_id IS NULL`
  - eller `player_id = currentUser.id`
  - eller `team_id IN brugerens hold`
- Spillerkontekst:
  - `user_id = playerUserId AND player_id IS NULL AND team_id IS NULL`
  - eller `player_id = playerUserId`
- Holdkontekst:
  - `team_id = teamId`

Når Base44 opretter via klubmodulet:

- For en aktivitet til en specifik spiller:
  - `activities.user_id = current authenticated web user id`
  - `activities.player_id = selected player user id`
  - `activities.team_id = null`
- For en aktivitet til et hold:
  - `activities.user_id = current authenticated web user id`
  - `activities.team_id = selected teams.id`
  - `activities.player_id = null`
- For en aktivitet til coach/admin selv:
  - `activities.user_id = selected member user id` hvis web-flowet eksplicit opretter på den persons egen kalender via service/Edge Function.
  - `player_id = null`
  - `team_id = null`

Hvis Base44 kun bruger den almindelige Supabase anon/auth client, må den ikke forsøge at skrive `user_id` som en anden bruger end den indloggede bruger, hvis RLS blokerer det. I så fald skal flowet enten bruge indlogget bruger som ejer eller flyttes til en service-backed Edge Function. Opret ikke tavse fallback-rækker i Base44.

## Kategorier Ved Create

Base44 skal tilbyde samme kategori-oplevelse som appens aktivitetsmodal:

- Brug synlige kategorier for den aktive kontekst.
- Vis navn, farve og emoji.
- Gør kategori obligatorisk.
- Hvis der mangler kategori, vis dansk fejl: `Vælg en kategori.`

Kategorikilder:

- Systemkategorier: `activity_categories.is_system = true`
- Bruger-/trænerkategorier: `activity_categories.user_id = ownerUserId`
- Spillerkategorier: `activity_categories.player_id = playerUserId`
- Holdkategorier: `activity_categories.team_id = teamId`
- Klubkopier: rækker hvor `source_category_id != null`; de vises i appen som klubrelaterede kopier.

Hvis brugeren vælger en klub-masterkategori fra `getClubActivityCategories`, må Base44 ikke blindt gemme master-id'et på en spilleraktivitet. Find først den synlige kopi:

```ts
const { data: copiedCategory } = await supabase
  .from('activity_categories')
  .select('id')
  .eq('source_category_id', selectedClubCategoryId)
  .or(`user_id.eq.${targetUserId},player_id.eq.${targetUserId}`)
  .limit(1)
  .maybeSingle();
```

Hvis der ikke findes en kopi endnu, skal Base44 bede brugeren synkronisere/oprette kategorier via klubkategori-flowet eller bruge en eksisterende synlig kategori. Brug ikke en kategori-id, som appens target ikke kan læse.

## Prompt 1: UI For Aktivitetsoprettelse

Tilføj en `Opret aktivitet`-handling i klubmodulets aktivitetsvisning.

Placering:

- Vis knappen tæt på eksisterende aktivitetskalender/liste for den valgte klub.
- Kræv at brugeren først har valgt `targetType` og `targetId` fra `getClubActivityFilters`.
- Efter create skal `getClubActivityMirror` refetches for samme `clubId`, `targetType`, `targetId`, `dateFrom`, `dateTo`.

Felter:

- `Oprettelsesmetode`
  - `Titel`: brugeren skriver titel.
  - `Kategori`: titlen sættes til kategoriens navn, præcis som appens kategori-mode.
- `Titel`
  - påkrævet ved titel-mode.
- `Kategori`
  - påkrævet.
- `Dato`
  - påkrævet, format `YYYY-MM-DD`.
- `Starttid`
  - påkrævet, format `HH:mm`.
- `Sluttid`
  - valgfri, format `HH:mm`.
  - hvis sat, skal sluttid være efter starttid.
- `Lokation`
  - valgfri.
  - hvis tom, gem `No location`, som appen gør.
- `Intensitet`
  - toggle `intensity_enabled`.
  - score er valgfri 1-5.
  - hvis toggle er off, gem `intensity = null` og `intensity_enabled = false`.
- `Gentagelse`
  - valgfri.
  - understøt `daily`, `weekly`, `biweekly`, `triweekly`, `monthly`.
  - for `weekly`, `biweekly`, `triweekly` skal brugeren vælge mindst én ugedag.
  - valgfri slutdato.

Danske UI-tekster:

- Knap: `Opret aktivitet`
- Modal-titel: `Opret aktivitet`
- Save: `Opret`
- Cancel: `Annuller`
- Oprettet: `Aktiviteten er oprettet`
- Fejl: `Aktiviteten kunne ikke oprettes`

## Prompt 2: Supabase Write For Enkeltaktivitet

For ikke-gentagen aktivitet skal Base44 indsætte i `public.activities`.

Payload:

```ts
const payload = {
  user_id: ownerUserId,
  title: title.trim(),
  activity_date: dateIso,       // YYYY-MM-DD
  activity_time: startTime,     // HH:mm eller HH:mm:ss
  activity_end_time: endTime || null,
  location: location.trim() || 'No location',
  category_id: categoryId,
  intensity: intensityEnabled ? normalizedIntensityOrNull : null,
  intensity_enabled: intensityEnabled,
  is_external: false,
  player_id: targetType === 'member' && targetMemberRole === 'player' ? targetUserId : null,
  team_id: targetType === 'team' ? targetTeamId : null,
};

const { data, error } = await supabase
  .from('activities')
  .insert(payload)
  .select('id')
  .single();
```

Validering:

- `title.trim()` skal være udfyldt, medmindre kategori-mode bruges.
- `category_id` skal være en synlig kategori for target.
- `dateIso` skal matche `YYYY-MM-DD`.
- `startTime` skal matche `HH:mm` eller `HH:mm:ss`.
- `endTime` må være `null`; hvis sat, skal den være efter starttid.
- `intensity` skal normaliseres til 1-5 eller `null`.

## Prompt 3: Supabase Write For Gentagen Aktivitet

Gentagen aktivitet skal matche appens `activityService.createActivity`.

Først indsæt i `public.activity_series`:

```ts
const { data: series, error: seriesError } = await supabase
  .from('activity_series')
  .insert({
    user_id: ownerUserId,
    title: title.trim(),
    location: location.trim() || 'No location',
    category_id: categoryId,
    recurrence_type: recurrenceType,
    recurrence_days: recurrenceDays || [],
    start_date: startDateIso,
    end_date: endDateIso || null,
    activity_time: startTime,
    activity_end_time: endTime || null,
    player_id: targetPlayerId,
    team_id: targetTeamId,
    intensity_enabled: intensityEnabled,
  })
  .select('id')
  .single();
```

Generer derefter forekomster lokalt i Base44 på samme måde som appen:

- `daily`: hver dag.
- `weekly`: hver 1. uge.
- `biweekly`: hver 2. uge.
- `triweekly`: hver 3. uge.
- `monthly`: samme dato hver måned.
- Hvis ingen `endDate` er valgt, generer max 365 dage frem.
- Stop altid ved max 1000 iterationer.

Indsæt forekomster i `public.activities`:

```ts
const rows = dates.map((date) => ({
  user_id: ownerUserId,
  title: title.trim(),
  activity_date: date.toISOString().slice(0, 10),
  activity_time: startTime,
  activity_end_time: endTime || null,
  location: location.trim() || 'No location',
  category_id: categoryId,
  intensity: intensityEnabled ? normalizedIntensityOrNull : null,
  intensity_enabled: intensityEnabled,
  series_id: series.id,
  series_instance_date: date.toISOString().slice(0, 10),
  is_external: false,
  player_id: targetPlayerId,
  team_id: targetTeamId,
}));

await supabase.from('activities').insert(rows);
```

Database trigger `on_activity_created` kører `create_tasks_for_activity`, så fremtidige opgaveskabeloner for kategori kan blive oprettet på aktiviteten.

## Prompt 4: UI For Opgaveskabeloner

Tilføj en `Opret opgave`-handling i klubmodulet. Denne opretter en skabelon i `public.task_templates`, ligesom appens `Opgaver`-fane.

Felter:

- `Titel`
  - påkrævet.
- `Beskrivelse`
  - valgfri.
- `Kategorier`
  - mindst én kategori anbefales.
  - kategorier bestemmer hvilke aktiviteter der automatisk får opgaven.
- `Påmindelse`
  - toggle + minutter.
  - tillad `0`, `15`, `30`, `60`, `120` og manuel ikke-negativ integer.
- `Medier`
  - valgfri URL-liste.
  - gem som `video_urls`; første URL kan også gemmes som `video_url`.
  - accepter video-, billede- og PDF-links som appen.
- `Delopgaver`
  - valgfri liste.
- `Feedback efter træning`
  - toggle.
  - hvis aktiv: `after_training_enabled = true`, `after_training_delay_minutes = valgt minutværdi eller 0`.
  - score-feedback er default on.
  - note-feedback er default on.
  - intensity-feedback er on når feedback efter træning er on.
- `Opgavevarighed`
  - toggle + minutter.
  - clamp 0-600.

Danske UI-tekster:

- Knap: `Opret opgave`
- Modal-titel: `Opret opgave`
- Save: `Gem opgave`
- Oprettet: `Opgaven er oprettet`
- Fejl: `Opgaven kunne ikke oprettes`

## Prompt 5: Supabase Write For Opgaveskabelon

Indsæt først i `public.task_templates`.

```ts
const { data: template, error: templateError } = await supabase
  .from('task_templates')
  .insert({
    user_id: ownerUserId,
    title: title.trim(),
    description: description.trim() || '',
    reminder_minutes: reminderEnabled ? reminderMinutes : null,
    video_url: firstMediaUrlOrNull,
    video_urls: mediaUrls.length ? mediaUrls : null,
    after_training_enabled: afterTrainingEnabled,
    after_training_delay_minutes: afterTrainingEnabled ? afterTrainingDelayMinutes : null,
    after_training_feedback_enable_score: true,
    after_training_feedback_score_explanation: null,
    after_training_feedback_enable_intensity: afterTrainingEnabled,
    after_training_feedback_enable_note: true,
    task_duration_enabled: taskDurationEnabled,
    task_duration_minutes: taskDurationEnabled ? taskDurationMinutes : null,
    source_folder: null,
    player_id: targetPlayerId,
    team_id: targetTeamId,
    library_exercise_id: null,
  })
  .select('id')
  .single();
```

Indsæt kategorier:

```ts
await supabase
  .from('task_template_categories')
  .insert(categoryIds.map((categoryId) => ({
    task_template_id: template.id,
    category_id: categoryId,
  })));
```

Indsæt delopgaver:

```ts
const subtaskRows = subtasks
  .map((title, index) => ({ title: title.trim(), sort_order: index }))
  .filter((row) => row.title.length > 0)
  .map((row) => ({
    task_template_id: template.id,
    title: row.title,
    sort_order: row.sort_order,
  }));

if (subtaskRows.length) {
  await supabase.from('task_template_subtasks').insert(subtaskRows);
}
```

Efter oprettelse:

- Refetch den valgte target-visning via `getClubActivityMirror`.
- Hvis webdelen viser opgaveskabeloner, refetch `task_templates` for samme scope.
- Emit/vis ikke Maestro-specifikke flows i web.

## Prompt 6: UI For Lokal Opgave På Aktivitet

I aktivitetsdetaljer i klubmodulet skal hver aktivitet have handlingen `Tilføj opgave`.

Denne opgave gemmes direkte på aktiviteten og svarer til appens `CreateActivityTaskModal`.

Felter:

- `Titel` påkrævet.
- `Beskrivelse` valgfri.
- `Påmindelse` toggle + minutter.
- `Medier` valgfri URL-liste.
- `Delopgaver` valgfri liste.
- `Feedback efter træning` toggle + delay minutter.
- `Opgavevarighed` toggle + minutter.

Handlinger:

- For intern aktivitet (`sourceType: 'internal'` fra `getClubActivityMirror`): skriv til `activity_tasks`.
- For ekstern aktivitet (`sourceType: 'external'`): skriv til `external_event_tasks`, men kun hvis der findes `externalEventRowId`/`local_meta_id`. Hvis ikke, vis: `Aktiviteten er stadig ved at synkronisere. Prøv igen om lidt.`

## Prompt 7: Supabase Write For Lokal Opgave På Intern Aktivitet

Opret først en lokal template med `source_folder = 'activity_local_task'`, som appen gør.

```ts
const { data: template, error: templateError } = await supabase
  .from('task_templates')
  .insert({
    user_id: ownerUserId,
    title: title.trim(),
    description: description.trim(),
    video_url: firstMediaUrlOrNull,
    video_urls: mediaUrls.length ? mediaUrls : null,
    reminder_minutes: reminderEnabled ? reminderMinutes : null,
    after_training_enabled: afterTrainingEnabled,
    after_training_delay_minutes: afterTrainingEnabled ? afterTrainingDelayMinutes : null,
    task_duration_enabled: taskDurationEnabled,
    task_duration_minutes: taskDurationEnabled ? taskDurationMinutes : null,
    after_training_feedback_enable_score: true,
    after_training_feedback_score_explanation: null,
    after_training_feedback_enable_note: true,
    after_training_feedback_enable_intensity: true,
    source_folder: 'activity_local_task',
  })
  .select('id')
  .single();
```

Indsæt derefter i `activity_tasks`:

```ts
const { data: task, error: taskError } = await supabase
  .from('activity_tasks')
  .insert({
    activity_id: activityId,
    title: title.trim(),
    description: description.trim(),
    video_url: firstMediaUrlOrNull,
    video_urls: mediaUrls.length ? mediaUrls : null,
    completed: false,
    reminder_minutes: reminderEnabled ? reminderMinutes : null,
    task_template_id: template.id,
    after_training_enabled: afterTrainingEnabled,
    after_training_delay_minutes: afterTrainingEnabled ? afterTrainingDelayMinutes : null,
    task_duration_enabled: taskDurationEnabled,
    task_duration_minutes: taskDurationEnabled ? taskDurationMinutes : null,
  })
  .select('id')
  .single();
```

Indsæt delopgaver:

```ts
await supabase.from('activity_task_subtasks').insert(
  subtasks
    .map((title, index) => ({ title: title.trim(), sort_order: index }))
    .filter((row) => row.title)
    .map((row) => ({
      activity_task_id: task.id,
      title: row.title,
      sort_order: row.sort_order,
    }))
);
```

Hvis `after_training_enabled = true`, skal der oprettes/vedligeholdes en feedback-opgave på samme aktivitet:

```ts
await supabase.from('activity_tasks').insert({
  activity_id: activityId,
  title: `Feedback på ${title.trim() || 'opgaven'}`,
  description: `Del din feedback efter træningen direkte til træneren. [auto-after-training:${template.id}]`,
  completed: false,
  reminder_minutes: afterTrainingDelayMinutes ?? 0,
  task_template_id: null,
  feedback_template_id: template.id,
  is_feedback_task: true,
});
```

Undgå dubletter ved først at søge efter eksisterende feedback-opgave med samme `feedback_template_id` på samme `activity_id`.

## Prompt 8: Supabase Write For Lokal Opgave På Ekstern Aktivitet

Eksterne aktiviteter bruger `public.external_event_tasks`.

Før insert skal Base44 resolve `local_meta_id`:

- Brug `activity.id` fra `getClubActivityMirror`, hvis `sourceType = 'external'` og id'et er en `events_local_meta.id`.
- Ellers søg:

```ts
const { data: meta } = await supabase
  .from('events_local_meta')
  .select('id')
  .eq('external_event_id', externalEventRowId)
  .maybeSingle();
```

Indsæt i `external_event_tasks`:

```ts
const { data: task, error: taskError } = await supabase
  .from('external_event_tasks')
  .insert({
    local_meta_id: localMetaId,
    title: title.trim(),
    description: description.trim(),
    video_url: firstMediaUrlOrNull,
    video_urls: mediaUrls.length ? mediaUrls : null,
    completed: false,
    reminder_minutes: reminderEnabled ? reminderMinutes : null,
    task_template_id: template.id,
    after_training_enabled: afterTrainingEnabled,
    after_training_delay_minutes: afterTrainingEnabled ? afterTrainingDelayMinutes : null,
    task_duration_enabled: taskDurationEnabled,
    task_duration_minutes: taskDurationEnabled ? taskDurationMinutes : null,
  })
  .select('id')
  .single();
```

Hvis `after_training_enabled = true`, opret tilsvarende feedback-opgave i `external_event_tasks` med:

- `local_meta_id`
- `feedback_template_id = template.id`
- `is_feedback_task = true`
- `task_template_id = null`

## Prompt 9: Assign/Tildel Eksisterende Aktivitet

Hvis webdelen også skal kunne vælge spillere/hold for en allerede oprettet træneraktivitet, må den ikke manuelt kopiere rækker. Brug de eksisterende RPC'er.

Intern aktivitet:

```ts
await supabase.rpc('assign_internal_activity_to_players', {
  p_source_activity_id: activityId,
  p_player_ids: playerIds,
  p_team_scope_by_player: teamScopeByPlayer,
});
```

Fjern intern tildeling:

```ts
await supabase.rpc('remove_internal_activity_assignments', {
  p_source_activity_id: activityId,
  p_player_ids: playerIdsToRemove,
});
```

Ekstern aktivitet:

```ts
await supabase.rpc('assign_external_activity_to_players', {
  p_external_event_id: externalEventRowId,
  p_player_ids: playerIds,
  p_team_scope_by_player: teamScopeByPlayer,
  p_source_meta_id: sourceLocalMetaId || null,
  p_category_id: categoryId || null,
  p_intensity_enabled: intensityEnabled === true,
});
```

Team opt-out:

```ts
await supabase.rpc('sync_internal_activity_assignment_team_exclusions', {
  p_source_activity_id: activityId,
  p_excluded_player_ids_by_team: excludedPlayerIdsByTeamId,
});
```

```ts
await supabase.rpc('sync_external_activity_assignment_team_exclusions', {
  p_external_event_id: externalEventRowId,
  p_excluded_player_ids_by_team: excludedPlayerIdsByTeamId,
});
```

## Adgangsregler

Byg UI efter disse regler:

- `owner`, `admin` og `platform_admin` må oprette for alle aktive medlemmer og hold i klubben.
- `coach` må kun oprette for sig selv og spillere, der er linked via `admin_player_relationships`.
- `player` må ikke have adgang til klubmodulets create-flows.
- `inactive` medlemmer må ikke kunne vælges.
- Hold skal komme fra `getClubActivityFilters.teams` eller `getClubMemberManagementData.teams`; brug ikke et frit UUID-input.
- Spillere skal komme fra `getClubActivityFilters.members` eller `getClubMemberManagementData.members`.

Hvis backend returnerer `FORBIDDEN`, vis:

`Du har ikke adgang til at oprette her.`

Hvis RLS/direct write fejler, vis:

`Oprettelsen kunne ikke gemmes. Kontroller at brugeren har adgang til denne klub og kontekst.`

## Refetch Og UI-State Efter Save

Efter succes:

- Luk modal/drawer.
- Vis kort succesbesked.
- Refetch `getClubActivityMirror` for samme target.
- Refetch kategorier, hvis brugeren oprettede/redigerede kategori undervejs.
- Nulstil form state.

Efter fejl:

- Behold modal åben.
- Vis dansk fejl tæt på save-knappen og gerne toast/alert.
- Log Supabase error code/message i Base44 dev console.

## Acceptkriterier

- En klubadmin kan oprette en enkelt aktivitet for en spiller fra web, og aktiviteten vises i mobilappen på spillerens aktivitetsliste.
- En klubadmin kan oprette en enkelt aktivitet for et hold fra web, og aktiviteten vises for holdets medlemmer i appens aktivitetsscope.
- En klubadmin kan oprette en gentagen aktivitet fra web, og alle forekomster oprettes i `activities` med samme `series_id`.
- En klubadmin kan oprette en opgaveskabelon for spiller/hold, og skabelonen vises i appens Opgaver-flow for samme kontekst.
- En klubadmin kan oprette en lokal opgave på en intern aktivitet, og opgaven vises på aktiviteten i appen.
- En klubadmin kan oprette en lokal opgave på en ekstern aktivitet, hvis aktiviteten har `events_local_meta`.
- Delopgaver gemmes i den korrekte subtask-tabel.
- Feedback efter træning opretter en feedback-opgave med `feedback_template_id`.
- `getClubActivityMirror` viser den nye aktivitet/opgave efter refetch.
- Der oprettes ikke rækker i `public.tasks`.
- Der bruges ikke `is_template` på `task_templates`.
- Valideringsfejl er på dansk.
- Maestro skal ikke køres som del af denne Base44-opgave.

## Testplan For Base44

Manuel test i web:

- Opret aktivitet for spiller.
- Opret aktivitet for hold.
- Opret gentagen aktivitet med ugentlige dage.
- Opret opgaveskabelon med kategori, delopgaver, media URL, påmindelse og feedback efter træning.
- Opret lokal opgave på intern aktivitet.
- Opret lokal opgave på ekstern aktivitet.
- Refetch og kontroller at `getClubActivityMirror` indeholder de nye rækker.
- Åbn mobilappen og kontroller samme spiller-/holdkontekst.

Teknisk smoke:

- Kontroller at `activities.player_id` eller `activities.team_id` er sat korrekt.
- Kontroller at `activity_series` kun findes for gentagne aktiviteter.
- Kontroller at `task_templates.player_id` eller `task_templates.team_id` er sat korrekt.
- Kontroller at `task_template_categories` peger på valgte kategorier.
- Kontroller at `activity_tasks.task_template_id` peger på lokal template for lokale opgaver.
- Kontroller at feedback-opgaver har `feedback_template_id`.
