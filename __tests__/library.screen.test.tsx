import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { DeviceEventEmitter } from 'react-native';

import LibraryScreen from '../app/(tabs)/library';

const mockPush = jest.fn();
const mockUseUserRole = jest.fn();
const mockUseSubscriptionFeatures = jest.fn();
const mockUseTeamPlayer = jest.fn();
const mockUseFootball = jest.fn();

const mockAuthGetUser = jest.fn();
const mockResolveQuery = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => {},
}));

jest.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => mockUseUserRole(),
}));

jest.mock('@/hooks/useSubscriptionFeatures', () => ({
  useSubscriptionFeatures: () => mockUseSubscriptionFeatures(),
}));

jest.mock('@/contexts/TeamPlayerContext', () => ({
  useTeamPlayer: () => mockUseTeamPlayer(),
}));

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    IconSymbol: ({ ios_icon_name, android_material_icon_name }: { ios_icon_name?: string; android_material_icon_name?: string }) => (
      <Text>{ios_icon_name ?? android_material_icon_name ?? 'icon'}</Text>
    ),
  };
});

jest.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const state: {
      table: string;
      selectArg?: string;
      eqFilters: { column: string; value: unknown }[];
      inFilter?: { column: string; values: unknown[] };
      orExpr?: string;
    } = {
      table,
      eqFilters: [],
    };

    const builder: any = {
      select: (arg: string) => {
        state.selectArg = arg;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        state.eqFilters.push({ column, value });
        return builder;
      },
      order: () => Promise.resolve(mockResolveQuery(state)),
      in: (column: string, values: unknown[]) => {
        state.inFilter = { column, values };
        return Promise.resolve(mockResolveQuery(state));
      },
      or: (expr: string) => {
        state.orExpr = expr;
        return Promise.resolve(mockResolveQuery(state));
      },
    };

    return builder;
  };

  return {
    supabase: {
      auth: {
        getUser: () => mockAuthGetUser(),
      },
      from,
    },
  };
});

type ExerciseRow = {
  id: string;
  trainer_id: string | null;
  title: string;
  description?: string | null;
  is_system: boolean;
  category_path?: string | null;
  difficulty?: number | null;
  is_added_to_tasks?: boolean | null;
  last_score?: number | null;
  execution_count?: number | null;
  created_at?: string;
  updated_at?: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
};

function setupSupabaseFixture({
  userId = 'user-1',
  systemExercises = [],
  personalExercises = [],
}: {
  userId?: string;
  systemExercises?: ExerciseRow[];
  personalExercises?: ExerciseRow[];
}) {
  mockAuthGetUser.mockResolvedValue({ data: { user: { id: userId } } });

  mockResolveQuery.mockImplementation((state: any) => {
    if (state.table === 'exercise_library') {
      if (state.inFilter) {
        const values = new Set((state.inFilter.values ?? []).map((v: unknown) => String(v)));
        const allRows = [...systemExercises, ...personalExercises];
        return { data: allRows.filter(row => values.has(String(row.id))), error: null };
      }

      const eqMap = new Map(state.eqFilters.map((entry: any) => [entry.column, entry.value]));
      if (eqMap.get('is_system') === true) {
        return { data: systemExercises, error: null };
      }

      if (eqMap.get('is_system') === false && eqMap.get('trainer_id') === userId) {
        return { data: personalExercises, error: null };
      }

      return { data: [], error: null };
    }

    if (state.table === 'exercise_assignments') {
      return { data: [], error: null };
    }

    if (state.table === 'profiles') {
      return { data: [], error: null };
    }

    return { data: [], error: null };
  });
}

