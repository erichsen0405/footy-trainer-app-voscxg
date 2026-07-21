import type { PlayerProgramExperience } from '@/services/trainingProgramService';

export type PlayerProgramWeekTaskMetrics = {
  completedTasksForWeek: number;
  totalTasksForWeek: number;
  completedTasksUpToToday: number;
  totalTasksUpToToday: number;
};

export const EMPTY_PLAYER_PROGRAM_WEEK_TASK_METRICS: PlayerProgramWeekTaskMetrics = {
  completedTasksForWeek: 0,
  totalTasksForWeek: 0,
  completedTasksUpToToday: 0,
  totalTasksUpToToday: 0,
};

export function getPlayerProgramWeekTaskMetrics(
  experience: PlayerProgramExperience | null,
  weekStart: string,
  weekEnd: string,
  today: string,
): PlayerProgramWeekTaskMetrics {
  if (!experience) return EMPTY_PLAYER_PROGRAM_WEEK_TASK_METRICS;

  // Activity-backed program items are already represented by the existing
  // activity/activity-task counters. Only standalone program tasks need to be
  // added here, otherwise the same work would be counted twice.
  const tasksById = new Map<string, { scheduledDate: string; completed: boolean }>();
  experience.enrollments
    .filter((enrollment) => enrollment.status !== 'cancelled')
    .flatMap((enrollment) => enrollment.items)
    .filter(
      (item) =>
        Boolean(item.taskId) &&
        !item.activityId &&
        item.scheduledDate >= weekStart &&
        item.scheduledDate <= weekEnd,
    )
    .forEach((item) => {
      tasksById.set(item.taskId!, {
        scheduledDate: item.scheduledDate,
        completed: item.status === 'completed',
      });
    });

  const tasks = [...tasksById.values()];
  const tasksUpToToday = tasks.filter((task) => task.scheduledDate <= today);
  return {
    completedTasksForWeek: tasks.filter((task) => task.completed).length,
    totalTasksForWeek: tasks.length,
    completedTasksUpToToday: tasksUpToToday.filter((task) => task.completed).length,
    totalTasksUpToToday: tasksUpToToday.length,
  };
}
