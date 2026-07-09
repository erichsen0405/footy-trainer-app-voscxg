// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { AppError, type ErrorCode } from './http.ts';
// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { normalizeOwnerSeatStatusPayload, type OwnerSeatStatus } from './ownerLicensing.ts';

type RpcError = {
  message?: string;
};

export type RpcClient = {
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<{ data: T | null; error: RpcError | null }>;
};

export type OwnerDashboardAlertType =
  | 'missing_tasks'
  | 'inactive_player'
  | 'new_feedback'
  | 'upcoming_session'
  | 'no_plan';

export type OwnerDashboardAlertSeverity = 'high' | 'warning' | 'info';

export type OwnerCoachDashboardInput = {
  ownerAccountId: string;
  now: string | null;
};

export type OwnerCoachDashboardPayload = {
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
  alerts: OwnerCoachDashboardAlert[];
  today: { activities: OwnerCoachDashboardActivity[] };
  week: { activities: OwnerCoachDashboardActivity[] };
  players: OwnerCoachDashboardPlayer[];
  filters: {
    statuses: Array<{ value: string; label: string }>;
    teams: OwnerCoachDashboardTeam[];
    tags: OwnerCoachDashboardTag[];
    levels: string[];
    positions: string[];
  };
};

export type OwnerCoachDashboardTag = {
  id: string;
  name: string;
  color: string;
};

export type OwnerCoachDashboardTeam = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
};

export type OwnerCoachDashboardActivity = {
  id: string;
  title: string;
  activityDate: string;
  activityTime: string | null;
  activityStart: string | null;
  location: string | null;
  teamId: string | null;
  teamName: string | null;
  playerIds: string[];
  playerCount: number;
  totalTasks: number;
  completedTasks: number;
  openTasks: number;
};

export type OwnerCoachDashboardQuickAction = {
  type: 'profile' | 'tasks' | 'reports' | 'program' | 'goals' | 'chat';
  label: string;
  target: string;
  playerId: string;
};

export type OwnerCoachDashboardPlayer = {
  ownerPlayerId: string;
  playerId: string;
  displayName: string;
  ownerRosterStatus: string;
  source: string;
  crmStatus: 'active' | 'trial' | 'paused' | 'former';
  positions: string[];
  primaryPosition: string | null;
  playingLevel: string | null;
  clubName: string | null;
  tags: OwnerCoachDashboardTag[];
  tagIds: string[];
  teams: OwnerCoachDashboardTeam[];
  teamIds: string[];
  lastActivityAt: string | null;
  nextActivityAt: string | null;
  todayActivitiesCount: number;
  weekActivitiesCount: number;
  upcomingActivitiesCount: number;
  openTasks: number;
  completedTasks: number;
  missingTasks: number;
  taskCompletionRate: number | null;
  recentFeedbackCount: number;
  lastFeedbackAt: string | null;
  isInactive: boolean;
  withoutPlan: boolean;
  alertTypes: OwnerDashboardAlertType[];
  quickActions: OwnerCoachDashboardQuickAction[];
};

export type OwnerCoachDashboardAlert = {
  id: string;
  type: OwnerDashboardAlertType;
  severity: OwnerDashboardAlertSeverity;
  title: string;
  subtitle: string;
  playerId: string;
  playerName: string;
  teamIds: string[];
  teamNames: string[];
  count: number;
  occurredAt: string | null;
  action: {
    target: 'player_crm' | 'activities';
    playerId: string;
  };
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALERT_TYPES = new Set(['missing_tasks', 'inactive_player', 'new_feedback', 'upcoming_session', 'no_plan']);
const ALERT_SEVERITIES = new Set(['high', 'warning', 'info']);
const ALERT_ACTION_TARGETS = new Set(['player_crm', 'activities']);
const CRM_STATUSES = new Set(['active', 'trial', 'paused', 'former']);

const RPC_ERROR_MAP: Record<string, { code: ErrorCode; message: string; status: number }> = {
  UNAUTHORIZED: { code: 'UNAUTHORIZED', message: 'Unauthorized.', status: 401 },
  FORBIDDEN: { code: 'FORBIDDEN', message: 'You do not have access to this owner account.', status: 403 },
  OWNER_ACCOUNT_NOT_FOUND: { code: 'OWNER_ACCOUNT_NOT_FOUND', message: 'Owner account not found.', status: 404 },
  VALIDATION_ERROR: { code: 'VALIDATION_ERROR', message: 'Request payload is invalid.', status: 400 },
};

function asRecord(value: unknown, fieldName = 'payload'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('INTERNAL_ERROR', `${fieldName} must be an object.`, 500);
  }

  return value as Record<string, unknown>;
}

function requireInputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('VALIDATION_ERROR', 'Request body must be an object.', 400);
  }

  return value as Record<string, unknown>;
}

function requireUuid(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid UUID.`, 400);
  }

  return value.trim();
}

function optionalIsoDateTimeString(value: unknown, fieldName: string): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new AppError('VALIDATION_ERROR', `${fieldName} must be a valid ISO datetime string.`, 400);
  }

  return value.trim();
}

function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AppError('INTERNAL_ERROR', `${fieldName} is missing from backend response.`, 500);
  }

  return value.trim();
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new AppError('INTERNAL_ERROR', `${fieldName} is missing from backend response.`, 500);
  }

  return value;
}

function nullableNumber(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return requireNumber(value, fieldName);
}

function requireBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AppError('INTERNAL_ERROR', `${fieldName} is missing from backend response.`, 500);
  }

  return value;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeTags(value: unknown): OwnerCoachDashboardTag[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = asRecord(item, 'tag');
    return {
      id: requireString(record.id, 'tag.id'),
      name: requireString(record.name, 'tag.name'),
      color: requireString(record.color, 'tag.color'),
    };
  });
}

function normalizeTeams(value: unknown): OwnerCoachDashboardTeam[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = asRecord(item, 'team');
    return {
      id: requireString(record.id, 'team.id'),
      name: requireString(record.name, 'team.name'),
      description: nullableString(record.description),
      memberCount: requireNumber(record.memberCount ?? 0, 'team.memberCount'),
    };
  });
}

function normalizeActivity(value: unknown): OwnerCoachDashboardActivity {
  const record = asRecord(value, 'activity');
  return {
    id: requireString(record.id, 'activity.id'),
    title: requireString(record.title, 'activity.title'),
    activityDate: requireString(record.activityDate, 'activity.activityDate'),
    activityTime: nullableString(record.activityTime),
    activityStart: nullableString(record.activityStart),
    location: nullableString(record.location),
    teamId: nullableString(record.teamId),
    teamName: nullableString(record.teamName),
    playerIds: stringArray(record.playerIds),
    playerCount: requireNumber(record.playerCount, 'activity.playerCount'),
    totalTasks: requireNumber(record.totalTasks, 'activity.totalTasks'),
    completedTasks: requireNumber(record.completedTasks, 'activity.completedTasks'),
    openTasks: requireNumber(record.openTasks, 'activity.openTasks'),
  };
}

function normalizeActivities(value: unknown): OwnerCoachDashboardActivity[] {
  if (!Array.isArray(value)) return [];
  return value.map(normalizeActivity);
}

function normalizeQuickActions(value: unknown): OwnerCoachDashboardQuickAction[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const record = asRecord(item, 'quickAction');
    const type = requireString(record.type, 'quickAction.type') as OwnerCoachDashboardQuickAction['type'];
    return {
      type,
      label: requireString(record.label, 'quickAction.label'),
      target: requireString(record.target, 'quickAction.target'),
      playerId: requireString(record.playerId, 'quickAction.playerId'),
    };
  });
}

function normalizePlayer(value: unknown): OwnerCoachDashboardPlayer {
  const record = asRecord(value, 'player');
  const crmStatus = requireString(record.crmStatus, 'player.crmStatus');
  const alertTypes = stringArray(record.alertTypes).filter((type): type is OwnerDashboardAlertType => ALERT_TYPES.has(type));

  return {
    ownerPlayerId: requireString(record.ownerPlayerId, 'player.ownerPlayerId'),
    playerId: requireString(record.playerId, 'player.playerId'),
    displayName: requireString(record.displayName, 'player.displayName'),
    ownerRosterStatus: requireString(record.ownerRosterStatus, 'player.ownerRosterStatus'),
    source: requireString(record.source, 'player.source'),
    crmStatus: (CRM_STATUSES.has(crmStatus) ? crmStatus : 'active') as OwnerCoachDashboardPlayer['crmStatus'],
    positions: stringArray(record.positions),
    primaryPosition: nullableString(record.primaryPosition),
    playingLevel: nullableString(record.playingLevel),
    clubName: nullableString(record.clubName),
    tags: normalizeTags(record.tags),
    tagIds: stringArray(record.tagIds),
    teams: normalizeTeams(record.teams),
    teamIds: stringArray(record.teamIds),
    lastActivityAt: nullableString(record.lastActivityAt),
    nextActivityAt: nullableString(record.nextActivityAt),
    todayActivitiesCount: requireNumber(record.todayActivitiesCount, 'player.todayActivitiesCount'),
    weekActivitiesCount: requireNumber(record.weekActivitiesCount, 'player.weekActivitiesCount'),
    upcomingActivitiesCount: requireNumber(record.upcomingActivitiesCount, 'player.upcomingActivitiesCount'),
    openTasks: requireNumber(record.openTasks, 'player.openTasks'),
    completedTasks: requireNumber(record.completedTasks, 'player.completedTasks'),
    missingTasks: requireNumber(record.missingTasks, 'player.missingTasks'),
    taskCompletionRate: nullableNumber(record.taskCompletionRate, 'player.taskCompletionRate'),
    recentFeedbackCount: requireNumber(record.recentFeedbackCount, 'player.recentFeedbackCount'),
    lastFeedbackAt: nullableString(record.lastFeedbackAt),
    isInactive: requireBoolean(record.isInactive, 'player.isInactive'),
    withoutPlan: requireBoolean(record.withoutPlan, 'player.withoutPlan'),
    alertTypes,
    quickActions: normalizeQuickActions(record.quickActions),
  };
}

function normalizeAlert(value: unknown): OwnerCoachDashboardAlert {
  const record = asRecord(value, 'alert');
  const type = requireString(record.type, 'alert.type');
  const severity = requireString(record.severity, 'alert.severity');
  const action = asRecord(record.action, 'alert.action');
  const actionTarget = requireString(action.target, 'alert.action.target');

  return {
    id: requireString(record.id, 'alert.id'),
    type: (ALERT_TYPES.has(type) ? type : 'missing_tasks') as OwnerDashboardAlertType,
    severity: (ALERT_SEVERITIES.has(severity) ? severity : 'info') as OwnerDashboardAlertSeverity,
    title: requireString(record.title, 'alert.title'),
    subtitle: requireString(record.subtitle, 'alert.subtitle'),
    playerId: requireString(record.playerId, 'alert.playerId'),
    playerName: requireString(record.playerName, 'alert.playerName'),
    teamIds: stringArray(record.teamIds),
    teamNames: stringArray(record.teamNames),
    count: requireNumber(record.count, 'alert.count'),
    occurredAt: nullableString(record.occurredAt),
    action: {
      target: (ALERT_ACTION_TARGETS.has(actionTarget) ? actionTarget : 'player_crm') as OwnerCoachDashboardAlert['action']['target'],
      playerId: requireString(action.playerId, 'alert.action.playerId'),
    },
  };
}

function normalizeMetrics(value: unknown): OwnerCoachDashboardPayload['metrics'] {
  const record = asRecord(value, 'metrics');
  return {
    totalPlayers: requireNumber(record.totalPlayers, 'metrics.totalPlayers'),
    activePlayers: requireNumber(record.activePlayers, 'metrics.activePlayers'),
    trialPlayers: requireNumber(record.trialPlayers, 'metrics.trialPlayers'),
    pausedPlayers: requireNumber(record.pausedPlayers, 'metrics.pausedPlayers'),
    formerPlayers: requireNumber(record.formerPlayers, 'metrics.formerPlayers'),
    playersMissingTasks: requireNumber(record.playersMissingTasks, 'metrics.playersMissingTasks'),
    inactivePlayers: requireNumber(record.inactivePlayers, 'metrics.inactivePlayers'),
    playersWithoutPlan: requireNumber(record.playersWithoutPlan, 'metrics.playersWithoutPlan'),
    newFeedback: requireNumber(record.newFeedback, 'metrics.newFeedback'),
    todayActivities: requireNumber(record.todayActivities, 'metrics.todayActivities'),
    weekActivities: requireNumber(record.weekActivities, 'metrics.weekActivities'),
    upcomingSessions: requireNumber(record.upcomingSessions, 'metrics.upcomingSessions'),
    openTasks: requireNumber(record.openTasks, 'metrics.openTasks'),
    completedTasks: requireNumber(record.completedTasks, 'metrics.completedTasks'),
    taskCompletionRate: nullableNumber(record.taskCompletionRate, 'metrics.taskCompletionRate'),
  };
}

function normalizeWindow(value: unknown): OwnerCoachDashboardPayload['window'] {
  const record = asRecord(value, 'window');
  return {
    today: requireString(record.today, 'window.today'),
    weekStart: requireString(record.weekStart, 'window.weekStart'),
    weekEnd: requireString(record.weekEnd, 'window.weekEnd'),
    inactivityCutoff: requireString(record.inactivityCutoff, 'window.inactivityCutoff'),
    recentFeedbackCutoff: requireString(record.recentFeedbackCutoff, 'window.recentFeedbackCutoff'),
    taskCutoff: requireString(record.taskCutoff, 'window.taskCutoff'),
  };
}

export function parseOwnerCoachDashboardBody(body: unknown): OwnerCoachDashboardInput {
  const record = requireInputRecord(body);
  return {
    ownerAccountId: requireUuid(record.ownerAccountId, 'ownerAccountId'),
    now: optionalIsoDateTimeString(record.now, 'now'),
  };
}

export function normalizeOwnerCoachDashboardPayload(payload: unknown): OwnerCoachDashboardPayload {
  const record = asRecord(payload);
  const owner = asRecord(record.ownerAccount, 'ownerAccount');
  const actor = asRecord(record.actor, 'actor');
  const today = asRecord(record.today, 'today');
  const week = asRecord(record.week, 'week');
  const filters = asRecord(record.filters, 'filters');

  return {
    ownerAccount: {
      ownerAccountId: requireString(owner.ownerAccountId, 'ownerAccount.ownerAccountId'),
      ownerType: owner.ownerType === 'club' ? 'club' : 'private_coach_business',
      name: requireString(owner.name, 'ownerAccount.name'),
      status: requireString(owner.status, 'ownerAccount.status'),
      coachAccountId: nullableString(owner.coachAccountId),
      clubId: nullableString(owner.clubId),
    },
    actor: {
      userId: requireString(actor.userId, 'actor.userId'),
      roles: stringArray(actor.roles),
      canManageOwner: requireBoolean(actor.canManageOwner, 'actor.canManageOwner'),
      canCoach: requireBoolean(actor.canCoach, 'actor.canCoach'),
    },
    generatedAt: requireString(record.generatedAt, 'generatedAt'),
    window: normalizeWindow(record.window),
    seatStatus: normalizeOwnerSeatStatusPayload(record.seatStatus),
    metrics: normalizeMetrics(record.metrics),
    alerts: Array.isArray(record.alerts) ? record.alerts.map(normalizeAlert) : [],
    today: {
      activities: normalizeActivities(today.activities),
    },
    week: {
      activities: normalizeActivities(week.activities),
    },
    players: Array.isArray(record.players) ? record.players.map(normalizePlayer) : [],
    filters: {
      statuses: Array.isArray(filters.statuses)
        ? filters.statuses.map((item) => {
            const status = asRecord(item, 'filter.status');
            return {
              value: requireString(status.value, 'filter.status.value'),
              label: requireString(status.label, 'filter.status.label'),
            };
          })
        : [],
      teams: normalizeTeams(filters.teams),
      tags: normalizeTags(filters.tags),
      levels: stringArray(filters.levels),
      positions: stringArray(filters.positions),
    },
  };
}

function mapOwnerDashboardRpcError(error: RpcError | null): AppError | null {
  if (!error?.message) {
    return null;
  }

  const normalized = error.message.trim();
  const mapped = RPC_ERROR_MAP[normalized];
  if (mapped) {
    return new AppError(mapped.code, mapped.message, mapped.status);
  }

  if (normalized.includes('FORBIDDEN')) {
    return new AppError('FORBIDDEN', 'You do not have access to this owner account.', 403);
  }

  if (normalized.includes('OWNER_ACCOUNT_NOT_FOUND')) {
    return new AppError('OWNER_ACCOUNT_NOT_FOUND', 'Owner account not found.', 404);
  }

  return null;
}

export async function getOwnerCoachDashboardAction(
  client: RpcClient,
  actorUserId: string,
  body: unknown
): Promise<OwnerCoachDashboardPayload> {
  const input = parseOwnerCoachDashboardBody(body);
  const args: Record<string, unknown> = {
    p_actor_user_id: actorUserId,
    p_owner_account_id: input.ownerAccountId,
  };

  if (input.now) {
    args.p_now = input.now;
  }

  const { data, error } = await client.rpc<unknown>('get_owner_coach_dashboard_payload', args);
  const mappedError = mapOwnerDashboardRpcError(error);
  if (mappedError) {
    throw mappedError;
  }

  if (error) {
    throw new AppError('INTERNAL_ERROR', error.message || 'Could not load owner coach dashboard.', 500);
  }

  return normalizeOwnerCoachDashboardPayload(data);
}
