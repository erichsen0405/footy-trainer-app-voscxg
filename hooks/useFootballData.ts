
/* eslint-disable no-useless-catch */
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, ActivityCategory, Task, Trophy, ExternalCalendar, ActivitySeries } from '@/types';
import { fetchAndParseICalendar, formatTimeFromDate } from '@/utils/icalParser';
import { supabase } from '@/app/integrations/supabase/client';
import {
  checkNotificationPermissions,
} from '@/utils/notificationService';
import { refreshNotificationQueue, forceRefreshNotificationQueue } from '@/utils/notificationScheduler';
import { startOfWeek, endOfWeek } from 'date-fns';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';

export const useFootballData = () => {
  const { teamPlayerId } = useTeamPlayer();

  const [activities, setActivities] = useState<Activity[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [activitySeries, setActivitySeries] = useState<ActivitySeries[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_categories')
        .select('*');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      throw error;
    }
  };

  const fetchActivities = async () => {
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .order('activity_date', { ascending: true })
        .order('activity_time', { ascending: true });

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      throw error;
    }
  };

  const fetchTasks = async () => {
    try {
      // Fetch task templates with their categories
      const { data: templatesData, error: templatesError } = await supabase
        .from('task_templates')
        .select(`
          *,
          task_template_categories (
            category_id
          )
        `)
        .order('created_at', { ascending: true });

      if (templatesError) throw templatesError;

      // Transform the data to match the Task interface
      const transformedTasks: Task[] = (templatesData || []).map(template => ({
        id: template.id,
        title: template.title,
        description: template.description || '',
        completed: false,
        isTemplate: true,
        categoryIds: template.task_template_categories?.map((tc: any) => tc.category_id) || [],
        reminder: template.reminder_minutes,
        subtasks: [],
        videoUrl: template.video_url,
      }));

      setTasks(transformedTasks);
    } catch (error) {
      throw error;
    }
  };

  const fetchTrophies = async () => {
    try {
      const { data, error } = await supabase
        .from('trophies')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setTrophies(data || []);
    } catch (error) {
      throw error;
    }
  };

  const fetchExternalCalendars = async () => {
    try {
      const { data, error } = await supabase
        .from('external_calendars')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setExternalCalendars(data || []);
    } catch (error) {
      throw error;
    }
  };

  const fetchActivitySeries = async () => {
    try {
      const { data, error } = await supabase
        .from('activity_series')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setActivitySeries(data || []);
    } catch (error) {
      throw error;
    }
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
    } catch (error) {
      throw error;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        refreshNotificationQueue();
      }
    });

    return () => {
      subscription.remove();
    };
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
    return activities.filter(activity => {
      const activityDateTime = `${activity.activity_date}T${activity.activity_time || '00:00:00'}`;
      const start = new Date(activityDateTime);
      return start >= weekRange.start && start <= weekRange.end;
    });
  }, [activities, weekRange]);

  const refreshAll = useCallback(async () => {
    try {
      setLoading(true);
      await fetchAllData();
      await forceRefreshNotificationQueue();
    } catch (error) {
      throw error;
    }
  }, []);

  return {
    activities,
    categories,
    tasks,
    trophies,
    externalCalendars,
    activitySeries,
    activitiesThisWeek,
    loading,
    refreshAll,
  };
};
