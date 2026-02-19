import { buildNotificationRouteFromData } from '@/utils/notificationDeepLink';

describe('notification deeplink mapping', () => {
  it('maps normal task reminder payload to activity-details with openTaskId', () => {
    const route = buildNotificationRouteFromData({
      activityId: 'activity-1',
      taskId: 'task-1',
      type: 'task-reminder',
    });

    expect(route).toEqual({
      pathname: '/activity-details',
      params: {
        id: 'activity-1',
        activityId: 'activity-1',
        openTaskId: 'task-1',
      },
    });
  });

  it('maps feedback payload using task_id fallback to openFeedbackTaskId', () => {
    const route = buildNotificationRouteFromData({
      activity_id: 'activity-2',
      task_id: 'task-2',
      templateId: 'template-1',
    });

    expect(route).toEqual({
      pathname: '/activity-details',
      params: {
        id: 'activity-2',
        activityId: 'activity-2',
        openFeedbackTaskId: 'task-2',
      },
    });
  });

  it('uses url query fallback and id fallback when explicit keys are missing', () => {
    const route = buildNotificationRouteFromData({
      id: 'task-from-id',
      url: '/activity-details?id=activity-from-url',
    });

    expect(route).toEqual({
      pathname: '/activity-details',
      params: {
        id: 'activity-from-url',
        activityId: 'activity-from-url',
        openTaskId: 'task-from-id',
      },
    });
  });

  it('maps profile trainer request target', () => {
    const route = buildNotificationRouteFromData({
      target: 'profile_trainer_requests',
      request_id: 'request-42',
    });

    expect(route).toEqual({
      pathname: '/(tabs)/profile',
      params: {
        openTrainerRequests: '1',
        requestId: 'request-42',
      },
    });
  });

  it('returns null when activity context is missing for task navigation', () => {
    expect(
      buildNotificationRouteFromData({
        taskId: 'task-no-activity',
      }),
    ).toBeNull();
  });
});
