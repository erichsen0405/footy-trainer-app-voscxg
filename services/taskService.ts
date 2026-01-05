import { supabase } from '@/app/integrations/supabase/client';
import { emitTaskCompletionEvent } from '@/utils/taskEvents';
import type { TaskCompletionEvent } from '@/utils/taskEvents';
import { Task } from '@/types';

export interface CreateTaskData {
  title: string;
  description: string;
  categoryIds: string[];
  reminder?: number;
  videoUrl?: string;
  afterTrainingEnabled?: boolean;
  afterTrainingDelayMinutes?: number | null;
  playerId?: string | null;
  teamId?: string | null;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  categoryIds?: string[];
  reminder?: number;
  videoUrl?: string | null;
  afterTrainingEnabled?: boolean;
  afterTrainingDelayMinutes?: number | null;
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

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('No authenticated user');
    }

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

        // admin-scope
        player_id: data.playerId ?? null,
        team_id: data.teamId ?? null,
      })
      .select('id, title, description, reminder_minutes, video_url, source_folder, after_training_enabled, after_training_delay_minutes')
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
      updates.afterTrainingEnabled !== undefined || updates.afterTrainingDelayMinutes !== undefined;

    if (updates.afterTrainingEnabled !== undefined) {
      updateData.after_training_enabled = updates.afterTrainingEnabled;
    }

    if (updates.afterTrainingDelayMinutes !== undefined) {
      updateData.after_training_delay_minutes = updates.afterTrainingDelayMinutes;
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
          console.log('[SERIES_FEEDBACK_SYNC]', {
            templateId: syncSummary.templateId ?? taskId,
            seriesCount: syncSummary.seriesCount ?? 0,
            totalActivityUpdates: syncSummary.totalActivityUpdates ?? 0,
            externalEventUpdates: syncSummary.externalEventUpdates ?? 0,
            directActivityUpdates: syncSummary.directActivityUpdates ?? 0,
            seriesActivityUpdates: syncSummary.seriesActivityUpdates ?? 0,
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
    const runCleanup = async () => {
      try {
        const { error } = await supabase.rpc('cleanup_tasks_for_template', {
          p_user_id: userId,
          p_template_id: taskId,
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
    const lookups: Array<{ table: 'activity_tasks' | 'external_event_tasks'; activityColumn: 'activity_id' | 'local_meta_id'; }> = [
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
};
