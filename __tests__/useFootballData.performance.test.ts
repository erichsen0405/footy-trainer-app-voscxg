import { renderHook, waitFor, act } from '@testing-library/react-native';
import {
  calculateIntensityPerformanceTotals,
  normalizePerformanceRowsToTrophies,
  sumCompletedTasksByTrophyType,
  shouldIncludeExternalIntensityInPerformance,
  shouldIncludeExternalTaskInPerformance,
  useFootballData,
} from '@/hooks/useFootballData';
import {
  formatHoursDa,
  getActivityDurationMinutes,
  getActivityEffectiveDurationMinutes,
  getTaskDurationMinutes,
} from '@/utils/activityDuration';

const mockAdminState = {
  adminMode: 'self' as 'self' | 'player' | 'team',
  adminTargetId: null as string | null,
  adminTargetType: null as 'player' | 'team' | null,
};
let mockSessionUserId = 'user-1';
let authStateChangeHandler: ((event: string, session: { user: { id: string } } | null) => void) | null = null;
let mockWeeklyPerformanceRows: any[] = [];
let mockLegacyTrophyRows: any[] = [];
let mockExternalCalendarsRows: any[] = [];

jest.mock('@/contexts/AdminContext', () => ({
  useAdmin: () => mockAdminState,
}));

jest.mock('@/contexts/CelebrationContext', () => ({
  useCelebration: () => ({
    showCelebration: jest.fn(),
  }),
}));

jest.mock('@/utils/notificationService', () => ({
  checkNotificationPermissions: jest.fn(),
}));

