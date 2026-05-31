import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import PerformanceScreen from '../app/(tabs)/performance';

const mockUseFootball = jest.fn();
const mockUseHomeActivities = jest.fn();
const mockStartAdminPlayer = jest.fn();
const mockSetSelectedContext = jest.fn();
const mockEnsureRosterLoaded = jest.fn();

const mockAdminState = {
  adminMode: 'self' as 'self' | 'player' | 'team',
  adminTargetId: null as string | null,
  adminTargetType: null as 'player' | 'team' | null,
};
const mockTeamPlayerState = {
  players: [] as { id: string; full_name: string; email: string; phone_number?: string }[],
  loading: false,
};
const mockUserRoleState = {
  userRole: 'player' as 'admin' | 'trainer' | 'player' | null,
};

jest.mock('@/contexts/AdminContext', () => ({
  useAdmin: () => ({
    ...mockAdminState,
    startAdminPlayer: mockStartAdminPlayer,
  }),
}));

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/contexts/TeamPlayerContext', () => ({
  useTeamPlayer: () => ({
    players: mockTeamPlayerState.players,
    loading: mockTeamPlayerState.loading,
    ensureRosterLoaded: mockEnsureRosterLoaded,
    setSelectedContext: mockSetSelectedContext,
  }),
}));

jest.mock('@/hooks/useHomeActivities', () => ({
  useHomeActivities: () => mockUseHomeActivities(),
}));

jest.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => ({
    userRole: mockUserRoleState.userRole,
    loading: false,
    isAdmin: mockUserRoleState.userRole === 'admin' || mockUserRoleState.userRole === 'trainer',
    refreshUserRole: jest.fn(),
    isAuthenticated: true,
  }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    const React = jest.requireActual('react');
    const hasRunRef = React.useRef(false);
    React.useEffect(() => {
      if (hasRunRef.current) {
        return;
      }
      hasRunRef.current = true;
      return callback();
    }, [callback]);
  },
}));

jest.mock('@/components/ProgressionSection', () => {
  const React = jest.requireActual('react');
  const { Text, View } = jest.requireActual('react-native');
  return {
    ProgressionSection: ({ targetUserId }: { targetUserId?: string | null }) => (
      <View testID="mock.progressionSection">
        <Text testID="mock.progressionTarget">{targetUserId ?? 'self'}</Text>
      </View>
    ),
  };
});

jest.mock('@/components/ActivityCard', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: ({ activity }: { activity: any }) => <Text>{activity?.title ?? 'untitled'}</Text>,
  };
});

jest.mock('@/components/WeeklySummaryCard', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    WeeklySummaryCard: ({ onPress }: { onPress: () => void }) => (
      <Pressable testID="mock.weeklySummaryCard" onPress={onPress}>
        <Text>mock.weeklySummaryCard</Text>
      </Pressable>
    ),
  };
});

