import fs from 'fs';
import path from 'path';
import {
  getOwnerCoachDashboardAction,
  normalizeOwnerCoachDashboardPayload,
  parseOwnerCoachDashboardBody,
} from '../supabase/functions/_shared/ownerCoachDashboard';

const actorUserId = '11111111-1111-4111-8111-111111111111';
const ownerAccountId = '22222222-2222-4222-8222-222222222222';
const playerId = '33333333-3333-4333-8333-333333333333';

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260709100000_owner_coach_dashboard.sql');
const noPlanActivityTargetMigrationPath = path.join(
  process.cwd(),
  'supabase/migrations/20260709113000_owner_coach_dashboard_no_plan_activity_target.sql'
);
const functionPath = path.join(process.cwd(), 'supabase/functions/getOwnerCoachDashboard/index.ts');
const sharedPath = path.join(process.cwd(), 'supabase/functions/_shared/ownerCoachDashboard.ts');
const servicePath = path.join(process.cwd(), 'services/ownerCoachDashboardService.ts');
const screenPath = path.join(process.cwd(), 'app/(tabs)/coach-dashboard.tsx');
const playerCrmPath = path.join(process.cwd(), 'app/(tabs)/player-crm.tsx');
const homePath = path.join(process.cwd(), 'app/(tabs)/(home)/index.tsx');
const homeIosPath = path.join(process.cwd(), 'app/(tabs)/(home)/index.ios.tsx');
const tabLayoutPath = path.join(process.cwd(), 'app/(tabs)/_layout.tsx');
const base44PromptPath = path.join(process.cwd(), 'docs/base44-owner-coach-dashboard-prompt.md');

function createRpcClient(result: { data: unknown; error: { message?: string } | null }) {
  return {
    rpc: jest.fn().mockResolvedValue(result),
  };
}

const seatStatus = {
  ownerAccountId,
  ownerType: 'private_coach_business',
  ownerStatus: 'active',
  planCode: 'trainer_standard',
  planName: 'Coach Standard',
  subscriptionStatus: 'active',
  validUntil: null,
  featureFlags: {
    reports: true,
    programs: true,
  },
  seats: [
    {
      role: 'player',
      planSeats: 15,
      overrideSeats: null,
      addOnSeats: 0,
      effectiveSeats: 15,
      seatsUsed: 3,
      seatsAvailable: 12,
      source: 'plan_baseline',
      planCode: 'trainer_standard',
    },
  ],
  playerSeats: {
    role: 'player',
    planSeats: 15,
    overrideSeats: null,
    addOnSeats: 0,
    effectiveSeats: 15,
    seatsUsed: 3,
    seatsAvailable: 12,
    source: 'plan_baseline',
    planCode: 'trainer_standard',
  },
  canAddPlayers: true,
};

