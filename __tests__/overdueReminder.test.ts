import { buildNotificationBody, selectOverdueTasks } from '@/utils/overdueReminder';

describe('overdueReminder', () => {
  const now = new Date('2026-03-01T12:00:00.000Z');

  it('builds fallback body when no overdue tasks exist', () => {
    const body = buildNotificationBody([]);

    expect(body).toContain('Små skridt hver dag giver stor fremgang.');
    expect(body).toContain('• Ingen forfaldne opgaver lige nu');
  });

  it('builds body with a single overdue task line', () => {
    const body = buildNotificationBody([
      {
        id: 'task-1',
        title: 'Sprint-test',
        dueAt: new Date('2026-03-01T08:00:00.000Z'),
      },
    ]);

    expect(body).toContain('• Sprint-test');
    expect(body).not.toContain('+1 flere');
  });

  it('limits body to 5 tasks and appends +N line', () => {
    const tasks = Array.from({ length: 7 }, (_, index) => ({
      id: `task-${index + 1}`,
      title: `Opgave ${index + 1}`,
      dueAt: new Date('2026-03-01T06:00:00.000Z'),
    }));

    const body = buildNotificationBody(tasks);

    expect(body).toContain('• Opgave 1');
    expect(body).toContain('• Opgave 5');
    expect(body).not.toContain('• Opgave 6');
    expect(body).toContain('• +2 flere');
  });

  it('selects and sorts overdue tasks by due time then title with stable tie-break', () => {
    const activities = [
      {
        id: 'activity-b',
        activity_date: '2026-03-01',
        activity_time: '09:00',
        tasks: [
          { id: 'task-z', title: 'Zulu', completed: false },
          { id: 'task-a', title: 'Alpha', completed: false },
        ],
      },
      {
        id: 'activity-a',
        activity_date: '2026-03-01',
        activity_time: '07:00',
        tasks: [
          { id: 'task-b', title: 'Beta', completed: false },
          { id: 'task-c', title: 'Alpha', completed: false },
        ],
      },
    ];

    const overdue = selectOverdueTasks(activities, now);

    expect(overdue.map((item) => item.id)).toEqual(['task-c', 'task-b', 'task-a', 'task-z']);
    expect(overdue.map((item) => item.title)).toEqual(['Alpha', 'Beta', 'Alpha', 'Zulu']);
  });

  it('returns stable output for identical task titles and due date using id tie-breaker', () => {
    const activities = [
      {
        activity_date: '2026-03-01',
        activity_time: '08:00',
        tasks: [
          { id: 'task-2', title: 'Samme', completed: false },
          { id: 'task-1', title: 'Samme', completed: false },
        ],
      },
    ];

    const overdue = selectOverdueTasks(activities, now);

    expect(overdue.map((item) => item.id)).toEqual(['task-1', 'task-2']);
  });
});
