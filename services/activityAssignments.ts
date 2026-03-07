import { supabase } from '@/integrations/supabase/client';

const normalizeId = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const normalizeIds = (ids?: string[] | null): string[] => {
  if (!Array.isArray(ids)) return [];
  const unique = new Set<string>();
  ids.forEach((value) => {
    const normalized = normalizeId(value);
    if (normalized) unique.add(normalized);
  });
  return Array.from(unique);
};

type ActivityAssignmentRow = {
  playerId: string | null;
  teamId: string | null;
};

type ActivityAssignmentExclusionRow = {
  playerId: string;
  teamId: string;
};

const isMissingSourceActivityIdColumnError = (error: any): boolean => {
  const message = String(error?.message ?? '').toLowerCase();
  return error?.code === '42703' && message.includes('source_activity_id');
};

const isMissingActivityAssignmentTeamExclusionsTableError = (error: any): boolean => {
  const message = String(error?.message ?? '').toLowerCase();
  return error?.code === 'PGRST205' && message.includes('activity_assignment_team_exclusions');
};

const isMissingActivityAssignmentTeamExclusionsRpcError = (error: any): boolean => {
  const message = String(error?.message ?? '').toLowerCase();
  return (
    error?.code === 'PGRST202' &&
    (message.includes('sync_internal_activity_assignment_team_exclusions') ||
      message.includes('sync_external_activity_assignment_team_exclusions'))
  );
};

const toMissingMigrationError = (): Error =>
  new Error(
    'Aktivitetstildeling kræver en manglende database-migration. Kør migrationen for source_activity_id og prøv igen.',
  );

const toMissingTeamExclusionsMigrationError = (): Error =>
  new Error(
    'Hold-fravalg kræver en manglende database-migration. Kør migrationen for activity_assignment_team_exclusions og prøv igen.',
  );

const toAssignmentRows = (rows: any[]): ActivityAssignmentRow[] =>
  (rows || []).reduce<ActivityAssignmentRow[]>((acc, row) => {
    const playerId = normalizeId(String(row?.player_id ?? '')) || null;
    const teamId = normalizeId(String(row?.team_id ?? '')) || null;
    if (!playerId && !teamId) return acc;
    acc.push({ playerId, teamId });
    return acc;
  }, []);

const toAssignmentLookup = (rows: ActivityAssignmentRow[]): ActivityAssignmentLookup => {
  const playerIds = new Set<string>();
  const teamIds = new Set<string>();

  rows.forEach((row) => {
    const playerId = row.playerId ?? '';
    const teamId = row.teamId ?? '';
    if (playerId) playerIds.add(playerId);
    if (teamId) teamIds.add(teamId);
  });

  return {
    playerIds: Array.from(playerIds),
    teamIds: Array.from(teamIds),
  };
};

const toAssignmentExclusionRows = (rows: any[]): ActivityAssignmentExclusionRow[] =>
  (rows || []).reduce<ActivityAssignmentExclusionRow[]>((acc, row) => {
    const playerId = normalizeId(String(row?.player_id ?? ''));
    const teamId = normalizeId(String(row?.team_id ?? ''));
    if (!playerId || !teamId) return acc;
    acc.push({ playerId, teamId });
    return acc;
  }, []);

const toExcludedPlayerIdsByTeamId = (
  rows: ActivityAssignmentExclusionRow[],
): Record<string, string[]> =>
  rows.reduce<Record<string, string[]>>((acc, row) => {
    if (!Array.isArray(acc[row.teamId])) {
      acc[row.teamId] = [];
    }
    if (!acc[row.teamId].includes(row.playerId)) {
      acc[row.teamId].push(row.playerId);
    }
    return acc;
  }, {});

const normalizeExcludedPlayerIdsByTeamId = (
  value?: Record<string, string[] | null> | null,
): Record<string, string[]> => {
  const next: Record<string, string[]> = {};
  if (!value || typeof value !== 'object') return next;

  Object.entries(value).forEach(([teamId, playerIds]) => {
    const normalizedTeamId = normalizeId(teamId);
    const normalizedPlayerIds = normalizeIds(playerIds || []).sort();
    if (!normalizedTeamId || !normalizedPlayerIds.length) return;
    next[normalizedTeamId] = normalizedPlayerIds;
  });

  return next;
};

