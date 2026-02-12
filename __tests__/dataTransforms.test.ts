import { supabase } from '@/integrations/supabase/client';
import {
  fetchSelfFeedbackForTemplates,
  mapFeedbackRow,
} from '@/services/feedbackService';
import { exerciseAssignmentsService } from '@/services/exerciseAssignments';

jest.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

const supabaseFromMock = supabase.from as jest.Mock;

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
});
