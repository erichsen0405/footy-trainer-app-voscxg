import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import TaskFeedbackNoteScreen from '../app/(modals)/task-feedback-note';

const mockDismiss = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockRefreshData = jest.fn().mockResolvedValue(undefined);
const mockFetchSelfFeedbackForTemplates = jest.fn();

let mockParams: Record<string, unknown> = {};
let mockCompletionByTaskId: Record<string, boolean> = {};

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
  }),
}));

jest.mock('@/services/feedbackService', () => ({
  fetchSelfFeedbackForTemplates: (...args: unknown[]) => mockFetchSelfFeedbackForTemplates(...args),
  upsertSelfFeedback: jest.fn(),
}));

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-1' } } },
        error: null,
      }),
    },
    from: (table: string) => {
      if (table === 'events_local_meta') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return builder;
      }

      if (table === 'task_templates') {
        const builder: any = {
          select: () => builder,
          eq: () => builder,
          single: async () => ({
            data: {
              id: String(mockParams.templateId ?? ''),
              after_training_feedback_enable_score: true,
              after_training_feedback_enable_note: true,
              after_training_feedback_score_explanation: null,
            },
            error: null,
          }),
        };
        return builder;
      }

      if (table === 'activity_tasks' || table === 'external_event_tasks') {
        let taskId: string | null = null;
        const builder: any = {
          select: () => builder,
          eq: (_column: string, value: unknown) => {
            taskId = String(value ?? '');
            return builder;
          },
          maybeSingle: async () => {
            if (table === 'activity_tasks' && taskId && taskId in mockCompletionByTaskId) {
              return { data: { completed: mockCompletionByTaskId[taskId] }, error: null };
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

describe('task-feedback-note screen', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockCompletionByTaskId = {};
    mockFetchSelfFeedbackForTemplates.mockResolvedValue([]);
    mockParams = {
      activityId: '2ac31159-22f6-42a2-a067-4fb3ab6dd2ab',
      templateId: 'template-1',
      title: 'Feedback på Afleveringer',
      taskInstanceId: 'task-1',
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

  it('resets score+note when reopening another unfinished feedback task', async () => {
    mockCompletionByTaskId['task-1'] = false;
    mockCompletionByTaskId['task-2'] = false;

    const screen = render(<TaskFeedbackNoteScreen />);

    await waitFor(() => expect(screen.getByTestId('feedback.noteInput').props.value).toBe(''));
    expect(screen.getByTestId('feedback.selectedScore.none')).toBeTruthy();

    fireEvent.press(screen.getByTestId('feedback.scoreInput'));
    fireEvent.press(screen.getByTestId('feedback.scoreOption.8'));
    fireEvent.press(screen.getByTestId('feedback.scoreDoneButton'));
    fireEvent.changeText(screen.getByTestId('feedback.noteInput'), 'Midlertidig note');
    fireEvent.press(screen.getByText('X'));

    mockParams = {
      ...mockParams,
      taskInstanceId: 'task-2',
    };
    screen.rerender(<TaskFeedbackNoteScreen />);

    await waitFor(() => expect(screen.getByTestId('feedback.noteInput').props.value).toBe(''));
    expect(screen.getByTestId('feedback.selectedScore.none')).toBeTruthy();
    expect(mockDismiss).toHaveBeenCalled();
  });

  it('hydrates persisted score+note when task completion flag is stale but feedback exists', async () => {
    const taskInstanceId = '11111111-1111-4111-8111-111111111111';
    mockCompletionByTaskId[taskInstanceId] = false;
    mockFetchSelfFeedbackForTemplates.mockResolvedValue([
      {
        id: 'row-other',
        userId: 'user-1',
        taskTemplateId: 'template-1',
        taskInstanceId: 'task-other',
        activityId: '2ac31159-22f6-42a2-a067-4fb3ab6dd2ab',
        rating: 10,
        note: 'Skal ikke bruges',
        createdAt: '2026-02-19T10:00:00.000Z',
        updatedAt: '2026-02-19T10:00:00.000Z',
      },
      {
        id: 'row-current',
        userId: 'user-1',
        taskTemplateId: 'template-1',
        taskInstanceId,
        activityId: '2ac31159-22f6-42a2-a067-4fb3ab6dd2ab',
        rating: 6,
        note: 'Gemt feedback note',
        createdAt: '2026-02-18T10:00:00.000Z',
        updatedAt: '2026-02-18T10:00:00.000Z',
      },
    ]);

    mockParams = {
      ...mockParams,
      taskInstanceId,
    };

    const screen = render(<TaskFeedbackNoteScreen />);

    await waitFor(() => expect(screen.getByTestId('feedback.noteInput').props.value).toBe('Gemt feedback note'));
    expect(screen.getByTestId('feedback.selectedScore.6')).toBeTruthy();
  });

  it('hydrates persisted feedback for non-UUID task id using template fallback instance id', async () => {
    mockCompletionByTaskId['task-local-1'] = false;
    mockFetchSelfFeedbackForTemplates.mockResolvedValue([
      {
        id: 'row-template-fallback',
        userId: 'user-1',
        taskTemplateId: 'template-1',
        taskInstanceId: 'template-1',
        activityId: '2ac31159-22f6-42a2-a067-4fb3ab6dd2ab',
        rating: 4,
        note: 'Gemt via template fallback',
        createdAt: '2026-02-20T10:00:00.000Z',
        updatedAt: '2026-02-20T10:00:00.000Z',
      },
    ]);

    mockParams = {
      ...mockParams,
      taskInstanceId: 'task-local-1',
    };

    const screen = render(<TaskFeedbackNoteScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('feedback.noteInput').props.value).toBe('Gemt via template fallback'),
    );
    expect(screen.getByTestId('feedback.selectedScore.4')).toBeTruthy();
  });

  it('hydrates persisted feedback for non-UUID task id stored as raw instance id', async () => {
    mockCompletionByTaskId['task-local-raw'] = false;
    mockFetchSelfFeedbackForTemplates.mockResolvedValue([
      {
        id: 'row-raw-instance',
        userId: 'user-1',
        taskTemplateId: 'template-1',
        taskInstanceId: 'task-local-raw',
        activityId: '2ac31159-22f6-42a2-a067-4fb3ab6dd2ab',
        rating: 9,
        note: 'Gemt via raw non-uuid instance',
        createdAt: '2026-02-20T11:00:00.000Z',
        updatedAt: '2026-02-20T11:00:00.000Z',
      },
    ]);

    mockParams = {
      ...mockParams,
      taskInstanceId: 'task-local-raw',
    };

    const screen = render(<TaskFeedbackNoteScreen />);

    await waitFor(() =>
      expect(screen.getByTestId('feedback.noteInput').props.value).toBe('Gemt via raw non-uuid instance'),
    );
    expect(screen.getByTestId('feedback.selectedScore.9')).toBeTruthy();
  });
});
