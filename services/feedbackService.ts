import { supabase } from '@/app/integrations/supabase/client';
import { TaskTemplateSelfFeedback } from '@/types';

export interface UpsertSelfFeedbackPayload {
  userId: string;
  templateId: string;
  activityId: string;
  rating: number | null;
  intensity: number | null;
  note: string;
}

function mapRow(row: any): TaskTemplateSelfFeedback {
  return {
    id: row.id,
    userId: row.user_id,
    taskTemplateId: row.task_template_id,
    activityId: row.activity_id,
    rating: row.rating,
    intensity: row.intensity,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchSelfFeedbackForTemplates(
  userId: string,
  templateIds: string[]
): Promise<TaskTemplateSelfFeedback[]> {
  if (!templateIds.length) {
    return [];
  }

  const { data, error } = await supabase
    .from('task_template_self_feedback')
    .select('*')
    .eq('user_id', userId)
    .in('task_template_id', templateIds)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map(mapRow);
}

export async function upsertSelfFeedback(
  payload: UpsertSelfFeedbackPayload
): Promise<TaskTemplateSelfFeedback> {
  const trimmedNote = payload.note?.trim() ?? '';

  const { data, error } = await supabase
    .from('task_template_self_feedback')
    .upsert(
      {
        user_id: payload.userId,
        task_template_id: payload.templateId,
        activity_id: payload.activityId,
        rating: payload.rating,
        intensity: payload.intensity,
        note: trimmedNote.length ? trimmedNote : null,
      },
      { onConflict: 'user_id,task_template_id,activity_id' }
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapRow(data);
}
