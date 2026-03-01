import { buildScheduleDates, getNextStartOccurrence } from '@/utils/overdueReminderScheduler';

describe('overdueReminderScheduler', () => {
  it('getNextStartOccurrence returns next day when start time has passed', () => {
    const now = new Date('2026-03-01T10:30:00.000Z');
    const nextStart = getNextStartOccurrence(8 * 60, now);

    expect(nextStart.getHours()).toBe(8);
    expect(nextStart.getMinutes()).toBe(0);
    expect(nextStart.getDate()).toBe(now.getDate() + 1);
    expect(nextStart.getTime()).toBeGreaterThanOrEqual(now.getTime());
  });

  it('buildScheduleDates creates only DATE times from nextStart for 24h window', () => {
    const nextStart = new Date('2026-03-01T08:00:00.000Z');
    const intervalMinutes = 60;

    const dates = buildScheduleDates(nextStart, intervalMinutes);

    expect(dates.length).toBe(25);
    expect(dates[0].getTime()).toBeGreaterThanOrEqual(nextStart.getTime());

    for (const date of dates) {
      expect(date.getTime()).toBeGreaterThanOrEqual(nextStart.getTime());
    }

    for (let index = 1; index < dates.length; index += 1) {
      const spacingMs = dates[index].getTime() - dates[index - 1].getTime();
      expect(spacingMs).toBe(intervalMinutes * 60 * 1000);
    }

    const endWindow = nextStart.getTime() + 24 * 60 * 60 * 1000;
    expect(dates[dates.length - 1].getTime()).toBeLessThanOrEqual(endWindow);
  });
});
