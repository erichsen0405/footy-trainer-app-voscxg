import { getHomeActivityWindow, HOME_ACTIVITY_QUERY_PAGE_SIZE } from '../hooks/useHomeActivities';

describe('useHomeActivities window config', () => {
  it('fetches 6 months back and 6 months forward', () => {
    expect(getHomeActivityWindow(new Date('2026-03-11T10:00:00.000Z'))).toEqual({
      startDate: '2025-09-11',
      endDateExclusive: '2026-09-11',
    });
  });

  it('raises the UI activity page size to 3000', () => {
    expect(HOME_ACTIVITY_QUERY_PAGE_SIZE).toBe(3000);
  });
});
