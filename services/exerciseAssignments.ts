import { supabase } from '@/integrations/supabase/client';

const normalizeIds = (ids?: string[] | null) => {
  if (!Array.isArray(ids)) return [];
  const set = new Set<string>();
  ids.forEach(value => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed) set.add(trimmed);
  });
  return Array.from(set);
};

export type AssignmentLookup = {
  playerIds: string[];
  teamIds: string[];
};

export type AssignExercisePayload = {
  exerciseId: string;
  trainerId: string;
  playerIds?: string[];
  teamIds?: string[];
};

export type AssignExerciseResult = {
  createdCount: number;
  skippedPlayerIds: string[];
  skippedTeamIds: string[];
};

export const exerciseAssignmentsService = {
  async fetchAssignments(exerciseId: string, trainerId: string): Promise<AssignmentLookup> {
    if (!exerciseId || !trainerId) {
      return { playerIds: [], teamIds: [] };
    }

    const { data, error } = await supabase
      .from('exercise_assignments')
      .select('player_id, team_id')
      .eq('exercise_id', exerciseId)
      .eq('trainer_id', trainerId);

    if (error) {
      throw error;
    }

    const players = new Set<string>();
    const teams = new Set<string>();

    (data || []).forEach(row => {
      const playerId = row.player_id ? String(row.player_id) : null;
      const teamId = row.team_id ? String(row.team_id) : null;
      if (playerId) players.add(playerId);
      if (teamId) teams.add(teamId);
    });

    return {
      playerIds: Array.from(players),
      teamIds: Array.from(teams),
    };
  },

  async assignExercise(payload: AssignExercisePayload): Promise<AssignExerciseResult> {
    const exerciseId = payload.exerciseId?.trim();
    const trainerId = payload.trainerId?.trim();

    if (!exerciseId || !trainerId) {
      throw new Error('Mangler øvelse eller træner. Prøv igen.');
    }

    const requestedPlayerIds = normalizeIds(payload.playerIds);
    const requestedTeamIds = normalizeIds(payload.teamIds);

    if (!requestedPlayerIds.length && !requestedTeamIds.length) {
      throw new Error('Vælg mindst én spiller eller ét hold.');
    }

    const { playerIds: existingPlayerIds, teamIds: existingTeamIds } = await this.fetchAssignments(exerciseId, trainerId);
    const existingPlayerSet = new Set(existingPlayerIds);
    const existingTeamSet = new Set(existingTeamIds);

    const playersToInsert = requestedPlayerIds.filter(id => !existingPlayerSet.has(id));
    const teamsToInsert = requestedTeamIds.filter(id => !existingTeamSet.has(id));

    const rows: { exercise_id: string; trainer_id: string; player_id?: string | null; team_id?: string | null }[] = [];

    playersToInsert.forEach(playerId => {
      rows.push({ exercise_id: exerciseId, trainer_id: trainerId, player_id: playerId, team_id: null });
    });

    teamsToInsert.forEach(teamId => {
      rows.push({ exercise_id: exerciseId, trainer_id: trainerId, player_id: null, team_id: teamId });
    });

    if (!rows.length) {
      return {
        createdCount: 0,
        skippedPlayerIds: requestedPlayerIds,
        skippedTeamIds: requestedTeamIds,
      };
    }

    const { error } = await supabase
      .from('exercise_assignments')
      .insert(rows)
      .select('id');

    if (error) {
      throw error;
    }

    return {
      createdCount: rows.length,
      skippedPlayerIds: requestedPlayerIds.filter(id => existingPlayerSet.has(id)),
      skippedTeamIds: requestedTeamIds.filter(id => existingTeamSet.has(id)),
    };
  },
};
