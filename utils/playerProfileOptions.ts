export const MAX_PLAYER_PROFILE_POSITIONS = 5;

export const PLAYER_PROFILE_POSITION_OPTIONS = [
  'Goalkeeper',
  'Fullback',
  'Center back',
  'Central midfielder',
  'Attacking midfielder',
  'Winger',
  'Striker',
  'Midfielder',
] as const;

const LEGACY_PLAYER_PROFILE_POSITION_MAP = new Map<string, string>([
  ['Målmand', 'Goalkeeper'],
  ['Back', 'Fullback'],
  ['Midterforsvarer', 'Center back'],
  ['Central midtbane', 'Central midfielder'],
  ['Offensiv midtbane', 'Attacking midfielder'],
  ['Kant', 'Winger'],
  ['Angriber', 'Striker'],
  ['Midtbane', 'Midfielder'],
]);

const ALLOWED_PLAYER_POSITIONS = new Set<string>([
  ...PLAYER_PROFILE_POSITION_OPTIONS,
  ...LEGACY_PLAYER_PROFILE_POSITION_MAP.keys(),
]);

export const PROFILE_SELECT_WITH_PLAYER_FIELDS =
  'full_name, phone_number, avatar_url, player_positions, club_name, playing_level';

export const PROFILE_SELECT_LEGACY = 'full_name, phone_number';

type ProfileRowWithOptionalPlayerFields = {
  full_name: string | null;
  phone_number: string | null;
  avatar_url?: string | null;
  player_positions?: readonly string[] | null;
  club_name?: string | null;
  playing_level?: string | null;
};

export function normalizePlayerProfilePositions(value?: readonly string[] | null): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const positions: string[] = [];

  for (const candidate of value) {
    const normalized = LEGACY_PLAYER_PROFILE_POSITION_MAP.get(candidate.trim()) ?? candidate.trim();
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

export function isMissingPlayerProfileFieldsError(error: unknown): boolean {
  const maybeError = error as { code?: string; message?: string } | null;
  if (maybeError?.code !== '42703') return false;

  const message = maybeError.message ?? '';
  return (
    message.includes('profiles.avatar_url') ||
    message.includes('profiles.player_positions') ||
    message.includes('profiles.club_name') ||
    message.includes('profiles.playing_level') ||
    /column .* does not exist/i.test(message)
  );
}

export function withProfilePlayerFieldDefaults(
  profile: ProfileRowWithOptionalPlayerFields
): {
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  player_positions: string[];
  club_name: string | null;
  playing_level: string | null;
} {
  return {
    full_name: profile.full_name,
    phone_number: profile.phone_number,
    avatar_url: profile.avatar_url ?? null,
    player_positions: normalizePlayerProfilePositions(profile.player_positions),
    club_name: profile.club_name ?? null,
    playing_level: profile.playing_level ?? null,
  };
}
