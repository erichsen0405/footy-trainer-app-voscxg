import { supabase } from '@/integrations/supabase/client';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { emitTaskCompletionEvent } from '@/utils/taskEvents';
import type { TaskCompletionEvent } from '@/utils/taskEvents';
import { Task } from '@/types';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { buildTaskMediaNamePayload, buildTaskVideoPayload } from '@/utils/taskVideos';

export interface CreateTaskData {
  title: string;
  description: string;
  categoryIds: string[];
  reminder?: number | null;
  videoUrl?: string | null;
  subtasks?: TaskSubtaskInput[];
  videoUrls?: string[] | null;
  mediaNames?: string[] | null;
  media_names?: string[] | null;
  focusAreas?: string[] | null;
  focus_areas?: string[] | null;
  afterTrainingEnabled?: boolean;
  afterTrainingDelayMinutes?: number | null;
  afterTrainingFeedbackEnableScore?: boolean;
  afterTrainingFeedbackScoreExplanation?: string | null;
  afterTrainingFeedbackEnableIntensity?: boolean;
  afterTrainingFeedbackEnableNote?: boolean;
  autoAddToActivities?: boolean;
  taskDurationEnabled?: boolean;
  taskDurationMinutes?: number | null;
  playerId?: string | null;
  teamId?: string | null;
  sourceFolder?: string | null;
  libraryExerciseId?: string | null;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  categoryIds?: string[];
  reminder?: number | null;
  videoUrl?: string | null;
  subtasks?: TaskSubtaskInput[];
  videoUrls?: string[] | null;
  mediaNames?: string[] | null;
  media_names?: string[] | null;
  focusAreas?: string[] | null;
  focus_areas?: string[] | null;
  afterTrainingEnabled?: boolean;
  afterTrainingDelayMinutes?: number | null;
  afterTrainingFeedbackEnableScore?: boolean;
  afterTrainingFeedbackScoreExplanation?: string | null;
  afterTrainingFeedbackEnableIntensity?: boolean;
  afterTrainingFeedbackEnableNote?: boolean;
  autoAddToActivities?: boolean;
  taskDurationEnabled?: boolean;
  taskDurationMinutes?: number | null;
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

export type TaskSubtaskInput = { id?: string; title: string };

export interface P8CreateTaskArgs {
  task: Task;
  subtasks?: TaskSubtaskInput[];
  adminMode?: string;
  adminTargetType?: string | null;
  adminTargetId?: string | null;
}

const isP8CreateTaskArgs = (value: unknown): value is P8CreateTaskArgs =>
  !!value && typeof value === 'object' && 'task' in value;

const MAX_TASK_DURATION_MINUTES = 600;

const normalizeTaskDurationMinutes = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 0) return null;
  return Math.min(rounded, MAX_TASK_DURATION_MINUTES);
};

const normalizeStringId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const uniqueStringIds = (values: unknown[]): string[] => {
  const ids = values
    .map((value) => normalizeStringId(value))
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set(ids));
};

const normalizeFocusAreas = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.reduce<string[]>((acc, value) => {
    const tag = String(value ?? '').trim();
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) return acc;
    seen.add(key);
    acc.push(tag);
    return acc;
  }, []).slice(0, 12);
};

const toActivityStartMs = (activityDate: unknown, activityTime: unknown): number | null => {
  const date =
    activityDate instanceof Date
      ? Number.isFinite(activityDate.getTime())
        ? activityDate.toISOString().slice(0, 10)
        : ''
      : String(activityDate ?? '').slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const rawTime = String(activityTime ?? '').trim();
  const time = rawTime.length >= 8
    ? rawTime.slice(0, 8)
    : rawTime.length >= 5
      ? `${rawTime.slice(0, 5)}:00`
      : '00:00:00';
  const ms = Date.parse(`${date}T${time}`);
  return Number.isFinite(ms) ? ms : null;
};

const isFutureActivityStart = (activityDate: unknown, activityTime: unknown, now = new Date()): boolean => {
  const startMs = toActivityStartMs(activityDate, activityTime);
  return startMs !== null && startMs >= now.getTime();
};