const areExcludedPlayerIdsByTeamIdEqual = (
  left?: Record<string, string[] | null> | null,
  right?: Record<string, string[] | null> | null,
): boolean => {
  const normalizedLeft = normalizeExcludedPlayerIdsByTeamId(left);
  const normalizedRight = normalizeExcludedPlayerIdsByTeamId(right);
  const leftTeamIds = Object.keys(normalizedLeft).sort();
  const rightTeamIds = Object.keys(normalizedRight).sort();

  if (leftTeamIds.length !== rightTeamIds.length) return false;

  return leftTeamIds.every((teamId, index) => {
    if (teamId !== rightTeamIds[index]) return false;
    const leftPlayerIds = normalizedLeft[teamId];
    const rightPlayerIds = normalizedRight[teamId] || [];
    if (leftPlayerIds.length !== rightPlayerIds.length) return false;
    return leftPlayerIds.every((playerId, playerIndex) => playerId === rightPlayerIds[playerIndex]);
  });
};

const toAssignmentState = (
  rows: ActivityAssignmentRow[],
  exclusionRows: ActivityAssignmentExclusionRow[],
): ActivityAssignmentState => {
  const lookup = toAssignmentLookup(rows);
  const directPlayerIds = new Set<string>();
  const teamScopeByPlayerId = buildTeamScopeByPlayerId(rows);
  const excludedPlayerIdsByTeamId = toExcludedPlayerIdsByTeamId(exclusionRows);

  rows.forEach((row) => {
    if (row.playerId && !row.teamId) {
      directPlayerIds.add(row.playerId);
    }
  });

  return {
    ...lookup,
    directPlayerIds: Array.from(directPlayerIds),
    teamScopeByPlayerId,
    excludedPlayerIdsByTeamId,
  };
};

const getTeamMembersByTeamIds = async (teamIds: string[]): Promise<Record<string, string[]>> => {
  if (!teamIds.length) return {};

  const { data, error } = await supabase
    .from('team_members')
    .select('team_id, player_id')
    .in('team_id', teamIds);

  if (error) throw error;

  const membersByTeamId: Record<string, string[]> = {};
  (data || []).forEach((row: any) => {
    const teamId = normalizeId(String(row?.team_id ?? ''));
    const playerId = normalizeId(String(row?.player_id ?? ''));
    if (!teamId || !playerId) return;
    if (!Array.isArray(membersByTeamId[teamId])) {
      membersByTeamId[teamId] = [];
    }
    if (!membersByTeamId[teamId].includes(playerId)) {
      membersByTeamId[teamId].push(playerId);
    }
  });

  return membersByTeamId;
};

const buildTeamScopeByPlayerId = (rows: ActivityAssignmentRow[]): Record<string, string | null> =>
  rows.reduce<Record<string, string | null>>((acc, row) => {
    if (!row.playerId) return acc;
    if (!(row.playerId in acc) || row.teamId) {
      acc[row.playerId] = row.teamId ?? null;
    }
    return acc;
  }, {});

const resolveExternalEventRowId = async (args: {
  activityId: string;
  trainerId: string;
  externalEventRowId?: string | null;
}): Promise<string | null> => {
  const fromParam = normalizeId(args.externalEventRowId);
  if (fromParam) return fromParam;

  const normalizedActivityId = normalizeId(args.activityId);
  const normalizedTrainerId = normalizeId(args.trainerId);
  if (!normalizedActivityId || !normalizedTrainerId) {
    return null;
  }

  const { data, error } = await supabase
    .from('events_local_meta')
    .select('external_event_id')
    .eq('id', normalizedActivityId)
    .eq('user_id', normalizedTrainerId)
    .maybeSingle();

  if (error) throw error;

  const fromMeta = normalizeId(String((data as any)?.external_event_id ?? ''));
  return fromMeta || null;
};

