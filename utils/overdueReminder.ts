import { resolveActivityDateTime } from '@/utils/performanceHistory';

const MOTIVATION_LINE = 'Små skridt hver dag giver stor fremgang.';

export type OverdueReminderTask = {
  id: string;
  title: string;
  dueAt: Date;
};

function normalizeTaskTitle(task: any): string {
  const directTitle = typeof task?.title === 'string' ? task.title.trim() : '';
  if (directTitle.length > 0) return directTitle;

  const description = typeof task?.description === 'string' ? task.description.trim() : '';
  if (description.length > 0) return description;

  return 'Opgave uden titel';
}

export function selectOverdueTasks(activities: any[] | null | undefined, now: Date = new Date()): OverdueReminderTask[] {
  const safeActivities = Array.isArray(activities) ? activities : [];
  const nowMs = now.getTime();

  const overdue = safeActivities.flatMap((activity, activityIndex) => {
    const dueAt = resolveActivityDateTime(activity);
    if (!dueAt) return [];
    if (dueAt.getTime() >= nowMs) return [];

    const tasks = Array.isArray(activity?.tasks) ? activity.tasks : [];
    return tasks
      .filter((task: any) => task && task.completed !== true)
      .map((task: any, taskIndex: number) => {
        const taskId = String(task?.id ?? `task-${activityIndex}-${taskIndex}`);
        return {
          id: taskId,
          title: normalizeTaskTitle(task),
          dueAt,
        };
      });
  });

  return overdue.sort((a, b) => {
    const dueDiff = a.dueAt.getTime() - b.dueAt.getTime();
    if (dueDiff !== 0) return dueDiff;

    const titleDiff = a.title.localeCompare(b.title, 'da');
    if (titleDiff !== 0) return titleDiff;

    return a.id.localeCompare(b.id, 'da');
  });
}

export function buildNotificationBody(overdueTasks: OverdueReminderTask[]): string {
  if (!overdueTasks.length) {
    return `${MOTIVATION_LINE}\n• Ingen forfaldne opgaver lige nu`;
  }

  const maxItems = 5;
  const visible = overdueTasks.slice(0, maxItems);
  const remaining = overdueTasks.length - visible.length;

  const lines = visible.map(task => `• ${task.title}`);
  if (remaining > 0) {
    lines.push(`• +${remaining} flere`);
  }

  return `${MOTIVATION_LINE}\n${lines.join('\n')}`;
}

export function getOverdueNotificationTitle(): string {
  return 'Forfaldne opgaver';
}
