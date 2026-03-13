import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ActivityDetailsContent } from '../app/activity-details';
import type { TrainerActivityFeedback } from '@/types';

const mockRouterPush = jest.fn();
const mockRefreshData = jest.fn().mockResolvedValue(undefined);
const mockFetchAssignments = jest.fn();
const mockFetchSelfFeedbackForActivities = jest.fn().mockResolvedValue([]);
const mockFetchSelfFeedbackForTemplates = jest.fn().mockResolvedValue([]);
const mockFetchLatestCategoryFeedback = jest.fn().mockResolvedValue([]);
const mockSendTrainerFeedback = jest.fn();
const mockFetchTrainerFeedbackForPlayerActivity = jest.fn();
const mockFetchTrainerFeedbackForTrainerActivity = jest.fn();
const mockSessionGet = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: jest.fn(() => true),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

jest.mock('expo-linear-gradient', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');
  return {
    LinearGradient: ({ children }: any) => <MockView>{children}</MockView>,
  };
});

jest.mock('@/components/IconSymbol', () => {
  const React = jest.requireActual('react');
  const { Text: MockText } = jest.requireActual('react-native');
  return {
    IconSymbol: () => <MockText>icon</MockText>,
  };
});

jest.mock('@/components/TaskDetailsModal', () => () => null);

jest.mock('@/components/CreateActivityTaskModal', () => ({
  CreateActivityTaskModal: () => null,
}));

jest.mock('@/components/AssignActivityModal', () => ({
  AssignActivityModal: () => null,
}));

jest.mock('@/contexts/FootballContext', () => ({
  useFootball: () => ({
    updateActivitySingle: jest.fn(),
    updateIntensityByCategory: jest.fn(),
    updateActivitySeries: jest.fn(),
    toggleTaskCompletion: jest.fn(),
    deleteActivityTask: jest.fn(),
    deleteActivitySingle: jest.fn(),
    deleteActivitySeries: jest.fn(),
    refreshData: mockRefreshData,
    createActivity: jest.fn(),
    duplicateActivity: jest.fn(),
    tasks: [],
  }),
}));

jest.mock('@/contexts/TeamPlayerContext', () => ({
  useTeamPlayer: () => ({
    players: [
      { id: 'player-1', full_name: 'Spiller Test', email: '', phone_number: '' },
      { id: 'player-2', full_name: 'Reserve Spiller', email: '', phone_number: '' },
    ],
  }),
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: (...args: any[]) => mockSessionGet(...args),
    },
    from: () => ({
      select: () => ({
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
      }),
    }),
  },
}));

jest.mock('@/services/feedbackService', () => ({
  fetchSelfFeedbackForActivities: (...args: any[]) => mockFetchSelfFeedbackForActivities(...args),
  fetchSelfFeedbackForTemplates: (...args: any[]) => mockFetchSelfFeedbackForTemplates(...args),
  fetchLatestCategoryFeedback: (...args: any[]) => mockFetchLatestCategoryFeedback(...args),
  upsertSelfFeedback: jest.fn(),
}));

jest.mock('@/services/activityAssignments', () => ({
  activityAssignmentsService: {
    fetchAssignments: (...args: any[]) => mockFetchAssignments(...args),
    fetchAssignmentState: jest.fn(),
    assignActivity: jest.fn(),
  },
}));

jest.mock('@/services/trainerFeedbackService', () => ({
  fetchTrainerFeedbackForPlayerActivity: (...args: any[]) => mockFetchTrainerFeedbackForPlayerActivity(...args),
  fetchTrainerFeedbackForTrainerActivity: (...args: any[]) =>
    mockFetchTrainerFeedbackForTrainerActivity(...args),
  sendTrainerFeedback: (...args: any[]) => mockSendTrainerFeedback(...args),
}));

const baseActivity = {
  id: 'activity-1',
  title: 'Mandagstræning',
  date: new Date('2026-03-13T10:00:00.000Z'),
  time: '10:00',
  endTime: null,
  location: 'Bane 1',
  category: {
    id: 'cat-1',
    name: 'Træning',
    color: '#123456',
    emoji: '⚽️',
  },
  tasks: [],
  intensity: null,
  intensityEnabled: false,
  intensityNote: null,
  isExternal: false,
};

