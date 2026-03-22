export type CelebrationType = 'task' | 'dayComplete';

export interface CelebrationDecisionInput {
  completedTasks: number;
  totalTasks: number;
  completingToDone: boolean;
}

export interface CelebrationProgress {
  completedToday: number;
  totalToday: number;
  remainingToday: number;
}

export interface DayTaskForCompletionCheck {
  id: string;
  completed: boolean;
  activityDate?: string | null;
}

export interface LastTaskOfDayInput {
  tasks: DayTaskForCompletionCheck[];
  completedTaskId: string;
  now?: Date;
  timezoneOffsetMinutes?: number;
  includeOverdue?: boolean;
}

export interface ActivityForCelebrationCheck {
  id: string;
  date?: Date | string | null;
  tasks?: Array<{
    id: string;
    completed: boolean;
  }> | null;
}

export interface CelebrationFromActivitiesInput {
  activities: ActivityForCelebrationCheck[];
  completedTaskId: string;
  completingToDone: boolean;
  fallbackCompletedTasks?: number;
  fallbackTotalTasks?: number;
  now?: Date;
  timezoneOffsetMinutes?: number;
  includeOverdue?: boolean;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

function toDateKeyWithOffset(date: Date, timezoneOffsetMinutes: number): string {
  const shifted = new Date(date.getTime() - timezoneOffsetMinutes * 60_000);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

function resolveTaskDateKey(activityDate: string | null | undefined, timezoneOffsetMinutes: number): string | null {
  if (typeof activityDate !== 'string') return null;
  const trimmed = activityDate.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parsed = new Date(trimmed);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return toDateKeyWithOffset(parsed, timezoneOffsetMinutes);
}

function resolveActivityDateKey(
  activityDate: Date | string | null | undefined,
  timezoneOffsetMinutes: number
): string | null {
  if (activityDate instanceof Date) {
    if (!Number.isFinite(activityDate.getTime())) return null;
    return toDateKeyWithOffset(activityDate, timezoneOffsetMinutes);
  }

  return resolveTaskDateKey(activityDate, timezoneOffsetMinutes);
}

export function resolveCelebrationTypeAfterCompletion(
  input: CelebrationDecisionInput
): CelebrationType | null {
  if (!input.completingToDone) return null;

  const completedTasks = Math.max(0, Number(input.completedTasks) || 0);
  const totalTasks = Math.max(0, Number(input.totalTasks) || 0);

  if (totalTasks <= 0) return 'task';

  const remainingBeforeCompletion = Math.max(0, totalTasks - completedTasks);
  if (remainingBeforeCompletion === 1) {
    return 'dayComplete';
  }

  return 'task';
}

export function resolveCelebrationProgressAfterCompletion(
  input: CelebrationDecisionInput
): CelebrationProgress | null {
  if (!input.completingToDone) return null;

  const completedTasks = Math.max(0, Number(input.completedTasks) || 0);
  const totalTasks = Math.max(0, Number(input.totalTasks) || 0);
  if (totalTasks <= 0) return null;

  const completedToday = Math.min(totalTasks, completedTasks + 1);
  const remainingToday = Math.max(0, totalTasks - completedToday);

  return {
    completedToday,
    totalToday: totalTasks,
    remainingToday,
  };
}

export function isLastTaskOfDayAfterCompletion(input: LastTaskOfDayInput): boolean {
  const tasks = Array.isArray(input.tasks) ? input.tasks : [];
  if (!tasks.length) return false;

  const completedTaskId = String(input.completedTaskId ?? '').trim();
  if (!completedTaskId) return false;

  const now = input.now instanceof Date ? input.now : new Date();
  const timezoneOffsetMinutes =
    typeof input.timezoneOffsetMinutes === 'number' && Number.isFinite(input.timezoneOffsetMinutes)
      ? input.timezoneOffsetMinutes
      : now.getTimezoneOffset();
  const includeOverdue = input.includeOverdue === true;

  const todayKey = toDateKeyWithOffset(now, timezoneOffsetMinutes);

  const relevantTasks = tasks.filter((task) => {
    const taskKey = resolveTaskDateKey(task?.activityDate ?? null, timezoneOffsetMinutes);
    if (!taskKey) return false;
    return includeOverdue ? taskKey <= todayKey : taskKey === todayKey;
  });

  if (!relevantTasks.length) return false;

  const completedCandidate = relevantTasks.find((task) => String(task.id) === completedTaskId);
  if (!completedCandidate) return false;
  if (completedCandidate.completed === true) return false;

  const hasOtherIncomplete = relevantTasks.some(
    (task) => String(task.id) !== completedTaskId && task.completed !== true
  );

  return !hasOtherIncomplete;
}

export function resolveCelebrationAfterCompletionFromActivities(
  input: CelebrationFromActivitiesInput
): { type: CelebrationType | null; progress: CelebrationProgress | null } {
  const fallbackType = resolveCelebrationTypeAfterCompletion({
    completedTasks: input.fallbackCompletedTasks ?? 0,
    totalTasks: input.fallbackTotalTasks ?? 0,
    completingToDone: input.completingToDone,
  });
  const fallbackProgress = resolveCelebrationProgressAfterCompletion({
    completedTasks: input.fallbackCompletedTasks ?? 0,
    totalTasks: input.fallbackTotalTasks ?? 0,
    completingToDone: input.completingToDone,
  });

  if (!input.completingToDone) {
    return { type: null, progress: null };
  }

  const now = input.now instanceof Date ? input.now : new Date();
  const timezoneOffsetMinutes =
    typeof input.timezoneOffsetMinutes === 'number' && Number.isFinite(input.timezoneOffsetMinutes)
      ? input.timezoneOffsetMinutes
      : now.getTimezoneOffset();
  const includeOverdue = input.includeOverdue === true;
  const todayKey = toDateKeyWithOffset(now, timezoneOffsetMinutes);

  const dayTasks = (Array.isArray(input.activities) ? input.activities : []).flatMap((activity) => {
    const activityDateKey = resolveActivityDateKey(activity?.date, timezoneOffsetMinutes);
    if (!activityDateKey) return [];
    if (includeOverdue ? activityDateKey > todayKey : activityDateKey !== todayKey) {
      return [];
    }

    return (Array.isArray(activity?.tasks) ? activity.tasks : []).map((task) => ({
      id: String(task?.id ?? ''),
      completed: task?.completed === true,
      activityDate: activityDateKey,
    }));
  });

  const relevantTasks = dayTasks.filter((task) => task.id.length > 0);
  if (!relevantTasks.length) {
    return { type: fallbackType, progress: fallbackProgress };
  }

  const completedTaskId = String(input.completedTaskId ?? '').trim();
  if (!relevantTasks.some((task) => task.id === completedTaskId)) {
    return { type: fallbackType, progress: fallbackProgress };
  }

  const completedToday = relevantTasks.filter((task) => task.completed || task.id === completedTaskId).length;
  const totalToday = relevantTasks.length;
  const remainingToday = Math.max(0, totalToday - completedToday);

  const type = isLastTaskOfDayAfterCompletion({
    tasks: relevantTasks,
    completedTaskId,
    now,
    timezoneOffsetMinutes,
    includeOverdue,
  })
    ? 'dayComplete'
    : 'task';

  return {
    type,
    progress: {
      completedToday,
      totalToday,
      remainingToday,
    },
  };
}
