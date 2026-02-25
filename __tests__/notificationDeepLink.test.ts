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

  it('uses taskInstanceId and snake_case activity id keys', () => {
    const route = buildNotificationRouteFromData({
      activity_id: 'activity-from-instance',
      taskInstanceId: 'task-instance-1',
      type: 'task-reminder',
    });

    expect(route).toEqual({
      pathname: '/activity-details',
      params: {
        id: 'activity-from-instance',
        activityId: 'activity-from-instance',
        openTaskId: 'task-instance-1',
      },
    });
  });

  it('parses stringified nested payload data and maps openTaskId', () => {
    const route = buildNotificationRouteFromData({
      data: JSON.stringify({
        activity_id: 'activity-json-1',
        task_instance_id: 'task-json-1',
        type: 'task-reminder',
      }),
    });

    expect(route).toEqual({
      pathname: '/activity-details',
      params: {
        id: 'activity-json-1',
        activityId: 'activity-json-1',
        openTaskId: 'task-json-1',
      },
    });
  });

  it('parses deeply nested object payload data and maps openTaskId', () => {
    const route = buildNotificationRouteFromData({
      data: {
        payload: {
          activity_id: 'activity-deep-1',
          task_instance_id: 'task-deep-1',
          type: 'task-reminder',
        },
      },
    });

    expect(route).toEqual({
      pathname: '/activity-details',
      params: {
        id: 'activity-deep-1',
        activityId: 'activity-deep-1',
        openTaskId: 'task-deep-1',
      },
    });
  });

  it('parses deeply nested stringified payload data and maps openTaskId', () => {
    const route = buildNotificationRouteFromData({
      data: JSON.stringify({
        payload: {
          activity_id: 'activity-deep-json-1',
          task_instance_id: 'task-deep-json-1',
          type: 'task-reminder',
        },
      }),
    });

    expect(route).toEqual({
      pathname: '/activity-details',
      params: {
        id: 'activity-deep-json-1',
        activityId: 'activity-deep-json-1',
        openTaskId: 'task-deep-json-1',
      },
    });
  });

  it('falls back to activity task list when task id is missing', () => {
    const route = buildNotificationRouteFromData({
      activityId: 'activity-only',
      type: 'task-reminder',
    });

    expect(route).toEqual({
      pathname: '/activity-details',
      params: {
        id: 'activity-only',
        activityId: 'activity-only',
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
