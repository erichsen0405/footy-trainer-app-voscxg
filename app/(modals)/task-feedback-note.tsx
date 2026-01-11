import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { TaskScoreNoteModal, type TaskScoreNoteModalPayload } from '@/components/TaskScoreNoteModal';
import { supabase } from '@/app/integrations/supabase/client';
import { fetchSelfFeedbackForTemplates, upsertSelfFeedback } from '@/services/feedbackService';
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

function stripLeadingFeedbackPrefix(title: string): string {
  if (typeof title !== 'string') return title;
  const t = title.trim().replace(/^feedback på\s*/i, '');
  return t.length ? t : title;
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
  const [config, setConfig] = useState<AfterTrainingFeedbackConfig>(() => buildFeedbackConfig(undefined));
  const [initialScore, setInitialScore] = useState<number | null>(null);
  const [initialNote, setInitialNote] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      try {
        const sessionRes = await supabase.auth.getSession();
        const uid = sessionRes.data.session?.user?.id ?? null;
        if (cancelled) return;

        if (!uid) {
          setUserId(null);
          setError('Du er ikke logget ind.');
          return;
        }
        setUserId(uid);

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
          const result = await (fetchSelfFeedbackForTemplates as any)([templateId], uid);
          if (cancelled) return;

          const current = result?.[templateId]?.current;
          setInitialScore(typeof current?.rating === 'number' ? current.rating : null);
          setInitialNote(typeof current?.note === 'string' ? current.note : '');
        } catch {
          // ignore
        }
      } catch {
        if (!cancelled) setError('Kunne ikke hente bruger-session.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activityId, templateId]);

  const handleSave = useCallback(
    async ({ score, note }: TaskScoreNoteModalPayload) => {
      if (!activityId || !templateId) return;

      setError(null);

      if (!userId) {
        setError('Bruger-ID mangler. Prøv igen.');
        return;
      }

      setIsSaving(true);
      try {
        await (upsertSelfFeedback as any)({
          templateId,
          userId,
          rating: score,
          note,
          activity_id: String(activityId).trim(),
          activityId: String(activityId).trim(),
        });
        Promise.resolve(refreshData()).catch(() => {});
        safeDismiss();
      } catch (e) {
        setError('Kunne ikke gemme feedback lige nu. Prøv igen.');
      } finally {
        setIsSaving(false);
      }
    },
    [activityId, refreshData, safeDismiss, templateId, userId]
  );

  if (!activityId || !templateId) return null;

  const enableScore = config.enableScore !== false;
  const enableNote = config.enableNote !== false;

  return (
    <TaskScoreNoteModal
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
      onClose={safeDismiss}
    />
  );
}
