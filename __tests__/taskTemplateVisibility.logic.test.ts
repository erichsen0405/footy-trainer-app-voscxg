import { filterVisibleTasksForActivity, isTaskVisibleForActivity } from '@/utils/taskTemplateVisibility';

describe('task template archive visibility', () => {
  it('keeps tasks visible when they do not link to a template', () => {
    const task = { id: 'task-1', title: 'Manuel opgave', description: 'Ingen template' };

    expect(
      isTaskVisibleForActivity(task, '2026-02-20', '10:00:00', {
        'template-1': '2026-02-19T12:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('hides tasks on activities after template archive timestamp', () => {
    const task = {
      id: 'task-1',
      title: 'Template opgave',
      task_template_id: 'template-1',
    };

    expect(
      isTaskVisibleForActivity(task, '2026-02-20', '16:00:00', {
        'template-1': '2026-02-20T14:00:00.000Z',
      }),
    ).toBe(false);
  });

  it('keeps historical tasks visible when activity is before archive timestamp', () => {
    const task = {
      id: 'task-1',
      title: 'Template opgave',
      task_template_id: 'template-1',
    };

    expect(
      isTaskVisibleForActivity(task, '2026-02-20', '12:30:00', {
        'template-1': '2026-02-20T14:00:00.000Z',
      }),
    ).toBe(true);
  });

  it('resolves template id from feedback marker and filters without deleting rows', () => {
    const archivedTemplateId = '11111111-1111-1111-1111-111111111111';
    const tasks = [
      {
        id: 'feedback-1',
        title: 'Feedback på sprint',
        description: `Auto marker [auto-after-training:${archivedTemplateId}]`,
      },
      {
        id: 'manual-1',
        title: 'Manuel note',
        description: 'Ingen marker',
      },
    ];

    const visible = filterVisibleTasksForActivity(tasks, '2026-02-21', '09:00:00', {
      [archivedTemplateId]: '2026-02-20T18:00:00.000Z',
    });

    expect(visible.map((task) => task.id)).toEqual(['manual-1']);
    expect(tasks).toHaveLength(2);
  });
});
