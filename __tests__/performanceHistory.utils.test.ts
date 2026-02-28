import { buildPerformanceHistoryWeeks } from '../utils/performanceHistory';

describe('buildPerformanceHistoryWeeks', () => {
  it('excludes current week from history', () => {
    const now = new Date('2026-02-28T10:00:00.000Z');
    const weeks = buildPerformanceHistoryWeeks(
      [
        {
          id: 'past-1',
          title: 'Past activity',
          activity_date: '2026-02-18',
          activity_time: '10:00:00',
          duration_minutes: 30,
          tasks: [],
        },
        {
          id: 'current-1',
          title: 'Current week activity',
          activity_date: '2026-02-26',
          activity_time: '10:00:00',
          duration_minutes: 45,
          tasks: [],
        },
      ],
      now,
    );

    expect(weeks).toHaveLength(1);
    expect(weeks[0].activities.map((activity) => activity.id)).toEqual(['past-1']);
  });

  it('counts only completed tasks in historical week totals', () => {
    const now = new Date('2026-02-28T10:00:00.000Z');
    const weeks = buildPerformanceHistoryWeeks(
      [
        {
          id: 'past-2',
          title: 'Past with mixed tasks',
          activity_date: '2026-02-18',
          activity_time: '10:00:00',
          duration_minutes: 90,
          tasks: [
            { id: 't-1', completed: true },
            { id: 't-2', completed: false },
            { id: 't-3', completed: true },
          ],
        },
      ],
      now,
    );

    expect(weeks).toHaveLength(1);
    expect(weeks[0].totalCompletedTasks).toBe(2);
    expect(weeks[0].totalMinutes).toBe(0);
  });

  it('counts activity duration when activity has no tasks', () => {
    const now = new Date('2026-02-28T10:00:00.000Z');
    const weeks = buildPerformanceHistoryWeeks(
      [
        {
          id: 'past-3',
          title: 'Past without tasks',
          activity_date: '2026-02-12',
          activity_time: '11:00:00',
          duration_minutes: 75,
          tasks: [],
        },
      ],
      now,
    );

    expect(weeks).toHaveLength(1);
    expect(weeks[0].totalCompletedTasks).toBe(0);
    expect(weeks[0].totalMinutes).toBe(75);
  });

  it('counts activity duration only when all activity tasks are completed', () => {
    const now = new Date('2026-02-28T10:00:00.000Z');

    const incompleteWeeks = buildPerformanceHistoryWeeks(
      [
        {
          id: 'past-4-incomplete',
          title: 'Past incomplete tasks',
          activity_date: '2026-02-11',
          activity_time: '10:00:00',
          duration_minutes: 60,
          tasks: [
            { id: 't-1', completed: true },
            { id: 't-2', completed: false },
          ],
        },
      ],
      now,
    );

    const completeWeeks = buildPerformanceHistoryWeeks(
      [
        {
          id: 'past-4-complete',
          title: 'Past all tasks complete',
          activity_date: '2026-02-11',
          activity_time: '10:00:00',
          duration_minutes: 60,
          tasks: [
            { id: 't-1', completed: true },
            { id: 't-2', completed: true },
          ],
        },
      ],
      now,
    );

    expect(incompleteWeeks).toHaveLength(1);
    expect(incompleteWeeks[0].totalMinutes).toBe(0);

    expect(completeWeeks).toHaveLength(1);
    expect(completeWeeks[0].totalMinutes).toBe(60);
    expect(completeWeeks[0].totalCompletedTasks).toBe(2);
  });
});
