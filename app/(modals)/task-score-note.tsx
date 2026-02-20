import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TaskScoreNoteModal, type TaskScoreNoteModalPayload } from '@/components/TaskScoreNoteModal';
import { supabase } from '@/integrations/supabase/client';
import { useFootball } from '@/contexts/FootballContext';

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

export default function TaskScoreNoteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { refreshData, updateActivitySingle } = useFootball();

  const activityId = useMemo(
    () => decodeParam((params as any).activityId ?? (params as any).id ?? (params as any).activity_id),
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
    let cancelled = false;

    (async () => {
      if (!activityId) {
        safeDismiss();
        return;
      }

      if (!cancelled) {
        resetDraftState();
        setErrorSafe(null);
      }

      const paramScore = decodeParam((params as any).initialScore);
      if (paramScore && !cancelled) {
        const n = Number(paramScore);
        if (Number.isFinite(n)) setInitialScore(n);
      }

      try {
        const { data: internalActivity, error: internalError } = await supabase
          .from('activities')
          .select('id,intensity,intensity_enabled,intensity_note')
          .eq('id', activityId)
          .maybeSingle();

        if (cancelled) return;

        if (internalError) {
          console.error('[task-score-note] Failed fetching internal activity:', internalError);
        }

        let intensityCarrier = internalActivity ?? null;

        if (!intensityCarrier) {
          const { data: externalMeta, error: externalError } = await supabase
            .from('events_local_meta')
            .select('id,intensity,intensity_enabled,intensity_note')
            .eq('id', activityId)
            .maybeSingle();

          if (externalError) {
            console.error('[task-score-note] Failed fetching external meta:', externalError);
          }

          intensityCarrier = externalMeta ?? null;
        }

        if (!intensityCarrier) {
          Alert.alert('Intensitet ikke tilgængelig', 'Aktiviteten blev ikke fundet.');
          safeDismiss();
          return;
        }

        if (!intensityCarrier.intensity_enabled) {
          Alert.alert('Intensitet ikke tilgængelig', 'Intensitet er ikke aktiveret for denne aktivitet.');
          safeDismiss();
          return;
        }

        const intensity = typeof intensityCarrier.intensity === 'number' ? intensityCarrier.intensity : null;
        if (intensity === null) {
          setInitialScore(null);
          setInitialNote('');
          return;
        }

        setInitialScore(intensity);
        setInitialNote(typeof intensityCarrier.intensity_note === 'string' ? intensityCarrier.intensity_note : '');
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityId, params, resetDraftState, safeDismiss, setErrorSafe]);

  const handleClose = useCallback(() => {
    if (isSaving) return;
    resetDraftState();
    setErrorSafe(null);
    safeDismiss();
  }, [isSaving, resetDraftState, safeDismiss, setErrorSafe]);

  const handleSave = useCallback(
    async ({ score, note }: TaskScoreNoteModalPayload) => {
      if (!activityId) {
        setErrorSafe('Aktivitet mangler ID.');
        return;
      }

      setErrorSafe(null);
      setIsSavingSafe(true);

      try {
        const trimmedNote = typeof note === 'string' ? note.trim() : '';
        await updateActivitySingle(activityId, {
          intensity: typeof score === 'number' ? score : null,
          intensityNote: trimmedNote.length ? trimmedNote : null,
        });
        DeviceEventEmitter.emit('progression:refresh', {
          activityId,
          intensity: typeof score === 'number' ? score : null,
          note: typeof note === 'string' ? note.trim() : null,
          source: 'task-score-note',
        });
        Promise.resolve(refreshData()).catch(() => {});
        safeDismiss();
      } catch (e) {
        setErrorSafe('Kunne ikke gemme intensitet. Prøv igen.');
      } finally {
        setIsSavingSafe(false);
      }
    },
    [activityId, refreshData, safeDismiss, setErrorSafe, setIsSavingSafe, updateActivitySingle]
  );

  const handleClear = useCallback(async () => {
    if (!activityId) {
      setErrorSafe('Aktivitet mangler ID.');
      return;
    }

    setErrorSafe(null);
    setIsSavingSafe(true);

    try {
      await updateActivitySingle(activityId, { intensity: null, intensityEnabled: true, intensityNote: null });
      DeviceEventEmitter.emit('progression:refresh', {
        activityId,
        intensity: null,
        note: null,
        source: 'task-score-note',
      });
      Promise.resolve(refreshData()).catch(() => {});
      safeDismiss();
    } catch (e) {
      setErrorSafe('Kunne ikke fjerne intensitet. Prøv igen.');
      Alert.alert('Kunne ikke fjerne', 'Intensitet kunne ikke fjernes. Prøv igen.');
    } finally {
      setIsSavingSafe(false);
    }
  }, [activityId, refreshData, safeDismiss, setErrorSafe, setIsSavingSafe, updateActivitySingle]);

  if (!activityId) return null;

  return (
    <TaskScoreNoteModal
      key={`intensity-${activityId}`}
      visible
      title="Feedback på Intensitet"
      introText="Hvordan gik det?"
      helperText="1 = let · 10 = maks"
      initialScore={initialScore}
      initialNote={initialNote}
      enableScore
      enableNote
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onClear={handleClear}
      clearLabel="Markér som ikke udført"
      missingScoreTitle="Manglende intensitet"
      missingScoreMessage="Vælg en intensitet før du kan markere som udført."
      onClose={handleClose}
    />
  );
}
