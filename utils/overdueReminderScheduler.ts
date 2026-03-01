import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { buildNotificationBody, getOverdueNotificationTitle, selectOverdueTasks } from '@/utils/overdueReminder';

const STORAGE_KEY = '@overdue_reminder_settings_v1';

export type OverdueReminderSettings = {
  enabled: boolean;
  startTimeMinutes: number;
  intervalMinutes: number;
  scheduledNotificationIds: string[];
};

export const OVERDUE_INTERVAL_OPTIONS_MINUTES = [60, 120, 240, 480, 1440] as const;

export const DEFAULT_OVERDUE_REMINDER_SETTINGS: OverdueReminderSettings = {
  enabled: false,
  startTimeMinutes: 8 * 60,
  intervalMinutes: 120,
  scheduledNotificationIds: [],
};

function sanitizeNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadOverdueReminderSettings(): Promise<OverdueReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OVERDUE_REMINDER_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<OverdueReminderSettings>;
    return {
      enabled: parsed.enabled === true,
      startTimeMinutes: sanitizeNumber(parsed.startTimeMinutes, DEFAULT_OVERDUE_REMINDER_SETTINGS.startTimeMinutes),
      intervalMinutes: sanitizeNumber(parsed.intervalMinutes, DEFAULT_OVERDUE_REMINDER_SETTINGS.intervalMinutes),
      scheduledNotificationIds: Array.isArray(parsed.scheduledNotificationIds)
        ? parsed.scheduledNotificationIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
        : [],
    };
  } catch {
    return DEFAULT_OVERDUE_REMINDER_SETTINGS;
  }
}

export async function persistOverdueReminderSettings(settings: OverdueReminderSettings): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export async function cancelOverdueReminderNotifications(notificationIds: string[]): Promise<void> {
  const uniqueIds = Array.from(new Set((notificationIds || []).filter(Boolean)));
  await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // Ignore stale ids.
      }
    }),
  );
}

export function getNextStartOccurrence(startTimeMinutes: number, now: Date = new Date()): Date {
  const hours = Math.floor(startTimeMinutes / 60);
  const minutes = startTimeMinutes % 60;

  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes, 0, 0);

  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

function buildContent(activities: any[], scheduledDate?: Date): Notifications.NotificationContentInput {
  const overdueTasks = selectOverdueTasks(activities, scheduledDate);
  return {
    title: getOverdueNotificationTitle(),
    body: buildNotificationBody(overdueTasks),
    sound: 'default',
    data: {
      type: 'overdue-reminder',
      url: '/(tabs)/(home)?taskFilter=overdue',
      target: 'tasks_overdue_overview',
      generatedAt: new Date().toISOString(),
      ...(scheduledDate ? { scheduledFor: scheduledDate.toISOString() } : null),
    },
  };
}

export function buildScheduleDates(nextStart: Date, intervalMinutes: number): Date[] {
  const safeIntervalMinutes = Math.max(1, Math.round(intervalMinutes));
  const intervalMs = safeIntervalMinutes * 60 * 1000;
  const windowEnd = nextStart.getTime() + 24 * 60 * 60 * 1000;

  const dates: Date[] = [];
  let current = new Date(nextStart);

  while (current.getTime() <= windowEnd) {
    dates.push(new Date(current));
    current = new Date(current.getTime() + intervalMs);
  }

  return dates;
}

export async function scheduleOverdueReminderNotifications(params: {
  settings: OverdueReminderSettings;
  activities: any[];
  now?: Date;
}): Promise<string[]> {
  const { settings, activities, now = new Date() } = params;

  const nextStart = getNextStartOccurrence(settings.startTimeMinutes, now);
  const scheduleDates = buildScheduleDates(nextStart, settings.intervalMinutes);
  const androidChannel = Platform.OS === 'android' ? { channelId: 'task-reminders' } : {};
  const notificationIds: string[] = [];

  for (const scheduledDate of scheduleDates) {
    const content = buildContent(activities, scheduledDate);
    const notificationId = await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: scheduledDate,
        ...androidChannel,
      },
    });
    notificationIds.push(notificationId);
  }

  return notificationIds;
}

export async function rescheduleOverdueReminderNotifications(params: {
  previousNotificationIds: string[];
  settings: OverdueReminderSettings;
  activities: any[];
  now?: Date;
}): Promise<string[]> {
  const { previousNotificationIds, settings, activities, now } = params;
  await cancelOverdueReminderNotifications(previousNotificationIds);

  if (!settings.enabled) {
    return [];
  }

  return scheduleOverdueReminderNotifications({
    settings,
    activities,
    now,
  });
}

export function formatTimeFromMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function buildHalfHourTimeOptions(): { label: string; value: number }[] {
  const options: { label: string; value: number }[] = [];
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    options.push({
      label: formatTimeFromMinutes(minutes),
      value: minutes,
    });
  }
  return options;
}

export function buildIntervalOptions(): { label: string; value: number }[] {
  return OVERDUE_INTERVAL_OPTIONS_MINUTES.map((minutes) => {
    if (minutes % 60 === 0) {
      const hours = minutes / 60;
      return {
        label: `${hours}t`,
        value: minutes,
      };
    }

    return {
      label: `${minutes} min`,
      value: minutes,
    };
  });
}
