import { computeProgressionSummary } from '@/hooks/useProgressionData';
import type { ProgressionEntry } from '@/hooks/useProgressionData';

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
    },
  },
}));

const makeEntry = (overrides: Partial<ProgressionEntry>): ProgressionEntry => ({
  id: overrides.id ?? 'e1',
  kind: overrides.kind ?? 'rating',
  createdAt: overrides.createdAt ?? '2026-01-10T12:00:00.000Z',
  activityId: overrides.activityId ?? 'a1',
  taskTemplateId: overrides.taskTemplateId ?? 't1',
  taskTemplateName: overrides.taskTemplateName ?? null,
  taskTemplateDescription: overrides.taskTemplateDescription ?? null,
  taskTemplateScoreExplanation: overrides.taskTemplateScoreExplanation ?? null,
  activityTitle: overrides.activityTitle ?? null,
  rating: overrides.rating ?? null,
  intensity: overrides.intensity ?? null,
  note: overrides.note ?? null,
  dateKey: overrides.dateKey ?? '2026-01-10',
  focusCategoryId: overrides.focusCategoryId ?? null,
  focusName: overrides.focusName ?? 'Focus',
  focusColor: overrides.focusColor ?? undefined,
  sessionKey: overrides.sessionKey ?? null,
});

describe('progression KPI summary', () => {
  it('returns zeros for empty rating datasets', () => {
    const summary = computeProgressionSummary({
      metric: 'rating',
      days: 30,
      focusCompleted: [],
      focusCompletedPrevious: [],
      intensityCompleted: [],
      intensityCompletedPrevious: [],
      intensityPossible: [],
      intensityPossiblePrevious: [],
      ratingPossibleCount: 0,
      ratingCompletedCount: 0,
      ratingPreviousPossibleCount: 0,
      ratingPreviousCompletedCount: 0,
    });

    expect(summary.completionRate).toBe(0);
    expect(summary.previousRate).toBe(0);
    expect(summary.delta).toBe(0);
    expect(summary.badges).toEqual([]);
  });

  it('rounds rating completion rate from counts', () => {
    const summary = computeProgressionSummary({
      metric: 'rating',
      days: 30,
      focusCompleted: [makeEntry({ rating: 6 })],
      focusCompletedPrevious: [],
      intensityCompleted: [],
      intensityCompletedPrevious: [],
      intensityPossible: [],
      intensityPossiblePrevious: [],
      ratingPossibleCount: 3,
      ratingCompletedCount: 2,
      ratingPreviousPossibleCount: 0,
      ratingPreviousCompletedCount: 0,
    });

    expect(summary.completionRate).toBe(67);
    expect(summary.completedCount).toBe(2);
    expect(summary.possibleCount).toBe(3);
  });

  it('adds momentum when current completion beats previous period', () => {
    const summary = computeProgressionSummary({
      metric: 'rating',
      days: 10,
      focusCompleted: [makeEntry({ rating: 8 })],
      focusCompletedPrevious: [makeEntry({ rating: 4, dateKey: '2026-01-01' })],
      intensityCompleted: [],
      intensityCompletedPrevious: [],
      intensityPossible: [],
      intensityPossiblePrevious: [],
      ratingPossibleCount: 4,
      ratingCompletedCount: 3,
      ratingPreviousPossibleCount: 4,
      ratingPreviousCompletedCount: 1,
    });

    expect(summary.delta).toBeGreaterThan(0);
    expect(summary.badges).toContain('Momentum');
  });

  it('calculates streak, mastery and consistency badges for rating', () => {
    const summary = computeProgressionSummary({
      metric: 'rating',
      days: 8,
      focusCompleted: [
        makeEntry({ id: 'e1', rating: 8, dateKey: '2026-01-10' }),
        makeEntry({ id: 'e2', rating: 9, dateKey: '2026-01-09' }),
        makeEntry({ id: 'e3', rating: 8, dateKey: '2026-01-08' }),
      ],
      focusCompletedPrevious: [],
      intensityCompleted: [],
      intensityCompletedPrevious: [],
      intensityPossible: [],
      intensityPossiblePrevious: [],
      ratingPossibleCount: 3,
      ratingCompletedCount: 3,
      ratingPreviousPossibleCount: 0,
      ratingPreviousCompletedCount: 0,
    });

    expect(summary.streakDays).toBe(3);
    expect(summary.badges).toContain('Streak 3+');
    expect(summary.badges).toContain('Consistency');
    expect(summary.badges).toContain('8+ mastery');
  });

  it('sets avgChangePercent to 100 when previous average is zero and current > 0', () => {
    const summary = computeProgressionSummary({
      metric: 'rating',
      days: 30,
      focusCompleted: [makeEntry({ rating: 6 })],
      focusCompletedPrevious: [makeEntry({ rating: 0, dateKey: '2026-01-01' })],
      intensityCompleted: [],
      intensityCompletedPrevious: [],
      intensityPossible: [],
      intensityPossiblePrevious: [],
      ratingPossibleCount: 1,
      ratingCompletedCount: 1,
      ratingPreviousPossibleCount: 1,
      ratingPreviousCompletedCount: 1,
    });

    expect(summary.avgChangePercent).toBe(100);
  });

  it('returns zeros for empty intensity datasets', () => {
    const summary = computeProgressionSummary({
      metric: 'intensity',
      days: 30,
      focusCompleted: [],
      focusCompletedPrevious: [],
      intensityCompleted: [],
      intensityCompletedPrevious: [],
      intensityPossible: [],
      intensityPossiblePrevious: [],
      ratingPossibleCount: 0,
      ratingCompletedCount: 0,
      ratingPreviousPossibleCount: 0,
      ratingPreviousCompletedCount: 0,
    });

    expect(summary.completionRate).toBe(0);
    expect(summary.completedCount).toBe(0);
    expect(summary.badges).toEqual([]);
  });

  it('uses intensity possible/completed lengths for completion math', () => {
    const summary = computeProgressionSummary({
      metric: 'intensity',
      days: 30,
      focusCompleted: [],
      focusCompletedPrevious: [],
      intensityCompleted: [makeEntry({ kind: 'intensity', intensity: 7 })],
      intensityCompletedPrevious: [],
      intensityPossible: [
        makeEntry({ id: 'i1', kind: 'intensity', intensity: 7 }),
        makeEntry({ id: 'i2', kind: 'intensity', intensity: null }),
        makeEntry({ id: 'i3', kind: 'intensity', intensity: null }),
      ],
      intensityPossiblePrevious: [],
      ratingPossibleCount: 0,
      ratingCompletedCount: 0,
      ratingPreviousPossibleCount: 0,
      ratingPreviousCompletedCount: 0,
    });

    expect(summary.completionRate).toBe(33);
    expect(summary.possibleCount).toBe(3);
    expect(summary.completedCount).toBe(1);
  });

  it('breaks intensity streak when dates are not consecutive', () => {
    const summary = computeProgressionSummary({
      metric: 'intensity',
      days: 30,
      focusCompleted: [],
      focusCompletedPrevious: [],
      intensityCompleted: [
        makeEntry({ id: 'i1', kind: 'intensity', intensity: 8, dateKey: '2026-01-10' }),
        makeEntry({ id: 'i2', kind: 'intensity', intensity: 8, dateKey: '2026-01-08' }),
      ],
      intensityCompletedPrevious: [],
      intensityPossible: [
        makeEntry({ id: 'p1', kind: 'intensity', intensity: null, dateKey: '2026-01-10' }),
        makeEntry({ id: 'p2', kind: 'intensity', intensity: null, dateKey: '2026-01-08' }),
      ],
      intensityPossiblePrevious: [],
      ratingPossibleCount: 0,
      ratingCompletedCount: 0,
      ratingPreviousPossibleCount: 0,
      ratingPreviousCompletedCount: 0,
    });

    expect(summary.streakDays).toBe(1);
    expect(summary.badges).not.toContain('Streak 3+');
  });
});
