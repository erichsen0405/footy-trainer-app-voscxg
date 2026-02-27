import {
  calculateIntensityPerformanceTotals,
  shouldIncludeExternalIntensityInPerformance,
  shouldIncludeExternalTaskInPerformance,
} from '@/hooks/useFootballData';
import { formatHoursDa, getActivityDurationMinutes } from '@/utils/activityDuration';

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

describe('getActivityDurationMinutes', () => {
  it('uses explicit duration field when present', () => {
    expect(getActivityDurationMinutes({ durationMinutes: 90 })).toBe(90);
    expect(getActivityDurationMinutes({ duration_minutes: '75' })).toBe(75);
    expect(getActivityDurationMinutes({ duration: 45 })).toBe(45);
  });

  it('falls back to internal start/end time calculation', () => {
    const minutes = getActivityDurationMinutes({
      activity_date: '2026-02-23',
      activity_time: '10:00:00',
      activity_end_time: '12:30:00',
    });

    expect(minutes).toBe(150);
  });

  it('falls back to external start/end date-time calculation', () => {
    const minutes = getActivityDurationMinutes({
      start_date: '2026-02-24',
      start_time: '09:00:00',
      end_date: '2026-02-24',
      end_time: '10:15:00',
    });

    expect(minutes).toBe(75);
  });

  it('returns 0 when duration data is missing', () => {
    expect(getActivityDurationMinutes({ title: 'No duration' })).toBe(0);
    expect(getActivityDurationMinutes(null)).toBe(0);
  });
});

describe('formatHoursDa', () => {
  it('formats with max one decimal and da-DK decimal separator', () => {
    expect(formatHoursDa(150)).toBe('2,5 t');
    expect(formatHoursDa(120)).toBe('2 t');
  });

  it('formats zero and invalid values as 0 t', () => {
    expect(formatHoursDa(0)).toBe('0 t');
    expect(formatHoursDa(-10)).toBe('0 t');
  });
});
