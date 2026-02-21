import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TaskScoreNoteScreen from '../app/(modals)/task-score-note';

const mockDismiss = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRefreshData = jest.fn().mockResolvedValue(undefined);
const mockUpdateActivitySingle = jest.fn().mockResolvedValue(undefined);

let mockParams: Record<string, unknown> = {};
let mockActivityRowsById: Record<
  string,
  { id: string; intensity: number | null; intensity_enabled: boolean; intensity_note: string | null }
> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({
    dismiss: mockDismiss,
    back: mockBack,
    replace: mockReplace,
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => ({
    refreshData: mockRefreshData,
    updateActivitySingle: mockUpdateActivitySingle,
  }),
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      if (table === 'activities' || table === 'events_local_meta') {
        let rowId: string | null = null;
        const builder: any = {
          select: () => builder,
          eq: (_column: string, value: unknown) => {
            rowId = String(value ?? '');
            return builder;
          },
          maybeSingle: async () => {
            if (table === 'activities' && rowId && rowId in mockActivityRowsById) {
              return { data: mockActivityRowsById[rowId], error: null };
            }
            return { data: null, error: null };
          },
        };
        return builder;
      }

      throw new Error(`Unexpected supabase table: ${table}`);
    },
  },
}));

jest.mock('expo-blur', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    BlurView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    LinearGradient: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

describe('task-score-note screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = { activityId: 'activity-1' };
    mockActivityRowsById = {
      'activity-1': {
        id: 'activity-1',
        intensity: null,
        intensity_enabled: true,
        intensity_note: 'Skal ikke vises',
      },
    };

    jest.spyOn(Alert, 'alert').mockImplementation((title: any, _message?: any, buttons?: any) => {
      if (title === 'forlad uden at gemme?' && Array.isArray(buttons)) {
        const leave = buttons.find((candidate: any) => candidate?.text === 'Forlad');
        leave?.onPress?.();
      }
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resets score+note when reopening another unfinished intensity task', async () => {
    mockActivityRowsById['activity-2'] = {
      id: 'activity-2',
      intensity: null,
      intensity_enabled: true,
      intensity_note: null,
    };

    const screen = render(<TaskScoreNoteScreen />);

    await waitFor(() => expect(screen.getByTestId('feedback.noteInput').props.value).toBe(''));
    expect(screen.getByTestId('feedback.selectedScore.none')).toBeTruthy();

    fireEvent.press(screen.getByTestId('feedback.scoreInput'));
    fireEvent.press(screen.getByTestId('feedback.scoreOption.7'));
    fireEvent.changeText(screen.getByTestId('feedback.noteInput'), 'Kun draft');
    fireEvent.press(screen.getByText('X'));

    mockParams = { activityId: 'activity-2' };
    screen.rerender(<TaskScoreNoteScreen />);

    await waitFor(() => expect(screen.getByTestId('feedback.noteInput').props.value).toBe(''));
    expect(screen.getByTestId('feedback.selectedScore.none')).toBeTruthy();
    expect(mockDismiss).toHaveBeenCalled();
  });

  it('hydrates persisted intensity note+score when task is completed', async () => {
    mockActivityRowsById['activity-completed'] = {
      id: 'activity-completed',
      intensity: 9,
      intensity_enabled: true,
      intensity_note: 'Gemt intensitet note',
    };
    mockParams = { activityId: 'activity-completed' };

    const screen = render(<TaskScoreNoteScreen />);

    await waitFor(() => expect(screen.getByTestId('feedback.noteInput').props.value).toBe('Gemt intensitet note'));
    await waitFor(() => expect(screen.getByTestId('feedback.selectedScore.9')).toBeTruthy());
  });
});
