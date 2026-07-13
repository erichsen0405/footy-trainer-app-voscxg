// @ts-ignore Deno edge functions require explicit file extensions for relative imports.
import { getProgramItemSchedule } from './programEnrollmentPreview.ts';

export const DEFAULT_PROGRAM_ACTIVITY_TIME = '12:00:00';

export type ProgramMaterializedSubtask = {
  title: string;
  sortOrder: number;
};

export type ProgramTaskMaterialization = {
  itemId: string | null;
  sortOrder: number;
  title: string;
  description: string;
  completed: false;
  categoryIds: string[];
  subtasks: ProgramMaterializedSubtask[];
  videoUrls: string[];
  mediaNames: string[];
  reminderMinutes: number | null;
  afterTrainingEnabled: boolean;
  afterTrainingDelayMinutes: number | null;
  afterTrainingFeedbackEnableScore: boolean;
  afterTrainingFeedbackScoreExplanation: string | null;
  afterTrainingFeedbackEnableIntensity: boolean;
  afterTrainingFeedbackEnableNote: boolean;
  taskDurationEnabled: boolean;
  taskDurationMinutes: number | null;
  autoAddToActivities: boolean;
  taskTemplateId: string | null;
  trainingTemplateId: string | null;
  trainingTemplateType: 'task' | 'exercise';
  exerciseTimer: Record<string, any> | null;
};

export type ProgramTemplateMaterialization = {
  id: string;
  templateType: string;
  title: string;
  description: string | null;
  defaultActivityCategoryId: string | null;
  defaultActivityCategoryName: string | null;
  sourceTaskTemplateId: string | null;
  metadata: Record<string, any>;
  subtasks: ProgramMaterializedSubtask[];
  items: Array<{
    id: string | null;
    itemType: string;
    title: string;
    description: string | null;
    sourceTaskTemplateId: string | null;
    linkedTemplateId: string | null;
    config: Record<string, any>;
    sortOrder: number;
    subtasks: ProgramMaterializedSubtask[];
  }>;
};

export type ProgramEnrollmentPlayerPlan = {
  playerId: string;
  items: Array<{
    programItemId: string;
    itemType: string;
    title: string;
    scheduledDate: string;
    snapshot: Record<string, any>;
    task: ProgramTaskMaterialization | null;
    activity: null | {
      title: string;
      activityDate: string;
      activityTime: string;
      sourceCategoryId: string | null;
      sourceCategoryName: string | null;
      tasks: ProgramTaskMaterialization[];
    };
  }>;
};

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function stringList(value: unknown, max = 20): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(values.map(optionalString).filter((item): item is string => Boolean(item)))].slice(0, max);
}

function nullableInteger(value: unknown, min: number, max: number): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

function normalizeSubtasks(value: unknown): ProgramMaterializedSubtask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((subtask, index) => ({
      title: optionalString(asRecord(subtask).title) ?? '',
      sortOrder: nullableInteger(asRecord(subtask).sortOrder ?? asRecord(subtask).sort_order, 0, 999) ?? index,
    }))
    .filter((subtask) => Boolean(subtask.title));
}

