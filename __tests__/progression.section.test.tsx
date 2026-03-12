import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import { ProgressionSection } from '@/components/ProgressionSection';

const mockUseProgressionData = jest.fn();

jest.mock('@/hooks/useProgressionData', () => ({
  useProgressionData: (...args: unknown[]) => mockUseProgressionData(...args),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    callback();
  },
}));

jest.mock('@/components/ui/DropdownSelect', () => {
  const React = jest.requireActual('react');
  const { View, Text } = jest.requireActual('react-native');
  return {
    DropdownSelect: ({ label }: { label: string }) => (
      <View>
        <Text>{label}</Text>
      </View>
    ),
  };
});

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    IconSymbol: () => <View />,
  };
});

describe('ProgressionSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    const representative = {
      id: 'entry-1',
      kind: 'rating',
      createdAt: '2026-02-01T10:00:00.000Z',
      activityId: 'activity-1',
      taskInstanceId: 'task-1',
      taskTemplateId: 'template-1',
      taskTemplateName: 'Feedback opgaver',
      taskTemplateDescription: null,
      taskTemplateScoreExplanation: null,
      activityTitle: 'Session',
      rating: 5,
      intensity: null,
      note: null,
      dateKey: '2026-02-01',
      focusCategoryId: 'template-1',
      focusName: 'Feedback opgaver',
      focusColor: undefined,
      sessionKey: null,
    };

    mockUseProgressionData.mockReturnValue({
      trendPoints: [
        {
          id: 'point-1',
          dateKey: '2026-02-01',
          dateLabel: '01 Feb',
          value: 5,
          representative,
          sampleCount: 1,
        },
      ],
      isLoading: false,
      error: null,
      rawEntries: [representative],
      allFocusEntries: [representative],
      lastUpdated: new Date('2026-02-01T10:00:00.000Z'),
      refetch: jest.fn(),
      focusTemplates: [],
      intensityCategoriesWithData: [],
      possibleCount: 1,
      requiresLogin: false,
      heatmapRows: [],
      summary: {
        completionRate: 100,
        previousRate: 0,
        delta: 100,
        totalEntries: 1,
        successCount: 1,
        streakDays: 1,
        badges: [],
        possibleCount: 1,
        completedCount: 1,
        avgCurrent: 5,
        avgPrevious: 0,
        avgChangePercent: 100,
        scorePercent: 100,
        previousScorePercent: 0,
        deltaPercentPoints: 100,
      },
    });
  });

  it('shows numeric y-axis labels 1-5 on the progression chart', () => {
    const screen = render(
      <ProgressionSection categories={[{ id: 'cat-1', name: 'Kategori', color: '#123456' } as any]} />,
    );

    fireEvent(screen.getByTestId('progression.chartCard'), 'layout', {
      nativeEvent: { layout: { width: 320, height: 220 } },
    });

    expect(screen.getByTestId('progression.chartYAxis.1')).toBeTruthy();
    expect(screen.getByTestId('progression.chartYAxis.2')).toBeTruthy();
    expect(screen.getByTestId('progression.chartYAxis.3')).toBeTruthy();
    expect(screen.getByTestId('progression.chartYAxis.4')).toBeTruthy();
    expect(screen.getByTestId('progression.chartYAxis.5')).toBeTruthy();
    expect(screen.queryByTestId('progression.chartYAxis.0')).toBeNull();
    expect(screen.queryByTestId('progression.chartYAxis.10')).toBeNull();
  });
});
