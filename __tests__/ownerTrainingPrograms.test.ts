import fs from 'fs';
import path from 'path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('owner training programs contract', () => {
  const migration = read('supabase/migrations/20260712120000_owner_training_programs.sql');
  const edge = read('supabase/functions/manageTrainingPrograms/index.ts');
  const service = read('services/trainingProgramService.ts');
  const screen = read('app/(tabs)/programs.tsx');
  const prompt = read('docs/base44-owner-training-programs-prompt.md');

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
    expect(service).toContain("supabase.functions.invoke('manageTrainingPrograms'");
  });

  it('delivers coach and player mobile flows plus the existing Base44 reuse contract', () => {
    expect(screen).toContain('New guided draft');
    expect(screen).toContain('My program');
    expect(screen).toContain('publishTrainingProgram');
    expect(screen).toContain('enrollTrainingProgram');
    expect(prompt).toContain('existing authenticated Base44/KlubAdmin webapp');
    expect(prompt).toContain('do not create a parallel portal');
    expect(prompt).toContain('https://lhpczofddvwcyrgotzha.supabase.co/functions/v1');
    expect(prompt).toContain('Remote deployment status');
  });
});
