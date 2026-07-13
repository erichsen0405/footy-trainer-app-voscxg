import {
  buildProgramEnrollmentPlayerPlans,
  DEFAULT_PROGRAM_ACTIVITY_TIME,
  ProgramTemplateMaterialization,
  readProgramTemplates,
  serializeProgramTemplates,
} from '../supabase/functions/_shared/programEnrollmentMaterialization';

const baseTemplate = {
  description: null,
  defaultActivityCategoryId: null,
  defaultActivityCategoryName: null,
  sourceTaskTemplateId: null,
  metadata: {},
  subtasks: [],
  items: [],
};

const sessionTemplate: ProgramTemplateMaterialization = {
  ...baseTemplate,
  id: 'template-session',
  templateType: 'session',
  title: 'Finishing session',
  defaultActivityCategoryId: 'category-coach',
  defaultActivityCategoryName: 'Finishing',
  items: [
    {
      id: 'session-task-item',
      itemType: 'task_template',
      title: 'Warm-up drill',
      description: null,
      sourceTaskTemplateId: 'task-template',
      linkedTemplateId: 'linked-task-template',
      config: { task: { reminderMinutes: 15, videoUrls: ['https://example.com/warmup.mp4'], mediaNames: ['Warm-up'] } },
      sortOrder: 0,
      subtasks: [{ title: 'Right foot', sortOrder: 0 }],
    },
    {
      id: 'session-exercise-item',
      itemType: 'exercise',
      title: 'Finishing exercise',
      description: 'Five repetitions',
      sourceTaskTemplateId: 'exercise-task-template',
      linkedTemplateId: 'linked-exercise-template',
      config: { timer: { activeSeconds: 45, restSeconds: 15, rounds: 3 } },
      sortOrder: 1,
      subtasks: [],
    },
  ],
};

const taskTemplate: ProgramTemplateMaterialization = {
  ...baseTemplate,
  id: 'template-task',
  templateType: 'task',
  title: 'Solo touches',
  description: 'Complete the ball work',
  sourceTaskTemplateId: 'source-task-template',
  metadata: { task: { reminderMinutes: 30, categoryIds: ['coach-category'], afterTrainingEnabled: false } },
  subtasks: [{ title: '100 right-foot touches', sortOrder: 0 }],
};

const exerciseTemplate: ProgramTemplateMaterialization = {
  ...baseTemplate,
  id: 'template-exercise',
  templateType: 'exercise',
  title: 'Sprint intervals',
  metadata: {
    task: { videoUrls: ['https://example.com/sprint.mp4'] },
    timer: { activeSeconds: 30, restSeconds: 20, rounds: 8 },
  },
};

const templates = new Map([
  [sessionTemplate.id, sessionTemplate],
  [taskTemplate.id, taskTemplate],
  [exerciseTemplate.id, exerciseTemplate],
]);

const program = {
  id: 'program-1',
  phases: [{ id: 'phase-1', week_offset: 0, duration_weeks: 1 }],
  items: [
    {
      id: 'focus-item', phase_id: 'phase-1', item_type: 'focus', training_template_id: null, title: 'Focus', day_offset: 0,
      config: { scheduling: { weekday: 'sunday', weekInPhase: 1 } },
    },
    {
      id: 'task-item', phase_id: 'phase-1', item_type: 'task_template', training_template_id: 'template-task', title: 'Daily touches', day_offset: 0,
      config: { scheduling: { weekday: 'tuesday', weekInPhase: 1 } },
    },
    {
      id: 'exercise-item', phase_id: 'phase-1', item_type: 'exercise_template', training_template_id: 'template-exercise', title: 'Sprint work', day_offset: 0,
      config: { scheduling: { weekday: 'wednesday', weekInPhase: 1 } },
    },
    {
      id: 'session-item', phase_id: 'phase-1', item_type: 'session_template', training_template_id: 'template-session', title: 'Session', day_offset: 0,
      config: { scheduling: { weekday: 'monday', weekInPhase: 1 } },
    },
  ],
};

