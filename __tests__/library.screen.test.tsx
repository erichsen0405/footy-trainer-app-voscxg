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

jest.mock('@/components/AssignExerciseModal', () => {
  const React = jest.requireActual('react');
  const { View, Text } = jest.requireActual('react-native');
  return {
    AssignExerciseModal: ({ visible, exercise }: { visible: boolean; exercise?: { title?: string } | null }) =>
      visible ? (
        <View testID="library.assignExerciseModal">
          <Text>{exercise?.title ?? ''}</Text>
        </View>
      ) : null,
  };
});

jest.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const state: {
      table: string;
      selectArg?: string;
      eqFilters: { column: string; value: unknown }[];
      isFilters: { column: string; value: unknown }[];
      inFilter?: { column: string; values: unknown[] };
      orExpr?: string;
    } = {
      table,
      eqFilters: [],
      isFilters: [],
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
      is: (column: string, value: unknown) => {
        state.isFilters.push({ column, value });
        return builder;
      },
      order: () => Promise.resolve(mockResolveQuery(state)),
      in: (column: string, values: unknown[]) => {
        state.inFilter = { column, values };
        return Promise.resolve(mockResolveQuery(state));
      },
      not: () => builder,
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
  position?: string | null;
  difficulty?: number | null;
  is_added_to_tasks?: boolean | null;
  last_score?: number | null;
  execution_count?: number | null;
  created_at?: string;
  updated_at?: string;
  video_url?: string | null;
  thumbnail_url?: string | null;
};

const buildSystemExercise = (id: string, title: string, categoryPath: string): ExerciseRow => ({
  id,
  trainer_id: null,
  title,
  is_system: true,
  category_path: categoryPath,
});

