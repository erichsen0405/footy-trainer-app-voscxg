import {
  appendVirtualScoredTasks,
  appendVirtualScoredTasksForActivityCandidates,
} from '@/utils/virtualFeedbackTasks';

describe('virtualFeedbackTasks', () => {
  it('appends answered feedback rows as virtual scored and feedback tasks', () => {
    const activity = {
      id: 'activity-1',
      tasks: [] as any[],
    };

    const result = appendVirtualScoredTasks(activity, [
      {
        id: 'feedback-1',
        userId: 'player-1',
        activityId: 'activity-1',
        taskTemplateId: 'template-scan',
        taskTemplateTitle: 'Scan før du får bolden',
        taskInstanceId: null,
        rating: 4,
        note: '',
        createdAt: '2026-05-18T16:00:00.000Z',
        updatedAt: '2026-05-18T16:00:00.000Z',
      },
    ]);

    expect(result.tasks).toEqual([
      expect.objectContaining({
        id: 'task:activity-1:template-scan',
        title: 'Scan før du får bolden',
        completed: true,
        taskTemplateId: 'template-scan',
        isVirtualScoredTask: true,
      }),
      expect.objectContaining({
        id: 'feedback:activity-1:template-scan',
        title: 'Feedback på Scan før du får bolden',
        completed: true,
        feedbackTemplateId: 'template-scan',
        taskTemplateId: 'template-scan',
        isFeedbackTask: true,
      }),
    ]);
  });

  it('does not duplicate an existing feedback task for the same template', () => {
    const activity = {
      id: 'activity-1',
      tasks: [
        {
          id: 'task-1',
          title: 'Feedback på Scan før du får bolden',
          description: '',
          completed: false,
          feedback_template_id: 'template-scan',
        },
      ],
    };

    const result = appendVirtualScoredTasks(activity, [
      {
        id: 'feedback-1',
        userId: 'player-1',
        activityId: 'activity-1',
        taskTemplateId: 'template-scan',
        taskTemplateTitle: 'Scan før du får bolden',
        taskInstanceId: null,
        rating: 4,
        note: '',
        createdAt: '2026-05-18T16:00:00.000Z',
        updatedAt: '2026-05-18T16:00:00.000Z',
      },
    ]);

    expect(result.tasks).toHaveLength(2);
    expect(result.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'task-1',
          completed: true,
          feedback_template_id: 'template-scan',
        }),
        expect.objectContaining({
          id: 'task:activity-1:template-scan',
          title: 'Scan før du får bolden',
          completed: true,
          taskTemplateId: 'template-scan',
        }),
      ]),
    );
  });

  it('does not duplicate an existing scored task for the same template', () => {
    const activity = {
      id: 'activity-1',
      tasks: [
        {
          id: 'task-1',
          title: 'Scan før du får bolden',
          description: '',
          completed: false,
          taskTemplateId: 'template-scan',
        },
      ],
    };

    const result = appendVirtualScoredTasks(activity, [
      {
        id: 'feedback-1',
        userId: 'player-1',
        activityId: 'activity-1',
        taskTemplateId: 'template-scan',
        taskTemplateTitle: 'Scan før du får bolden',
        taskInstanceId: null,
        rating: 4,
        note: '',
        createdAt: '2026-05-18T16:00:00.000Z',
        updatedAt: '2026-05-18T16:00:00.000Z',
      },
    ]);

    expect(result.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'task-1',
          title: 'Scan før du får bolden',
          completed: true,
          taskTemplateId: 'template-scan',
        }),
        expect.objectContaining({
          id: 'feedback:activity-1:template-scan',
          title: 'Feedback på Scan før du får bolden',
          completed: true,
          feedbackTemplateId: 'template-scan',
        }),
      ]),
    );
  });

  it('matches rows using activity id candidates', () => {
    const result = appendVirtualScoredTasksForActivityCandidates(
      { id: 'local-meta-id', tasks: [] as any[] },
      [
        {
          id: 'feedback-1',
          userId: 'player-1',
          activityId: 'external-event-id',
          taskTemplateId: 'template-scan',
          taskTemplateTitle: 'Scan før du får bolden',
          taskInstanceId: null,
          rating: 4,
          note: '',
          createdAt: '2026-05-18T16:00:00.000Z',
          updatedAt: '2026-05-18T16:00:00.000Z',
        },
      ],
      ['local-meta-id', 'external-event-id'],
    );

    expect(result.tasks).toHaveLength(2);
    expect(result.tasks.map((task) => task.title)).toEqual([
      'Scan før du får bolden',
      'Feedback på Scan før du får bolden',
    ]);
  });
});