const isFutureExternalMetaStart = (metaRow: any, now = new Date()): boolean => {
  const localOverride = metaRow?.local_start_override;
  if (localOverride) {
    const localMs = Date.parse(String(localOverride));
    return Number.isFinite(localMs) && localMs >= now.getTime();
  }

  const external = Array.isArray(metaRow?.events_external)
    ? metaRow.events_external[0]
    : metaRow?.events_external;
  return isFutureActivityStart(external?.start_date, external?.start_time, now);
};

const normalizeSubtasksForTemplate = (subtasks: TaskSubtaskInput[] | undefined | null): { title: string; sort_order: number }[] =>
  (subtasks ?? [])
    .map((subtask, index) => ({
      title: String(subtask?.title ?? '').trim(),
      sort_order: index,
    }))
    .filter((subtask) => subtask.title.length > 0);

const syncTaskTemplateSubtasks = async (
  taskTemplateId: string,
  subtasks: TaskSubtaskInput[] | undefined | null,
  signal: AbortSignal,
): Promise<void> => {
  const normalizedTaskTemplateId = normalizeStringId(taskTemplateId);
  if (!normalizedTaskTemplateId) return;

  await supabase
    .from('task_template_subtasks')
    .delete()
    .eq('task_template_id', normalizedTaskTemplateId)
    .abortSignal(signal);

  const rows = normalizeSubtasksForTemplate(subtasks).map((subtask) => ({
    task_template_id: normalizedTaskTemplateId,
    title: subtask.title,
    sort_order: subtask.sort_order,
  }));

  if (!rows.length) return;

  const { error } = await supabase
    .from('task_template_subtasks')
    .insert(rows)
    .abortSignal(signal);

  if (error) throw error;
};

const removeStaleActivityTemplateTasks = async (
  taskId: string,
  nextCategoryIds: string[],
  signal: AbortSignal,
): Promise<void> => {
  const allowedCategoryIds = new Set(nextCategoryIds);

  const collectStaleIds = async (
    column: 'task_template_id' | 'feedback_template_id',
  ): Promise<string[]> => {
    const { data: taskRows, error: taskRowsError } = await supabase
      .from('activity_tasks')
      .select('id, activity_id')
      .eq(column, taskId)
      .abortSignal(signal);

    if (taskRowsError) throw taskRowsError;
    if (!Array.isArray(taskRows) || taskRows.length === 0) return [];

    const activityIds = uniqueStringIds(taskRows.map((row: any) => row?.activity_id));
    if (activityIds.length === 0) {
      return uniqueStringIds(taskRows.map((row: any) => row?.id));
    }

    const { data: activities, error: activitiesError } = await supabase
      .from('activities')
      .select('id, category_id, activity_date, activity_time')
      .in('id', activityIds)
      .abortSignal(signal);

    if (activitiesError) throw activitiesError;

    const activityById = new Map<string, { categoryId: string | null; isFuture: boolean }>();
    (activities ?? []).forEach((row: any) => {
      const activityId = normalizeStringId(row?.id);
      if (!activityId) return;
      activityById.set(activityId, {
        categoryId: normalizeStringId(row?.category_id),
        isFuture: isFutureActivityStart(row?.activity_date, row?.activity_time),
      });
    });

    return uniqueStringIds(
      taskRows
        .filter((row: any) => {
          const activityId = normalizeStringId(row?.activity_id);
          const activity = activityId ? activityById.get(activityId) ?? null : null;
          if (!activity?.isFuture) return false;
          const categoryId = activity.categoryId;
          return !categoryId || !allowedCategoryIds.has(categoryId);
        })
        .map((row: any) => row?.id)
    );
  };

  const staleIds = uniqueStringIds([
    ...(await collectStaleIds('task_template_id')),
    ...(await collectStaleIds('feedback_template_id')),
  ]);

  if (!staleIds.length) return;

  const { error: deleteError } = await supabase
    .from('activity_tasks')
    .delete()
    .in('id', staleIds)
    .abortSignal(signal);

  if (deleteError) throw deleteError;
};