function setupSupabaseFixture({
  userId = 'user-1',
  systemExercises = [],
  personalExercises = [],
  libraryTaskLinks = [],
  exerciseAssignments = [],
  trainerRelationships = [],
  trainerProfiles = [],
  enforceLibraryTaskLinkScope = true,
}: {
  userId?: string;
  systemExercises?: ExerciseRow[];
  personalExercises?: ExerciseRow[];
  libraryTaskLinks?: { id: string; library_exercise_id: string }[];
  exerciseAssignments?: any[];
  trainerRelationships?: any[];
  trainerProfiles?: any[];
  enforceLibraryTaskLinkScope?: boolean;
}) {
  mockAuthGetUser.mockResolvedValue({ data: { user: { id: userId } } });

  mockResolveQuery.mockImplementation((state: any) => {
    if (state.table === 'exercise_library') {
      if (state.inFilter?.column === 'id') {
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

      if (eqMap.get('is_system') === false && !eqMap.has('trainer_id') && !state.inFilter) {
        return { data: personalExercises, error: null };
      }

      if (eqMap.get('is_system') === false && state.inFilter?.column === 'trainer_id') {
        const trainerIds = new Set((state.inFilter.values ?? []).map((value: unknown) => String(value)));
        return {
          data: personalExercises.filter(row => trainerIds.has(String(row.trainer_id ?? ''))),
          error: null,
        };
      }

      return { data: [], error: null };
    }

    if (state.table === 'exercise_assignments') {
      return { data: exerciseAssignments, error: null };
    }

    if (state.table === 'admin_player_relationships') {
      if (trainerRelationships.length) {
        return { data: trainerRelationships, error: null };
      }
      const derived = Array.from(
        new Set((exerciseAssignments || []).map((row: any) => String(row?.trainer_id ?? '')).filter(Boolean))
      ).map(adminId => ({ admin_id: adminId }));
      return { data: derived, error: null };
    }

    if (state.table === 'profiles') {
      return { data: trainerProfiles, error: null };
    }

    if (state.table === 'task_templates') {
      if (enforceLibraryTaskLinkScope) {
        const eqMap = new Map(state.eqFilters.map((entry: any) => [entry.column, entry.value]));
        const isMap = new Map(state.isFilters.map((entry: any) => [entry.column, entry.value]));
        const hasNoScopeFilters =
          !eqMap.has('user_id') &&
          !eqMap.has('player_id') &&
          !eqMap.has('team_id') &&
          !isMap.has('player_id') &&
          !isMap.has('team_id');
        const hasExpectedScope =
          hasNoScopeFilters ||
          (eqMap.get('user_id') === userId &&
            isMap.get('player_id') === null &&
            isMap.get('team_id') === null);
        if (!hasExpectedScope) {
          return { data: null, error: { message: 'Missing required task_templates self-scope filters' } };
        }
      }
      return { data: libraryTaskLinks, error: null };
    }

    return { data: [], error: null };
  });
}

describe('Library screen gating and card state', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseTeamPlayer.mockReturnValue({
      players: [],
      teams: [],
      refreshPlayers: jest.fn().mockResolvedValue(undefined),
      refreshTeams: jest.fn().mockResolvedValue(undefined),
    });
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

  it('renders sticky top rows with focus positions and selected path for trainer profile', async () => {
    setupSupabaseFixture({
      systemExercises: [
        buildSystemExercise('sys-faelles-1', 'Fælles øvelse', 'holdtraening_faelles'),
        buildSystemExercise('sys-back-1', 'Back øvelse', 'holdtraening_back'),
      ],
      personalExercises: [
        {
          id: 'personal-1',
          trainer_id: 'user-1',
          title: 'Min øvelse',
          is_system: false,
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const { findByTestId, getByText, queryByTestId } = render(<LibraryScreen />);

    expect(await findByTestId('library.topRow.primary')).toBeTruthy();
    expect(await findByTestId('library.scrollHint.primary')).toBeTruthy();
    expect(queryByTestId('library.topRow.secondary')).toBeNull();
    expect(getByText('Personlige øvelser')).toBeTruthy();
    expect(getByText('Fokusområder')).toBeTruthy();

    const footballcoachBox = await findByTestId('library.folder.footballcoach');
    fireEvent.press(footballcoachBox);

    expect(await findByTestId('library.topRow.secondary')).toBeTruthy();
    expect(await findByTestId('library.scrollHint.secondary')).toBeTruthy();
    expect(getByText('Fælles')).toBeTruthy();
    expect(getByText('Målmand')).toBeTruthy();
    expect(getByText('Back')).toBeTruthy();

    const faellesBox = await findByTestId('library.folder.holdtraening_faelles');
    fireEvent.press(faellesBox);

    expect((await findByTestId('library.folder.footballcoach')).props.accessibilityState?.selected).toBe(true);
    expect((await findByTestId('library.folder.holdtraening_faelles')).props.accessibilityState?.selected).toBe(true);
    expect(await findByTestId('library.exerciseHeader')).toBeTruthy();
    expect(getByText('Fælles øvelse')).toBeTruthy();
  });

  it('shows all personal exercises for the selected position despite text variations and keeps Øvelser visible', async () => {
    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'personal-position-1',
          trainer_id: 'user-1',
          title: 'Personlig fælles øvelse A',
          is_system: false,
          position: ' Fælles   (alle positioner) ',
        },
        {
          id: 'personal-position-2',
          trainer_id: 'user-1',
          title: 'Personlig fælles øvelse B',
          is_system: false,
          position: 'fælles alle positioner',
        },
        {
          id: 'personal-position-3',
          trainer_id: 'user-1',
          title: 'Personlig målmandsøvelse',
          is_system: false,
          position: ' Målmand ',
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const { findByTestId, getByText, queryByTestId, queryByText } = render(<LibraryScreen />);

    expect(queryByTestId('library.topRow.secondary')).toBeNull();

    fireEvent.press(await findByTestId('library.folder.personal'));

    expect(await findByTestId('library.topRow.secondary')).toBeTruthy();
    expect(getByText('Fælles')).toBeTruthy();
    expect(await findByTestId('library.folder.holdtraening_maalmand')).toBeTruthy();

    fireEvent.press(await findByTestId('library.folder.holdtraening_faelles'));

    expect((await findByTestId('library.folder.personal')).props.accessibilityState?.selected).toBe(true);
    expect((await findByTestId('library.folder.holdtraening_faelles')).props.accessibilityState?.selected).toBe(true);
    expect(await findByTestId('library.exerciseHeader')).toBeTruthy();
    expect(getByText('Personlig fælles øvelse A')).toBeTruthy();
    expect(getByText('Personlig fælles øvelse B')).toBeTruthy();
    expect(queryByText('Personlig målmandsøvelse')).toBeNull();
  });

  it('keeps the top navigation visible while exercises scroll', async () => {
    setupSupabaseFixture({
      systemExercises: Array.from({ length: 12 }, (_, index) =>
        buildSystemExercise(`sys-faelles-${index + 1}`, `Fælles øvelse ${index + 1}`, 'holdtraening_faelles')
      ),
      personalExercises: [
        {
          id: 'personal-2',
          trainer_id: 'user-1',
          title: 'Min anden øvelse',
          is_system: false,
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const { findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByTestId('library.folder.footballcoach'));
    expect(await findByTestId('library.topRow.secondary')).toBeTruthy();
    fireEvent.press(await findByTestId('library.folder.holdtraening_faelles'));

    fireEvent.scroll(await findByTestId('library.exerciseList'), {
      nativeEvent: {
        contentOffset: { y: 420, x: 0 },
        contentSize: { height: 1800, width: 390 },
        layoutMeasurement: { height: 640, width: 390 },
      },
    });

    expect(await findByTestId('library.topRow.primary')).toBeTruthy();
    expect(await findByTestId('library.topRow.secondary')).toBeTruthy();
    expect(await findByTestId('library.exerciseHeader')).toBeTruthy();
    expect((await findByTestId('library.folder.footballcoach')).props.accessibilityState?.selected).toBe(true);
    expect((await findByTestId('library.folder.holdtraening_faelles')).props.accessibilityState?.selected).toBe(true);
  });

  it(
    'shows trainer personal exercise under Øvelser fra træner as already added for player',
    async () => {
    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'trainer-personal-1',
          trainer_id: 'trainer-1',
          title: 'Trainer Personal Drill',
          is_system: false,
        },
      ],
      exerciseAssignments: [
        {
          exercise_id: 'trainer-personal-1',
          trainer_id: 'trainer-1',
          player_id: 'user-1',
          team_id: null,
        },
      ],
      trainerRelationships: [{ admin_id: 'trainer-1' }],
      trainerProfiles: [{ user_id: 'trainer-1', full_name: 'Coach One' }],
      libraryTaskLinks: [{ id: 'tt-trainer-1', library_exercise_id: 'trainer-personal-1' }],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'player', isTrainer: false, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'player_premium',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Øvelser fra træner/i));
    fireEvent.press(await findByText(/Coach One/i));

      const ctaButton = await findByTestId('library.addToTasksButton.trainer-personal-1');
      expect(ctaButton.props.accessibilityState?.disabled).toBe(true);
      expect(ctaButton.props.accessibilityLabel).toMatch(/tilføjet/i);
    },
    10000
  );

  it('renders assign CTA for trainer profile', async () => {
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
    expect(addButton.props.accessibilityLabel).toMatch(/Tildel/i);
  });

  it('keeps assign CTA enabled even when exercise is already added for trainer profile', async () => {
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
    expect(addButton.props.accessibilityState?.disabled).toBe(false);
    expect(addButton.props.accessibilityLabel).toMatch(/Tildel/i);
  });

  it('opens assign modal from card CTA for trainer profile', async () => {
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

    expect(await findByTestId('library.assignExerciseModal')).toBeTruthy();
    expect(addTask).not.toHaveBeenCalled();
  });

  it('keeps assign CTA enabled after remount for trainer profile', async () => {
    const addTask = jest.fn().mockResolvedValue({ id: 'task-should-not-create' });
    mockUseFootball.mockReturnValue({ addTask, tasks: [] });

    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-linked-1',
          trainer_id: 'user-1',
          title: 'Linked Drill',
          is_system: false,
          is_added_to_tasks: false,
        },
      ],
      libraryTaskLinks: [
        {
          id: 'template-linked-1',
          library_exercise_id: 'ex-linked-1',
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const firstRender = render(<LibraryScreen />);
    fireEvent.press(await firstRender.findByText(/Personlige/i));
    await waitFor(async () => {
      const addButton = await firstRender.findByTestId('library.addToTasksButton.ex-linked-1');
      expect(addButton.props.accessibilityState?.disabled).toBe(false);
      expect(addButton.props.accessibilityLabel).toMatch(/Tildel/i);
    });
    firstRender.unmount();

    const secondRender = render(<LibraryScreen />);
    fireEvent.press(await secondRender.findByText(/Personlige/i));
    await waitFor(async () => {
      const addButton = await secondRender.findByTestId('library.addToTasksButton.ex-linked-1');
      expect(addButton.props.accessibilityState?.disabled).toBe(false);
      expect(addButton.props.accessibilityLabel).toMatch(/Tildel/i);
    });

    expect(addTask).not.toHaveBeenCalled();
  });

  it('renders video preview when video is attached and hides pending banner for personal exercises', async () => {
    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-anim-1',
          trainer_id: 'user-1',
          title: 'Anim Exercise',
          is_system: false,
          is_added_to_tasks: false,
          thumbnail_url: 'https://example.com/video-thumb.jpg',
          video_url: 'https://example.com/video.mp4',
        },
        {
          id: 'ex-anim-2',
          trainer_id: 'user-1',
          title: 'No Anim Exercise',
          is_system: false,
          is_added_to_tasks: false,
          video_url: null,
        },
      ],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer', isTrainer: true, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'trainer_basic',
    });

    const { findByText, findByTestId, queryByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Personlige/i));

    expect(await findByTestId('library.videoPreview.ex-anim-1')).toBeTruthy();
    expect(queryByTestId('library.animationPending.ex-anim-2')).toBeNull();
    expect(queryByTestId('library.animationPending.ex-anim-1')).toBeNull();
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
                trainer_id: 'trainer-1',
                title: 'Refresh Drill',
                is_system: false,
                is_added_to_tasks: false,
                last_score: personalFetchCount >= 2 ? 4 : null,
                execution_count: personalFetchCount >= 2 ? 1 : 0,
              },
            ],
            error: null,
          };
        }
        if (eqMap.get('is_system') === false && !eqMap.has('trainer_id')) {
          personalFetchCount += 1;
          return {
            data: [
              {
                id: 'ex-refresh-1',
                trainer_id: 'trainer-1',
                title: 'Refresh Drill',
                is_system: false,
                is_added_to_tasks: false,
                last_score: personalFetchCount >= 2 ? 4 : null,
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
        return { data: [{ user_id: 'trainer-1', full_name: 'Coach One' }], error: null };
      }
      return { data: [], error: null };
    });

    mockUseUserRole.mockReturnValue({ userRole: 'player', isTrainer: false, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'player_premium',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Øvelser fra træner/i));
    fireEvent.press(await findByText(/Coach One/i));

    expect(await findByTestId('library.counter.lastScore.ex-refresh-1')).toHaveTextContent('Senest: –/5');
    expect(await findByTestId('library.counter.executionCount.ex-refresh-1')).toHaveTextContent('Udført: –x');
    expect(await findByTestId('library.badge.lastScore.ex-refresh-1')).toBeTruthy();
    expect(await findByTestId('library.badge.executionCount.ex-refresh-1')).toBeTruthy();

    act(() => {
      DeviceEventEmitter.emit('feedback:saved', {
        activityId: 'activity-1',
        templateId: 'template-1',
        taskInstanceId: 'task-instance-1',
        rating: 4,
      });
    });

    await waitFor(async () => {
      expect(await findByTestId('library.counter.lastScore.ex-refresh-1')).toHaveTextContent('Senest: 4/5');
      expect(await findByTestId('library.counter.executionCount.ex-refresh-1')).toHaveTextContent('Udført: 1x');
      expect(await findByTestId('library.badge.lastScore.ex-refresh-1')).toBeTruthy();
      expect(await findByTestId('library.badge.executionCount.ex-refresh-1')).toBeTruthy();
    });
  });

  it('updates counters in-session for exercise mapped to saved feedback template', async () => {
    mockUseFootball.mockReturnValue({ addTask: jest.fn(), tasks: [] });

    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-map-1',
          trainer_id: 'trainer-1',
          title: 'Mapped Drill',
          is_system: false,
          is_added_to_tasks: false,
          last_score: null,
          execution_count: 0,
        },
      ],
      trainerProfiles: [{ user_id: 'trainer-1', full_name: 'Coach One' }],
      libraryTaskLinks: [{ id: 'template-xyz', library_exercise_id: 'ex-map-1' }],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'player', isTrainer: false, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'player_premium',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Øvelser fra træner/i));
    fireEvent.press(await findByText(/Coach One/i));
    expect(await findByTestId('library.counter.lastScore.ex-map-1')).toHaveTextContent('Senest: –/5');
    expect(await findByTestId('library.counter.executionCount.ex-map-1')).toHaveTextContent('Udført: –x');
    expect(await findByTestId('library.badge.lastScore.ex-map-1')).toBeTruthy();
    expect(await findByTestId('library.badge.executionCount.ex-map-1')).toBeTruthy();

    act(() => {
      DeviceEventEmitter.emit('feedback:saved', {
        activityId: 'activity-xyz',
        templateId: 'template-xyz',
        taskInstanceId: 'task-instance-xyz',
        rating: 4,
        optimisticId: 'optimistic:test:1',
      });
    });

    await waitFor(async () => {
      expect(await findByTestId('library.counter.lastScore.ex-map-1')).toHaveTextContent('Senest: 4/5');
      expect(await findByTestId('library.counter.executionCount.ex-map-1')).toHaveTextContent('Udført: 1x');
      expect(await findByTestId('library.badge.lastScore.ex-map-1')).toBeTruthy();
      expect(await findByTestId('library.badge.executionCount.ex-map-1')).toBeTruthy();
    });
  });

  it('hydrates mapping from existing tasks and updates counters on feedback save', async () => {
    mockUseFootball.mockReturnValue({
      addTask: jest.fn(),
      tasks: [
        {
          id: 'template-existing-1',
          taskTemplateId: 'template-existing-1',
          title: 'Focus Drill',
          description: 'Focus description',
          videoUrl: 'https://example.com/focus.mp4',
          completed: false,
          isTemplate: true,
          categoryIds: [],
          subtasks: [],
        },
      ],
    });

    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-existing-1',
          trainer_id: 'trainer-1',
          title: 'Focus Drill',
          description: 'Focus description',
          video_url: 'https://example.com/focus.mp4',
          is_system: false,
          is_added_to_tasks: false,
          last_score: null,
          execution_count: 1,
        },
      ],
      trainerProfiles: [{ user_id: 'trainer-1', full_name: 'Coach One' }],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'player', isTrainer: false, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'player_premium',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Øvelser fra træner/i));
    fireEvent.press(await findByText(/Coach One/i));

    await waitFor(async () => {
      const addButton = await findByTestId('library.addToTasksButton.ex-existing-1');
      expect(addButton.props.accessibilityState?.disabled).toBe(true);
      expect(addButton.props.accessibilityLabel).toMatch(/tilføjet/i);
    });

    act(() => {
      DeviceEventEmitter.emit('feedback:saved', {
        activityId: 'activity-existing-1',
        templateId: 'template-existing-1',
        taskInstanceId: 'task-instance-existing-1',
        rating: 5,
        optimisticId: 'optimistic:existing-1',
      });
    });

    await waitFor(async () => {
      expect(await findByTestId('library.counter.lastScore.ex-existing-1')).toHaveTextContent('Senest: 5/5');
      expect(await findByTestId('library.counter.executionCount.ex-existing-1')).toHaveTextContent('Udført: 2x');
    });
  });

  it('does not double increment counter on save_failed followed by corrected saved event', async () => {
    mockUseFootball.mockReturnValue({ addTask: jest.fn(), tasks: [] });

    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-map-2',
          trainer_id: 'trainer-1',
          title: 'Corrected Drill',
          is_system: false,
          is_added_to_tasks: false,
          last_score: null,
          execution_count: 0,
        },
      ],
      trainerProfiles: [{ user_id: 'trainer-1', full_name: 'Coach One' }],
      libraryTaskLinks: [{ id: 'template-corrected', library_exercise_id: 'ex-map-2' }],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'player', isTrainer: false, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'player_premium',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Øvelser fra træner/i));
    fireEvent.press(await findByText(/Coach One/i));

    act(() => {
      DeviceEventEmitter.emit('feedback:saved', {
        activityId: 'activity-1',
        templateId: 'template-corrected',
        taskInstanceId: 'task-instance-1',
        rating: 3,
        optimisticId: 'optimistic:fail-1',
      });
    });

    await waitFor(async () => {
      expect(await findByTestId('library.counter.executionCount.ex-map-2')).toHaveTextContent('Udført: 1x');
      expect(await findByTestId('library.badge.executionCount.ex-map-2')).toBeTruthy();
    });

    act(() => {
      DeviceEventEmitter.emit('feedback:save_failed', {
        optimisticId: 'optimistic:fail-1',
      });
      DeviceEventEmitter.emit('feedback:saved', {
        activityId: 'activity-1',
        templateId: 'template-corrected',
        taskInstanceId: 'task-instance-1',
        rating: 3,
        optimisticId: 'optimistic:corrected-1',
      });
    });

    await waitFor(async () => {
      expect(await findByTestId('library.counter.lastScore.ex-map-2')).toHaveTextContent('Senest: 3/5');
      expect(await findByTestId('library.counter.executionCount.ex-map-2')).toHaveTextContent('Udført: 1x');
      expect(await findByTestId('library.badge.lastScore.ex-map-2')).toBeTruthy();
      expect(await findByTestId('library.badge.executionCount.ex-map-2')).toBeTruthy();
    });
  });

  it('does not increment execution count when feedback is edited for same activity/task instance', async () => {
    mockUseFootball.mockReturnValue({ addTask: jest.fn(), tasks: [] });

    setupSupabaseFixture({
      personalExercises: [
        {
          id: 'ex-map-3',
          trainer_id: 'trainer-1',
          title: 'Edit Drill',
          is_system: false,
          is_added_to_tasks: false,
          last_score: null,
          execution_count: 0,
        },
      ],
      trainerProfiles: [{ user_id: 'trainer-1', full_name: 'Coach One' }],
      libraryTaskLinks: [{ id: 'template-edit', library_exercise_id: 'ex-map-3' }],
    });

    mockUseUserRole.mockReturnValue({ userRole: 'player', isTrainer: false, isAdmin: false });
    mockUseSubscriptionFeatures.mockReturnValue({
      featureAccess: { library: true, calendarSync: true, trainerLinking: true },
      isLoading: false,
      subscriptionTier: 'player_premium',
    });

    const { findByText, findByTestId } = render(<LibraryScreen />);

    fireEvent.press(await findByText(/Øvelser fra træner/i));
    fireEvent.press(await findByText(/Coach One/i));

    act(() => {
      DeviceEventEmitter.emit('feedback:saved', {
        activityId: 'activity-edit-1',
        templateId: 'template-edit',
        taskInstanceId: 'task-edit-1',
        rating: 4,
        optimisticId: 'optimistic:edit-1',
      });
    });

    await waitFor(async () => {
      expect(await findByTestId('library.counter.executionCount.ex-map-3')).toHaveTextContent('Udført: 1x');
      expect(await findByTestId('library.badge.executionCount.ex-map-3')).toBeTruthy();
    });

    act(() => {
      DeviceEventEmitter.emit('feedback:saved', {
        activityId: 'activity-edit-1',
        templateId: 'template-edit',
        taskInstanceId: 'task-edit-1',
        rating: 5,
        optimisticId: 'optimistic:edit-2',
      });
    });

    await waitFor(async () => {
      expect(await findByTestId('library.counter.lastScore.ex-map-3')).toHaveTextContent('Senest: 5/5');
      expect(await findByTestId('library.counter.executionCount.ex-map-3')).toHaveTextContent('Udført: 1x');
      expect(await findByTestId('library.badge.lastScore.ex-map-3')).toBeTruthy();
      expect(await findByTestId('library.badge.executionCount.ex-map-3')).toBeTruthy();
    });
  });
});
