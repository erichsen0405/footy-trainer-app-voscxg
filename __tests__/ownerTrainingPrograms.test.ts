import fs from 'fs';
import path from 'path';
import { filterProgramTemplates } from '@/utils/programTemplatePicker';
import { buildProgramEnrollmentTimeline } from '../supabase/functions/_shared/programEnrollmentPreview';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('owner training programs contract', () => {
  const migration = read('supabase/migrations/20260712120000_owner_training_programs.sql');
  const edge = read('supabase/functions/manageTrainingPrograms/index.ts');
  const service = read('services/trainingProgramService.ts');
  const screen = read('app/(tabs)/programs.tsx');
  const prompt = read('docs/base44-owner-training-programs-prompt.md');
  const enrollmentFixPrompt = read('docs/base44-owner-training-program-enrollment-fix-prompt.md');
  const enrollmentPreviewV2Prompt = read('docs/base44-owner-training-program-enrollment-preview-v2-prompt.md');
  const builderScheduleV3Prompt = read('docs/base44-owner-training-program-builder-schedule-v3-prompt.md');
  const builderStateV4Prompt = read('docs/base44-owner-training-program-builder-state-v4-prompt.md');

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
    expect(edge).toContain("action === 'delete'");
    expect(edge).toContain("action === 'enrollmentPreview'");
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
    expect(edge).toContain('phaseIdMap.set(clientId, id)');
    expect(edge).toContain('phaseIdMap.get(clientPhaseId)');
    expect(edge).toContain('p.startsInWeek');
    expect(edge).toContain('item.weekday ?? item.dayOfWeek');
    expect(edge).toContain("config.scheduling = { weekday:");
    expect(edge).toContain("session: 'session_template'");
    expect(edge).toContain('Programs with enrollments cannot be deleted. Archive this program to preserve player history.');
    expect(edge).toContain("from('training_programs').delete()");
    expect(edge).toContain('loadEnrollmentPreview');
    expect(edge).toContain('ownerRosterStatus: \'active\'');
    expect(edge).toContain('buildProgramEnrollmentTimeline');
    expect(service).toContain("supabase.functions.invoke('manageTrainingPrograms'");
    expect(service).toContain('deleteTrainingProgram');
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
    expect(screen).toContain('fetchTrainingProgramEnrollmentPreview');
    expect(screen).toContain('result.apiVersion !== 2');
    expect(screen).toContain('result.ownerAccountId !== ownerAccountId');
    expect(screen).toContain('preview.program.phases.map');
    expect(screen).toContain('availablePlayers = preview?.players');
    expect(screen).not.toContain('addDays(startDate');
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
    expect(screen).toContain('DropdownSelect');
    expect(screen).toContain('testIDPrefix="programs.level"');
    expect(screen).toContain('TemplatePickerModal');
    expect(screen).toContain('programs.templates.search');
    expect(screen).toContain('programs.templates.filter.${type}');
    expect(screen).toContain('Choose task, exercise or session');
    expect(screen).toContain('filterProgramTemplates');
    expect(screen).toContain('Delete program permanently?');
    expect(screen).toContain('deleteTrainingProgram');
    expect(screen).toContain('PROGRAM_WEEKDAYS');
    expect(screen).toContain('testIDPrefix={`programs.item.${item.id}.weekday`}');
    expect(screen).toContain('testIDPrefix={`programs.item.${item.id}.week`}');
    expect(screen).toContain('Needs phase');
    expect(screen).toContain('repairPhase');
    expect(screen).toContain('contentBlocked');
    expect(screen).toContain('Remove phase and content?');
    expect(screen).toContain('targetPhaseExists');
    expect(screen).toContain('startsInWeek: Number(phase.weekOffset) + 1');
    expect(screen).not.toContain('label="Program day"');
    expect(prompt).toContain('existing authenticated Base44/KlubAdmin webapp');
    expect(prompt).toContain('do not create a parallel portal');
    expect(prompt).toContain('https://lhpczofddvwcyrgotzha.supabase.co/functions/v1');
    expect(prompt).toContain('Remote deployment status');
    expect(prompt).toContain('Phase-step UX — do not expose offsets');
    expect(prompt).toContain('payload.startsInWeek = startsInWeek');
    expect(prompt).toContain('Never send `weekOffset` or subtract one in Base44.');
    expect(prompt).toContain('automatically suggest the first week after');
    expect(prompt).toContain('predefined single-select');
    expect(prompt).toContain('| All levels | `all` |');
    expect(prompt).toContain('Render Level as an accessible dropdown/select');
    expect(prompt).toContain('Content-step template picker');
    expect(prompt).toContain('type filters: `All`, `Task`, `Exercise`, `Session`');
    expect(prompt).toContain('The server permits hard deletion only when the program has no enrollments');
    expect(enrollmentFixPrompt).toContain('phase.week_offset');
    expect(enrollmentFixPrompt).toContain('item.phase_id');
    expect(enrollmentFixPrompt).toContain('item.item_type');
    expect(enrollmentFixPrompt).toContain('item.day_offset');
    expect(enrollmentFixPrompt).toContain("player.ownerRosterStatus === 'active'");
    expect(enrollmentFixPrompt).toContain('Never construct player choices from `owner_memberships`');
    expect(enrollmentFixPrompt).toContain('No content in this phase');
    expect(enrollmentFixPrompt).toContain('weekOffset * 7');
    expect(enrollmentPreviewV2Prompt).toContain('There must be one modal data source');
    expect(enrollmentPreviewV2Prompt).toContain('preview.program.phases.map');
    expect(enrollmentPreviewV2Prompt).toContain('Render player choices exclusively from');
    expect(enrollmentPreviewV2Prompt).toContain('preview.players');
    expect(enrollmentPreviewV2Prompt).toContain('Do not normalize this response again');
    expect(builderScheduleV3Prompt).toContain('Program Builder Schedule v3');
    expect(builderScheduleV3Prompt).toContain('Do not send `dayOffset`');
    expect(builderScheduleV3Prompt).toContain('"weekday": "monday"');
    expect(builderScheduleV3Prompt).toContain('temporary phase IDs');
    expect(builderScheduleV3Prompt).toContain('Mandatory server round-trip before Publish');
    expect(builderScheduleV3Prompt).toContain('Superseded for Base44 implementation');
    expect(builderStateV4Prompt).toContain('Program Builder State v4');
    expect(builderStateV4Prompt).toContain('Content needing a phase');
    expect(builderStateV4Prompt).toContain('Never merge or append incoming phases/items');
    expect(builderStateV4Prompt).toContain('savedProgramId');
    expect(builderStateV4Prompt).toContain('phaseIdMap');
    expect(builderStateV4Prompt).toContain('Do not subtract one from `startsInWeek`');
    expect(screen).toContain("crm.players.filter((player) => player.ownerRosterStatus === 'active')");
  });

  it('combines template type filters and search while excluding week templates', () => {
    const templates = [
      { templateType: 'task', title: 'Finishing homework', description: 'Shots', focusAreas: ['Finishing'] },
      { templateType: 'exercise', title: 'First touch drill', description: 'Technical', focusAreas: ['First touch'] },
      { templateType: 'session', title: 'Finishing session', description: 'Team session', focusAreas: ['Finishing'] },
      { templateType: 'week', title: 'Full week', description: 'Plan', focusAreas: [] },
    ];

    expect(filterProgramTemplates(templates, 'all', '')).toHaveLength(3);
    expect(filterProgramTemplates(templates, 'session', '')).toEqual([templates[2]]);
    expect(filterProgramTemplates(templates, 'all', 'first TOUCH')).toEqual([templates[1]]);
    expect(filterProgramTemplates(templates, 'task', 'finishing')).toEqual([templates[0]]);
    expect(filterProgramTemplates(templates, 'exercise', 'finishing')).toEqual([]);
  });

  it('builds distinct phase weeks and nests persisted sessions by phase', () => {
    const timeline = buildProgramEnrollmentTimeline({
      id: 'program-1', title: 'Four weeks', description: null, audience: null, level: 'all', duration_weeks: 4, status: 'published',
      phases: [
        { id: 'phase-1', title: 'Foundation', description: null, week_offset: 0, duration_weeks: 1, sort_order: 0 },
        { id: 'phase-2', title: 'Build', description: null, week_offset: 1, duration_weeks: 2, sort_order: 1 },
      ],
      items: [
        { id: 'item-1', phase_id: 'phase-1', item_type: 'session_template', training_template_id: 'template-1', title: 'Session one', description: null, day_offset: 0, sort_order: 0, config: {} },
        { id: 'item-2', phase_id: 'phase-2', item_type: 'session_template', training_template_id: 'template-2', title: 'Session two', description: null, day_offset: 9, sort_order: 0, config: {} },
      ],
    }, '2026-07-12');

    expect(timeline.durationWeeks).toBe(4);
    expect(timeline.phases[0]).toMatchObject({ startWeek: 1, endWeek: 1, startDate: '2026-07-12', endDate: '2026-07-18' });
    expect(timeline.phases[1]).toMatchObject({ startWeek: 2, endWeek: 3, startDate: '2026-07-19', endDate: '2026-08-01' });
    expect(timeline.phases[0].items.map((item: any) => item.title)).toEqual(['Session one']);
    expect(timeline.phases[1].items.map((item: any) => item.title)).toEqual(['Session two']);
    expect(timeline.phases[1].items[0]).toMatchObject({ programDay: 10, scheduledDate: '2026-07-21' });
  });

  it('resolves semantic weekdays inside a program week for any enrollment start date', () => {
    const timeline = buildProgramEnrollmentTimeline({
      id: 'program-2', title: 'Calendar weekdays', duration_weeks: 2, status: 'published', phases: [
        { id: 'phase-1', title: 'Week one', week_offset: 0, duration_weeks: 1, sort_order: 0 },
        { id: 'phase-2', title: 'Week two', week_offset: 1, duration_weeks: 1, sort_order: 1 },
      ], items: [
        { id: 'monday-1', phase_id: 'phase-1', item_type: 'session_template', title: 'Monday session', day_offset: 0, sort_order: 0, config: { scheduling: { weekday: 'monday', weekInPhase: 1 } } },
        { id: 'sunday-2', phase_id: 'phase-2', item_type: 'task_template', title: 'Sunday task', day_offset: 13, sort_order: 0, config: { scheduling: { weekday: 'sunday', weekInPhase: 1 } } },
      ],
    }, '2026-07-12'); // Sunday

    expect(timeline.phases[0].items[0]).toMatchObject({ weekday: 'monday', weekdayLabel: 'Monday', scheduledDate: '2026-07-13', programDay: 2 });
    expect(timeline.phases[1].items[0]).toMatchObject({ weekday: 'sunday', weekdayLabel: 'Sunday', scheduledDate: '2026-07-19', programDay: 8 });
  });
});
