import {
  buildPeriodBounds,
  buildSessionKey,
  normalizeEventId,
  normalizeTime,
  toDateKey,
} from '@/hooks/useProgressionData';

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

describe('date and period helpers', () => {
  it('extracts YYYY-MM-DD from ISO-like values', () => {
    expect(toDateKey('2026-02-12T23:59:59.000Z')).toBe('2026-02-12');
    expect(toDateKey('2026-02-12+01:00')).toBe('2026-02-12');
  });

  it('normalizes time to HH:MM', () => {
    expect(normalizeTime(' 09:30:45 ')).toBe('09:30');
    expect(normalizeTime('')).toBeNull();
  });

  it('accepts UUID event ids and rejects non-UUID ids', () => {
    expect(normalizeEventId('123e4567-e89b-12d3-a456-426614174000')).toBe(
      '123e4567-e89b-12d3-a456-426614174000'
    );
    expect(normalizeEventId('google_abc')).toBeNull();
  });

  it('builds session key from event id when available', () => {
    const sessionKey = buildSessionKey({
      eventId: '123e4567-e89b-12d3-a456-426614174000',
      userId: 'user-1',
      date: '2026-02-12',
      time: '10:15:00',
    });
    expect(sessionKey).toBe('event:123e4567-e89b-12d3-a456-426614174000');
  });

  it('builds fallback session key from user/date/time', () => {
    const sessionKey = buildSessionKey({
      eventId: 'not-a-uuid',
      userId: '  user-1 ',
      date: '2026-02-12T10:00:00Z',
      time: '10:15:59',
    });
    expect(sessionKey).toBe('user-1:2026-02-12:10:15');
  });

  it('returns null session key when required fallback parts are missing', () => {
    expect(buildSessionKey({ userId: '', date: '2026-02-12', time: '10:00' })).toBeNull();
    expect(buildSessionKey({ userId: 'u1', date: '', time: '10:00' })).toBeNull();
  });

  it('computes period boundaries for multi-day windows', () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    const bounds = buildPeriodBounds(7, now);

    expect(bounds.periodStartDate).toBe('2026-01-09');
    expect(bounds.periodEndDate).toBe('2026-01-16');
    expect(bounds.previousStartDate).toBe('2026-01-02');
    expect(bounds.previousEndDate).toBe('2026-01-09');
    expect(bounds.periodEndInclusiveDate).toBe('2026-01-15');
  });

  it('computes period boundaries for a one-day window', () => {
    const now = new Date('2026-03-01T08:00:00.000Z');
    const bounds = buildPeriodBounds(1, now);

    expect(bounds.periodStartDate).toBe('2026-03-01');
    expect(bounds.periodEndDate).toBe('2026-03-02');
    expect(bounds.previousStartDate).toBe('2026-02-28');
  });
});