describe('ActivityDetails trainer feedback UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockFetchAssignments.mockResolvedValue({ playerIds: ['player-1'], teamIds: [] });
    mockFetchTrainerFeedbackForPlayerActivity.mockResolvedValue([]);
    mockFetchTrainerFeedbackForTrainerActivity.mockResolvedValue([]);
    mockSendTrainerFeedback.mockResolvedValue({
      feedback: {
        id: 'feedback-1',
        activityContextType: 'internal',
        activityContextId: 'activity-source-1',
        playerId: 'player-1',
        trainerId: 'trainer-1',
        feedbackText: 'God førsteberøring',
        createdAt: '2026-03-13T10:00:00.000Z',
        updatedAt: '2026-03-13T10:00:00.000Z',
      },
      delivery: {
        mail: { status: 'sent', provider: 'aws_ses', warning: null },
        push: { status: 'sent', tokenCount: 1, warning: null },
      },
    });
  });

  it('shows the trainer section and add-flow for trainers', async () => {
    mockSessionGet.mockResolvedValue({
      data: { session: { user: { id: 'trainer-1' } } },
      error: null,
    });

    const { findByTestId, getByText, getByTestId, queryByText } = render(
      <ActivityDetailsContent
        activity={{ ...baseActivity, user_id: 'trainer-1' } as any}
        categories={[baseActivity.category]}
        isAdmin
        isTrainerProfile
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    expect(await findByTestId('trainer-feedback-section')).toBeTruthy();

    fireEvent.press(getByTestId('trainer-feedback-add-button'));

    expect(await findByTestId('trainer-feedback-player-picker')).toBeTruthy();
    fireEvent.press(getByText('Spiller Test'));
    expect(queryByText('Reserve Spiller')).toBeNull();
    fireEvent.changeText(getByTestId('trainer-feedback-input'), 'Fortsæt med orienteringen.');
    fireEvent.press(getByTestId('trainer-feedback-send-button'));

    await waitFor(() =>
      expect(mockSendTrainerFeedback).toHaveBeenCalledWith({
        activityId: 'activity-1',
        playerId: 'player-1',
        feedbackText: 'Fortsæt med orienteringen.',
      }),
    );
  });

  it('shows sent trainer feedback and opens a read modal for the trainer', async () => {
    const feedback: TrainerActivityFeedback = {
      id: 'feedback-1',
      activityContextType: 'internal',
      activityContextId: 'activity-1',
      playerId: 'player-1',
      trainerId: 'trainer-1',
      feedbackText: 'Bliv ved med at orientere dig før førsteberøringen.',
      createdAt: '2026-03-13T10:00:00.000Z',
      updatedAt: '2026-03-13T10:05:00.000Z',
    };

    mockSessionGet.mockResolvedValue({
      data: { session: { user: { id: 'trainer-1' } } },
      error: null,
    });
    mockFetchTrainerFeedbackForTrainerActivity.mockResolvedValue([feedback]);

    const { findByTestId, getByTestId, findByText, queryByText } = render(
      <ActivityDetailsContent
        activity={{ ...baseActivity, user_id: 'trainer-1' } as any}
        categories={[baseActivity.category]}
        isAdmin
        isTrainerProfile
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    expect(await findByTestId('trainer-feedback-section')).toBeTruthy();
    expect(await findByText('Spiller Test')).toBeTruthy();
    expect(queryByText('Bliv ved med at orientere dig før førsteberøringen.')).toBeNull();

    fireEvent.press(getByTestId('trainer-feedback-open-modal-feedback-1'));

    expect(await findByText('Feedback til Spiller Test')).toBeTruthy();
    expect(await findByText('Bliv ved med at orientere dig før førsteberøringen.')).toBeTruthy();
  });

  it('shows the player section only when trainer feedback exists and opens the modal', async () => {
    const feedback: TrainerActivityFeedback[] = [
      {
        id: 'feedback-2',
        activityContextType: 'internal',
        activityContextId: 'activity-source-1',
        playerId: 'player-1',
        trainerId: 'trainer-1',
        feedbackText: 'God førsteberøring i små rum.',
        createdAt: '2026-03-13T10:00:00.000Z',
        updatedAt: '2026-03-13T10:00:00.000Z',
      },
      {
        id: 'feedback-3',
        activityContextType: 'internal',
        activityContextId: 'activity-source-1',
        playerId: 'player-1',
        trainerId: 'trainer-2',
        feedbackText: 'Spil hurtigere i anden bølge.',
        createdAt: '2026-03-13T10:06:00.000Z',
        updatedAt: '2026-03-13T10:08:00.000Z',
      },
    ];

    mockSessionGet.mockResolvedValue({
      data: { session: { user: { id: 'player-1' } } },
      error: null,
    });
    mockFetchTrainerFeedbackForPlayerActivity.mockResolvedValue(feedback);

    const { findByTestId, getByTestId, findByText, queryByText } = render(
      <ActivityDetailsContent
        activity={{ ...baseActivity, user_id: 'player-1', source_activity_id: 'activity-source-1' } as any}
        categories={[baseActivity.category]}
        isAdmin={false}
        isPlayerProfile
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    expect(await findByTestId('player-trainer-feedback-section')).toBeTruthy();
    expect(await findByText('Feedback 1')).toBeTruthy();
    expect(await findByText('Feedback 2')).toBeTruthy();
    expect(queryByText('Spil hurtigere i anden bølge.')).toBeNull();

    fireEvent.press(getByTestId('player-trainer-feedback-open-modal-feedback-2'));

    expect(await findByText('God førsteberøring i små rum.')).toBeTruthy();
  });

  it('does not show the player section when no trainer feedback exists', async () => {
    mockSessionGet.mockResolvedValue({
      data: { session: { user: { id: 'player-1' } } },
      error: null,
    });
    mockFetchTrainerFeedbackForPlayerActivity.mockResolvedValue([]);

    const { queryByTestId } = render(
      <ActivityDetailsContent
        activity={{ ...baseActivity, user_id: 'player-1', source_activity_id: 'activity-source-1' } as any}
        categories={[baseActivity.category]}
        isAdmin={false}
        isPlayerProfile
        isDark={false}
        onBack={jest.fn()}
        onActivityUpdated={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockFetchTrainerFeedbackForPlayerActivity).toHaveBeenCalled());
    expect(queryByTestId('player-trainer-feedback-section')).toBeNull();
  });
});
