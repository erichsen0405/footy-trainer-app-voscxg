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
import { fetchAndParseICalendar, formatTimeFromDate } from '@/utils/icalParser';
import { supabase } from '@/app/integrations/supabase/client';
import { checkNotificationPermissions } from '@/utils/notificationService';
import {
  refreshNotificationQueue,
  forceRefreshNotificationQueue,
} from '@/utils/notificationScheduler';
import { startOfWeek, endOfWeek } from 'date-fns';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { taskService } from '@/services/taskService';
import { useAdmin } from '@/contexts/AdminContext';

export const useFootballData = () => {
  const { teamPlayerId } = useTeamPlayer();
  const { adminMode, adminTargetId, adminTargetType } = useAdmin();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [activitySeries, setActivitySeries] = useState<ActivitySeries[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    const { data, error } = await supabase.from('activity_categories').select('*');
    if (error) throw error;
    setCategories(data || []);
  };

  const fetchActivities = async () => {
    const { data, error } = await supabase
      .from('activities')
      .select('*')
      .order('activity_date', { ascending: true })
      .order('activity_time', { ascending: true });

    if (error) throw error;
    setActivities(data || []);
  };

  /**
   * IMPORTANT:
   * task_templates ARE templates by definition.
   * There is NO is_template column in the database.
   * Do NOT filter on is_template anywhere.
   */
  const fetchTasks = async () => {
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
  };

  const fetchTrophies = async () => {
    const { data, error } = await supabase
      .from('trophies')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    setTrophies(data || []);
  };

  const fetchExternalCalendars = async () => {
    const { data, error } = await supabase
      .from('external_calendars')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    setExternalCalendars(data || []);
  };

  const fetchActivitySeries = async () => {
    const { data, error } = await supabase
      .from('activity_series')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    setActivitySeries(data || []);
  };

  const fetchAllData = async () => {
    try {
      await Promise.all([
        fetchCategories(),
        fetchActivities(),
        fetchTasks(),
        fetchTrophies(),
        fetchExternalCalendars(),
        fetchActivitySeries(),
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
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

  const weekRange = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const end = endOfWeek(new Date(), { weekStartsOn: 1 });
    return { start, end };
  }, []);

  const activitiesThisWeek = useMemo(() => {
    return activities.filter(a => {
      const dt = `${a.activity_date}T${a.activity_time || '00:00:00'}`;
      const d = new Date(dt);
      return d >= weekRange.start && d <= weekRange.end;
    });
  }, [activities, weekRange]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    await fetchAllData();
    await forceRefreshNotificationQueue();
  }, []);

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

  const refreshData = useCallback(async () => {
    console.log('[refreshData] Refreshing tasks data...');
    await fetchTasks();
  }, []);

  return {
    activities,
    categories,
    tasks,
    trophies,
    externalCalendars,
    activitySeries,
    activitiesThisWeek,
    isLoading: loading,
    refreshAll,
    addTask,
    updateTask,
    deleteTask,
    duplicateTask,
    refreshData,
  };
};
