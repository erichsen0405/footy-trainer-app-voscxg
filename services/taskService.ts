import { supabase } from '@/app/integrations/supabase/client';
import { emitTaskCompletionEvent } from '@/utils/taskEvents';
import type { TaskCompletionEvent } from '@/utils/taskEvents';
import { Task } from '@/types';

export interface CreateTaskData {
  title: string;
  description: string;
  categoryIds: string[];
  reminder?: number | null;
  videoUrl?: string | null;
  afterTrainingEnabled?: boolean;
  afterTrainingDelayMinutes?: number | null;
  afterTrainingFeedbackEnableScore?: boolean;
  afterTrainingFeedbackScoreExplanation?: string | null;
  afterTrainingFeedbackEnableIntensity?: boolean;
  afterTrainingFeedbackEnableNote?: boolean;
  playerId?: string | null;
  teamId?: string | null;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  categoryIds?: string[];
  reminder?: number | null;
  videoUrl?: string | null;
  afterTrainingEnabled?: boolean;
  afterTrainingDelayMinutes?: number | null;
  afterTrainingFeedbackEnableScore?: boolean;
  afterTrainingFeedbackScoreExplanation?: string | null;
  afterTrainingFeedbackEnableIntensity?: boolean;
  afterTrainingFeedbackEnableNote?: boolean;
}

type SeriesFeedbackSummary = {
  templateId?: string;
  seriesCount?: number;
  directActivityUpdates?: number;
  seriesActivityUpdates?: number;
  totalActivityUpdates?: number;
  externalEventUpdates?: number;
  dryRun?: boolean;
};

