import { addDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import {
  buildCelebrationCompletionUnitKey,
  type CelebrationProgress,
  type CelebrationType,
  resolveCelebrationAfterCompletionFromUnits,
} from '@/utils/celebration';
import { isTaskVisibleForActivity } from '@/utils/taskTemplateVisibility';

type CelebrationRuntimeInput = {
  completingToDone: boolean;
  completedTaskId?: string | null;
  completedInternalIntensityId?: string | null;
  completedExternalIntensityId?: string | null;
  now?: Date;
  includeOverdue?: boolean;
};

type CelebrationRuntimeDecision = {
  type: CelebrationType | null;
  progress: CelebrationProgress | null;
};

type ExternalEventRelation =
  | {
      start_date?: string | null;
      deleted?: boolean | null;
    }
  | {
      start_date?: string | null;
      deleted?: boolean | null;
    }[]
  | null;

const safeTrim = (value: unknown): string => String(value ?? '').trim();
const normalizeId = (value: unknown): string | null => {
  const trimmed = safeTrim(value);
  return trimmed.length ? trimmed : null;
};

const isCompletedIntensity = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value);

const toExternalEvent = (value: ExternalEventRelation) => (Array.isArray(value) ? value[0] ?? null : value);
const toRelationObject = <T extends object>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] ?? null : value ?? null;

const getExternalDateTimeParts = (
  value: unknown
): { activityDate: string | null; activityTime: string | null } => {
  if (typeof value !== 'string') {
    return { activityDate: null, activityTime: null };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { activityDate: null, activityTime: null };
  }

  const separator = trimmed.includes('T') ? 'T' : trimmed.includes(' ') ? ' ' : null;
  if (!separator) {
    return { activityDate: trimmed.slice(0, 10), activityTime: null };
  }

  const [rawDate, rawTime = ''] = trimmed.split(separator);
  return {
    activityDate: rawDate ? rawDate.slice(0, 10) : null,
    activityTime: rawTime ? rawTime.replace('Z', '').slice(0, 8) : null,
  };
};

const normalizeFeedbackTitle = (value?: string | null): string => {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
};

const isFeedbackTitle = (value?: string | null): boolean => normalizeFeedbackTitle(value).startsWith('feedback pa');

const feedbackAnswered = (row: any): boolean =>
  typeof row?.rating === 'number' || (typeof row?.note === 'string' && row.note.trim().length > 0);

const resolveTaskTemplateId = (task: any): string | null => {
  const directTemplateId = normalizeId(task?.task_template_id);
  if (directTemplateId) return directTemplateId;

  const directFeedbackTemplateId = normalizeId(task?.feedback_template_id);
  if (directFeedbackTemplateId) return directFeedbackTemplateId;

  const markerTemplateId = normalizeId(
    parseTemplateIdFromMarker(typeof task?.description === 'string' ? task.description : '') ||
      parseTemplateIdFromMarker(typeof task?.title === 'string' ? task.title : '')
  );
  return markerTemplateId;
};

const getExternalActivityCandidateIds = (task: any): string[] => {
  const ids = new Set<string>();
  const meta = toRelationObject((task as any)?.events_local_meta);
  [task?.local_meta_id, meta?.id, meta?.external_event_id].forEach((value) => {
    const normalized = normalizeId(value);
    if (normalized) ids.add(normalized);
  });
  return Array.from(ids);
};

function resolveCompletedUnitKey(input: CelebrationRuntimeInput): string | null {
  const completedTaskId = safeTrim(input.completedTaskId);
  if (completedTaskId) {
    return buildCelebrationCompletionUnitKey('task', completedTaskId);
  }

  const completedInternalIntensityId = safeTrim(input.completedInternalIntensityId);
  if (completedInternalIntensityId) {
    return buildCelebrationCompletionUnitKey('internalIntensity', completedInternalIntensityId);
  }

  const completedExternalIntensityId = safeTrim(input.completedExternalIntensityId);
  if (completedExternalIntensityId) {
    return buildCelebrationCompletionUnitKey('externalIntensity', completedExternalIntensityId);
  }

  return null;
}

