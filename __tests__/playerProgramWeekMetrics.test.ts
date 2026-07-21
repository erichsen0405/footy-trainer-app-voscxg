import { getPlayerProgramWeekTaskMetrics } from '@/utils/playerProgramWeekMetrics';
import type {
  PlayerProgramExperience,
  PlayerProgramExperienceItem,
} from '@/services/trainingProgramService';

const item = (
  overrides: Partial<PlayerProgramExperienceItem>,
): PlayerProgramExperienceItem => ({
  id: 'item',
  scheduledDate: '2026-07-21',
  itemType: 'task_template',
  title: 'Task',
  description: null,
  reminderMinutes: null,
  categoryIds: [],
  phaseTitle: null,
  weekNumber: 2,
  status: 'completed',
  activityId: null,
  taskId: 'task',
  ...overrides,
});

const experience = (items: PlayerProgramExperienceItem[]): PlayerProgramExperience => ({
  apiVersion: 2 as const,
  generatedAt: '2026-07-21T10:00:00.000Z',
  today: '2026-07-21',
  activeEnrollmentId: 'enrollment',
  nextAction: null,
  enrollments: [{
    id: 'enrollment',
    owner: { id: 'owner', ownerType: 'club' as const, name: 'Club', displayName: 'Club', logoUrl: null, brandColors: { primary: '#000', accent: '#000' } },
    program: { id: 'program', title: 'Program', description: null, durationWeeks: 2 },
    startDate: '2026-07-12',
    endDate: '2026-07-25',
    status: 'active' as const,
    progress: { completedItems: 3, totalItems: 4, percent: 75 },
    nextItem: null,
    items,
  }],
});

describe('player program week metrics', () => {
  it('adds standalone program tasks from the current week', () => {
    expect(getPlayerProgramWeekTaskMetrics(
      experience([
        item({ id: 'today', taskId: 'today' }),
        item({ id: 'future', taskId: 'future', scheduledDate: '2026-07-23', status: 'upcoming' }),
        item({ id: 'previous', taskId: 'previous', scheduledDate: '2026-07-15', status: 'overdue' }),
      ]),
      '2026-07-20',
      '2026-07-26',
      '2026-07-21',
    )).toEqual({
      completedTasksForWeek: 1,
      totalTasksForWeek: 2,
      completedTasksUpToToday: 1,
      totalTasksUpToToday: 1,
    });
  });

  it('does not double-count activity-backed program items', () => {
    expect(getPlayerProgramWeekTaskMetrics(
      experience([
        item({ taskId: 'activity-task', activityId: 'activity' }),
        item({ taskId: null, activityId: 'activity-only', itemType: 'session_template' }),
      ]),
      '2026-07-20',
      '2026-07-26',
      '2026-07-21',
    )).toEqual({
      completedTasksForWeek: 0,
      totalTasksForWeek: 0,
      completedTasksUpToToday: 0,
      totalTasksUpToToday: 0,
    });
  });
});
