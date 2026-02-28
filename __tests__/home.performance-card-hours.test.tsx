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

  it('renders Timer i dag and Timer denne uge with expected totals', () => {
    const { getByText, getByTestId, getByLabelText } = render(<HomeScreen />);
    fireEvent.press(getByLabelText('Udvid performance-kort'));

    expect(getByText('Timer i dag: 1 t')).toBeTruthy();
    expect(getByText('Timer denne uge: 2 t')).toBeTruthy();
    expect(getByTestId('home.performance.hoursToday')).toBeTruthy();
    expect(getByTestId('home.performance.hoursWeek')).toBeTruthy();
    expect(mockPush).toHaveBeenCalledTimes(0);
  });

  it('renders upcoming week summary collapsed and expands to show upcoming activities', () => {
    const { getByText, queryAllByTestId } = render(<HomeScreen />);

    expect(getByText('KOMMENDE UGE')).toBeTruthy();
    expect(getByText('Aktiviteter · 1')).toBeTruthy();
    expect(getByText('Opgaver · 0')).toBeTruthy();
    expect(getByText('Planlagt: 1 t')).toBeTruthy();
    expect(queryAllByTestId('mock.activityCard')).toHaveLength(2);

    fireEvent.press(getByText('KOMMENDE UGE'));
    expect(queryAllByTestId('mock.activityCard')).toHaveLength(3);
  });
});