const removeStaleExternalTemplateTasks = async (
  taskId: string,
  nextCategoryIds: string[],
  signal: AbortSignal,
): Promise<void> => {
  const allowedCategoryIds = new Set(nextCategoryIds);

  const collectStaleIds = async (
    column: 'task_template_id' | 'feedback_template_id',
  ): Promise<string[]> => {
    const { data: taskRows, error: taskRowsError } = await supabase
      .from('external_event_tasks')
      .select('id, local_meta_id')
      .eq(column, taskId)
      .abortSignal(signal);

    if (taskRowsError) throw taskRowsError;
    if (!Array.isArray(taskRows) || taskRows.length === 0) return [];

    const localMetaIds = uniqueStringIds(taskRows.map((row: any) => row?.local_meta_id));
    if (localMetaIds.length === 0) {
      return uniqueStringIds(taskRows.map((row: any) => row?.id));
    }

    const { data: metaRows, error: metaRowsError } = await supabase
      .from('events_local_meta')
      .select('id, category_id, local_start_override, events_external(start_date, start_time)')
      .in('id', localMetaIds)
      .abortSignal(signal);

    if (metaRowsError) throw metaRowsError;

    const metaById = new Map<string, { categoryId: string | null; isFuture: boolean }>();
    (metaRows ?? []).forEach((row: any) => {
      const localMetaId = normalizeStringId(row?.id);
      if (!localMetaId) return;
      metaById.set(localMetaId, {
        categoryId: normalizeStringId(row?.category_id),
        isFuture: isFutureExternalMetaStart(row),
      });
    });

    return uniqueStringIds(
      taskRows
        .filter((row: any) => {
          const localMetaId = normalizeStringId(row?.local_meta_id);
          const meta = localMetaId ? metaById.get(localMetaId) ?? null : null;
          if (!meta?.isFuture) return false;
          const categoryId = meta.categoryId;
          return !categoryId || !allowedCategoryIds.has(categoryId);
        })
        .map((row: any) => row?.id)
    );
  };

  const staleIds = uniqueStringIds([
    ...(await collectStaleIds('task_template_id')),
    ...(await collectStaleIds('feedback_template_id')),
  ]);

  if (!staleIds.length) return;

  const { error: deleteError } = await supabase
    .from('external_event_tasks')
    .delete()
    .in('id', staleIds)
    .abortSignal(signal);

  if (deleteError) throw deleteError;
};

const removeStaleTemplateCategoryAssignments = async (
  taskId: string,
  categoryIds: string[],
  signal: AbortSignal,
): Promise<void> => {
  await removeStaleActivityTemplateTasks(taskId, categoryIds, signal);
  await removeStaleExternalTemplateTasks(taskId, categoryIds, signal);
};

