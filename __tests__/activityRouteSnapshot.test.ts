import { deserializeActivitySnapshotFromRoute, serializeActivitySnapshotForRoute } from '@/utils/activityRouteSnapshot';

describe('activityRouteSnapshot', () => {
  it('round-trips an activity snapshot with task video metadata', () => {
    const serialized = serializeActivitySnapshotForRoute(
      {
        id: 'activity-1',
        title: 'Afslutningstræning',
        activity_time: '18:30:00',
        activity_end_time: '20:00:00',
        location: 'Bane 2',
        category: {
          id: 'cat-1',
          name: 'Afslutninger',
          color: '#22c55e',
          emoji: '⚽',
        },
        tasks: [
          {
            id: 'task-1',
            title: 'Se reel',
            description: 'Videoanalyse',
            completed: false,
            reminder_minutes: 45,
            video_url: 'https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=',
            task_template_id: 'template-1',
          },
        ],
        intensity: 4,
        intensity_enabled: true,
        intensity_note: 'Høj kvalitet',
        is_external: true,
        external_calendar_id: 'calendar-1',
        external_event_id: 'event-1',
        external_event_row_id: 'row-1',
      },
      new Date('2026-04-13T18:30:00.000Z'),
    );

    expect(serialized).toBeTruthy();

    const deserialized = deserializeActivitySnapshotFromRoute(serialized);
    expect(deserialized).not.toBeNull();
    expect(deserialized?.id).toBe('activity-1');
    expect(deserialized?.title).toBe('Afslutningstræning');
    expect(deserialized?.date.toISOString()).toBe('2026-04-13T18:30:00.000Z');
    expect(deserialized?.tasks).toHaveLength(1);
    expect((deserialized?.tasks?.[0] as any)?.video_url).toBe(
      'https://www.instagram.com/reel/C7N2KQ2uV9x/?igsh=MWQ=',
    );
    expect((deserialized?.tasks?.[0] as any)?.task_template_id).toBe('template-1');
    expect(deserialized?.isExternal).toBe(true);
    expect(deserialized?.externalEventRowId).toBe('row-1');
  });

  it('returns null for invalid snapshot payloads', () => {
    expect(deserializeActivitySnapshotFromRoute('')).toBeNull();
    expect(deserializeActivitySnapshotFromRoute('not-json')).toBeNull();
  });
});