describe('PerformanceScreen', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-28T10:00:00.000Z'));
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAdminState.adminMode = 'self';
    mockAdminState.adminTargetId = null;
    mockAdminState.adminTargetType = null;
    mockTeamPlayerState.players = [];
    mockTeamPlayerState.loading = false;
    mockUserRoleState.userRole = 'player';
    mockSetSelectedContext.mockResolvedValue(undefined);
    mockEnsureRosterLoaded.mockReturnValue(new Promise(() => {}));

    mockUseFootball.mockReturnValue({
      trophies: [],
      hasPerformanceDataLoaded: true,
      ensurePerformanceDataLoaded: jest.fn(),
      currentWeekStats: {
        percentage: 60,
        completedTasks: 3,
        totalTasks: 5,
        completedTasksForWeek: 5,
        totalTasksForWeek: 8,
        weekActivities: [],
      },
      externalCalendars: [],
      fetchExternalCalendarEvents: jest.fn(),
      categories: [],
    });

    mockUseHomeActivities.mockReturnValue({
      loading: false,
      hasLoadedFullWindow: true,
      loadFullWindow: jest.fn().mockResolvedValue(true),
      refresh: jest.fn(),
      activities: [],
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('shows collapsible pokaler and udvikling sections', () => {
    const { getByTestId, getByText, queryByTestId, queryByText } = render(<PerformanceScreen />);

    expect(getByText('Pokaler')).toBeTruthy();
    expect(getByText('Udvikling')).toBeTruthy();
    expect(getByText('Guld pokaler')).toBeTruthy();
    expect(getByTestId('mock.progressionSection')).toBeTruthy();

    fireEvent.press(getByTestId('performance.trophies.toggle'));
    expect(queryByText('Guld pokaler')).toBeNull();

    fireEvent.press(getByTestId('performance.trophies.toggle'));
    expect(getByText('Guld pokaler')).toBeTruthy();

    fireEvent.press(getByTestId('performance.progression.toggle'));
    expect(queryByTestId('mock.progressionSection')).toBeNull();
  });

  it('shows player dropdown for trainer profiles', () => {
    mockUserRoleState.userRole = 'trainer';

    const { getByTestId } = render(<PerformanceScreen />);

    expect(getByTestId('performance.playerDropdown.trigger')).toBeTruthy();
  });

  it('does not show player dropdown for player profiles', () => {
    mockUserRoleState.userRole = 'player';

    const { queryByTestId } = render(<PerformanceScreen />);

    expect(queryByTestId('performance.playerDropdown.trigger')).toBeNull();
  });

  it('only renders trainer-linked players in the dropdown', () => {
    mockUserRoleState.userRole = 'trainer';
    mockTeamPlayerState.players = [
      { id: 'player-1', email: '', full_name: 'Alma Angriber' },
      { id: 'player-2', email: '', full_name: 'Birk Back' },
    ];

    const { getByTestId, getByText, queryByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.playerDropdown.trigger'));

    expect(getByText('Alma Angriber')).toBeTruthy();
    expect(getByText('Birk Back')).toBeTruthy();
    expect(queryByTestId('performance.playerDropdown.option.player-3')).toBeNull();
  });

  it('shows the trainer player dropdown loading state', () => {
    mockUserRoleState.userRole = 'trainer';
    mockEnsureRosterLoaded.mockReturnValue(new Promise(() => {}));

    const { getByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.playerDropdown.trigger'));

    expect(getByTestId('performance.playerDropdown.loading')).toBeTruthy();
  });

  it('shows the trainer player dropdown empty state', async () => {
    mockUserRoleState.userRole = 'trainer';
    mockEnsureRosterLoaded.mockResolvedValue(undefined);

    const { getByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.playerDropdown.trigger'));

    await waitFor(() => {
      expect(getByTestId('performance.playerDropdown.empty')).toBeTruthy();
    });
  });

  it('shows the trainer player dropdown error state', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUserRoleState.userRole = 'trainer';
    mockEnsureRosterLoaded.mockRejectedValue(new Error('roster failed'));

    const { getByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.playerDropdown.trigger'));

    await waitFor(() => {
      expect(getByTestId('performance.playerDropdown.error')).toBeTruthy();
    });

    consoleErrorSpy.mockRestore();
  });

  it('selects a linked player and updates the performance target', async () => {
    mockUserRoleState.userRole = 'trainer';
    mockTeamPlayerState.players = [
      { id: 'player-1', email: '', full_name: 'Alma Angriber' },
    ];

    const screen = render(<PerformanceScreen />);

    fireEvent.press(screen.getByTestId('performance.playerDropdown.trigger'));
    fireEvent.press(screen.getByTestId('performance.playerDropdown.option.player-1'));

    await waitFor(() => {
      expect(mockSetSelectedContext).toHaveBeenCalledWith({
        type: 'player',
        id: 'player-1',
        name: 'Alma Angriber',
      });
      expect(mockStartAdminPlayer).toHaveBeenCalledWith('player-1');
    });

    mockAdminState.adminMode = 'player';
    mockAdminState.adminTargetId = 'player-1';
    mockAdminState.adminTargetType = 'player';
    mockUseFootball.mockReturnValue({
      trophies: [
        { week: 7, year: 2026, type: 'gold', percentage: 100, completedTasks: 2, totalTasks: 2 },
      ],
      hasPerformanceDataLoaded: true,
      ensurePerformanceDataLoaded: jest.fn(),
      currentWeekStats: {
        percentage: 100,
        completedTasks: 2,
        totalTasks: 2,
        completedTasksForWeek: 2,
        totalTasksForWeek: 2,
        weekActivities: [],
      },
      externalCalendars: [],
      fetchExternalCalendarEvents: jest.fn(),
      categories: [],
    });

    screen.rerender(<PerformanceScreen />);

    expect(screen.getByText('Viser performance for Alma Angriber')).toBeTruthy();
    expect(screen.getByTestId('mock.progressionTarget').props.children).toBe('player-1');
    expect(screen.getByTestId('performance.trophies.count.gold').props.children).toBe(1);
  });

  it('keeps the selected player visible while selected performance data is loading', () => {
    mockUserRoleState.userRole = 'trainer';
    mockAdminState.adminMode = 'player';
    mockAdminState.adminTargetId = 'player-1';
    mockAdminState.adminTargetType = 'player';
    mockTeamPlayerState.players = [
      { id: 'player-1', email: '', full_name: 'Alma Angriber' },
    ];
    mockUseFootball.mockReturnValue({
      trophies: [
        { week: 7, year: 2026, type: 'gold', percentage: 100, completedTasks: 2, totalTasks: 2 },
      ],
      hasPerformanceDataLoaded: false,
      ensurePerformanceDataLoaded: jest.fn(() => new Promise(() => {})),
      currentWeekStats: {
        percentage: 60,
        completedTasks: 3,
        totalTasks: 5,
        completedTasksForWeek: 5,
        totalTasksForWeek: 8,
        weekActivities: [],
      },
      externalCalendars: [],
      fetchExternalCalendarEvents: jest.fn(),
      categories: [],
    });

    const { getByTestId, getByText, queryByTestId } = render(<PerformanceScreen />);

    expect(getByTestId('performance.selectedPlayer')).toBeTruthy();
    expect(getByText('Indlæser pokaler og kalendere...')).toBeTruthy();
    expect(queryByTestId('performance.trophies.count.gold')).toBeNull();
  });

  it('shows historik and excludes current week activities', () => {
    mockUseHomeActivities.mockReturnValue({
      loading: false,
      hasLoadedFullWindow: true,
      loadFullWindow: jest.fn().mockResolvedValue(true),
      refresh: jest.fn(),
      activities: [
        {
          id: 'past-activity',
          title: 'Past activity title',
          activity_date: '2026-02-12',
          activity_time: '10:00:00',
          duration_minutes: 40,
          tasks: [],
        },
        {
          id: 'current-activity',
          title: 'Current week title',
          activity_date: '2026-02-26',
          activity_time: '10:00:00',
          duration_minutes: 40,
          tasks: [],
        },
      ],
    });

    const { getByText, getAllByTestId, getByTestId, queryByText } = render(<PerformanceScreen />);

    expect(getByText('Historik')).toBeTruthy();
    fireEvent.press(getByTestId('performance.history.toggle'));
    expect(getAllByTestId('mock.weeklySummaryCard')).toHaveLength(1);

    fireEvent.press(getByText('mock.weeklySummaryCard'));

    expect(getByText('Past activity title')).toBeTruthy();
    expect(queryByText('Current week title')).toBeNull();
  });

  it('uses trophies from football context instead of deriving them from history weeks', () => {
    mockUseFootball.mockReturnValue({
      trophies: [
        { week: 7, year: 2026, type: 'gold', percentage: 100, completedTasks: 2, totalTasks: 2 },
        { week: 6, year: 2026, type: 'bronze', percentage: 25, completedTasks: 1, totalTasks: 4 },
      ],
      hasPerformanceDataLoaded: true,
      ensurePerformanceDataLoaded: jest.fn(),
      currentWeekStats: {
        percentage: 60,
        completedTasks: 3,
        totalTasks: 5,
        completedTasksForWeek: 5,
        totalTasksForWeek: 8,
        weekActivities: [],
      },
      externalCalendars: [],
      fetchExternalCalendarEvents: jest.fn(),
      categories: [],
    });

    mockUseHomeActivities.mockReturnValue({
      loading: false,
      hasLoadedFullWindow: true,
      loadFullWindow: jest.fn().mockResolvedValue(true),
      refresh: jest.fn(),
      activities: [],
    });

    const { getByText } = render(<PerformanceScreen />);

    fireEvent.press(getByText('Bronze pokaler'));

    expect(getByText('Uge 6, 2026')).toBeTruthy();
    expect(getByText('1 / 4')).toBeTruthy();
  });

  it('only reflects trophy weeks that have tasks', () => {
    mockUseFootball.mockReturnValue({
      trophies: [
        { week: 7, year: 2026, type: 'bronze', percentage: 25, completedTasks: 1, totalTasks: 4 },
      ],
      hasPerformanceDataLoaded: true,
      ensurePerformanceDataLoaded: jest.fn(),
      currentWeekStats: {
        percentage: 60,
        completedTasks: 3,
        totalTasks: 5,
        completedTasksForWeek: 5,
        totalTasksForWeek: 8,
        weekActivities: [],
      },
      externalCalendars: [],
      fetchExternalCalendarEvents: jest.fn(),
      categories: [],
    });

    const { getByText, queryByText } = render(<PerformanceScreen />);

    expect(getByText('Bronze pokaler')).toBeTruthy();
    fireEvent.press(getByText('Bronze pokaler'));

    expect(getByText('Uge 7, 2026')).toBeTruthy();
    expect(queryByText('Uge 10, 2026')).toBeNull();
    expect(queryByText('0 / 0')).toBeNull();
  });

  it('shows 0 in all trophy boxes when valid trophy data is loaded but empty', () => {
    const { getByTestId } = render(<PerformanceScreen />);

    expect(getByTestId('performance.trophies.count.gold').props.children).toBe(0);
    expect(getByTestId('performance.trophies.count.silver').props.children).toBe(0);
    expect(getByTestId('performance.trophies.count.bronze').props.children).toBe(0);
  });

  it('does not render stale trophy counts before performance data is validly loaded', () => {
    mockUseFootball.mockReturnValue({
      trophies: [
        { week: 7, year: 2026, type: 'gold', percentage: 100, completedTasks: 2, totalTasks: 2 },
      ],
      hasPerformanceDataLoaded: false,
      ensurePerformanceDataLoaded: jest.fn(() => new Promise(() => {})),
      currentWeekStats: {
        percentage: 60,
        completedTasks: 3,
        totalTasks: 5,
        completedTasksForWeek: 5,
        totalTasksForWeek: 8,
        weekActivities: [],
      },
      externalCalendars: [],
      fetchExternalCalendarEvents: jest.fn(),
      categories: [],
    });

    const { getByText, queryByTestId } = render(<PerformanceScreen />);

    expect(getByText('Indlæser pokaler og kalendere...')).toBeTruthy();
    expect(queryByTestId('performance.trophies.count.gold')).toBeNull();
    expect(queryByTestId('performance.trophies.count.silver')).toBeNull();
    expect(queryByTestId('performance.trophies.count.bronze')).toBeNull();
  });

  it('keeps historik loading visible when full window is not actually ready', () => {
    const loadFullWindow = jest.fn().mockResolvedValue(false);

    mockUseHomeActivities.mockReturnValue({
      loading: false,
      hasLoadedFullWindow: false,
      loadFullWindow,
      refresh: jest.fn(),
      activities: [],
    });

    const { getByTestId, getByText } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.history.toggle'));

    expect(getByText('Indlæser fuld historik...')).toBeTruthy();
    expect(loadFullWindow).toHaveBeenCalled();
  });
});
