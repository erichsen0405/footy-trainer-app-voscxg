import type { Task, TaskTemplateSelfFeedback } from '@/types';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
}

function normalizeFeedbackTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isFeedbackTitle(value: unknown): boolean {
  const normalized = normalizeFeedbackTitle(value);
  return normalized.startsWith('feedback pa') || normalized.startsWith('feedback on');
}

function getTaskFeedbackTemplateId(task: any): string | null {
  return (
    normalizeId(task?.feedbackTemplateId ?? task?.feedback_template_id) ??
    normalizeId(parseTemplateIdFromMarker(typeof task?.description === 'string' ? task.description : '')) ??
    normalizeId(parseTemplateIdFromMarker(typeof task?.title === 'string' ? task.title : '')) ??
    (isFeedbackTitle(task?.title)
      ? normalizeId(task?.taskTemplateId ?? task?.task_template_id)
      : null)
  );
}

function isFeedbackAnswered(row: TaskTemplateSelfFeedback): boolean {
  return typeof row.rating === 'number' || String(row.note ?? '').trim().length > 0;
}

function safeDateMs(value: unknown): number {
  const ms = new Date(String(value ?? '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function buildVirtualFeedbackTask(row: TaskTemplateSelfFeedback): Task | null {
  const templateId = normalizeId(row.taskTemplateId);
  const activityId = normalizeId(row.activityId);
  if (!templateId || !activityId || !isFeedbackAnswered(row)) return null;

  const taskInstanceId = normalizeId(row.taskInstanceId);
  const taskTitle = normalizeId(row.taskTemplateTitle) ?? 'Feedback task';
  const virtualId = taskInstanceId && taskInstanceId !== templateId
    ? taskInstanceId
    : `feedback:${activityId}:${templateId}`;

  return {
    id: virtualId,
    title: `Feedback på ${taskTitle}`,
    description: `[auto-after-training:${templateId}]`,
    completed: true,
    isTemplate: false,
    categoryIds: [],
    reminder: null,
    subtasks: [],
    feedbackTemplateId: templateId,
    taskTemplateId: templateId,
    isFeedbackTask: true,
  };
}

export function appendVirtualFeedbackTasks<TActivity extends { tasks?: any[] }>(
  activity: TActivity,
  rows: TaskTemplateSelfFeedback[],
): TActivity {
  const existingTasks = Array.isArray(activity?.tasks) ? activity.tasks : [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return activity;
  }

  const existingTemplateIds = new Set<string>();
  const existingTaskIds = new Set<string>();
  existingTasks.forEach((task) => {
    const taskId = normalizeId(task?.id ?? task?.task_id);
    if (taskId) existingTaskIds.add(taskId);

    const templateId = getTaskFeedbackTemplateId(task);
    if (templateId) existingTemplateIds.add(templateId);
  });

  const latestByTemplate = new Map<string, TaskTemplateSelfFeedback>();
  rows.forEach((row) => {
    if (!isFeedbackAnswered(row)) return;
    const templateId = normalizeId(row.taskTemplateId);
    if (!templateId || existingTemplateIds.has(templateId)) return;

    const existing = latestByTemplate.get(templateId);
    if (!existing || safeDateMs(row.createdAt) > safeDateMs(existing.createdAt)) {
      latestByTemplate.set(templateId, row);
    }
  });

  const virtualTasks = Array.from(latestByTemplate.values())
    .map(buildVirtualFeedbackTask)
    .filter((task): task is Task => {
      if (!task) return false;
      if (existingTaskIds.has(task.id)) return false;
      existingTaskIds.add(task.id);
      return true;
    });

  if (!virtualTasks.length) {
    return activity;
  }

  return {
    ...activity,
    tasks: [...existingTasks, ...virtualTasks],
  };
}

export function appendVirtualFeedbackTasksForActivityCandidates<TActivity extends { tasks?: any[] }>(
  activity: TActivity,
  rows: TaskTemplateSelfFeedback[],
  activityIdCandidates: string[],
): TActivity {
  const candidateSet = new Set(
    activityIdCandidates
      .map((id) => normalizeId(id))
      .filter((id): id is string => id !== null),
  );
  if (!candidateSet.size) return activity;

  const matchingRows = rows.filter((row) => {
    const activityId = normalizeId(row.activityId);
    return !!activityId && candidateSet.has(activityId);
  });

  return appendVirtualFeedbackTasks(activity, matchingRows);
}
