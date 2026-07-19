import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import PerformanceScreen from '../app/(tabs)/performance';

const mockUseFootball = jest.fn();
const mockUseHomeActivities = jest.fn();
const mockStartAdminPlayer = jest.fn();
const mockStartAdminTeam = jest.fn();
const mockExitAdmin = jest.fn();
const mockSetSelectedContext = jest.fn();
const mockEnsureRosterLoaded = jest.fn();
const mockGetTeamMembers = jest.fn();
const mockFetchSelfFeedbackForActivities = jest.fn();
const mockActivityCard = jest.fn();

const mockAdminState = {
  adminMode: 'self' as 'self' | 'player' | 'team',
  adminTargetId: null as string | null,
  adminTargetType: null as 'player' | 'team' | null,
};
const mockAuthSessionState = {
  user: { id: 'self-user-id' } as { id: string } | null,
};
const mockTeamPlayerState = {
  players: [] as { id: string; full_name: string; email: string; phone_number?: string }[],
  teams: [] as { id: string; name: string; admin_id: string; created_at: Date; updated_at: Date }[],
  selectedContext: { type: null, id: null, name: null } as { type: 'player' | 'team' | null; id: string | null; name: string | null },
  loading: false,
};
const mockUserRoleState = {
  userRole: 'player' as 'admin' | 'trainer' | 'player' | null,
};

jest.mock('@/contexts/AdminContext', () => ({
  useAdmin: () => ({
    ...mockAdminState,
    startAdminPlayer: mockStartAdminPlayer,
    startAdminTeam: mockStartAdminTeam,
    exitAdmin: mockExitAdmin,
  }),
}));

jest.mock('@/contexts/AuthSessionContext', () => ({
  useAuthSession: () => ({
    user: mockAuthSessionState.user,
    session: mockAuthSessionState.user ? { user: mockAuthSessionState.user } : null,
    authReady: true,
    isAuthenticated: Boolean(mockAuthSessionState.user),
    refreshSession: jest.fn(),
  }),
}));

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/contexts/TeamPlayerContext', () => ({
  useTeamPlayer: () => ({
    players: mockTeamPlayerState.players,
    teams: mockTeamPlayerState.teams,
    selectedContext: mockTeamPlayerState.selectedContext,
    loading: mockTeamPlayerState.loading,
    ensureRosterLoaded: mockEnsureRosterLoaded,
    getTeamMembers: mockGetTeamMembers,
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
    ProgressionSection: ({ targetUserId, targetUserIds }: { targetUserId?: string | null; targetUserIds?: string[] | null }) => (
      <View testID="mock.progressionSection">
        <Text testID="mock.progressionTarget">{targetUserId ?? 'self'}</Text>
        <Text testID="mock.progressionTargets">{targetUserIds?.join('|') ?? 'none'}</Text>
      </View>
    ),
  };
});

jest.mock('@/components/ActivityCard', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: { activity: any }) => {
      mockActivityCard(props);
      return <Text>{props.activity?.title ?? 'untitled'}</Text>;
    },
  };
});

jest.mock('@/services/feedbackService', () => ({
  fetchSelfFeedbackForActivities: (...args: unknown[]) => mockFetchSelfFeedbackForActivities(...args),
}));

jest.mock('@/components/WeeklySummaryCard', () => {
  const React = jest.requireActual('react');
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    WeeklySummaryCard: ({
      onPress,
      activityCount,
      totalTasks,
      totalMinutes,
    }: {
      onPress: () => void;
      activityCount: number;
      totalTasks: number;
      totalMinutes: number;
    }) => (
      <Pressable testID="mock.weeklySummaryCard" onPress={onPress}>
        <Text>mock.weeklySummaryCard</Text>
        <Text testID="mock.weeklySummaryCard.activityCount">{activityCount}</Text>
        <Text testID="mock.weeklySummaryCard.totalTasks">{totalTasks}</Text>
        <Text testID="mock.weeklySummaryCard.totalMinutes">{totalMinutes}</Text>
      </Pressable>
    ),
  };
});

jest.mock('@/components/playerPrograms/PlayerProgramExperience', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    PlayerProgramProgressCard: () => <View testID="mock.playerProgramProgress" />,
  };
});

