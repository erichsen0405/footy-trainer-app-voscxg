import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import PerformanceScreen from '../app/(tabs)/performance';

const mockUseFootball = jest.fn();
const mockUseHomeActivities = jest.fn();

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/hooks/useHomeActivities', () => ({
  useHomeActivities: () => mockUseHomeActivities(),
}));

jest.mock('@/components/ProgressionSection', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    ProgressionSection: () => <View testID="mock.progressionSection" />,
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
    mockUseFootball.mockReturnValue({
      trophies: [],
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
      refresh: jest.fn(),
      activities: [],
    });
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('renders performance task counts including intensity-adjusted totals', () => {
    const { getByTestId, getByText } = render(<PerformanceScreen />);

    expect(getByTestId('performance.statTasks.today')).toBeTruthy();
    expect(getByText('3 / 5')).toBeTruthy();
    expect(getByText('5 / 8')).toBeTruthy();
  });

  it('shows historik and excludes current week activities', () => {
    mockUseHomeActivities.mockReturnValue({
      loading: false,
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

    const { getByText, getAllByTestId, queryByText } = render(<PerformanceScreen />);

    expect(getByText('Historik')).toBeTruthy();
    expect(getAllByTestId('mock.weeklySummaryCard')).toHaveLength(1);

    fireEvent.press(getByText('mock.weeklySummaryCard'));

    expect(getByText('Past activity title')).toBeTruthy();
    expect(queryByText('Current week title')).toBeNull();
  });
});