export const taskService = {
  /* ======================================================
     CREATE (P8 – autoriseret entry point)
     ====================================================== */
  async createTask(rawData: CreateTaskData | P8CreateTaskArgs, signal: AbortSignal = new AbortController().signal): Promise<Task> {
    console.log('[P8] createTask called', rawData);

    const { data: sessionData, error: authError } = await supabase.auth.getSession();
    const user = sessionData?.session?.user ?? null;
    if (authError) throw authError;
    if (!user) throw new Error('No authenticated user');

    const isP8Payload = isP8CreateTaskArgs(rawData);
    const sourceTask = isP8Payload ? rawData.task ?? ({} as Task) : (rawData as CreateTaskData);
    const title = String((sourceTask as any).title ?? '').trim();
    if (!title) {
      throw new Error('Title mangler');
    }
    if (__DEV__) {
      console.log('[taskService.createTask] title=', title);
    }

    const resolvedDescription = String((sourceTask as any).description ?? '');
    const resolvedCategoryIds = (isP8Payload
      ? ((sourceTask as any).categoryIds ?? [])
      : (rawData as CreateTaskData).categoryIds ?? []) as string[];
    const resolvedSubtasks = (isP8Payload
      ? ((rawData as P8CreateTaskArgs).subtasks ?? (sourceTask as any).subtasks)
      : (rawData as CreateTaskData).subtasks) as TaskSubtaskInput[] | undefined;
    const resolvedReminder =
      ('reminder' in sourceTask ? (sourceTask as any).reminder : (rawData as CreateTaskData).reminder) ?? null;
    const resolvedVideoPayload = buildTaskVideoPayload([
      ('videoUrls' in sourceTask ? (sourceTask as any).videoUrls : (rawData as CreateTaskData).videoUrls) ?? [],
      ('video_urls' in sourceTask ? (sourceTask as any).video_urls : null) ?? [],
      ('videoUrl' in sourceTask ? (sourceTask as any).videoUrl : (rawData as CreateTaskData).videoUrl) ?? null,
      ('video_url' in sourceTask ? (sourceTask as any).video_url : null) ?? null,
    ]);
    const resolvedMediaNamePayload = buildTaskMediaNamePayload(
      [
        ('mediaNames' in sourceTask ? (sourceTask as any).mediaNames : (rawData as CreateTaskData).mediaNames) ?? [],
        ('media_names' in sourceTask ? (sourceTask as any).media_names : (rawData as CreateTaskData).media_names) ?? [],
      ],
      resolvedVideoPayload.videoUrls,
    );
    const resolvedFocusAreas = normalizeFocusAreas([
      ...normalizeFocusAreas('focusAreas' in sourceTask ? (sourceTask as any).focusAreas : (rawData as CreateTaskData).focusAreas),
      ...normalizeFocusAreas('focus_areas' in sourceTask ? (sourceTask as any).focus_areas : (rawData as CreateTaskData).focus_areas),
    ]);
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
    const resolvedTaskDurationEnabled =
      ('taskDurationEnabled' in sourceTask
        ? (sourceTask as any).taskDurationEnabled
        : (rawData as CreateTaskData).taskDurationEnabled) ?? false;
    const resolvedTaskDurationMinutes = resolvedTaskDurationEnabled
      ? normalizeTaskDurationMinutes(
          'taskDurationMinutes' in sourceTask
            ? (sourceTask as any).taskDurationMinutes
            : (rawData as CreateTaskData).taskDurationMinutes
        )
      : null;
    const resolvedSourceFolder =
      ('source_folder' in sourceTask
        ? (sourceTask as any).source_folder
        : ('sourceFolder' in sourceTask
            ? (sourceTask as any).sourceFolder
            : (rawData as CreateTaskData).sourceFolder)) ?? null;
    const resolvedLibraryExerciseId =
      ('library_exercise_id' in sourceTask
        ? (sourceTask as any).library_exercise_id
        : ('libraryExerciseId' in sourceTask
            ? (sourceTask as any).libraryExerciseId
            : (rawData as CreateTaskData).libraryExerciseId)) ?? null;
    const resolvedAutoAddToActivities =
      ('autoAddToActivities' in sourceTask
        ? (sourceTask as any).autoAddToActivities
        : ('auto_add_to_activities' in sourceTask
            ? (sourceTask as any).auto_add_to_activities
            : (rawData as CreateTaskData).autoAddToActivities)) ?? false;

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

    const taskTemplatePayload = {
      user_id: user.id,
      title,
      description: resolvedDescription,
      reminder_minutes: resolvedReminder ?? null,
      video_url: resolvedVideoPayload.video_url,
      video_urls: resolvedVideoPayload.video_urls,
      media_names: resolvedMediaNamePayload.media_names,
      focus_areas: resolvedFocusAreas,
      after_training_enabled: resolvedAfterTrainingEnabled,
      after_training_delay_minutes: resolvedAfterTrainingDelay,
      after_training_feedback_enable_score: resolvedAfterTrainingFeedbackEnableScore,
      after_training_feedback_score_explanation: resolvedAfterTrainingFeedbackEnableScore
        ? resolvedAfterTrainingFeedbackScoreExplanation || null
        : null,
      after_training_feedback_enable_intensity: !!resolvedAfterTrainingEnabled,
      after_training_feedback_enable_note: resolvedAfterTrainingFeedbackEnableNote,
      task_duration_enabled: resolvedTaskDurationEnabled,
      task_duration_minutes: resolvedTaskDurationMinutes,
      auto_add_to_activities: !!resolvedAutoAddToActivities,
      source_folder: resolvedSourceFolder,
      player_id: resolvedPlayerId,
      team_id: resolvedTeamId,
      library_exercise_id: resolvedLibraryExerciseId,
    };
    const templateSelect =
      'id, title, description, reminder_minutes, video_url, video_urls, media_names, focus_areas, source_folder, after_training_enabled, after_training_delay_minutes, after_training_feedback_enable_score, after_training_feedback_score_explanation, after_training_feedback_enable_intensity, after_training_feedback_enable_note, task_duration_enabled, task_duration_minutes, auto_add_to_activities';

    let template: any = null;
    let templateCreated = false;
    const loadExistingTemplateForLibraryExercise = async () => {
      let existingQuery = supabase
        .from('task_templates')
        .select(templateSelect)
        .eq('user_id', user.id)
        .eq('library_exercise_id', resolvedLibraryExerciseId);

      existingQuery =
        resolvedPlayerId === null
          ? existingQuery.is('player_id', null)
          : existingQuery.eq('player_id', resolvedPlayerId);
      existingQuery =
        resolvedTeamId === null
          ? existingQuery.is('team_id', null)
          : existingQuery.eq('team_id', resolvedTeamId);

      const { data: existingTemplate, error: existingTemplateError } = await existingQuery
        .order('created_at', { ascending: true })
        .limit(1)
        .abortSignal(signal)
        .maybeSingle();

      if (existingTemplateError) {
        throw existingTemplateError;
      }
      if (!existingTemplate) {
        throw new Error('Could not retrieve existing assignment for library exercise');
      }

      return existingTemplate;
    };

    if (resolvedLibraryExerciseId) {
      const { data: insertedTemplate, error: insertedTemplateError } = await supabase
        .from('task_templates')
        .insert(taskTemplatePayload)
        .select(templateSelect)
        .abortSignal(signal)
        .single();

      if (insertedTemplateError) {
        const isLibraryUniqueViolation = insertedTemplateError?.code === '23505';
        if (!isLibraryUniqueViolation) {
          throw insertedTemplateError;
        }
        template = await loadExistingTemplateForLibraryExercise();
      } else {
        template = insertedTemplate;
        templateCreated = true;
      }
    } else {
      const { data: insertedTemplate, error: insertedTemplateError } = await supabase
        .from('task_templates')
        .insert(taskTemplatePayload)
        .select(templateSelect)
        .abortSignal(signal)
        .single();

      if (insertedTemplateError) {
        throw insertedTemplateError;
      }

      template = insertedTemplate;
      templateCreated = true;
    }

    if (templateCreated && resolvedCategoryIds?.length) {
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

    if (templateCreated || resolvedSubtasks !== undefined) {
      await syncTaskTemplateSubtasks(template.id, resolvedSubtasks, signal);
    }

    const returnedVideoPayload = buildTaskVideoPayload((template as any).video_urls ?? template.video_url);
    const returnedMediaNamePayload = buildTaskMediaNamePayload((template as any).media_names, returnedVideoPayload.videoUrls);

    // Return the created task in the expected format
    return {
      id: template.id,
      title: template.title,
      description: template.description || '',
      completed: false,
      isTemplate: true,
      categoryIds: resolvedCategoryIds || [],
      reminder: template.reminder_minutes ?? undefined,
      subtasks: normalizeSubtasksForTemplate(resolvedSubtasks).map((subtask, index) => ({
        id: `${template.id}-subtask-${index}`,
        title: subtask.title,
        completed: false,
      })),
      videoUrl: returnedVideoPayload.videoUrl ?? undefined,
      videoUrls: returnedVideoPayload.videoUrls,
      mediaNames: returnedMediaNamePayload.mediaNames,
      media_names: returnedMediaNamePayload.media_names,
      focusAreas: normalizeFocusAreas((template as any).focus_areas ?? resolvedFocusAreas),
      focus_areas: normalizeFocusAreas((template as any).focus_areas ?? resolvedFocusAreas),
      source_folder: template.source_folder ?? undefined,
      afterTrainingEnabled: template.after_training_enabled ?? false,
      afterTrainingDelayMinutes: template.after_training_delay_minutes ?? null,
      afterTrainingFeedbackEnableScore: template.after_training_feedback_enable_score ?? true,
      afterTrainingFeedbackScoreExplanation: template.after_training_feedback_score_explanation ?? null,
      afterTrainingFeedbackEnableIntensity: !!template.after_training_feedback_enable_intensity,
      afterTrainingFeedbackEnableNote: template.after_training_feedback_enable_note ?? true,
      taskDurationEnabled: template.task_duration_enabled ?? false,
      taskDurationMinutes: template.task_duration_minutes ?? null,
      autoAddToActivities: template.auto_add_to_activities ?? !!resolvedAutoAddToActivities,
      auto_add_to_activities: template.auto_add_to_activities ?? !!resolvedAutoAddToActivities,
    };
  },

  /* ======================================================
     UPDATE (used by activities, not the Tasks screen)
     ====================================================== */
  async updateTask(
    taskId: string,
    userId: string,
    updates: UpdateTaskData,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<void> {
    const updateData: TablesUpdate<'task_templates'> = {};
    const nextCategoryIds =
      updates.categoryIds !== undefined ? uniqueStringIds(updates.categoryIds) : null;
    let previousAutoAddToActivities: boolean | null = null;
    const loadCurrentAutoAddToActivities = async (): Promise<boolean> => {
      const { data: autoAddRows, error: autoAddLookupError } = await supabase
        .from('task_templates')
        .select('auto_add_to_activities')
        .eq('id', taskId)
        .eq('user_id', userId)
        .abortSignal(signal);

      if (autoAddLookupError) throw autoAddLookupError;

      const firstRow = Array.isArray(autoAddRows) ? autoAddRows[0] : autoAddRows;
      return firstRow?.auto_add_to_activities === true;
    };

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.reminder !== undefined) updateData.reminder_minutes = updates.reminder;
    if (updates.focusAreas !== undefined || updates.focus_areas !== undefined) {
      (updateData as any).focus_areas = normalizeFocusAreas([
        ...normalizeFocusAreas(updates.focusAreas),
        ...normalizeFocusAreas(updates.focus_areas),
      ]);
    }

    let nextMediaUrlsForNames: string[] | null = null;
    if ('videoUrl' in updates) {
      const videoPayload = buildTaskVideoPayload([updates.videoUrls ?? [], updates.videoUrl ?? null]);
      (updateData as any).video_url = videoPayload.video_url;
      (updateData as any).video_urls = videoPayload.video_urls;
      nextMediaUrlsForNames = videoPayload.videoUrls;
    } else if ('videoUrls' in updates) {
      const videoPayload = buildTaskVideoPayload(updates.videoUrls ?? []);
      (updateData as any).video_url = videoPayload.video_url;
      (updateData as any).video_urls = videoPayload.video_urls;
      nextMediaUrlsForNames = videoPayload.videoUrls;
    }

    if (nextMediaUrlsForNames !== null || 'mediaNames' in updates || 'media_names' in updates) {
      const mediaNamePayload = buildTaskMediaNamePayload(
        [updates.mediaNames ?? [], updates.media_names ?? []],
        nextMediaUrlsForNames ?? updates.videoUrls ?? [],
      );
      (updateData as any).media_names = mediaNamePayload.media_names;
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

    if (shouldSyncSeriesFeedback) {
      updateData.after_training_feedback_enable_intensity = updates.afterTrainingEnabled === false ? false : true;
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

    if (updates.taskDurationEnabled !== undefined) {
      updateData.task_duration_enabled = updates.taskDurationEnabled;
      if (!updates.taskDurationEnabled) {
        updateData.task_duration_minutes = null;
      }
    }

    if (updates.taskDurationMinutes !== undefined) {
      updateData.task_duration_minutes = normalizeTaskDurationMinutes(updates.taskDurationMinutes);
    }

    if (updates.autoAddToActivities !== undefined) {
      try {
        previousAutoAddToActivities = await loadCurrentAutoAddToActivities();
      } catch (autoAddLookupUnexpectedError) {
        console.error(
          '[TEMPLATE_CATEGORY_SYNC] Could not load previous auto-add state before template update',
          autoAddLookupUnexpectedError
        );
        previousAutoAddToActivities = null;
      }
      (updateData as any).auto_add_to_activities = !!updates.autoAddToActivities;
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
       Categories (diff-based, preserves assignment timestamps)
       ---------------------------------- */
    if (nextCategoryIds !== null) {
      const { data: existingCategoryRows, error: existingCategoryError } = await supabase
        .from('task_template_categories')
        .select('category_id')
        .eq('task_template_id', taskId)
        .abortSignal(signal);

      if (existingCategoryError) throw existingCategoryError;

      const existingCategoryIds = uniqueStringIds(
        (existingCategoryRows ?? []).map((row: any) => row?.category_id)
      );
      const nextCategorySet = new Set(nextCategoryIds);
      const existingCategorySet = new Set(existingCategoryIds);
      const categoryIdsToRemove = existingCategoryIds.filter((categoryId) => !nextCategorySet.has(categoryId));
      const categoryIdsToAdd = nextCategoryIds.filter((categoryId) => !existingCategorySet.has(categoryId));

      if (categoryIdsToRemove.length) {
        const { error: deleteError } = await supabase
          .from('task_template_categories')
          .delete()
          .eq('task_template_id', taskId)
          .in('category_id', categoryIdsToRemove)
          .abortSignal(signal);

        if (deleteError) throw deleteError;
      }

      if (categoryIdsToAdd.length) {
        const rows = categoryIdsToAdd.map(categoryId => ({
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

    if (updates.subtasks !== undefined) {
      await syncTaskTemplateSubtasks(taskId, updates.subtasks, signal);
    }

    let resolvedAutoAddToActivities =
      updates.autoAddToActivities !== undefined ? !!updates.autoAddToActivities : null;

    if (nextCategoryIds !== null && resolvedAutoAddToActivities === null) {
      try {
        resolvedAutoAddToActivities = await loadCurrentAutoAddToActivities();
      } catch (autoAddLookupUnexpectedError) {
        console.error(
          '[TEMPLATE_CATEGORY_SYNC] Could not load auto-add state before category sync',
          autoAddLookupUnexpectedError
        );
        resolvedAutoAddToActivities = false;
      }
    }

    const shouldSyncCategoryAssignments =
      (nextCategoryIds !== null && resolvedAutoAddToActivities === true) ||
      (nextCategoryIds === null && updates.autoAddToActivities === true);

    if (shouldSyncCategoryAssignments) {
      try {
        const { error: categorySyncError } = await supabase.rpc(
          'update_all_tasks_from_template',
          {
            p_template_id: taskId,
            p_dry_run: false,
          }
        );

        if (categorySyncError) {
          console.error('[TEMPLATE_CATEGORY_SYNC] update_all_tasks_from_template failed', {
            templateId: taskId,
            error: categorySyncError.message,
          });
        }
      } catch (categorySyncUnexpectedError) {
        console.error(
          '[TEMPLATE_CATEGORY_SYNC] Unexpected update_all_tasks_from_template failure',
          categorySyncUnexpectedError
        );
      }

      if (nextCategoryIds !== null) {
        try {
          await removeStaleTemplateCategoryAssignments(taskId, nextCategoryIds, signal);
        } catch (categoryCleanupUnexpectedError) {
          console.error(
            '[TEMPLATE_CATEGORY_SYNC] Unexpected cleanup failure after template category update',
            categoryCleanupUnexpectedError
          );
        }
      }
    } else if (
      updates.autoAddToActivities === false &&
      previousAutoAddToActivities === true
    ) {
      try {
        await removeStaleTemplateCategoryAssignments(taskId, [], signal);
      } catch (categoryCleanupUnexpectedError) {
        console.error(
          '[TEMPLATE_CATEGORY_SYNC] Unexpected cleanup failure after disabling template auto-add',
          categoryCleanupUnexpectedError
        );
      }
    }

    if (shouldSyncSeriesFeedback) {
      try {
        const { data: syncSummary, error: syncError } = await supabase.rpc(
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

  async setTaskTemplateArchived(
    taskId: string,
    userId: string,
    archived: boolean,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<void> {
    const archivedAt = archived ? new Date().toISOString() : null;
    const nowIso = new Date().toISOString();

    const { data, error } = await (supabase.from('task_templates') as any)
      .update({
        archived_at: archivedAt,
        updated_at: nowIso,
      })
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('id')
      .abortSignal(signal);

    if (error) {
      throw error;
    }

    if (!Array.isArray(data) || data.length === 0) {
      // Fallback for assigned templates where actor is player/team member (non-owner).
      const { data: toggled, error: rpcError } = await (supabase as any)
        .rpc('set_task_template_archived_for_actor', {
          p_task_id: taskId,
          p_archived: archived,
        })
        .abortSignal(signal);

      if (rpcError) {
        throw rpcError;
      }

      if (toggled !== true) {
        throw new Error('You can only archive or restore tasks that you have access to');
      }
    }

    try {
      const { error: syncError } = await supabase.rpc(
        'update_all_tasks_from_template',
        {
          p_template_id: taskId,
          p_dry_run: false,
        }
      );

      if (syncError) {
        console.error('[TEMPLATE_ARCHIVE_SYNC] update_all_tasks_from_template failed', {
          templateId: taskId,
          error: syncError.message,
        });
      }
    } catch (syncUnexpectedError) {
      console.error('[TEMPLATE_ARCHIVE_SYNC] Unexpected update_all_tasks_from_template failure', syncUnexpectedError);
    }
  },

  async deleteTask(taskId: string, userId: string, signal: AbortSignal = new AbortController().signal): Promise<void> {
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

    const runCleanup = async (): Promise<boolean> => {
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
          return false;
        }
        return true;
      } catch (cleanupError) {
        console.error('[taskService.deleteTask] cleanup RPC failed unexpectedly', cleanupError);
        return false;
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

    const cleanupSucceeded = await runCleanup();
    if (!cleanupSucceeded) {
      await runFallbackCleanup();
    }

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

    // Not owned: execute a global remove for shared-assignment templates so all parties
    // (trainer/player) see the same truth.
    const { data: removedByActor, error: removeByActorError } = await (supabase as any)
      .rpc('remove_task_template_for_actor', { p_task_id: taskId })
      .abortSignal(signal);

    if (removeByActorError) {
      throw removeByActorError;
    }

    if (removedByActor !== true) {
      throw new Error('You do not have access to delete this assignment template');
    }

  },

  async deleteActivityTask(
    activityId: string,
    taskId: string,
    userId: string,
    isExternal: boolean,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<void> {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const result = isExternal
      ? await supabase
          .from('external_event_tasks')
          .delete({ count: 'exact' })
          .eq('id', taskId)
          .eq('local_meta_id', activityId)
          .abortSignal(signal)
      : await supabase
          .from('activity_tasks')
          .delete({ count: 'exact' })
          .eq('id', taskId)
          .eq('activity_id', activityId)
          .abortSignal(signal);

    const { error, count } = result;

    if (error) {
      throw error;
    }

    if (!count) {
      throw new Error('Task not found or already deleted');
    }
  },

  async toggleTaskCompletion(taskId: string, signal: AbortSignal = new AbortController().signal): Promise<TaskCompletionEvent> {
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

      const row = data as unknown as Record<string, unknown> & { completed?: boolean };
      const nextCompleted = !row.completed;
      const activityId = row[lookup.activityColumn] as string | null | undefined;

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

  async setTaskCompletion(taskId: string, completed: boolean, signal: AbortSignal = new AbortController().signal): Promise<TaskCompletionEvent> {
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
