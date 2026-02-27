import { supabase } from '@/integrations/supabase/client';
import {
  fetchSelfFeedbackForTemplates,
  mapFeedbackRow,
} from '@/services/feedbackService';
import { exerciseAssignmentsService } from '@/services/exerciseAssignments';

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
    jest.clearAllMocks();
  });

  it('maps task_template_self_feedback row to view model', () => {
    const mapped = mapFeedbackRow({
      id: 'fb1',
      user_id: 'u1',
      task_template_id: 'tt1',
      task_instance_id: null,
      activity_id: 'a1',
      rating: 8,
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
      rating: 8,
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
          rating: 6,
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
        rating: 6,
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
