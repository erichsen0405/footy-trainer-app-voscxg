import {
  computeProgressionSummary,
  dedupeByLatestCreatedAt,
  resolveBaseKey,
  resolveFeedbackBaseKey,
} from '@/hooks/useProgressionData';
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
  taskInstanceId: overrides.taskInstanceId ?? null,
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

  it('keeps only the latest feedback state per activity/template key', () => {
    const entries = [
      makeEntry({
        id: 'older-completed',
        createdAt: '2026-02-20T10:00:00.000Z',
        activityId: '9b66da22-3ec4-4f6d-b7d4-f2234b58ab10',
        taskTemplateId: 'template-1',
        rating: 8,
        note: 'gammel note',
      }),
      makeEntry({
        id: 'latest-cleared',
        createdAt: '2026-02-20T11:00:00.000Z',
        activityId: '9b66da22-3ec4-4f6d-b7d4-f2234b58ab10',
        taskTemplateId: 'template-1',
        rating: null,
        note: null,
      }),
    ];

    const latest = dedupeByLatestCreatedAt(
      entries,
      (entry) => `${resolveFeedbackBaseKey(entry)}::${entry.taskTemplateId ?? 'none'}`
    );

    expect(latest).toHaveLength(1);
    expect(latest[0].id).toBe('latest-cleared');
    expect(latest[0].rating).toBeNull();
    expect(latest[0].note).toBeNull();
  });

  it('never resurrects old note after clear and re-complete', () => {
    const entries = [
      makeEntry({
        id: 'first-completed',
        createdAt: '2026-02-20T10:00:00.000Z',
        activityId: '1ce6adf1-32f1-47e3-a9e1-a0a7f2d70811',
        taskTemplateId: 'template-1',
        rating: 7,
        note: 'oprindelig note',
      }),
      makeEntry({
        id: 'cleared',
        createdAt: '2026-02-20T11:00:00.000Z',
        activityId: '1ce6adf1-32f1-47e3-a9e1-a0a7f2d70811',
        taskTemplateId: 'template-1',
        rating: null,
        note: null,
      }),
      makeEntry({
        id: 're-completed',
        createdAt: '2026-02-20T12:00:00.000Z',
        activityId: '1ce6adf1-32f1-47e3-a9e1-a0a7f2d70811',
        taskTemplateId: 'template-1',
        rating: 5,
        note: null,
      }),
    ];

    const latestCompleted = dedupeByLatestCreatedAt(
      entries,
      (entry) => `${resolveFeedbackBaseKey(entry)}::${entry.taskTemplateId ?? 'none'}`
    ).filter((entry) => typeof entry.rating === 'number');

    expect(latestCompleted).toHaveLength(1);
    expect(latestCompleted[0].id).toBe('re-completed');
    expect(latestCompleted[0].note).toBeNull();
  });

  it('prefers event session key over activity id for dedupe', () => {
    const oldEntry = makeEntry({
      id: 'old',
      createdAt: '2026-02-20T10:00:00.000Z',
      activityId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      sessionKey: 'event:feedfeed-feed-4eed-aeed-feedfeedfeed',
      taskTemplateId: 'template-1',
      rating: 4,
      note: 'old note',
    });
    const latestEntry = makeEntry({
      id: 'latest',
      createdAt: '2026-02-20T11:00:00.000Z',
      activityId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
      sessionKey: 'event:feedfeed-feed-4eed-aeed-feedfeedfeed',
      taskTemplateId: 'template-1',
      rating: 7,
      note: 'new note',
    });

    const deduped = dedupeByLatestCreatedAt(
      [oldEntry, latestEntry],
      (entry) => `${resolveFeedbackBaseKey(entry)}::${entry.taskTemplateId ?? 'none'}`
    );

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('latest');
    expect(deduped[0].note).toBe('new note');
  });

  it('dedupes feedback by activity/session before task_instance_id', () => {
    const oldEntry = makeEntry({
      id: 'old',
      createdAt: '2026-02-20T10:00:00.000Z',
      activityId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      taskInstanceId: '11111111-1111-4111-8111-111111111111',
      taskTemplateId: 'template-1',
      rating: 4,
      note: 'old note',
    });
    const latestEntry = makeEntry({
      id: 'latest',
      createdAt: '2026-02-20T11:00:00.000Z',
      activityId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      taskInstanceId: '11111111-1111-4111-8111-111111111111',
      taskTemplateId: 'template-1',
      rating: 7,
      note: 'new note',
    });

    const deduped = dedupeByLatestCreatedAt(
      [oldEntry, latestEntry],
      (entry) => `${resolveFeedbackBaseKey(entry)}::${entry.taskTemplateId ?? 'none'}`
    );

    expect(deduped).toHaveLength(1);
    expect(deduped[0].id).toBe('latest');
    expect(deduped[0].note).toBe('new note');
  });
});
