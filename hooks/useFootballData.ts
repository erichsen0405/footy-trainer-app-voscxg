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
import { subscribeToTaskCompletion } from '@/utils/taskEvents';

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

  const getCurrentUserId = useCallback(async () => {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      throw new Error('User not authenticated');
    }

    return user.id;
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { data: allCategories, error: catError } = await supabase
        .from('activity_categories')
        .select('*');

      if (catError) {
        console.error('[fetchCategories] failed:', catError);
        setCategories([]);
        return;
      }

      // If not authenticated, show all categories (no hard throw)
      if (!user?.id) {
        setCategories(allCategories || []);
        return;
      }

      const { data: hiddenRows, error: hiddenError } = await supabase
        .from('hidden_activity_categories')
        .select('category_id')
        .eq('user_id', user.id);

      if (hiddenError) {
        // Fail-soft: show all categories if hidden table fails
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
      const { data: { user } } = await supabase.auth.getUser();

      const { data: allCategories, error: catError } = await supabase
        .from('activity_categories')
        .select('*');

      if (catError) throw catError;

      // If not authenticated, show all categories (no hard throw)
      if (!user?.id) {
        setCategories(allCategories || []);
        return;
      }

      const { data: hiddenRows, error: hiddenError } = await supabase
        .from('hidden_activity_categories')
        .select('category_id')
        .eq('user_id', user.id);

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
      // fail-soft: keep existing categories
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
      }));

      // Filter out hidden tasks
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error('No authenticated user');
        }
        const hiddenIds = await taskService.getHiddenTaskTemplateIds(user.id);
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
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      console.error('[fetchExternalCalendars] auth error:', authError);
      setExternalCalendars([]);
      return;
    }

    const query = supabase
      .from('external_calendars')
      .select('*')
      .order('created_at', { ascending: true });

    if (user?.id) {
      query.eq('user_id', user.id);
    }

    const { data, error } = await query;

    if (error) throw error;
    setExternalCalendars(data || []);
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
      await Promise.all([
        fetchCategories(),
        fetchActivities(),
        fetchTasks(),
        fetchTrophies(),
        fetchExternalCalendars(),
        fetchActivitySeries(),
        fetchCurrentWeekStats(),
      ]);
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
      setActivities(prevActivities => {
        let mutated = false;

        const nextActivities = prevActivities.map(activity => {
          if (activity.id !== activityId) {
            return activity;
          }

          const tasks = Array.isArray(activity.tasks) ? activity.tasks : [];
          let taskMutated = false;

          const nextTasks = tasks.map(task => {
            if (task.id !== taskId) {
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

  // Task CRUD operations
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
    [adminMode, adminTargetId, adminTargetType]
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
    endTime: string;
    isRecurring: boolean;
    recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
    recurrenceDays?: number[];
    endDate?: Date;
  }) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Determine player_id and team_id based on admin context
      let player_id = null;
      let team_id = null;

      if (adminMode !== 'self' && adminTargetId) {
        if (adminTargetType === 'player') {
          player_id = adminTargetId;
        } else if (adminTargetType === 'team') {
          team_id = adminTargetId;
        }
      }

      const payload: Record<string, any> = {
        // base (must stay)
        title: activityData.title,
        location: activityData.location,
        category_id: activityData.categoryId,
        activity_date: activityData.date instanceof Date ? activityData.date.toISOString().slice(0, 10) : activityData.date,
        activity_time: activityData.time,
        activity_end_time: activityData.endTime,
        user_id: user.id,

        // scope (existing behavior)
        player_id,
        team_id,

        // optional recurrence fields (may be missing in schema; can be removed on retry)
        is_recurring: !!activityData.isRecurring,
        recurrence_type: activityData.recurrenceType,
        recurrence_days: activityData.recurrenceDays,
        end_date: activityData.endDate instanceof Date ? activityData.endDate.toISOString().slice(0, 10) : undefined,
      };

      const removableCols = new Set(['is_recurring', 'recurrence_type', 'recurrence_days', 'end_date', 'activity_end_time']);
      let lastError: any = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const { error } = await supabase
          .from('activities')
          .insert(payload);

        if (!error) {
          await fetchActivities();
          return;
        }

        lastError = error;

        const msg = String((error as any)?.message ?? '');
        const code = String((error as any)?.code ?? '');

        if (code === 'PGRST204') {
          const match = msg.match(/Could not find the '([^']+)' column/i);
          const missingCol = match?.[1];

          if (missingCol && removableCols.has(missingCol) && Object.prototype.hasOwnProperty.call(payload, missingCol)) {
            delete payload[missingCol];
            continue;
          }
        }

        console.error('[createActivity] Error inserting activity:', error);
        throw error;
      }

      console.error('[createActivity] exhausted retries:', lastError);
      throw lastError ?? new Error('Failed to create activity');
    } catch (error) {
      console.error('[createActivity] Error:', error);
      throw error;
    }
  }, [adminMode, adminTargetId, adminTargetType]);

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
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('No authenticated user');
      }

      await taskService.updateTask(id, user.id, {
        title: updates.title,
        description: updates.description,
        categoryIds: updates.categoryIds,
        reminder: updates.reminder,
        videoUrl: updates.videoUrl,
        afterTrainingEnabled: updates.afterTrainingEnabled,
      });

      console.log('[updateTask] Task updated successfully, refreshing tasks...');

      // Refresh tasks after update
      await fetchTasks();
    } catch (error) {
      console.error('[updateTask] Error updating task:', error);
      throw error;
    }
  }, []);

  const deleteTask = useCallback(async (id: string) => {
    try {
      console.log('[deleteTask] Deleting task:', id);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error('No authenticated user');
      }

      await taskService.deleteTask(id, user.id);

      console.log('[deleteTask] Task deleted successfully, refreshing tasks...');

      // Refresh tasks after deletion
      await fetchTasks();
    } catch (error) {
      console.error('[deleteTask] Error deleting task:', error);
      throw error;
    }
  }, []);

  const duplicateTask = useCallback(
    async (id: string) => {
      try {
        console.log('[duplicateTask] Duplicating task:', id);

        const safeTasks = (tasks || []).filter(Boolean) as Task[];
        const taskToDuplicate = safeTasks.find(t => t.id === id);

        if (!taskToDuplicate) {
          throw new Error('Task not found');
        }

        // Create a copy payload without id and unwanted fields
        const copyPayload = {
          title: `${taskToDuplicate.title} (kopi)`,
          description: taskToDuplicate.description,
          categoryIds: taskToDuplicate.categoryIds,
          reminder: taskToDuplicate.reminder,
          videoUrl: taskToDuplicate.videoUrl,
        } as any;

        const created = await addTask(copyPayload);

        // Copy subtasks to the new task
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

  const toggleTaskCompletion = useCallback(
    async (activityId: string, taskId: string) => {
      const logPrefix = `[toggleTaskCompletion] activity=${activityId} task=${taskId}`;
      console.log(`${logPrefix} - start`);
      try {
        const event = await taskService.toggleTaskCompletion(taskId);

        if (event.activityId !== activityId) {
          console.warn(`${logPrefix} - activity mismatch (expected ${activityId}, got ${event.activityId})`);
        }

        refreshNotificationQueue(true).catch(queueError => {
          console.error('[toggleTaskCompletion] Notification refresh failed:', queueError);
        });

        console.log(`${logPrefix} - done`);
      } catch (error) {
        console.error(`${logPrefix} - failed`, error);
        throw error;
      }
    },
    []
  );

  const deleteActivityTask = useCallback(
    async (activityId: string, taskId: string) => {
      const logPrefix = `[deleteActivityTask] activity=${activityId} task=${taskId}`;
      console.log(`${logPrefix} - start`);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
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
    }
  ) => {
    try {
      const isExternal = await resolveIsExternal(activityId);
      await activityService.updateActivitySingle(activityId, updates, isExternal);
      await fetchActivities();

      if (updates.date || updates.time || updates.endTime) {
        await forceRefreshNotificationQueue();
      }
    } catch (error) {
      console.error('[updateActivitySingle] failed:', error);
      throw error;
    }
  }, [resolveIsExternal, fetchActivities]);

  const updateActivitySeries = useCallback(async (
    seriesId: string,
    updates: {
      title?: string;
      location?: string;
      categoryId?: string;
      time?: string;
      endTime?: string;
    }
  ) => {
    try {
      const userId = await getCurrentUserId();
      await activityService.updateActivitySeries(seriesId, userId, updates);
      await Promise.all([fetchActivities(), fetchActivitySeries()]);

      if (updates.time || updates.endTime) {
        await forceRefreshNotificationQueue();
      }
    } catch (error) {
      console.error('[updateActivitySeries] failed:', error);
      throw error;
    }
  }, [getCurrentUserId, fetchActivities, fetchActivitySeries]);

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
      const target = externalCalendars.find(cal => cal.id === calendarId);
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
