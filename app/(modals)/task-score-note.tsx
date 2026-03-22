import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TaskScoreNoteModal, type TaskScoreNoteModalPayload } from '@/components/TaskScoreNoteModal';
import { supabase } from '@/integrations/supabase/client';
import { useFootball } from '@/contexts/FootballContext';
import { useCelebration } from '@/contexts/CelebrationContext';
import { resolveCelebrationAfterCompletionFromDatabase } from '@/utils/celebrationRuntime';
import { INTENSITY_SCORE_OPTIONS, normalizeFivePointScore } from '@/utils/scoreScale';

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
  const { showCelebration } = useCelebration();

  const activityIdParam = (params as any).activityId ?? (params as any).id ?? (params as any).activity_id;
  const initialScoreParam = decodeParam((params as any).initialScore);

  const activityId = useMemo(
    () => decodeParam(activityIdParam),
    [activityIdParam],
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
  const [activitySource, setActivitySource] = useState<'internal' | 'external' | null>(null);
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
    setActivitySource(null);
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

      if (initialScoreParam && !cancelled) {
        const n = Number(initialScoreParam);
        if (Number.isFinite(n)) setInitialScore(normalizeFivePointScore(n));
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
        let nextActivitySource: 'internal' | 'external' | null = internalActivity ? 'internal' : null;

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
          nextActivitySource = externalMeta ? 'external' : nextActivitySource;
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

        const intensity = normalizeFivePointScore(intensityCarrier.intensity);
        if (intensity === null) {
          setInitialScore(null);
          setInitialNote('');
          setActivitySource(nextActivitySource);
          return;
        }

        setInitialScore(intensity);
        setInitialNote(typeof intensityCarrier.intensity_note === 'string' ? intensityCarrier.intensity_note : '');
        setActivitySource(nextActivitySource);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityId, initialScoreParam, resetDraftState, safeDismiss, setErrorSafe]);

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

        const completingToDone = initialScore === null && typeof score === 'number';
        const celebrationDecision = await resolveCelebrationAfterCompletionFromDatabase({
          completedInternalIntensityId: activitySource === 'internal' ? activityId : null,
          completedExternalIntensityId: activitySource === 'external' ? activityId : null,
          completingToDone,
          includeOverdue: false,
        });
        safeDismiss();
        const celebrationType = celebrationDecision.type;
        if (celebrationType) {
          setTimeout(() => {
            showCelebration({ type: celebrationType, ...(celebrationDecision.progress ?? {}) });
          }, 280);
        }
        Promise.resolve(refreshData()).catch(() => {});
      } catch (e) {
        setErrorSafe('Kunne ikke gemme intensitet. Prøv igen.');
      } finally {
        setIsSavingSafe(false);
      }
    },
    [
      activityId,
      activitySource,
      initialScore,
      refreshData,
      safeDismiss,
      setErrorSafe,
      setIsSavingSafe,
      showCelebration,
      updateActivitySingle,
    ]
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
      helperText="Vælg det tempo du faktisk kunne holde i dag."
      initialScore={initialScore}
      initialNote={initialNote}
      enableScore
      enableNote
      scoreOptions={INTENSITY_SCORE_OPTIONS}
      scorePlaceholder="Vælg intensitet"
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onClear={handleClear}
      clearLabel="Markér som ikke udført"
      missingScoreTitle="Manglende intensitet"
      missingScoreMessage="Vælg en intensitet før du kan markere som udført."
      infoButtonAccessibilityLabel="Vis info om intensitet"
      infoModalTitle="Sådan bruger du Intensitet"
      infoModalLines={[
        'Intensitet handler om det tempo og den synlige intensitet du faktisk kunne holde udefra set.',
        'Det handler ikke om hvor hårdt du følte, at du prøvede.',
        'Vælg den beskrivelse der bedst passer på dit tempo i dag.',
        'Det gør det lettere at sammenligne dine dage på en ens måde over tid.',
      ]}
      onClose={handleClose}
    />
  );
}