const dashboardPayload = {
  ownerAccount: {
    ownerAccountId,
    ownerType: 'private_coach_business',
    name: 'ME Training',
    status: 'active',
    coachAccountId: null,
    clubId: null,
  },
  actor: {
    userId: actorUserId,
    roles: ['owner', 'admin', 'coach'],
    canManageOwner: true,
    canCoach: true,
  },
  generatedAt: '2026-07-09T09:00:00.000Z',
  window: {
    today: '2026-07-09',
    weekStart: '2026-07-06',
    weekEnd: '2026-07-12',
    inactivityCutoff: '2026-06-25',
    recentFeedbackCutoff: '2026-07-02T09:00:00.000Z',
    taskCutoff: '2026-06-25',
  },
  seatStatus,
  metrics: {
    totalPlayers: 1,
    activePlayers: 1,
    trialPlayers: 0,
    pausedPlayers: 0,
    formerPlayers: 0,
    playersMissingTasks: 1,
    inactivePlayers: 0,
    playersWithoutPlan: 0,
    newFeedback: 1,
    todayActivities: 1,
    weekActivities: 2,
    upcomingSessions: 2,
    openTasks: 2,
    completedTasks: 4,
    taskCompletionRate: 67,
  },
  alerts: [
    {
      id: `missing_tasks:${playerId}`,
      type: 'missing_tasks',
      severity: 'warning',
      title: 'Missing tasks',
      subtitle: 'Player has 2 unfinished tasks.',
      playerId,
      playerName: 'Test Player',
      teamIds: [],
      teamNames: [],
      count: 2,
      occurredAt: '2026-07-08T09:00:00.000Z',
      action: {
        target: 'player_crm',
        playerId,
      },
    },
  ],
  today: {
    activities: [
      {
        id: 'activity-1',
        title: 'Finishing',
        activityDate: '2026-07-09',
        activityTime: '10:00:00',
        activityStart: '2026-07-09T10:00:00.000Z',
        location: 'Pitch 1',
        teamId: null,
        teamName: null,
        playerIds: [playerId],
        playerCount: 1,
        totalTasks: 2,
        completedTasks: 1,
        openTasks: 1,
      },
    ],
  },
  week: {
    activities: [],
  },
  players: [
    {
      ownerPlayerId: '44444444-4444-4444-8444-444444444444',
      playerId,
      displayName: 'Test Player',
      ownerRosterStatus: 'active',
      source: 'manual',
      crmStatus: 'active',
      positions: ['Striker'],
      primaryPosition: 'Striker',
      playingLevel: 'U15 elite',
      clubName: 'FC Test',
      tags: [{ id: '55555555-5555-4555-8555-555555555555', name: 'High touch', color: '#2563eb' }],
      tagIds: ['55555555-5555-4555-8555-555555555555'],
      teams: [],
      teamIds: [],
      lastActivityAt: '2026-07-08T09:00:00.000Z',
      nextActivityAt: '2026-07-09T10:00:00.000Z',
      todayActivitiesCount: 1,
      weekActivitiesCount: 2,
      upcomingActivitiesCount: 2,
      openTasks: 2,
      completedTasks: 4,
      missingTasks: 2,
      taskCompletionRate: 67,
      recentFeedbackCount: 1,
      lastFeedbackAt: '2026-07-08T12:00:00.000Z',
      isInactive: false,
      withoutPlan: false,
      alertTypes: ['missing_tasks', 'new_feedback'],
      quickActions: [
        { type: 'profile', label: 'Profile', target: 'player_crm', playerId },
        { type: 'tasks', label: 'Tasks', target: 'tasks', playerId },
      ],
    },
  ],
  filters: {
    statuses: [{ value: 'active', label: 'Active' }],
    teams: [],
    tags: [{ id: '55555555-5555-4555-8555-555555555555', name: 'High touch', color: '#2563eb' }],
    levels: ['U15 elite'],
    positions: ['Striker'],
  },
};

