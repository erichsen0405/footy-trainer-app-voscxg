import type { Activity, ActivityCategory, Task } from '@/types';

type RouteSnapshotTask = Task & {
  reminder_minutes?: number | null;
  after_training_enabled?: boolean | null;
  after_training_delay_minutes?: number | null;
  task_duration_enabled?: boolean | null;
  task_duration_minutes?: number | null;
  video_url?: string | null;
  task_template_id?: string | null;
  feedback_template_id?: string | null;
};

type RouteSnapshotActivity = {
  id: string;
  title: string;
  date: string;
  time: string;
  endTime?: string | null;
  location: string;
  category: ActivityCategory;
  tasks: RouteSnapshotTask[];
  intensity?: number | null;
  intensityEnabled?: boolean;
  intensityNote?: string | null;
  isExternal?: boolean;
  externalCalendarId?: string | null;
  externalEventId?: string | null;
  externalEventRowId?: string | null;
};

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized.length ? normalized : null;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeNumberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCategory(activity: any): ActivityCategory {
  return {
    id: normalizeString(activity?.category?.id ?? activity?.category_id),
    name: normalizeString(activity?.category?.name) || 'Ukendt kategori',
    color: normalizeString(activity?.category?.color) || '#999999',
    emoji: normalizeString(activity?.category?.emoji) || '⚽️',
  };
}

function normalizeTask(task: any): RouteSnapshotTask {
  const videoUrl =
    normalizeNullableString(task?.videoUrl) ??
    normalizeNullableString(task?.video_url);
  const taskTemplateId =
    normalizeNullableString(task?.taskTemplateId) ??
    normalizeNullableString(task?.task_template_id);
  const feedbackTemplateId =
    normalizeNullableString(task?.feedbackTemplateId) ??
    normalizeNullableString(task?.feedback_template_id);
  const reminderMinutes =
    normalizeNumberOrNull(task?.reminder_minutes) ??
    normalizeNumberOrNull(task?.reminder);
  const afterTrainingDelayMinutes =
    normalizeNumberOrNull(task?.afterTrainingDelayMinutes) ??
    normalizeNumberOrNull(task?.after_training_delay_minutes);
  const taskDurationMinutes =
    normalizeNumberOrNull(task?.taskDurationMinutes) ??
    normalizeNumberOrNull(task?.task_duration_minutes);
  const taskDurationEnabled =
    normalizeBoolean(task?.taskDurationEnabled) ||
    normalizeBoolean(task?.task_duration_enabled);

  return {
    id: normalizeString(task?.id ?? task?.task_id),
    title: normalizeString(task?.title),
    description: normalizeString(task?.description),
    completed: normalizeBoolean(task?.completed),
    isTemplate: false,
    categoryIds: Array.isArray(task?.categoryIds) ? task.categoryIds : [],
    reminder: reminderMinutes ?? undefined,
    reminder_minutes: reminderMinutes,
    subtasks: Array.isArray(task?.subtasks) ? task.subtasks : [],
    videoUrl: videoUrl ?? undefined,
    video_url: videoUrl,
    afterTrainingEnabled:
      normalizeBoolean(task?.afterTrainingEnabled) ||
      normalizeBoolean(task?.after_training_enabled),
    after_training_enabled:
      normalizeBoolean(task?.after_training_enabled) ||
      normalizeBoolean(task?.afterTrainingEnabled),
    afterTrainingDelayMinutes: afterTrainingDelayMinutes,
    after_training_delay_minutes: afterTrainingDelayMinutes,
    taskDurationEnabled: taskDurationEnabled,
    task_duration_enabled: taskDurationEnabled,
    taskDurationMinutes: taskDurationMinutes,
    task_duration_minutes: taskDurationMinutes,
    taskTemplateId: taskTemplateId,
    task_template_id: taskTemplateId,
    feedbackTemplateId: feedbackTemplateId,
    feedback_template_id: feedbackTemplateId,
    isFeedbackTask:
      normalizeBoolean(task?.isFeedbackTask) ||
      normalizeBoolean(task?.is_feedback_task),
  };
}

