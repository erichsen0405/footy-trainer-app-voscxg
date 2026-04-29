import {
  emitActivityDeleted,
  emitActivityDeleteRestored,
  isActivityOptimisticallyDeleted,
  subscribeToActivityDeleted,
} from '@/utils/activityEvents';

describe('activity delete events', () => {
  it('tracks optimistic deleted activities and restores them on failure', () => {
    const activityId = 'activity-optimistic-delete-test';
    const seriesId = 'series-optimistic-delete-test';
    const actions: string[] = [];
    const unsubscribe = subscribeToActivityDeleted(event => {
      actions.push(event.action);
    });

    emitActivityDeleted({ activityIds: [activityId], seriesId, reason: 'test_delete' });

    expect(isActivityOptimisticallyDeleted({ id: activityId })).toBe(true);
    expect(isActivityOptimisticallyDeleted({ id: 'other-activity', series_id: seriesId })).toBe(true);

    emitActivityDeleteRestored({ activityIds: [activityId], seriesId, reason: 'test_restore' });

    expect(isActivityOptimisticallyDeleted({ id: activityId })).toBe(false);
    expect(isActivityOptimisticallyDeleted({ id: 'other-activity', series_id: seriesId })).toBe(false);
    expect(actions).toEqual(['deleted', 'restored']);

    unsubscribe();
  });
});
