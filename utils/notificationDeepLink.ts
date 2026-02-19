import type * as Notifications from 'expo-notifications';

export type NotificationRoute = {
  pathname: '/activity-details' | '/(tabs)/profile';
  params: Record<string, string>;
};

function normalizeString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const raw = String(value);
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const trimmed = decoded.trim();
  if (!trimmed.length) return null;
  const lowered = trimmed.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') return null;
  return trimmed;
}

function getFirstString(data: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = normalizeString((data as any)?.[key]);
    if (value) return value;
  }
  return null;
}

function parseQueryFromUrl(rawUrl: string | null): Record<string, string> {
  if (!rawUrl) return {};
  const queryIndex = rawUrl.indexOf('?');
  if (queryIndex < 0) return {};
  const query = rawUrl.slice(queryIndex + 1);
  if (!query) return {};
  return query.split('&').reduce<Record<string, string>>((acc, pair) => {
    if (!pair) return acc;
    const [rawKey, ...rawValueParts] = pair.split('=');
    if (!rawKey) return acc;
    const key = normalizeString(rawKey);
    const value = normalizeString(rawValueParts.join('='));
    if (!key || !value) return acc;
    acc[key] = value;
    return acc;
  }, {});
}

function normalizeActivityId(data: Record<string, unknown>, queryParams: Record<string, string>): string | null {
  return (
    getFirstString(data, ['activityId', 'activity_id', 'activityID']) ??
    getFirstString(queryParams, ['activityId', 'activity_id', 'id'])
  );
}

function normalizeTaskId(data: Record<string, unknown>, queryParams: Record<string, string>): string | null {
  return (
    getFirstString(data, ['taskId', 'task_id', 'taskID', 'id']) ??
    getFirstString(queryParams, ['openTaskId', 'openFeedbackTaskId', 'taskId', 'task_id', 'id'])
  );
}

function isFeedbackTarget(data: Record<string, unknown>, queryParams: Record<string, string>): boolean {
  const type = getFirstString(data, ['type'])?.toLowerCase() ?? '';
  const templateId = getFirstString(data, ['templateId', 'template_id']);
  const queryFeedbackTaskId = getFirstString(queryParams, ['openFeedbackTaskId']);
  return type === 'after-training-feedback' || type === 'feedback' || Boolean(templateId || queryFeedbackTaskId);
}

export function buildNotificationRouteFromData(data: Record<string, unknown>): NotificationRoute | null {
  const target = getFirstString(data, ['target'])?.toLowerCase() ?? '';
  const requestId = getFirstString(data, ['requestId', 'request_id']);

  if (target === 'profile_trainer_requests') {
    const params: Record<string, string> = { openTrainerRequests: '1' };
    if (requestId) params.requestId = requestId;
    return { pathname: '/(tabs)/profile', params };
  }

  if (target === 'profile_team_players') {
    const params: Record<string, string> = { openTeamPlayers: '1' };
    if (requestId) params.requestId = requestId;
    return { pathname: '/(tabs)/profile', params };
  }

  const queryParams = parseQueryFromUrl(getFirstString(data, ['url']));
  const activityId = normalizeActivityId(data, queryParams);
  if (!activityId) return null;

  const params: Record<string, string> = {
    id: activityId,
    activityId,
  };

  const taskId = normalizeTaskId(data, queryParams);
  if (taskId) {
    if (isFeedbackTarget(data, queryParams)) {
      params.openFeedbackTaskId = taskId;
    } else {
      params.openTaskId = taskId;
    }
  }

  return { pathname: '/activity-details', params };
}

export function buildNotificationRouteFromResponse(
  response: Notifications.NotificationResponse,
): NotificationRoute | null {
  const data = (response?.notification?.request?.content?.data ?? {}) as Record<string, unknown>;
  return buildNotificationRouteFromData(data);
}
