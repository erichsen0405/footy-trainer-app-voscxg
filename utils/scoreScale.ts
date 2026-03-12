export type ScoreOption = {
  value: 1 | 2 | 3 | 4 | 5;
  label: string;
};

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;
export const LEGACY_SCORE_MAX = 10;
export const SCORE_AXIS_VALUES = [1, 2, 3, 4, 5] as const;
export const SUCCESS_SCORE_THRESHOLD = 4;
export const MID_SCORE_THRESHOLD = 3;
export const PERFECT_SCORE = 5;

export const FEEDBACK_SCORE_OPTIONS: ScoreOption[] = [
  { value: 1, label: 'Meget svært i dag' },
  { value: 2, label: 'Lidt svært i dag' },
  { value: 3, label: 'Okay i dag' },
  { value: 4, label: 'Godt i dag' },
  { value: 5, label: 'Rigtig godt i dag' },
];

export const INTENSITY_SCORE_OPTIONS: ScoreOption[] = [
  { value: 1, label: 'Jeg kunne ikke holde tempo i dag' },
  { value: 2, label: 'Jeg havde svært ved tempoet i dag' },
  { value: 3, label: 'Jeg holdt et okay tempo i dag' },
  { value: 4, label: 'Jeg holdt et højt tempo i dag' },
  { value: 5, label: 'Jeg var helt i top på tempo i dag' },
];

function normalizeRoundedScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.round(value);
}

function normalizeRoundedScoreInRange(
  value: unknown,
  min: number,
  max: number,
): number | null {
  const rounded = normalizeRoundedScore(value);
  if (rounded === null) {
    return null;
  }

  return rounded >= min && rounded <= max ? rounded : null;
}

export function normalizeFivePointScore(value: unknown): number | null {
  return normalizeRoundedScoreInRange(value, SCORE_MIN, SCORE_MAX);
}

export function mapLegacyTenPointScoreToFivePoint(value: unknown): number | null {
  const rounded = normalizeRoundedScore(value);
  if (rounded === null) {
    return null;
  }

  const clamped = Math.max(SCORE_MIN, Math.min(LEGACY_SCORE_MAX, rounded));

  if (clamped <= 2) return 1;
  if (clamped <= 4) return 2;
  if (clamped <= 6) return 3;
  if (clamped <= 8) return 4;
  return 5;
}

export function findScoreOptionLabel(
  options: readonly ScoreOption[],
  value: unknown,
): string | null {
  const normalized = normalizeFivePointScore(value);
  if (normalized === null) {
    return null;
  }

  const matched = options.find((option) => option.value === normalized);
  return matched?.label ?? null;
}

export function formatScoreOutOfFive(
  value: unknown,
  emptyValue = '—',
): string {
  const normalized = normalizeFivePointScore(value);
  return normalized === null ? emptyValue : `${normalized}/${SCORE_MAX}`;
}
