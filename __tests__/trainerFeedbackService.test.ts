import {
  fetchTrainerFeedbackForTrainerActivity,
  fetchTrainerFeedbackForPlayerActivity,
  mapTrainerFeedbackRow,
  resolveTrainerFeedbackActivityContext,
  sendTrainerFeedback,
} from '@/services/trainerFeedbackService';

const mockOrder = jest.fn();
const mockEq = jest.fn();
const mockSelect = jest.fn(() => ({ eq: mockEq }));
const mockFrom = jest.fn(() => ({ select: mockSelect }));
const mockInvoke = jest.fn();

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: any[]) => (mockFrom as (...innerArgs: any[]) => unknown)(...args),
    functions: {
      invoke: (...args: any[]) => (mockInvoke as (...innerArgs: any[]) => unknown)(...args),
    },
  },
}));

describe('trainerFeedbackService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEq.mockImplementation(() => ({
      eq: mockEq,
      order: mockOrder,
    }));
  });

  it('maps trainer feedback rows', () => {
    expect(
      mapTrainerFeedbackRow({
        id: 'feedback-1',
        activity_context_type: 'external',
        activity_context_id: 'activity-1',
        player_id: 'player-1',
        trainer_id: 'trainer-1',
        feedback_text: 'God indsats',
        created_at: '2026-03-13T10:00:00.000Z',
        updated_at: '2026-03-13T11:00:00.000Z',
      }),
    ).toEqual({
      id: 'feedback-1',
      activityContextType: 'external',
      activityContextId: 'activity-1',
      playerId: 'player-1',
      trainerId: 'trainer-1',
      feedbackText: 'God indsats',
      createdAt: '2026-03-13T10:00:00.000Z',
      updatedAt: '2026-03-13T11:00:00.000Z',
    });
  });

  it('maps trainer feedback rows returned in camelCase from the edge function', () => {
    expect(
      mapTrainerFeedbackRow({
        id: 'feedback-camel-1',
        activityContextType: 'internal',
        activityContextId: 'activity-1',
        playerId: 'player-1',
        trainerId: 'trainer-1',
        feedbackText: 'Bliv ved med at vende op i fart.',
        createdAt: '2026-03-13T10:00:00.000Z',
        updatedAt: '2026-03-13T11:00:00.000Z',
      }),
    ).toEqual({
      id: 'feedback-camel-1',
      activityContextType: 'internal',
      activityContextId: 'activity-1',
      playerId: 'player-1',
      trainerId: 'trainer-1',
      feedbackText: 'Bliv ved med at vende op i fart.',
      createdAt: '2026-03-13T10:00:00.000Z',
      updatedAt: '2026-03-13T11:00:00.000Z',
    });
  });

  it('resolves internal trainer feedback context from assigned activities', () => {
    expect(
      resolveTrainerFeedbackActivityContext({
        id: 'assigned-activity-1',
        isExternal: false,
        source_activity_id: 'source-activity-1',
      }),
    ).toEqual({
      activityContextType: 'internal',
      activityContextId: 'source-activity-1',
    });
  });

  it('resolves internal trainer feedback context from trainer-owned source activities', () => {
    expect(
      resolveTrainerFeedbackActivityContext({
        id: 'source-activity-1',
        isExternal: false,
      }),
    ).toEqual({
      activityContextType: 'internal',
      activityContextId: 'source-activity-1',
    });
  });

  it('resolves external trainer feedback context from external event ids', () => {
    expect(
      resolveTrainerFeedbackActivityContext({
        id: 'meta-1',
        isExternal: true,
        external_event_id: 'external-event-1',
      }),
    ).toEqual({
      activityContextType: 'external',
      activityContextId: 'external-event-1',
    });
  });

  it('reads trainer feedback for a player activity', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: 'feedback-1',
          activity_context_type: 'internal',
          activity_context_id: 'source-activity-1',
          player_id: 'player-1',
          trainer_id: 'trainer-1',
          feedback_text: 'Fortsæt med førsteberøringen',
          created_at: '2026-03-13T10:00:00.000Z',
          updated_at: '2026-03-13T10:05:00.000Z',
        },
        {
          id: 'feedback-2',
          activity_context_type: 'internal',
          activity_context_id: 'source-activity-1',
          player_id: 'player-1',
          trainer_id: 'trainer-2',
          feedback_text: 'Spil hurtigere i anden bølge.',
          created_at: '2026-03-13T10:06:00.000Z',
          updated_at: '2026-03-13T10:08:00.000Z',
        },
      ],
      error: null,
    });

    await expect(
      fetchTrainerFeedbackForPlayerActivity({
        activity: {
          id: 'assigned-activity-1',
          isExternal: false,
          source_activity_id: 'source-activity-1',
        },
        playerId: 'player-1',
      }),
    ).resolves.toEqual([
      {
        id: 'feedback-1',
        activityContextType: 'internal',
        activityContextId: 'source-activity-1',
        playerId: 'player-1',
        trainerId: 'trainer-1',
        feedbackText: 'Fortsæt med førsteberøringen',
        createdAt: '2026-03-13T10:00:00.000Z',
        updatedAt: '2026-03-13T10:05:00.000Z',
      },
      {
        id: 'feedback-2',
        activityContextType: 'internal',
        activityContextId: 'source-activity-1',
        playerId: 'player-1',
        trainerId: 'trainer-2',
        feedbackText: 'Spil hurtigere i anden bølge.',
        createdAt: '2026-03-13T10:06:00.000Z',
        updatedAt: '2026-03-13T10:08:00.000Z',
      },
    ]);

    expect(mockFrom).toHaveBeenCalledWith('trainer_activity_feedback');
    expect(mockEq).toHaveBeenNthCalledWith(1, 'player_id', 'player-1');
    expect(mockEq).toHaveBeenNthCalledWith(2, 'activity_context_type', 'internal');
    expect(mockEq).toHaveBeenNthCalledWith(3, 'activity_context_id', 'source-activity-1');
    expect(mockOrder).toHaveBeenCalledWith('updated_at', { ascending: false });
  });

  it('reads trainer feedback for a trainer activity', async () => {
    mockOrder.mockResolvedValue({
      data: [
        {
          id: 'feedback-2',
          activity_context_type: 'internal',
          activity_context_id: 'source-activity-1',
          player_id: 'player-2',
          trainer_id: 'trainer-1',
          feedback_text: 'Hold tempo i første aktion.',
          created_at: '2026-03-13T10:00:00.000Z',
          updated_at: '2026-03-13T10:05:00.000Z',
        },
      ],
      error: null,
    });

    await expect(
      fetchTrainerFeedbackForTrainerActivity({
        activity: {
          id: 'source-activity-1',
          isExternal: false,
        },
        trainerId: 'trainer-1',
      }),
    ).resolves.toEqual([
      {
        id: 'feedback-2',
        activityContextType: 'internal',
        activityContextId: 'source-activity-1',
        playerId: 'player-2',
        trainerId: 'trainer-1',
        feedbackText: 'Hold tempo i første aktion.',
        createdAt: '2026-03-13T10:00:00.000Z',
        updatedAt: '2026-03-13T10:05:00.000Z',
      },
    ]);

    expect(mockFrom).toHaveBeenCalledWith('trainer_activity_feedback');
    expect(mockEq).toHaveBeenNthCalledWith(1, 'trainer_id', 'trainer-1');
    expect(mockEq).toHaveBeenNthCalledWith(2, 'activity_context_type', 'internal');
    expect(mockEq).toHaveBeenNthCalledWith(3, 'activity_context_id', 'source-activity-1');
    expect(mockOrder).toHaveBeenCalledWith('updated_at', { ascending: false });
  });

  it('saves trainer feedback via the edge function', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        data: {
          feedback: {
            id: 'feedback-2',
            activityContextType: 'internal',
            activityContextId: 'source-activity-2',
            playerId: 'player-2',
            trainerId: 'trainer-2',
            feedbackText: 'Bliv ved med at scanne før modtagelse.',
            createdAt: '2026-03-13T12:00:00.000Z',
            updatedAt: '2026-03-13T12:00:00.000Z',
          },
          delivery: {
            mail: { status: 'sent', provider: 'aws_ses', warning: null },
            push: { status: 'sent', tokenCount: 1, warning: null },
          },
        },
      },
      error: null,
    });

    await expect(
      sendTrainerFeedback({
        activityId: 'activity-2',
        playerId: 'player-2',
        feedbackText: 'Bliv ved med at scanne før modtagelse.',
      }),
    ).resolves.toEqual({
      feedback: {
        id: 'feedback-2',
        activityContextType: 'internal',
        activityContextId: 'source-activity-2',
        playerId: 'player-2',
        trainerId: 'trainer-2',
        feedbackText: 'Bliv ved med at scanne før modtagelse.',
        createdAt: '2026-03-13T12:00:00.000Z',
        updatedAt: '2026-03-13T12:00:00.000Z',
      },
      delivery: {
        mail: { status: 'sent', provider: 'aws_ses', warning: null },
        push: { status: 'sent', tokenCount: 1, warning: null },
      },
    });

    expect(mockInvoke).toHaveBeenCalledWith('sendTrainerFeedback', {
      body: {
        activityId: 'activity-2',
        playerId: 'player-2',
        feedbackText: 'Bliv ved med at scanne før modtagelse.',
      },
    });
  });
});
