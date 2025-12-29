
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
import { taskService } from '@/services/taskService';

function getWeekNumber(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function generateRecurringDates(
  startDate: Date,
  endDate: Date | undefined,
  recurrenceType: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly',
  recurrenceDays?: number[]
): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  const end = endDate || new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
  
  const maxIterations = 1000;
  let iterations = 0;

  while (current <= end && iterations < maxIterations) {
    iterations++;

    if (recurrenceType === 'daily') {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    } else if (recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') {
      const weekMultiplier = recurrenceType === 'weekly' ? 1 : recurrenceType === 'biweekly' ? 2 : 3;
      
      if (recurrenceDays && recurrenceDays.length > 0) {
        const startDay = current.getDay();
        const sortedDays = [...recurrenceDays].sort((a, b) => a - b);
        
        for (const day of sortedDays) {
          const daysToAdd = (day - startDay + 7) % 7;
          const targetDate = new Date(current);
          targetDate.setDate(current.getDate() + daysToAdd);
          
          if (targetDate >= startDate && targetDate <= end) {
            dates.push(new Date(targetDate));
          }
        }
        
        current.setDate(current.getDate() + 7 * weekMultiplier);
      } else {
        dates.push(new Date(current));
        current.setDate(current.getDate() + 7 * weekMultiplier);
      }
    } else if (recurrenceType === 'monthly') {
      dates.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }
  }

  return dates;
}

