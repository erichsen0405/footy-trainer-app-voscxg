import { supabase } from '@/integrations/supabase/client';
import type { Activity, TrainerActivityFeedback } from '@/types';

type TrainerFeedbackActivityContext = {
  activityContextType: 'internal' | 'external';
  activityContextId: string;
};

function normalizeId(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function pickRowValue(row: Record<string, unknown>, snakeKey: string, camelKey: string): unknown {
  return row[snakeKey] ?? row[camelKey];
}

export function mapTrainerFeedbackRow(row: any): TrainerActivityFeedback {
  const normalizedRow = (row ?? {}) as Record<string, unknown>;

  return {
    id: String(normalizedRow.id ?? ''),
    activityContextType:
      pickRowValue(normalizedRow, 'activity_context_type', 'activityContextType') === 'external'
        ? 'external'
        : 'internal',
    activityContextId: String(
      pickRowValue(normalizedRow, 'activity_context_id', 'activityContextId') ?? '',
    ),
    playerId: String(pickRowValue(normalizedRow, 'player_id', 'playerId') ?? ''),
    trainerId: String(pickRowValue(normalizedRow, 'trainer_id', 'trainerId') ?? ''),
    feedbackText: String(pickRowValue(normalizedRow, 'feedback_text', 'feedbackText') ?? ''),
    createdAt: String(pickRowValue(normalizedRow, 'created_at', 'createdAt') ?? ''),
    updatedAt: String(pickRowValue(normalizedRow, 'updated_at', 'updatedAt') ?? ''),
  };
}

export function resolveTrainerFeedbackActivityContext(
  activity: Activity | Record<string, unknown> | null | undefined
): TrainerFeedbackActivityContext | null {
  if (!activity) return null;
  const activityAny = activity as any;

  const isExternal = activityAny.isExternal === true || activityAny.is_external === true;
  if (isExternal) {
    const externalEventId = normalizeId(
      activityAny.externalEventId ?? activityAny.external_event_id
    );
    if (!externalEventId) return null;
    return {
      activityContextType: 'external',
      activityContextId: externalEventId,
    };
  }

  const sourceActivityId = normalizeId(
    activityAny.sourceActivityId ?? activityAny.source_activity_id
  );
  const internalActivityId = normalizeId(activityAny.id);
  const activityContextId = sourceActivityId || internalActivityId;
  if (!activityContextId) return null;

  return {
    activityContextType: 'internal',
    activityContextId,
  };
}

export async function fetchTrainerFeedbackForTrainerActivity(args: {
  activity: Activity | Record<string, unknown> | null | undefined;
  trainerId: string;
}): Promise<TrainerActivityFeedback[]> {
  const trainerId = normalizeId(args.trainerId);
  const context = resolveTrainerFeedbackActivityContext(args.activity);

  if (!trainerId || !context) {
    return [];
  }

  const { data, error } = await supabase
    .from('trainer_activity_feedback')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('activity_context_type', context.activityContextType)
    .eq('activity_context_id', context.activityContextId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map((row) => mapTrainerFeedbackRow(row)) : [];
}

export async function fetchTrainerFeedbackForPlayerActivity(args: {
  activity: Activity | Record<string, unknown> | null | undefined;
  playerId: string;
}): Promise<TrainerActivityFeedback[]> {
  const playerId = normalizeId(args.playerId);
  const context = resolveTrainerFeedbackActivityContext(args.activity);

  if (!playerId || !context) {
    return [];
  }

  const { data, error } = await supabase
    .from('trainer_activity_feedback')
    .select('*')
    .eq('player_id', playerId)
    .eq('activity_context_type', context.activityContextType)
    .eq('activity_context_id', context.activityContextId)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? data.map((row) => mapTrainerFeedbackRow(row)) : [];
}

export async function sendTrainerFeedback(args: {
  activityId: string;
  playerId: string;
  feedbackText: string;
}): Promise<{
  feedback: TrainerActivityFeedback;
  delivery: {
    mail: {
      status: 'sent' | 'skipped' | 'failed';
      provider: 'aws_ses' | 'none';
      warning: string | null;
    };
    push: {
      status: 'sent' | 'skipped' | 'failed';
      tokenCount: number;
      warning: string | null;
    };
  };
}> {
  const { data, error } = await supabase.functions.invoke('sendTrainerFeedback', {
    body: {
      activityId: normalizeId(args.activityId),
      playerId: normalizeId(args.playerId),
      feedbackText: String(args.feedbackText ?? '').trim(),
    },
  });

  if (error) {
    throw error;
  }

  const payload = (data as any)?.data ?? data;
  if (!payload?.feedback) {
    throw new Error('Trainer feedback response was missing feedback payload.');
  }

  return {
    feedback: mapTrainerFeedbackRow(payload.feedback),
    delivery: {
      mail: payload.delivery?.mail,
      push: payload.delivery?.push,
    },
  };
}