describe('program enrollment materialization plan', () => {
  it('always supplies the required activity time and server-resolved date', () => {
    const plans = buildProgramEnrollmentPlayerPlans({ program, startDate: '2026-07-12', playerIds: ['player-1'], templates });
    const session = plans[0].items.find((item) => item.programItemId === 'session-item');
    expect(DEFAULT_PROGRAM_ACTIVITY_TIME).toBe('12:00:00');
    expect(session).toMatchObject({
      scheduledDate: '2026-07-13',
      activity: {
        title: 'Finishing session', activityDate: '2026-07-13', activityTime: '12:00:00',
        sourceCategoryId: 'category-coach', sourceCategoryName: 'Finishing',
      },
    });
  });

  it('freezes rich session task and exercise fields without response-order coupling', () => {
    const [plan] = buildProgramEnrollmentPlayerPlans({ program: { ...program, items: [...program.items].reverse() }, startDate: '2026-07-12', playerIds: ['player-1'], templates });
    const session = plan.items.find((item) => item.programItemId === 'session-item');
    expect(session?.activity?.tasks).toEqual([
      expect.objectContaining({
        itemId: 'session-task-item', title: 'Warm-up drill', reminderMinutes: 15,
        taskTemplateId: 'task-template', trainingTemplateId: 'linked-task-template', trainingTemplateType: 'task',
        videoUrls: ['https://example.com/warmup.mp4'], mediaNames: ['Warm-up'],
        subtasks: [{ title: 'Right foot', sortOrder: 0 }],
      }),
      expect.objectContaining({
        itemId: 'session-exercise-item', title: 'Finishing exercise', taskTemplateId: 'exercise-task-template',
        trainingTemplateId: 'linked-exercise-template', trainingTemplateType: 'exercise',
        exerciseTimer: { activeSeconds: 45, restSeconds: 15, rounds: 3 },
      }),
    ]);
  });

  it('creates dated standalone task and exercise plans with immutable template details', () => {
    const [plan] = buildProgramEnrollmentPlayerPlans({ program, startDate: '2026-07-12', playerIds: ['player-1'], templates });
    expect(plan.items.find((item) => item.programItemId === 'task-item')).toMatchObject({
      scheduledDate: '2026-07-14',
      task: {
        title: 'Daily touches', description: 'Complete the ball work', reminderMinutes: 30,
        taskTemplateId: 'source-task-template', trainingTemplateId: 'template-task', trainingTemplateType: 'task',
        subtasks: [{ title: '100 right-foot touches', sortOrder: 0 }],
      },
    });
    expect(plan.items.find((item) => item.programItemId === 'exercise-item')).toMatchObject({
      scheduledDate: '2026-07-15',
      task: {
        title: 'Sprint work', trainingTemplateId: 'template-exercise', trainingTemplateType: 'exercise',
        videoUrls: ['https://example.com/sprint.mp4'], exerciseTimer: { activeSeconds: 30, restSeconds: 20, rounds: 8 },
      },
    });
    expect(plan.items.find((item) => item.programItemId === 'focus-item')?.task).toBeNull();
  });

  it('fails before writes when a required template is missing or has the wrong type', () => {
    const missingSession = new Map(templates); missingSession.delete('template-session');
    expect(() => buildProgramEnrollmentPlayerPlans({ program, startDate: '2026-07-12', playerIds: ['player-1'], templates: missingSession }))
      .toThrow('Session template is unavailable for program item "Session".');
    const wrongType = new Map(templates); wrongType.set('template-task', { ...taskTemplate, templateType: 'exercise' });
    expect(() => buildProgramEnrollmentPlayerPlans({ program, startDate: '2026-07-12', playerIds: ['player-1'], templates: wrongType }))
      .toThrow('Task template is unavailable for program item "Daily touches".');
  });

  it('keeps published materialization independent of later live template edits', () => {
    const publishedSnapshot = JSON.parse(JSON.stringify({
      ...program,
      enrollmentMaterialization: { activityTime: DEFAULT_PROGRAM_ACTIVITY_TIME, templates: serializeProgramTemplates(templates) },
    }));
    const embeddedTemplates = readProgramTemplates(publishedSnapshot);
    expect(embeddedTemplates?.get(sessionTemplate.id)?.title).toBe('Finishing session');
    const [plan] = buildProgramEnrollmentPlayerPlans({ program: publishedSnapshot, startDate: '2026-07-12', playerIds: ['player-1'], templates: embeddedTemplates! });
    expect(plan.items.find((item) => item.programItemId === 'session-item')?.activity?.title).toBe('Finishing session');
    expect(plan.items.find((item) => item.programItemId === 'task-item')?.task?.title).toBe('Daily touches');
  });

  it('still reads the session-only snapshot shape published by backend version 8', () => {
    const legacySnapshot = {
      enrollmentMaterialization: {
        sessionTemplates: { [sessionTemplate.id]: sessionTemplate },
      },
    };
    expect(readProgramTemplates(legacySnapshot)?.get(sessionTemplate.id)?.templateType).toBe('session');
  });
});
