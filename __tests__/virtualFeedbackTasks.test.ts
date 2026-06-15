import {
  appendVirtualFeedbackTasks,
  appendVirtualFeedbackTasksForActivityCandidates,
} from '@/utils/virtualFeedbackTasks';

describe('virtualFeedbackTasks', () => {
  it('appends answered feedback rows as virtual feedback tasks', () => {
    const activity = {
      id: 'activity-1',
      tasks: [] as any[],
    };

    const result = appendVirtualFeedbackTasks(activity, [
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

    const result = appendVirtualFeedbackTasks(activity, [
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

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe('task-1');
  });

  it('matches rows using activity id candidates', () => {
    const result = appendVirtualFeedbackTasksForActivityCandidates(
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

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].title).toBe('Feedback på Scan før du får bolden');
  });
});
