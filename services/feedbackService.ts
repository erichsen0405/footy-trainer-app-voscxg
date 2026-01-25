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
    throw error;
  }

  return mapRow(data);
}
