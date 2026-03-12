import { supabase } from '@/integrations/supabase/client';
import {
  fetchSelfFeedbackForTemplates,
  mapFeedbackRow,
} from '@/services/feedbackService';
import { exerciseAssignmentsService } from '@/services/exerciseAssignments';
import { activityAssignmentsService } from '@/services/activityAssignments';

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

const supabaseFromMock = supabase.from as jest.Mock;
const supabaseRpcMock = (supabase as any).rpc as jest.Mock;

describe('supabase row transforms', () => {
  beforeEach(() => {
    supabaseFromMock.mockReset();
    supabaseRpcMock.mockReset();
  });

  it('maps task_template_self_feedback row to view model', () => {
    const mapped = mapFeedbackRow({
      id: 'fb1',
      user_id: 'u1',
      task_template_id: 'tt1',
      task_instance_id: null,
      activity_id: 'a1',
      rating: 4,
      note: 'solid',
      created_at: '2026-01-01T10:00:00.000Z',
      updated_at: '2026-01-01T10:01:00.000Z',
    });

    expect(mapped).toEqual({
      id: 'fb1',
      userId: 'u1',
      taskTemplateId: 'tt1',
      taskInstanceId: null,
      activityId: 'a1',
      rating: 4,
      note: 'solid',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:01:00.000Z',
    });
  });

  it('returns empty list for feedback template fetch when user or templates are missing', async () => {
    await expect(fetchSelfFeedbackForTemplates('', ['t1'])).resolves.toEqual([]);
    await expect(fetchSelfFeedbackForTemplates('u1', [])).resolves.toEqual([]);
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it('maps fetched feedback rows through the transform', async () => {
    const order = jest.fn().mockResolvedValue({
      data: [
        {
          id: 'fb2',
          user_id: 'u1',
          task_template_id: 'tt2',
          task_instance_id: 'inst2',
          activity_id: 'a2',
          rating: 3,
          note: null,
          created_at: '2026-01-03T10:00:00.000Z',
          updated_at: '2026-01-03T10:01:00.000Z',
        },
      ],
      error: null,
    });
    const inFn = jest.fn().mockReturnValue({ order });
    const eqFn = jest.fn().mockReturnValue({ in: inFn });
    const select = jest.fn().mockReturnValue({ eq: eqFn });
    supabaseFromMock.mockReturnValue({ select });

    const result = await fetchSelfFeedbackForTemplates('u1', [' tt2 ']);

    expect(result).toEqual([
      {
        id: 'fb2',
        userId: 'u1',
        taskTemplateId: 'tt2',
        taskInstanceId: 'inst2',
        activityId: 'a2',
        rating: 3,
        note: null,
        createdAt: '2026-01-03T10:00:00.000Z',
        updatedAt: '2026-01-03T10:01:00.000Z',
      },
    ]);
  });

  it('transforms exercise assignment rows into unique player/team id lists', async () => {
    const eqTrainer = jest.fn().mockResolvedValue({
      data: [
        { player_id: 'p1', team_id: null },
        { player_id: 'p1', team_id: null },
        { player_id: null, team_id: 101 },
        { player_id: 'p2', team_id: 101 },
      ],
      error: null,
    });
    const eqExercise = jest.fn().mockReturnValue({ eq: eqTrainer });
    const select = jest.fn().mockReturnValue({ eq: eqExercise });
    supabaseFromMock.mockReturnValue({ select });

    const result = await exerciseAssignmentsService.fetchAssignments('exercise-1', 'trainer-1');

    expect(result.playerIds).toEqual(['p1', 'p2']);
    expect(result.teamIds).toEqual(['101']);
  });

  it('returns empty assignment lists when ids are missing', async () => {
    await expect(
      exerciseAssignmentsService.fetchAssignments('', 'trainer-1')
    ).resolves.toEqual({ playerIds: [], teamIds: [] });
    await expect(
      exerciseAssignmentsService.fetchAssignments('exercise-1', '')
    ).resolves.toEqual({ playerIds: [], teamIds: [] });
    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it('transforms external activity assignment rows into unique player/team id lists', async () => {
    const sourceMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'meta-1' },
      error: null,
    });
    const sourceEqTrainer = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingle });
    const sourceEqActivity = jest.fn().mockReturnValue({ eq: sourceEqTrainer });
    const sourceSelect = jest.fn().mockReturnValue({ eq: sourceEqActivity });

    const eqSourceMeta = jest.fn().mockResolvedValue({
      data: [
        { player_id: 'p1', team_id: null },
        { player_id: 'p1', team_id: null },
        { player_id: null, team_id: 't1' },
      ],
      error: null,
    });
    const select = jest.fn().mockReturnValue({ eq: eqSourceMeta });
    supabaseFromMock
      .mockReturnValueOnce({ select: sourceSelect })
      .mockReturnValueOnce({ select });

    const result = await activityAssignmentsService.fetchAssignments({
      activityId: 'meta-1',
      trainerId: 'trainer-1',
      isExternal: true,
      externalEventRowId: 'external-row-1',
    });

    expect(sourceSelect).toHaveBeenCalledWith('id');
    expect(sourceEqActivity).toHaveBeenCalledWith('id', 'meta-1');
    expect(sourceEqTrainer).toHaveBeenCalledWith('user_id', 'trainer-1');
    expect(select).toHaveBeenCalledWith('player_id, team_id');
    expect(eqSourceMeta).toHaveBeenCalledWith('source_local_meta_id', 'meta-1');
    expect(result.playerIds).toEqual(['p1']);
    expect(result.teamIds).toEqual(['t1']);
  });

  it('returns direct player ids separately when fetching activity assignment state', async () => {
    const sourceMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'activity-1' },
      error: null,
    });
    const sourceEqExternal = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingle });
    const sourceEqTrainer = jest.fn().mockReturnValue({ eq: sourceEqExternal });
    const sourceEqActivity = jest.fn().mockReturnValue({ eq: sourceEqTrainer });
    const sourceSelect = jest.fn().mockReturnValue({ eq: sourceEqActivity });

    const exclusionsEqSource = jest.fn().mockResolvedValue({
      data: [{ player_id: 'player-team-excluded', team_id: 'team-1' }],
      error: null,
    });
    const exclusionsSelect = jest.fn().mockReturnValue({ eq: exclusionsEqSource });

    const assignmentsEqExternal = jest.fn().mockResolvedValue({
      data: [
        { player_id: 'player-direct', team_id: null },
        { player_id: 'player-team', team_id: 'team-1' },
      ],
      error: null,
    });
    const assignmentsEqSource = jest.fn().mockReturnValue({ eq: assignmentsEqExternal });
    const assignmentsSelect = jest.fn().mockReturnValue({ eq: assignmentsEqSource });

    supabaseFromMock
      .mockReturnValueOnce({ select: sourceSelect })
      .mockReturnValueOnce({ select: exclusionsSelect })
      .mockReturnValueOnce({ select: assignmentsSelect });

    const result = await activityAssignmentsService.fetchAssignmentState({
      activityId: 'activity-1',
      trainerId: 'trainer-1',
      isExternal: false,
    });

    expect(result.playerIds).toEqual(['player-direct', 'player-team']);
    expect(result.teamIds).toEqual(['team-1']);
    expect(result.directPlayerIds).toEqual(['player-direct']);
    expect(result.teamScopeByPlayerId).toEqual({
      'player-direct': null,
      'player-team': 'team-1',
    });
    expect(result.excludedPlayerIdsByTeamId).toEqual({
      'team-1': ['player-team-excluded'],
    });
  });

  it('falls back to empty exclusions when the exclusions table is missing from schema cache', async () => {
    const sourceMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'activity-1' },
      error: null,
    });
    const sourceEqExternal = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingle });
    const sourceEqTrainer = jest.fn().mockReturnValue({ eq: sourceEqExternal });
    const sourceEqActivity = jest.fn().mockReturnValue({ eq: sourceEqTrainer });
    const sourceSelect = jest.fn().mockReturnValue({ eq: sourceEqActivity });

    const assignmentsEqExternal = jest.fn().mockResolvedValue({
      data: [{ player_id: 'player-direct', team_id: null }],
      error: null,
    });
    const assignmentsEqSource = jest.fn().mockReturnValue({ eq: assignmentsEqExternal });
    const assignmentsSelect = jest.fn().mockReturnValue({ eq: assignmentsEqSource });

    const exclusionsEqSource = jest.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST205',
        message: "Could not find the table 'public.activity_assignment_team_exclusions' in the schema cache",
      },
    });
    const exclusionsSelect = jest.fn().mockReturnValue({ eq: exclusionsEqSource });

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'activities') {
        if (sourceSelect.mock.calls.length === 0) {
          return { select: sourceSelect };
        }
        return { select: assignmentsSelect };
      }
      if (table === 'activity_assignment_team_exclusions') {
        return { select: exclusionsSelect };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const result = await activityAssignmentsService.fetchAssignmentState({
      activityId: 'activity-1',
      trainerId: 'trainer-1',
      isExternal: false,
    });

    expect(result.playerIds).toEqual(['player-direct']);
    expect(result.teamIds).toEqual([]);
    expect(result.excludedPlayerIdsByTeamId).toEqual({});
  });

  it('transforms internal activity assignments via source_activity_id relation', async () => {
    const sourceMaybeSingle = jest.fn().mockResolvedValue({
      data: { id: 'activity-1' },
      error: null,
    });
    const sourceEqExternal = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingle });
    const sourceEqTrainer = jest.fn().mockReturnValue({ eq: sourceEqExternal });
    const sourceEqActivity = jest.fn().mockReturnValue({ eq: sourceEqTrainer });
    const sourceSelect = jest.fn().mockReturnValue({ eq: sourceEqActivity });

    const assignmentsEqExternal = jest.fn().mockResolvedValue({
      data: [
        { player_id: 'p1', team_id: null },
        { player_id: 'p1', team_id: null },
        { player_id: null, team_id: 't1' },
      ],
      error: null,
    });
    const assignmentsEqSource = jest.fn().mockReturnValue({ eq: assignmentsEqExternal });
    const assignmentsSelect = jest.fn().mockReturnValue({ eq: assignmentsEqSource });

    supabaseFromMock
      .mockReturnValueOnce({ select: sourceSelect })
      .mockReturnValueOnce({ select: assignmentsSelect });

    const result = await activityAssignmentsService.fetchAssignments({
      activityId: 'activity-1',
      trainerId: 'trainer-1',
      isExternal: false,
    });

    expect(sourceSelect).toHaveBeenCalledWith('id');
    expect(sourceEqActivity).toHaveBeenCalledWith('id', 'activity-1');
    expect(sourceEqTrainer).toHaveBeenCalledWith('user_id', 'trainer-1');
    expect(sourceEqExternal).toHaveBeenCalledWith('is_external', false);
    expect(assignmentsSelect).toHaveBeenCalledWith('player_id, team_id');
    expect(assignmentsEqSource).toHaveBeenCalledWith('source_activity_id', 'activity-1');
    expect(assignmentsEqExternal).toHaveBeenCalledWith('is_external', false);
    expect(sourceSelect).not.toHaveBeenCalledWith(
      expect.stringContaining('title, activity_date, activity_time'),
    );
    expect(result.playerIds).toEqual(['p1']);
    expect(result.teamIds).toEqual(['t1']);
  });

  it('returns empty activity assignment lists when ids are missing', async () => {
    await expect(
      activityAssignmentsService.fetchAssignments({
        activityId: '',
        trainerId: 'trainer-1',
        isExternal: false,
      }),
    ).resolves.toEqual({ playerIds: [], teamIds: [] });

    await expect(
      activityAssignmentsService.fetchAssignments({
        activityId: 'activity-1',
        trainerId: '',
        isExternal: false,
      }),
    ).resolves.toEqual({ playerIds: [], teamIds: [] });

    expect(supabaseFromMock).not.toHaveBeenCalled();
  });

  it('assigns internal activity only for recipients not already assigned', async () => {
    const sourceMaybeSingleInitial = jest.fn().mockResolvedValue({
      data: { id: 'activity-1' },
      error: null,
    });
    const sourceEqExternalInitial = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleInitial });
    const sourceEqTrainerInitial = jest.fn().mockReturnValue({ eq: sourceEqExternalInitial });
    const sourceEqActivityInitial = jest.fn().mockReturnValue({ eq: sourceEqTrainerInitial });
    const sourceSelectInitial = jest.fn().mockReturnValue({ eq: sourceEqActivityInitial });

    const exclusionsEqInitial = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const exclusionsSelectInitial = jest.fn().mockReturnValue({ eq: exclusionsEqInitial });

    const assignmentsEqExternalInitial = jest.fn().mockResolvedValue({
      data: [{ player_id: 'player-existing', team_id: null }],
      error: null,
    });
    const assignmentsEqSourceInitial = jest.fn().mockReturnValue({ eq: assignmentsEqExternalInitial });
    const assignmentsSelectInitial = jest.fn().mockReturnValue({ eq: assignmentsEqSourceInitial });

    const sourceMaybeSingleFinal = jest.fn().mockResolvedValue({
      data: { id: 'activity-1' },
      error: null,
    });
    const sourceEqExternalFinal = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleFinal });
    const sourceEqTrainerFinal = jest.fn().mockReturnValue({ eq: sourceEqExternalFinal });
    const sourceEqActivityFinal = jest.fn().mockReturnValue({ eq: sourceEqTrainerFinal });
    const sourceSelectFinal = jest.fn().mockReturnValue({ eq: sourceEqActivityFinal });

    const assignmentsEqExternalFinal = jest.fn().mockResolvedValue({
      data: [
        { player_id: 'player-existing', team_id: null },
        { player_id: 'player-new', team_id: null },
      ],
      error: null,
    });
    const assignmentsEqSourceFinal = jest.fn().mockReturnValue({ eq: assignmentsEqExternalFinal });
    const assignmentsSelectFinal = jest.fn().mockReturnValue({ eq: assignmentsEqSourceFinal });

    supabaseFromMock
      .mockReturnValueOnce({ select: sourceSelectInitial })
      .mockReturnValueOnce({ select: exclusionsSelectInitial })
      .mockReturnValueOnce({ select: assignmentsSelectInitial })
      .mockReturnValueOnce({ select: sourceSelectFinal })
      .mockReturnValueOnce({ select: assignmentsSelectFinal });

    supabaseRpcMock.mockResolvedValue({
      data: [{ player_id: 'player-new' }],
      error: null,
    });

    const result = await activityAssignmentsService.assignActivity({
      activityId: 'activity-1',
      trainerId: 'trainer-1',
      isExternal: false,
      playerIds: ['player-existing', 'player-new'],
      teamIds: [],
    });

    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'assign_internal_activity_to_players',
      expect.objectContaining({
        p_source_activity_id: 'activity-1',
        p_player_ids: ['player-new'],
      }),
    );
    expect(result.createdCount).toBe(1);
    expect(result.removedCount).toBe(0);
    expect(result.updatedCount).toBe(0);
    expect(result.skippedPlayerIds).toEqual(['player-existing']);
    expect(result.assignment.playerIds).toEqual(['player-existing', 'player-new']);
    expect(result.assignment.teamIds).toEqual([]);
  });

  it('delegates internal activity task copying to assignment rpc', async () => {
    const sourceMaybeSingleInitial = jest.fn().mockResolvedValue({
      data: { id: 'activity-source' },
      error: null,
    });
    const sourceEqExternalInitial = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleInitial });
    const sourceEqTrainerInitial = jest.fn().mockReturnValue({ eq: sourceEqExternalInitial });
    const sourceEqActivityInitial = jest.fn().mockReturnValue({ eq: sourceEqTrainerInitial });
    const sourceSelectInitial = jest.fn().mockReturnValue({ eq: sourceEqActivityInitial });

    const exclusionsEqInitial = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const exclusionsSelectInitial = jest.fn().mockReturnValue({ eq: exclusionsEqInitial });

    const assignmentsEqExternalInitial = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const assignmentsEqSourceInitial = jest.fn().mockReturnValue({ eq: assignmentsEqExternalInitial });
    const assignmentsSelectInitial = jest.fn().mockReturnValue({ eq: assignmentsEqSourceInitial });

    const sourceMaybeSingleFinal = jest.fn().mockResolvedValue({
      data: { id: 'activity-source' },
      error: null,
    });
    const sourceEqExternalFinal = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleFinal });
    const sourceEqTrainerFinal = jest.fn().mockReturnValue({ eq: sourceEqExternalFinal });
    const sourceEqActivityFinal = jest.fn().mockReturnValue({ eq: sourceEqTrainerFinal });
    const sourceSelectFinal = jest.fn().mockReturnValue({ eq: sourceEqActivityFinal });

    const assignmentsEqExternalFinal = jest.fn().mockResolvedValue({
      data: [{ player_id: 'player-1', team_id: null }],
      error: null,
    });
    const assignmentsEqSourceFinal = jest.fn().mockReturnValue({ eq: assignmentsEqExternalFinal });
    const assignmentsSelectFinal = jest.fn().mockReturnValue({ eq: assignmentsEqSourceFinal });

    supabaseFromMock
      .mockReturnValueOnce({ select: sourceSelectInitial })
      .mockReturnValueOnce({ select: exclusionsSelectInitial })
      .mockReturnValueOnce({ select: assignmentsSelectInitial })
      .mockReturnValueOnce({ select: sourceSelectFinal })
      .mockReturnValueOnce({ select: assignmentsSelectFinal });

    supabaseRpcMock.mockResolvedValue({
      data: [{ player_id: 'player-1' }],
      error: null,
    });

    await activityAssignmentsService.assignActivity({
      activityId: 'activity-source',
      trainerId: 'trainer-1',
      isExternal: false,
      playerIds: ['player-1'],
      teamIds: [],
    });

    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'assign_internal_activity_to_players',
      expect.objectContaining({
        p_source_activity_id: 'activity-source',
        p_player_ids: ['player-1'],
      }),
    );
  });

  it('updates existing internal player copy with team scope when team is assigned later', async () => {
    const sourceMaybeSingleInitial = jest.fn().mockResolvedValue({
      data: { id: 'activity-source' },
      error: null,
    });
    const sourceEqExternalInitial = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleInitial });
    const sourceEqTrainerInitial = jest.fn().mockReturnValue({ eq: sourceEqExternalInitial });
    const sourceEqActivityInitial = jest.fn().mockReturnValue({ eq: sourceEqTrainerInitial });
    const sourceSelectInitial = jest.fn().mockReturnValue({ eq: sourceEqActivityInitial });

    const exclusionsEqInitial = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const exclusionsSelectInitial = jest.fn().mockReturnValue({ eq: exclusionsEqInitial });

    const assignmentsEqExternalInitial = jest.fn().mockResolvedValue({
      data: [{ player_id: 'player-1', team_id: null }],
      error: null,
    });
    const assignmentsEqSourceInitial = jest.fn().mockReturnValue({ eq: assignmentsEqExternalInitial });
    const assignmentsSelectInitial = jest.fn().mockReturnValue({ eq: assignmentsEqSourceInitial });

    const teamMembersIn = jest.fn().mockResolvedValue({
      data: [{ team_id: 'team-1', player_id: 'player-1' }],
      error: null,
    });
    const teamMembersSelect = jest.fn().mockReturnValue({ in: teamMembersIn });

    const sourceMaybeSingleFinal = jest.fn().mockResolvedValue({
      data: { id: 'activity-source' },
      error: null,
    });
    const sourceEqExternalFinal = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleFinal });
    const sourceEqTrainerFinal = jest.fn().mockReturnValue({ eq: sourceEqExternalFinal });
    const sourceEqActivityFinal = jest.fn().mockReturnValue({ eq: sourceEqTrainerFinal });
    const sourceSelectFinal = jest.fn().mockReturnValue({ eq: sourceEqActivityFinal });

    const assignmentsEqExternalFinal = jest.fn().mockResolvedValue({
      data: [{ player_id: 'player-1', team_id: 'team-1' }],
      error: null,
    });
    const assignmentsEqSourceFinal = jest.fn().mockReturnValue({ eq: assignmentsEqExternalFinal });
    const assignmentsSelectFinal = jest.fn().mockReturnValue({ eq: assignmentsEqSourceFinal });

    supabaseFromMock
      .mockReturnValueOnce({ select: sourceSelectInitial })
      .mockReturnValueOnce({ select: exclusionsSelectInitial })
      .mockReturnValueOnce({ select: assignmentsSelectInitial })
      .mockReturnValueOnce({ select: teamMembersSelect })
      .mockReturnValueOnce({ select: sourceSelectFinal })
      .mockReturnValueOnce({ select: assignmentsSelectFinal });

    supabaseRpcMock.mockResolvedValue({
      data: [],
      error: null,
    });

    const result = await activityAssignmentsService.assignActivity({
      activityId: 'activity-source',
      trainerId: 'trainer-1',
      isExternal: false,
      playerIds: [],
      teamIds: ['team-1'],
    });

    expect(teamMembersIn).toHaveBeenCalledWith('team_id', ['team-1']);
    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'assign_internal_activity_to_players',
      expect.objectContaining({
        p_source_activity_id: 'activity-source',
        p_player_ids: ['player-1'],
        p_team_scope_by_player: { 'player-1': 'team-1' },
      }),
    );
    expect(result.createdCount).toBe(0);
    expect(result.removedCount).toBe(0);
    expect(result.updatedCount).toBe(1);
    expect(result.skippedTeamIds).toEqual([]);
    expect(result.assignment.playerIds).toEqual(['player-1']);
    expect(result.assignment.teamIds).toEqual(['team-1']);
  });

  it('removes internal activity copies for players no longer selected', async () => {
    const sourceMaybeSingleInitial = jest.fn().mockResolvedValue({
      data: { id: 'activity-remove-1' },
      error: null,
    });
    const sourceEqExternalInitial = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleInitial });
    const sourceEqTrainerInitial = jest.fn().mockReturnValue({ eq: sourceEqExternalInitial });
    const sourceEqActivityInitial = jest.fn().mockReturnValue({ eq: sourceEqTrainerInitial });
    const sourceSelectInitial = jest.fn().mockReturnValue({ eq: sourceEqActivityInitial });

    const exclusionsEqInitial = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const exclusionsSelectInitial = jest.fn().mockReturnValue({ eq: exclusionsEqInitial });

    const assignmentsEqExternalInitial = jest.fn().mockResolvedValue({
      data: [{ player_id: 'player-1', team_id: null }],
      error: null,
    });
    const assignmentsEqSourceInitial = jest.fn().mockReturnValue({ eq: assignmentsEqExternalInitial });
    const assignmentsSelectInitial = jest.fn().mockReturnValue({ eq: assignmentsEqSourceInitial });

    const sourceMaybeSingleFinal = jest.fn().mockResolvedValue({
      data: { id: 'activity-remove-1' },
      error: null,
    });
    const sourceEqExternalFinal = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleFinal });
    const sourceEqTrainerFinal = jest.fn().mockReturnValue({ eq: sourceEqExternalFinal });
    const sourceEqActivityFinal = jest.fn().mockReturnValue({ eq: sourceEqTrainerFinal });
    const sourceSelectFinal = jest.fn().mockReturnValue({ eq: sourceEqActivityFinal });

    const assignmentsEqExternalFinal = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const assignmentsEqSourceFinal = jest.fn().mockReturnValue({ eq: assignmentsEqExternalFinal });
    const assignmentsSelectFinal = jest.fn().mockReturnValue({ eq: assignmentsEqSourceFinal });

    supabaseFromMock
      .mockReturnValueOnce({ select: sourceSelectInitial })
      .mockReturnValueOnce({ select: exclusionsSelectInitial })
      .mockReturnValueOnce({ select: assignmentsSelectInitial })
      .mockReturnValueOnce({ select: sourceSelectFinal })
      .mockReturnValueOnce({ select: assignmentsSelectFinal });

    supabaseRpcMock.mockResolvedValueOnce({
      data: [{ player_id: 'player-1' }],
      error: null,
    });

    const result = await activityAssignmentsService.assignActivity({
      activityId: 'activity-remove-1',
      trainerId: 'trainer-1',
      isExternal: false,
      playerIds: [],
      teamIds: [],
    });

    expect(supabaseRpcMock).toHaveBeenCalledWith(
      'remove_internal_activity_assignments',
      {
        p_source_activity_id: 'activity-remove-1',
        p_player_ids: ['player-1'],
      },
    );
    expect(result.createdCount).toBe(0);
    expect(result.removedCount).toBe(1);
    expect(result.updatedCount).toBe(0);
    expect(result.assignment).toEqual({ playerIds: [], teamIds: [] });
  });

  it('keeps team assignment and persists exclusions when a team member is deselected', async () => {
    const sourceMaybeSingleInitial = jest.fn().mockResolvedValue({
      data: { id: 'activity-team-exclusion-1' },
      error: null,
    });
    const sourceEqExternalInitial = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleInitial });
    const sourceEqTrainerInitial = jest.fn().mockReturnValue({ eq: sourceEqExternalInitial });
    const sourceEqActivityInitial = jest.fn().mockReturnValue({ eq: sourceEqTrainerInitial });
    const sourceSelectInitial = jest.fn().mockReturnValue({ eq: sourceEqActivityInitial });

    const exclusionsEqInitial = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const exclusionsSelectInitial = jest.fn().mockReturnValue({ eq: exclusionsEqInitial });

    const assignmentsEqExternalInitial = jest.fn().mockResolvedValue({
      data: [],
      error: null,
    });
    const assignmentsEqSourceInitial = jest.fn().mockReturnValue({ eq: assignmentsEqExternalInitial });
    const assignmentsSelectInitial = jest.fn().mockReturnValue({ eq: assignmentsEqSourceInitial });

    const teamMembersIn = jest.fn().mockResolvedValue({
      data: [
        { team_id: 'team-1', player_id: 'player-1' },
        { team_id: 'team-1', player_id: 'player-2' },
      ],
      error: null,
    });
    const teamMembersSelect = jest.fn().mockReturnValue({ in: teamMembersIn });

    const sourceMaybeSingleFinal = jest.fn().mockResolvedValue({
      data: { id: 'activity-team-exclusion-1' },
      error: null,
    });
    const sourceEqExternalFinal = jest.fn().mockReturnValue({ maybeSingle: sourceMaybeSingleFinal });
    const sourceEqTrainerFinal = jest.fn().mockReturnValue({ eq: sourceEqExternalFinal });
    const sourceEqActivityFinal = jest.fn().mockReturnValue({ eq: sourceEqTrainerFinal });
    const sourceSelectFinal = jest.fn().mockReturnValue({ eq: sourceEqActivityFinal });

    const assignmentsEqExternalFinal = jest.fn().mockResolvedValue({
      data: [{ player_id: 'player-2', team_id: 'team-1' }],
      error: null,
    });
    const assignmentsEqSourceFinal = jest.fn().mockReturnValue({ eq: assignmentsEqExternalFinal });
    const assignmentsSelectFinal = jest.fn().mockReturnValue({ eq: assignmentsEqSourceFinal });

    const activitiesSelects = [sourceSelectInitial, assignmentsSelectInitial, sourceSelectFinal, assignmentsSelectFinal];
    let activitySelectIndex = 0;

    supabaseFromMock.mockImplementation((table: string) => {
      if (table === 'activities') {
        const select = activitiesSelects[activitySelectIndex];
        activitySelectIndex += 1;
        return { select };
      }
      if (table === 'activity_assignment_team_exclusions') {
        return { select: exclusionsSelectInitial };
      }
      if (table === 'team_members') {
        return { select: teamMembersSelect };
      }
      throw new Error(`Unexpected table ${table}`);
    });

    supabaseRpcMock
      .mockResolvedValueOnce({
        data: [{ player_id: 'player-2' }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: null,
      });

    const result = await activityAssignmentsService.assignActivity({
      activityId: 'activity-team-exclusion-1',
      trainerId: 'trainer-1',
      isExternal: false,
      playerIds: [],
      teamIds: ['team-1'],
      excludedPlayerIdsByTeamId: {
        'team-1': ['player-1'],
      },
    });

    expect(supabaseRpcMock).toHaveBeenNthCalledWith(
      1,
      'assign_internal_activity_to_players',
      expect.objectContaining({
        p_source_activity_id: 'activity-team-exclusion-1',
        p_player_ids: ['player-2'],
        p_team_scope_by_player: { 'player-2': 'team-1' },
      }),
    );
    expect(supabaseRpcMock).toHaveBeenNthCalledWith(
      2,
      'sync_internal_activity_assignment_team_exclusions',
      {
        p_source_activity_id: 'activity-team-exclusion-1',
        p_excluded_player_ids_by_team: {
          'team-1': ['player-1'],
        },
      },
    );
    expect(result.assignment).toEqual({ playerIds: ['player-2'], teamIds: ['team-1'] });
  });

  it('removes legacy null-linked assignment templates during unassign', async () => {
    const assignmentDeleteExec = jest.fn().mockResolvedValue({ error: null });
    const assignmentDeleteIs = jest.fn().mockImplementation(() => assignmentDeleteExec());
    const assignmentDeleteEqPlayer = jest.fn().mockReturnValue({ is: assignmentDeleteIs });
    const assignmentDeleteEqTrainer = jest.fn().mockReturnValue({ eq: assignmentDeleteEqPlayer });
    const assignmentDeleteEqExercise = jest.fn().mockReturnValue({ eq: assignmentDeleteEqTrainer });
    const assignmentDelete = jest.fn().mockReturnValue({ eq: assignmentDeleteEqExercise });

    const templateDeleteExec = jest.fn().mockResolvedValue({ error: null });
    const templateDeleteIs = jest.fn().mockImplementation(() => templateDeleteExec());
    const templateDeleteEqPlayer = jest.fn().mockReturnValue({ is: templateDeleteIs });
    const templateDeleteEqLibrary = jest.fn().mockReturnValue({ eq: templateDeleteEqPlayer });
    const templateDeleteEqUser = jest.fn().mockReturnValue({ eq: templateDeleteEqLibrary });
    const templateDelete = jest.fn().mockReturnValue({ eq: templateDeleteEqUser });

    const exerciseMaybeSingle = jest.fn().mockResolvedValue({
      data: { title: 'Legacy Drill', description: 'Legacy Description', video_url: null },
      error: null,
    });
    const exerciseEq = jest.fn().mockReturnValue({ maybeSingle: exerciseMaybeSingle });
    const exerciseSelect = jest.fn().mockReturnValue({ eq: exerciseEq });

    const legacyLookupIsTeam = jest.fn().mockResolvedValue({ data: [{ id: 'legacy-template-1' }], error: null });
    const legacyLookupEqPlayer = jest.fn().mockReturnValue({ is: legacyLookupIsTeam });
    const legacyLookupIsVideo = jest.fn().mockReturnValue({ eq: legacyLookupEqPlayer });
    const legacyLookupEqDescription = jest.fn().mockReturnValue({ is: legacyLookupIsVideo });
    const legacyLookupEqTitle = jest.fn().mockReturnValue({ eq: legacyLookupEqDescription });
    const legacyLookupEqSource = jest.fn().mockReturnValue({ eq: legacyLookupEqTitle });
    const legacyLookupIsLibrary = jest.fn().mockReturnValue({ eq: legacyLookupEqSource });
    const legacyLookupEqUser = jest.fn().mockReturnValue({ is: legacyLookupIsLibrary });
    const legacyLookupSelect = jest.fn().mockReturnValue({ eq: legacyLookupEqUser });

    supabaseFromMock
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('exercise_assignments');
        return { delete: assignmentDelete };
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('task_templates');
        return { delete: templateDelete };
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('exercise_library');
        return { select: exerciseSelect };
      })
      .mockImplementationOnce((table: string) => {
        expect(table).toBe('task_templates');
        return { select: legacyLookupSelect };
      });

    supabaseRpcMock.mockResolvedValue({ data: true, error: null });

    await exerciseAssignmentsService.unassignExercise({
      exerciseId: 'exercise-1',
      trainerId: 'trainer-1',
      playerId: 'player-1',
      teamId: null,
    });

    expect(supabaseRpcMock).toHaveBeenCalledWith('remove_task_template_for_actor', {
      p_task_id: 'legacy-template-1',
    });
  });
});
