import {
  FEEDBACK_SCORE_OPTIONS,
  INTENSITY_SCORE_OPTIONS,
  findScoreOptionLabel,
  mapLegacyTenPointScoreToFivePoint,
  normalizeFivePointScore,
} from '@/utils/scoreScale';

describe('scoreScale utils', () => {
  it('maps legacy 1-10 scores to the new 1-5 scale', () => {
    expect(mapLegacyTenPointScoreToFivePoint(1)).toBe(1);
    expect(mapLegacyTenPointScoreToFivePoint(2)).toBe(1);
    expect(mapLegacyTenPointScoreToFivePoint(3)).toBe(2);
    expect(mapLegacyTenPointScoreToFivePoint(4)).toBe(2);
    expect(mapLegacyTenPointScoreToFivePoint(5)).toBe(3);
    expect(mapLegacyTenPointScoreToFivePoint(6)).toBe(3);
    expect(mapLegacyTenPointScoreToFivePoint(7)).toBe(4);
    expect(mapLegacyTenPointScoreToFivePoint(8)).toBe(4);
    expect(mapLegacyTenPointScoreToFivePoint(9)).toBe(5);
    expect(mapLegacyTenPointScoreToFivePoint(10)).toBe(5);
  });

  it('maps feedback labels on the new 1-5 scale', () => {
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 1)).toBe('Very difficult today');
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 2)).toBe('A little difficult today');
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 3)).toBe('Okay today');
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 4)).toBe('Good today');
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 5)).toBe('Very good today');
  });

  it('maps intensity labels on the new 1-5 scale', () => {
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 1)).toBe('I could not keep the pace today');
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 2)).toBe('I struggled with the pace today');
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 3)).toBe('I kept an okay pace today');
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 4)).toBe('I kept a high pace today');
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 5)).toBe('My pace was excellent today');
  });

  it('handles normalization edge cases deterministically', () => {
    expect(normalizeFivePointScore(null)).toBeNull();
    expect(normalizeFivePointScore(undefined)).toBeNull();
    expect(normalizeFivePointScore(Number.NaN)).toBeNull();
    expect(normalizeFivePointScore(0)).toBeNull();
    expect(normalizeFivePointScore(6)).toBeNull();
    expect(normalizeFivePointScore(3.6)).toBe(4);

    expect(mapLegacyTenPointScoreToFivePoint(null)).toBeNull();
    expect(mapLegacyTenPointScoreToFivePoint(Number.NaN)).toBeNull();
    expect(mapLegacyTenPointScoreToFivePoint(0)).toBe(1);
    expect(mapLegacyTenPointScoreToFivePoint(11)).toBe(5);
    expect(mapLegacyTenPointScoreToFivePoint(8.6)).toBe(5);
  });
});
