import { shouldIncludeExternalTaskInPerformance } from '@/hooks/useFootballData';

describe('shouldIncludeExternalTaskInPerformance', () => {
  it('excludes pending tasks for soft-deleted external events', () => {
    const task = {
      completed: false,
      events_local_meta: {
        events_external: {
          start_date: '2026-02-17',
          deleted: true,
        },
      },
    };

    expect(shouldIncludeExternalTaskInPerformance(task)).toBe(false);
  });

  it('keeps completed tasks for soft-deleted external events', () => {
    const task = {
      completed: true,
      events_local_meta: {
        events_external: {
          start_date: '2026-02-17',
          deleted: true,
        },
      },
    };

    expect(shouldIncludeExternalTaskInPerformance(task)).toBe(true);
  });

  it('keeps tasks for non-deleted external events', () => {
    const task = {
      completed: false,
      events_local_meta: {
        events_external: {
          start_date: '2026-02-17',
          deleted: false,
        },
      },
    };

    expect(shouldIncludeExternalTaskInPerformance(task)).toBe(true);
  });

  it('excludes tasks when external event is missing start_date', () => {
    const task = {
      completed: false,
      events_local_meta: {
        events_external: {
          deleted: false,
        },
      },
    };

    expect(shouldIncludeExternalTaskInPerformance(task)).toBe(false);
  });
});
