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

function stripFeedbackTitle(value: unknown): string {
  const title = normalizeId(value) ?? 'Feedback task';
  return title
    .replace(/^\s*feedback\s+(?:on|p(?:å|a\u030a|a))\s*[:\s-]*/i, '')
    .trim() || title;
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

function getTaskTemplateId(task: any): string | null {
  if (!task || getTaskFeedbackTemplateId(task)) return null;
  return normalizeId(task?.taskTemplateId ?? task?.task_template_id);
}

function isFeedbackAnswered(row: TaskTemplateSelfFeedback): boolean {
  return typeof row.rating === 'number' || String(row.note ?? '').trim().length > 0;
}

function safeDateMs(value: unknown): number {
  const ms = new Date(String(value ?? '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function getLatestAnsweredRowsByTemplate(rows: TaskTemplateSelfFeedback[]): TaskTemplateSelfFeedback[] {
  const latestByTemplate = new Map<string, TaskTemplateSelfFeedback>();
  rows.forEach((row) => {
    if (!isFeedbackAnswered(row)) return;
    const templateId = normalizeId(row.taskTemplateId);
    if (!templateId) return;

    const existing = latestByTemplate.get(templateId);
    if (!existing || safeDateMs(row.createdAt) > safeDateMs(existing.createdAt)) {
      latestByTemplate.set(templateId, row);
    }
  });
  return Array.from(latestByTemplate.values());
}

function buildVirtualScoredTask(row: TaskTemplateSelfFeedback): Task | null {
  const templateId = normalizeId(row.taskTemplateId);
  const activityId = normalizeId(row.activityId);
  if (!templateId || !activityId || !isFeedbackAnswered(row)) return null;

  const taskTitle = stripFeedbackTitle(row.taskTemplateTitle);

  return {
    id: `task:${activityId}:${templateId}`,
    title: taskTitle,
    description: row.taskTemplateDescription ?? '',
    completed: true,
    isTemplate: false,
    categoryIds: [],
    reminder: null,
    subtasks: [],
    taskTemplateId: templateId,
    isVirtualScoredTask: true,
  };
}

function buildVirtualFeedbackTask(row: TaskTemplateSelfFeedback): Task | null {
  const templateId = normalizeId(row.taskTemplateId);
  const activityId = normalizeId(row.activityId);
  if (!templateId || !activityId || !isFeedbackAnswered(row)) return null;

  const taskInstanceId = normalizeId(row.taskInstanceId);
  const taskTitle = stripFeedbackTitle(row.taskTemplateTitle);
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
    isVirtualFeedbackTask: true,
  };
}

export function appendVirtualScoredTasks<TActivity extends { tasks?: any[] }>(
  activity: TActivity,
  rows: TaskTemplateSelfFeedback[],
): TActivity {
  const existingTasks = Array.isArray(activity?.tasks) ? activity.tasks : [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return activity;
  }

  const existingTaskTemplateIds = new Set<string>();
  const existingFeedbackTemplateIds = new Set<string>();
  const existingTaskIds = new Set<string>();
  let changedExistingTask = false;
  const latestRows = getLatestAnsweredRowsByTemplate(rows);
  const scoredTemplateIds = new Set(
    latestRows
      .map((row) => normalizeId(row.taskTemplateId))
      .filter((id): id is string => id !== null),
  );

  const nextExistingTasks = existingTasks.map((task) => {
    const taskId = normalizeId(task?.id ?? task?.task_id);
    if (taskId) existingTaskIds.add(taskId);

    const feedbackTemplateId = getTaskFeedbackTemplateId(task);
    if (feedbackTemplateId) {
      existingFeedbackTemplateIds.add(feedbackTemplateId);
      if (scoredTemplateIds.has(feedbackTemplateId) && task?.completed !== true) {
        changedExistingTask = true;
        return { ...task, completed: true };
      }
      return task;
    }

    const taskTemplateId = getTaskTemplateId(task);
    if (taskTemplateId) {
      existingTaskTemplateIds.add(taskTemplateId);
      if (scoredTemplateIds.has(taskTemplateId) && task?.completed !== true) {
        changedExistingTask = true;
        return { ...task, completed: true };
      }
    }

    return task;
  });

  const virtualTasks = latestRows
    .flatMap((row) => {
      const templateId = normalizeId(row.taskTemplateId);
      if (!templateId) return [];
      const tasks: Task[] = [];
      if (!existingTaskTemplateIds.has(templateId)) {
        const scoredTask = buildVirtualScoredTask(row);
        if (scoredTask) tasks.push(scoredTask);
      }
      if (!existingFeedbackTemplateIds.has(templateId)) {
        const feedbackTask = buildVirtualFeedbackTask(row);
        if (feedbackTask) tasks.push(feedbackTask);
      }
      return tasks;
    })
    .filter((task): task is Task => {
      if (!task) return false;
      if (existingTaskIds.has(task.id)) return false;
      existingTaskIds.add(task.id);
      return true;
    });

  if (!changedExistingTask && !virtualTasks.length) {
    return activity;
  }

  return {
    ...activity,
    tasks: [...nextExistingTasks, ...virtualTasks],
  };
}

export function appendVirtualScoredTasksForActivityCandidates<TActivity extends { tasks?: any[] }>(
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

  return appendVirtualScoredTasks(activity, matchingRows);
}

export const appendVirtualFeedbackTasks = appendVirtualScoredTasks;
export const appendVirtualFeedbackTasksForActivityCandidates = appendVirtualScoredTasksForActivityCandidates;
