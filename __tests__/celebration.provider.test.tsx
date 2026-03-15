import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Pressable, Text, View } from 'react-native';
import { CelebrationProvider, useCelebration } from '@/contexts/CelebrationContext';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

function TriggerScreen() {
  const { showCelebration } = useCelebration();

  return (
    <View>
      <Pressable
        testID="trigger.task"
        onPress={() =>
          showCelebration({ type: 'task', completedToday: 3, totalToday: 5, remainingToday: 2 })
        }
      >
        <Text>Trigger Task</Text>
      </Pressable>
      <Pressable
        testID="trigger.day"
        onPress={() =>
          showCelebration({ type: 'dayComplete', completedToday: 5, totalToday: 5, remainingToday: 0 })
        }
      >
        <Text>Trigger Day</Text>
      </Pressable>
    </View>
  );
}

describe('CelebrationProvider overlay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockReturnValue({ remove: jest.fn() } as any);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows task celebration overlay when triggered', async () => {
    const { getByTestId, queryByTestId, getByText, getAllByTestId } = render(
      <CelebrationProvider>
        <TriggerScreen />
      </CelebrationProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(getByTestId('trigger.task'));

    expect(getByTestId('celebration-overlay')).toBeTruthy();
    expect(getByTestId('celebration-overlay.type')).toHaveTextContent('task');
    expect(getByTestId('celebration-title')).toHaveTextContent('Opgave fuldført');
    expect(getByTestId('celebration-subtitle')).toHaveTextContent('2 tilbage i dag');
    expect(getByText('I dag: 3/5')).toBeTruthy();
    expect(getAllByTestId('celebration-rocket').length).toBeGreaterThan(0);
    expect(getAllByTestId('celebration-fountain').length).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(4100);
    });

    expect(queryByTestId('celebration-overlay')).toBeNull();
  });

  it('shows dayComplete text and supports tap-to-dismiss', async () => {
    const { getByTestId, queryByTestId, getAllByTestId } = render(
      <CelebrationProvider>
        <TriggerScreen />
      </CelebrationProvider>
    );

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.press(getByTestId('trigger.day'));

    expect(getByTestId('celebration-overlay')).toBeTruthy();
    expect(getByTestId('celebration-overlay.type')).toHaveTextContent('dayComplete');
    expect(getByTestId('celebration-title')).toHaveTextContent('Dagens opgaver fuldført');
    expect(getByTestId('celebration-subtitle')).toHaveTextContent('Nyd resten af dagen.');
    expect(getByTestId('celebration-progress')).toHaveTextContent('I dag: 5/5');
    expect(getAllByTestId('celebration-rocket').length).toBeGreaterThan(0);
    expect(getAllByTestId('celebration-fountain').length).toBeGreaterThan(0);

    fireEvent.press(getByTestId('celebration-dismiss'));
    expect(queryByTestId('celebration-overlay')).toBeNull();
  });
});
