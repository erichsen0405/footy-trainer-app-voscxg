import {
  buildCelebrationCompletionUnitKey,
  resolveCelebrationAfterCompletionFromActivities,
  resolveCelebrationAfterCompletionFromUnits,
  isLastTaskOfDayAfterCompletion,
  resolveCelebrationProgressAfterCompletion,
  resolveCelebrationTypeAfterCompletion,
} from '@/utils/celebration';

describe('isLastTaskOfDayAfterCompletion', () => {
  it('returns false when there are no tasks for today', () => {
    expect(
      isLastTaskOfDayAfterCompletion({
        tasks: [],
        completedTaskId: 'task-1',
        now: new Date('2026-03-04T12:00:00.000Z'),
      })
    ).toBe(false);
  });

  it('returns false when another task for today remains incomplete', () => {
    expect(
      isLastTaskOfDayAfterCompletion({
        tasks: [
          { id: 'task-1', completed: false, activityDate: '2026-03-04' },
          { id: 'task-2', completed: false, activityDate: '2026-03-04' },
        ],
        completedTaskId: 'task-1',
        now: new Date('2026-03-04T12:00:00.000Z'),
      })
    ).toBe(false);
  });

  it('returns true when completion makes overdue+today tasks fully complete', () => {
    expect(
      isLastTaskOfDayAfterCompletion({
        tasks: [
          { id: 'task-old', completed: true, activityDate: '2026-03-03' },
          { id: 'task-today', completed: false, activityDate: '2026-03-04' },
        ],
        completedTaskId: 'task-today',
        now: new Date('2026-03-04T20:00:00.000Z'),
      })
    ).toBe(true);
  });

  it('respects timezone when evaluating what counts as today', () => {
    expect(
      isLastTaskOfDayAfterCompletion({
        tasks: [{ id: 'task-1', completed: false, activityDate: '2026-03-05T00:30:00.000Z' }],
        completedTaskId: 'task-1',
        now: new Date('2026-03-04T22:40:00.000Z'),
        timezoneOffsetMinutes: -120,
      })
    ).toBe(true);
  });
});

describe('resolveCelebrationTypeAfterCompletion', () => {
  it('returns task celebration for normal completion', () => {
    expect(
      resolveCelebrationTypeAfterCompletion({
        completedTasks: 1,
        totalTasks: 3,
        completingToDone: true,
      })
    ).toBe('task');
  });

  it('returns dayComplete for the final remaining task', () => {
    expect(
      resolveCelebrationTypeAfterCompletion({
        completedTasks: 4,
        totalTasks: 5,
        completingToDone: true,
      })
    ).toBe('dayComplete');
  });
});

describe('resolveCelebrationProgressAfterCompletion', () => {
  it('returns null when completion does not transition to done', () => {
    expect(
      resolveCelebrationProgressAfterCompletion({
        completedTasks: 1,
        totalTasks: 5,
        completingToDone: false,
      })
    ).toBeNull();
  });

  it('returns progress snapshot after completion', () => {
    expect(
      resolveCelebrationProgressAfterCompletion({
        completedTasks: 2,
        totalTasks: 5,
        completingToDone: true,
      })
    ).toEqual({
      completedToday: 3,
      totalToday: 5,
      remainingToday: 2,
    });
  });

  it('clamps progress for final task completion', () => {
    expect(
      resolveCelebrationProgressAfterCompletion({
        completedTasks: 4,
        totalTasks: 5,
        completingToDone: true,
      })
    ).toEqual({
      completedToday: 5,
      totalToday: 5,
      remainingToday: 0,
    });
  });
});

