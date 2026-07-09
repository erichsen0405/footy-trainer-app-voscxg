import fs from 'fs';
import path from 'path';
import {
  normalizeOwnerTrainingTemplatesPayload,
  parseTrainingTemplateBody,
} from '../supabase/functions/_shared/trainingTemplates';

const ownerAccountId = '22222222-2222-4222-8222-222222222222';
const templateId = '33333333-3333-4333-8333-333333333333';
const folderId = '44444444-4444-4444-8444-444444444444';
const taskTemplateId = '55555555-5555-4555-8555-555555555555';

const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260709150000_owner_training_templates.sql');
const functionPath = path.join(process.cwd(), 'supabase/functions/manageTrainingTemplates/index.ts');
const sharedPath = path.join(process.cwd(), 'supabase/functions/_shared/trainingTemplates.ts');
const servicePath = path.join(process.cwd(), 'services/trainingTemplateService.ts');
const planPath = path.join(process.cwd(), 'app/(tabs)/plan.tsx');
const tabLayoutPath = path.join(process.cwd(), 'app/(tabs)/_layout.tsx');
const base44PromptPath = path.join(process.cwd(), 'docs/base44-owner-training-templates-prompt.md');

describe('owner training templates contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const edgeFunction = fs.readFileSync(functionPath, 'utf8');
  const shared = fs.readFileSync(sharedPath, 'utf8');
  const service = fs.readFileSync(servicePath, 'utf8');
  const plan = fs.readFileSync(planPath, 'utf8');
  const tabLayout = fs.readFileSync(tabLayoutPath, 'utf8');
  const base44Prompt = fs.readFileSync(base44PromptPath, 'utf8');

  it('creates owner-scoped training template storage with version snapshots', () => {
    expect(migration).toContain('create table if not exists public.training_template_folders');
    expect(migration).toContain('create table if not exists public.training_templates');
    expect(migration).toContain('create table if not exists public.training_template_items');
    expect(migration).toContain('create table if not exists public.template_versions');
    expect(migration).toContain('owner_account_id uuid not null references public.owner_accounts');
    expect(migration).toContain("template_type in ('task', 'session', 'week')");
    expect(migration).toContain("item_type in ('task_template', 'activity', 'session_template', 'note', 'focus')");
    expect(migration).toContain('snapshot jsonb not null');
    expect(migration).toContain('public.has_owner_account_coach_access(owner_account_id, (select auth.uid()))');
    expect(migration).toContain('Players and guardians');
  });

  it('keeps template writes behind the shared Edge Function', () => {
    expect(edgeFunction).toContain('manageTrainingTemplatesAction');
    expect(edgeFunction).toContain('requireAuthContext');
    expect(shared).toContain('createVersionSnapshot');
    expect(shared).toContain('replaceTemplateItems');
    expect(shared).toContain('has_owner_account_coach_access');
    expect(shared).toContain('duplicateTemplate');
    expect(service).toContain("supabase.functions.invoke('manageTrainingTemplates'");
    expect(service).toContain('saveOwnerTrainingTemplate');
    expect(service).toContain('duplicateOwnerTrainingTemplate');
    expect(service).toContain('archiveOwnerTrainingTemplate');
    expect(service).toContain('restoreOwnerTrainingTemplate');
  });

  it('parses template payloads for mobile and Base44', () => {
    expect(
      parseTrainingTemplateBody({
        action: 'upsertTemplate',
        ownerAccountId,
        id: templateId,
        templateType: 'week',
        title: ' Finishing week ',
        description: '  Build-up and finishing  ',
        folderId,
        focusAreas: [' Finishing ', 'First touch', 'Finishing'],
        durationMinutes: 240,
        status: 'active',
        sourceTaskTemplateId: taskTemplateId,
        items: [
          {
            itemType: 'task_template',
            sourceTaskTemplateId: taskTemplateId,
            title: ' Warm-up ',
            description: ' Two-touch ',
            dayOffset: 1,
            durationMinutes: 20,
            sortOrder: 0,
            config: { intensity: 'medium' },
          },
        ],
        changeNote: ' Base44 edit ',
      })
    ).toEqual({
      action: 'upsertTemplate',
      ownerAccountId,
      templateId,
      templateType: 'week',
      title: 'Finishing week',
      description: 'Build-up and finishing',
      folderId,
      focusAreas: ['Finishing', 'First touch'],
      durationMinutes: 240,
      status: 'active',
      sourceTaskTemplateId: taskTemplateId,
      items: [
        {
          id: null,
          parentItemId: null,
          itemType: 'task_template',
          sourceTaskTemplateId: taskTemplateId,
          sourceActivitySeriesId: null,
          linkedTemplateId: null,
          title: 'Warm-up',
          description: 'Two-touch',
          dayOffset: 1,
          startTime: null,
          durationMinutes: 20,
          sortOrder: 0,
          config: { intensity: 'medium' },
        },
      ],
      changeNote: 'Base44 edit',
    });
  });

  it('normalizes list payload summary shape', () => {
    expect(
      normalizeOwnerTrainingTemplatesPayload({
        ownerAccount: {
          ownerAccountId,
          ownerType: 'club',
          name: 'FC Test',
          status: 'active',
          coachAccountId: null,
          clubId: null,
        },
        actor: {
          userId: '11111111-1111-4111-8111-111111111111',
          roles: ['owner', 'coach'],
          canManageTemplates: true,
        },
        folders: [],
        templates: [],
        summary: {
          total: 0,
          active: 0,
          archived: 0,
          task: 0,
          session: 0,
          week: 0,
        },
      })
    ).toMatchObject({
      ownerAccount: { ownerAccountId, ownerType: 'club' },
      actor: { roles: ['owner', 'coach'], canManageTemplates: true },
      summary: { total: 0, session: 0, week: 0 },
    });
  });

  it('adds Plan as the trainer home for templates and simplifies the trainer tab bar', () => {
    expect(tabLayout).toContain("label: 'Overblik'");
    expect(tabLayout).toContain("label: 'Spillere'");
    expect(tabLayout).toContain("label: 'Plan'");
    expect(tabLayout).toContain("label: isTrainer ? 'Bibliotek' : 'Library'");
    expect(tabLayout).toContain('return [coachDashboardTab, playerCrmTab, planTab, libraryTab]');
    expect(tabLayout).toContain('<Stack.Screen name="plan" />');
    expect(plan).toContain("value: 'templates', label: 'Skabeloner'");
    expect(plan).toContain('fetchOwnerTrainingTemplates');
    expect(plan).toContain('saveOwnerTrainingTemplate');
    expect(plan).toContain('duplicateOwnerTrainingTemplate');
    expect(plan).toContain('archiveOwnerTrainingTemplate');
    expect(plan).toContain('restoreOwnerTrainingTemplate');
    expect(plan).toContain("router.push('/(tabs)/tasks'");
    expect(plan).toContain('plan.template.create.${type.value}');
  });

  it('documents Base44 reuse and Supabase endpoint contract', () => {
    expect(base44Prompt).toContain('Base44/KlubAdmin');
    expect(base44Prompt).toContain('Byg ikke en ny portal');
    expect(base44Prompt).toContain('owner_account_id');
    expect(base44Prompt).toContain('Plan > Skabeloner');
    expect(base44Prompt).toContain('manageTrainingTemplates');
    expect(base44Prompt).toContain('training_templates');
    expect(base44Prompt).toContain('template_versions');
    expect(base44Prompt).toContain('Player og guardian maa ikke have template-admin adgang');
    expect(base44Prompt).toContain('supabase functions list --project-ref lhpczofddvwcyrgotzha');
  });
});
