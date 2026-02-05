import { supabase } from '@/integrations/supabase/client';
import { TaskTemplateSelfFeedback } from '@/types';

function mapRow(row: any): TaskTemplateSelfFeedback {
  return {
    id: row.id,
    userId: row.user_id,
    taskTemplateId: row.task_template_id,
    activityId: row.activity_id,
    rating: row.rating,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchSelfFeedbackForTemplates(
  userId: string,
  templateIds: string[]
): Promise<TaskTemplateSelfFeedback[]> {
  const trimmedUserId = String(userId ?? '').trim();
  if (!trimmedUserId || !templateIds?.length) {
    return [];
  }

  const normalizedTemplateIds = templateIds
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);

  if (!normalizedTemplateIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from('task_template_self_feedback')
    .select('*')
    .eq('user_id', trimmedUserId)
    .in('task_template_id', normalizedTemplateIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(mapRow);
}

export async function fetchSelfFeedbackForActivities(
  userId: string,
  activityIds: string[]
): Promise<TaskTemplateSelfFeedback[]> {
  const trimmedUserId = String(userId ?? '').trim();
  if (!trimmedUserId || !activityIds?.length) {
    return [];
  }

  const isUuidString = (value: string): boolean =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

  const normalizedActivityIds = Array.from(
    new Set(
      activityIds
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
        // `activity_id` is a uuid column. Filter out non-uuid candidates (e.g. provider_event_uid)
        // to avoid the entire query failing.
        .filter(isUuidString)
    )
  );

  if (!normalizedActivityIds.length) {
    return [];
  }

  const CHUNK_SIZE = 50;
  const chunkCount = Math.ceil(normalizedActivityIds.length / CHUNK_SIZE);

  if (__DEV__) {
    console.log('[feedbackService] fetchSelfFeedbackForActivities', {
      totalActivityIds: normalizedActivityIds.length,
      chunks: chunkCount,
      sampleActivityIds: normalizedActivityIds.slice(0, 3),
    });
  }

  const allRows: any[] = [];
  for (let i = 0; i < normalizedActivityIds.length; i += CHUNK_SIZE) {
    const chunk = normalizedActivityIds.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('task_template_self_feedback')
      .select('*')
      .eq('user_id', trimmedUserId)
      .in('activity_id', chunk)
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    if (Array.isArray(data) && data.length) {
      allRows.push(...data);
    }
  }

  const mapped = allRows.map(mapRow);
  mapped.sort((a, b) => {
    const aMs = new Date(String((a as any)?.createdAt ?? '')).getTime();
    const bMs = new Date(String((b as any)?.createdAt ?? '')).getTime();
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
  });

  return mapped;
}

type UpsertSelfFeedbackArgs = {
  templateId: string;
  userId: string;
  rating: number | null;
  note?: string | null;
  activity_id?: string | null;
  activityId?: string | null; // back-compat
};

function requireNonEmpty(label: string, value: unknown): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    throw new Error(`[feedbackService] Missing ${label}. Refusing to upsert feedback.`);
  }
  return trimmed;
}

function requireActivityId(input: UpsertSelfFeedbackArgs): string {
  const raw = input.activity_id ?? input.activityId;
  return requireNonEmpty('activity id (activity_id/activityId)', raw);
}

function logSupabaseError(context: string, error: any, meta?: Record<string, unknown>) {
  if (!__DEV__) return;
  console.log(`[feedbackService] ${context}`, {
    ...meta,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
    status: error?.status,
  });
}

export async function upsertSelfFeedback(args: UpsertSelfFeedbackArgs) {
  const activityId = requireActivityId(args);
  const userId = requireNonEmpty('userId', args.userId);
  const templateId = requireNonEmpty('templateId', args.templateId);

  const trimmedNote = String(args.note ?? '').trim();

  // IMPORTANT: DB columns are task_template_id + activity_id (NOT template_id)
  const payload = {
    user_id: userId,
    task_template_id: templateId,
    activity_id: activityId,
    rating: args.rating,
    note: trimmedNote.length ? trimmedNote : null,
  };

  const { data, error } = await supabase
    .from('task_template_self_feedback')
    .upsert(payload, {
      onConflict: 'user_id,task_template_id,activity_id',
    })
    .select()
    .single();

  if (error) {
    logSupabaseError('upsertSelfFeedback failed', error, {
      activityId,
      userId,
      templateId,
    });
    throw error;
  }

  return mapRow(data);
}