describe('resolveCelebrationAfterCompletionFromActivities', () => {
  it('returns dayComplete for the final incomplete task up to today', () => {
    expect(
      resolveCelebrationAfterCompletionFromActivities({
        activities: [
          {
            id: 'a1',
            date: new Date('2026-03-20T10:00:00Z'),
            tasks: [
              { id: 't1', completed: true },
              { id: 't2', completed: false },
            ],
          },
        ],
        completedTaskId: 't2',
        completingToDone: true,
        now: new Date('2026-03-20T12:00:00Z'),
      })
    ).toEqual({
      type: 'dayComplete',
      progress: {
        completedToday: 2,
        totalToday: 2,
        remainingToday: 0,
      },
    });
  });

  it('falls back to count-based logic when no activities are available', () => {
    expect(
      resolveCelebrationAfterCompletionFromActivities({
        activities: [],
        completedTaskId: 't2',
        completingToDone: true,
        fallbackCompletedTasks: 2,
        fallbackTotalTasks: 3,
      })
    ).toEqual({
      type: 'dayComplete',
      progress: {
        completedToday: 3,
        totalToday: 3,
        remainingToday: 0,
      },
    });
  });

  it('supports raw activity_date rows from football data', () => {
    expect(
      resolveCelebrationAfterCompletionFromActivities({
        activities: [
          {
            id: 'a1',
            activity_date: '2026-03-22',
            tasks: [{ id: 't1', completed: false }],
          },
        ],
        completedTaskId: 't1',
        completingToDone: true,
        now: new Date('2026-03-22T12:00:00Z'),
      })
    ).toEqual({
      type: 'dayComplete',
      progress: {
        completedToday: 1,
        totalToday: 1,
        remainingToday: 0,
      },
    });
  });
});

describe('resolveCelebrationAfterCompletionFromUnits', () => {
  it('returns task when another completion item remains open today', () => {
    expect(
      resolveCelebrationAfterCompletionFromUnits({
        units: [
          {
            key: buildCelebrationCompletionUnitKey('task', 't1'),
            completed: false,
            activityDate: '2026-03-22',
          },
          {
            key: buildCelebrationCompletionUnitKey('internalIntensity', 'a1'),
            completed: false,
            activityDate: '2026-03-22',
          },
        ],
        completedUnitKey: buildCelebrationCompletionUnitKey('task', 't1'),
        completingToDone: true,
        now: new Date('2026-03-22T12:00:00Z'),
      })
    ).toEqual({
      type: 'task',
      progress: {
        completedToday: 1,
        totalToday: 2,
        remainingToday: 1,
      },
    });
  });

  it('returns dayComplete when the completed item is the final open item today', () => {
    expect(
      resolveCelebrationAfterCompletionFromUnits({
        units: [
          {
            key: buildCelebrationCompletionUnitKey('task', 't1'),
            completed: true,
            activityDate: '2026-03-22',
          },
          {
            key: buildCelebrationCompletionUnitKey('externalIntensity', 'meta-1'),
            completed: false,
            activityDate: '2026-03-22',
          },
        ],
        completedUnitKey: buildCelebrationCompletionUnitKey('externalIntensity', 'meta-1'),
        completingToDone: true,
        now: new Date('2026-03-22T12:00:00Z'),
      })
    ).toEqual({
      type: 'dayComplete',
      progress: {
        completedToday: 2,
        totalToday: 2,
        remainingToday: 0,
      },
    });
  });

  it('returns dayComplete from a post-write snapshot where the completed unit is already true', () => {
    expect(
      resolveCelebrationAfterCompletionFromUnits({
        units: [
          {
            key: buildCelebrationCompletionUnitKey('task', 't1'),
            completed: true,
            activityDate: '2026-03-22',
          },
          {
            key: buildCelebrationCompletionUnitKey('task', 't2'),
            completed: true,
            activityDate: '2026-03-22',
          },
        ],
        completedUnitKey: buildCelebrationCompletionUnitKey('task', 't2'),
        completingToDone: true,
        now: new Date('2026-03-22T12:00:00Z'),
      })
    ).toEqual({
      type: 'dayComplete',
      progress: {
        completedToday: 2,
        totalToday: 2,
        remainingToday: 0,
      },
    });
  });

  it('can resolve day completion for the completed item date instead of the current wall-clock date', () => {
    expect(
      resolveCelebrationAfterCompletionFromUnits({
        units: [
          {
            key: buildCelebrationCompletionUnitKey('task', 'midday-task'),
            completed: true,
            activityDate: '2026-03-23',
          },
          {
            key: buildCelebrationCompletionUnitKey('task', 'late-task'),
            completed: false,
            activityDate: '2026-03-23',
          },
        ],
        completedUnitKey: buildCelebrationCompletionUnitKey('task', 'late-task'),
        completingToDone: true,
        targetDateKey: '2026-03-23',
        now: new Date('2026-03-22T23:30:00Z'),
      })
    ).toEqual({
      type: 'dayComplete',
      progress: {
        completedToday: 2,
        totalToday: 2,
        remainingToday: 0,
      },
    });
  });
});
