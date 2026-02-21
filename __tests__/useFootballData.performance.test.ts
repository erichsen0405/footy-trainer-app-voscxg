import {
  calculateIntensityPerformanceTotals,
  shouldIncludeExternalIntensityInPerformance,
  shouldIncludeExternalTaskInPerformance,
} from '@/hooks/useFootballData';

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

describe('shouldIncludeExternalIntensityInPerformance', () => {
  it('excludes disabled intensity rows for external events', () => {
    const row = {
      intensity_enabled: false,
      intensity: null,
      events_external: {
        start_date: '2026-02-17',
        deleted: false,
      },
    };

    expect(shouldIncludeExternalIntensityInPerformance(row)).toBe(false);
  });

  it('keeps completed intensity rows for soft-deleted external events', () => {
    const row = {
      intensity_enabled: false,
      intensity: 8,
      events_external: {
        start_date: '2026-02-17',
        deleted: true,
      },
    };

    expect(shouldIncludeExternalIntensityInPerformance(row)).toBe(true);
  });
});

describe('calculateIntensityPerformanceTotals', () => {
  it('counts open and completed intensity tasks for today and whole week', () => {
    const totals = calculateIntensityPerformanceTotals({
      todayIso: '2026-02-19',
      internalIntensityRows: [
        { id: 'a1', activity_date: '2026-02-18', intensity_enabled: true, intensity: null },
        { id: 'a2', activity_date: '2026-02-19', intensity_enabled: true, intensity: 7 },
        { id: 'a3', activity_date: '2026-02-21', intensity_enabled: true, intensity: null },
      ],
      externalIntensityRows: [
        {
          id: 'e1',
          intensity_enabled: true,
          intensity: null,
          events_external: { start_date: '2026-02-19', deleted: false },
        },
        {
          id: 'e2',
          intensity_enabled: false,
          intensity: 9,
          events_external: { start_date: '2026-02-18', deleted: false },
        },
      ],
    });

    expect(totals.totalToday).toBe(4);
    expect(totals.completedToday).toBe(2);
    expect(totals.totalWeek).toBe(5);
    expect(totals.completedWeek).toBe(2);
  });
});
