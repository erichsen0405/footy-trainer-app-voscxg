import fs from 'fs';
import path from 'path';
import {
  buildProgramEnrollmentTimeline,
  getUnassignedProgramItems,
} from '../supabase/functions/_shared/programEnrollmentPreview';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('owner training program backend hardening', () => {
  it('surfaces items with null or non-matching phase IDs as unassigned', () => {
    const program = {
      id: 'program-1',
      title: 'Legacy draft',
      duration_weeks: 2,
      status: 'draft',
      phases: [
        { id: 'phase-1', title: 'Phase one', week_offset: 0, duration_weeks: 1, sort_order: 0 },
      ],
      items: [
        { id: 'valid', phase_id: 'phase-1', item_type: 'session_template', title: 'Valid session', day_offset: 0, sort_order: 0, config: {} },
        { id: 'null-phase', phase_id: null, item_type: 'focus', title: 'Legacy orphan', day_offset: 1, sort_order: 1, config: {} },
        { id: 'stale-phase', phase_id: 'phase-from-another-program', item_type: 'focus', title: 'Stale orphan', day_offset: 2, sort_order: 2, config: {} },
      ],
    };

    expect(getUnassignedProgramItems(program).map((item) => item.id)).toEqual([
      'null-phase',
      'stale-phase',
    ]);

    const timeline = buildProgramEnrollmentTimeline(program, '2026-07-12');
    expect(timeline.phases[0].items.map((item: any) => item.id)).toEqual(['valid']);
    expect(timeline.unassignedItems.map((item: any) => item.id)).toEqual([
      'null-phase',
      'stale-phase',
    ]);
  });

  it('guards publish and returns canonical save metadata without removing list fields', () => {
    const edge = read('supabase/functions/manageTrainingPrograms/index.ts');

    expect(edge).toContain('if (getUnassignedProgramItems(program).length)');
    expect(edge).toContain('Every program item must be attached to a phase in this program before publishing.');
    expect(edge).toContain('const result = await payload(client, ownerAccountId);');
    expect(edge).toContain('...result,');
    expect(edge).toContain('savedProgramId: programId');
    expect(edge).toContain('savedProgram,');
    expect(edge).toContain('phaseIdMap: Object.fromEntries(phaseIdMap)');
    expect(edge).toContain('Every phase ID must be unique in the save payload.');
  });

  it('keeps enrollment preview profile, CRM and owner lookups aligned', () => {
    const edge = read('supabase/functions/manageTrainingPrograms/index.ts');
    const directoryStart = edge.indexOf('async function loadPlayerDirectory');
    const previewStart = edge.indexOf('async function loadEnrollmentPreview');
    const directory = edge.slice(directoryStart, previewStart);
    const previewEnd = edge.indexOf('async function enroll', previewStart);
    const preview = edge.slice(previewStart, previewEnd);

    expect(directory).toContain('const [profilesResult, crmResult, rosterResult] = await Promise.all([');
    expect(directory).toContain("client.from('profiles').select('user_id,full_name')");
    expect(directory).toContain("client.from('owner_player_crm_profiles').select('player_id,email')");
    expect(directory).toContain("client.from('owner_players').select('player_id,status')");
    expect(directory).toContain(".eq('owner_account_id', ownerAccountId)");
    expect(preview).toContain('const [playerDirectory, ownerResult] = await Promise.all([');
    expect(preview).toContain('loadPlayerDirectory(client, ownerAccountId, playerIds)');
    expect(preview).toContain("client.from('owner_accounts').select('club_id')");
    expect(preview).toContain('if (ownerResult.data?.club_id)');
  });
});
