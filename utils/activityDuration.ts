import { parseISO } from 'date-fns';

const DURATION_KEYS = ['duration', 'durationMinutes', 'duration_minutes'] as const;

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

  const externalStart = parseDateAndTime(activity?.start_date, activity?.start_time);
  const externalEnd = parseDateAndTime(activity?.end_date, activity?.end_time);
  const externalMinutes = diffMinutes(externalStart, externalEnd);
  if (externalMinutes !== null) return externalMinutes;

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
