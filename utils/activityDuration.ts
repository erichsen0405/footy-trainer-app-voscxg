import { parseISO } from 'date-fns';

const DURATION_KEYS = ['duration', 'durationMinutes', 'duration_minutes'] as const;
const TASK_DURATION_ENABLED_KEYS = ['taskDurationEnabled', 'task_duration_enabled'] as const;
const TASK_DURATION_MINUTES_KEYS = [
  'taskDurationMinutes',
  'task_duration_minutes',
  'durationMinutes',
  'duration_minutes',
  'duration',
] as const;
const FEEDBACK_TITLE_PREFIX = /^feedback\s+p(?:å|a\u030a|a)(?:\s*[:\s-]|$)/i;

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseDateTime = (value: unknown): Date | null => {
  if (typeof value !== 'string' || !value.trim()) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  try {
    const parsed = parseISO(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

const parseDateAndTime = (dateValue: unknown, timeValue: unknown): Date | null => {
  if (typeof dateValue !== 'string' || !dateValue.trim()) return null;
  const safeTime = typeof timeValue === 'string' && timeValue.trim() ? timeValue : '00:00:00';
  return parseDateTime(`${dateValue}T${safeTime}`);
};

const diffMinutes = (start: Date | null, end: Date | null): number | null => {
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return null;
  return diffMs / 60000;
};

const parseTimeOfDayMinutes = (value: unknown): number | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(':') ? trimmed : `${trimmed}:00`;
  const [hRaw, mRaw] = normalized.split(':');
  const hours = Number(hRaw);
  const minutes = Number(mRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const normalizeIdString = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
};

const isFeedbackTaskLike = (task: any): boolean => {
  if (!task || typeof task !== 'object') return false;
  if (task?.isFeedbackTask === true || task?.is_feedback_task === true) return true;

  const feedbackTemplateId = normalizeIdString(task?.feedback_template_id ?? task?.feedbackTemplateId);
  if (feedbackTemplateId) return true;

  const title = typeof task?.title === 'string' ? task.title.trim() : '';
  if (title && FEEDBACK_TITLE_PREFIX.test(title)) return true;

  const description = typeof task?.description === 'string' ? task.description : '';
  if (description.includes('[[feedback_template_id:') || title.includes('[[feedback_template_id:')) {
    return true;
  }

  return false;
};

const isAllDayExternalEvent = (activity: any): boolean => {
  if (!activity || typeof activity !== 'object') return false;
  if (activity?.all_day === true || activity?.is_all_day === true || activity?.allDay === true) {
    return true;
  }

  const startDate = typeof activity?.start_date === 'string' ? activity.start_date : null;
  const endDate = typeof activity?.end_date === 'string' ? activity.end_date : null;
  if (!startDate || !endDate) return false;

  const startTimeMinutes = parseTimeOfDayMinutes(activity?.start_time);
  const endTimeMinutes = parseTimeOfDayMinutes(activity?.end_time);

  // Calendar all-day events are typically midnight->midnight and often next-day end date.
  if (startTimeMinutes !== 0 || endTimeMinutes !== 0) return false;

  const start = parseDateAndTime(startDate, '00:00:00');
  const end = parseDateAndTime(endDate, '00:00:00');
  if (!start || !end) return false;

  return end.getTime() > start.getTime();
};

export function getActivityDurationMinutes(activity: any): number {
  if (!activity || typeof activity !== 'object') return 0;

  for (const key of DURATION_KEYS) {
    const minutes = toFiniteNumber(activity?.[key]);
    if (minutes !== null && minutes > 0) return minutes;
  }

  const internalStart = parseDateAndTime(activity?.activity_date, activity?.activity_time);
  const internalEnd = parseDateAndTime(activity?.activity_date, activity?.activity_end_time);
  const internalMinutes = diffMinutes(internalStart, internalEnd);
  if (internalMinutes !== null) return internalMinutes;

  if (!isAllDayExternalEvent(activity)) {
    const externalStart = parseDateAndTime(activity?.start_date, activity?.start_time);
    const externalEnd = parseDateAndTime(activity?.end_date, activity?.end_time);
    const externalMinutes = diffMinutes(externalStart, externalEnd);
    if (externalMinutes !== null) return externalMinutes;
  }

  const timestampStart =
    parseDateTime(activity?.start_time) ??
    parseDateTime(activity?.start) ??
    parseDateTime(activity?.start_at) ??
    parseDateTime(activity?.start_timestamp);
  const timestampEnd =
    parseDateTime(activity?.end_time) ??
    parseDateTime(activity?.end) ??
    parseDateTime(activity?.end_at) ??
    parseDateTime(activity?.end_timestamp);
  const timestampMinutes = diffMinutes(timestampStart, timestampEnd);
  if (timestampMinutes !== null) return timestampMinutes;

  return 0;
}

export function getTaskDurationMinutes(task: any): number {
  if (!task || typeof task !== 'object') return 0;
  if (isFeedbackTaskLike(task)) return 0;

  const enabled = TASK_DURATION_ENABLED_KEYS.some((key) => task?.[key] === true);
  if (!enabled) return 0;

  for (const key of TASK_DURATION_MINUTES_KEYS) {
    const minutes = toFiniteNumber(task?.[key]);
    if (minutes !== null && minutes > 0) return minutes;
  }

  return 0;
}

export function getActivityEffectiveDurationMinutes(activity: any): number {
  if (!activity || typeof activity !== 'object') return 0;

  const tasks = Array.isArray(activity?.tasks) ? activity.tasks : [];
  const hasEnabledTaskDuration = tasks.some(
    (task: any) =>
      !isFeedbackTaskLike(task) &&
      TASK_DURATION_ENABLED_KEYS.some((key) => task?.[key] === true)
  );
  const taskMinutesSum = tasks.reduce(
    (sum: number, task: any) => sum + getTaskDurationMinutes(task),
    0
  );

  if (hasEnabledTaskDuration) {
    return taskMinutesSum;
  }

  return getActivityDurationMinutes(activity);
}

export function formatHoursDa(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return '0 t';
  }

  const roundedTenths = Math.round((minutes / 60) * 10) / 10;
  if (roundedTenths <= 0) {
    return '0 t';
  }

  return `${new Intl.NumberFormat('da-DK', { maximumFractionDigits: 1 }).format(roundedTenths)} t`;
}
