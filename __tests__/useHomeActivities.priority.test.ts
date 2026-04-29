import { getHomeActivityPriorityBucket, partitionActivitiesByHomePriority } from '@/hooks/useHomeActivities';

describe('useHomeActivities priority staging', () => {
  const now = new Date('2026-04-15T10:00:00.000Z');

  it('classifies activities into today, current week, upcoming, and historical buckets', () => {
    expect(getHomeActivityPriorityBucket({ activity_date: '2026-04-15' }, now)).toBe('today');
    expect(getHomeActivityPriorityBucket({ activity_date: '2026-04-13' }, now)).toBe('currentWeek');
    expect(getHomeActivityPriorityBucket({ activity_date: '2026-04-20' }, now)).toBe('upcoming');
    expect(getHomeActivityPriorityBucket({ activity_date: '2026-04-01' }, now)).toBe('historical');
  });

  it('partitions activities in the requested load order', () => {
    const activities = [
      { id: 'historical', activity_date: '2026-04-01' },
      { id: 'upcoming', activity_date: '2026-04-20' },
      { id: 'today', activity_date: '2026-04-15' },
      { id: 'week', activity_date: '2026-04-17' },
    ];

    const partitioned = partitionActivitiesByHomePriority(activities, now);

    expect(partitioned.today.map((activity) => activity.id)).toEqual(['today']);
    expect(partitioned.currentWeek.map((activity) => activity.id)).toEqual(['week']);
    expect(partitioned.upcoming.map((activity) => activity.id)).toEqual(['upcoming']);
    expect(partitioned.historical.map((activity) => activity.id)).toEqual(['historical']);
  });
});
