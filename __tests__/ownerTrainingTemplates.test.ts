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
const itemLogicMigrationPath = path.join(process.cwd(), 'supabase/migrations/20260709162000_training_template_item_logic.sql');
const exerciseReuseMigrationPath = path.join(process.cwd(), 'supabase/migrations/20260709173000_training_template_exercise_reuse.sql');
const functionPath = path.join(process.cwd(), 'supabase/functions/manageTrainingTemplates/index.ts');
const sharedPath = path.join(process.cwd(), 'supabase/functions/_shared/trainingTemplates.ts');
const servicePath = path.join(process.cwd(), 'services/trainingTemplateService.ts');
const planPath = path.join(process.cwd(), 'app/(tabs)/plan.tsx');
const tabLayoutPath = path.join(process.cwd(), 'app/(tabs)/_layout.tsx');
const base44PromptPath = path.join(process.cwd(), 'docs/base44-owner-training-templates-prompt.md');

describe('owner training templates contract', () => {
  const migration = fs.readFileSync(migrationPath, 'utf8');
  const itemLogicMigration = fs.readFileSync(itemLogicMigrationPath, 'utf8');
  const exerciseReuseMigration = fs.readFileSync(exerciseReuseMigrationPath, 'utf8');
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
    expect(itemLogicMigration).toContain("item_type in ('task_template', 'exercise', 'session_template', 'note', 'focus', 'feedback_requirement')");
    expect(itemLogicMigration).toContain('default_activity_category_name');
    expect(migration).toContain('snapshot jsonb not null');
    expect(exerciseReuseMigration).toContain("template_type in ('task', 'exercise', 'session', 'week')");
    expect(exerciseReuseMigration).toContain('Session and week templates can link to saved task/exercise templates');
    expect(migration).toContain('public.has_owner_account_coach_access(owner_account_id, (select auth.uid()))');
    expect(migration).toContain('Players and guardians');
  });

  it('keeps template writes behind the shared Edge Function', () => {
    expect(edgeFunction).toContain('manageTrainingTemplatesAction');
    expect(edgeFunction).toContain('requireAuthContext');
    expect(shared).toContain('createVersionSnapshot');
    expect(shared).toContain('replaceTemplateItems');
    expect(shared).toContain('resolveReusableTemplateItemLinks');
    expect(shared).toContain('loadExerciseLibraryItems');
    expect(shared).toContain('exercise_library');
    expect(shared).toContain('libraryItems');
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
        templateType: 'session',
        title: ' Finishing session ',
        description: '  Build-up and finishing  ',
        folderId,
        focusAreas: [' Finishing ', 'First touch', 'Finishing'],
        sessionStartTime: '10:15',
        durationMinutes: 75,
        defaultActivityCategoryName: ' Training ',
        status: 'active',
        sourceTaskTemplateId: taskTemplateId,
        items: [
          {
            itemType: 'exercise',
            sourceTaskTemplateId: taskTemplateId,
            title: ' Interval finishing ',
            description: ' Two-touch ',
            startTime: '10:15',
            dayOffset: 0,
            durationMinutes: 18,
            sortOrder: 0,
            config: {
              task: {
                videoUrls: ['https://example.com/drill.mp4'],
                mediaNames: ['Drill video'],
                subtasks: [{ title: 'Right foot' }, { title: 'Left foot' }],
                reminderMinutes: 10,
                afterTrainingEnabled: true,
                afterTrainingDelayMinutes: 15,
                afterTrainingFeedbackScoreExplanation: 'Rate technique',
                taskDurationEnabled: true,
                taskDurationMinutes: 18,
              },
              timer: {
                activeSeconds: 45,
                restSeconds: 15,
                rounds: 4,
              },
            },
          },
        ],
        changeNote: ' Base44 edit ',
      })
    ).toEqual({
      action: 'upsertTemplate',
      ownerAccountId,
      templateId,
      templateType: 'session',
      title: 'Finishing session',
      description: 'Build-up and finishing',
      folderId,
      focusAreas: ['Finishing', 'First touch'],
      durationMinutes: 75,
      defaultActivityCategoryId: null,
      defaultActivityCategoryName: 'Training',
      status: 'active',
      sourceTaskTemplateId: taskTemplateId,
      metadata: {
        session: {
          startTime: '10:15:00',
        },
      },
      items: [
        {
          id: null,
          parentItemId: null,
          itemType: 'exercise',
          sourceTaskTemplateId: taskTemplateId,
          sourceActivitySeriesId: null,
          linkedTemplateId: null,
          title: 'Interval finishing',
          description: 'Two-touch',
          dayOffset: 0,
          startTime: null,
          durationMinutes: null,
          sortOrder: 0,
          config: {
            task: {
              title: 'Interval finishing',
              description: 'Two-touch',
              categoryIds: [],
              subtasks: [],
              videoUrl: 'https://example.com/drill.mp4',
              videoUrls: ['https://example.com/drill.mp4'],
              mediaNames: ['Drill video'],
              reminderMinutes: 10,
              afterTrainingEnabled: true,
              afterTrainingDelayMinutes: 15,
              afterTrainingFeedbackEnableScore: true,
              afterTrainingFeedbackScoreExplanation: 'Rate technique',
              afterTrainingFeedbackEnableIntensity: true,
              afterTrainingFeedbackEnableNote: true,
              taskDurationEnabled: false,
              taskDurationMinutes: null,
              autoAddToActivities: false,
            },
            timer: {
              activeSeconds: 45,
              restSeconds: 15,
              rounds: 4,
            },
          },
        },
      ],
      changeNote: 'Base44 edit',
    });
  });

  it('keeps task templates as task config and rejects mismatched item types', () => {
    expect(
      parseTrainingTemplateBody({
        action: 'upsertTemplate',
        ownerAccountId,
        templateType: 'task',
        title: ' Solo touch work ',
        taskConfig: {
          videoUrls: ['https://example.com/touch.png'],
          subtasks: [{ title: 'Wall passes' }],
          taskDurationEnabled: true,
          taskDurationMinutes: 12,
        },
        items: [],
      })
    ).toMatchObject({
      action: 'upsertTemplate',
      templateType: 'task',
      metadata: {
        task: {
          title: 'Solo touch work',
          videoUrls: ['https://example.com/touch.png'],
          subtasks: [],
          taskDurationEnabled: false,
          taskDurationMinutes: null,
        },
      },
      items: [],
    });

    expect(
      parseTrainingTemplateBody({
        action: 'upsertTemplate',
        ownerAccountId,
        templateType: 'exercise',
        title: ' Repeat sprints ',
        taskConfig: {
          videoUrls: ['https://example.com/sprint.mp4'],
          taskDurationEnabled: true,
          taskDurationMinutes: 16,
        },
        exerciseTimer: {
          activeSeconds: 30,
          restSeconds: 20,
          rounds: 8,
        },
        items: [],
      })
    ).toMatchObject({
      action: 'upsertTemplate',
      templateType: 'exercise',
      metadata: {
        task: {
          title: 'Repeat sprints',
          videoUrls: ['https://example.com/sprint.mp4'],
          subtasks: [],
          taskDurationEnabled: false,
          taskDurationMinutes: null,
        },
        timer: {
          activeSeconds: 30,
          restSeconds: 20,
          rounds: 8,
        },
      },
      items: [],
    });

    expect(
      parseTrainingTemplateBody({
        action: 'upsertTemplate',
        ownerAccountId,
        templateType: 'week',
        title: ' Week plan ',
        items: [
          {
            itemType: 'session_template',
            title: ' Team training ',
            dayOffset: 2,
            startTime: '18:30',
            durationMinutes: 75,
          },
          {
            itemType: 'task_template',
            title: ' Touch work ',
            dayOffset: 3,
            startTime: '08:00',
            durationMinutes: 12,
          },
        ],
      })
    ).toMatchObject({
      templateType: 'week',
      durationMinutes: null,
      items: [
        {
          itemType: 'session_template',
          dayOffset: 2,
          startTime: '18:30:00',
          durationMinutes: 75,
        },
        {
          itemType: 'task_template',
          dayOffset: 3,
          startTime: null,
          durationMinutes: null,
        },
      ],
    });

    expect(() =>
      parseTrainingTemplateBody({
        action: 'upsertTemplate',
        ownerAccountId,
        templateType: 'week',
        title: 'Bad week',
        items: [{ itemType: 'feedback_requirement', title: 'Loose feedback' }],
      })
    ).toThrow('feedback_requirement is not allowed in week templates.');

    expect(() =>
      parseTrainingTemplateBody({
        action: 'upsertTemplate',
        ownerAccountId,
        templateType: 'session',
        title: 'Bad session',
        items: [{ itemType: 'activity', title: 'Old activity item' }],
      })
    ).toThrow('itemType is invalid.');
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
          exercise: 0,
          session: 0,
          week: 0,
        },
        libraryItems: [],
      })
    ).toMatchObject({
      ownerAccount: { ownerAccountId, ownerType: 'club' },
      actor: { roles: ['owner', 'coach'], canManageTemplates: true },
      summary: { total: 0, task: 0, exercise: 0, session: 0, week: 0 },
      libraryItems: [],
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
    expect(plan).toContain("value: 'exercise', label: 'Exercise'");
    expect(plan).toContain('Interval timer');
    expect(plan).toContain("type ItemSourceMode = 'new' | 'saved' | 'library'");
    expect(plan).toContain('type ItemPickerMode');
    expect(plan).toContain('ReusableItemPickerModal');
    expect(plan).toContain('TemplatePickerCard');
    expect(plan).toContain('LibraryPickerCard');
    expect(plan).toContain('selectedReusableTemplateId');
    expect(plan).toContain('selectedLibraryItemId');
    expect(plan).toContain('sessionStartTimeInput');
    expect(plan).toContain('Session start time');
    expect(plan).toContain('buildTaskConfigPayloadFromLibraryItem');
    expect(plan).toContain("const itemCarriesSessionTiming = draft.templateType === 'week' && itemType === 'session_template'");
    expect(plan).toContain("draft.templateType === 'week' ? parsePositiveInt(itemDayOffset) ?? 0 : 0");
    expect(plan).toContain("draft.templateType === 'session' ? 0 : item.dayOffset");
    expect(plan).not.toContain('reusablePickerChip');
    expect(plan).not.toContain('Subtasks');
    expect(plan).not.toContain('Task time');
    expect(plan).not.toContain("value: 'activity', label: 'Activity'");
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
    expect(base44Prompt).toContain('popup/bottom sheet');
    expect(base44Prompt).toContain('Day-vaelger i session builderen');
    expect(base44Prompt).toContain('sessionStartTime');
    expect(base44Prompt).toContain('Task og exercise maa ikke have subtasks eller egen task time');
    expect(base44Prompt).toContain('vis kun starttid og varighed paa `session_template` items');
    expect(base44Prompt).toContain('supabase functions list --project-ref lhpczofddvwcyrgotzha');
  });
});