describe('owner coach dashboard contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const noPlanActivityTargetMigration = fs.readFileSync(noPlanActivityTargetMigrationPath, 'utf8');
  const edgeFunction = fs.readFileSync(functionPath, 'utf8');
  const shared = fs.readFileSync(sharedPath, 'utf8');
  const service = fs.readFileSync(servicePath, 'utf8');
  const screen = fs.readFileSync(screenPath, 'utf8');
  const playerCrm = fs.readFileSync(playerCrmPath, 'utf8');
  const home = fs.readFileSync(homePath, 'utf8');
  const homeIos = fs.readFileSync(homeIosPath, 'utf8');
  const tabLayout = fs.readFileSync(tabLayoutPath, 'utf8');
  const base44Prompt = fs.readFileSync(base44PromptPath, 'utf8');

  it('creates an owner-scoped dashboard RPC using existing owner access and seat helpers', () => {
    expect(migration).toContain('create or replace function public.get_owner_coach_dashboard_payload');
    expect(migration).toContain('p_actor_user_id uuid');
    expect(migration).toContain('p_owner_account_id uuid');
    expect(migration).toContain('public.has_owner_account_coach_access');
    expect(migration).toContain('public.get_owner_seat_status_payload');
    expect(migration).toContain('from public.owner_players op');
    expect(migration).toContain('from public.activity_tasks at');
    expect(migration).toContain('from public.training_reflections tr');
    expect(migration).toContain('from public.trainer_activity_feedback taf');
    expect(migration).toContain('grant execute on function public.get_owner_coach_dashboard_payload');
  });

  it('indexes dashboard lookups for player, activity, task and feedback aggregation', () => {
    expect(migration).toContain('owner_dashboard_activities_user_date_idx');
    expect(migration).toContain('owner_dashboard_activities_player_date_idx');
    expect(migration).toContain('owner_dashboard_activity_tasks_activity_completed_idx');
    expect(migration).toContain('owner_dashboard_training_reflections_user_created_idx');
    expect(migration).toContain('owner_dashboard_trainer_feedback_player_updated_idx');
  });

  it('normalizes dashboard input and payloads', () => {
    expect(
      parseOwnerCoachDashboardBody({
        ownerAccountId,
        now: '2026-07-09T09:00:00.000Z',
      })
    ).toEqual({
      ownerAccountId,
      now: '2026-07-09T09:00:00.000Z',
    });

    expect(normalizeOwnerCoachDashboardPayload(dashboardPayload)).toMatchObject({
      ownerAccount: { ownerAccountId, ownerType: 'private_coach_business' },
      actor: { roles: ['owner', 'admin', 'coach'], canCoach: true },
      seatStatus: { ownerAccountId, playerSeats: { seatsAvailable: 12 } },
      metrics: { totalPlayers: 1, playersMissingTasks: 1 },
      alerts: [{ type: 'missing_tasks', playerId }],
      players: [{ playerId, alertTypes: ['missing_tasks', 'new_feedback'] }],
      filters: { positions: ['Striker'] },
    });
  });

  it('calls the dashboard RPC through the Edge helper', async () => {
    const client = createRpcClient({
      data: dashboardPayload,
      error: null,
    });

    await expect(
      getOwnerCoachDashboardAction(client, actorUserId, {
        ownerAccountId,
        now: '2026-07-09T09:00:00.000Z',
      })
    ).resolves.toMatchObject({
      ownerAccount: { ownerAccountId },
      players: [{ playerId }],
    });

    expect(client.rpc).toHaveBeenCalledWith('get_owner_coach_dashboard_payload', {
      p_actor_user_id: actorUserId,
      p_owner_account_id: ownerAccountId,
      p_now: '2026-07-09T09:00:00.000Z',
    });
  });

  it('maps forbidden dashboard RPC failures to stable app errors', async () => {
    const client = createRpcClient({
      data: null,
      error: { message: 'FORBIDDEN' },
    });

    await expect(getOwnerCoachDashboardAction(client, actorUserId, { ownerAccountId })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'You do not have access to this owner account.',
    });
  });

  it('wires the Edge Function and mobile service to getOwnerCoachDashboard', () => {
    expect(edgeFunction).toContain('getOwnerCoachDashboardAction');
    expect(edgeFunction).toContain('requireAuthContext');
    expect(shared).toContain('normalizeOwnerCoachDashboardPayload');
    expect(shared).toContain("target: 'player_crm' | 'activities'");
    expect(service).toContain("supabase.functions.invoke('getOwnerCoachDashboard'");
  });

  it('adds a mobile coach dashboard tab with filters, alerts and quick actions', () => {
    expect(tabLayout).toContain("name: 'coach-dashboard'");
    expect(tabLayout).toContain("route: '/(tabs)/coach-dashboard'");
    expect(tabLayout).toContain('<Stack.Screen name="coach-dashboard" />');
    expect(screen).toContain('fetchOwnerCoachDashboard');
    expect(screen).toContain('coachDashboard.filters');
    expect(screen).toContain('coachDashboard.alert.');
    expect(screen).toContain('coachDashboard.playerCard');
    expect(screen).toContain('AsyncStorage.setItem(filtersStorageKey');
    expect(screen).toContain("pathname: '/(tabs)/player-crm'");
    expect(screen).toContain("pathname: '/(tabs)/(home)'");
    expect(screen).toContain("alert.type === 'no_plan'");
    expect(screen).toContain('openPlayerActivities(alert.playerId)');
    expect(screen).toContain('ownerAccountId: activeOwnerAccountId');
    expect(screen).toContain('playerId, openAt: String(Date.now())');
    expect(screen).toContain("router.push('/(tabs)/tasks'");
    expect(screen).toContain("router.push('/(tabs)/performance'");
    expect(home).toContain('useLocalSearchParams');
    expect(home).toContain('routePlayerId');
    expect(home).toContain('lastRoutePlayerOpenKeyRef');
    expect(home).toContain('startAdminPlayer(routePlayerId)');
    expect(homeIos).toContain('useLocalSearchParams');
    expect(homeIos).toContain('routePlayerId');
    expect(homeIos).toContain('lastRoutePlayerOpenKeyRef');
    expect(homeIos).toContain('startAdminPlayer(routePlayerId)');
    expect(playerCrm).toContain('useLocalSearchParams');
    expect(playerCrm).toContain('routeOwnerAccountId');
    expect(playerCrm).toContain('routePlayerId');
    expect(playerCrm).toContain('lastRouteOpenKeyRef');
    expect(playerCrm).toContain('void openPlayerDetail(player)');
  });

  it('adds a trainer-only mobile activity scope filter for players and teams', () => {
    [home, homeIos].forEach((homeSource) => {
      expect(homeSource).toContain('home.activityScopeFilter.toggle');
      expect(homeSource).toContain('isTrainerProfile');
      expect(homeSource).toContain('canFilterActivities: isTrainerProfile');
      expect(homeSource).toContain('ensureRosterLoaded()');
      expect(homeSource).toContain('startAdminPlayer(option.id)');
      expect(homeSource).toContain('startAdminTeam(option.id)');
      expect(homeSource).toContain('exitAdmin()');
      expect(homeSource).toContain("kind: 'team'");
      expect(homeSource).toContain('activityScopeFilterButtonActive');
      expect(homeSource).toContain('presentation="compact"');
      expect(homeSource).not.toContain('You can only edit content you created yourself.');
    });

    expect(home).toContain("adminTargetType === 'team'");
    expect(homeIos).toContain("adminTargetType === 'team'");
  });

  it('routes no-plan alert actions to player-scoped activities for web clients', () => {
    expect(noPlanActivityTargetMigration).toContain("alert->>'type' = 'no_plan'");
    expect(noPlanActivityTargetMigration).toContain("jsonb_build_object('target', 'activities', 'playerId'");
    expect(noPlanActivityTargetMigration).toContain('get_owner_coach_dashboard_payload_base_20260709100000');
  });

  it('documents Base44 reuse, owner scope, endpoint contract and mobile parity', () => {
    expect(base44Prompt).toContain('Base44/KlubAdmin');
    expect(base44Prompt).toContain('Byg ikke en ny portal');
    expect(base44Prompt).toContain('owner_account_id');
    expect(base44Prompt).toContain('getOwnerCoachDashboard');
    expect(base44Prompt).toContain('KlubDashboard');
    expect(base44Prompt).toContain('effective seat');
    expect(base44Prompt).toContain('Mobilappen har samme kernefunktionalitet');
    expect(base44Prompt).toContain('No-auth smoke test returnerer `401` med `UNAUTHORIZED_NO_AUTH_HEADER`');
    expect(base44Prompt).toContain('20260709100000 | 20260709100000 | 2026-07-09 10:00:00');
    expect(base44Prompt).toContain('20260709113000 | 20260709113000 | 2026-07-09 11:30:00');
    expect(base44Prompt).toContain("`no_plan` alerts skal navigere til `KlubAktiviteter`");
  });
});