function buildTaskMaterialization(input: {
  itemId?: string | null;
  sortOrder?: number;
  itemType: 'task' | 'exercise';
  title: string;
  description: string | null;
  config: Record<string, any>;
  subtasks?: ProgramMaterializedSubtask[];
  taskTemplateId: string | null;
  trainingTemplateId: string | null;
}): ProgramTaskMaterialization {
  const taskConfig = asRecord(input.config.task ?? input.config);
  const videoUrls = stringList(taskConfig.videoUrls ?? taskConfig.video_urls ?? taskConfig.videoUrl ?? taskConfig.video_url);
  const mediaNames = stringList(taskConfig.mediaNames ?? taskConfig.media_names, videoUrls.length);
  const afterTrainingEnabled = taskConfig.afterTrainingEnabled === true || taskConfig.after_training_enabled === true;
  const taskDurationEnabled = taskConfig.taskDurationEnabled === true || taskConfig.task_duration_enabled === true;
  const timer = input.itemType === 'exercise' ? asRecord(input.config.timer) : {};
  const exerciseTimer = input.itemType === 'exercise' && Object.keys(timer).length
    ? {
      activeSeconds: nullableInteger(timer.activeSeconds ?? timer.active_seconds ?? timer.workSeconds, 5, 3600) ?? 45,
      restSeconds: nullableInteger(timer.restSeconds ?? timer.rest_seconds ?? timer.pauseSeconds, 0, 1800) ?? 15,
      rounds: nullableInteger(timer.rounds, 1, 99) ?? 3,
    }
    : null;

  return {
    itemId: input.itemId ?? null,
    sortOrder: input.sortOrder ?? 0,
    title: optionalString(taskConfig.title) ?? input.title,
    description: optionalString(taskConfig.description) ?? input.description ?? '',
    completed: false,
    categoryIds: stringList(taskConfig.categoryIds ?? taskConfig.category_ids, 24),
    subtasks: input.subtasks ?? normalizeSubtasks(taskConfig.subtasks),
    videoUrls,
    mediaNames,
    reminderMinutes: nullableInteger(taskConfig.reminderMinutes ?? taskConfig.reminder_minutes ?? taskConfig.reminder, 0, 1440),
    afterTrainingEnabled,
    afterTrainingDelayMinutes: afterTrainingEnabled
      ? nullableInteger(taskConfig.afterTrainingDelayMinutes ?? taskConfig.after_training_delay_minutes, 0, 600)
      : null,
    afterTrainingFeedbackEnableScore: taskConfig.afterTrainingFeedbackEnableScore !== false
      && taskConfig.after_training_feedback_enable_score !== false,
    afterTrainingFeedbackScoreExplanation: optionalString(
      taskConfig.afterTrainingFeedbackScoreExplanation ?? taskConfig.after_training_feedback_score_explanation,
    ),
    afterTrainingFeedbackEnableIntensity: taskConfig.afterTrainingFeedbackEnableIntensity === true
      || taskConfig.after_training_feedback_enable_intensity === true,
    afterTrainingFeedbackEnableNote: taskConfig.afterTrainingFeedbackEnableNote !== false
      && taskConfig.after_training_feedback_enable_note !== false,
    taskDurationEnabled,
    taskDurationMinutes: taskDurationEnabled
      ? nullableInteger(taskConfig.taskDurationMinutes ?? taskConfig.task_duration_minutes, 0, 600)
      : null,
    autoAddToActivities: taskConfig.autoAddToActivities === true || taskConfig.auto_add_to_activities === true,
    taskTemplateId: input.taskTemplateId,
    trainingTemplateId: input.trainingTemplateId,
    trainingTemplateType: input.itemType,
    exerciseTimer,
  };
}

function normalizeSerializedTemplate(key: string, value: unknown): ProgramTemplateMaterialization | null {
  const template = asRecord(value);
  if (template.id !== key || !Array.isArray(template.items)) return null;
  return {
    id: key,
    templateType: optionalString(template.templateType) ?? 'session',
    title: optionalString(template.title) ?? '',
    description: optionalString(template.description),
    defaultActivityCategoryId: optionalString(template.defaultActivityCategoryId),
    defaultActivityCategoryName: optionalString(template.defaultActivityCategoryName),
    sourceTaskTemplateId: optionalString(template.sourceTaskTemplateId),
    metadata: asRecord(template.metadata),
    subtasks: normalizeSubtasks(template.subtasks),
    items: template.items.map((rawItem: unknown, index: number) => {
      const item = asRecord(rawItem);
      return {
        id: optionalString(item.id),
        itemType: optionalString(item.itemType) ?? '',
        title: optionalString(item.title) ?? '',
        description: optionalString(item.description),
        sourceTaskTemplateId: optionalString(item.sourceTaskTemplateId),
        linkedTemplateId: optionalString(item.linkedTemplateId),
        config: asRecord(item.config),
        sortOrder: nullableInteger(item.sortOrder, 0, 999) ?? index,
        subtasks: normalizeSubtasks(item.subtasks),
      };
    }),
  };
}

export function serializeProgramTemplates(
  templates: Map<string, ProgramTemplateMaterialization>,
): Record<string, ProgramTemplateMaterialization> {
  return Object.fromEntries(templates.entries());
}

