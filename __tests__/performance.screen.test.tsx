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
      ensurePerformanceDataLoaded: jest.fn().mockResolvedValue(undefined),
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
