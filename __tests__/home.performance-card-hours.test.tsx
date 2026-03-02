import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { addDays, endOfWeek, format, startOfWeek } from 'date-fns';

import HomeScreen from '../app/(tabs)/(home)/index';

const mockPush = jest.fn();
const mockUseHomeActivities = jest.fn();
const mockUseFootball = jest.fn();
const mockUseUserRole = jest.fn();
const mockUseAdmin = jest.fn();
const mockUseTeamPlayer = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: () => {},
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/hooks/useHomeActivities', () => ({
  useHomeActivities: () => mockUseHomeActivities(),
}));

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/hooks/useUserRole', () => ({
  useUserRole: () => mockUseUserRole(),
}));

jest.mock('@/contexts/AdminContext', () => ({
  useAdmin: () => mockUseAdmin(),
}));

jest.mock('@/contexts/TeamPlayerContext', () => ({
  useTeamPlayer: () => mockUseTeamPlayer(),
}));

jest.mock('@/services/feedbackService', () => ({
  fetchSelfFeedbackForActivities: jest.fn().mockResolvedValue([]),
}));

jest.mock('@/components/ActivityCard', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View testID="mock.activityCard" />,
  };
});

jest.mock('@/components/CreateActivityModal', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View />,
  };
});

jest.mock('@/components/HomeSkeleton', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: () => <View testID="mock.homeSkeleton" />,
  };
});

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    IconSymbol: () => <Text>icon</Text>,
  };
});

jest.mock('@/components/AdminContextWrapper', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    AdminContextWrapper: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('@/components/TaskScoreNoteModal', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    TaskScoreNoteModal: () => <View />,
  };
});

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      }),
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
    },
    from: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