export function readProgramTemplates(
  programSnapshot: Record<string, any>,
): Map<string, ProgramTemplateMaterialization> | null {
  const materialization = asRecord(programSnapshot.enrollmentMaterialization);
  const serialized = materialization.templates ?? materialization.sessionTemplates;
  if (!serialized || typeof serialized !== 'object' || Array.isArray(serialized)) return null;
  const output = new Map<string, ProgramTemplateMaterialization>();
  for (const [key, value] of Object.entries(serialized)) {
    const normalized = normalizeSerializedTemplate(key, value);
    if (!normalized) return null;
    output.set(key, normalized);
  }
  return output;
}

function taskFromStandaloneTemplate(
  template: ProgramTemplateMaterialization,
  programItem: Record<string, any>,
): ProgramTaskMaterialization {
  const templateType = template.templateType === 'exercise' ? 'exercise' : 'task';
  const materialized = buildTaskMaterialization({
    itemType: templateType,
    title: template.title,
    description: template.description,
    config: template.metadata,
    subtasks: template.subtasks,
    taskTemplateId: template.sourceTaskTemplateId,
    trainingTemplateId: template.id,
  });
  return {
    ...materialized,
    title: optionalString(programItem.title) ?? materialized.title,
    description: optionalString(programItem.description) ?? materialized.description,
  };
}

function tasksFromSessionTemplate(template: ProgramTemplateMaterialization) {
  return template.items
    .filter((item) => item.itemType === 'task_template' || item.itemType === 'exercise')
    .map((item) => buildTaskMaterialization({
      itemId: item.id,
      sortOrder: item.sortOrder,
      itemType: item.itemType === 'exercise' ? 'exercise' : 'task',
      title: item.title,
      description: item.description,
      config: item.config,
      subtasks: item.subtasks,
      taskTemplateId: item.sourceTaskTemplateId,
      trainingTemplateId: item.linkedTemplateId,
    }));
}

export function buildProgramEnrollmentPlayerPlans(input: {
  program: Record<string, any>;
  startDate: string;
  playerIds: string[];
  templates: Map<string, ProgramTemplateMaterialization>;
}): ProgramEnrollmentPlayerPlan[] {
  const programItems = Array.isArray(input.program.items) ? input.program.items : [];

  return input.playerIds.map((playerId) => ({
    playerId,
    items: programItems.map((programItem: any) => {
      const schedule = getProgramItemSchedule(input.program, input.startDate, programItem);
      const templateId = programItem.training_template_id ? String(programItem.training_template_id) : null;
      let task: ProgramTaskMaterialization | null = null;
      let activity: ProgramEnrollmentPlayerPlan['items'][number]['activity'] = null;

      if (programItem.item_type === 'task_template' || programItem.item_type === 'exercise_template') {
        const expectedType = programItem.item_type === 'exercise_template' ? 'exercise' : 'task';
        const template = templateId ? input.templates.get(templateId) : null;
        if (!template || template.templateType !== expectedType) {
          throw new Error(`${expectedType === 'exercise' ? 'Exercise' : 'Task'} template is unavailable for program item "${String(programItem.title ?? '')}".`);
        }
        task = taskFromStandaloneTemplate(template, programItem);
      }

      if (programItem.item_type === 'session_template') {
        const template = templateId ? input.templates.get(templateId) : null;
        if (!template || template.templateType !== 'session') {
          throw new Error(`Session template is unavailable for program item "${String(programItem.title ?? '')}".`);
        }
        activity = {
          title: template.title,
          activityDate: schedule.scheduledDate,
          activityTime: DEFAULT_PROGRAM_ACTIVITY_TIME,
          sourceCategoryId: template.defaultActivityCategoryId,
          sourceCategoryName: template.defaultActivityCategoryName,
          tasks: tasksFromSessionTemplate(template),
        };
      }

      const enrollmentMaterialization = task ? { task } : activity ? { activity } : null;
      return {
        programItemId: String(programItem.id),
        itemType: String(programItem.item_type),
        title: String(programItem.title),
        scheduledDate: schedule.scheduledDate,
        snapshot: { ...programItem, resolvedSchedule: schedule, enrollmentMaterialization },
        task,
        activity,
      };
    }),
  }));
}
