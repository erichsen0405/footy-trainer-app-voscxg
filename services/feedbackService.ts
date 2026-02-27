import { supabase } from '@/integrations/supabase/client';
import { TaskTemplateSelfFeedback } from '@/types';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function mapFeedbackRow(row: any): TaskTemplateSelfFeedback {
  return {
    id: row.id,
    userId: row.user_id,
    taskTemplateId: row.task_template_id,
    taskInstanceId: row.task_instance_id ?? null,
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

  return (data || []).map(mapFeedbackRow);
}

export async function fetchSelfFeedbackForActivities(
  userId: string,
  activityIds: string[]
): Promise<TaskTemplateSelfFeedback[]> {
  const trimmedUserId = String(userId ?? '').trim();
  if (!trimmedUserId || !activityIds?.length) {
    return [];
  }

  const normalizedActivityIds = Array.from(
    new Set(
      activityIds
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
        // `activity_id` is a uuid column. Filter out non-uuid candidates (e.g. provider_event_uid)
        // to avoid the entire query failing.
        .filter(isUuid)
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

  const mapped = allRows.map(mapFeedbackRow);
  mapped.sort((a, b) => {
    const aMs = new Date(String((a as any)?.createdAt ?? '')).getTime();
    const bMs = new Date(String((b as any)?.createdAt ?? '')).getTime();
    return (Number.isFinite(bMs) ? bMs : 0) - (Number.isFinite(aMs) ? aMs : 0);
  });

  return mapped;
}

type FetchLatestCategoryFeedbackArgs = {
  userId: string;
  categoryId: string;
  limit?: number;
};

export type LatestCategoryFeedback = TaskTemplateSelfFeedback & {
  focusPointTitle?: string | null;
};

function normalizeFeedbackTemplateTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isFeedbackTemplateTitle(value: unknown): boolean {
  const normalized = normalizeFeedbackTemplateTitle(value);
  return normalized.startsWith('feedback pa');
}

export async function fetchLatestCategoryFeedback(
  args: FetchLatestCategoryFeedbackArgs
): Promise<LatestCategoryFeedback[]> {
  const trimmedUserId = String(args?.userId ?? '').trim();
  const trimmedCategoryId = String(args?.categoryId ?? '').trim();
  const safeLimit =
    typeof args?.limit === 'number' && Number.isFinite(args.limit) && args.limit > 0
      ? Math.floor(args.limit)
      : 3;
  const rawLimit = Math.max(10, safeLimit * 10);

  if (!trimmedUserId || !trimmedCategoryId) {
    return [];
  }

  const { data, error } = await supabase
    .from('task_template_self_feedback')
    .select(`
      *,
      task_templates!inner(
        title,
        task_template_categories!inner(
          category_id
        )
      )
    `)
    .eq('user_id', trimmedUserId)
    .eq('task_templates.task_template_categories.category_id', trimmedCategoryId)
    .order('created_at', { ascending: false })
    .limit(rawLimit);

  if (error) {
    throw error;
  }

  const filtered = (data || []).filter((row: any) => {
    const hasScore = typeof row?.rating === 'number';
    const hasNote = String(row?.note ?? '').trim().length > 0;
    const isFeedbackTitle = isFeedbackTemplateTitle(row?.task_templates?.title);
    return (hasScore || hasNote) && isFeedbackTitle;
  });
  return filtered
    .slice(0, safeLimit)
    .map((row: any) => ({
      ...mapFeedbackRow(row),
      focusPointTitle:
        typeof row?.task_templates?.title === 'string'
          ? row.task_templates.title
          : null,
    }));
}

type UpsertSelfFeedbackArgs = {
  templateId: string;
  userId: string;
  taskInstanceId?: string | null;
  task_instance_id?: string | null;
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
  const taskInstanceIdRaw = String(args.taskInstanceId ?? args.task_instance_id ?? '').trim();
  const taskInstanceId = taskInstanceIdRaw.length ? taskInstanceIdRaw : templateId;
  const shouldRunCrossActivityCleanup =
    isUuid(taskInstanceIdRaw) && taskInstanceIdRaw.toLowerCase() !== templateId.toLowerCase();

  const trimmedNote = String(args.note ?? '').trim();

  // IMPORTANT: DB columns are task_template_id + activity_id (NOT template_id)
  const payload = {
    user_id: userId,
    task_template_id: templateId,
    task_instance_id: taskInstanceId,
    activity_id: activityId,
    rating: args.rating,
    note: trimmedNote.length ? trimmedNote : null,
  };

  const { data, error } = await supabase
    .from('task_template_self_feedback')
    .upsert(payload, {
      onConflict: 'user_id,activity_id,task_instance_id',
    })
    .select()
    .single();

  if (error) {
    logSupabaseError('upsertSelfFeedback failed', error, {
      activityId,
      userId,
      templateId,
      taskInstanceId,
    });
    throw error;
  }

  // Keep only the newest feedback row for the same activity+template.
  // This prevents stale notes from resurfacing when task_instance_id varies for the same task flow.
  const { error: sameActivityCleanupError } = await supabase
    .from('task_template_self_feedback')
    .delete()
    .eq('user_id', userId)
    .eq('task_template_id', templateId)
    .eq('activity_id', activityId)
    .neq('id', data.id);

  if (sameActivityCleanupError) {
    logSupabaseError('upsertSelfFeedback cleanup same activity duplicates failed', sameActivityCleanupError, {
      activityId,
      userId,
      templateId,
      taskInstanceId,
      keepId: data.id,
    });
  }

  if (shouldRunCrossActivityCleanup) {
    const { error: cleanupError } = await supabase
      .from('task_template_self_feedback')
      .delete()
      .eq('user_id', userId)
      .eq('task_template_id', templateId)
      .eq('task_instance_id', taskInstanceIdRaw)
      .neq('activity_id', activityId);

    if (cleanupError) {
      logSupabaseError('upsertSelfFeedback cleanup stale rows failed', cleanupError, {
        activityId,
        userId,
        templateId,
        taskInstanceId,
      });
    }
  }

  return mapFeedbackRow(data);
}