describe('Library screen gating and card state', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseTeamPlayer.mockReturnValue({ teams: [] });
    mockUseFootball.mockReturnValue({
      addTask: jest.fn().mockResolvedValue({ id: 'task-1' }),
      tasks: [],
    });
  });

  it('shows paywall gate when player has no library access', async () => {
    setupSupabaseFixture({});

    mockUseUserRole.mockReturnValue({ userRole: 'player', isTrainer: false, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: false, calendarSync: false, trainerLinking: false },
      isLoading: false,
      subscriptionTier: 'player_basic',
    });

    const { findByText, queryByText } = render(<LibraryScreen />);

    expect(await findByText(/Biblioteket/i)).toBeTruthy();
    expect(queryByText(/Tilføj til opgaver/i)).toBeNull();
  });

  it('hides paywall gate when player has library access', async () => {
    setupSupabaseFixture({
      systemExercises: [
        {
          id: 'sys-1',
          trainer_id: null,
          title: 'System Exercise',
          is_system: true,
          category_path: 'holdtraening_faelles',
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'player', isTrainer: false, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'player_premium',
    });

    const { findByText, queryByText } = render(<LibraryScreen />);

    expect(await findByText(/Bibliotek/i)).toBeTruthy();
    expect(queryByText(/kræver Premium/i)).toBeNull();
  });

  it('renders add CTA enabled for non-added exercise', async () => {
    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-1',
          trainer_id: 'user-1',
          title: 'Drill One',
          is_system: false,
          is_added_to_tasks: false,
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Personlige/i));

    const addButton = await findByTestId('library.addToTasksButton.ex-1');
    expect(addButton.props.accessibilityState?.disabled).toBe(false);
    expect(addButton.props.accessibilityLabel).toMatch(/Tilføj til opgaver/i);
  });

  it('renders added CTA disabled with correct label when already added', async () => {
    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-2',
          trainer_id: 'user-1',
          title: 'Drill Two',
          is_system: false,
          is_added_to_tasks: true,
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Personlige/i));

    const addButton = await findByTestId('library.addToTasksButton.ex-2');
    expect(addButton.props.accessibilityState?.disabled).toBe(true);
    expect(addButton.props.accessibilityLabel).toMatch(/Allerede tilføjet til opgaver/i);
  });

  it('opens add modal and confirms add task', async () => {
    const addTask = jest.fn().mockResolvedValue({ id: 'task-42' });
    mockUseFootball.mockReturnValue({ addTask, tasks: [] });

    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-3',
          trainer_id: 'user-1',
          title: 'Drill Three',
          is_system: false,
          is_added_to_tasks: false,
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Personlige/i));
    fireEvent.press(await findByTestId('library.addToTasksButton.ex-3'));

    fireEvent.press(await findByText(/^Tilf.*j$/i));

    await waitFor(() => {
      expect(addTask).toHaveBeenCalledTimes(1);
    });

    const addButton = await findByTestId('library.addToTasksButton.ex-3');
    expect(addButton.props.accessibilityState?.disabled).toBe(true);
    expect(addButton.props.accessibilityLabel).toMatch(/Allerede tilføjet/i);
  });

  it('refreshes library counters after feedback:saved event', async () => {
    mockAuthGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    let personalFetchCount = 0;
    mockResolveQuery.mockImplementation((state: any) => {
      if (state.table === 'exercise_library') {
        const eqMap = new Map(state.eqFilters.map((entry: any) => [entry.column, entry.value]));
        if (eqMap.get('is_system') === true) {
          return { data: [], error: null };
        }
        if (eqMap.get('is_system') === false && eqMap.get('trainer_id') === 'user-1') {
          personalFetchCount += 1;
          return {
            data: [
              {
                id: 'ex-refresh-1',
                trainer_id: 'user-1',
                title: 'Refresh Drill',
                is_system: false,
                is_added_to_tasks: false,
                last_score: personalFetchCount >= 2 ? 7 : null,
                execution_count: personalFetchCount >= 2 ? 1 : 0,
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      }
      if (state.table === 'exercise_assignments') {
        return { data: [], error: null };
      }
      if (state.table === 'profiles') {
        return { data: [], error: null };
      }
      return { data: [], error: null };
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Personlige/i));

    expect(await findByTestId('library.counter.lastScore.ex-refresh-1')).toHaveTextContent('Senest: –/10');
    expect(await findByTestId('library.counter.executionCount.ex-refresh-1')).toHaveTextContent('Udført: –x');

    act(() => {
      DeviceEventEmitter.emit('feedback:saved', {
        activityId: 'activity-1',
        templateId: 'template-1',
        taskInstanceId: 'task-instance-1',
      });
    });

    await waitFor(async () => {
      expect(await findByTestId('library.counter.lastScore.ex-refresh-1')).toHaveTextContent('Senest: 7/10');
      expect(await findByTestId('library.counter.executionCount.ex-refresh-1')).toHaveTextContent('Udført: 1x');
    });
  });

  it('updates counters in-session for exercise mapped to saved feedback template', async () => {
    const addTask = jest.fn().mockResolvedValue({ id: 'template-xyz' });
    mockUseFootball.mockReturnValue({ addTask, tasks: [] });

    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-map-1',
          trainer_id: 'user-1',
          title: 'Mapped Drill',
          is_system: false,
          is_added_to_tasks: false,
          last_score: null,
          execution_count: 0,
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Personlige/i));
    expect(await findByTestId('library.counter.lastScore.ex-map-1')).toHaveTextContent('Senest: –/10');
    expect(await findByTestId('library.counter.executionCount.ex-map-1')).toHaveTextContent('Udført: –x');

    fireEvent.press(await findByTestId('library.addToTasksButton.ex-map-1'));
    fireEvent.press(await findByText(/^Tilf.*j$/i));

    await waitFor(() => {
      expect(addTask).toHaveBeenCalledTimes(1);
    });
    await waitFor(async () => {
      const addButton = await findByTestId('library.addToTasksButton.ex-map-1');
      expect(addButton.props.accessibilityState?.disabled).toBe(true);
    });

    act(() => {
      DeviceEventEmitter.emit('feedback:saved', {
        templateId: 'template-xyz',
        taskInstanceId: 'task-instance-xyz',
        rating: 8,
        optimisticId: 'optimistic:test:1',
      });
    });

    await waitFor(async () => {
      expect(await findByTestId('library.counter.lastScore.ex-map-1')).toHaveTextContent('Senest: 8/10');
      expect(await findByTestId('library.counter.executionCount.ex-map-1')).toHaveTextContent('Udført: 1x');
    });
  });
});