jest.mock('@/utils/notificationScheduler', () => ({
  refreshNotificationQueue: jest.fn().mockResolvedValue(undefined),
  forceRefreshNotificationQueue: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/taskService', () => ({
  taskService: {
    getHiddenTaskTemplateIds: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/services/activityService', () => ({
  activityService: {},
}));

jest.mock('@/services/calendarService', () => ({
  calendarService: {},
}));

jest.mock('@/utils/taskEvents', () => ({
  subscribeToTaskCompletion: jest.fn(() => () => {}),
  emitTaskCompletionEvent: jest.fn(),
}));

jest.mock('@/utils/activityEvents', () => ({
  emitActivityPatch: jest.fn(),
  emitActivitiesRefreshRequested: jest.fn(),
  subscribeToActivityPatch: jest.fn(() => () => {}),
  subscribeToActivitiesRefreshRequested: jest.fn(() => () => {}),
  getActivitiesRefreshRequestedVersion: jest.fn(() => 0),
  getLastActivitiesRefreshRequestedEvent: jest.fn(() => null),
}));

jest.mock('@/utils/afterTrainingMarkers', () => ({
  parseTemplateIdFromMarker: jest.fn(() => null),
}));

jest.mock('@/utils/taskTemplateVisibility', () => ({
  isTaskVisibleForActivity: jest.fn(() => true),
}));

jest.mock('@/utils/celebration', () => ({
  resolveCelebrationProgressAfterCompletion: jest.fn(() => null),
  resolveCelebrationTypeAfterCompletion: jest.fn(() => null),
}));

jest.mock('@/integrations/supabase/client', () => {
  const resolveTableResponse = (tableName: string) => {
    if (tableName === 'weekly_performance') {
      return { data: mockWeeklyPerformanceRows, error: null };
    }
    if (tableName === 'trophies') {
      return { data: mockLegacyTrophyRows, error: null };
    }
    if (tableName === 'external_calendars') {
      return { data: mockExternalCalendarsRows, error: null };
    }
    return { data: [], error: null };
  };

  const createQueryBuilder = (tableName: string) => {
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      or: () => builder,
      in: () => builder,
      gte: () => builder,
      lt: () => builder,
      is: () => builder,
      order: () => builder,
      range: () => builder,
      update: () => builder,
      insert: () => builder,
      upsert: () => builder,
      delete: () => builder,
      single: () => Promise.resolve({ data: null, error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: any, reject: any) => Promise.resolve(resolveTableResponse(tableName)).then(resolve, reject),
    };
    return builder;
  };

  return {
    supabase: {
      auth: {
        getSession: jest.fn(async () => ({
          data: {
            session: mockSessionUserId ? { user: { id: mockSessionUserId } } : null,
          },
          error: null,
        })),
        onAuthStateChange: jest.fn((callback: any) => {
          authStateChangeHandler = callback;
          return { data: { subscription: { unsubscribe: jest.fn() } } };
        }),
      },
      from: jest.fn((tableName: string) => createQueryBuilder(tableName)),
      channel: jest.fn(() => ({
        on: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      })),
      removeChannel: jest.fn(() => Promise.resolve()),
    },
  };
});

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

describe('sumCompletedTasksByTrophyType', () => {
  it('sums completed tasks per trophy type across weeks', () => {
    const totals = sumCompletedTasksByTrophyType([
      { type: 'gold', completed_tasks: 5 },
      { type: 'gold', completed_tasks: 3 },
      { type: 'silver', completed_tasks: 4 },
      { type: 'bronze', completed_tasks: 2 },
    ]);

    expect(totals).toEqual({
      gold: 8,
      silver: 4,
      bronze: 2,
    });
  });

  it('supports camelCase fallback and ignores invalid values', () => {
    const totals = sumCompletedTasksByTrophyType([
      { type: 'gold', completedTasks: 6 },
      { type: 'silver', completed_tasks: -2 },
      { type: 'bronze' },
      { type: 'silver', completed_tasks: Number.NaN },
      { type: 'bronze', completedTasks: 1 },
    ] as any);

    expect(totals).toEqual({
      gold: 6,
      silver: 0,
      bronze: 1,
    });
  });
});

describe('normalizePerformanceRowsToTrophies', () => {
  it('maps weekly_performance rows to trophy shape', () => {
    const trophies = normalizePerformanceRowsToTrophies([
      {
        week_number: 8,
        year: 2026,
        trophy_type: 'gold',
        percentage: 83,
        completed_tasks: 10,
        total_tasks: 12,
      },
    ]);

    expect(trophies).toEqual([
      {
        week: 8,
        year: 2026,
        type: 'gold',
        percentage: 83,
        completedTasks: 10,
        totalTasks: 12,
      },
    ]);
  });

  it('supports legacy rows and drops invalid trophy types', () => {
    const trophies = normalizePerformanceRowsToTrophies([
      {
        week: 7,
        year: 2026,
        type: 'silver',
        percentage: 66,
        completed_tasks: '4',
        total_tasks: '6',
      },
      {
        week_number: 6,
        year: 2026,
        trophy_type: 'invalid',
        percentage: 30,
        completed_tasks: 1,
        total_tasks: 8,
      },
    ]);

    expect(trophies).toEqual([
      {
        week: 7,
        year: 2026,
        type: 'silver',
        percentage: 66,
        completedTasks: 4,
        totalTasks: 6,
      },
    ]);
  });

  it('ignores weeks without planned tasks entirely', () => {
    const trophies = normalizePerformanceRowsToTrophies([
      {
        week_number: 10,
        year: 2026,
        trophy_type: 'bronze',
        percentage: 0,
        completed_tasks: 0,
        total_tasks: 0,
      },
      {
        week_number: 9,
        year: 2026,
        trophy_type: 'silver',
        percentage: 0,
        completed_tasks: 0,
      },
      {
        week_number: 8,
        year: 2026,
        trophy_type: 'gold',
        percentage: 100,
        completed_tasks: 2,
        total_tasks: 2,
      },
    ]);

    expect(trophies).toEqual([
      {
        week: 8,
        year: 2026,
        type: 'gold',
        percentage: 100,
        completedTasks: 2,
        totalTasks: 2,
      },
    ]);
  });

  it('returns no trophy weeks when the user has no valid weeks with tasks', () => {
    const trophies = normalizePerformanceRowsToTrophies([
      {
        week_number: 10,
        year: 2026,
        trophy_type: 'gold',
        percentage: 0,
        completed_tasks: 0,
        total_tasks: 0,
      },
      {
        week_number: 9,
        year: 2026,
        trophy_type: 'silver',
        percentage: 0,
        completed_tasks: 0,
      },
    ]);

    expect(trophies).toEqual([]);
  });
});

describe('useFootballData lazy-load reset', () => {
  beforeEach(() => {
    mockAdminState.adminMode = 'self';
    mockAdminState.adminTargetId = null;
    mockAdminState.adminTargetType = null;
    mockSessionUserId = 'user-1';
    authStateChangeHandler = null;
    mockWeeklyPerformanceRows = [];
    mockLegacyTrophyRows = [];
    mockExternalCalendarsRows = [];
  });

  it('resets lazy-load flags on admin scope change', async () => {
    mockWeeklyPerformanceRows = [
      {
        week_number: 8,
        year: 2026,
        trophy_type: 'gold',
        percentage: 100,
        completed_tasks: 2,
        total_tasks: 2,
        user_id: 'user-1',
      },
    ];

    const { result, rerender } = renderHook(({ scopeVersion }: { scopeVersion: number }) => {
      void scopeVersion;
      return useFootballData();
    }, {
      initialProps: { scopeVersion: 0 },
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.ensureActivitiesLoaded();
      await result.current.ensurePerformanceDataLoaded();
    });

    expect(result.current.hasActivitiesLoaded).toBe(true);
    expect(result.current.hasPerformanceDataLoaded).toBe(true);
    expect(result.current.trophies).toHaveLength(1);

    mockAdminState.adminMode = 'player';
    mockAdminState.adminTargetId = 'player-1';
    mockAdminState.adminTargetType = 'player';
    rerender({ scopeVersion: 1 });

    await waitFor(() => {
      expect(result.current.hasActivitiesLoaded).toBe(false);
      expect(result.current.hasPerformanceDataLoaded).toBe(false);
      expect(result.current.trophies).toEqual([]);
    });
  });

  it('resets lazy-load flags on auth user change', async () => {
    mockWeeklyPerformanceRows = [
      {
        week_number: 8,
        year: 2026,
        trophy_type: 'gold',
        percentage: 100,
        completed_tasks: 2,
        total_tasks: 2,
        user_id: 'user-1',
      },
    ];

    const { result } = renderHook(() => useFootballData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.ensureActivitiesLoaded();
      await result.current.ensurePerformanceDataLoaded();
    });

    expect(result.current.hasActivitiesLoaded).toBe(true);
    expect(result.current.hasPerformanceDataLoaded).toBe(true);
    expect(result.current.trophies).toHaveLength(1);

    mockSessionUserId = 'user-2';
    await act(async () => {
      authStateChangeHandler?.('SIGNED_IN', { user: { id: 'user-2' } });
    });

    await waitFor(() => {
      expect(result.current.hasActivitiesLoaded).toBe(false);
      expect(result.current.hasPerformanceDataLoaded).toBe(false);
      expect(result.current.trophies).toEqual([]);
    });
  });

  it('ignores legacy trophies when weekly_performance has no valid rows', async () => {
    mockLegacyTrophyRows = [
      {
        week: 7,
        year: 2026,
        type: 'gold',
        percentage: 100,
        completed_tasks: 2,
        total_tasks: 2,
        user_id: 'user-1',
      },
    ];

    const { result } = renderHook(() => useFootballData());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.ensurePerformanceDataLoaded();
    });

    expect(result.current.hasPerformanceDataLoaded).toBe(true);
    expect(result.current.trophies).toEqual([]);
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

  it('ignores all-day external events to avoid 24h inflation', () => {
    const minutes = getActivityDurationMinutes({
      start_date: '2026-02-24',
      start_time: '00:00:00',
      end_date: '2026-02-25',
      end_time: '00:00:00',
    });

    expect(minutes).toBe(0);
  });

  it('returns 0 when duration data is missing', () => {
    expect(getActivityDurationMinutes({ title: 'No duration' })).toBe(0);
    expect(getActivityDurationMinutes(null)).toBe(0);
  });
});

