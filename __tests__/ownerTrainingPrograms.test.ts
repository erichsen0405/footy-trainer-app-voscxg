import fs from 'fs';
import path from 'path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('owner training programs contract', () => {
  const migration = read('supabase/migrations/20260712120000_owner_training_programs.sql');
  const edge = read('supabase/functions/manageTrainingPrograms/index.ts');
  const service = read('services/trainingProgramService.ts');
  const screen = read('app/(tabs)/programs.tsx');
  const prompt = read('docs/base44-owner-training-programs-prompt.md');
  const enrollmentFixPrompt = read('docs/base44-owner-training-program-enrollment-fix-prompt.md');

  it('stores owner-scoped immutable programs and dated enrollment snapshots', () => {
    for (const table of ['training_programs', 'program_phases', 'program_items', 'program_versions', 'program_enrollments', 'program_enrollment_items']) {
      expect(migration).toContain(`create table public.${table}`);
    }
    expect(migration).toContain('snapshot jsonb not null');
    expect(migration).toContain('program_version_id uuid not null');
    expect(migration).toContain('Players read own enrollments');
    expect(migration).toContain('public.has_owner_account_coach_access');
  });

  it('keeps publishing and cross-user enrollment server-side', () => {
    expect(edge).toContain("action === 'publish'");
    expect(edge).toContain("action === 'enroll'");
    expect(edge).toContain("get_owner_account_roles");
    expect(edge).toContain("from('program_versions').insert");
    expect(edge).toContain("from('program_enrollment_items').insert");
    expect(edge).toContain('materializeSessionTemplate');
    expect(edge).toContain("from('activities').insert");
    expect(edge).toContain("from('activity_tasks').insert");
    expect(edge).toContain('The selected team does not belong to this owner.');
    expect(edge).toContain('Every selected template must belong to this owner.');
    expect(edge).toContain('Every phase must fit inside the program duration.');
    expect(edge).toContain("new Set(['all', 'beginner', 'intermediate', 'advanced', 'elite'])");
    expect(edge).toContain('level must be all, beginner, intermediate, advanced or elite.');
    expect(service).toContain("supabase.functions.invoke('manageTrainingPrograms'");
  });

  it('delivers coach and player mobile flows plus the existing Base44 reuse contract', () => {
    expect(screen).toContain('New program');
    expect(screen).toContain('My program');
    expect(screen).toContain('publishTrainingProgram');
    expect(screen).toContain('enrollTrainingProgram');
    expect(screen).toContain('createProgramDraftId');
    expect(screen).not.toContain('crypto.randomUUID()');
    expect(screen).toContain("['Details', 'Phases', 'Content', 'Preview']");
    expect(screen).toContain('fetchOwnerPlayerCrmList');
    expect(screen).toContain('fetchOwnerTrainingTemplates');
    expect(screen).toContain('Enrollment preview');
    expect(screen).toContain('Confirm enrollment');
    expect(screen).toContain('setProgramEnrollmentStatus');
    expect(screen).toContain('Archive program?');
    expect(screen).not.toContain('Enroll first player');
    expect(screen).toContain('Starts in week');
    expect(screen).toContain('Duration (weeks)');
    expect(screen).toContain('Runs from week');
    expect(screen).not.toContain('wk off');
    expect(screen).toContain('PROGRAM_LEVELS');
    expect(screen).toContain("{ value: 'beginner', label: 'Beginner' }");
    expect(screen).toContain("{ value: 'intermediate', label: 'Intermediate' }");
    expect(screen).toContain("{ value: 'advanced', label: 'Advanced' }");
    expect(screen).toContain("{ value: 'elite', label: 'Elite' }");
    expect(screen).toContain('programs.level.${level.value}');
    expect(prompt).toContain('existing authenticated Base44/KlubAdmin webapp');
    expect(prompt).toContain('do not create a parallel portal');
    expect(prompt).toContain('https://lhpczofddvwcyrgotzha.supabase.co/functions/v1');
    expect(prompt).toContain('Remote deployment status');
    expect(prompt).toContain('Phase-step UX — do not expose offsets');
    expect(prompt).toContain('weekOffset = startsInWeek - 1');
    expect(prompt).toContain('automatically suggest the first week after');
    expect(prompt).toContain('predefined single-select');
    expect(prompt).toContain('| All levels | `all` |');
    expect(enrollmentFixPrompt).toContain('phase.week_offset');
    expect(enrollmentFixPrompt).toContain('item.phase_id');
    expect(enrollmentFixPrompt).toContain('item.item_type');
    expect(enrollmentFixPrompt).toContain('item.day_offset');
    expect(enrollmentFixPrompt).toContain("player.ownerRosterStatus === 'active'");
    expect(enrollmentFixPrompt).toContain('Never construct player choices from `owner_memberships`');
    expect(enrollmentFixPrompt).toContain('No content in this phase');
    expect(enrollmentFixPrompt).toContain('weekOffset * 7');
    expect(screen).toContain("crm.players.filter((player) => player.ownerRosterStatus === 'active')");
  });
});
