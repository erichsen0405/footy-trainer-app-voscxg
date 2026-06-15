import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';

export interface ArchiveVisibilityTask {
  id?: string;
  title?: string | null;
  description?: string | null;
  completed?: boolean | null;
  task_template_id?: string | null;
  taskTemplateId?: string | null;
  feedback_template_id?: string | null;
  feedbackTemplateId?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
}

export type TemplateArchivePeriod = {
  archivedAt?: string | null;
  archived_at?: string | null;
  reactivatedAt?: string | null;
  reactivated_at?: string | null;
};

export type TemplateCategoryPeriod = {
  categoryId?: string | null;
  category_id?: string | null;
  assignedAt?: string | null;
  assigned_at?: string | null;
  removedAt?: string | null;
  removed_at?: string | null;
};

export type TemplateVisibilityState = {
  archivedAt?: string | null;
  archived_at?: string | null;
  archivePeriods?: TemplateArchivePeriod[] | null;
  archive_periods?: TemplateArchivePeriod[] | null;
  categoryPeriods?: TemplateCategoryPeriod[] | null;
  category_periods?: TemplateCategoryPeriod[] | null;
  categoryPeriodsById?: Record<string, TemplateCategoryPeriod[] | null | undefined> | null;
};

export type TemplateVisibilityById = Record<string, string | TemplateVisibilityState | null | undefined>;
export type TemplateArchivedAtById = TemplateVisibilityById;

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

const resolveTaskCreatedAtMs = (task: ArchiveVisibilityTask | null | undefined): number | null => {
  const createdAt = task?.createdAt ?? task?.created_at;
  if (!createdAt) return null;
  const ms = Date.parse(String(createdAt));
  return Number.isFinite(ms) ? ms : null;
};

const parseTimestampMs = (value: unknown): number | null => {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
};

const resolveTemplateVisibilityState = (
  visibilityByTemplateId: TemplateVisibilityById,
  templateId: string,
): TemplateVisibilityState | null => {
  const raw = visibilityByTemplateId?.[templateId];
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') return { archivedAt: raw };
  if (typeof raw === 'object') return raw;
  return null;
};

const getArchivePeriods = (state: TemplateVisibilityState | null): TemplateArchivePeriod[] => {
  if (!state) return [];

  const explicitPeriods = state.archivePeriods ?? state.archive_periods;
  if (Array.isArray(explicitPeriods) && explicitPeriods.length > 0) {
    return explicitPeriods;
  }

  const archivedAt = state.archivedAt ?? state.archived_at;
  return archivedAt ? [{ archivedAt, reactivatedAt: null }] : [];
};

const getAllCategoryPeriods = (state: TemplateVisibilityState | null): TemplateCategoryPeriod[] => {
  if (!state) return [];

  const periods = state.categoryPeriods ?? state.category_periods;
  const flatPeriods = Array.isArray(periods) ? periods : [];
  const groupedPeriods = state.categoryPeriodsById
    ? Object.values(state.categoryPeriodsById).flatMap((value) => (Array.isArray(value) ? value : []))
    : [];

  return [...flatPeriods, ...groupedPeriods];
};

const getCategoryPeriodsForActivity = (
  state: TemplateVisibilityState | null,
  activityCategoryId: string | null,
): TemplateCategoryPeriod[] => {
  if (!state || !activityCategoryId) return [];

  const grouped = state.categoryPeriodsById?.[activityCategoryId];
  if (Array.isArray(grouped) && grouped.length > 0) return grouped;

  return getAllCategoryPeriods(state).filter((period) => {
    const categoryId = normalizeId(period.categoryId ?? period.category_id);
    return categoryId === activityCategoryId;
  });
};

const isActivityInsideArchivePeriod = (
  state: TemplateVisibilityState | null,
  activityMs: number | null,
): boolean => {
  if (activityMs === null) return false;

  return getArchivePeriods(state).some((period) => {
    const archivedAtMs = parseTimestampMs(period.archivedAt ?? period.archived_at);
    if (archivedAtMs === null || activityMs <= archivedAtMs) return false;

    const reactivatedAtMs = parseTimestampMs(period.reactivatedAt ?? period.reactivated_at);
    return reactivatedAtMs === null || activityMs < reactivatedAtMs;
  });
};

const isActivityInsideCategoryPeriod = (
  state: TemplateVisibilityState | null,
  activityCategoryId: string | null,
  activityMs: number | null,
): boolean => {
  if (!state || !activityCategoryId || activityMs === null) return true;

  const allCategoryPeriods = getAllCategoryPeriods(state);
  if (allCategoryPeriods.length === 0) return true;

  const relevantPeriods = getCategoryPeriodsForActivity(state, activityCategoryId);
  if (relevantPeriods.length === 0) return false;

  return relevantPeriods.some((period) => {
    const assignedAtMs = parseTimestampMs(period.assignedAt ?? period.assigned_at);
    if (assignedAtMs === null || activityMs < assignedAtMs) return false;

    const removedAtMs = parseTimestampMs(period.removedAt ?? period.removed_at);
    return removedAtMs === null || activityMs <= removedAtMs;
  });
};

export const isTaskVisibleForActivity = (
  task: ArchiveVisibilityTask,
  activityDate: string | Date | null | undefined,
  activityTime: string | null | undefined,
  visibilityByTemplateId: TemplateArchivedAtById,
  activityCategoryId?: string | null,
): boolean => {
  const templateId = resolveTemplateId(task);
  if (!templateId) return true;

  const activityMs = toActivityDateTimeMs(activityDate, activityTime);
  const visibilityState = resolveTemplateVisibilityState(visibilityByTemplateId, templateId);
  const normalizedActivityCategoryId = normalizeId(activityCategoryId);

  if (!isActivityInsideCategoryPeriod(visibilityState, normalizedActivityCategoryId, activityMs)) {
    return false;
  }

  if (isActivityInsideArchivePeriod(visibilityState, activityMs)) {
    return false;
  }

  // Preserve manually completed legacy/history rows when no visibility period excludes them.
  if (task?.completed === true) return true;

  const taskCreatedAtMs = resolveTaskCreatedAtMs(task);
  if (activityMs !== null && taskCreatedAtMs !== null && taskCreatedAtMs > activityMs) {
    return false;
  }
  return true;
};

export const filterVisibleTasksForActivity = <T extends ArchiveVisibilityTask>(
  tasks: T[] | null | undefined,
  activityDate: string | Date | null | undefined,
  activityTime: string | null | undefined,
  visibilityByTemplateId: TemplateArchivedAtById,
  activityCategoryId?: string | null,
): T[] => {
  if (!Array.isArray(tasks) || tasks.length === 0) return [];

  return tasks.filter((task) =>
    isTaskVisibleForActivity(task, activityDate, activityTime, visibilityByTemplateId, activityCategoryId)
  );
};