export const taskService = {
  /* ======================================================
     CREATE (P8 – autoriseret entry point)
     ====================================================== */
  async createTask(data: CreateTaskData, signal?: AbortSignal): Promise<Task> {
    console.log('[P8] createTask called', data);

    const { data: sessionData, error: authError } = await supabase.auth.getSession();
    const user = sessionData?.session?.user ?? null;
    if (authError) throw authError;
    if (!user) throw new Error('No authenticated user');

    const enableScore = data.afterTrainingFeedbackEnableScore ?? true;
    const trimmedScoreExplanation = enableScore ? data.afterTrainingFeedbackScoreExplanation?.trim() : null;

    /* ----------------------------------
       1. Insert task template
       ---------------------------------- */
    const { data: template, error: templateError } = await supabase
      .from('task_templates')
      .insert({
        user_id: user.id,
        title: data.title,
        description: data.description ?? '',
        reminder_minutes: data.reminder ?? null,
        video_url: data.videoUrl ?? null,
        after_training_enabled: data.afterTrainingEnabled ?? false,
        after_training_delay_minutes: data.afterTrainingDelayMinutes ?? null,
        after_training_feedback_enable_score: enableScore,
        after_training_feedback_score_explanation: trimmedScoreExplanation?.length ? trimmedScoreExplanation : null,
        // Force intensity feedback to be enabled for consistency
        after_training_feedback_enable_intensity: true,
        after_training_feedback_enable_note: data.afterTrainingFeedbackEnableNote ?? true,

        // admin-scope
        player_id: data.playerId ?? null,
        team_id: data.teamId ?? null,
      })
      .select('id, title, description, reminder_minutes, video_url, source_folder, after_training_enabled, after_training_delay_minutes, after_training_feedback_enable_score, after_training_feedback_score_explanation, after_training_feedback_enable_intensity, after_training_feedback_enable_note')
      .abortSignal(signal)
      .single();

    if (templateError) {
      throw templateError;
    }

    /* ----------------------------------
       2. Insert category relations
       ---------------------------------- */
    if (data.categoryIds?.length) {
      const rows = data.categoryIds.map(categoryId => ({
        task_template_id: template.id,
        category_id: categoryId,
      }));

      const { error: categoryError } = await supabase
        .from('task_template_categories')
        .insert(rows)
        .abortSignal(signal);

      if (categoryError) {
        throw categoryError;
      }
    }

    // Return the created task in the expected format
    return {
      id: template.id,
      title: template.title,
      description: template.description || '',
      completed: false,
      isTemplate: true,
      categoryIds: data.categoryIds || [],
      reminder: template.reminder_minutes ?? undefined,
      subtasks: [],
      videoUrl: template.video_url ?? undefined,
      source_folder: template.source_folder ?? undefined,
      afterTrainingEnabled: template.after_training_enabled ?? false,
      afterTrainingDelayMinutes: template.after_training_delay_minutes ?? null,
      afterTrainingFeedbackEnableScore: template.after_training_feedback_enable_score ?? true,
      afterTrainingFeedbackScoreExplanation: template.after_training_feedback_score_explanation ?? null,
      // Always return true so UI/clients see a consistent state
      afterTrainingFeedbackEnableIntensity: true,
      afterTrainingFeedbackEnableNote: template.after_training_feedback_enable_note ?? true,
    };
  },

  /* ======================================================
     UPDATE (bruges af aktiviteter – ikke Tasks-skærmen)
     ====================================================== */
  async updateTask(
    taskId: string,
    userId: string,
    updates: UpdateTaskData,
    signal?: AbortSignal,
  ): Promise<void> {
    const updateData: Record<string, any> = {};

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.reminder !== undefined) updateData.reminder_minutes = updates.reminder;

    if ('videoUrl' in updates) {
      updateData.video_url = updates.videoUrl ?? null;
    }

    const shouldSyncSeriesFeedback =
      updates.afterTrainingEnabled !== undefined ||
      updates.afterTrainingDelayMinutes !== undefined ||
      updates.afterTrainingFeedbackEnableScore !== undefined ||
      updates.afterTrainingFeedbackEnableNote !== undefined ||
      updates.afterTrainingFeedbackScoreExplanation !== undefined ||
      updates.afterTrainingFeedbackEnableIntensity !== undefined;

    if (updates.afterTrainingEnabled !== undefined) {
      updateData.after_training_enabled = updates.afterTrainingEnabled;
    }

    if (updates.afterTrainingDelayMinutes !== undefined) {
      updateData.after_training_delay_minutes = updates.afterTrainingDelayMinutes;
    }

    if (updates.afterTrainingFeedbackEnableScore !== undefined) {
      updateData.after_training_feedback_enable_score = updates.afterTrainingFeedbackEnableScore;
      if (!updates.afterTrainingFeedbackEnableScore) {
        updateData.after_training_feedback_score_explanation = null;
      }
    }

    // Do not allow disabling intensity – enforce true on relevant updates
    if (shouldSyncSeriesFeedback) {
      updateData.after_training_feedback_enable_intensity = true;
    }

    if (updates.afterTrainingFeedbackScoreExplanation !== undefined) {
      const trimmed = updates.afterTrainingFeedbackScoreExplanation?.trim();
      const scoreDisabled = updates.afterTrainingFeedbackEnableScore === false;
      updateData.after_training_feedback_score_explanation = scoreDisabled
        ? null
        : trimmed?.length
          ? trimmed
          : null;
    }

    if (updates.afterTrainingFeedbackEnableNote !== undefined) {
      updateData.after_training_feedback_enable_note = updates.afterTrainingFeedbackEnableNote;
    }

    updateData.updated_at = new Date().toISOString();

    const { error: templateError } = await supabase
      .from('task_templates')
      .update(updateData)
      .eq('id', taskId)
      .eq('user_id', userId)
      .abortSignal(signal);

    if (templateError) {
      throw templateError;
    }

    /* ----------------------------------
       Categories (replace-all strategy)
       ---------------------------------- */
    if (updates.categoryIds) {
      await supabase
        .from('task_template_categories')
        .delete()
        .eq('task_template_id', taskId)
        .abortSignal(signal);

      if (updates.categoryIds.length) {
        const rows = updates.categoryIds.map(categoryId => ({
          task_template_id: taskId,
          category_id: categoryId,
        }));

        const { error } = await supabase
          .from('task_template_categories')
          .insert(rows)
          .abortSignal(signal);

        if (error) throw error;
      }
    }

    if (shouldSyncSeriesFeedback) {
      try {
        const { data: syncSummary, error: syncError } = await supabase.rpc<SeriesFeedbackSummary>(
          'update_all_tasks_from_template',
          {
            p_template_id: taskId,
            p_dry_run: true,
          }
        );

        if (syncError) {
          console.error('[SERIES_FEEDBACK_SYNC] Summary RPC failed', {
            templateId: taskId,
            error: syncError.message,
          });
        } else if (syncSummary) {
          const rawAny: any = syncSummary;
          const raw =
            rawAny && typeof rawAny === 'object' && !Array.isArray(rawAny) ? rawAny : {};

          const templateId = raw.templateId ?? raw.template_id ?? taskId;
          const seriesCount = raw.seriesCount ?? raw.series_count ?? 0;
          const directActivityUpdates =
            raw.directActivityUpdates ?? raw.direct_activity_updates ?? 0;
          const seriesActivityUpdates =
            raw.seriesActivityUpdates ?? raw.series_activity_updates ?? 0;
          const totalActivityUpdates =
            raw.totalActivityUpdates ??
            raw.total_activity_updates ??
            (directActivityUpdates + seriesActivityUpdates);
          const externalEventUpdates =
            raw.externalEventUpdates ?? raw.external_event_updates ?? 0;

          console.log('[SERIES_FEEDBACK_SYNC]', {
            templateId,
            seriesCount,
            totalActivityUpdates,
            externalEventUpdates,
            directActivityUpdates,
            seriesActivityUpdates,
            dryRun: true,
          });
        }
      } catch (logError) {
        console.error('[SERIES_FEEDBACK_SYNC] Unexpected logging failure', logError);
      }
    }
  },

  /* ======================================================
     DELETE
     ====================================================== */
  async getHiddenTaskTemplateIds(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('hidden_task_templates')
      .select('task_template_id')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return (data || []).map(d => d.task_template_id);
  },

  async deleteTask(taskId: string, userId: string, signal?: AbortSignal): Promise<void> {
    let templateTitle: string | null = null;

    try {
      const { data: templateRow, error: templateLookupError } = await supabase
        .from('task_templates')
        .select('title')
        .eq('id', taskId)
        .eq('user_id', userId)
        .abortSignal(signal)
        .maybeSingle();

      if (templateLookupError) {
        console.error('[taskService.deleteTask] template lookup error', {
          taskId,
          userId,
          message: templateLookupError.message,
        });
      } else {
        templateTitle = templateRow?.title ?? null;
      }
    } catch (templateLookupUnexpected) {
      console.error('[taskService.deleteTask] template lookup failed unexpectedly', templateLookupUnexpected);
    }

    const runCleanup = async () => {
      try {
        const { error } = await supabase.rpc('cleanup_tasks_for_template', {
          p_user_id: userId,
          p_template_id: taskId,
          p_template_title: templateTitle,
        });

        if (error) {
          console.error('[taskService.deleteTask] cleanup RPC error', {
            taskId,
            userId,
            message: error.message,
          });
        }
      } catch (cleanupError) {
        console.error('[taskService.deleteTask] cleanup RPC failed unexpectedly', cleanupError);
      }
    };

    await runCleanup();

    // Try hard delete for owned tasks
    const { data: deleted, error: deleteError } = await supabase
      .from('task_templates')
      .delete()
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('id')
      .abortSignal(signal);

    if (deleteError) {
      throw deleteError;
    }

    if (deleted?.length) {
      return;
    }

    // Not owned, perform soft delete
    const { error: insertError } = await supabase
      .from('hidden_task_templates')
      .upsert({ user_id: userId, task_template_id: taskId }, { onConflict: 'user_id,task_template_id' })
      .abortSignal(signal);

    if (insertError) {
      throw insertError;
    }

  },

  async deleteActivityTask(
    activityId: string,
    taskId: string,
    userId: string,
    isExternal: boolean,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const table = isExternal ? 'external_event_tasks' : 'activity_tasks';
    const activityColumn = isExternal ? 'local_meta_id' : 'activity_id';

    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .eq('id', taskId)
      .eq(activityColumn, activityId)
      .abortSignal(signal);

    if (error) {
      throw error;
    }

    if (!count) {
      throw new Error('Task not found or already deleted');
    }
  },

  async toggleTaskCompletion(taskId: string, signal?: AbortSignal): Promise<TaskCompletionEvent> {
    const nowIso = new Date().toISOString();
    const lookups: Array<{ table: 'activity_tasks' | 'external_event_tasks'; activityColumn: 'activity_id' | 'local_meta_id' }> = [
      { table: 'activity_tasks', activityColumn: 'activity_id' },
      { table: 'external_event_tasks', activityColumn: 'local_meta_id' },
    ];

    for (const lookup of lookups) {
      const { data, error } = await supabase
        .from(lookup.table)
        .select(`id, completed, ${lookup.activityColumn}`)
        .eq('id', taskId)
        .abortSignal(signal)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        continue;
      }

      const nextCompleted = !data.completed;
      const activityId = (data as any)?.[lookup.activityColumn];

      if (!activityId) {
        throw new Error('Task missing activity reference');
      }

      const { error: updateError } = await supabase
        .from(lookup.table)
        .update({
          completed: nextCompleted,
          updated_at: nowIso,
        })
        .eq('id', taskId)
        .abortSignal(signal);

      if (updateError) {
        throw updateError;
      }

      const event: TaskCompletionEvent = {
        activityId,
        taskId,
        completed: nextCompleted,
      };

      emitTaskCompletionEvent(event);
      return event;
    }

    throw new Error('Task not found in activity or external task tables');
  },

  async setTaskCompletion(taskId: string, completed: boolean, signal?: AbortSignal): Promise<TaskCompletionEvent> {
    const nowIso = new Date().toISOString();
    const lookups: Array<{ table: 'activity_tasks' | 'external_event_tasks'; activityColumn: 'activity_id' | 'local_meta_id' }> = [
      { table: 'activity_tasks', activityColumn: 'activity_id' },
      { table: 'external_event_tasks', activityColumn: 'local_meta_id' },
    ];

    for (const lookup of lookups) {
      const { data, error } = await supabase
        .from(lookup.table)
        .select(`id, completed, ${lookup.activityColumn}`)
        .eq('id', taskId)
        .abortSignal(signal)
        .maybeSingle();

      if (error) throw error;
      if (!data) continue;

      const activityId = (data as any)?.[lookup.activityColumn];
      if (!activityId) throw new Error('Task missing activity reference');

      if ((data as any).completed !== completed) {
        const { error: updateError } = await supabase
          .from(lookup.table)
          .update({ completed, updated_at: nowIso })
          .eq('id', taskId)
          .abortSignal(signal);

        if (updateError) throw updateError;
      }

      const event: TaskCompletionEvent = { activityId, taskId, completed };
      emitTaskCompletionEvent(event);
      return event;
    }

    throw new Error('Task not found in activity or external task tables');
  },
};
