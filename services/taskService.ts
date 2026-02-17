/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { supabase } from '@/integrations/supabase/client';
import { emitTaskCompletionEvent } from '@/utils/taskEvents';
import type { TaskCompletionEvent } from '@/utils/taskEvents';
import { Task } from '@/types';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';

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
  sourceFolder?: string | null;
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

type TaskSubtaskInput = { id?: string; title: string };

export interface P8CreateTaskArgs {
  task: Task;
  subtasks: TaskSubtaskInput[];
  adminMode?: string;
  adminTargetType?: string | null;
  adminTargetId?: string | null;
}

const isP8CreateTaskArgs = (value: unknown): value is P8CreateTaskArgs =>
  !!value && typeof value === 'object' && 'task' in value;

export const taskService = {
  /* ======================================================
     CREATE (P8 – autoriseret entry point)
     ====================================================== */
  async createTask(rawData: CreateTaskData | P8CreateTaskArgs, signal?: AbortSignal): Promise<Task> {
    console.log('[P8] createTask called', rawData);

    const { data: sessionData, error: authError } = await supabase.auth.getSession();
    const user = sessionData?.session?.user ?? null;
    if (authError) throw authError;
    if (!user) throw new Error('No authenticated user');

    const isP8Payload = isP8CreateTaskArgs(rawData);
    const sourceTask = isP8Payload ? rawData.task ?? ({} as Task) : (rawData as CreateTaskData);
    const title = String((sourceTask as any).title ?? '').trim();
    if (!title) {
      throw new Error('Titel mangler');
    }
    if (__DEV__) {
      console.log('[taskService.createTask] title=', title);
    }

    const resolvedDescription = String((sourceTask as any).description ?? '');
    const resolvedCategoryIds = (isP8Payload
      ? ((sourceTask as any).categoryIds ?? [])
      : (rawData as CreateTaskData).categoryIds ?? []) as string[];
    const resolvedReminder =
      ('reminder' in sourceTask ? (sourceTask as any).reminder : (rawData as CreateTaskData).reminder) ?? null;
    const resolvedVideoUrl =
      ('videoUrl' in sourceTask ? (sourceTask as any).videoUrl : (rawData as CreateTaskData).videoUrl) ?? null;
    const resolvedAfterTrainingEnabled =
      ('afterTrainingEnabled' in sourceTask
        ? (sourceTask as any).afterTrainingEnabled
        : (rawData as CreateTaskData).afterTrainingEnabled) ?? false;
    const resolvedAfterTrainingDelay =
      resolvedAfterTrainingEnabled
        ? ('afterTrainingDelayMinutes' in sourceTask
            ? (sourceTask as any).afterTrainingDelayMinutes
            : (rawData as CreateTaskData).afterTrainingDelayMinutes) ?? 0
        : null;
    const resolvedAfterTrainingFeedbackEnableScore =
      ('afterTrainingFeedbackEnableScore' in sourceTask
        ? (sourceTask as any).afterTrainingFeedbackEnableScore
        : (rawData as CreateTaskData).afterTrainingFeedbackEnableScore) ?? true;
    const resolvedAfterTrainingFeedbackScoreExplanation =
      resolvedAfterTrainingFeedbackEnableScore
        ? String(
            ('afterTrainingFeedbackScoreExplanation' in sourceTask
              ? (sourceTask as any).afterTrainingFeedbackScoreExplanation
              : (rawData as CreateTaskData).afterTrainingFeedbackScoreExplanation) ?? ''
          ).trim()
        : '';
    const resolvedAfterTrainingFeedbackEnableNote =
      ('afterTrainingFeedbackEnableNote' in sourceTask
        ? (sourceTask as any).afterTrainingFeedbackEnableNote
        : (rawData as CreateTaskData).afterTrainingFeedbackEnableNote) ?? true;
    const resolvedSourceFolder =
      ('source_folder' in sourceTask
        ? (sourceTask as any).source_folder
        : ('sourceFolder' in sourceTask
            ? (sourceTask as any).sourceFolder
            : (rawData as CreateTaskData).sourceFolder)) ?? null;

    let resolvedPlayerId: string | null =
      (rawData as CreateTaskData).playerId ?? null;
    let resolvedTeamId: string | null =
      (rawData as CreateTaskData).teamId ?? null;

    if (isP8Payload) {
      resolvedPlayerId = null;
      resolvedTeamId = null;
      if (rawData.adminMode && rawData.adminMode !== 'self') {
        if (rawData.adminTargetType === 'player') {
          resolvedPlayerId = rawData.adminTargetId ?? null;
        } else if (rawData.adminTargetType === 'team') {
          resolvedTeamId = rawData.adminTargetId ?? null;
        }
      }
    }

    const { data: template, error: templateError } = await supabase
      .from('task_templates')
      .insert({
        user_id: user.id,
        title,
        description: resolvedDescription,
        reminder_minutes: resolvedReminder ?? null,
        video_url: resolvedVideoUrl ?? null,
        after_training_enabled: resolvedAfterTrainingEnabled,
        after_training_delay_minutes: resolvedAfterTrainingDelay,
        after_training_feedback_enable_score: resolvedAfterTrainingFeedbackEnableScore,
        after_training_feedback_score_explanation: resolvedAfterTrainingFeedbackEnableScore
          ? resolvedAfterTrainingFeedbackScoreExplanation || null
          : null,
        after_training_feedback_enable_intensity: true,
        after_training_feedback_enable_note: resolvedAfterTrainingFeedbackEnableNote,
        source_folder: resolvedSourceFolder,
        player_id: resolvedPlayerId,
        team_id: resolvedTeamId,
      })
      .select('id, title, description, reminder_minutes, video_url, source_folder, after_training_enabled, after_training_delay_minutes, after_training_feedback_enable_score, after_training_feedback_score_explanation, after_training_feedback_enable_intensity, after_training_feedback_enable_note')
      .abortSignal(signal)
      .single();

    if (templateError) {
      throw templateError;
    }

    if (resolvedCategoryIds?.length) {
      const rows = resolvedCategoryIds.map(categoryId => ({
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

    if (isP8Payload) {
      const validSubtasks = (rawData.subtasks ?? [])
        .map(s => ({ ...s, title: String(s.title ?? '').trim() }))
        .filter(s => s.title.length > 0);

      if (validSubtasks.length) {
        const subtaskRows = validSubtasks.map((subtask, index) => ({
          task_template_id: template.id,
          title: subtask.title,
          sort_order: index,
        }));

        const { error: subtaskError } = await supabase
          .from('task_template_subtasks')
          .insert(subtaskRows)
          .abortSignal(signal);

        if (subtaskError) {
          throw subtaskError;
        }
      }
    }

    // Return the created task in the expected format
    return {
      id: template.id,
      title: template.title,
      description: template.description || '',
      completed: false,
      isTemplate: true,
      categoryIds: resolvedCategoryIds || [],
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
    const normalizeId = (value: unknown): string | null => {
      if (value === null || value === undefined) return null;
      const normalized = String(value).trim();
      return normalized.length ? normalized : null;
    };
    const normalizeTitle = (value?: string | null): string => {
      if (typeof value !== 'string') return '';
      return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    };
    const stripLeadingFeedbackPrefix = (value?: string | null): string => {
      return normalizeTitle(value).replace(/^feedback\s+pa\s*/i, '');
    };
    const isFeedbackTitle = (value?: string | null): boolean => {
      return normalizeTitle(value).startsWith('feedback pa');
    };
    const isMissingColumnError = (error: any, columnName: string): boolean => {
      const hay = [error?.message, error?.details, error?.hint, error?.code]
        .filter(Boolean)
        .map(v => String(v).toLowerCase())
        .join(' | ');
      return hay.includes(String(columnName).toLowerCase());
    };

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
          // Force explicit 3-arg resolution in PostgREST (avoid overload ambiguity).
          p_template_title: templateTitle ?? '',
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

    const runFallbackCleanup = async () => {
      try {
        // Hard-delete tasks that still reference the template directly.
        await supabase.from('activity_tasks').delete().eq('task_template_id', taskId).abortSignal(signal);
        await supabase.from('external_event_tasks').delete().eq('task_template_id', taskId).abortSignal(signal);

        // Also delete feedback tasks linked via feedback_template_id (older rows may survive RPC cleanup).
        try {
          await supabase.from('activity_tasks').delete().eq('feedback_template_id', taskId).abortSignal(signal);
        } catch (error) {
          if (!isMissingColumnError(error, 'feedback_template_id')) {
            console.error('[taskService.deleteTask] fallback internal feedback_template cleanup failed', error);
          }
        }

        try {
          await supabase.from('external_event_tasks').delete().eq('feedback_template_id', taskId).abortSignal(signal);
        } catch (error) {
          if (!isMissingColumnError(error, 'feedback_template_id')) {
            console.error('[taskService.deleteTask] fallback external feedback_template cleanup failed', error);
          }
        }

        const normalizedTemplateTitle = normalizeTitle(templateTitle);
        const normalizedTemplateFeedbackTitle = normalizedTemplateTitle
          ? normalizeTitle(`Feedback pa ${templateTitle}`)
          : '';

        const candidateQuery = await supabase
          .from('activity_tasks')
          .select('id, activity_id, title, description, task_template_id, feedback_template_id')
          .abortSignal(signal);

        if (!candidateQuery.error && Array.isArray(candidateQuery.data) && candidateQuery.data.length) {
          const byActivity = new Map<string, any[]>();
          candidateQuery.data.forEach(row => {
            const activityId = normalizeId((row as any)?.activity_id);
            if (!activityId) return;
            const list = byActivity.get(activityId) || [];
            list.push(row);
            byActivity.set(activityId, list);
          });

          const orphanIds = new Set<string>();

          byActivity.forEach(rows => {
            const parentTemplateIds = new Set<string>();
            const parentTitles = new Set<string>();

            rows.forEach(row => {
              const directTemplate = normalizeId((row as any)?.task_template_id);
              const feedbackTemplate = normalizeId((row as any)?.feedback_template_id);
              if (directTemplate && !feedbackTemplate) {
                parentTemplateIds.add(directTemplate);
                const title = normalizeTitle((row as any)?.title);
                if (title) parentTitles.add(title);
              }
            });

            rows.forEach(row => {
              const id = normalizeId((row as any)?.id);
              if (!id) return;

              const directTemplate = normalizeId((row as any)?.task_template_id);
              const feedbackTemplate = normalizeId((row as any)?.feedback_template_id);
              const markerTemplate =
                parseTemplateIdFromMarker(typeof (row as any)?.description === 'string' ? (row as any).description : '') ||
                parseTemplateIdFromMarker(typeof (row as any)?.title === 'string' ? (row as any).title : '');
              const markerTemplateId = normalizeId(markerTemplate);
              const normalizedTitle = normalizeTitle((row as any)?.title);
              const feedbackBaseTitle = stripLeadingFeedbackPrefix((row as any)?.title);
              const looksLikeFeedback = !!feedbackTemplate || !!markerTemplateId || isFeedbackTitle((row as any)?.title);

              if (directTemplate === taskId || feedbackTemplate === taskId || markerTemplateId === taskId) {
                orphanIds.add(id);
                return;
              }

              if (!looksLikeFeedback) return;

              const linkedTemplateId = feedbackTemplate ?? markerTemplateId;
              if (linkedTemplateId) {
                if (!parentTemplateIds.has(linkedTemplateId)) {
                  orphanIds.add(id);
                }
                return;
              }

              if (normalizedTemplateTitle && normalizedTemplateFeedbackTitle) {
                if (normalizedTitle === normalizedTemplateFeedbackTitle && !parentTitles.has(normalizedTemplateTitle)) {
                  orphanIds.add(id);
                  return;
                }
              }

              if (feedbackBaseTitle && !parentTitles.has(feedbackBaseTitle)) {
                orphanIds.add(id);
              }
            });
          });

          if (orphanIds.size) {
            await supabase.from('activity_tasks').delete().in('id', Array.from(orphanIds)).abortSignal(signal);
          }
        }
      } catch (error) {
        console.error('[taskService.deleteTask] fallback cleanup failed unexpectedly', error);
      }
    };

    await runCleanup();
    await runFallbackCleanup();

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
    const lookups: { table: 'activity_tasks' | 'external_event_tasks'; activityColumn: 'activity_id' | 'local_meta_id' }[] = [
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
    const lookups: { table: 'activity_tasks' | 'external_event_tasks'; activityColumn: 'activity_id' | 'local_meta_id' }[] = [
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
