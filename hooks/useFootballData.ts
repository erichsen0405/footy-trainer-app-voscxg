/* eslint-disable no-useless-catch */
import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  ActivityCategory,
  Task,
  Trophy,
  ExternalCalendar,
  ActivitySeries,
} from '@/types';
import { supabase } from '@/app/integrations/supabase/client';
import { checkNotificationPermissions } from '@/utils/notificationService';
import {
  refreshNotificationQueue,
  forceRefreshNotificationQueue,
} from '@/utils/notificationScheduler';
import { startOfWeek, endOfWeek } from 'date-fns';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { taskService } from '@/services/taskService';
import { activityService } from '@/services/activityService';
import { calendarService } from '@/services/calendarService';
import { useAdmin } from '@/contexts/AdminContext';
import { subscribeToTaskCompletion, emitTaskCompletionEvent } from '@/utils/taskEvents';
import { emitActivityPatch, emitActivitiesRefreshRequested } from '@/utils/activityEvents';

export const useFootballData = () => {
  const { adminMode, adminTargetId, adminTargetType } = useAdmin();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [activitySeries, setActivitySeries] = useState<ActivitySeries[]>([]);
  const [externalActivities] = useState<Activity[]>([]);
  const [currentWeekStats, setCurrentWeekStats] = useState({
    percentage: 0,
    completedTasks: 0,
    totalTasks: 0,
    completedTasksForWeek: 0,
    totalTasksForWeek: 0,
    weekActivities: [] as Activity[],
  });
  const [loading, setLoading] = useState(true);

  const findTaskCompletionState = useCallback(
    (activityId: string, taskId: string): boolean | null => {
      const targetActivity = activities.find(activity => String((activity as any).id) === String(activityId));
      if (!targetActivity) {
        return null;
      }

      const tasks = Array.isArray((targetActivity as any).tasks) ? (targetActivity as any).tasks : [];
      const targetTask = tasks.find((task: any) => String(task.id) === String(taskId));

      if (typeof targetTask?.completed === 'boolean') {
        return !!targetTask.completed;
      }

      return null;
    },
    [activities]
  );

  const applyActivityPatch = useCallback(
    (activityId: string, updates: Record<string, any>): (() => void) | undefined => {
      if (!updates || !Object.keys(updates).length) {
        return undefined;
      }

      let previousSnapshot: any = null;
      let applied = false;

      setActivities(prevActivities => {
        let mutated = false;

        const nextActivities = prevActivities.map(activity => {
          if (String((activity as any).id) !== String(activityId)) {
            return activity;
          }

          previousSnapshot = activity;
          mutated = true;
          applied = true;
          return { ...activity, ...updates };
        });

        return mutated ? nextActivities : prevActivities;
      });

      emitActivityPatch({ activityId, updates });

      if (!applied || !previousSnapshot) {
        return undefined;
      }

      const rollbackUpdates: Record<string, any> = {};
      Object.keys(updates).forEach(key => {
        rollbackUpdates[key] = previousSnapshot[key];
      });

      return () => {
        setActivities(prevActivities =>
          prevActivities.map(activity =>
            String((activity as any).id) === String(activityId)
              ? { ...activity, ...rollbackUpdates }
              : activity
          )
        );

        emitActivityPatch({ activityId, updates: rollbackUpdates });
      };
    },
    []
  );

  const buildOptimisticActivityUpdates = useCallback(
    (updates: {
      title?: string;
      location?: string;
      categoryId?: string;
      date?: Date;
      time?: string;
      endTime?: string;
      intensity?: number | null;
    }) => {
      const payload: Record<string, any> = {};

      if (updates.title !== undefined) {
        payload.title = updates.title;
      }

      if (updates.location !== undefined) {
        payload.location = updates.location;
      }

      if (updates.date instanceof Date) {
        payload.activity_date = updates.date.toISOString().slice(0, 10);
      }

      if (updates.time !== undefined) {
        payload.activity_time = updates.time;
      }

      if (updates.endTime !== undefined) {
        payload.activity_end_time = updates.endTime ?? null;
      }

      if (updates.categoryId !== undefined) {
        const normalizedId = updates.categoryId === null ? null : String(updates.categoryId);
        payload.category_id = normalizedId;

        const categoryMeta =
          normalizedId === null
            ? null
            : categories.find(cat => String(cat.id) === normalizedId) ?? null;

        if (categoryMeta) {
          const sharedCategory = {
            id: categoryMeta.id,
            name: categoryMeta.name,
            color: categoryMeta.color,
            emoji: categoryMeta.emoji,
          };

          payload.category = categoryMeta;
          payload.activity_categories = sharedCategory;
          payload.activity_category = sharedCategory;
          payload.categoryColor = categoryMeta.color ?? null;
          payload.category_color = categoryMeta.color ?? null;
        } else {
          payload.category = null;
          payload.activity_categories = null;
          payload.activity_category = null;
          payload.categoryColor = null;
          payload.category_color = null;
        }
      }

      if (updates.intensity !== undefined) {
        payload.intensity = updates.intensity;
      }

      if (updates.intensityEnabled !== undefined) {
        payload.intensityEnabled = updates.intensityEnabled;
        payload.intensity_enabled = updates.intensityEnabled;

        if (!updates.intensityEnabled) {
          payload.intensity = null;
        }
      }

      return payload;
    },
    [categories]
  );

  const getCurrentUserId = useCallback(async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.user?.id) {
      throw new Error('User not authenticated');
    }

    return session.user.id;
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const { data: allCategories, error: catError } = await supabase
        .from('activity_categories')
        .select('*');

      if (catError) {
        console.error('[fetchCategories] failed:', catError);
        setCategories([]);
        return;
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[fetchCategories] session lookup failed:', sessionError);
        setCategories(allCategories || []);
        return;
      }

      const userId = session?.user?.id;
      if (!userId) {
        setCategories(allCategories || []);
        return;
      }

      const { data: hiddenRows, error: hiddenError } = await supabase
        .from('hidden_activity_categories')
        .select('category_id')
        .eq('user_id', userId);

      if (hiddenError) {
        console.error('[fetchCategories] Failed to filter hidden categories:', hiddenError);
        setCategories(allCategories || []);
        return;
      }

      const hiddenIds = new Set((hiddenRows || []).map((r: any) => r.category_id));
      const filtered = (allCategories || []).filter((c: any) => !hiddenIds.has(c.id));
      setCategories(filtered);
    } catch (e) {
      console.error('[fetchCategories] failed:', e);
      setCategories([]);
    }
  }, []);

  // ✅ Dedicated categories refresher (UI can call this after create/edit category)
  const refreshCategories = useCallback(async () => {
    try {
      const { data: allCategories, error: catError } = await supabase
        .from('activity_categories')
        .select('*');

      if (catError) throw catError;

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[refreshCategories] session lookup failed:', sessionError);
        setCategories(allCategories || []);
        return;
      }

      const userId = session?.user?.id;
      if (!userId) {
        setCategories(allCategories || []);
        return;
      }

      const { data: hiddenRows, error: hiddenError } = await supabase
        .from('hidden_activity_categories')
        .select('category_id')
        .eq('user_id', userId);

      if (hiddenError) {
        console.error('[refreshCategories] Failed to filter hidden categories:', hiddenError);
        setCategories(allCategories || []);
        return;
      }

      const hiddenIds = new Set((hiddenRows || []).map((r: any) => r.category_id));
      const filtered = (allCategories || []).filter((c: any) => !hiddenIds.has(c.id));
      setCategories(filtered);
    } catch (e) {
      console.error('[refreshCategories] failed:', e);
    }
  }, []);

  const fetchActivities = useCallback(async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('activity_date', { ascending: true })
      .order('activity_time', { ascending: true });

    if (error) throw error;
    setActivities(data || []);
  }, []);

  /**
   * IMPORTANT:
   * task_templates ARE templates by definition.
   * There is NO is_template column in the database.
   * Do NOT filter on is_template anywhere.
   */
  const fetchTasks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('task_templates')
        .select(
          `
          id,
          title,
          description,
          reminder_minutes,
          video_url,
          source_folder,
          after_training_enabled,
          after_training_delay_minutes,
          after_training_feedback_enable_score,
          after_training_feedback_score_explanation,
          after_training_feedback_enable_intensity,
          after_training_feedback_enable_note,
          task_template_categories (
            category_id
          )
        `
        )
        .order('created_at', { ascending: true });

      if (error) throw error;

      const transformed: Task[] = (data || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        description: t.description || '',
        completed: false,
        isTemplate: true,
        categoryIds: t.task_template_categories?.map((c: any) => c.category_id) ?? [],
        reminder: t.reminder_minutes ?? undefined,
        subtasks: [],
        videoUrl: t.video_url ?? undefined,
        source_folder: t.source_folder ?? undefined,
        afterTrainingEnabled: !!t.after_training_enabled,
        afterTrainingDelayMinutes: t.after_training_delay_minutes ?? null,
        afterTrainingFeedbackEnableScore: t.after_training_feedback_enable_score ?? true,
        afterTrainingFeedbackScoreExplanation: t.after_training_feedback_score_explanation ?? null,
        afterTrainingFeedbackEnableIntensity: t.after_training_feedback_enable_intensity ?? false,
        afterTrainingFeedbackEnableNote: t.after_training_feedback_enable_note ?? true,
      }));

      // Filter out hidden tasks
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('[fetchTasks] session lookup failed for hidden filter:', sessionError);
          setTasks(transformed);
          return;
        }

        const userId = session?.user?.id;
        if (!userId) {
          console.log('[fetchTasks] no active session - skipping hidden filter');
          setTasks(transformed);
          return;
        }

        const hiddenIds = await taskService.getHiddenTaskTemplateIds(userId);
        const filteredTasks = transformed.filter(t => !hiddenIds.includes(t.id));
        setTasks(filteredTasks);
      } catch (hiddenError) {
        // Fail-soft: log error and show all tasks if hidden table fails
        console.error('[fetchTasks] Failed to filter hidden tasks:', hiddenError);
        setTasks(transformed);
      }
    } catch (error) {
      // CRITICAL GUARD:
      // Never let tasks page go empty due to schema mismatch
      console.error('[fetchTasks] failed – returning empty list safely', error);
      setTasks([]);
    }
  }, []);

  const fetchTrophies = useCallback(async () => {
    const { data, error } = await supabase
      .from('trophies')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    setTrophies(data || []);
  }, []);

  const fetchExternalCalendars = useCallback(async () => {
    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[fetchExternalCalendars] session lookup failed:', sessionError);
        setExternalCalendars([]);
        return;
      }

      const userId = session?.user?.id;
      if (!userId) {
        console.log('[fetchExternalCalendars] no active session - returning empty list');
        setExternalCalendars([]);
        return;
      }

      const { data, error } = await supabase
        .from('external_calendars')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[fetchExternalCalendars] query failed:', error);
        setExternalCalendars([]);
        return;
      }

      setExternalCalendars(data || []);
    } catch (error) {
      console.error('[fetchExternalCalendars] unexpected failure:', error);
      setExternalCalendars([]);
    }
  }, []);

  const fetchActivitySeries = useCallback(async () => {
    const { data, error } = await supabase
      .from('activity_series')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    setActivitySeries(data || []);
  }, []);

  const weekRange = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const end = endOfWeek(new Date(), { weekStartsOn: 1 });
    return { start, end };
  }, []);

  const activitiesThisWeek = useMemo(() => {
    return activities.filter(a => {
      const dt = `${(a as any).activity_date}T${(a as any).activity_time || '00:00:00'}`;
      const d = new Date(dt);
      return d >= weekRange.start && d <= weekRange.end;
    });
  }, [activities, weekRange]);

  const fetchCurrentWeekStats = useCallback(async () => {
    try {
      const startIso = weekRange.start.toISOString().slice(0, 10);
      const endIso = weekRange.end.toISOString().slice(0, 10);
      const todayIso = new Date().toISOString().slice(0, 10);

      const { data, error } = await supabase
        .from('activity_tasks')
        .select('id, completed, activities!inner(activity_date)')
        .gte('activities.activity_date', startIso)
        .lte('activities.activity_date', endIso);

      if (error) throw error;

      const weeklyTasks = data || [];
      const totalWeek = weeklyTasks.length;
      const completedWeek = weeklyTasks.filter(task => task.completed).length;

      const tasksUpToToday = weeklyTasks.filter(task => {
        const activityDate = (task as any)?.activities?.activity_date as string | undefined;
        return activityDate ? activityDate <= todayIso : false;
      });

      const totalToday = tasksUpToToday.length;
      const completedToday = tasksUpToToday.filter(task => task.completed).length;
      const percentage = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;

      setCurrentWeekStats(prev => ({
        ...prev,
        percentage,
        completedTasks: completedToday,
        totalTasks: totalToday,
        completedTasksForWeek: completedWeek,
        totalTasksForWeek: totalWeek,
      }));
    } catch (error) {
      console.error('[fetchCurrentWeekStats] failed:', error);
      setCurrentWeekStats(prev => ({
        ...prev,
        percentage: 0,
        completedTasks: 0,
        totalTasks: 0,
        completedTasksForWeek: 0,
        totalTasksForWeek: 0,
      }));
    }
  }, [weekRange]);

  useEffect(() => {
    setCurrentWeekStats(prev => ({
      ...prev,
      weekActivities: activitiesThisWeek as Activity[],
    }));
  }, [activitiesThisWeek]);

  const fetchAllData = useCallback(async () => {
    try {
      const operations = [
        { name: 'categories', promise: fetchCategories() },
        { name: 'activities', promise: fetchActivities() },
        { name: 'tasks', promise: fetchTasks() },
        { name: 'trophies', promise: fetchTrophies() },
        { name: 'calendars', promise: fetchExternalCalendars() },
        { name: 'activitySeries', promise: fetchActivitySeries() },
        { name: 'currentWeekStats', promise: fetchCurrentWeekStats() },
      ];

      const results = await Promise.allSettled(operations.map(op => op.promise));
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          console.error(`[fetchAllData] ${operations[index].name} failed:`, result.reason);
        }
      });
    } finally {
      setLoading(false);
    }
  }, [
    fetchCategories,
    fetchActivities,
    fetchTasks,
    fetchTrophies,
    fetchExternalCalendars,
    fetchActivitySeries,
    fetchCurrentWeekStats,
  ]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    const unsubscribe = subscribeToTaskCompletion(({ activityId, taskId, completed }) => {
      const activityIdStr = String(activityId);
      const taskIdStr = String(taskId);

      setActivities(prevActivities => {
        let mutated = false;

        const nextActivities = prevActivities.map(activity => {
          if (String((activity as any).id) !== activityIdStr) {
            return activity;
          }

          const tasks = Array.isArray(activity.tasks) ? activity.tasks : [];
          let taskMutated = false;

          const nextTasks = tasks.map(task => {
            if (String(task.id) !== taskIdStr) {
              return task;
            }

            taskMutated = true;
            return { ...task, completed };
          });

          if (!taskMutated) {
            return activity;
          }

          mutated = true;
          return { ...activity, tasks: nextTasks };
        });

        return mutated ? nextActivities : prevActivities;
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        refreshNotificationQueue();
      }
    });

    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      checkNotificationPermissions();
    }
  }, []);

  const todayActivities = useMemo(() => {
    const todayIso = new Date().toISOString().slice(0, 10);
    return activities.filter(a => (a as any).activity_date === todayIso) as Activity[];
  }, [activities]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await fetchAllData();
    await forceRefreshNotificationQueue();
  }, [fetchAllData]);

  const addTask = useCallback(
    async (task: Omit<Task, 'id'>) => {
      try {
        console.log('[addTask] Creating task with data:', task);

        // Determine admin scope
        let playerId: string | null = null;
        let teamId: string | null = null;

        if (adminMode !== 'self' && adminTargetId) {
          if (adminTargetType === 'player') {
            playerId = adminTargetId;
          } else if (adminTargetType === 'team') {
            teamId = adminTargetId;
          }
        }

        const created = await taskService.createTask({
          title: task.title,
          description: task.description || '',
          categoryIds: task.categoryIds || [],
          reminder: task.reminder,
          videoUrl: task.videoUrl,
          afterTrainingEnabled: !!task.afterTrainingEnabled,
          afterTrainingDelayMinutes: task.afterTrainingEnabled ? (task.afterTrainingDelayMinutes ?? 0) : null,
          afterTrainingFeedbackEnableScore: task.afterTrainingFeedbackEnableScore ?? true,
          afterTrainingFeedbackScoreExplanation: task.afterTrainingFeedbackScoreExplanation ?? null,
          afterTrainingFeedbackEnableIntensity: task.afterTrainingFeedbackEnableIntensity ?? false,
          afterTrainingFeedbackEnableNote: task.afterTrainingFeedbackEnableNote ?? true,
          playerId,
          teamId,
        });

        if (!created?.id) {
          throw new Error('Failed to create task: no id returned');
        }

        // Optimistic update: Add to state immediately
        setTasks(prevRaw => {
          const prev = (prevRaw || []).filter(Boolean) as Task[];
          if (prev.some(t => t?.id === created.id)) return prev;
          return [created, ...prev];
        });

        console.log('[addTask] Task created successfully, refreshing tasks...');

        // Refresh tasks after creation to ensure consistency
        await fetchTasks();
        return created;
      } catch (error) {
        console.error('[addTask] Error adding task:', error);
        throw error;
      }
    },
    [adminMode, adminTargetId, adminTargetType, fetchTasks]
  );

  // --- ACTIVITY CRUD ---

  // Add activity (optimistic, local state only)
  const addActivity = useCallback((activity: Omit<Activity, 'id'>) => {
    setActivities(prev => {
      // Generate a fake id for optimistic update
      const fakeId = `tmp-${Date.now()}`;
      const newActivity = { ...activity, id: fakeId };
      return [newActivity, ...prev];
    });
  }, []);

  // Create activity (async, inserts in DB, then refreshes)
  const createActivity = useCallback(async (activityData: {
    title: string;
    location: string;
    categoryId: string;
    date: Date;
    time: string;
    endTime?: string;
    intensity?: number | null;
    intensityEnabled?: boolean;
    isRecurring: boolean;
    recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
    recurrenceDays?: number[];
    endDate?: Date;
  }) => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error || !session?.user?.id) {
        throw new Error('User not authenticated');
      }

      const user = session.user;

      let playerId: string | null = null;
      let teamId: string | null = null;

      if (adminMode !== 'self' && adminTargetId) {
        if (adminTargetType === 'player') {
          playerId = adminTargetId;
        } else if (adminTargetType === 'team') {
          teamId = adminTargetId;
        }
      }

      await activityService.createActivity({
        title: activityData.title,
        location: activityData.location,
        categoryId: activityData.categoryId,
        date: activityData.date,
        time: activityData.time,
        endTime: activityData.endTime,
        intensity: activityData.intensity ?? null,
        intensityEnabled: activityData.intensityEnabled,
        isRecurring: activityData.isRecurring,
        recurrenceType: activityData.recurrenceType,
        recurrenceDays: activityData.recurrenceDays,
        endDate: activityData.endDate,
        userId: user.id,
        playerId,
        teamId,
      });

      await Promise.all([fetchActivities(), fetchActivitySeries()]);
      await forceRefreshNotificationQueue();
      emitActivitiesRefreshRequested({ reason: 'activity_created' });
    } catch (error) {
      console.error('[createActivity] Error:', error);
      throw error;
    }
  }, [adminMode, adminTargetId, adminTargetType, fetchActivities, fetchActivitySeries]);

  const deleteActivitySingle = useCallback(async (activityId: string) => {
    const userId = await getCurrentUserId();

    try {
      await activityService.deleteActivitySingle(activityId, userId);
      await fetchActivities();
      await forceRefreshNotificationQueue();
    } catch (error) {
      console.error('[deleteActivitySingle] failed:', error);
      throw error;
    }
  }, [getCurrentUserId, fetchActivities]);

  const deleteActivitySeries = useCallback(async (seriesId: string) => {
    const userId = await getCurrentUserId();

    try {
      await activityService.deleteActivitySeries(seriesId, userId);
      await Promise.all([fetchActivities(), fetchActivitySeries()]);
      await forceRefreshNotificationQueue();
    } catch (error) {
      console.error('[deleteActivitySeries] failed:', error);
      throw error;
    }
  }, [getCurrentUserId, fetchActivities, fetchActivitySeries]);

  const updateTask = useCallback(async (id: string, updates: Partial<Task>) => {
    try {
      console.log('[updateTask] Updating task:', id, updates);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user?.id) {
        throw new Error('No authenticated user');
      }

      await taskService.updateTask(id, session.user.id, {
        title: updates.title,
        description: updates.description,
        categoryIds: updates.categoryIds,
        reminder: updates.reminder,
        videoUrl: updates.videoUrl,
        afterTrainingEnabled: updates.afterTrainingEnabled,
        afterTrainingDelayMinutes: updates.afterTrainingEnabled ? (updates.afterTrainingDelayMinutes ?? 0) : null,
        afterTrainingFeedbackEnableScore: updates.afterTrainingFeedbackEnableScore,
        afterTrainingFeedbackScoreExplanation: updates.afterTrainingFeedbackScoreExplanation,
        afterTrainingFeedbackEnableIntensity: updates.afterTrainingFeedbackEnableIntensity,
        afterTrainingFeedbackEnableNote: updates.afterTrainingFeedbackEnableNote,
      });

      console.log('[updateTask] Task updated successfully, refreshing tasks...');
      await fetchTasks();
    } catch (error) {
      console.error('[updateTask] Error updating task:', error);
      throw error;
    }
  }, [fetchTasks]);

  const deleteTask = useCallback(async (id: string) => {
    try {
      console.log('[deleteTask] Deleting task:', id);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user?.id) {
        throw new Error('No authenticated user');
      }

      await taskService.deleteTask(id, session.user.id);

      console.log('[deleteTask] Task deleted successfully, refreshing tasks...');
      await fetchTasks();
    } catch (error) {
      console.error('[deleteTask] Error deleting task:', error);
      throw error;
    }
  }, [fetchTasks]);

  const duplicateTask = useCallback(
    async (id: string) => {
      try {
        console.log('[duplicateTask] Duplicating task:', id);

        const safeTasks = (tasks || []).filter(Boolean) as Task[];
        const taskToDuplicate = safeTasks.find(task => task.id === id);

        if (!taskToDuplicate) {
          throw new Error('Task not found');
        }

        const copyPayload = {
          title: `${taskToDuplicate.title} (kopi)`,
          description: taskToDuplicate.description,
          categoryIds: taskToDuplicate.categoryIds,
          reminder: taskToDuplicate.reminder,
          videoUrl: taskToDuplicate.videoUrl,
          afterTrainingEnabled: !!taskToDuplicate.afterTrainingEnabled,
          afterTrainingDelayMinutes: taskToDuplicate.afterTrainingEnabled ? (taskToDuplicate.afterTrainingDelayMinutes ?? 0) : null,
          afterTrainingFeedbackEnableScore: taskToDuplicate.afterTrainingFeedbackEnableScore ?? true,
          afterTrainingFeedbackScoreExplanation: taskToDuplicate.afterTrainingFeedbackScoreExplanation ?? null,
          afterTrainingFeedbackEnableIntensity: taskToDuplicate.afterTrainingFeedbackEnableIntensity ?? false,
          afterTrainingFeedbackEnableNote: taskToDuplicate.afterTrainingFeedbackEnableNote ?? true,
        } as any;

        const created = await addTask(copyPayload);

        const { data: subtasks, error: subtaskError } = await supabase
          .from('task_template_subtasks')
          .select('title, sort_order')
          .eq('task_template_id', id)
          .order('sort_order', { ascending: true });

        if (subtaskError) {
          throw subtaskError;
        }

        if (subtasks?.length) {
          const newSubtasks = subtasks.map(subtask => ({
            task_template_id: created.id,
            title: subtask.title,
            sort_order: subtask.sort_order,
          }));

          const { error: insertError } = await supabase
            .from('task_template_subtasks')
            .insert(newSubtasks);

          if (insertError) {
            throw insertError;
          }
        }

        return created;
      } catch (error) {
        console.error('[duplicateTask] Error duplicating task:', error);
        throw error;
      }
    },
    [tasks, addTask]
  );

  const refreshData = useCallback(async () => {
    console.log('[refreshData] Refreshing core datasets...');
    await Promise.all([
      fetchCategories(),
      fetchActivities(),
      fetchTasks(),
      fetchTrophies(),
      fetchExternalCalendars(),
      fetchActivitySeries(),
      fetchCurrentWeekStats(),
    ]);
  }, [
    fetchCategories,
    fetchActivities,
    fetchTasks,
    fetchTrophies,
    fetchExternalCalendars,
    fetchActivitySeries,
    fetchCurrentWeekStats,
  ]);

  const toggleTaskCompletion = useCallback(
    async (activityId: string, taskId: string, nextState?: boolean) => {
      const logPrefix = `[toggleTaskCompletion] activity=${activityId} task=${taskId}`;
      console.log(`${logPrefix} - start`);

      const previousState = findTaskCompletionState(activityId, taskId);
      const targetState =
        typeof nextState === 'boolean'
          ? nextState
          : previousState === null
            ? true
            : !previousState;

      emitTaskCompletionEvent({ activityId, taskId, completed: targetState });

      try {
        if (typeof nextState === 'boolean') {
          const event = await taskService.setTaskCompletion(taskId, targetState);
          if (event.activityId !== activityId) {
            console.warn(`${logPrefix} - activity mismatch (expected ${activityId}, got ${event.activityId})`);
          }
        } else {
          const event = await taskService.toggleTaskCompletion(taskId);
          if (event.activityId !== activityId) {
            console.warn(`${logPrefix} - activity mismatch (expected ${activityId}, got ${event.activityId})`);
          }
        }

        refreshNotificationQueue(true).catch(queueError => {
          console.error('[toggleTaskCompletion] Notification refresh failed:', queueError);
        });

        console.log(`${logPrefix} - done`);
      } catch (error) {
        console.error(`${logPrefix} - failed`, error);
        if (typeof previousState === 'boolean') {
          emitTaskCompletionEvent({ activityId, taskId, completed: previousState });
        } else {
          Promise.resolve(refreshData()).catch(() => {});
        }
        throw error;
      }
    },
    [findTaskCompletionState, refreshData]
  );

  const setTaskCompletion = useCallback(
    (activityId: string, taskId: string, completed: boolean) =>
      toggleTaskCompletion(activityId, taskId, completed),
    [toggleTaskCompletion]
  );

  const deleteActivityTask = useCallback(
    async (activityId: string, taskId: string) => {
      const logPrefix = `[deleteActivityTask] activity=${activityId} task=${taskId}`;
      console.log(`${logPrefix} - start`);

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.user?.id) {
        throw new Error('User not authenticated');
      }

      try {
        let removedCount = 0;

        const { error: internalError, count: internalCount } = await supabase
          .from('activity_tasks')
          .delete({ count: 'exact' })
          .eq('id', taskId)
          .eq('activity_id', activityId);

        if (internalError) {
          throw internalError;
        }

        removedCount += internalCount ?? 0;

        if (removedCount === 0) {
          const { error: externalError, count: externalCount } = await supabase
            .from('external_event_tasks')
            .delete({ count: 'exact' })
            .eq('id', taskId)
            .eq('local_meta_id', activityId);

          if (externalError) {
            throw externalError;
          }

          removedCount += externalCount ?? 0;
        }

        if (removedCount === 0) {
          throw new Error('Task not found or already deleted');
        }

        await forceRefreshNotificationQueue();

        console.log(`${logPrefix} - removed ${removedCount}`);
      } catch (error) {
        console.error(`${logPrefix} - failed`, error);
        throw error;
      }
    },
    []
  );

  const updateActivity = useCallback((id: string, updates: Partial<Activity>) => {
    setActivities(prev => prev.map(activity => (activity.id === id ? { ...activity, ...updates } : activity)));
  }, []);

  const resolveIsExternal = useCallback(async (activityId: string) => {
    const { data: internalActivity, error: internalError } = await supabase
      .from('activities')
      .select('id')
      .eq('id', activityId)
      .maybeSingle();

    if (internalError) {
      throw internalError;
    }

    if (internalActivity) {
      return false;
    }

    const { data: externalMeta, error: externalError } = await supabase
      .from('events_local_meta')
      .select('id')
      .eq('id', activityId)
      .maybeSingle();

    if (externalError) {
      throw externalError;
    }

    if (!externalMeta) {
      throw new Error('Activity not found');
    }

    return true;
  }, []);

  const updateActivitySingle = useCallback(async (
    activityId: string,
    updates: {
      title?: string;
      location?: string;
      categoryId?: string;
      date?: Date;
      time?: string;
      endTime?: string;
      intensity?: number | null;
      intensityEnabled?: boolean;
    }
  ) => {
    const optimisticUpdates = buildOptimisticActivityUpdates(updates);
    let rollback: (() => void) | undefined;

    try {
      const isExternal = await resolveIsExternal(activityId);
      rollback = applyActivityPatch(activityId, optimisticUpdates);
      await activityService.updateActivitySingle(activityId, updates, isExternal);
      await fetchActivities();

      emitActivitiesRefreshRequested({ reason: 'activity_single_updated' });

      if (updates.date || updates.time || updates.endTime) {
        await forceRefreshNotificationQueue();
      }
    } catch (error) {
      console.error('[updateActivitySingle] failed:', error);
      if (rollback) {
        rollback();
      } else {
        Promise.resolve(refreshData()).catch(() => {});
      }
      throw error;
    }
  }, [applyActivityPatch, buildOptimisticActivityUpdates, fetchActivities, refreshData, resolveIsExternal]);

  const updateActivitySeries = useCallback(async (
    seriesId: string,
    updates: {
      title?: string;
      location?: string;
      categoryId?: string;
      time?: string;
      endTime?: string;
      intensity?: number | null;
      intensityEnabled?: boolean;
    }
  ) => {
    const optimisticUpdates = buildOptimisticActivityUpdates(updates);
    const targetActivityIds = activities
      .filter(activity => {
        const seriesRef = (activity as any)?.series_id ?? (activity as any)?.seriesId;
        return seriesRef && String(seriesRef) === String(seriesId);
      })
      .map(activity => String((activity as any).id))
      .filter(Boolean);

    const rollbacks: (() => void)[] = [];

    try {
      if (targetActivityIds.length && Object.keys(optimisticUpdates).length) {
        targetActivityIds.forEach(activityId => {
          const rollback = applyActivityPatch(activityId, optimisticUpdates);
          if (rollback) {
            rollbacks.push(rollback);
          }
        });
      }

      const userId = await getCurrentUserId();
      await activityService.updateActivitySeries(seriesId, userId, updates);
      await Promise.all([fetchActivities(), fetchActivitySeries()]);

      emitActivitiesRefreshRequested({ reason: 'activity_series_updated' });

      if (updates.time || updates.endTime) {
        await forceRefreshNotificationQueue();
      }
    } catch (error) {
      rollbacks
        .splice(0)
        .reverse()
        .forEach(rollback => {
          try {
            rollback();
          } catch (rollbackError) {
            console.error('[updateActivitySeries] rollback failed:', rollbackError);
          }
        });

      console.error('[updateActivitySeries] failed:', error);
      throw error;
    }
  }, [
    activities,
    applyActivityPatch,
    buildOptimisticActivityUpdates,
    getCurrentUserId,
    fetchActivities,
    fetchActivitySeries,
    forceRefreshNotificationQueue,
  ]);

  const deleteActivity = useCallback((id: string) => {
    setActivities(prev => prev.filter(activity => activity.id !== id));
  }, []);

  const duplicateActivity = useCallback(async (activityId: string) => {
    try {
      const userId = await getCurrentUserId();
      let playerId: string | null = null;
      let teamId: string | null = null;

      if (adminMode !== 'self' && adminTargetId) {
        if (adminTargetType === 'player') {
          playerId = adminTargetId;
        } else if (adminTargetType === 'team') {
          teamId = adminTargetId;
        }
      }

      await activityService.duplicateActivity(activityId, userId, playerId, teamId);
      await fetchActivities();
    } catch (error) {
      console.error('[duplicateActivity] failed:', error);
      throw error;
    }
  }, [getCurrentUserId, adminMode, adminTargetId, adminTargetType, fetchActivities]);

  const addExternalCalendar = useCallback(async (calendar: Omit<ExternalCalendar, 'id'>) => {
    try {
      const userId = await getCurrentUserId();
      await calendarService.addExternalCalendar(userId, calendar.name, calendar.icsUrl, calendar.enabled ?? true);
      await fetchExternalCalendars();
    } catch (error) {
      console.error('[addExternalCalendar] failed:', error);
      throw error;
    }
  }, [getCurrentUserId, fetchExternalCalendars]);

  const toggleCalendar = useCallback(async (calendarId: string) => {
    try {
      const userId = await getCurrentUserId();
      const target = externalCalendars.find(calendar => calendar.id === calendarId);
      if (!target) {
        throw new Error('Calendar not found');
      }
      await calendarService.toggleCalendar(calendarId, userId, !target.enabled);
      await fetchExternalCalendars();
    } catch (error) {
      console.error('[toggleCalendar] failed:', error);
      throw error;
    }
  }, [externalCalendars, getCurrentUserId, fetchExternalCalendars]);

  const deleteExternalCalendar = useCallback(async (calendarId: string) => {
    try {
      const userId = await getCurrentUserId();
      await calendarService.deleteExternalCalendar(calendarId, userId);
      await fetchExternalCalendars();
    } catch (error) {
      console.error('[deleteExternalCalendar] failed:', error);
      throw error;
    }
  }, [getCurrentUserId, fetchExternalCalendars]);

  const fetchExternalCalendarEvents = useCallback(async (calendar: ExternalCalendar) => {
    try {
      await calendarService.syncCalendar(calendar.id);
      await fetchActivities();
    } catch (error) {
      // Silent per iOS requirement – swallow errors
    }
  }, [fetchActivities]);

  const importExternalActivity = useCallback(async () => {
    return;
  }, []);

  const importMultipleActivities = useCallback(async (
    activityIds: string[],
    _categoryId: string,
    onProgress?: (current: number, total: number) => void
  ) => {
    const total = activityIds.length;
    if (onProgress) {
      onProgress(0, total);
    }
    return { successCount: 0, failCount: 0 };
  }, []);

  return {
    activities,
    categories,
    tasks,
    trophies,
    externalCalendars,
    externalActivities,
    activitySeries,
    activitiesThisWeek,
    currentWeekStats,
    todayActivities,
    isLoading: loading,
    refreshAll,
    refreshCategories, // ✅ P14 export
    addTask,
    updateTask,
    deleteTask,
    duplicateTask,
    toggleTaskCompletion,
    setTaskCompletion,
    deleteActivityTask,
    refreshData,
    // --- ADDED: ACTIVITY CRUD ---
    addActivity,
    updateActivity,
    updateActivitySingle,
    updateActivitySeries,
    deleteActivity,
    createActivity,
    deleteActivitySingle,
    deleteActivitySeries,
    duplicateActivity,
    addExternalCalendar,
    toggleCalendar,
    deleteExternalCalendar,
    importExternalActivity,
    importMultipleActivities,
    fetchExternalCalendarEvents,
  };
};
