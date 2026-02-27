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

export type UnassignExercisePayload = {
  exerciseId: string;
  trainerId: string;
  playerId?: string | null;
  teamId?: string | null;
};

export type AssignmentTemplateState = {
  taskTemplateId: string;
  archived: boolean;
};

export const exerciseAssignmentsService = {
  async upsertAssignedTaskTemplates(
    exerciseId: string,
    trainerId: string,
    playerIds: string[],
    teamIds: string[]
  ): Promise<void> {
    if (!exerciseId || !trainerId) return;
    if (!playerIds.length && !teamIds.length) return;

    const { data: exerciseRow, error: exerciseError } = await supabase
      .from('exercise_library')
      .select('id, title, description, video_url, trainer_id, is_system')
      .eq('id', exerciseId)
      .maybeSingle();

    if (exerciseError) {
      throw exerciseError;
    }
    if (!exerciseRow) {
      throw new Error('Kunne ikke finde øvelsen, der skulle tildeles.');
    }

    const sourceFolder = 'Fra træner';

    const basePayload = {
      user_id: trainerId,
      title: exerciseRow.title,
      description: exerciseRow.description ?? '',
      video_url: exerciseRow.video_url ?? null,
      source_folder: sourceFolder,
      library_exercise_id: exerciseId,
      after_training_enabled: false,
      after_training_delay_minutes: null,
      after_training_feedback_enable_score: true,
      after_training_feedback_score_explanation: null,
      after_training_feedback_enable_intensity: true,
      after_training_feedback_enable_note: true,
    };

    const rows: any[] = [];
    const scopeKeys = new Set<string>();
    playerIds.forEach(playerId => {
      scopeKeys.add(`player:${playerId}`);
      rows.push({ ...basePayload, player_id: playerId, team_id: null });
    });
    teamIds.forEach(teamId => {
      scopeKeys.add(`team:${teamId}`);
      rows.push({ ...basePayload, player_id: null, team_id: teamId });
    });

    const { data: existingRows, error: existingError } = await supabase
      .from('task_templates')
      .select('id, player_id, team_id')
      .eq('user_id', trainerId)
      .eq('library_exercise_id', exerciseId);

    if (existingError) {
      throw existingError;
    }

    const existingScopeKeys = new Set<string>();
    (existingRows || []).forEach((row: any) => {
      const playerId = String(row?.player_id ?? '').trim();
      const teamId = String(row?.team_id ?? '').trim();
      if (playerId) existingScopeKeys.add(`player:${playerId}`);
      if (teamId) existingScopeKeys.add(`team:${teamId}`);
    });

    const rowsToInsert = rows.filter((row) => {
      const key = row.player_id ? `player:${String(row.player_id)}` : `team:${String(row.team_id)}`;
      return scopeKeys.has(key) && !existingScopeKeys.has(key);
    });

    if (!rowsToInsert.length) {
      return;
    }

    const { error: templateInsertError } = await supabase
      .from('task_templates')
      .insert(rowsToInsert);

    if (templateInsertError) {
      throw templateInsertError;
    }
  },

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
      await this.upsertAssignedTaskTemplates(exerciseId, trainerId, requestedPlayerIds, requestedTeamIds);
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

    await this.upsertAssignedTaskTemplates(exerciseId, trainerId, requestedPlayerIds, requestedTeamIds);

    return {
      createdCount: rows.length,
      skippedPlayerIds: requestedPlayerIds.filter(id => existingPlayerSet.has(id)),
      skippedTeamIds: requestedTeamIds.filter(id => existingTeamSet.has(id)),
    };
  },

  async unassignExercise(payload: UnassignExercisePayload): Promise<void> {
    const exerciseId = String(payload.exerciseId ?? '').trim();
    const trainerId = String(payload.trainerId ?? '').trim();
    const playerId = String(payload.playerId ?? '').trim();
    const teamId = String(payload.teamId ?? '').trim();

    if (!exerciseId || !trainerId) {
      throw new Error('Mangler øvelse eller træner.');
    }
    if (!playerId && !teamId) {
      throw new Error('Mangler modtager for fjernelse.');
    }

    let assignmentDeleteQuery = supabase
      .from('exercise_assignments')
      .delete()
      .eq('exercise_id', exerciseId)
      .eq('trainer_id', trainerId);

    assignmentDeleteQuery = playerId
      ? assignmentDeleteQuery.eq('player_id', playerId).is('team_id', null)
      : assignmentDeleteQuery.eq('team_id', teamId).is('player_id', null);

    const { error: assignmentDeleteError } = await assignmentDeleteQuery;
    if (assignmentDeleteError) {
      throw assignmentDeleteError;
    }

    let templateDeleteQuery = supabase
      .from('task_templates')
      .delete()
      .eq('user_id', trainerId)
      .eq('library_exercise_id', exerciseId);

    templateDeleteQuery = playerId
      ? templateDeleteQuery.eq('player_id', playerId).is('team_id', null)
      : templateDeleteQuery.eq('team_id', teamId).is('player_id', null);

    const { error: templateDeleteError } = await templateDeleteQuery;
    if (templateDeleteError) {
      throw templateDeleteError;
    }

    // Legacy fallback:
    // Older assigned task_templates may have library_exercise_id = null.
    // Match those by exercise content + recipient scope and remove through
    // the actor RPC so cleanup stays consistent with shared-state semantics.
    const { data: exerciseRow, error: exerciseLookupError } = await supabase
      .from('exercise_library')
      .select('title, description, video_url')
      .eq('id', exerciseId)
      .maybeSingle();

    if (exerciseLookupError) {
      throw exerciseLookupError;
    }

    if (!exerciseRow) {
      return;
    }

    let legacyTemplateQuery = supabase
      .from('task_templates')
      .select('id')
      .eq('user_id', trainerId)
      .is('library_exercise_id', null)
      .eq('source_folder', 'Fra træner')
      .eq('title', String(exerciseRow.title ?? ''))
      .eq('description', String(exerciseRow.description ?? ''));

    legacyTemplateQuery =
      exerciseRow.video_url === null
        ? legacyTemplateQuery.is('video_url', null)
        : legacyTemplateQuery.eq('video_url', String(exerciseRow.video_url));

    legacyTemplateQuery = playerId
      ? legacyTemplateQuery.eq('player_id', playerId).is('team_id', null)
      : legacyTemplateQuery.eq('team_id', teamId).is('player_id', null);

    const { data: legacyTemplates, error: legacyTemplateLookupError } = await legacyTemplateQuery;
    if (legacyTemplateLookupError) {
      throw legacyTemplateLookupError;
    }

    const legacyTemplateIds = (legacyTemplates || [])
      .map((row: any) => String(row?.id ?? '').trim())
      .filter(Boolean);

    for (const legacyTemplateId of legacyTemplateIds) {
      const { data: removed, error: removeError } = await (supabase as any).rpc(
        'remove_task_template_for_actor',
        { p_task_id: legacyTemplateId },
      );
      if (removeError) {
        throw removeError;
      }
      if (removed !== true) {
        throw new Error('Kunne ikke fjerne legacy opgaveskabelon for modtageren.');
      }
    }
  },

  async fetchAssignmentTemplateStates(
    exerciseId: string,
    trainerId: string,
  ): Promise<Record<string, AssignmentTemplateState>> {
    if (!exerciseId || !trainerId) {
      return {};
    }

    const { data, error } = await supabase
      .from('task_templates')
      .select('id, player_id, team_id, archived_at')
      .eq('user_id', trainerId)
      .eq('library_exercise_id', exerciseId);

    if (error) {
      throw error;
    }

    const states: Record<string, AssignmentTemplateState> = {};
    (data || []).forEach((row: any) => {
      const playerId = String(row?.player_id ?? '').trim();
      const teamId = String(row?.team_id ?? '').trim();
      const taskTemplateId = String(row?.id ?? '').trim();
      if (!taskTemplateId) return;
      const archived = typeof row?.archived_at === 'string' && row.archived_at.trim().length > 0;
      if (playerId) {
        states[`player:${playerId}`] = { taskTemplateId, archived };
      }
      if (teamId) {
        states[`team:${teamId}`] = { taskTemplateId, archived };
      }
    });

    return states;
  },
};