async function resolveTargetDateKey(input: CelebrationRuntimeInput): Promise<string | null> {
  const completedTaskId = safeTrim(input.completedTaskId);
  if (completedTaskId) {
    const internalTaskRes = await supabase
      .from('activity_tasks')
      .select('activities!inner(activity_date)')
      .eq('id', completedTaskId)
      .maybeSingle();
    if (internalTaskRes.error) throw internalTaskRes.error;

    const internalDate = safeTrim((internalTaskRes.data?.activities as any)?.activity_date).slice(0, 10);
    if (internalDate) return internalDate;

    const externalTaskRes = await supabase
      .from('external_event_tasks')
      .select('events_local_meta!inner(events_external!inner(start_date))')
      .eq('id', completedTaskId)
      .maybeSingle();
    if (externalTaskRes.error) throw externalTaskRes.error;

    const externalEvent = toExternalEvent((externalTaskRes.data?.events_local_meta as any)?.events_external ?? null);
    const externalDate = safeTrim(externalEvent?.start_date).slice(0, 10);
    if (externalDate) return externalDate;
  }

  const completedInternalIntensityId = safeTrim(input.completedInternalIntensityId);
  if (completedInternalIntensityId) {
    const internalIntensityRes = await supabase
      .from('activities')
      .select('activity_date')
      .eq('id', completedInternalIntensityId)
      .maybeSingle();
    if (internalIntensityRes.error) throw internalIntensityRes.error;

    const internalDate = safeTrim(internalIntensityRes.data?.activity_date).slice(0, 10);
    if (internalDate) return internalDate;
  }

  const completedExternalIntensityId = safeTrim(input.completedExternalIntensityId);
  if (completedExternalIntensityId) {
    const externalIntensityRes = await supabase
      .from('events_local_meta')
      .select('events_external!inner(start_date)')
      .eq('id', completedExternalIntensityId)
      .maybeSingle();
    if (externalIntensityRes.error) throw externalIntensityRes.error;

    const externalEvent = toExternalEvent((externalIntensityRes.data as any)?.events_external ?? null);
    const externalDate = safeTrim(externalEvent?.start_date).slice(0, 10);
    if (externalDate) return externalDate;
  }

  return null;
}