export function serializeActivitySnapshotForRoute(activity: any, resolvedDate: Date): string | null {
  if (!activity || !(resolvedDate instanceof Date) || Number.isNaN(resolvedDate.getTime())) {
    return null;
  }

  const id = normalizeString(activity?.id ?? activity?.activity_id ?? activity?.activityId);
  const title = normalizeString(activity?.title ?? activity?.name);
  const time =
    normalizeString(activity?.activity_time ?? activity?.start_time ?? activity?.time) ||
    normalizeString(resolvedDate.toISOString().slice(11, 19));

  if (!id || !title || !time) {
    return null;
  }

  const snapshot: RouteSnapshotActivity = {
    id,
    title,
    date: resolvedDate.toISOString(),
    time,
    endTime:
      normalizeNullableString(activity?.activity_end_time) ??
      normalizeNullableString(activity?.end_time) ??
      normalizeNullableString(activity?.endTime),
    location: normalizeString(activity?.location),
    category: normalizeCategory(activity),
    tasks: Array.isArray(activity?.tasks) ? activity.tasks.map(normalizeTask) : [],
    intensity: normalizeNumberOrNull(activity?.intensity),
    intensityEnabled:
      normalizeBoolean(activity?.intensityEnabled) ||
      normalizeBoolean(activity?.intensity_enabled),
    intensityNote:
      normalizeNullableString(activity?.intensityNote) ??
      normalizeNullableString(activity?.intensity_note),
    isExternal:
      normalizeBoolean(activity?.isExternal) ||
      normalizeBoolean(activity?.is_external),
    externalCalendarId:
      normalizeNullableString(activity?.externalCalendarId) ??
      normalizeNullableString(activity?.external_calendar_id),
    externalEventId:
      normalizeNullableString(activity?.externalEventId) ??
      normalizeNullableString(activity?.external_event_id),
    externalEventRowId:
      normalizeNullableString(activity?.externalEventRowId) ??
      normalizeNullableString(activity?.external_event_row_id),
  };

  try {
    return JSON.stringify(snapshot);
  } catch {
    return null;
  }
}

export function deserializeActivitySnapshotFromRoute(value: unknown): Activity | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string' || !raw.trim().length) {
    return null;
  }

  try {
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch {
      decoded = raw;
    }

    const parsed = JSON.parse(decoded) as Partial<RouteSnapshotActivity> | null;
    const id = normalizeString(parsed?.id);
    const title = normalizeString(parsed?.title);
    const dateIso = normalizeString(parsed?.date);
    const time = normalizeString(parsed?.time);
    const date = new Date(dateIso);

    if (!id || !title || !time || Number.isNaN(date.getTime())) {
      return null;
    }

    return {
      id,
      title,
      date,
      time,
      endTime: normalizeNullableString(parsed?.endTime),
      location: normalizeString(parsed?.location),
      category: {
        id: normalizeString(parsed?.category?.id),
        name: normalizeString(parsed?.category?.name) || 'Ukendt kategori',
        color: normalizeString(parsed?.category?.color) || '#999999',
        emoji: normalizeString(parsed?.category?.emoji) || '⚽️',
      },
      tasks: Array.isArray(parsed?.tasks) ? parsed.tasks.map(normalizeTask) : [],
      intensity: normalizeNumberOrNull(parsed?.intensity),
      intensityEnabled: normalizeBoolean(parsed?.intensityEnabled),
      intensityNote: normalizeNullableString(parsed?.intensityNote),
      isExternal: normalizeBoolean(parsed?.isExternal),
      externalCalendarId: normalizeNullableString(parsed?.externalCalendarId) ?? undefined,
      externalEventId: normalizeNullableString(parsed?.externalEventId) ?? undefined,
      externalEventRowId: normalizeNullableString(parsed?.externalEventRowId) ?? undefined,
    };
  } catch {
    return null;
  }
}
