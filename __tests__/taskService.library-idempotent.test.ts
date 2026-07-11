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
  video_urls: string[] | null;
  media_names: string[] | null;
  focus_areas: string[];
  source_folder: string | null;
  after_training_enabled: boolean;
  after_training_delay_minutes: number | null;
  after_training_feedback_enable_score: boolean;
  after_training_feedback_score_explanation: string | null;
  after_training_feedback_enable_intensity: boolean;
  after_training_feedback_enable_note: boolean;
  task_duration_enabled: boolean;
  task_duration_minutes: number | null;
  auto_add_to_activities: boolean;
  created_at: string;
};

const db = {
  taskTemplates: [] as TaskTemplateRow[],
  taskTemplateSubtasks: [] as { task_template_id: string; title: string; sort_order: number }[],
};

const mockGetSession = jest.fn();

jest.mock('@/integrations/supabase/client', () => {
  const from = (table: string) => {
    const state: any = {
      table,
      filters: [],
      action: null,
      payload: null,
      insertResult: null,
      insertError: null,
    };

    const builder: any = {
      insert: (payload: any) => {
        state.action = 'insert';
        if (table === 'task_templates') {
          const existing = db.taskTemplates.find((row) => (
            row.user_id === payload.user_id
            && row.player_id === (payload.player_id ?? null)
            && row.team_id === (payload.team_id ?? null)
            && row.library_exercise_id === (payload.library_exercise_id ?? null)
          ));
          if (existing) {
            state.insertError = {
              code: '23505',
              message: 'duplicate key value violates unique constraint "task_templates_user_scope_library_exercise_uidx"',
            };
            state.insertResult = null;
            return builder;
          }

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
            video_urls: payload.video_urls ?? null,
            media_names: payload.media_names ?? null,
            focus_areas: payload.focus_areas ?? [],
            source_folder: payload.source_folder ?? null,
            after_training_enabled: payload.after_training_enabled ?? false,
            after_training_delay_minutes: payload.after_training_delay_minutes ?? null,
            after_training_feedback_enable_score: payload.after_training_feedback_enable_score ?? true,
            after_training_feedback_score_explanation: payload.after_training_feedback_score_explanation ?? null,
            after_training_feedback_enable_intensity: payload.after_training_feedback_enable_intensity ?? true,
            after_training_feedback_enable_note: payload.after_training_feedback_enable_note ?? true,
            task_duration_enabled: payload.task_duration_enabled ?? false,
            task_duration_minutes: payload.task_duration_minutes ?? null,
            auto_add_to_activities: payload.auto_add_to_activities ?? false,
            created_at: new Date().toISOString(),
          };
          db.taskTemplates.push(created);
          state.insertResult = created;
        } else if (table === 'task_template_subtasks') {
          const rows = Array.isArray(payload) ? payload : [payload];
          rows.forEach((row: any) => {
            db.taskTemplateSubtasks.push({
              task_template_id: String(row.task_template_id),
              title: String(row.title ?? ''),
              sort_order: Number(row.sort_order ?? 0),
            });
          });
          state.insertResult = rows;
        }
        return builder;
      },
      delete: () => {
        state.action = 'delete';
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
      abortSignal: () => {
        if (state.action === 'delete' && state.table === 'task_template_subtasks') {
          db.taskTemplateSubtasks = db.taskTemplateSubtasks.filter((row) => {
            return !state.filters.every((filter: any) => {
              if (filter.op === 'eq') {
                return (row as any)[filter.column] === filter.value;
              }
              return true;
            });
          });
        }
        return builder;
      },
      maybeSingle: async () => {
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
          return { data: state.insertResult, error: state.insertError };
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
    db.taskTemplateSubtasks = [];
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
    expect(db.taskTemplates[0].auto_add_to_activities).toBe(false);
  });

  it('saves auto-add state when creating a task template', async () => {
    await taskService.createTask({
      title: 'Auto add drill',
      description: 'Adds itself to matching activities',
      categoryIds: ['cat-1'],
      autoAddToActivities: true,
    });

    expect(db.taskTemplates).toHaveLength(1);
    expect(db.taskTemplates[0].auto_add_to_activities).toBe(true);
  });

  it('saves deduplicated focus areas when creating a task template', async () => {
    const created = await taskService.createTask({
      title: 'Focus drill',
      description: 'Tagged drill',
      categoryIds: [],
      focusAreas: [' Teknik ', 'Afslutning', 'teknik', 'Afslutning'],
    });

    expect(db.taskTemplates).toHaveLength(1);
    expect(db.taskTemplates[0].focus_areas).toEqual(['Teknik', 'Afslutning']);
    expect(created.focusAreas).toEqual(['Teknik', 'Afslutning']);
    expect(created.focus_areas).toEqual(['Teknik', 'Afslutning']);
  });

  it('clamps task duration minutes to 600 before save', async () => {
    const payload = {
      title: 'Duration clamp',
      description: 'Too large duration',
      categoryIds: [],
      taskDurationEnabled: true,
      taskDurationMinutes: 601,
      sourceFolder: 'FootballCoach inspiration',
      libraryExerciseId: '7b2ee3db-8f60-4f7f-8df1-7451a2d2ce8c',
    };

    await taskService.createTask(payload as any);

    expect(db.taskTemplates).toHaveLength(1);
    expect(db.taskTemplates[0].task_duration_enabled).toBe(true);
    expect(db.taskTemplates[0].task_duration_minutes).toBe(600);
  });

  it('saves subtasks in order when creating via P8 payload', async () => {
    const payload = {
      task: {
        id: '',
        title: 'Template with subtasks',
        description: 'Should persist subtasks',
        completed: false,
        isTemplate: true,
        categoryIds: [],
        subtasks: [],
      },
      subtasks: [
        { title: 'Delopgave A' },
        { title: 'Delopgave B' },
      ],
      adminMode: 'self',
      adminTargetType: null,
      adminTargetId: null,
    };

    const created = await taskService.createTask(payload as any);

    expect(db.taskTemplates).toHaveLength(1);
    expect(db.taskTemplateSubtasks).toEqual([
      { task_template_id: 'template-1', title: 'Delopgave A', sort_order: 0 },
      { task_template_id: 'template-1', title: 'Delopgave B', sort_order: 1 },
    ]);
    expect(created.subtasks.map((subtask) => subtask.title)).toEqual(['Delopgave A', 'Delopgave B']);
  });
});