describe('getTaskDurationMinutes', () => {
  it('returns task minutes when task duration is enabled', () => {
    expect(getTaskDurationMinutes({ task_duration_enabled: true, task_duration_minutes: 30 })).toBe(30);
    expect(getTaskDurationMinutes({ taskDurationEnabled: true, taskDurationMinutes: '45' })).toBe(45);
  });

  it('returns 0 when task duration is disabled or missing', () => {
    expect(getTaskDurationMinutes({ task_duration_enabled: false, task_duration_minutes: 30 })).toBe(0);
    expect(getTaskDurationMinutes({ title: 'Task without duration' })).toBe(0);
  });

  it('returns 0 for feedback tasks even when duration is enabled', () => {
    expect(
      getTaskDurationMinutes({
        title: 'Feedback på: Pasning',
        task_duration_enabled: true,
        task_duration_minutes: 30,
      })
    ).toBe(0);
    expect(
      getTaskDurationMinutes({
        feedback_template_id: 'template-1',
        task_duration_enabled: true,
        task_duration_minutes: 45,
      })
    ).toBe(0);
  });
});

describe('getActivityEffectiveDurationMinutes', () => {
  it('uses sum of task durations when at least one task has duration enabled', () => {
    const activity = {
      activity_date: '2026-02-24',
      activity_time: '10:00:00',
      activity_end_time: '12:00:00',
      tasks: [
        { task_duration_enabled: true, task_duration_minutes: 30 },
        { task_duration_enabled: true, task_duration_minutes: 45 },
      ],
    };

    expect(getActivityEffectiveDurationMinutes(activity)).toBe(75);
  });

  it('falls back to activity duration when no task durations are enabled', () => {
    const activity = {
      activity_date: '2026-02-24',
      activity_time: '10:00:00',
      activity_end_time: '12:00:00',
      tasks: [{ task_duration_enabled: false, task_duration_minutes: 30 }],
    };

    expect(getActivityEffectiveDurationMinutes(activity)).toBe(120);
  });

  it('keeps task precedence even when enabled task duration is zero', () => {
    const activity = {
      activity_date: '2026-02-24',
      activity_time: '10:00:00',
      activity_end_time: '12:00:00',
      tasks: [{ task_duration_enabled: true, task_duration_minutes: 0 }],
    };

    expect(getActivityEffectiveDurationMinutes(activity)).toBe(0);
  });

  it('ignores feedback task durations in task sum', () => {
    const activity = {
      activity_date: '2026-02-24',
      activity_time: '10:00:00',
      activity_end_time: '12:00:00',
      tasks: [
        { title: 'Normal opgave', task_duration_enabled: true, task_duration_minutes: 30 },
        {
          title: 'Feedback på: Normal opgave',
          task_duration_enabled: true,
          task_duration_minutes: 30,
          feedback_template_id: 'fb-1',
        },
      ],
    };

    expect(getActivityEffectiveDurationMinutes(activity)).toBe(30);
  });

  it('falls back to activity duration when only feedback task has duration enabled', () => {
    const activity = {
      activity_date: '2026-02-24',
      activity_time: '10:00:00',
      activity_end_time: '12:00:00',
      tasks: [
        {
          title: 'Feedback på: Teknik',
          task_duration_enabled: true,
          task_duration_minutes: 30,
          feedback_template_id: 'fb-2',
        },
      ],
    };

    expect(getActivityEffectiveDurationMinutes(activity)).toBe(120);
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
