# Base44 Prompt: Owner Coach Dashboard

Brug denne prompt i den eksisterende login-beskyttede Base44/KlubAdmin webapp.
Byg ikke en ny portal, og opret ikke Base44-interne business entities til
dashboarddata.

## Formaal

Tilpas det eksisterende `KlubDashboard`/dashboard-flow til `OwnerAccount`, saa
baade klubber og private coach businesses kan se et samlet coach dashboard med:

- spiller-overblik
- alerts
- dagens og ugens aktiviteter
- manglende opgaver
- quick actions til player detail, tasks, reports, programs, goals og chat
- alert-navigation hvor `no_plan` aabner aktiviteter filtreret paa spilleren
- effective seat usage fra #281

Tenant scope er altid:

```text
owner_account_id
```

`owner_type` kan vaere:

- `club`
- `private_coach_business`

## Reuse Existing Base44/KlubAdmin

Genbrug den eksisterende Base44 webapp, navigation og KlubAdmin-moduler. Det
relevante dashboard kan hedde `Dashboard`, `KlubDashboard` eller `Coach
Dashboard`, men det skal ligge i den eksisterende owner portal.

Tilpas eksisterende moduler og services i stedet for at bygge greenfield:

- `KlubDashboard`
- `KlubMembers`
- `KlubAktiviteter`
- `KlubOpgaver`
- `KlubLicense`
- `KlubSettings`
- `clubAdminApi`
- `roleRedirect`
- `activityWriteService.jsx`

Base44 er kun host/UI-lag. Supabase er source of truth for owner, spillere,
CRM, aktiviteter, tasks, feedback og seats.

## Supabase API

Base URL:

```text
https://lhpczofddvwcyrgotzha.supabase.co/functions/v1
```

Function:

```text
getOwnerCoachDashboard
```

Hvis Base44 bruger Supabase JS:

```ts
await supabase.functions.invoke('getOwnerCoachDashboard', {
  body: {
    ownerAccountId: selectedOwnerAccountId,
  },
});
```

Hvis Base44 kalder HTTP direkte:

```http
POST https://lhpczofddvwcyrgotzha.supabase.co/functions/v1/getOwnerCoachDashboard
Authorization: Bearer <supabase_user_access_token>
apikey: <supabase_anon_publishable_key>
Content-Type: application/json
```

Payload:

```json
{
  "ownerAccountId": "<owner_account uuid>"
}
```

Valgfrit testfelt:

```json
{
  "ownerAccountId": "<owner_account uuid>",
  "now": "2026-07-09T09:00:00.000Z"
}
```

Service-role key maa aldrig ligge i Base44/browseren.

## Remote Status

Remote status per 2026-07-09 paa project `lhpczofddvwcyrgotzha`:

- Migration `20260709100000_owner_coach_dashboard` er pushed med
  `supabase db push --yes`.
- Migration `20260709113000_owner_coach_dashboard_no_plan_activity_target` er
  pushed med `supabase db push --yes` og mapper `no_plan` alert actions til
  `activities`.
- Efter deployment returnerer `supabase db push --dry-run`: remote database is
  up to date.
- Edge Function `getOwnerCoachDashboard` er deployet og `ACTIVE`.
- No-auth smoke test returnerer `401` med `UNAUTHORIZED_NO_AUTH_HEADER`, ikke
  `404`.
- `supabase migration list --linked` viser
  `20260709100000 | 20260709100000 | 2026-07-09 10:00:00`.
- `supabase migration list --linked` viser ogsaa
  `20260709113000 | 20260709113000 | 2026-07-09 11:30:00`.

## Access

Adgang gives kun til brugere med aktiv owner adgang:

- `owner`
- `admin`
- `coach`
- `assistant_coach`

Platform admins maa ogsaa tilgaa dashboardet, hvis deres eksisterende
platform-admin flow impersonerer eller vælger en owner via server-side flows.

Brug ikke den gamle enkeltrolle fra `user_roles` som gate. Samme bruger/mail kan
have flere roller paa samme `owner_account_id`, fx `owner + admin + coach`.

## Response Contract

Response ligger i `data` hvis Supabase JS returnerer standard Edge Function
envelope:

```ts
{
  ownerAccount: {
    ownerAccountId: string;
    ownerType: 'club' | 'private_coach_business';
    name: string;
    status: string;
    coachAccountId: string | null;
    clubId: string | null;
  };
  actor: {
    userId: string;
    roles: string[];
    canManageOwner: boolean;
    canCoach: boolean;
  };
  generatedAt: string;
  window: {
    today: string;
    weekStart: string;
    weekEnd: string;
    inactivityCutoff: string;
    recentFeedbackCutoff: string;
    taskCutoff: string;
  };
  seatStatus: OwnerSeatStatus;
  metrics: {
    totalPlayers: number;
    activePlayers: number;
    trialPlayers: number;
    pausedPlayers: number;
    formerPlayers: number;
    playersMissingTasks: number;
    inactivePlayers: number;
    playersWithoutPlan: number;
    newFeedback: number;
    todayActivities: number;
    weekActivities: number;
    upcomingSessions: number;
    openTasks: number;
    completedTasks: number;
    taskCompletionRate: number | null;
  };
  alerts: Array<{
    id: string;
    type: 'missing_tasks' | 'inactive_player' | 'new_feedback' | 'upcoming_session' | 'no_plan';
    severity: 'high' | 'warning' | 'info';
    title: string;
    subtitle: string;
    playerId: string;
    playerName: string;
    teamIds: string[];
    teamNames: string[];
    count: number;
    occurredAt: string | null;
    action: { target: 'player_crm' | 'activities'; playerId: string };
  }>;
  today: { activities: DashboardActivity[] };
  week: { activities: DashboardActivity[] };
  players: DashboardPlayer[];
  filters: {
    statuses: Array<{ value: string; label: string }>;
    teams: Array<{ id: string; name: string; description: string | null; memberCount: number }>;
    tags: Array<{ id: string; name: string; color: string }>;
    levels: string[];
    positions: string[];
  };
}
```

