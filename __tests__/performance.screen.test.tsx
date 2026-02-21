import React from 'react';
import { render } from '@testing-library/react-native';

import PerformanceScreen from '../app/(tabs)/performance';

const mockUseFootball = jest.fn();

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => mockUseFootball(),
}));

jest.mock('@/components/ProgressionSection', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    ProgressionSection: () => <View testID="mock.progressionSection" />,
  };
});

describe('PerformanceScreen', () => {
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
  });

  it('renders performance task counts including intensity-adjusted totals', () => {
    const { getByTestId, getByText } = render(<PerformanceScreen />);

    expect(getByTestId('performance.statTasks.today')).toBeTruthy();
    expect(getByText('3 / 5')).toBeTruthy();
    expect(getByText('5 / 8')).toBeTruthy();
  });
});