const fetchAssignmentExclusionRows = async (
  input: FetchActivityAssignmentsInput,
): Promise<ActivityAssignmentExclusionRow[]> => {
  const activityId = normalizeId(input.activityId);
  const trainerId = normalizeId(input.trainerId);

  if (!activityId || !trainerId) {
    return [];
  }

  if (input.isExternal) {
    const externalEventRowId = await resolveExternalEventRowId({
      activityId,
      trainerId,
      externalEventRowId: input.externalEventRowId,
    });

    if (!externalEventRowId) {
      return [];
    }

    const { data, error } = await supabase
      .from('activity_assignment_team_exclusions')
      .select('player_id, team_id')
      .eq('external_event_id', externalEventRowId);

    if (error) {
      if (isMissingActivityAssignmentTeamExclusionsTableError(error)) {
        return [];
      }
      throw error;
    }
    return toAssignmentExclusionRows((data || []) as any[]);
  }

  const { data, error } = await supabase
    .from('activity_assignment_team_exclusions')
    .select('player_id, team_id')
    .eq('source_activity_id', activityId);

  if (error) {
    if (isMissingActivityAssignmentTeamExclusionsTableError(error)) {
      return [];
    }
    throw error;
  }
  return toAssignmentExclusionRows((data || []) as any[]);
};

const syncAssignmentExclusions = async (args: {
  activityId: string;
  trainerId: string;
  isExternal: boolean;
  externalEventRowId?: string | null;
  excludedPlayerIdsByTeamId: Record<string, string[]>;
}): Promise<void> => {
  const exclusionsPayload = normalizeExcludedPlayerIdsByTeamId(args.excludedPlayerIdsByTeamId);

  if (args.isExternal) {
    const externalEventRowId = await resolveExternalEventRowId({
      activityId: args.activityId,
      trainerId: args.trainerId,
      externalEventRowId: args.externalEventRowId,
    });

    if (!externalEventRowId) {
      throw new Error('Kunne ikke finde ekstern aktivitet til hold-fravalg.');
    }

    const { error: rpcError } = await (supabase as any).rpc(
      'sync_external_activity_assignment_team_exclusions',
      {
        p_external_event_id: externalEventRowId,
        p_excluded_player_ids_by_team: exclusionsPayload,
      },
    );

    if (rpcError) {
      if (
        isMissingActivityAssignmentTeamExclusionsTableError(rpcError) ||
        isMissingActivityAssignmentTeamExclusionsRpcError(rpcError)
      ) {
        throw toMissingTeamExclusionsMigrationError();
      }
      throw rpcError;
    }
    return;
  }

  const { error: rpcError } = await (supabase as any).rpc(
    'sync_internal_activity_assignment_team_exclusions',
    {
      p_source_activity_id: args.activityId,
      p_excluded_player_ids_by_team: exclusionsPayload,
    },
  );

  if (rpcError) {
    if (
      isMissingActivityAssignmentTeamExclusionsTableError(rpcError) ||
      isMissingActivityAssignmentTeamExclusionsRpcError(rpcError)
    ) {
      throw toMissingTeamExclusionsMigrationError();
    }
    throw rpcError;
  }
};

const fetchAssignmentRows = async (input: FetchActivityAssignmentsInput): Promise<ActivityAssignmentRow[]> => {
  const activityId = normalizeId(input.activityId);
  const trainerId = normalizeId(input.trainerId);

  if (!activityId || !trainerId) {
    return [];
  }

  if (input.isExternal) {
    const sourceMetaId = normalizeId(input.activityId);
    if (sourceMetaId) {
      const { data: sourceMetaRow, error: sourceMetaError } = await supabase
        .from('events_local_meta')
        .select('id')
        .eq('id', sourceMetaId)
        .eq('user_id', trainerId)
        .maybeSingle();

      if (sourceMetaError) throw sourceMetaError;

      if (sourceMetaRow) {
        const { data, error } = await supabase
          .from('events_local_meta')
          .select('player_id, team_id')
          .eq('source_local_meta_id', sourceMetaId);

        if (error) throw error;
        return toAssignmentRows((data || []) as any[]);
      }
    }

    const externalEventRowId = await resolveExternalEventRowId({
      activityId,
      trainerId,
      externalEventRowId: input.externalEventRowId,
    });

    if (!externalEventRowId) {
      return [];
    }

    const { data, error } = await supabase
      .from('events_local_meta')
      .select('player_id, team_id')
      .eq('external_event_id', externalEventRowId);

    if (error) throw error;
    return toAssignmentRows((data || []) as any[]);
  }

  const { data: sourceRow, error: sourceError } = await supabase
    .from('activities')
    .select('id')
    .eq('id', activityId)
    .eq('user_id', trainerId)
    .eq('is_external', false)
    .maybeSingle();

  if (sourceError) throw sourceError;
  if (!sourceRow) {
    return [];
  }

  const { data, error } = await supabase
    .from('activities')
    .select('player_id, team_id')
    .eq('source_activity_id', activityId)
    .eq('is_external', false);
  if (error) {
    if (isMissingSourceActivityIdColumnError(error)) {
      throw toMissingMigrationError();
    }
    throw error;
  }

  return toAssignmentRows((data || []) as any[]);
};

