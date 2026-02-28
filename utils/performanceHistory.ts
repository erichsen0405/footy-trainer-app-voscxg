import { startOfWeek } from 'date-fns';

import { getActivityEffectiveDurationMinutes } from '@/utils/activityDuration';

export type ResolvedHistoryActivity = any & {
  __resolvedDateTime: Date;
};

export type PerformanceHistoryWeek = {
  weekStart: Date;
  weekKey: string;
  activities: ResolvedHistoryActivity[];
  activityCount: number;
  totalCompletedTasks: number;
  totalMinutes: number;
};

export function resolveActivityDateTime(activity: any): Date | null {
  if (!activity) return null;

  if (activity.activity_date) {
    const date = activity.activity_date;
    const time = activity.activity_time ?? '12:00';
    const iso = `${date}T${time}`;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (activity.start_time) {
    const parsed = new Date(activity.start_time);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function getActivityTasks(activity: any): any[] {
  if (!activity) return [];
  const primary = Array.isArray(activity?.tasks) ? activity.tasks : [];
  if (primary.length) return primary;

  const fallback =
    Array.isArray(activity?.external_tasks) ? activity.external_tasks :
    Array.isArray(activity?.calendar_tasks) ? activity.calendar_tasks :
    [];

  return Array.isArray(fallback) ? fallback : [];
}

export function buildPerformanceHistoryWeeks(
  activities: any[] | null | undefined,
  now: Date = new Date(),
): PerformanceHistoryWeek[] {
  const safeActivities = Array.isArray(activities) ? activities : [];
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });

  const weeksByKey = new Map<string, PerformanceHistoryWeek>();

  safeActivities.forEach((activity) => {
    const resolvedDateTime = resolveActivityDateTime(activity);
    if (!resolvedDateTime) return;

    const weekStart = startOfWeek(resolvedDateTime, { weekStartsOn: 1 });
    if (weekStart.getTime() >= currentWeekStart.getTime()) {
      return;
    }

    const weekKey = weekStart.toISOString();
    const existing = weeksByKey.get(weekKey);
    const tasks = getActivityTasks(activity);
    const completedTasks = tasks.filter((task) => task?.completed === true);
    const hasTasks = tasks.length > 0;
    const allTasksCompleted = hasTasks && completedTasks.length === tasks.length;

    let activityMinutes = 0;
    if (!hasTasks || allTasksCompleted) {
      activityMinutes = getActivityEffectiveDurationMinutes(activity);
    }

    const resolvedActivity: ResolvedHistoryActivity = {
      ...activity,
      __resolvedDateTime: resolvedDateTime,
    };

    if (!existing) {
      weeksByKey.set(weekKey, {
        weekStart,
        weekKey,
        activities: [resolvedActivity],
        activityCount: 1,
        totalCompletedTasks: completedTasks.length,
        totalMinutes: activityMinutes,
      });
      return;
    }

    existing.activities.push(resolvedActivity);
    existing.activityCount += 1;
    existing.totalCompletedTasks += completedTasks.length;
    existing.totalMinutes += activityMinutes;
  });

  return Array.from(weeksByKey.values())
    .map((week) => ({
      ...week,
      activities: week.activities.sort(
        (a, b) => b.__resolvedDateTime.getTime() - a.__resolvedDateTime.getTime(),
      ),
    }))
    .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
}
