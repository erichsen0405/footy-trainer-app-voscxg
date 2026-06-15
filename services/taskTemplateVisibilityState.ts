import { supabase } from '@/integrations/supabase/client';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import type {
  ArchiveVisibilityTask,
  TemplateArchivePeriod,
  TemplateCategoryPeriod,
  TemplateVisibilityById,
  TemplateVisibilityState,
} from '@/utils/taskTemplateVisibility';

const normalizeId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

export const collectTemplateIdsFromTasks = (tasks: (ArchiveVisibilityTask | any)[]): string[] => {
  const ids = new Set<string>();

  (tasks || []).forEach((task) => {
    const directTemplateId = normalizeId(task?.task_template_id ?? task?.taskTemplateId);
    if (directTemplateId) ids.add(directTemplateId);

    const feedbackTemplateId = normalizeId(task?.feedback_template_id ?? task?.feedbackTemplateId);
    if (feedbackTemplateId) ids.add(feedbackTemplateId);

    const markerTemplateId =
      parseTemplateIdFromMarker(typeof task?.description === 'string' ? task.description : '') ||
      parseTemplateIdFromMarker(typeof task?.title === 'string' ? task.title : '');
    const normalizedMarkerId = normalizeId(markerTemplateId);
    if (normalizedMarkerId) ids.add(normalizedMarkerId);
  });

  return Array.from(ids);
};

const normalizeArchivePeriods = (value: unknown): TemplateArchivePeriod[] => {
  if (!Array.isArray(value)) return [];
  const periods: TemplateArchivePeriod[] = [];
  value.forEach((period) => {
    if (!period || typeof period !== 'object') return;
    const item = period as Record<string, unknown>;
    const archivedAt = normalizeId(item.archivedAt ?? item.archived_at);
    if (!archivedAt) return;
    periods.push({
      archivedAt,
      reactivatedAt: normalizeId(item.reactivatedAt ?? item.reactivated_at),
    });
  });
  return periods;
};

const normalizeCategoryPeriods = (value: unknown): TemplateCategoryPeriod[] => {
  if (!Array.isArray(value)) return [];
  const periods: TemplateCategoryPeriod[] = [];
  value.forEach((period) => {
    if (!period || typeof period !== 'object') return;
    const item = period as Record<string, unknown>;
    const categoryId = normalizeId(item.categoryId ?? item.category_id);
    const assignedAt = normalizeId(item.assignedAt ?? item.assigned_at);
    if (!categoryId || !assignedAt) return;
    periods.push({
      categoryId,
      assignedAt,
      removedAt: normalizeId(item.removedAt ?? item.removed_at),
    });
  });
  return periods;
};

const fetchLegacyArchiveState = async (templateIds: string[]): Promise<TemplateVisibilityById> => {
  if (!templateIds.length) return {};

  const { data, error } = await (supabase as any)
    .from('task_templates')
    .select('id, archived_at')
    .in('id', templateIds);

  if (error || !Array.isArray(data)) return {};

  const map: TemplateVisibilityById = {};
  data.forEach((row: any) => {
    const id = normalizeId(row?.id);
    if (!id) return;
    map[id] = {
      archivedAt: normalizeId(row?.archived_at),
      archivePeriods: normalizeId(row?.archived_at)
        ? [{ archivedAt: normalizeId(row?.archived_at), reactivatedAt: null }]
        : [],
      categoryPeriods: [],
    };
  });

  return map;
};

export const fetchTaskTemplateVisibilityStateByIds = async (
  templateIds: string[],
): Promise<TemplateVisibilityById> => {
  const ids = Array.from(new Set(templateIds.map(normalizeId).filter((id): id is string => Boolean(id))));
  if (!ids.length) return {};

  try {
    const { data, error } = await (supabase as any).rpc('get_task_template_visibility_state', {
      p_template_ids: ids,
    });

    if (error) {
      return fetchLegacyArchiveState(ids);
    }

    const map: TemplateVisibilityById = {};
    (Array.isArray(data) ? data : []).forEach((row: any) => {
      const templateId = normalizeId(row?.template_id ?? row?.templateId);
      if (!templateId) return;

      const state: TemplateVisibilityState = {
        archivedAt: normalizeId(row?.archived_at ?? row?.archivedAt),
        archivePeriods: normalizeArchivePeriods(row?.archive_periods ?? row?.archivePeriods),
        categoryPeriods: normalizeCategoryPeriods(row?.category_periods ?? row?.categoryPeriods),
      };

      map[templateId] = state;
    });

    const missingIds = ids.filter((id) => !map[id]);
    if (missingIds.length) {
      return {
        ...map,
        ...(await fetchLegacyArchiveState(missingIds)),
      };
    }

    return map;
  } catch {
    return fetchLegacyArchiveState(ids);
  }
};

export const fetchTaskTemplateVisibilityStateForTasks = async (
  tasks: (ArchiveVisibilityTask | any)[],
): Promise<TemplateVisibilityById> =>
  fetchTaskTemplateVisibilityStateByIds(collectTemplateIdsFromTasks(tasks));
