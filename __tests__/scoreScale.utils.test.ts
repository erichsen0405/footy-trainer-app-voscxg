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
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 1)).toBe('Meget svært i dag');
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 2)).toBe('Lidt svært i dag');
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 3)).toBe('Okay i dag');
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 4)).toBe('Godt i dag');
    expect(findScoreOptionLabel(FEEDBACK_SCORE_OPTIONS, 5)).toBe('Rigtig godt i dag');
  });

  it('maps intensity labels on the new 1-5 scale', () => {
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 1)).toBe('Jeg kunne ikke holde tempo i dag');
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 2)).toBe('Jeg havde svært ved tempoet i dag');
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 3)).toBe('Jeg holdt et okay tempo i dag');
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 4)).toBe('Jeg holdt et højt tempo i dag');
    expect(findScoreOptionLabel(INTENSITY_SCORE_OPTIONS, 5)).toBe('Jeg var helt i top på tempo i dag');
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