export type ActivityAssignmentLookup = {
  playerIds: string[];
  teamIds: string[];
};

export type ActivityAssignmentState = ActivityAssignmentLookup & {
  directPlayerIds: string[];
  teamScopeByPlayerId: Record<string, string | null>;
  excludedPlayerIdsByTeamId: Record<string, string[]>;
};

export type FetchActivityAssignmentsInput = {
  activityId: string;
  trainerId: string;
  isExternal: boolean;
  externalEventRowId?: string | null;
};

export type AssignActivityPayload = {
  activityId: string;
  trainerId: string;
  isExternal: boolean;
  externalEventRowId?: string | null;
  categoryId?: string | null;
  intensity?: number | null;
  intensityEnabled?: boolean;
  intensityNote?: string | null;
  playerIds?: string[];
  teamIds?: string[];
  excludedPlayerIdsByTeamId?: Record<string, string[] | null>;
};

export type AssignActivityResult = {
  createdCount: number;
  removedCount: number;
  updatedCount: number;
  skippedPlayerIds: string[];
  skippedTeamIds: string[];
  assignment: ActivityAssignmentLookup;
};

export const activityAssignmentsService = {
  async fetchAssignments(input: FetchActivityAssignmentsInput): Promise<ActivityAssignmentLookup> {
    const rows = await fetchAssignmentRows(input);
    return toAssignmentLookup(rows);
  },

  async fetchAssignmentState(input: FetchActivityAssignmentsInput): Promise<ActivityAssignmentState> {
    const [rows, exclusionRows] = await Promise.all([
      fetchAssignmentRows(input),
      fetchAssignmentExclusionRows(input),
    ]);
    return toAssignmentState(rows, exclusionRows);
  },

  async assignActivity(payload: AssignActivityPayload): Promise<AssignActivityResult> {
    const activityId = normalizeId(payload.activityId);
    const trainerId = normalizeId(payload.trainerId);

    if (!activityId || !trainerId) {
      throw new Error('Mangler aktivitet eller træner. Prøv igen.');
    }

    const assignmentInput = {
      activityId,
      trainerId,
      isExternal: payload.isExternal,
      externalEventRowId: payload.externalEventRowId ?? null,
    };
    const existingState = await this.fetchAssignmentState(assignmentInput);
    const existing = {
      playerIds: existingState.playerIds,
      teamIds: existingState.teamIds,
    };
    const requestedPlayerIds = normalizeIds(payload.playerIds);
    const requestedTeamIdsRaw = normalizeIds(payload.teamIds);
    if (!requestedPlayerIds.length && !requestedTeamIdsRaw.length && !existingState.playerIds.length) {
      throw new Error('Vælg mindst én spiller eller ét hold.');
    }

    const existingPlayerSet = new Set(existingState.playerIds);
    const existingDirectPlayerSet = new Set(existingState.directPlayerIds);
    const existingTeamScopeByPlayerId = existingState.teamScopeByPlayerId;
    const existingExcludedPlayerIdsByTeamId = existingState.excludedPlayerIdsByTeamId;
    const directPlayerSet = new Set(requestedPlayerIds);
    const teamMembersByTeamId = await getTeamMembersByTeamIds(requestedTeamIdsRaw);
    const recipientPlayerSet = new Set<string>(requestedPlayerIds);
    const teamScopeByPlayerId: Record<string, string | null> = {};
    const requestedExcludedPlayerIdsByTeamId = normalizeExcludedPlayerIdsByTeamId(
      payload.excludedPlayerIdsByTeamId,
    );
    const requestedTeamIds: string[] = [];
    const sanitizedExcludedPlayerIdsByTeamId: Record<string, string[]> = {};

    requestedPlayerIds.forEach((playerId) => {
      teamScopeByPlayerId[playerId] = null;
    });

    requestedTeamIdsRaw.forEach((teamId) => {
      const members = teamMembersByTeamId[teamId] || [];
      const teamMemberIds = members.map((playerId) => playerId);
      const excludedPlayerIds = (requestedExcludedPlayerIdsByTeamId[teamId] || []).filter(
        (playerId) => teamMemberIds.includes(playerId) && !directPlayerSet.has(playerId),
      );
      const excludedPlayerSet = new Set(excludedPlayerIds);
      const includedTeamPlayerIds = teamMemberIds.filter(
        (playerId) => !directPlayerSet.has(playerId) && !excludedPlayerSet.has(playerId),
      );

      if (!includedTeamPlayerIds.length) {
        return;
      }

      requestedTeamIds.push(teamId);
      if (excludedPlayerIds.length) {
        sanitizedExcludedPlayerIdsByTeamId[teamId] = excludedPlayerIds;
      }

      members.forEach((playerId) => {
        if (excludedPlayerSet.has(playerId) && !directPlayerSet.has(playerId)) {
          return;
        }
        recipientPlayerSet.add(playerId);
        if (directPlayerSet.has(playerId)) {
          if (!(playerId in teamScopeByPlayerId)) {
            teamScopeByPlayerId[playerId] = null;
          }
          return;
        }
        if (!(playerId in teamScopeByPlayerId)) {
          teamScopeByPlayerId[playerId] = teamId;
        }
      });
    });

    const recipientPlayerIds = Array.from(recipientPlayerSet);
    const playersToProcess = recipientPlayerIds.filter((playerId) => {
      if (!existingPlayerSet.has(playerId)) return true;
      return (existingTeamScopeByPlayerId[playerId] ?? null) !== (teamScopeByPlayerId[playerId] ?? null);
    });
    const playersToRemove = existingState.playerIds.filter((playerId) => !recipientPlayerSet.has(playerId));
    const updatedPlayerIds = playersToProcess.filter((playerId) => existingPlayerSet.has(playerId));

    const exclusionsChanged = !areExcludedPlayerIdsByTeamIdEqual(
      sanitizedExcludedPlayerIdsByTeamId,
      existingExcludedPlayerIdsByTeamId,
    );

    if (!playersToProcess.length && !playersToRemove.length && !exclusionsChanged) {
      return {
        createdCount: 0,
        removedCount: 0,
        updatedCount: 0,
        skippedPlayerIds: requestedPlayerIds.filter((playerId) => existingDirectPlayerSet.has(playerId)),
        skippedTeamIds: requestedTeamIds.filter((teamId) => {
          const members = teamMembersByTeamId[teamId] || [];
          if (!members.length) return true;
          return members.every((memberId) => existingTeamScopeByPlayerId[memberId] === teamId);
        }),
        assignment: existing,
      };
    }

    const teamScopePayload: Record<string, string | null> = {};
    playersToProcess.forEach((playerId) => {
      teamScopePayload[playerId] = teamScopeByPlayerId[playerId] ?? null;
    });

    let insertedPlayerIds: string[] = [];
    let removedPlayerIds: string[] = [];

    if (playersToProcess.length && payload.isExternal) {
      const externalEventRowId = await resolveExternalEventRowId({
        activityId,
        trainerId,
        externalEventRowId: payload.externalEventRowId,
      });

      if (!externalEventRowId) {
        throw new Error('Kunne ikke finde ekstern aktivitet til tildeling.');
      }

      const sourceMetaId = normalizeId(activityId);
      const { data: rpcRows, error: rpcError } = await (supabase as any).rpc(
        'assign_external_activity_to_players',
        {
          p_external_event_id: externalEventRowId,
          p_player_ids: playersToProcess,
          p_team_scope_by_player: teamScopePayload,
          p_source_meta_id: sourceMetaId || null,
          p_category_id: payload.categoryId ?? null,
          p_intensity_enabled: payload.intensityEnabled === true,
        },
      );

      if (rpcError) throw rpcError;

      insertedPlayerIds = (Array.isArray(rpcRows) ? rpcRows : [])
        .map((row: any) => normalizeId(String(row?.player_id ?? '')))
        .filter(Boolean);
    } else if (playersToProcess.length) {
      const { data: rpcRows, error: rpcError } = await (supabase as any).rpc(
        'assign_internal_activity_to_players',
        {
          p_source_activity_id: activityId,
          p_player_ids: playersToProcess,
          p_team_scope_by_player: teamScopePayload,
        },
      );

      if (rpcError) {
        if (isMissingSourceActivityIdColumnError(rpcError)) {
          throw toMissingMigrationError();
        }
        throw rpcError;
      }

      insertedPlayerIds = (Array.isArray(rpcRows) ? rpcRows : [])
        .map((row: any) => normalizeId(String(row?.player_id ?? '')))
        .filter(Boolean);
    }

    if (playersToRemove.length && payload.isExternal) {
      const externalEventRowId = await resolveExternalEventRowId({
        activityId,
        trainerId,
        externalEventRowId: payload.externalEventRowId,
      });

      if (!externalEventRowId) {
        throw new Error('Kunne ikke finde ekstern aktivitet til fjernelse.');
      }

      const sourceMetaId = normalizeId(activityId);
      const { data: rpcRows, error: rpcError } = await (supabase as any).rpc(
        'remove_external_activity_assignments',
        {
          p_external_event_id: externalEventRowId,
          p_player_ids: playersToRemove,
          p_source_meta_id: sourceMetaId || null,
        },
      );

      if (rpcError) throw rpcError;

      removedPlayerIds = (Array.isArray(rpcRows) ? rpcRows : [])
        .map((row: any) => normalizeId(String(row?.player_id ?? '')))
        .filter(Boolean);
    } else if (playersToRemove.length) {
      const { data: rpcRows, error: rpcError } = await (supabase as any).rpc(
        'remove_internal_activity_assignments',
        {
          p_source_activity_id: activityId,
          p_player_ids: playersToRemove,
        },
      );

      if (rpcError) {
        if (isMissingSourceActivityIdColumnError(rpcError)) {
          throw toMissingMigrationError();
        }
        throw rpcError;
      }

      removedPlayerIds = (Array.isArray(rpcRows) ? rpcRows : [])
        .map((row: any) => normalizeId(String(row?.player_id ?? '')))
        .filter(Boolean);
    }

    if (exclusionsChanged) {
      await syncAssignmentExclusions({
        activityId,
        trainerId,
        isExternal: payload.isExternal,
        externalEventRowId: payload.externalEventRowId ?? null,
        excludedPlayerIdsByTeamId: sanitizedExcludedPlayerIdsByTeamId,
      });
    }

    const assignment = await this.fetchAssignments(assignmentInput);
    const skippedTeams = requestedTeamIds.filter((teamId) => {
      const members = teamMembersByTeamId[teamId] || [];
      const excludedPlayerSet = new Set(sanitizedExcludedPlayerIdsByTeamId[teamId] || []);
      const existingExcludedPlayerSet = new Set(existingExcludedPlayerIdsByTeamId[teamId] || []);
      const includedMembers = members.filter(
        (memberId) => !directPlayerSet.has(memberId) && !excludedPlayerSet.has(memberId),
      );
      if (!includedMembers.length) return true;
      if (excludedPlayerSet.size !== existingExcludedPlayerSet.size) return false;
      if (Array.from(excludedPlayerSet).some((memberId) => !existingExcludedPlayerSet.has(memberId))) {
        return false;
      }
      return includedMembers.every((memberId) => existingTeamScopeByPlayerId[memberId] === teamId);
    });

    return {
      createdCount: insertedPlayerIds.length,
      removedCount: removedPlayerIds.length,
      updatedCount: updatedPlayerIds.length,
      skippedPlayerIds: requestedPlayerIds.filter(
        (playerId) =>
          existingDirectPlayerSet.has(playerId) &&
          (existingTeamScopeByPlayerId[playerId] ?? null) === (teamScopeByPlayerId[playerId] ?? null),
      ),
      skippedTeamIds: skippedTeams,
      assignment,
    };
  },
};
