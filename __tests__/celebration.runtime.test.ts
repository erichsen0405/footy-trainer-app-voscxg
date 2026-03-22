import { resolveCelebrationAfterCompletionFromDatabase } from '@/utils/celebrationRuntime';

jest.mock('@/utils/afterTrainingMarkers', () => ({
  parseTemplateIdFromMarker: jest.fn(() => null),
}));

jest.mock('@/utils/taskTemplateVisibility', () => ({
  isTaskVisibleForActivity: jest.fn(() => true),
}));

jest.mock('@/integrations/supabase/client', () => {
  const tableResponses: Record<string, { data: any; error: any }[]> = {};

  const nextResponse = (tableName: string) => {
    const queue = tableResponses[tableName] ?? [];
    if (!queue.length) {
      return { data: [], error: null };
    }
    return queue.shift() ?? { data: [], error: null };
  };

  const createBuilder = (tableName: string) => {
    const builder: any = {
      select: jest.fn(() => builder),
      eq: jest.fn(() => builder),
      gte: jest.fn(() => builder),
      lt: jest.fn(() => builder),
      in: jest.fn(() => builder),
      order: jest.fn(() => builder),
      maybeSingle: jest.fn(() => Promise.resolve(nextResponse(tableName))),
      then: (resolve: any, reject: any) => Promise.resolve(nextResponse(tableName)).then(resolve, reject),
    };
    return builder;
  };

  return {
    __esModule: true,
    supabase: {
      auth: {
        getSession: jest.fn(async () => ({
          data: { session: { user: { id: 'user-1' } } },
          error: null,
        })),
      },
      from: jest.fn((tableName: string) => createBuilder(tableName)),
    },
    __tableResponses: tableResponses,
  };
});

const supabaseModule = jest.requireMock('@/integrations/supabase/client') as {
  __tableResponses: Record<string, { data: any; error: any }[]>;
};

describe('resolveCelebrationAfterCompletionFromDatabase', () => {
  beforeEach(() => {
    Object.keys(supabaseModule.__tableResponses).forEach((tableName) => {
      supabaseModule.__tableResponses[tableName] = [];
    });
  });

  it('treats answered feedback tasks as completed when determining dayComplete', async () => {
    supabaseModule.__tableResponses.activity_tasks = [
      { data: { activities: { activity_date: '2026-03-22' } }, error: null },
      {
        data: [
          {
            id: 'task-last',
            activity_id: 'activity-1',
            completed: true,
            title: 'Afsluttende opgave',
            description: '',
            task_template_id: 'template-main',
            feedback_template_id: null,
            activities: { activity_date: '2026-03-22', activity_time: '10:00:00' },
          },
          {
            id: 'task-feedback',
            activity_id: 'activity-1',
            completed: false,
            title: 'Feedback pa traening',
            description: '',
            task_template_id: 'template-feedback',
            feedback_template_id: 'template-feedback',
            activities: { activity_date: '2026-03-22', activity_time: '10:00:00' },
          },
        ],
        error: null,
      },
    ];
    supabaseModule.__tableResponses.external_event_tasks = [{ data: [], error: null }];
    supabaseModule.__tableResponses.activities = [{ data: [], error: null }];
    supabaseModule.__tableResponses.events_local_meta = [{ data: [], error: null }];
    supabaseModule.__tableResponses.task_templates = [
      {
        data: [
          { id: 'template-main', archived_at: null },
          { id: 'template-feedback', archived_at: null },
        ],
        error: null,
      },
    ];
    supabaseModule.__tableResponses.task_template_self_feedback = [
      {
        data: [
          {
            activity_id: 'activity-1',
            task_template_id: 'template-feedback',
            task_instance_id: 'task-feedback',
            rating: 5,
            note: null,
            created_at: '2026-03-22T11:00:00.000Z',
          },
        ],
        error: null,
      },
    ];

    await expect(
      resolveCelebrationAfterCompletionFromDatabase({
        completedTaskId: 'task-last',
        completingToDone: true,
      })
    ).resolves.toEqual({
      type: 'dayComplete',
      progress: {
        completedToday: 2,
        totalToday: 2,
        remainingToday: 0,
      },
    });
  });
});
