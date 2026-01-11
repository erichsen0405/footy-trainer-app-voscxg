import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TaskScoreNoteModal, type TaskScoreNoteModalPayload } from '@/components/TaskScoreNoteModal';
import { supabase } from '@/app/integrations/supabase/client';
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
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!activityId) {
        safeDismiss();
        return;
      }

      const paramScore = decodeParam((params as any).initialScore);
      if (paramScore && !cancelled) {
        const n = Number(paramScore);
        if (Number.isFinite(n)) setInitialScore(n);
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('activities')
          .select('id,intensity,intensity_enabled,is_external')
          .eq('id', activityId)
          .single();

        if (cancelled) return;

        if (fetchError) return;

        if (data?.is_external) {
          Alert.alert('Intensitet ikke tilgængelig', 'Denne aktivitet kommer fra en ekstern kalender.');
          safeDismiss();
          return;
        }

        if (!data?.intensity_enabled) {
          Alert.alert('Intensitet ikke tilgængelig', 'Intensitet er ikke aktiveret for denne aktivitet.');
          safeDismiss();
          return;
        }

        const intensity = typeof (data as any).intensity === 'number' ? (data as any).intensity : null;
        setInitialScore(intensity);
      } catch {
        // ignore
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityId, params, safeDismiss]);

  const handleSave = useCallback(
    async ({ score }: TaskScoreNoteModalPayload) => {
      if (!activityId) {
        setError('Aktivitet mangler ID.');
        return;
      }

      setError(null);
      setIsSaving(true);

      try {
        await updateActivitySingle(activityId, { intensity: typeof score === 'number' ? score : null });
        Promise.resolve(refreshData()).catch(() => {});
        safeDismiss();
      } catch (e) {
        setError('Kunne ikke gemme intensitet. Prøv igen.');
      } finally {
        setIsSaving(false);
      }
    },
    [activityId, refreshData, safeDismiss, updateActivitySingle]
  );

  if (!activityId) return null;

  return (
    <TaskScoreNoteModal
      visible
      title="Feedback på Intensitet"
      introText="Hvordan gik det?"
      helperText="1 = let · 10 = maks"
      initialScore={initialScore}
      initialNote=""
      enableScore
      enableNote={false}
      isSaving={isSaving}
      error={error}
      onSave={handleSave}
      onClose={safeDismiss}
    />
  );
}