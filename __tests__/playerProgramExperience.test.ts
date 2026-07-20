import fs from 'fs';
import path from 'path';
import { buildPlayerProgramExperience } from '../supabase/functions/_shared/playerProgramExperience';

describe('issue #306 player program experience', () => {
  it('calculates player-friendly progress from materialized task and activity completion', () => {
    const result = buildPlayerProgramExperience({
      today: '2026-07-19',
      generatedAt: '2026-07-19T12:00:00.000Z',
      owners: [{ id: 'owner-1', name: 'Coach Co', owner_type: 'private_coach_business' }],
      brandProfiles: [{ owner_account_id: 'owner-1', display_name: 'Coach Michael', brand_colors: { primary: '#111111', accent: '#22aa66' }, logo_url: 'https://example.com/logo.png' }],
      completedTaskIds: new Set(['task-1']),
      completedActivityIds: new Set(['activity-1']),
      taskDetails: [{ id: 'task-1', description: 'Ten controlled touches on each foot.', reminder_minutes: 15, category_ids: ['category-1'] }],
      enrollments: [{
        id: 'enrollment-1',
        owner_account_id: 'owner-1',
        program_id: 'program-1',
        start_date: '2026-07-14',
        status: 'active',
        program_version: { snapshot: { phases: [{ id: 'phase-1', title: 'Foundation' }], items: [{ id: 'program-item-1', phase_id: 'phase-1' }] } },
        training_programs: { title: 'First touch', description: 'Four focused weeks', duration_weeks: 4 },
        program_enrollment_items: [
          { id: 'item-1', program_item_id: 'program-item-1', scheduled_date: '2026-07-17', item_type: 'task_template', title: 'Ball mastery', status: 'upcoming', task_id: 'task-1', activity_id: null },
          { id: 'item-2', scheduled_date: '2026-07-18', item_type: 'session_template', title: 'Pitch session', status: 'upcoming', task_id: null, activity_id: 'activity-1' },
          { id: 'item-3', scheduled_date: '2026-07-19', item_type: 'focus', title: 'Scan before receiving', status: 'upcoming', task_id: null, activity_id: null },
        ],
      }],
    });

    expect(result.apiVersion).toBe(2);
    expect(result.activeEnrollmentId).toBe('enrollment-1');
    expect(result.enrollments[0].owner).toMatchObject({ ownerType: 'private_coach_business', displayName: 'Coach Michael' });
    expect(result.enrollments[0].progress).toEqual({ completedItems: 2, totalItems: 2, percent: 100 });
    expect(result.enrollments[0].items[0]).toMatchObject({ phaseTitle: 'Foundation', weekNumber: 1, description: 'Ten controlled touches on each foot.', reminderMinutes: 15, categoryIds: ['category-1'] });
    expect(result.enrollments[0].items.map((item: any) => item.status)).toEqual(['completed', 'completed', 'today']);
    expect(result.nextAction).toBeNull();
  });

  it('keeps private CRM data outside the player endpoint contract', () => {
    const edge = fs.readFileSync(path.join(process.cwd(), 'supabase/functions/manageTrainingPrograms/index.ts'), 'utf8');
    const playerLoader = edge.slice(edge.indexOf('async function loadPlayerProgramExperience'), edge.indexOf('async function upsert'));
    expect(playerLoader).toContain(".eq('player_id', userId)");
    expect(playerLoader).toContain(".eq('user_id', userId)");
    expect(playerLoader).not.toContain('owner_player_notes');
    expect(playerLoader).not.toContain('owner_player_tags');
    expect(playerLoader).not.toContain('crm_status');
    expect(edge).toContain("action === 'setPlayerItemCompletion'");
    expect(edge).toContain(".eq('player_id', userId)");
    expect(edge).toContain(".eq('user_id', userId)");
  });
});
