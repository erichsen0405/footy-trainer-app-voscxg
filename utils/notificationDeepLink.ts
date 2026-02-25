import type * as Notifications from 'expo-notifications';

export type NotificationRoute = {
  pathname: '/activity-details' | '/(tabs)/profile';
  params: Record<string, string>;
};

type UnknownRecord = Record<string, unknown>;

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

function isObjectRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJsonObject(value: unknown): UnknownRecord | null {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  try {
    const parsed = JSON.parse(normalized);
    return isObjectRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectDataSources(rawData: UnknownRecord): UnknownRecord[] {
  const sources: UnknownRecord[] = [];
  const queue: UnknownRecord[] = [rawData];
  const seen = new Set<UnknownRecord>();
  const nestedKeys = ['data', 'payload', 'customData', 'custom_data', 'meta'];

  while (queue.length) {
    const source = queue.shift();
    if (!source || seen.has(source)) continue;
    seen.add(source);
    sources.push(source);

    for (const key of nestedKeys) {
      const nested = (source as any)?.[key];
      if (isObjectRecord(nested)) {
        if (!seen.has(nested)) queue.push(nested);
        continue;
      }
      const parsed = parseJsonObject(nested);
      if (parsed && !seen.has(parsed)) queue.push(parsed);
    }
  }

  return sources;
}

function getFirstString(sources: UnknownRecord[], keys: string[]): string | null {
  for (const source of sources) {
    for (const key of keys) {
      const value = normalizeString((source as any)?.[key]);
      if (value) return value;
    }
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

function normalizeActivityId(sources: UnknownRecord[], queryParams: Record<string, string>): string | null {
  return (
    getFirstString(sources, ['activityId', 'activity_id', 'activityID', 'openActivityId', 'open_activity_id']) ??
    getFirstString([queryParams], ['activityId', 'activity_id', 'id'])
  );
}

function normalizeTaskId(sources: UnknownRecord[], queryParams: Record<string, string>): string | null {
  return (
    getFirstString(sources, [
      'taskId',
      'task_id',
      'taskID',
      'taskInstanceId',
      'task_instance_id',
      'openTaskId',
      'open_task_id',
      'openFeedbackTaskId',
      'open_feedback_task_id',
      'feedbackTaskId',
      'feedback_task_id',
    ]) ??
    getFirstString([queryParams], [
      'openTaskId',
      'open_task_id',
      'openFeedbackTaskId',
      'open_feedback_task_id',
      'taskId',
      'task_id',
      'taskInstanceId',
      'task_instance_id',
    ])
  );
}

function isFeedbackTarget(sources: UnknownRecord[], queryParams: Record<string, string>): boolean {
  const type = getFirstString(sources, ['type', 'notificationType', 'notification_type'])?.toLowerCase() ?? '';
  const templateId = getFirstString(sources, ['templateId', 'template_id', 'feedbackTemplateId', 'feedback_template_id']);
  const queryFeedbackTaskId = getFirstString([queryParams], ['openFeedbackTaskId', 'open_feedback_task_id']);
  return (
    type === 'after-training-feedback' ||
    type === 'after_training_feedback' ||
    type === 'feedback' ||
    Boolean(templateId || queryFeedbackTaskId)
  );
}

export function buildNotificationRouteFromData(rawData: Record<string, unknown>): NotificationRoute | null {
  const sources = collectDataSources(rawData);
  const target = getFirstString(sources, ['target'])?.toLowerCase() ?? '';
  const requestId = getFirstString(sources, ['requestId', 'request_id']);

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

  const queryParams = parseQueryFromUrl(
    getFirstString(sources, ['url', 'deepLink', 'deep_link', 'link']),
  );
  const activityId = normalizeActivityId(sources, queryParams);
  if (!activityId) return null;

  const params: Record<string, string> = {
    id: activityId,
    activityId,
  };

  const taskId = normalizeTaskId(sources, queryParams);
  if (taskId) {
    if (isFeedbackTarget(sources, queryParams)) {
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
