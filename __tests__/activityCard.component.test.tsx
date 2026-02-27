import React from 'react';
import { render } from '@testing-library/react-native';

import ActivityCard from '@/components/ActivityCard';

const mockPush = jest.fn();
const mockToggleTaskCompletion = jest.fn();
const mockRefreshData = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    LinearGradient: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  return {
    IconSymbol: () => <Text>icon</Text>,
  };
});

jest.mock('@/components/TaskDetailsModal', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return () => <View testID="task-details-modal" />;
});

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => ({
    toggleTaskCompletion: mockToggleTaskCompletion,
    refreshData: mockRefreshData,
  }),
}));

const baseActivity = {
  id: 'activity-1',
  title: 'Match Prep',
  time: '10:00',
  location: 'Field A',
  category_color: '#4CAF50',
  activity_categories: {
    color: '#4CAF50',
    emoji: '⚽',
  },
};

describe('ActivityCard completion UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows task as not completed initially', () => {
    const { getByText } = render(
      <ActivityCard
        activity={{
          ...baseActivity,
          tasks: [{ id: 'task-1', title: 'Warmup', completed: false }],
        }}
        resolvedDate={new Date('2026-01-01T10:00:00Z')}
        showTasks
      />
    );

    expect(getByText('Warmup')).not.toHaveStyle({ textDecorationLine: 'line-through' });
  });

  it('updates completion UI after state change via rerender', () => {
    const { getByText, rerender } = render(
      <ActivityCard
        activity={{
          ...baseActivity,
          tasks: [{ id: 'task-1', title: 'Warmup', completed: false }],
        }}
        resolvedDate={new Date('2026-01-01T10:00:00Z')}
        showTasks
      />
    );

    rerender(
      <ActivityCard
        activity={{
          ...baseActivity,
          tasks: [{ id: 'task-1', title: 'Warmup', completed: true }],
        }}
        resolvedDate={new Date('2026-01-01T10:00:00Z')}
        showTasks
      />
    );

    expect(getByText('Warmup')).toHaveStyle({ textDecorationLine: 'line-through' });
  });

  it('marks feedback task completed from feedbackCompletionByTaskId map', () => {
    const { getByText } = render(
      <ActivityCard
        activity={{
          ...baseActivity,
          tasks: [
            {
              id: 'feedback-task-1',
              title: 'Feedback på: fokus',
              completed: false,
              feedback_template_id: 'template-1',
            },
          ],
        }}
        resolvedDate={new Date('2026-01-01T10:00:00Z')}
        showTasks
        feedbackCompletionByTaskId={{ 'feedback-task-1': true }}
      />
    );

    expect(getByText('Feedback på:')).toBeTruthy();
    expect(getByText(/Feedback på:\s*fokus/)).toBeTruthy();
    expect(getByText('Feedback på: fokus')).toHaveStyle({ textDecorationLine: 'line-through' });
  });

  it('keeps feedback task not completed without completion signals', () => {
    const { getByText } = render(
      <ActivityCard
        activity={{
          ...baseActivity,
          tasks: [
            {
              id: 'feedback-task-2',
              title: 'Feedback på teknik',
              completed: false,
              feedback_template_id: 'template-2',
            },
          ],
        }}
        resolvedDate={new Date('2026-01-01T10:00:00Z')}
        showTasks
        feedbackCompletionByTaskId={{}}
        feedbackCompletionByTemplateId={{}}
        feedbackDone={false}
      />
    );

    expect(getByText('Feedback på: teknik')).not.toHaveStyle({ textDecorationLine: 'line-through' });
  });

  it('renders NFD encoded feedback prefix without corrupting the task name', () => {
    const { getByText } = render(
      <ActivityCard
        activity={{
          ...baseActivity,
          tasks: [
            {
              id: 'feedback-task-3',
              title: 'Feedback pa\u030a: fokus',
              completed: false,
              feedback_template_id: 'template-3',
            },
          ],
        }}
        resolvedDate={new Date('2026-01-01T10:00:00Z')}
        showTasks
      />
    );

    expect(getByText('Feedback på: fokus')).toBeTruthy();
  });

  it('renders task duration badge when task duration is enabled', () => {
    const { getByText } = render(
      <ActivityCard
        activity={{
          ...baseActivity,
          tasks: [
            {
              id: 'task-with-duration-1',
              title: 'Pasningsøvelse',
              completed: false,
              task_duration_enabled: true,
              task_duration_minutes: 25,
            },
          ],
        }}
        resolvedDate={new Date('2026-01-01T10:00:00Z')}
        showTasks
      />
    );

    expect(getByText('Varighed: 25 min')).toBeTruthy();
  });

  it('does not render task duration badge for feedback tasks', () => {
    const { queryByText } = render(
      <ActivityCard
        activity={{
          ...baseActivity,
          tasks: [
            {
              id: 'feedback-with-duration-1',
              title: 'Feedback på: Pasningsøvelse',
              completed: false,
              feedback_template_id: 'feedback-template-1',
              task_duration_enabled: true,
              task_duration_minutes: 25,
            },
          ],
        }}
        resolvedDate={new Date('2026-01-01T10:00:00Z')}
        showTasks
      />
    );

    expect(queryByText('Varighed: 25 min')).toBeNull();
  });
});
