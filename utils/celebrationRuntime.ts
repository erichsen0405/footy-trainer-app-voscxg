import { addDays, format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import {
  buildCelebrationCompletionUnitKey,
  type CelebrationProgress,
  type CelebrationType,
  resolveCelebrationAfterCompletionFromUnits,
} from '@/utils/celebration';

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

const isCompletedIntensity = (value: unknown): boolean =>
  typeof value === 'number' && Number.isFinite(value);

const toExternalEvent = (value: ExternalEventRelation) => (Array.isArray(value) ? value[0] ?? null : value);

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
  const todayIso = format(now, 'yyyy-MM-dd');
  const tomorrowIso = format(addDays(now, 1), 'yyyy-MM-dd');

  try {
    const [internalTasksRes, externalTasksRes, internalIntensityRes, externalIntensityRes] = await Promise.all([
      supabase
        .from('activity_tasks')
        .select('id, completed, activities!inner(activity_date)')
        .eq('activities.activity_date', todayIso),
      supabase
        .from('external_event_tasks')
        .select('id, completed, events_local_meta!inner(id, events_external!inner(start_date, deleted))')
        .gte('events_local_meta.events_external.start_date', todayIso)
        .lt('events_local_meta.events_external.start_date', tomorrowIso),
      supabase
        .from('activities')
        .select('id, activity_date, intensity, intensity_enabled')
        .eq('activity_date', todayIso),
      supabase
        .from('events_local_meta')
        .select('id, intensity, intensity_enabled, events_external!inner(start_date, deleted)')
        .gte('events_external.start_date', todayIso)
        .lt('events_external.start_date', tomorrowIso),
    ]);

    if (internalTasksRes.error) throw internalTasksRes.error;
    if (externalTasksRes.error) throw externalTasksRes.error;
    if (internalIntensityRes.error) throw internalIntensityRes.error;
    if (externalIntensityRes.error) throw externalIntensityRes.error;

    const units = [
      ...(internalTasksRes.data ?? []).map((task) => ({
        key: buildCelebrationCompletionUnitKey('task', safeTrim(task.id)),
        completed: task.completed === true,
        activityDate: safeTrim((task.activities as any)?.activity_date),
      })),
      ...(externalTasksRes.data ?? [])
        .map((task) => {
          const externalEvent = toExternalEvent((task.events_local_meta as any)?.events_external ?? null);
          const startDate = safeTrim(externalEvent?.start_date).slice(0, 10);
          const completed = task.completed === true;
          const deleted = externalEvent?.deleted === true;
          if (!startDate || (deleted && !completed)) {
            return null;
          }

          return {
            key: buildCelebrationCompletionUnitKey('task', safeTrim(task.id)),
            completed,
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
      now,
      includeOverdue: input.includeOverdue === true,
    });

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
