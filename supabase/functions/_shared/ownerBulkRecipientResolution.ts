export type OwnerBulkRecipientFilter = {
  field: string;
  values: Array<string | number>;
  operator: 'in' | 'between';
  programId: string | null;
};

export type OwnerBulkRosterPlayer = {
  playerId: string;
  name: string;
  age: number | null;
  crmStatus: string | null;
  playingLevel: string | null;
  positions: string[];
  tags: Array<{ id: string }>;
  teams: Array<{ id: string }>;
  programEnrollments: Array<{ programId: string; status: string }>;
};

export type OwnerBulkRecipientCommand = {
  filters: OwnerBulkRecipientFilter[];
  playerIds: string[];
  includeAllPlayers: boolean;
  exclusions: { playerIds: string[]; teamIds: string[] };
};

export type OwnerBulkRecipientDataset<
  Player extends OwnerBulkRosterPlayer = OwnerBulkRosterPlayer,
> = {
  roster: Player[];
  teams: Array<{ id: string }>;
};

export type OwnerBulkRecipientFailure = (
  code: 'PLAYER_NOT_FOUND' | 'VALIDATION_ERROR',
  message: string,
  status: 400 | 404,
) => never;

export class OwnerBulkRecipientResolutionError extends Error {
  readonly code: 'PLAYER_NOT_FOUND' | 'VALIDATION_ERROR';
  readonly status: 400 | 404;

  constructor(
    code: 'PLAYER_NOT_FOUND' | 'VALIDATION_ERROR',
    message: string,
    status: 400 | 404,
  ) {
    super(message);
    this.name = 'OwnerBulkRecipientResolutionError';
    this.code = code;
    this.status = status;
  }
}

const defaultFailure: OwnerBulkRecipientFailure = (code, message, status) => {
  throw new OwnerBulkRecipientResolutionError(code, message, status);
};

export function ownerBulkFilterMatches(
  player: OwnerBulkRosterPlayer,
  filter: OwnerBulkRecipientFilter,
): boolean {
  const stringValues = filter.values.map(String);
  if (filter.field === 'team')
    return player.teams.some((team) => stringValues.includes(team.id));
  if (filter.field === 'tag')
    return player.tags.some((tag) => stringValues.includes(tag.id));
  if (filter.field === 'crm_status')
    return Boolean(player.crmStatus && stringValues.includes(player.crmStatus));
  if (filter.field === 'playing_level')
    return Boolean(
      player.playingLevel && stringValues.includes(player.playingLevel),
    );
  if (filter.field === 'position')
    return player.positions.some((position) => stringValues.includes(position));
  if (filter.field === 'age') {
    if (player.age === null) return false;
    const numbers = filter.values.map(Number);
    return filter.operator === 'between'
      ? player.age >= Math.min(numbers[0], numbers[1]) &&
          player.age <= Math.max(numbers[0], numbers[1])
      : numbers.includes(player.age);
  }
  return player.programEnrollments.some(
    (enrollment) =>
      (!filter.programId || enrollment.programId === filter.programId) &&
      stringValues.includes(enrollment.status),
  );
}

export function resolveOwnerBulkRecipients<
  Player extends OwnerBulkRosterPlayer,
>(
  command: OwnerBulkRecipientCommand,
  dataset: OwnerBulkRecipientDataset<Player>,
  fail: OwnerBulkRecipientFailure = defaultFailure,
) {
  const playerById = new Map(
    dataset.roster.map((player) => [player.playerId, player]),
  );
  const unknownSelectedPlayerIds = command.playerIds.filter(
    (id) => !playerById.has(id),
  );
  if (unknownSelectedPlayerIds.length) {
    fail(
      'PLAYER_NOT_FOUND',
      'One or more selected players are not active in this owner.',
      404,
    );
  }

  const unknownExcludedPlayerIds = command.exclusions.playerIds.filter(
    (id) => !playerById.has(id),
  );
  if (unknownExcludedPlayerIds.length) {
    fail(
      'PLAYER_NOT_FOUND',
      'One or more excluded players are not active in this owner.',
      404,
    );
  }

  const ownerTeamIds = new Set(dataset.teams.map((team) => String(team.id)));
  if (command.exclusions.teamIds.some((id) => !ownerTeamIds.has(id))) {
    fail(
      'VALIDATION_ERROR',
      'An excluded team does not belong to this owner.',
      400,
    );
  }

  // Values within one filter group are OR'ed; separate filter groups are AND'ed.
  const filterMatched = command.filters.length
    ? dataset.roster.filter((player) =>
        command.filters.every((filter) =>
          ownerBulkFilterMatches(player, filter),
        ),
      )
    : [];
  const selectedIds = new Set<string>();
  if (command.includeAllPlayers)
    dataset.roster.forEach((player) => selectedIds.add(player.playerId));
  filterMatched.forEach((player) => selectedIds.add(player.playerId));
  command.playerIds.forEach((id) => selectedIds.add(id));

  // Exclusions always win after the direct/filter/include-all union has been resolved.
  const explicitlyExcludedIds = new Set(command.exclusions.playerIds);
  const teamExcludedIds = new Set(
    dataset.roster
      .filter((player) =>
        player.teams.some((team) =>
          command.exclusions.teamIds.includes(team.id),
        ),
      )
      .map((player) => player.playerId),
  );
  const excludedPlayerIds = new Set([
    ...explicitlyExcludedIds,
    ...teamExcludedIds,
  ]);
  const matched = dataset.roster.filter((player) =>
    selectedIds.has(player.playerId),
  );
  const included = matched.filter(
    (player) => !excludedPlayerIds.has(player.playerId),
  );
  const excluded = matched
    .filter((player) => excludedPlayerIds.has(player.playerId))
    .map((player) => ({
      playerId: player.playerId,
      name: player.name,
      reasons: [
        ...(explicitlyExcludedIds.has(player.playerId)
          ? ['explicit_exclusion']
          : []),
        ...(teamExcludedIds.has(player.playerId) ? ['team_exclusion'] : []),
      ],
    }));

  return { matched, included, excluded };
}
