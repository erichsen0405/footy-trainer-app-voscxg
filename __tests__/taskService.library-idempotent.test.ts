import { taskService } from '@/services/taskService';

type TaskTemplateRow = {
  id: string;
  user_id: string;
  player_id: string | null;
  team_id: string | null;
  library_exercise_id: string | null;
  title: string;
  description: string;
  reminder_minutes: number | null;
  video_url: string | null;
  source_folder: string | null;
  after_training_enabled: boolean;
  after_training_delay_minutes: number | null;
  after_training_feedback_enable_score: boolean;
  after_training_feedback_score_explanation: string | null;
  after_training_feedback_enable_intensity: boolean;
  after_training_feedback_enable_note: boolean;
  created_at: string;
};

const db = {
  taskTemplates: [] as TaskTemplateRow[],
};

const mockGetSession = jest.fn();

jest.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const state: any = {
      table,
      filters: [],
      action: null,
      payload: null,
      upsertResult: null,
      insertResult: null,
    };

    const builder: any = {
      upsert: (payload: any, options?: { ignoreDuplicates?: boolean }) => {
        state.action = 'upsert';
        state.payload = payload;

        const existing = db.taskTemplates.find((row) => (
          row.user_id === payload.user_id
          && row.player_id === (payload.player_id ?? null)
          && row.team_id === (payload.team_id ?? null)
          && row.library_exercise_id === (payload.library_exercise_id ?? null)
        ));

        if (existing) {
          state.upsertResult = options?.ignoreDuplicates ? null : existing;
        } else {
          const created: TaskTemplateRow = {
            id: `template-${db.taskTemplates.length + 1}`,
            user_id: payload.user_id,
            player_id: payload.player_id ?? null,
            team_id: payload.team_id ?? null,
            library_exercise_id: payload.library_exercise_id ?? null,
            title: payload.title,
            description: payload.description ?? '',
            reminder_minutes: payload.reminder_minutes ?? null,
            video_url: payload.video_url ?? null,
            source_folder: payload.source_folder ?? null,
            after_training_enabled: payload.after_training_enabled ?? false,
            after_training_delay_minutes: payload.after_training_delay_minutes ?? null,
            after_training_feedback_enable_score: payload.after_training_feedback_enable_score ?? true,
            after_training_feedback_score_explanation: payload.after_training_feedback_score_explanation ?? null,
            after_training_feedback_enable_intensity: payload.after_training_feedback_enable_intensity ?? true,
            after_training_feedback_enable_note: payload.after_training_feedback_enable_note ?? true,
            created_at: new Date().toISOString(),
          };
          db.taskTemplates.push(created);
          state.upsertResult = created;
        }

        return builder;
      },
      insert: (payload: any) => {
        state.action = 'insert';
        if (table === 'task_templates') {
          const created: TaskTemplateRow = {
            id: `template-${db.taskTemplates.length + 1}`,
            user_id: payload.user_id,
            player_id: payload.player_id ?? null,
            team_id: payload.team_id ?? null,
            library_exercise_id: payload.library_exercise_id ?? null,
            title: payload.title,
            description: payload.description ?? '',
            reminder_minutes: payload.reminder_minutes ?? null,
            video_url: payload.video_url ?? null,
            source_folder: payload.source_folder ?? null,
            after_training_enabled: payload.after_training_enabled ?? false,
            after_training_delay_minutes: payload.after_training_delay_minutes ?? null,
            after_training_feedback_enable_score: payload.after_training_feedback_enable_score ?? true,
            after_training_feedback_score_explanation: payload.after_training_feedback_score_explanation ?? null,
            after_training_feedback_enable_intensity: payload.after_training_feedback_enable_intensity ?? true,
            after_training_feedback_enable_note: payload.after_training_feedback_enable_note ?? true,
            created_at: new Date().toISOString(),
          };
          db.taskTemplates.push(created);
          state.insertResult = created;
        }
        return builder;
      },
      select: () => builder,
      eq: (column: string, value: unknown) => {
        state.filters.push({ column, value, op: 'eq' });
        return builder;
      },
      is: (column: string, value: unknown) => {
        state.filters.push({ column, value, op: 'is' });
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      abortSignal: () => builder,
      maybeSingle: async () => {
        if (state.table === 'task_templates' && state.action === 'upsert') {
          return { data: state.upsertResult, error: null };
        }

        if (state.table === 'task_templates') {
          const match = db.taskTemplates.find((row) => {
            return state.filters.every((filter: any) => {
              if (filter.op === 'eq') {
                return (row as any)[filter.column] === filter.value;
              }
              if (filter.op === 'is') {
                return filter.value === null
                  ? (row as any)[filter.column] === null
                  : (row as any)[filter.column] === filter.value;
              }
              return true;
            });
          }) ?? null;

          return { data: match, error: null };
        }

        return { data: null, error: null };
      },
      single: async () => {
        if (state.table === 'task_templates') {
          return { data: state.insertResult, error: null };
        }
        return { data: null, error: null };
      },
    };

    return builder;
  };

  return {
    supabase: {
      auth: {
        getSession: () => mockGetSession(),
      },
      from,
    },
  };
});

describe('taskService.createTask library idempotency', () => {
  beforeEach(() => {
    db.taskTemplates = [];
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          user: { id: 'user-1' },
        },
      },
      error: null,
    });
  });

  it('creates at most one task template for the same library exercise in same user scope', async () => {
    const payload = {
      title: 'Library Drill',
      description: 'From library',
      categoryIds: [],
      reminder: null,
      videoUrl: 'https://example.com/drill.mp4',
      afterTrainingEnabled: false,
      afterTrainingDelayMinutes: null,
      afterTrainingFeedbackEnableScore: true,
      afterTrainingFeedbackScoreExplanation: null,
      afterTrainingFeedbackEnableIntensity: true,
      afterTrainingFeedbackEnableNote: true,
      sourceFolder: 'FootballCoach inspiration',
      libraryExerciseId: '711f3229-2fee-45fe-b46e-87dd1605af03',
    };

    const first = await taskService.createTask(payload);
    const second = await taskService.createTask(payload);

    expect(db.taskTemplates).toHaveLength(1);
    expect(first.id).toBe(second.id);
    expect(db.taskTemplates[0].library_exercise_id).toBe('711f3229-2fee-45fe-b46e-87dd1605af03');
  });
});