`seatStatus` er samme effective seat payload fra #281. Base44 maa ikke beregne
effective seats selv.

## UI Flow

Dashboardet skal bygges til desktop scanning:

- owner/workspace switcher, hvis brugeren har adgang til flere owners
- diskret dashboard-scope filterknap, hvor brugeren kan vaelge `Alle
  spillere`, et hold eller en spiller at se dashboard-informationer for
- KPI-strip: players, alerts, open tasks, today, week, completion, player seats
- alert feed sorteret efter severity
- today/week activities med player count, team og open task count
- filtrerbar player table med status, teams, tags, level, position og alerts
- quick actions fra hver spiller til player detail, tasks, reports, program,
  goals og chat

Alert click-adfaerd:

- `no_plan` alerts skal navigere til `KlubAktiviteter` i samme
  `owner_account_id` og filtrere/scope listen til `alert.playerId`.
- Alle andre alert-typer (`missing_tasks`, `inactive_player`, `new_feedback`,
  `upcoming_session`) skal navigere til eksisterende CRM/player detail for
  `alert.playerId` i samme workspace.
- Hvis Base44 bruger `alert.action.target`, skal `activities` mappes til
  `KlubAktiviteter` med player-filter, og `player_crm` mappes til CRM detail.

For `program`, `goals`, `reports` og `chat` skal Base44 kun linke til
eksisterende eller feature-flagged routes. Byg ikke de senere features fra
#285, #289, #291 eller #294 som del af #282.

Dashboard-scope filter:

- Filterknappen skal ligge synligt i dashboardets topomraade, men visuelt
  diskret. Naar der er valgt hold eller spiller, maa knappen gerne have en
  subtil ramme/highlight, saa det er tydeligt at dashboardet er scoped.
- Scope `Alle spillere` viser hele payloaden.
- Scope `Hold` skal filtrere KPI'er, alerts, today/week activities og player
  table til spillere paa valgt hold. Aktiviteter matches paa `activity.teamId`
  eller overlap mellem `activity.playerIds` og spillere paa holdet.
- Scope `Spiller` skal filtrere KPI'er, alerts, today/week activities og player
  table til valgt spiller via `playerId`.
- Eksisterende table-filtre for status, team, tags, level, position og alerts
  maa stadig kunne bruges til at indsnævre player table inden for valgt scope.
- Scope-valget maa ikke skifte owner/workspace eller oprette Base44-interne
  business entities. Det er kun en visningsfiltrering af data fra
  `getOwnerCoachDashboard`.

## Empty, Loading And Error States

- Tom owner: vis zero-state for players, alerts og activities.
- Fa spillere: behold samme layout, men uden store tomme tabeller.
- Mange spillere: player table skal kunne scannes, sorteres og filtreres.
- Loading: skeleton/KPI placeholders.
- `401`: send bruger til login.
- `403`: vis manglende owner adgang.
- `404 OWNER_ACCOUNT_NOT_FOUND`: workspace findes ikke eller er slettet.
- `500`: vis retry og log Supabase request id hvis tilgaengeligt.

## Mobile Parity

Mobilappen har samme kernefunktionalitet i `app/(tabs)/coach-dashboard.tsx`.
Base44 maa gerne have bredere desktop table UX, men web og mobil skal vise samme
business data fra `getOwnerCoachDashboard`.

Mobil quick actions bruger eksisterende:

- CRM tab/player CRM
- Tasks via AdminContext player scope
- Progress via AdminContext player scope
- No-plan alerts via Home/activities i AdminContext player scope

## QA

Test minimum:

- `club` owner med aktive spillere
- `private_coach_business` owner oprettet via Apple trainer subscription
- owner provisioneret af super admin med effective player seats
- multi-role samme mail: `owner + admin + coach`
- tomt workspace
- workspace med fa spillere
- workspace med 50+ spillere
- alerts for missing tasks, inactive players, new feedback, upcoming sessions
- `no_plan` alert klikker til `KlubAktiviteter`/mobil Home med korrekt spillerfilter
  og no plan
- dashboard-scope filter paa web og mobil kan vaelge `Alle spillere`, et hold
  eller en spiller, og KPI'er/alerts/activities/player list skifter scope
- filter paa team, tag, status, level og position
- web, iOS og Android smoke

CI-equivalent checks foer merge:

```bash
npm run typecheck
npm run lint
npm test
```