describe('Home performance card hour sums', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    let weekOnlyDate = addDays(today, 1);
    if (weekOnlyDate > weekEnd) {
      weekOnlyDate = addDays(today, -1);
    }
    if (weekOnlyDate < weekStart) {
      weekOnlyDate = weekStart;
    }

    const todayIso = format(today, 'yyyy-MM-dd');
    const weekOnlyIso = format(weekOnlyDate, 'yyyy-MM-dd');
    const previousWeekDate = addDays(weekStart, -1);
    const nextWeekStart = addDays(weekEnd, 1);
    const nextWeekDate = addDays(nextWeekStart, 1);

    mockUseHomeActivities.mockReturnValue({
      loading: false,
      refresh: jest.fn(),
      activities: [
        {
          id: 'a-today',
          title: 'Today duration field',
          activity_date: todayIso,
          activity_time: '08:00:00',
          duration_minutes: 150,
          tasks: [
            {
              id: 'task-1',
              task_duration_enabled: true,
              task_duration_minutes: 20,
            },
            {
              id: 'task-2',
              task_duration_enabled: true,
              task_duration_minutes: 40,
            },
          ],
        },
        {
          id: 'a-week',
          title: 'Week only from start/end',
          activity_date: weekOnlyIso,
          activity_time: '10:00:00',
          activity_end_time: '11:00:00',
          tasks: [],
        },
        {
          id: 'a-missing',
          title: 'Missing duration',
          activity_date: todayIso,
          activity_time: '14:00:00',
          tasks: [],
        },
        {
          id: 'a-previous-week',
          title: 'Previous week activity',
          activity_date: format(previousWeekDate, 'yyyy-MM-dd'),
          activity_time: '09:00:00',
          tasks: [],
        },
        {
          id: 'a-upcoming-week',
          title: 'Upcoming week activity',
          activity_date: format(nextWeekDate, 'yyyy-MM-dd'),
          activity_time: '11:00:00',
          tasks: [],
        },
      ],
    });

    mockUseFootball.mockReturnValue({
      categories: [],
      createActivity: jest.fn(),
      refreshData: jest.fn(),
      currentWeekStats: {
        percentage: 60,
        completedTasks: 3,
        totalTasks: 5,
        completedTasksForWeek: 5,
        totalTasksForWeek: 8,
        weekActivities: [],
      },
      toggleTaskCompletion: jest.fn(),
      updateActivitySingle: jest.fn(),
      updateIntensityByCategory: jest.fn(),
    });

    mockUseUserRole.mockReturnValue({ userRole: 'trainer' });
    mockUseAdmin.mockReturnValue({
      adminMode: 'self',
      adminTargetId: null,
      adminTargetType: null,
    });
    mockUseTeamPlayer.mockReturnValue({ selectedContext: null });
  });

  it('renders this week premium card with expected header and badges', () => {
    const { getByText, getByTestId } = render(<HomeScreen />);

    expect(getByTestId('home.thisWeekPremiumCard')).toBeTruthy();
    expect(getByText(/DENNE UGE/i)).toBeTruthy();
    expect(getByTestId('home.thisWeekPremiumCard.percent')).toBeTruthy();
    expect(getByTestId('home.thisWeekPremiumCard.ring')).toBeTruthy();
    expect(getByTestId('home.thisWeekPremiumCard.progress')).toBeTruthy();
    expect(getByTestId('home.thisWeekPremiumCard.chip.tasks')).toBeTruthy();
    expect(getByTestId('home.thisWeekPremiumCard.chip.planned')).toBeTruthy();
    expect(getByTestId('home.thisWeekPremiumCard.badge.today')).toBeTruthy();
    expect(getByTestId('home.thisWeekPremiumCard.trophy')).toBeTruthy();
    expect(mockPush).toHaveBeenCalledTimes(0);
  });

  it('renders upcoming week summary collapsed and expands to show upcoming activities', () => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const weekStart = startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
    const todayIso = format(today, 'yyyy-MM-dd');
    let currentWeekOtherDate = addDays(today, 1);
    if (currentWeekOtherDate > weekEnd) {
      currentWeekOtherDate = addDays(today, -1);
    }
    if (currentWeekOtherDate < weekStart) {
      currentWeekOtherDate = weekStart;
    }
    const nextWeekDate = addDays(weekEnd, 2);
    const previousWeekDate = addDays(weekStart, -1);
    const previousWeekOlderDate = addDays(weekStart, -8);

    mockUseHomeActivities.mockReturnValue({
      loading: false,
      refresh: jest.fn(),
      activities: [
        {
          id: 'case2-today',
          title: 'Today',
          activity_date: todayIso,
          activity_time: '08:00:00',
          tasks: [],
        },
        {
          id: 'case2-current-week',
          title: 'Current week other day',
          activity_date: format(currentWeekOtherDate, 'yyyy-MM-dd'),
          activity_time: '10:00:00',
          tasks: [],
        },
        {
          id: 'case2-previous',
          title: 'Previous week',
          activity_date: format(previousWeekDate, 'yyyy-MM-dd'),
          activity_time: '09:00:00',
          tasks: [],
        },
        {
          id: 'case2-previous-older',
          title: 'Previous week older',
          activity_date: format(previousWeekOlderDate, 'yyyy-MM-dd'),
          activity_time: '09:30:00',
          tasks: [],
        },
        {
          id: 'case2-upcoming',
          title: 'Upcoming week',
          activity_date: format(nextWeekDate, 'yyyy-MM-dd'),
          activity_time: '11:00:00',
          tasks: [],
        },
      ],
    });

    const {
      getAllByText,
      getByTestId,
      queryByTestId,
      queryAllByTestId,
    } = render(<HomeScreen />);

    expect(getByTestId('home.thisWeekPremiumCard')).toBeTruthy();
    expect(getAllByText('I dag').length).toBeGreaterThan(0);
    expect(queryAllByTestId('home.weekSummary.currentWeek')).toHaveLength(1);
    expect(queryAllByTestId('home.weekSummary.upcoming')).toHaveLength(1);
    expect(queryAllByTestId('mock.activityCard')).toHaveLength(1);

    fireEvent.press(getByTestId('home.currentWeek.modeToggle'));
    expect(queryAllByTestId('mock.activityCard')).toHaveLength(0);
    const todayLabels = getAllByText('I dag');
    fireEvent.press(todayLabels[todayLabels.length - 1]);
    expect(queryAllByTestId('mock.activityCard')).toHaveLength(1);

    expect(queryByTestId('home.previousWeeks.loadOne')).toBeNull();
    fireEvent.press(getByTestId('home.previousWeeks.toggle'));
    expect(queryAllByTestId('home.weekSummary.previous')).toHaveLength(1);
    expect(queryByTestId('home.previousWeeks.loadOne')).toBeTruthy();

    fireEvent.press(getByTestId('home.previousWeeks.loadOne'));
    expect(queryAllByTestId('home.weekSummary.previous')).toHaveLength(2);

    fireEvent.press(getByTestId('home.previousWeeks.toggle'));
    expect(queryAllByTestId('home.weekSummary.previous')).toHaveLength(0);
  });
});
