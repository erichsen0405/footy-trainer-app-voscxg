export const FIXTURE_NOW_ISO = '2026-02-01T10:00:00.000Z';

export const fixtureUsers = {
  entitled: {
    id: 'user-entitled-001',
    subscription_tier: 'trainer_basic',
    subscription_product_id: 'com.footballcoach.trainer.basic.monthly',
  },
  notEntitled: {
    id: 'user-no-entitlement-001',
    subscription_tier: null,
    subscription_product_id: null,
  },
} as const;

export const fixtureActivityWithTasks = {
  id: 'activity-001',
  user_id: fixtureUsers.entitled.id,
  title: 'Passing Drill',
  activity_date: '2026-02-12',
  activity_time: '17:30',
  location: 'Pitch A',
  category_id: 'category-technical',
  is_external: false,
  created_at: '2026-02-01T09:00:00.000Z',
  updated_at: '2026-02-01T09:00:00.000Z',
  activity_tasks: [
    {
      id: 'task-001',
      title: 'Warm-up rondo',
      description: '5v2 rondo, 2 touches',
      completed: false,
      reminder_minutes: 30,
    },
    {
      id: 'task-002',
      title: 'One-touch passing',
      description: 'Triangle passing circuit',
      completed: false,
      reminder_minutes: 15,
    },
  ],
} as const;

export const fixtureFeedbackSaved = {
  id: 'feedback-001',
  user_id: fixtureUsers.entitled.id,
  task_template_id: 'template-001',
  task_instance_id: 'instance-001',
  activity_id: fixtureActivityWithTasks.id,
  rating: 8,
  note: 'Great intensity and focus',
  created_at: '2026-02-01T10:00:00.000Z',
  updated_at: '2026-02-01T10:00:00.000Z',
} as const;
