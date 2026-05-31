export const MAX_PLAYER_PROFILE_POSITIONS = 5;

export const PLAYER_PROFILE_POSITION_OPTIONS = [
  'Målmand',
  'Back',
  'Midterforsvarer',
  'Central midtbane',
  'Offensiv midtbane',
  'Kant',
  'Angriber',
  'Midtbane',
] as const;

const ALLOWED_PLAYER_POSITIONS = new Set<string>(PLAYER_PROFILE_POSITION_OPTIONS);

export function normalizePlayerProfilePositions(value?: readonly string[] | null): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const positions: string[] = [];

  for (const candidate of value) {
    const normalized = candidate.trim();
    if (!normalized || seen.has(normalized) || !ALLOWED_PLAYER_POSITIONS.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    positions.push(normalized);

    if (positions.length >= MAX_PLAYER_PROFILE_POSITIONS) {
      break;
    }
  }

  return positions;
}

export function arePlayerProfilePositionsEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((position, index) => position === right[index]);
}
