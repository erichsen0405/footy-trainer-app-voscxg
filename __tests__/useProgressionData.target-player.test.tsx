import { renderHook, waitFor } from '@testing-library/react-native';

import { supabase } from '@/integrations/supabase/client';
import { useProgressionData } from '@/hooks/useProgressionData';

type EqCall = {
  table: string;
  column: string;
  value: unknown;
};

type InCall = {
  table: string;
  column: string;
  values: unknown[];
};

const mockEqCalls: EqCall[] = [];
const mockInCalls: InCall[] = [];

jest.mock('@/integrations/supabase/client', () => {
  const createQueryBuilder = (tableName: string) => {
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn((column: string, value: unknown) => {
        mockEqCalls.push({ table: tableName, column, value });
        return builder;
      }),
      gte: jest.fn(() => builder),
      lt: jest.fn(() => builder),
      not: jest.fn(() => builder),
      or: jest.fn(() => builder),
      in: jest.fn((column: string, values: unknown[]) => {
        mockInCalls.push({ table: tableName, column, values });
        return builder;
      }),
      order: jest.fn(() => builder),
      then: (resolve: any, reject: any) =>
        Promise.resolve({ data: [], error: null }).then(resolve, reject),
    };
    return builder;
  };

  return {
    supabase: {
      auth: {
        getSession: jest.fn(),
      },
      from: jest.fn((tableName: string) => createQueryBuilder(tableName)),
    },
  };
});

jest.mock('@/utils/afterTrainingMarkers', () => ({
  parseTemplateIdFromMarker: jest.fn(() => null),
}));

describe('useProgressionData target player queries', () => {
  beforeEach(() => {
    mockEqCalls.length = 0;
    mockInCalls.length = 0;
    (supabase.auth.getSession as jest.Mock).mockResolvedValue({
      data: { session: { user: { id: 'trainer-1' } } },
      error: null,
    });
  });

  it('uses the selected player id for progression queries', async () => {
    const categories: any[] = [];

    renderHook(() =>
      useProgressionData({
        days: 30,
        metric: 'rating',
        categories,
        targetUserId: 'player-1',
      })
    );

    await waitFor(() => {
      expect(mockEqCalls.length).toBeGreaterThanOrEqual(14);
    });

    expect(mockEqCalls).toEqual(
      expect.arrayContaining([
        { table: 'task_template_self_feedback', column: 'user_id', value: 'player-1' },
        { table: 'activity_tasks', column: 'activities.user_id', value: 'player-1' },
        { table: 'activities', column: 'user_id', value: 'player-1' },
        { table: 'external_event_tasks', column: 'events_local_meta.user_id', value: 'player-1' },
        { table: 'events_local_meta', column: 'user_id', value: 'player-1' },
      ])
    );
    expect(mockEqCalls.some((call) => call.value === 'trainer-1')).toBe(false);
  });

  it('falls back to the signed-in user when no target player id is supplied', async () => {
    const categories: any[] = [];

    renderHook(() =>
      useProgressionData({
        days: 30,
        metric: 'rating',
        categories,
        targetUserId: '   ',
      })
    );

    await waitFor(() => {
      expect(mockEqCalls.length).toBeGreaterThanOrEqual(14);
    });

    expect(mockEqCalls).toEqual(
      expect.arrayContaining([
        { table: 'task_template_self_feedback', column: 'user_id', value: 'trainer-1' },
        { table: 'activity_tasks', column: 'activities.user_id', value: 'trainer-1' },
        { table: 'activities', column: 'user_id', value: 'trainer-1' },
        { table: 'external_event_tasks', column: 'events_local_meta.user_id', value: 'trainer-1' },
        { table: 'events_local_meta', column: 'user_id', value: 'trainer-1' },
      ])
    );
  });

  it('uses selected team member ids for aggregate progression queries', async () => {
    const categories: any[] = [];

    renderHook(() =>
      useProgressionData({
        days: 30,
        metric: 'rating',
        categories,
        targetUserIds: ['player-1', 'player-2'],
      })
    );

    await waitFor(() => {
      expect(mockInCalls.length).toBeGreaterThanOrEqual(14);
    });

    expect(mockInCalls).toEqual(
      expect.arrayContaining([
        { table: 'task_template_self_feedback', column: 'user_id', values: ['player-1', 'player-2'] },
        { table: 'activity_tasks', column: 'activities.user_id', values: ['player-1', 'player-2'] },
        { table: 'activities', column: 'user_id', values: ['player-1', 'player-2'] },
        { table: 'external_event_tasks', column: 'events_local_meta.user_id', values: ['player-1', 'player-2'] },
        { table: 'events_local_meta', column: 'user_id', values: ['player-1', 'player-2'] },
      ])
    );
    expect(mockEqCalls.some((call) => call.value === 'trainer-1')).toBe(false);
  });
});