export function useFootballData() {
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'trainer' | 'player' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const { selectedContext } = useTeamPlayer();

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);

      if (user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (roleData) {
          setUserRole(roleData.role as 'admin' | 'trainer' | 'player');
        }
      }
    };
    getCurrentUser();
  }, []);

  useEffect(() => {
    const initializeNotifications = async () => {
      const granted = await checkNotificationPermissions();
      setNotificationsEnabled(granted);
    };
    
    initializeNotifications();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        setRefreshTrigger(prev => prev + 1);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const loadCategories = async () => {
      let query = supabase
        .from('activity_categories')
        .select('*')
        .order('name', { ascending: true });

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          query = query.eq('user_id', selectedContext.id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          query = query.eq('team_id', selectedContext.id);
        } else {
          query = query.eq('user_id', userId);
        }
      }

      const { data, error } = await query;

      if (error) {
        setCategories([]);
        setIsLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const loadedCategories = data.map(cat => ({
          id: cat.id,
          name: cat.name,
          color: cat.color,
          emoji: cat.emoji,
        }));
        setCategories(loadedCategories);
      } else {
        setCategories([]);
      }
    };

    loadCategories();
  }, [userId, userRole, selectedContext, refreshTrigger]);

  useEffect(() => {
    if (!userId) return;

    const loadTasks = async () => {
      let query = supabase
        .from('task_templates')
        .select(`
          *,
          task_template_categories(
            category_id
          )
        `);

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          query = query.eq('user_id', selectedContext.id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          query = query.eq('team_id', selectedContext.id);
        } else {
          query = query.eq('user_id', userId);
        }
      }

      const { data, error } = await query;

      if (error) {
        return;
      }

      if (data) {
        const loadedTasks: Task[] = data.map(template => ({
          id: template.id,
          title: template.title,
          description: template.description || '',
          completed: false,
          isTemplate: true,
          categoryIds: template.task_template_categories?.map((ttc: any) => ttc.category_id) || [],
          reminder: template.reminder_minutes || undefined,
          subtasks: [],
          videoUrl: template.video_url || undefined,
        }));
        setTasks(loadedTasks);
      }
    };

    loadTasks();
  }, [userId, userRole, selectedContext, refreshTrigger]);

  useEffect(() => {
    if (!userId) return;

    const loadExternalCalendars = async () => {
      let targetUserId = userId;
      
      if ((userRole === 'trainer' || userRole === 'admin') && selectedContext.type === 'player' && selectedContext.id) {
        targetUserId = selectedContext.id;
      }

      const { data, error } = await supabase
        .from('external_calendars')
        .select('*')
        .eq('user_id', targetUserId);

      if (error) {
        return;
      }

      if (data) {
        const loadedCalendars: ExternalCalendar[] = data.map(cal => ({
          id: cal.id,
          name: cal.name,
          icsUrl: cal.ics_url,
          enabled: cal.enabled,
          lastFetched: cal.last_fetched ? new Date(cal.last_fetched) : undefined,
          eventCount: cal.event_count || 0,
        }));
        setExternalCalendars(loadedCalendars);
      } else {
        setExternalCalendars([]);
      }
    };

    loadExternalCalendars();
  }, [userId, userRole, selectedContext, refreshTrigger]);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const loadActivities = async () => {
      let internalQuery = supabase
        .from('activities')
        .select(`
          *,
          category:activity_categories(*),
          activity_tasks(
            id,
            title,
            description,
            completed,
            reminder_minutes,
            task_template_id
          )
        `)
        .eq('is_external', false)
        .order('activity_date', { ascending: true });

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          internalQuery = internalQuery.eq('user_id', selectedContext.id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          internalQuery = internalQuery.eq('team_id', selectedContext.id);
        } else {
          internalQuery = internalQuery.eq('user_id', userId);
        }
      } else {
        internalQuery = internalQuery.or(`user_id.eq.${userId},player_id.eq.${userId}`);
      }

      const { data: internalData, error: internalError } = await internalQuery;

      if (internalError) {
        // Error handled silently
      }

      let metaQuery = supabase
        .from('events_local_meta')
        .select('id, external_event_id, category_id, manually_set_category, category_updated_at, user_id, player_id, team_id');

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          metaQuery = metaQuery.eq('user_id', selectedContext.id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          metaQuery = metaQuery.eq('team_id', selectedContext.id);
        } else {
          metaQuery = metaQuery.eq('user_id', userId);
        }
      }

      const { data: metaData, error: metaError } = await metaQuery;

      if (metaError) {
        // Error handled silently
      }

      let externalData: any[] = [];

      if (metaData && metaData.length > 0) {
        const metaByEventId = new Map<string, any[]>();
        
        for (const meta of metaData) {
          const eventId = meta.external_event_id;
          if (!metaByEventId.has(eventId)) {
            metaByEventId.set(eventId, []);
          }
          metaByEventId.get(eventId)!.push(meta);
        }
        
        const deduplicatedMeta: any[] = [];
        
        for (const [eventId, metas] of metaByEventId.entries()) {
          if (metas.length === 1) {
            deduplicatedMeta.push(metas[0]);
          } else {
            let bestMeta = metas[0];
            
            for (const meta of metas) {
              if (meta.player_id === userId) {
                bestMeta = meta;
                break;
              }
              
              if (meta.team_id && !bestMeta.team_id) {
                bestMeta = meta;
              }
              
              if (meta.user_id === userId && !bestMeta.player_id && !bestMeta.team_id) {
                bestMeta = meta;
              }
            }
            
            deduplicatedMeta.push(bestMeta);
          }
        }
        
        const externalEventIds = deduplicatedMeta.map(m => m.external_event_id).filter(Boolean);
        
        if (externalEventIds.length > 0) {
          let calendarIds: string[] = [];
          
          if (userRole === 'trainer' || userRole === 'admin') {
            if (selectedContext.type === 'player' && selectedContext.id) {
              const { data: playerCalendars } = await supabase
                .from('external_calendars')
                .select('id')
                .eq('user_id', selectedContext.id);
              
              calendarIds = playerCalendars?.map(c => c.id) || [];
            } else {
              const { data: trainerCalendars } = await supabase
                .from('external_calendars')
                .select('id')
                .eq('user_id', userId);
              
              calendarIds = trainerCalendars?.map(c => c.id) || [];
            }
          } else {
            const { data: playerCalendars } = await supabase
              .from('external_calendars')
              .select('id')
              .eq('user_id', userId);
            
            calendarIds = playerCalendars?.map(c => c.id) || [];
          }
          
          const { data: eventsData, error: eventsError } = await supabase
            .from('events_external')
            .select(`
              id,
              title,
              description,
              location,
              start_date,
              start_time,
              end_date,
              end_time,
              is_all_day,
              provider_event_uid,
              provider_calendar_id
            `)
            .in('id', externalEventIds)
            .in('provider_calendar_id', calendarIds)
            .eq('deleted', false);

          if (eventsError) {
            // Error handled silently
          } else if (eventsData) {
            externalData = eventsData.map(event => {
              const meta = deduplicatedMeta.find(m => m.external_event_id === event.id);
              return {
                ...event,
                events_local_meta: meta,
              };
            });
          }
        }
      }

      const loadedActivities: Activity[] = [];

      if (internalData) {
        internalData.forEach(act => {
          const category = act.category ? {
            id: act.category.id,
            name: act.category.name,
            color: act.category.color,
            emoji: act.category.emoji,
          } : categories[0];

          const activityDate = new Date(act.activity_date);
          
          const activityTasks: Task[] = (act.activity_tasks || [])
            .filter((at: any) => at && at.id && at.title)
            .map((at: any) => ({
              id: at.id,
              title: at.title,
              description: at.description || '',
              completed: at.completed || false,
              isTemplate: false,
              categoryIds: [],
              reminder: at.reminder_minutes || undefined,
              subtasks: [],
            }));

          loadedActivities.push({
            id: act.id,
            title: act.title,
            date: activityDate,
            time: act.activity_time,
            location: act.location || 'Ingen lokation',
            category,
            tasks: activityTasks,
            isExternal: false,
            seriesId: act.series_id || undefined,
            seriesInstanceDate: act.series_instance_date ? new Date(act.series_instance_date) : undefined,
          });
        });
      }

      if (externalData && externalData.length > 0) {
        const categoryIds = externalData
          .map(e => e.events_local_meta?.category_id)
          .filter(Boolean);
        
        let categoryMap: { [key: string]: ActivityCategory } = {};
        
        if (categoryIds.length > 0) {
          const { data: categoriesData, error: categoriesError } = await supabase
            .from('activity_categories')
            .select('*')
            .in('id', categoryIds);
          
          if (categoriesError) {
            // Error handled silently
          } else if (categoriesData) {
            categoriesData.forEach(cat => {
              categoryMap[cat.id] = {
                id: cat.id,
                name: cat.name,
                color: cat.color,
                emoji: cat.emoji,
              };
            });
          }
        }
        
        const metaIds = externalData
          .map(e => e.events_local_meta?.id)
          .filter(Boolean);
        
        let tasksMap: { [key: string]: Task[] } = {};
        
        if (metaIds.length > 0) {
          const { data: tasksData, error: tasksError } = await supabase
            .from('external_event_tasks')
            .select('*')
            .in('local_meta_id', metaIds);
          
          if (tasksError) {
            // Error handled silently
          } else if (tasksData) {
            tasksData.forEach(task => {
              if (!tasksMap[task.local_meta_id]) {
                tasksMap[task.local_meta_id] = [];
              }
              tasksMap[task.local_meta_id].push({
                id: task.id,
                title: task.title,
                description: task.description || '',
                completed: task.completed || false,
                isTemplate: false,
                categoryIds: [],
                reminder: task.reminder_minutes || undefined,
                subtasks: [],
              });
            });
          }
        }
        
        externalData.forEach((extEvent: any) => {
          const localMeta = extEvent.events_local_meta;

          if (!localMeta) {
            return;
          }

          const category = categoryMap[localMeta.category_id] || categories[0];
          const activityDate = new Date(extEvent.start_date);
          const externalTasks = tasksMap[localMeta.id] || [];

          loadedActivities.push({
            id: localMeta.id,
            title: extEvent.title,
            date: activityDate,
            time: extEvent.start_time,
            location: extEvent.location || 'Ingen lokation',
            category,
            tasks: externalTasks,
            isExternal: true,
            externalCalendarId: extEvent.provider_calendar_id,
            externalEventId: extEvent.provider_event_uid,
          });
        });
      }
      
      setActivities(loadedActivities);

      if (notificationsEnabled) {
        refreshNotificationQueue().catch(err => {
          // Error handled silently
        });
      }

      setIsLoading(false);
    };

    loadActivities();
  }, [userId, userRole, selectedContext, categories, refreshTrigger, notificationsEnabled]);

  useEffect(() => {
    if (!userId) return;

    const loadTrophies = async () => {
      const { data, error } = await supabase
        .from('trophies')
        .select('*')
        .eq('user_id', userId)
        .order('year', { ascending: false })
        .order('week', { ascending: false });

      if (error) {
        return;
      }

      if (data) {
        const loadedTrophies: Trophy[] = data.map(trophy => ({
          week: trophy.week,
          year: trophy.year,
          type: trophy.type as 'gold' | 'silver' | 'bronze',
          percentage: trophy.percentage,
          completedTasks: trophy.completed_tasks,
          totalTasks: trophy.total_tasks,
        }));
        setTrophies(loadedTrophies);
      }
    };

    loadTrophies();
  }, [userId]);

  const getCurrentWeekStats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const weekActivities = activities.filter(activity => {
      const activityDate = new Date(activity.date);
      return activityDate >= weekStart && activityDate <= weekEnd;
    });

    const activitiesUpToToday = weekActivities.filter(activity => {
      const activityDate = new Date(activity.date);
      return activityDate <= today;
    });

    const totalTasksUpToToday = activitiesUpToToday.reduce((sum, activity) => sum + activity.tasks.length, 0);
    const completedTasksUpToToday = activitiesUpToToday.reduce(
      (sum, activity) => sum + activity.tasks.filter(task => task.completed).length,
      0
    );

    const totalTasksForWeek = weekActivities.reduce((sum, activity) => sum + activity.tasks.length, 0);
    const completedTasksForWeek = weekActivities.reduce(
      (sum, activity) => sum + activity.tasks.filter(task => task.completed).length,
      0
    );

    const percentageUpToToday = totalTasksUpToToday > 0 
      ? Math.round((completedTasksUpToToday / totalTasksUpToToday) * 100) 
      : 0;

    return {
      percentage: percentageUpToToday,
      completedTasks: completedTasksUpToToday,
      totalTasks: totalTasksUpToToday,
      completedTasksForWeek,
      totalTasksForWeek,
      weekActivities,
    };
  }, [activities]);

  const getTodayActivities = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return activities.filter(activity => {
      const activityDate = new Date(activity.date);
      activityDate.setHours(0, 0, 0, 0);
      return activityDate >= today && activityDate < tomorrow;
    });
  }, [activities]);

  const externalActivities = useMemo(() => {
    return activities.filter(a => a.isExternal);
  }, [activities]);

  const addActivity = (activity: Omit<Activity, 'id'>) => {
    const newActivity: Activity = {
      ...activity,
      id: `activity-${Date.now()}`,
    };
    setActivities([...activities, newActivity]);
  };

  const createActivity = async (activityData: {
    title: string;
    location: string;
    categoryId: string;
    date: Date;
    time: string;
    isRecurring: boolean;
    recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
    recurrenceDays?: number[];
    endDate?: Date;
  }) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      let player_id = null;
      let team_id = null;

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          player_id = selectedContext.id;
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          team_id = selectedContext.id;
        }
      }

      if (activityData.isRecurring) {
        const { data: seriesData, error: seriesError } = await supabase
          .from('activity_series')
          .insert({
            user_id: userId,
            title: activityData.title,
            location: activityData.location,
            category_id: activityData.categoryId,
            recurrence_type: activityData.recurrenceType!,
            recurrence_days: activityData.recurrenceDays || [],
            start_date: activityData.date.toISOString().split('T')[0],
            end_date: activityData.endDate ? activityData.endDate.toISOString().split('T')[0] : null,
            activity_time: activityData.time,
            player_id,
            team_id,
          })
          .select()
          .single();

        if (seriesError) {
          throw seriesError;
        }

        const dates = generateRecurringDates(
          activityData.date,
          activityData.endDate,
          activityData.recurrenceType!,
          activityData.recurrenceDays
        );

        const activitiesToInsert = dates.map(date => ({
          user_id: userId,
          title: activityData.title,
          activity_date: date.toISOString().split('T')[0],
          activity_time: activityData.time,
          location: activityData.location,
          category_id: activityData.categoryId,
          series_id: seriesData.id,
          series_instance_date: date.toISOString().split('T')[0],
          is_external: false,
          player_id,
          team_id,
        }));

        const { error: activitiesError } = await supabase
          .from('activities')
          .insert(activitiesToInsert);

        if (activitiesError) {
          throw activitiesError;
        }
      } else {
        const { error } = await supabase
          .from('activities')
          .insert({
            user_id: userId,
            title: activityData.title,
            activity_date: activityData.date.toISOString().split('T')[0],
            activity_time: activityData.time,
            location: activityData.location,
            category_id: activityData.categoryId,
            is_external: false,
            player_id,
            team_id,
          });

        if (error) {
          throw error;
        }
      }

      setRefreshTrigger(prev => prev + 1);
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      throw error;
    }
  };

  const updateActivity = (id: string, updates: Partial<Activity>) => {
    setActivities(activities.map(activity => 
      activity.id === id ? { ...activity, ...updates } : activity
    ));
  };

  const updateActivitySingle = async (activityId: string, updates: {
    title?: string;
    location?: string;
    categoryId?: string;
    date?: Date;
    time?: string;
  }) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) {
        throw new Error('Activity not found');
      }

      const isExternal = activity.isExternal || false;

      if (isExternal) {
        const updateData: any = {};
        
        if (updates.categoryId !== undefined) {
          updateData.category_id = updates.categoryId;
          updateData.manually_set_category = true;
          updateData.category_updated_at = new Date().toISOString();
        }
        
        if (updates.title !== undefined) {
          updateData.local_title_override = updates.title;
        }
        
        updateData.last_local_modified = new Date().toISOString();
        updateData.updated_at = new Date().toISOString();
        
        const { error: updateError } = await supabase
          .from('events_local_meta')
          .update(updateData)
          .eq('id', activityId);

        if (updateError) {
          throw updateError;
        }
      } else {
        const updateData: any = {};
        
        if (updates.title !== undefined) {
          updateData.title = updates.title;
        }
        if (updates.location !== undefined) {
          updateData.location = updates.location;
        }
        if (updates.date !== undefined) {
          updateData.activity_date = updates.date.toISOString().split('T')[0];
        }
        if (updates.time !== undefined) {
          updateData.activity_time = updates.time;
        }
        
        if (updates.categoryId !== undefined) {
          updateData.category_id = updates.categoryId;
          updateData.manually_set_category = true;
          updateData.category_updated_at = new Date().toISOString();
        }
        
        if (updates.title !== undefined || updates.location !== undefined || updates.date !== undefined || updates.time !== undefined) {
          updateData.series_id = null;
          updateData.series_instance_date = null;
        }
        
        updateData.updated_at = new Date().toISOString();
        
        const { error: updateError } = await supabase
          .from('activities')
          .update(updateData)
          .eq('id', activityId);

        if (updateError) {
          throw updateError;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      setRefreshTrigger(prev => prev + 1);
      
      if ((updates.date || updates.time) && notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      throw error;
    }
  };

  const updateActivitySeries = async (seriesId: string, updates: {
    title?: string;
    location?: string;
    categoryId?: string;
    time?: string;
  }) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const updateData: any = {};
      
      if (updates.title) updateData.title = updates.title;
      if (updates.location) updateData.location = updates.location;
      if (updates.categoryId) updateData.category_id = updates.categoryId;
      if (updates.time) updateData.activity_time = updates.time;
      updateData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('activity_series')
        .update(updateData)
        .eq('id', seriesId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
      
      setRefreshTrigger(prev => prev + 1);
      
      if (updates.time && notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      throw error;
    }
  };

  const deleteActivity = async (id: string) => {
    const activity = activities.find(a => a.id === id);
    const isExternal = activity?.isExternal;
    
    if (isExternal) {
      throw new Error('Cannot delete external activities');
    }

    try {
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      setActivities(prevActivities => prevActivities.filter(activity => activity.id !== id));
      
      setRefreshTrigger(prev => prev + 1);
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      throw error;
    }
  };

  const deleteActivitySingle = async (activityId: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', activityId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      setActivities(prevActivities => prevActivities.filter(a => a.id !== activityId));
      
      setRefreshTrigger(prev => prev + 1);
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      throw error;
    }
  };

  const deleteActivitySeries = async (seriesId: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const { error: activitiesError } = await supabase
        .from('activities')
        .delete()
        .eq('series_id', seriesId)
        .eq('user_id', userId);

      if (activitiesError) {
        throw activitiesError;
      }

      const { error: seriesError } = await supabase
        .from('activity_series')
        .delete()
        .eq('id', seriesId)
        .eq('user_id', userId);

      if (seriesError) {
        throw seriesError;
      }

      setActivities(prevActivities => prevActivities.filter(a => a.seriesId !== seriesId));
      
      setRefreshTrigger(prev => prev + 1);
      
      if (notificationsEnabled) {
        await forceRefreshNotificationQueue();
      }
    } catch (error) {
      throw error;
    }
  };

  const duplicateActivity = async (id: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    const activity = activities.find(a => a.id === id);
    if (!activity) {
      throw new Error('Activity not found');
    }

    if (activity.isExternal) {
      throw new Error('Cannot duplicate external activities. Only manual activities can be duplicated.');
    }

    try {
      const duplicateTitle = `${activity.title} (kopi)`;
      
      let player_id = null;
      let team_id = null;

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          player_id = selectedContext.id;
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          team_id = selectedContext.id;
        }
      }

      const { data: newActivity, error: activityError } = await supabase
        .from('activities')
        .insert({
          user_id: userId,
          title: duplicateTitle,
          activity_date: activity.date.toISOString().split('T')[0],
          activity_time: activity.time,
          location: activity.location,
          category_id: activity.category.id,
          is_external: false,
          player_id,
          team_id,
        })
        .select()
        .single();

      if (activityError) {
        throw activityError;
      }

      if (activity.tasks.length > 0) {
        const tasksToInsert = activity.tasks.map(task => ({
          activity_id: newActivity.id,
          task_template_id: null,
          title: task.title,
          description: task.description,
          completed: false,
          reminder_minutes: task.reminder,
        }));

        const { error: tasksError } = await supabase
          .from('activity_tasks')
          .insert(tasksToInsert);

        if (tasksError) {
          // Error handled silently
        }
      }

      setRefreshTrigger(prev => prev + 1);
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      throw error;
    }
  };

  const addTask = async (task: Omit<Task, 'id'>) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      let player_id = null;
      let team_id = null;

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          player_id = selectedContext.id;
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          team_id = selectedContext.id;
        }
      }

      await taskService.createTask({
        title: task.title,
        description: task.description,
        categoryIds: task.categoryIds,
        reminder: task.reminder,
        videoUrl: task.videoUrl,
        playerId: player_id,
        teamId: team_id,
      });

      setRefreshTrigger(prev => prev + 1);
      
      if (notificationsEnabled) {
        refreshNotificationQueue(true).catch(err => {
          // Error handled silently
        });
      }
    } catch (error: any) {
      throw error;
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const updateData: any = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.reminder !== undefined) updateData.reminder_minutes = updates.reminder;
      
      if ('videoUrl' in updates) {
        updateData.video_url = updates.videoUrl || null;
      }
      
      updateData.updated_at = new Date().toISOString();

      const { error: templateError } = await supabase
        .from('task_templates')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId);

      if (templateError) {
        throw templateError;
      }

      if (updates.categoryIds !== undefined) {
        const { error: deleteError } = await supabase
          .from('task_template_categories')
          .delete()
          .eq('task_template_id', id);

        if (deleteError) {
          throw deleteError;
        }

        if (updates.categoryIds.length > 0) {
          const categoryInserts = updates.categoryIds.map(categoryId => ({
            task_template_id: id,
            category_id: categoryId,
          }));

          const { error: categoryError } = await supabase
            .from('task_template_categories')
            .insert(categoryInserts);

          if (categoryError) {
            throw categoryError;
          }
        }
      }

      if (updateData.title || updateData.description || updateData.reminder_minutes !== undefined) {
        const activityUpdateData: any = {};
        if (updateData.title) activityUpdateData.title = updateData.title;
        if (updateData.description) activityUpdateData.description = updateData.description;
        if (updateData.reminder_minutes !== undefined) activityUpdateData.reminder_minutes = updateData.reminder_minutes;
        
        if (Object.keys(activityUpdateData).length > 0) {
          const { error: activityTaskError } = await supabase
            .from('activity_tasks')
            .update(activityUpdateData)
            .eq('task_template_id', id);

          if (activityTaskError) {
            // Error handled silently
          }
        }
      }

      setRefreshTrigger(prev => prev + 1);
      
      if (updateData.reminder_minutes !== undefined && notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      throw error;
    }
  };

  const deleteTask = async (id: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const { error } = await supabase
        .from('task_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      setRefreshTrigger(prev => prev + 1);
      
      if (notificationsEnabled) {
        await forceRefreshNotificationQueue();
      }
    } catch (error) {
      throw error;
    }
  };

  const duplicateTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      await addTask({
        ...task,
        title: `${task.title} (kopi)`,
      });
    }
  };

  const toggleTaskCompletion = async (activityId: string, taskId: string) => {
    const activity = activities.find(a => a.id === activityId);
    if (!activity) {
      return;
    }

    const task = activity.tasks.find(t => t.id === taskId);
    if (!task) {
      return;
    }

    const newCompleted = !task.completed;

    setActivities(prevActivities => 
      prevActivities.map(act => {
        if (act.id === activityId) {
          return {
            ...act,
            tasks: act.tasks.map(t =>
              t.id === taskId ? { ...t, completed: newCompleted } : t
            ),
          };
        }
        return act;
      })
    );

    try {
      const tableName = activity.isExternal ? 'external_event_tasks' : 'activity_tasks';
      
      const { error } = await supabase
        .from(tableName)
        .update({ completed: newCompleted })
        .eq('id', taskId);

      if (error) {
        setActivities(prevActivities => 
          prevActivities.map(act => {
            if (act.id === activityId) {
              return {
                ...act,
                tasks: act.tasks.map(t =>
                  t.id === taskId ? { ...t, completed: !newCompleted } : t
                ),
              };
            }
            return act;
          })
        );
        
        throw error;
      }
      
      if (notificationsEnabled) {
        refreshNotificationQueue(true).catch(err => {
          // Error handled silently
        });
      }
    } catch (error) {
      throw error;
    }
  };

  const deleteActivityTask = async (activityId: string, taskId: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const activity = activities.find(a => a.id === activityId);
      if (!activity) {
        throw new Error('Activity not found');
      }

      const isExternal = activity.isExternal || false;
      const tableName = isExternal ? 'external_event_tasks' : 'activity_tasks';

      if (!isExternal) {
        const { data: activityData, error: activityError } = await supabase
          .from('activities')
          .select('id, user_id')
          .eq('id', activityId)
          .eq('user_id', userId)
          .single();

        if (activityError || !activityData) {
          throw new Error('Activity not found or you do not have permission to delete this task');
        }

        const { error: deleteError } = await supabase
          .from('activity_tasks')
          .delete()
          .eq('id', taskId)
          .eq('activity_id', activityId);

        if (deleteError) {
          throw deleteError;
        }
      } else {
        const { error: deleteError } = await supabase
          .from('external_event_tasks')
          .delete()
          .eq('id', taskId);

        if (deleteError) {
          throw deleteError;
        }
      }

      setActivities(prevActivities => 
        prevActivities.map(act => {
          if (act.id === activityId) {
            return {
              ...act,
              tasks: act.tasks.filter(t => t.id !== taskId),
            };
          }
          return act;
        })
      );

      setRefreshTrigger(prev => prev + 1);
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error: any) {
      throw error;
    }
  };

  const addExternalCalendar = async (calendar: Omit<ExternalCalendar, 'id'>) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        throw new Error('No active session. Please log in again.');
      }

      const { data, error } = await supabase
        .from('external_calendars')
        .insert({
          user_id: userId,
          name: calendar.name,
          ics_url: calendar.icsUrl,
          enabled: calendar.enabled !== undefined ? calendar.enabled : true,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      if (data) {
        const newCalendar: ExternalCalendar = {
          id: data.id,
          name: data.name,
          icsUrl: data.ics_url,
          enabled: data.enabled,
          lastFetched: data.last_fetched ? new Date(data.last_fetched) : undefined,
          eventCount: data.event_count || 0,
        };
        
        setExternalCalendars(prev => [...prev, newCalendar]);

        if (newCalendar.enabled) {
          fetchExternalCalendarEvents(newCalendar).catch(() => {
            // Error handled silently
          });
        }
        
        return newCalendar;
      }
    } catch (error) {
      throw error;
    }
  };

  const toggleCalendar = async (id: string) => {
    const calendar = externalCalendars.find(cal => cal.id === id);
    if (!calendar) {
      return;
    }

    const newEnabled = !calendar.enabled;

    try {
      const { error } = await supabase
        .from('external_calendars')
        .update({ enabled: newEnabled })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      setExternalCalendars(externalCalendars.map(cal => {
        if (cal.id === id) {
          const updated = { ...cal, enabled: newEnabled };
          
          if (newEnabled) {
            fetchExternalCalendarEvents(updated).catch(() => {
              // Error handled silently
            });
          } else {
            setActivities(prev => prev.filter(a => a.externalCalendarId !== id));
          }
          
          return updated;
        }
        return cal;
      }));
    } catch (error: any) {
      throw error;
    }
  };

  const deleteExternalCalendar = async (id: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    try {
      const { error: eventsError } = await supabase
        .from('events_external')
        .delete()
        .eq('provider_calendar_id', id);

      if (eventsError) {
        throw eventsError;
      }

      const { error } = await supabase
        .from('external_calendars')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      setExternalCalendars(prevCalendars => prevCalendars.filter(cal => cal.id !== id));
      setActivities(prevActivities => prevActivities.filter(a => a.externalCalendarId !== id));
      
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      throw error;
    }
  };

  const importExternalActivity = async (externalActivityId: string, categoryId: string) => {
    if (!userId) {
      return;
    }

    const externalActivity = activities.find(a => a.id === externalActivityId && a.isExternal);
    if (!externalActivity) {
      return;
    }

    const category = categories.find(c => c.id === categoryId) || categories[0];
    
    const activityDate = new Date(externalActivity.date);
    const dateStr = activityDate.toISOString().split('T')[0];

    let player_id = null;
    let team_id = null;

    if (userRole === 'trainer' || userRole === 'admin') {
      if (selectedContext.type === 'player' && selectedContext.id) {
        player_id = selectedContext.id;
      } else if (selectedContext.type === 'team' && selectedContext.id) {
        team_id = selectedContext.id;
      }
    }

    const { data, error } = await supabase
      .from('activities')
      .insert({
        user_id: userId,
        title: externalActivity.title,
        activity_date: dateStr,
        activity_time: externalActivity.time,
        location: externalActivity.location,
        category_id: category.id,
        is_external: false,
        player_id,
        team_id,
      })
      .select()
      .single();

    if (error) {
      return;
    }

    if (data) {
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const importMultipleActivities = async (
    activityIds: string[], 
    categoryId: string,
    onProgress?: (current: number, total: number) => void
  ) => {
    const total = activityIds.length;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < activityIds.length; i++) {
      try {
        await importExternalActivity(activityIds[i], categoryId);
        successCount++;
      } catch (error) {
        failCount++;
      }
      
      if (onProgress) {
        onProgress(i + 1, total);
      }
    }

    return { successCount, failCount };
  };

  const fetchExternalCalendarEvents = useCallback(async (calendar: ExternalCalendar) => {
    try {
      if (!userId) {
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return;
      }

      const { data, error } = await supabase.functions.invoke('sync-external-calendar-v4', {
        body: { calendarId: calendar.id }
      });

      if (error) {
        return;
      }

      await supabase
        .from('external_calendars')
        .update({ 
          last_fetched: new Date().toISOString(),
          event_count: data?.eventCount || 0
        })
        .eq('id', calendar.id);

      await new Promise(resolve => setTimeout(resolve, 1000));

      setRefreshTrigger(prev => prev + 1);
    } catch {
      return;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const enabledCalendars = externalCalendars.filter(cal => cal.enabled);
    
    enabledCalendars.forEach(calendar => {
      const shouldFetch = !calendar.lastFetched || 
        (new Date().getTime() - new Date(calendar.lastFetched).getTime()) > 5 * 60 * 1000;
      
      if (shouldFetch) {
        fetchExternalCalendarEvents(calendar).catch(() => {
          // Error handled silently
        });
      }
    });
  }, [externalCalendars, fetchExternalCalendarEvents, userId]);

  const refreshData = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    categories,
    tasks,
    activities,
    trophies,
    externalCalendars,
    externalActivities,
    currentWeekStats: getCurrentWeekStats,
    todayActivities: getTodayActivities,
    isLoading,
    addActivity,
    createActivity,
    updateActivity,
    updateActivitySingle,
    updateActivitySeries,
    deleteActivity,
    deleteActivitySingle,
    deleteActivitySeries,
    duplicateActivity,
    addTask,
    updateTask,
    deleteTask,
    duplicateTask,
    toggleTaskCompletion,
    deleteActivityTask,
    refreshData,
    addExternalCalendar,
    toggleCalendar,
    deleteExternalCalendar,
    importExternalActivity,
    importMultipleActivities,
    fetchExternalCalendarEvents,
  };
}
