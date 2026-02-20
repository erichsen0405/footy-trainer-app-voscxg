import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';

export interface ArchiveVisibilityTask {
  id?: string;
  title?: string | null;
  description?: string | null;
  task_template_id?: string | null;
  taskTemplateId?: string | null;
  feedback_template_id?: string | null;
  feedbackTemplateId?: string | null;
}

export type TemplateArchivedAtById = Record<string, string | null | undefined>;

const normalizeId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

const toActivityDateTimeMs = (activityDate: string | Date | null | undefined, activityTime?: string | null): number | null => {
  if (!activityDate) return null;

  const isoDate =
    activityDate instanceof Date
      ? Number.isFinite(activityDate.getTime())
        ? activityDate.toISOString().slice(0, 10)
        : null
      : String(activityDate).slice(0, 10);

  if (!isoDate || isoDate.length !== 10) return null;

  const rawTime = typeof activityTime === 'string' ? activityTime.trim() : '';
  const hhmm = rawTime.length >= 5 ? rawTime.slice(0, 5) : '00:00';

  const composed = `${isoDate}T${hhmm}:00`;
  const ms = Date.parse(composed);
  return Number.isFinite(ms) ? ms : null;
};

const resolveTemplateId = (task: ArchiveVisibilityTask | null | undefined): string | null => {
  if (!task) return null;

  const directTemplate = normalizeId(task.taskTemplateId ?? task.task_template_id);
  if (directTemplate) return directTemplate;

  const directFeedbackTemplate = normalizeId(task.feedbackTemplateId ?? task.feedback_template_id);
  if (directFeedbackTemplate) return directFeedbackTemplate;

  const markerTemplate =
    parseTemplateIdFromMarker(typeof task.description === 'string' ? task.description : '') ||
    parseTemplateIdFromMarker(typeof task.title === 'string' ? task.title : '');

  return normalizeId(markerTemplate);
};

export const isTaskVisibleForActivity = (
  task: ArchiveVisibilityTask,
  activityDate: string | Date | null | undefined,
  activityTime: string | null | undefined,
  archivedAtByTemplateId: TemplateArchivedAtById,
): boolean => {
  const templateId = resolveTemplateId(task);
  if (!templateId) return true;

  const archivedAt = archivedAtByTemplateId[templateId];
  if (!archivedAt) return true;

  const activityMs = toActivityDateTimeMs(activityDate, activityTime);
  const archivedAtMs = Date.parse(String(archivedAt));

  if (!Number.isFinite(archivedAtMs) || activityMs === null) {
    return true;
  }

  return activityMs <= archivedAtMs;
};

export const filterVisibleTasksForActivity = <T extends ArchiveVisibilityTask>(
  tasks: T[] | null | undefined,
  activityDate: string | Date | null | undefined,
  activityTime: string | null | undefined,
  archivedAtByTemplateId: TemplateArchivedAtById,
): T[] => {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  return tasks.filter((task) =>
    isTaskVisibleForActivity(task, activityDate, activityTime, archivedAtByTemplateId)
  );
};
