import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TaskScoreNoteModal, type TaskScoreNoteModalPayload } from '@/components/TaskScoreNoteModal';
import { supabase } from '@/integrations/supabase/client';
import { fetchSelfFeedbackForTemplates, upsertSelfFeedback } from '@/services/feedbackService';
import { useFootball } from '@/contexts/FootballContext';
import type { TaskTemplateSelfFeedback } from '@/types';

function decodeParam(value: unknown): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (first === undefined || first === null) return null;
  let decoded = String(first);
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    decoded = String(first);
  }
  const trimmed = decoded.trim();
  const lowered = trimmed.toLowerCase();
  if (!trimmed || lowered === 'undefined' || lowered === 'null') return null;
  return trimmed;
}

function stripLeadingFeedbackPrefix(title: string): string {
  if (typeof title !== 'string') return title;
  const trimmed = title.trim();
  const stripped = trimmed.replace(/^feedback\s+p[\u00e5a]\s*/i, '');
  return stripped.length ? stripped : title;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeUuid(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  if (!trimmed.length) return null;
  return isUuid(trimmed) ? trimmed : null;
}

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function safeDateMs(value: unknown): number {
  const ms = new Date(String(value ?? '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

async function fetchEventsLocalMetaBy(
  column: 'id' | 'external_event_row_id' | 'external_event_id',
  value: string,
): Promise<any | null> {
  if (!value) return null;
  const selectWithRowId = 'id, external_event_id, external_event_row_id';
  const selectWithoutRowId = 'id, external_event_id';

  try {
    const { data, error } = await supabase.from('events_local_meta').select(selectWithRowId).eq(column, value).maybeSingle();

    if (error) {
      const isMissingColumn = error?.code === '42703';
      const message = String(error?.message ?? '');
      const isMissingRowIdColumn = message.includes('external_event_row_id');

      if (isMissingColumn && column === 'external_event_row_id') {
        if (__DEV__) {
          console.log('[task-feedback-note] events_local_meta missing external_event_row_id column');
        }
        return null;
      }

      if (isMissingColumn && isMissingRowIdColumn) {
        const retry = await supabase
          .from('events_local_meta')
          .select(selectWithoutRowId)
          .eq(column, value)
          .maybeSingle();

        if (retry.error && __DEV__) {
          console.log('[task-feedback-note] events_local_meta lookup failed', retry.error);
        }

        return retry.data ?? null;
      }

      if (__DEV__) {
        console.log('[task-feedback-note] events_local_meta lookup failed', error);
      }

      return null;
    }

    return data ?? null;
  } catch (e) {
    if (__DEV__) console.log('[task-feedback-note] events_local_meta lookup error', e);
  }

  return null;
}

async function getActivityIdCandidates(inputActivityId: string): Promise<string[]> {
  const candidates: string[] = [];
  const push = (value: unknown) => {
    const normalized = normalizeUuid(value);
    if (!normalized) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  const rawInput = String(inputActivityId ?? '').trim();
  if (!rawInput.length) return candidates;

  const inputUuid = normalizeUuid(rawInput);
  if (inputUuid) push(inputUuid);

  let meta: any | null = null;
  if (inputUuid) {
    meta =
      (await fetchEventsLocalMetaBy('id', inputUuid)) ??
      (await fetchEventsLocalMetaBy('external_event_row_id', inputUuid)) ??
      (await fetchEventsLocalMetaBy('external_event_id', inputUuid));
  } else {
    meta = await fetchEventsLocalMetaBy('external_event_id', rawInput);
  }

  if (meta) {
    push((meta as any)?.id);
    push((meta as any)?.external_event_row_id);
    push((meta as any)?.external_event_id);
  }

  return candidates;
}

async function fetchTaskCompletion(taskInstanceId: string): Promise<boolean> {
  if (!taskInstanceId) return false;

  try {
    const activityTask = await supabase
      .from('activity_tasks')
      .select('completed')
      .eq('id', taskInstanceId)
      .maybeSingle();

    if (typeof activityTask.data?.completed === 'boolean') {
      return activityTask.data.completed;
    }
  } catch {
    // ignore
  }

  try {
    const externalTask = await supabase
      .from('external_event_tasks')
      .select('completed')
      .eq('id', taskInstanceId)
      .maybeSingle();

    if (typeof externalTask.data?.completed === 'boolean') {
      return externalTask.data.completed;
    }
  } catch {
    // ignore
  }

  return false;
}

type AfterTrainingFeedbackConfig = {
  enableScore: boolean;
  scoreExplanation?: string | null;
  enableNote: boolean;
};

function normalizeScoreExplanation(value?: string | null): string | null {
  if (typeof value !== 'string') return value ?? null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function buildFeedbackConfig(row?: any): AfterTrainingFeedbackConfig {
  if (!row) return { enableScore: true, scoreExplanation: null, enableNote: true };
  return {
    enableScore: row.after_training_feedback_enable_score ?? true,
    scoreExplanation: normalizeScoreExplanation(row.after_training_feedback_score_explanation),
    enableNote: row.after_training_feedback_enable_note ?? true,
  };
}

export default function TaskFeedbackNoteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { refreshData } = useFootball();

  const activityId = useMemo(
    () => decodeParam((params as any).activityId ?? (params as any).activity_id ?? (params as any).id),
    [params]
  );
  const templateId = useMemo(
    () => decodeParam((params as any).templateId ?? (params as any).feedbackTemplateId),
    [params]
  );
  const taskInstanceId = useMemo(
    () => decodeParam((params as any).taskInstanceId ?? (params as any).task_instance_id),
    [params]
  );
  const taskTitle = useMemo(
    () => decodeParam((params as any).title ?? (params as any).taskTitle) ?? 'opgave',
    [params]
  );

  const safeDismiss = useCallback(() => {
    try {
      if (typeof (router as any).dismiss === 'function') return (router as any).dismiss();
      if (router.canGoBack()) return router.back();
      return router.replace('/(tabs)/(home)');
    } catch {
      return router.replace('/(tabs)/(home)');
    }
  }, [router]);

  const [userId, setUserId] = useState<string | null>(null);
  const [activityIdCandidates, setActivityIdCandidates] = useState<string[]>([]);
  const [config, setConfig] = useState<AfterTrainingFeedbackConfig>(() => buildFeedbackConfig(undefined));
  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [initialNote, setInitialNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const setErrorSafe = useCallback((value: string | null) => {
    if (isMountedRef.current) setError(value);
  }, []);

  const setIsSavingSafe = useCallback((value: boolean) => {
    if (isMountedRef.current) setIsSaving(value);
  }, []);

  const resetDraftState = useCallback(() => {
    if (!isMountedRef.current) return;
    setInitialScore(null);
    setInitialNote('');
  }, []);

  useEffect(() => {
    if (!activityId || !templateId) {
      Alert.alert('Kan ikke åbne', 'Mangler nødvendige parametre (activityId/templateId).');
      safeDismiss();
    }
  }, [activityId, templateId, safeDismiss]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!activityId || !templateId) return;

      if (!cancelled) {
        resetDraftState();
        setErrorSafe(null);
      }

      const candidates = await getActivityIdCandidates(activityId);
      if (!cancelled) setActivityIdCandidates(candidates);

      try {
        const sessionRes = await supabase.auth.getSession();
        const uid = sessionRes.data.session?.user?.id ?? null;
        if (cancelled) return;

        if (!uid) {
          setUserId(null);
          setErrorSafe('Du er ikke logget ind.');
          return;
        }
        setUserId(uid);

        const normalizedTaskInstanceId = normalizeId(taskInstanceId);
        const taskCompletedFromTable = normalizedTaskInstanceId
          ? await fetchTaskCompletion(normalizedTaskInstanceId)
          : false;

        try {
          const { data } = await supabase
            .from('task_templates')
            .select('id, after_training_feedback_enable_score, after_training_feedback_score_explanation, after_training_feedback_enable_note')
            .eq('id', templateId)
            .single();

          if (!cancelled) setConfig(buildFeedbackConfig(data));
        } catch {
          // ignore
        }

        try {
          const rows = await fetchSelfFeedbackForTemplates(uid, [templateId]);
          if (cancelled) return;

          const candidateIds = candidates.filter((id) => normalizeUuid(id)) as string[];
          const latestForInstance = normalizedTaskInstanceId
            ? rows.reduce<TaskTemplateSelfFeedback | undefined>((best, row) => {
                const rowInstanceId = normalizeId(
                  (row as any)?.taskInstanceId ?? (row as any)?.task_instance_id,
                );
                if (!rowInstanceId || rowInstanceId !== normalizedTaskInstanceId) return best;
                return !best || safeDateMs(row.createdAt) > safeDateMs(best.createdAt) ? row : best;
              }, undefined)
            : undefined;

          const latestForActivity = rows.reduce<TaskTemplateSelfFeedback | undefined>((best, row) => {
            if (!candidateIds.length) return best;
            const rowActivityId = normalizeUuid((row as any)?.activityId ?? (row as any)?.activity_id);
            if (!rowActivityId || !candidateIds.includes(rowActivityId)) return best;
            return !best || safeDateMs(row.createdAt) > safeDateMs(best.createdAt) ? row : best;
          }, undefined);

          const shouldHydratePersisted = normalizedTaskInstanceId
            ? taskCompletedFromTable || !!latestForInstance
            : taskCompletedFromTable || !!latestForActivity;

          if (!shouldHydratePersisted) {
            resetDraftState();
            return;
          }

          const selected = normalizedTaskInstanceId
            ? latestForInstance ?? null
            : latestForActivity ?? null;

          setInitialScore(typeof selected?.rating === 'number' ? selected.rating : null);
          setInitialNote(typeof selected?.note === 'string' ? selected.note : '');
        } catch {
          // ignore
        }
      } catch {
        if (!cancelled) setErrorSafe('Kunne ikke hente bruger-session.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityId, resetDraftState, setErrorSafe, taskInstanceId, templateId]);

  const handleClose = useCallback(() => {
    if (isSaving) return;
    resetDraftState();
    setErrorSafe(null);
    safeDismiss();
  }, [isSaving, resetDraftState, safeDismiss, setErrorSafe]);

  const handleSave = useCallback(
    async ({ score, note }: TaskScoreNoteModalPayload) => {
      if (!activityId || !templateId) return;

      setErrorSafe(null);

      if (!userId) {
        setErrorSafe('Bruger-ID mangler. Prøv igen.');
        return;
      }

      const candidateIds = activityIdCandidates.filter((id) => normalizeUuid(id));
      if (!candidateIds.length) {
        setErrorSafe('Aktiviteten mangler et gyldigt ID. Prøv igen.');
        return;
      }

      const optimisticActivityId = candidateIds[0];
      const nowIso = new Date().toISOString();
      const normalizedTaskInstanceId = normalizeUuid(taskInstanceId);
      const effectiveTaskInstanceId = normalizedTaskInstanceId ?? templateId;
      const optimisticId = `optimistic:${optimisticActivityId}:${templateId}:${effectiveTaskInstanceId}:${nowIso}`;

      DeviceEventEmitter.emit('feedback:saved', {
        activityId: optimisticActivityId,
        templateId,
        taskInstanceId: effectiveTaskInstanceId,
        rating: typeof score === 'number' ? score : null,
        note: typeof note === 'string' ? note : null,
        createdAt: nowIso,
        optimisticId,
        source: 'task-feedback-note',
      });

      setIsSavingSafe(true);
      safeDismiss();
      let lastError: any = null;
      let lastTriedId: string | null = null;
      let savedActivityId: string | null = null;
      let savedFeedback: TaskTemplateSelfFeedback | null = null;
      try {
        const tryUpsert = async (candidateActivityId: string) =>
          upsertSelfFeedback({
            templateId,
            taskInstanceId: effectiveTaskInstanceId,
            userId,
            rating: score,
            note,
            activity_id: String(candidateActivityId).trim(),
            activityId: String(candidateActivityId).trim(),
          });

        for (const candidateId of candidateIds) {
          lastTriedId = candidateId;
          try {
            savedFeedback = await tryUpsert(candidateId);
            savedActivityId = candidateId;
            break;
          } catch (e) {
            lastError = e;
          }
        }

        if (!savedActivityId) {
          if (lastError) throw lastError;
          throw new Error('Feedback save failed');
        }

        if (savedActivityId !== optimisticActivityId) {
          DeviceEventEmitter.emit('feedback:save_failed', {
            activityId: optimisticActivityId,
            templateId,
            taskInstanceId: effectiveTaskInstanceId,
            optimisticId,
            source: 'task-feedback-note',
          });

          const correctedCreatedAt = savedFeedback?.createdAt ?? nowIso;
          const correctedOptimisticId = `optimistic:${savedActivityId}:${templateId}:${effectiveTaskInstanceId}:${correctedCreatedAt}`;

          DeviceEventEmitter.emit('feedback:saved', {
            activityId: savedActivityId,
            templateId,
            taskInstanceId: effectiveTaskInstanceId,
            rating:
              typeof savedFeedback?.rating === 'number'
                ? savedFeedback.rating
                : typeof score === 'number'
                ? score
                : null,
            note:
              typeof savedFeedback?.note === 'string'
                ? savedFeedback.note
                : typeof note === 'string'
                ? note
                : null,
            createdAt: correctedCreatedAt,
            optimisticId: correctedOptimisticId,
            source: 'task-feedback-note',
          });
        }

        DeviceEventEmitter.emit('progression:refresh', {
          activityId: savedActivityId ?? optimisticActivityId,
          templateId,
          taskInstanceId: effectiveTaskInstanceId,
          source: 'task-feedback-note',
        });

        Promise.resolve(refreshData()).catch(() => {});
        return;
      } catch (e) {
        if (__DEV__) {
          console.log('[task-feedback-note] save feedback error', {
            activityId: lastTriedId,
            activityIdCandidates: candidateIds,
            message: (e as any)?.message,
            details: (e as any)?.details,
            hint: (e as any)?.hint,
            code: (e as any)?.code,
            status: (e as any)?.status,
          });
        }
        const suffix = lastTriedId ? ` (activityId: ${lastTriedId})` : '';
        DeviceEventEmitter.emit('feedback:save_failed', {
          activityId: optimisticActivityId,
          templateId,
          taskInstanceId: effectiveTaskInstanceId,
          optimisticId,
          source: 'task-feedback-note',
        });
        setErrorSafe(`Kunne ikke gemme feedback${suffix}. Prøv igen.`);
        Alert.alert('Kunne ikke gemme', 'Feedback kunne ikke gemmes. Prøv igen.');
      } finally {
        setIsSavingSafe(false);
      }
    },
    [
      activityId,
      activityIdCandidates,
      refreshData,
      safeDismiss,
      setErrorSafe,
      setIsSavingSafe,
      taskInstanceId,
      templateId,
      userId,
    ]
  );

  const handleClear = useCallback(async () => {
    if (!activityId || !templateId) return;

    setErrorSafe(null);

    if (!userId) {
      setErrorSafe('Bruger-ID mangler. Prøv igen.');
      return;
    }

    const candidateIds = activityIdCandidates.filter((id) => normalizeUuid(id));
    if (!candidateIds.length) {
      setErrorSafe('Aktiviteten mangler et gyldigt ID. Prøv igen.');
      return;
    }

    const optimisticActivityId = candidateIds[0];
    const nowIso = new Date().toISOString();
    const normalizedTaskInstanceId = normalizeUuid(taskInstanceId);
    const effectiveTaskInstanceId = normalizedTaskInstanceId ?? templateId;
    const optimisticId = `optimistic:${optimisticActivityId}:${templateId}:${effectiveTaskInstanceId}:${nowIso}`;

    DeviceEventEmitter.emit('feedback:saved', {
      activityId: optimisticActivityId,
      templateId,
      taskInstanceId: effectiveTaskInstanceId,
      rating: null,
      note: null,
      createdAt: nowIso,
      optimisticId,
      source: 'task-feedback-note',
    });

    setIsSavingSafe(true);
    safeDismiss();
    let lastError: any = null;
    let lastTriedId: string | null = null;
    let savedActivityId: string | null = null;
    let savedFeedback: TaskTemplateSelfFeedback | null = null;
    try {
      const tryUpsert = async (candidateActivityId: string) =>
        upsertSelfFeedback({
          templateId,
          taskInstanceId: effectiveTaskInstanceId,
          userId,
          rating: null,
          note: null,
          activity_id: String(candidateActivityId).trim(),
          activityId: String(candidateActivityId).trim(),
        });

      for (const candidateId of candidateIds) {
        lastTriedId = candidateId;
        try {
          savedFeedback = await tryUpsert(candidateId);
          savedActivityId = candidateId;
          break;
        } catch (e) {
          lastError = e;
        }
      }

      if (!savedActivityId) {
        if (lastError) throw lastError;
        throw new Error('Feedback clear failed');
      }

      if (savedActivityId !== optimisticActivityId) {
        DeviceEventEmitter.emit('feedback:save_failed', {
          activityId: optimisticActivityId,
          templateId,
          taskInstanceId: effectiveTaskInstanceId,
          optimisticId,
          source: 'task-feedback-note',
        });

        const correctedCreatedAt = savedFeedback?.createdAt ?? nowIso;
        const correctedOptimisticId = `optimistic:${savedActivityId}:${templateId}:${effectiveTaskInstanceId}:${correctedCreatedAt}`;

        DeviceEventEmitter.emit('feedback:saved', {
          activityId: savedActivityId,
          templateId,
          taskInstanceId: effectiveTaskInstanceId,
          rating: null,
          note: null,
          createdAt: correctedCreatedAt,
          optimisticId: correctedOptimisticId,
          source: 'task-feedback-note',
        });
      }

      if (normalizedTaskInstanceId) {
        try {
          await supabase
            .from('activity_tasks')
            .update({ completed: false })
            .eq('id', normalizedTaskInstanceId);
        } catch {}
        try {
          await supabase
            .from('external_event_tasks')
            .update({ completed: false })
            .eq('id', normalizedTaskInstanceId);
        } catch {}
      }

      DeviceEventEmitter.emit('progression:refresh', {
        activityId: savedActivityId ?? optimisticActivityId,
        templateId,
        taskInstanceId: effectiveTaskInstanceId,
        source: 'task-feedback-note',
      });

      Promise.resolve(refreshData()).catch(() => {});
      return;
    } catch (e) {
      if (__DEV__) {
        console.log('[task-feedback-note] clear feedback error', {
          activityId: lastTriedId,
          activityIdCandidates: candidateIds,
          message: (e as any)?.message,
          details: (e as any)?.details,
          hint: (e as any)?.hint,
          code: (e as any)?.code,
          status: (e as any)?.status,
        });
      }
      const suffix = lastTriedId ? ` (activityId: ${lastTriedId})` : '';
      DeviceEventEmitter.emit('feedback:save_failed', {
        activityId: optimisticActivityId,
        templateId,
        taskInstanceId: effectiveTaskInstanceId,
        optimisticId,
        source: 'task-feedback-note',
      });
      setErrorSafe(`Kunne ikke fjerne feedback${suffix}. Prøv igen.`);
      Alert.alert('Kunne ikke fjerne', 'Feedback kunne ikke fjernes. Prøv igen.');
    } finally {
      setIsSavingSafe(false);
    }
  }, [
    activityId,
    activityIdCandidates,
    refreshData,
    safeDismiss,
    setErrorSafe,
    setIsSavingSafe,
    taskInstanceId,
    templateId,
    userId,
  ]);

  if (!activityId || !templateId) return null;

  const enableScore = config.enableScore !== false;
  const enableNote = config.enableNote !== false;

  return (
    <TaskScoreNoteModal
      key={`feedback-${taskInstanceId ?? 'missing'}-${templateId ?? 'missing'}`}
      visible
      title={`Feedback på ${stripLeadingFeedbackPrefix(taskTitle)}`}
      introText="Hvordan gik det?"
      helperText={enableScore ? (config.scoreExplanation ?? 'Hvor god var du til dine fokuspunkter') : null}
      initialScore={initialScore}
      initialNote={initialNote}
      enableScore={enableScore}
      enableNote={enableNote}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onClear={handleClear}
      clearLabel="Markér som ikke udført"
      onClose={handleClose}
    />
  );
}