describe('PerformanceScreen', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-28T10:00:00.000Z'));
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockAdminState.adminMode = 'self';
    mockAdminState.adminTargetId = null;
    mockAdminState.adminTargetType = null;
    mockAuthSessionState.user = { id: 'self-user-id' };
    mockTeamPlayerState.players = [];
    mockTeamPlayerState.teams = [];
    mockTeamPlayerState.selectedContext = { type: null, id: null, name: null };
    mockTeamPlayerState.loading = false;
    mockUserRoleState.userRole = 'player';
    mockSetSelectedContext.mockResolvedValue(undefined);
    mockEnsureRosterLoaded.mockReturnValue(new Promise(() => {}));
    mockGetTeamMembers.mockResolvedValue([]);
    mockFetchSelfFeedbackForActivities.mockResolvedValue([]);

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

  it('shows collapsible trophies and udvikling sections', () => {
    const { getByTestId, getByText, queryByTestId, queryByText } = render(<PerformanceScreen />);

    expect(getByText('Trophies')).toBeTruthy();
    expect(getByText('Development')).toBeTruthy();
    expect(queryByText('Gold trophies')).toBeNull();
    expect(queryByTestId('mock.progressionSection')).toBeNull();

    fireEvent.press(getByTestId('performance.trophies.toggle'));
    expect(getByText('Gold trophies')).toBeTruthy();

    fireEvent.press(getByTestId('performance.progression.toggle'));
    expect(getByTestId('mock.progressionSection')).toBeTruthy();

    fireEvent.press(getByTestId('performance.trophies.toggle'));
    expect(queryByText('Gold trophies')).toBeNull();

    fireEvent.press(getByTestId('performance.trophies.toggle'));
    expect(getByText('Gold trophies')).toBeTruthy();

    fireEvent.press(getByTestId('performance.progression.toggle'));
    expect(queryByTestId('mock.progressionSection')).toBeNull();
  });

  it('shows scope filter for trainer profiles', () => {
    mockUserRoleState.userRole = 'trainer';

    const { getByTestId } = render(<PerformanceScreen />);

    expect(getByTestId('performance.scopeFilter.toggle')).toBeTruthy();
  });

  it('does not show scope filter for player profiles', () => {
    mockUserRoleState.userRole = 'player';

    const { queryByTestId } = render(<PerformanceScreen />);

    expect(queryByTestId('performance.scopeFilter.toggle')).toBeNull();
  });

  it('renders trainer-linked players and teams in the scope filter', () => {
    mockUserRoleState.userRole = 'trainer';
    mockTeamPlayerState.players = [
      { id: 'player-1', email: '', full_name: 'Alma Striker' },
      { id: 'player-2', email: '', full_name: 'Birk Fullback' },
    ];
    mockTeamPlayerState.teams = [
      { id: 'team-1', name: 'U15', admin_id: 'trainer-1', created_at: new Date(), updated_at: new Date() },
    ];

    const { getByTestId, getByText, queryByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.scopeFilter.toggle'));

    expect(getByText('Alma Striker')).toBeTruthy();
    expect(getByText('Birk Fullback')).toBeTruthy();
    expect(getByText('U15')).toBeTruthy();
    expect(queryByTestId('performance.scopeFilter.option.player.player-3')).toBeNull();
  });

  it('shows the trainer scope filter loading state', () => {
    mockUserRoleState.userRole = 'trainer';
    mockEnsureRosterLoaded.mockReturnValue(new Promise(() => {}));

    const { getByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.scopeFilter.toggle'));

    expect(getByTestId('performance.scopeFilter.loading')).toBeTruthy();
  });

  it('shows the trainer scope filter empty state', async () => {
    mockUserRoleState.userRole = 'trainer';
    mockEnsureRosterLoaded.mockResolvedValue(undefined);

    const { getByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.scopeFilter.toggle'));

    await waitFor(() => {
      expect(getByTestId('performance.scopeFilter.empty')).toBeTruthy();
    });
  });

  it('shows the trainer scope filter error state', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockUserRoleState.userRole = 'trainer';
    mockEnsureRosterLoaded.mockRejectedValue(new Error('roster failed'));

    const { getByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.scopeFilter.toggle'));

    await waitFor(() => {
      expect(getByTestId('performance.scopeFilter.error')).toBeTruthy();
    });

    consoleErrorSpy.mockRestore();
  });

  it('selects a linked player and updates the performance target', async () => {
    mockUserRoleState.userRole = 'trainer';
    mockTeamPlayerState.players = [
      { id: 'player-1', email: '', full_name: 'Alma Striker' },
    ];

    const screen = render(<PerformanceScreen />);

    fireEvent.press(screen.getByTestId('performance.scopeFilter.toggle'));
    fireEvent.press(screen.getByTestId('performance.scopeFilter.option.player.player-1'));

    await waitFor(() => {
      expect(mockSetSelectedContext).toHaveBeenCalledWith({
        type: 'player',
        id: 'player-1',
        name: 'Alma Striker',
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

    expect(screen.getByText('Showing performance for Alma Striker')).toBeTruthy();
    fireEvent.press(screen.getByTestId('performance.progression.toggle'));
    expect(screen.getByTestId('mock.progressionTarget').props.children).toBe('player-1');
    fireEvent.press(screen.getByTestId('performance.trophies.toggle'));
    expect(screen.getByTestId('performance.trophies.count.gold').props.children).toBe(1);
  });

  it('selects a team and passes team members to progression', async () => {
    mockUserRoleState.userRole = 'trainer';
    mockTeamPlayerState.players = [
      { id: 'player-1', email: '', full_name: 'Alma Striker' },
      { id: 'player-2', email: '', full_name: 'Birk Fullback' },
    ];
    mockTeamPlayerState.teams = [
      { id: 'team-1', name: 'U15', admin_id: 'trainer-1', created_at: new Date(), updated_at: new Date() },
    ];
    mockGetTeamMembers.mockResolvedValue([
      { id: 'player-1', email: '', full_name: 'Alma Striker' },
      { id: 'player-2', email: '', full_name: 'Birk Fullback' },
    ]);

    const screen = render(<PerformanceScreen />);

    fireEvent.press(screen.getByTestId('performance.scopeFilter.toggle'));
    fireEvent.press(screen.getByTestId('performance.scopeFilter.option.team.team-1'));

    await waitFor(() => {
      expect(mockSetSelectedContext).toHaveBeenCalledWith({
        type: 'team',
        id: 'team-1',
        name: 'U15',
      });
      expect(mockStartAdminTeam).toHaveBeenCalledWith('team-1');
    });

    mockAdminState.adminMode = 'team';
    mockAdminState.adminTargetId = 'team-1';
    mockAdminState.adminTargetType = 'team';
    mockTeamPlayerState.selectedContext = { type: 'team', id: 'team-1', name: 'U15' };

    screen.rerender(<PerformanceScreen />);

    await waitFor(() => {
      expect(mockGetTeamMembers).toHaveBeenCalledWith('team-1');
    });

    fireEvent.press(screen.getByTestId('performance.progression.toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('mock.progressionTargets').props.children).toBe('player-1|player-2');
    });
  });

  it('keeps the selected player visible while selected performance data is loading', () => {
    mockUserRoleState.userRole = 'trainer';
    mockAdminState.adminMode = 'player';
    mockAdminState.adminTargetId = 'player-1';
    mockAdminState.adminTargetType = 'player';
    mockTeamPlayerState.players = [
      { id: 'player-1', email: '', full_name: 'Alma Striker' },
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
    fireEvent.press(getByTestId('performance.trophies.toggle'));
    expect(getByText('Loading trophies and calendars...')).toBeTruthy();
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

    expect(getByText('History')).toBeTruthy();
    fireEvent.press(getByTestId('performance.history.toggle'));
    expect(getAllByTestId('mock.weeklySummaryCard')).toHaveLength(1);

    fireEvent.press(getByText('mock.weeklySummaryCard'));

    expect(getByText('Past activity title')).toBeTruthy();
    expect(queryByText('Current week title')).toBeNull();
  });

  it('passes completed history feedback to activity cards', async () => {
    const activityId = '11111111-1111-1111-1111-111111111111';
    mockUserRoleState.userRole = 'trainer';
    mockAdminState.adminMode = 'player';
    mockAdminState.adminTargetId = 'player-1';
    mockAdminState.adminTargetType = 'player';
    mockTeamPlayerState.players = [
      { id: 'player-1', email: '', full_name: 'Alma Striker' },
    ];
    mockFetchSelfFeedbackForActivities.mockResolvedValue([
      {
        id: 'feedback-row-1',
        userId: 'player-1',
        taskTemplateId: 'template-1',
        taskTemplateTitle: 'Scan før du får bolden',
        taskInstanceId: 'feedback-task-1',
        activityId,
        rating: 5,
        note: '',
        createdAt: '2026-02-12T12:00:00.000Z',
        updatedAt: '2026-02-12T12:00:00.000Z',
      },
    ]);
    mockUseHomeActivities.mockReturnValue({
      loading: false,
      hasLoadedFullWindow: true,
      loadFullWindow: jest.fn().mockResolvedValue(true),
      refresh: jest.fn(),
      activities: [
        {
          id: activityId,
          title: 'Feedback history activity',
          activity_date: '2026-02-12',
          activity_time: '10:00:00',
          duration_minutes: 40,
          tasks: [
            {
              id: 'feedback-task-1',
              title: 'Feedback på boldkontrol',
              feedback_template_id: 'template-1',
              completed: false,
            },
          ],
        },
      ],
    });

    const screen = render(<PerformanceScreen />);

    fireEvent.press(screen.getByTestId('performance.history.toggle'));
    fireEvent.press(screen.getByText('mock.weeklySummaryCard'));

    await waitFor(() => {
      expect(mockFetchSelfFeedbackForActivities).toHaveBeenCalledWith('player-1', [activityId]);
    });

    await waitFor(() => {
      expect(
        mockActivityCard.mock.calls.some(([props]) =>
          props?.activity?.id === activityId &&
          props?.feedbackActivityId === activityId &&
          props?.feedbackDone === true &&
          props?.feedbackCompletionByTaskId?.['feedback-task-1'] === true &&
          props?.feedbackCompletionByTemplateId?.['template-1'] === true
        ),
      ).toBe(true);
    });
  });

  it('counts completed history feedback in history week totals', async () => {
    const activityId = '33333333-3333-3333-3333-333333333333';
    mockFetchSelfFeedbackForActivities.mockResolvedValue([
      {
        id: 'feedback-row-week-1',
        userId: 'self-user-id',
        taskTemplateId: 'template-week-1',
        taskTemplateTitle: 'Scan før du får bolden',
        taskInstanceId: null,
        activityId,
        rating: 4,
        note: '',
        createdAt: '2026-02-12T12:00:00.000Z',
        updatedAt: '2026-02-12T12:00:00.000Z',
      },
    ]);
    mockUseHomeActivities.mockReturnValue({
      loading: false,
      hasLoadedFullWindow: true,
      loadFullWindow: jest.fn().mockResolvedValue(true),
      refresh: jest.fn(),
      activities: [
        {
          id: activityId,
          title: 'Feedback week total',
          activity_date: '2026-02-12',
          activity_time: '10:00:00',
          duration_minutes: 45,
          tasks: [],
        },
      ],
    });

    const screen = render(<PerformanceScreen />);

    fireEvent.press(screen.getByTestId('performance.history.toggle'));

    await waitFor(() => {
      expect(mockFetchSelfFeedbackForActivities).toHaveBeenCalledWith('self-user-id', [activityId]);
    });

    await waitFor(() => {
      expect(screen.getByTestId('mock.weeklySummaryCard.totalTasks').props.children).toBe(2);
      expect(screen.getByTestId('mock.weeklySummaryCard.totalMinutes').props.children).toBe(45);
    });

    fireEvent.press(screen.getByText('mock.weeklySummaryCard'));

    await waitFor(() => {
      expect(
        mockActivityCard.mock.calls.some(([props]) =>
          props?.activity?.id === activityId &&
          props?.activity?.tasks?.some(
            (task: any) =>
              task?.title === 'Scan før du får bolden' &&
              task?.taskTemplateId === 'template-week-1' &&
              task?.completed === true,
          ) &&
          props?.activity?.tasks?.some(
            (task: any) =>
              task?.title === 'Feedback på Scan før du får bolden' &&
              task?.feedbackTemplateId === 'template-week-1' &&
              task?.completed === true,
          )
        ),
      ).toBe(true);
    });
  });

  it('filters historik weekly totals by saved category filters', async () => {
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
      categories: [
        { id: 'cat-technical', name: 'Technical', color: '#4CAF50', emoji: 'T' },
        { id: 'cat-strength', name: 'Strength', color: '#2196F3', emoji: 'S' },
        { id: 'cat-recovery', name: 'Recovery', color: '#FF9800', emoji: 'R' },
      ],
    });
    mockUseHomeActivities.mockReturnValue({
      loading: false,
      hasLoadedFullWindow: true,
      loadFullWindow: jest.fn().mockResolvedValue(true),
      refresh: jest.fn(),
      activities: [
        {
          id: 'technical-activity',
          title: 'Technical history',
          activity_date: '2026-02-12',
          activity_time: '10:00:00',
          category_id: 'cat-technical',
          category: { id: 'cat-technical', name: 'Technical', color: '#4CAF50', emoji: 'T' },
          duration_minutes: 30,
          tasks: [{ id: 'task-technical', completed: true }],
        },
        {
          id: 'strength-activity',
          title: 'Strength history',
          activity_date: '2026-02-13',
          activity_time: '10:00:00',
          category_id: 'cat-strength',
          category: { id: 'cat-strength', name: 'Strength', color: '#2196F3', emoji: 'S' },
          duration_minutes: 45,
          tasks: [{ id: 'task-strength', completed: true }],
        },
        {
          id: 'recovery-activity',
          title: 'Recovery history',
          activity_date: '2026-02-14',
          activity_time: '10:00:00',
          category_id: 'cat-recovery',
          category: { id: 'cat-recovery', name: 'Recovery', color: '#FF9800', emoji: 'R' },
          duration_minutes: 60,
          tasks: [{ id: 'task-recovery', completed: true }],
        },
      ],
    });

    const screen = render(<PerformanceScreen />);

    fireEvent.press(screen.getByTestId('performance.history.toggle'));
    expect(screen.getByTestId('mock.weeklySummaryCard.activityCount').props.children).toBe(3);
    expect(screen.getByTestId('mock.weeklySummaryCard.totalTasks').props.children).toBe(3);
    expect(screen.getByTestId('mock.weeklySummaryCard.totalMinutes').props.children).toBe(135);

    fireEvent.press(screen.getByTestId('performance.historyFilter.open'));
    fireEvent.press(screen.getByTestId('performance.historyFilter.category.cat-technical'));
    fireEvent.press(screen.getByTestId('performance.historyFilter.category.cat-strength'));
    fireEvent.changeText(screen.getByTestId('performance.historyFilter.nameInput'), 'Main work');
    fireEvent.press(screen.getByTestId('performance.historyFilter.save'));

    await waitFor(() => {
      expect(screen.getByTestId('mock.weeklySummaryCard.activityCount').props.children).toBe(2);
      expect(screen.getByTestId('mock.weeklySummaryCard.totalTasks').props.children).toBe(2);
      expect(screen.getByTestId('mock.weeklySummaryCard.totalMinutes').props.children).toBe(75);
    });

    fireEvent.press(screen.getByTestId('mock.weeklySummaryCard'));
    expect(screen.getByText('Technical history')).toBeTruthy();
    expect(screen.getByText('Strength history')).toBeTruthy();
    expect(screen.queryByText('Recovery history')).toBeNull();

    await expect(AsyncStorage.getItem('@performance_history_category_filters_v1')).resolves.toContain('Main work');

    fireEvent.press(screen.getByTestId('performance.historyFilter.clear'));
    expect(screen.getByTestId('mock.weeklySummaryCard.activityCount').props.children).toBe(3);

    fireEvent.press(screen.getByTestId('performance.historyFilter.open'));
    fireEvent.press(screen.getByText('Main work'));

    await waitFor(() => {
      expect(screen.getByTestId('performance.historyFilter.activeLabel').props.children).toBe('Main work');
      expect(screen.getByTestId('mock.weeklySummaryCard.activityCount').props.children).toBe(2);
    });

    fireEvent.press(screen.getByTestId('performance.historyFilter.open'));
    fireEvent.press(screen.getByTestId('performance.historyFilter.clearDraft'));
    fireEvent.press(screen.getByTestId('performance.historyFilter.category.cat-recovery'));
    fireEvent.changeText(screen.getByTestId('performance.historyFilter.nameInput'), 'Recovery only');
    fireEvent.press(screen.getByTestId('performance.historyFilter.save'));

    await waitFor(() => {
      expect(screen.getByTestId('performance.historyFilter.activeLabel').props.children).toBe('Recovery only');
      expect(screen.getByTestId('mock.weeklySummaryCard.activityCount').props.children).toBe(1);
    });

    const storedFiltersRaw = await AsyncStorage.getItem('@performance_history_category_filters_v1');
    const storedFilters = JSON.parse(storedFiltersRaw ?? '[]');
    expect(storedFilters.map((filter: any) => filter.name).sort()).toEqual(['Main work', 'Recovery only']);
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

    const { getByTestId, getByText } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.trophies.toggle'));
    fireEvent.press(getByText('Bronze trophies'));

    expect(getByText('Week 6, 2026')).toBeTruthy();
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

    const { getByTestId, getByText, queryByText } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.trophies.toggle'));
    expect(getByText('Bronze trophies')).toBeTruthy();
    fireEvent.press(getByText('Bronze trophies'));

    expect(getByText('Week 7, 2026')).toBeTruthy();
    expect(queryByText('Week 10, 2026')).toBeNull();
    expect(queryByText('0 / 0')).toBeNull();
  });

  it('shows 0 in all trophy boxes when valid trophy data is loaded but empty', () => {
    const { getByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.trophies.toggle'));
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

    const { getByTestId, getByText, queryByTestId } = render(<PerformanceScreen />);

    fireEvent.press(getByTestId('performance.trophies.toggle'));
    expect(getByText('Loading trophies and calendars...')).toBeTruthy();
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

    expect(getByText('Loading full history...')).toBeTruthy();
    expect(loadFullWindow).toHaveBeenCalled();
  });
});