export async function resolveCelebrationAfterCompletionFromDatabase(
  input: CelebrationRuntimeInput
): Promise<CelebrationRuntimeDecision> {
  if (!input.completingToDone) {
    return { type: null, progress: null };
  }

  const completedUnitKey = resolveCompletedUnitKey(input);
  if (!completedUnitKey) {
    return { type: 'task', progress: null };
  }

  const now = input.now instanceof Date ? input.now : new Date();

  try {
    const targetDateKey = await resolveTargetDateKey(input);
    if (!targetDateKey) {
      return { type: 'task', progress: null };
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const userId = normalizeId(sessionData?.session?.user?.id);

    const targetDate = new Date(`${targetDateKey}T12:00:00`);
    const startIso = format(targetDate, 'yyyy-MM-dd');
    const endIsoExclusive = format(addDays(targetDate, 1), 'yyyy-MM-dd');

    const [internalTasksRes, externalTasksRes, internalIntensityRes, externalIntensityRes] = await Promise.all([
      supabase
        .from('activity_tasks')
        .select(
          'id, activity_id, completed, title, description, task_template_id, feedback_template_id, activities!inner(activity_date, activity_time)'
        )
        .eq('activities.activity_date', startIso),
      supabase
        .from('external_event_tasks')
        .select(
          'id, local_meta_id, completed, title, description, task_template_id, feedback_template_id, events_local_meta!inner(id, external_event_id, events_external!inner(start_date, deleted))'
        )
        .gte('events_local_meta.events_external.start_date', startIso)
        .lt('events_local_meta.events_external.start_date', endIsoExclusive),
      supabase
        .from('activities')
        .select('id, activity_date, intensity, intensity_enabled')
        .eq('activity_date', startIso),
      supabase
        .from('events_local_meta')
        .select('id, intensity, intensity_enabled, events_external!inner(start_date, deleted)')
        .gte('events_external.start_date', startIso)
        .lt('events_external.start_date', endIsoExclusive),
    ]);

    if (internalTasksRes.error) throw internalTasksRes.error;
    if (externalTasksRes.error) throw externalTasksRes.error;
    if (internalIntensityRes.error) throw internalIntensityRes.error;
    if (externalIntensityRes.error) throw externalIntensityRes.error;

    const internalTasksRaw = internalTasksRes.data ?? [];
    const externalTasksRaw = (externalTasksRes.data ?? []).filter((task) => {
      const meta = toRelationObject((task as any)?.events_local_meta);
      const externalEvent = toExternalEvent((meta as any)?.events_external ?? null);
      const deleted = externalEvent?.deleted === true;
      const completed = task.completed === true;
      return !deleted || completed;
    });

    const templateIdCandidates = new Set<string>();
    internalTasksRaw.forEach((task) => {
      const templateId = resolveTaskTemplateId(task);
      if (templateId) templateIdCandidates.add(templateId);
    });
    externalTasksRaw.forEach((task) => {
      const templateId = resolveTaskTemplateId(task);
      if (templateId) templateIdCandidates.add(templateId);
    });

    const templateArchivedAtById: Record<string, string | null> = {};
    if (templateIdCandidates.size) {
      const { data: templateRows, error: templateLookupError } = await supabase
        .from('task_templates')
        .select('id, archived_at')
        .in('id', Array.from(templateIdCandidates));
      if (templateLookupError) throw templateLookupError;

      (templateRows ?? []).forEach((row: any) => {
        const templateId = normalizeId(row?.id);
        if (!templateId) return;
        templateArchivedAtById[templateId] =
          typeof row?.archived_at === 'string' && row.archived_at.trim().length ? row.archived_at : null;
      });
    }

    const internalTasks = internalTasksRaw.filter((task) =>
      isTaskVisibleForActivity(
        task as any,
        (task.activities as any)?.activity_date ?? null,
        (task.activities as any)?.activity_time ?? null,
        templateArchivedAtById
      )
    );

    const externalTasks = externalTasksRaw.filter((task) => {
      const meta = toRelationObject((task as any)?.events_local_meta);
      const externalEvent = toExternalEvent((meta as any)?.events_external ?? null);
      const { activityDate, activityTime } = getExternalDateTimeParts(externalEvent?.start_date);
      return isTaskVisibleForActivity(task as any, activityDate, activityTime, templateArchivedAtById);
    });

    const feedbackByActivityTask: Record<string, any> = {};
    const feedbackByActivityTemplate: Record<string, any> = {};
    if (userId) {
      const feedbackActivityIds = new Set<string>();
      internalTasks.forEach((task) => {
        const activityId = normalizeId((task as any)?.activity_id);
        if (activityId) feedbackActivityIds.add(activityId);
      });
      externalTasks.forEach((task) => {
        getExternalActivityCandidateIds(task).forEach((activityId) => feedbackActivityIds.add(activityId));
      });

      const activityIds = Array.from(feedbackActivityIds);
      if (activityIds.length) {
        const { data: feedbackRows, error: feedbackError } = await supabase
          .from('task_template_self_feedback')
          .select('activity_id, task_template_id, task_instance_id, rating, note, created_at')
          .eq('user_id', userId)
          .in('activity_id', activityIds)
          .order('created_at', { ascending: false });
        if (feedbackError) throw feedbackError;

        (feedbackRows ?? []).forEach((row: any) => {
          const activityId = normalizeId(row?.activity_id);
          const taskInstanceId = normalizeId(row?.task_instance_id);
          const templateId = normalizeId(row?.task_template_id);
          if (activityId && taskInstanceId) {
            const key = `${activityId}::${taskInstanceId}`;
            if (!feedbackByActivityTask[key]) feedbackByActivityTask[key] = row;
          }
          if (activityId && templateId) {
            const key = `${activityId}::${templateId}`;
            if (!feedbackByActivityTemplate[key]) feedbackByActivityTemplate[key] = row;
          }
        });
      }
    }

    const isInternalTaskCompleted = (task: any): boolean => {
      if (task?.completed === true) return true;
      const activityId = normalizeId(task?.activity_id);
      const taskId = normalizeId(task?.id);
      const feedbackTemplateId = normalizeId(task?.feedback_template_id);
      const templateId = normalizeId(task?.task_template_id);
      const markerTemplateId = normalizeId(
        parseTemplateIdFromMarker(typeof task?.description === 'string' ? task.description : '') ||
          parseTemplateIdFromMarker(typeof task?.title === 'string' ? task.title : '')
      );
      const looksLikeFeedbackTask = !!feedbackTemplateId || !!markerTemplateId || isFeedbackTitle(task?.title);
      if (!looksLikeFeedbackTask || !activityId) return false;

      if (taskId) {
        const byTask = feedbackByActivityTask[`${activityId}::${taskId}`];
        if (feedbackAnswered(byTask)) return true;
      }
      const templateKey = feedbackTemplateId ?? markerTemplateId ?? templateId;
      if (templateKey) {
        const byTemplate = feedbackByActivityTemplate[`${activityId}::${templateKey}`];
        if (feedbackAnswered(byTemplate)) return true;
      }
      return false;
    };

    const isExternalTaskCompleted = (task: any): boolean => {
      if (task?.completed === true) return true;

      const taskId = normalizeId(task?.id);
      const feedbackTemplateId = normalizeId(task?.feedback_template_id);
      const templateId = normalizeId(task?.task_template_id);
      const markerTemplateId = normalizeId(
        parseTemplateIdFromMarker(typeof task?.description === 'string' ? task.description : '') ||
          parseTemplateIdFromMarker(typeof task?.title === 'string' ? task.title : '')
      );
      const looksLikeFeedbackTask = !!feedbackTemplateId || !!markerTemplateId || isFeedbackTitle(task?.title);
      if (!looksLikeFeedbackTask) return false;

      const templateKey = feedbackTemplateId ?? markerTemplateId ?? templateId;
      const activityIds = getExternalActivityCandidateIds(task);
      for (const activityId of activityIds) {
        if (taskId) {
          const byTask = feedbackByActivityTask[`${activityId}::${taskId}`];
          if (feedbackAnswered(byTask)) return true;
        }
        if (templateKey) {
          const byTemplate = feedbackByActivityTemplate[`${activityId}::${templateKey}`];
          if (feedbackAnswered(byTemplate)) return true;
        }
      }

      return false;
    };

    const units = [
      ...internalTasks.map((task) => ({
        key: buildCelebrationCompletionUnitKey('task', safeTrim(task.id)),
        completed: isInternalTaskCompleted(task),
        activityDate: safeTrim((task.activities as any)?.activity_date),
      })),
      ...externalTasks
        .map((task) => {
          const meta = toRelationObject((task as any)?.events_local_meta);
          const externalEvent = toExternalEvent((meta as any)?.events_external ?? null);
          const startDate = safeTrim(externalEvent?.start_date).slice(0, 10);
          if (!startDate) {
            return null;
          }

          return {
            key: buildCelebrationCompletionUnitKey('task', safeTrim(task.id)),
            completed: isExternalTaskCompleted(task),
            activityDate: startDate,
          };
        })
        .filter((task): task is { key: string; completed: boolean; activityDate: string } => task !== null),
      ...(internalIntensityRes.data ?? [])
        .map((row) => {
          const completed = isCompletedIntensity(row.intensity);
          const enabled = row.intensity_enabled === true || completed;
          const activityDate = safeTrim(row.activity_date).slice(0, 10);
          if (!enabled || !activityDate) {
            return null;
          }

          return {
            key: buildCelebrationCompletionUnitKey('internalIntensity', safeTrim(row.id)),
            completed,
            activityDate,
          };
        })
        .filter((row): row is { key: string; completed: boolean; activityDate: string } => row !== null),
      ...(externalIntensityRes.data ?? [])
        .map((row) => {
          const externalEvent = toExternalEvent((row as any)?.events_external ?? null);
          const startDate = safeTrim(externalEvent?.start_date).slice(0, 10);
          const completed = isCompletedIntensity(row.intensity);
          const enabled = row.intensity_enabled === true || completed;
          const deleted = externalEvent?.deleted === true;
          if (!enabled || !startDate || (deleted && !completed)) {
            return null;
          }

          return {
            key: buildCelebrationCompletionUnitKey('externalIntensity', safeTrim(row.id)),
            completed,
            activityDate: startDate,
          };
        })
        .filter((row): row is { key: string; completed: boolean; activityDate: string } => row !== null),
    ];

    const decision = resolveCelebrationAfterCompletionFromUnits({
      units,
      completedUnitKey,
      completingToDone: true,
      targetDateKey,
      now,
      includeOverdue: input.includeOverdue === true,
    });

    if (__DEV__) {
      const openUnits = units
        .filter((unit) => !(unit.completed || unit.key === completedUnitKey))
        .map((unit) => unit.key);
      console.log('[celebration-runtime] evaluated completion day', {
        completedUnitKey,
        targetDateKey,
        totalUnits: units.length,
        openUnits,
        decisionType: decision.type,
        progress: decision.progress,
      });
    }

    return {
      type: decision.type ?? 'task',
      progress: decision.progress,
    };
  } catch (error) {
    if (__DEV__) {
      console.log('[celebration-runtime] direct day-complete lookup failed', {
        message: (error as any)?.message,
        details: (error as any)?.details,
        hint: (error as any)?.hint,
        code: (error as any)?.code,
      });
    }

    return { type: 'task', progress: null };
  }
}
