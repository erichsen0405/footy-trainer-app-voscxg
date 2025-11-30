
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, ActivityCategory, Task, Trophy, ExternalCalendar } from '@/types';
import { fetchAndParseICalendar, formatTimeFromDate } from '@/utils/icalParser';
import { supabase } from '@/app/integrations/supabase/client';

function getWeekNumber(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

export function useFootballData() {
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [externalActivities, setExternalActivities] = useState<Activity[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user?.id);
      setUserId(user?.id || null);
    };
    getCurrentUser();
  }, []);

  // Load categories from Supabase
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const loadCategories = async () => {
      console.log('Loading categories for user:', userId);
      const { data, error } = await supabase
        .from('activity_categories')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('Error loading categories:', error);
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
        console.log('Loaded categories:', loadedCategories.length);
        setCategories(loadedCategories);
      } else {
        console.log('No categories found in database');
        setCategories([]);
      }
    };

    loadCategories();
  }, [userId]);

  // Load tasks from Supabase
  useEffect(() => {
    if (!userId) return;

    const loadTasks = async () => {
      console.log('Loading tasks for user:', userId);
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('Error loading tasks:', error);
        return;
      }

      if (data) {
        const loadedTasks: Task[] = data.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description || '',
          completed: task.completed || false,
          isTemplate: task.is_template || false,
          categoryIds: task.category_ids || [],
          reminder: task.reminder_minutes || undefined,
          subtasks: task.subtasks || [],
        }));
        console.log('Loaded tasks:', loadedTasks.length);
        setTasks(loadedTasks);
      }
    };

    loadTasks();
  }, [userId]);

  // Load external calendars from Supabase
  useEffect(() => {
    if (!userId) return;

    const loadExternalCalendars = async () => {
      console.log('Loading external calendars for user:', userId);
      const { data, error } = await supabase
        .from('external_calendars')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('Error loading external calendars:', error);
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
        console.log('Loaded external calendars:', loadedCalendars.length);
        setExternalCalendars(loadedCalendars);
      }
    };

    loadExternalCalendars();
  }, [userId]);

  // Load activities from Supabase (including external ones)
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const loadActivities = async () => {
      console.log('Loading activities for user:', userId);
      const { data, error } = await supabase
        .from('activities')
        .select(`
          *,
          category:activity_categories(*)
        `)
        .eq('user_id', userId)
        .order('activity_date', { ascending: true });

      if (error) {
        console.error('Error loading activities:', error);
        setIsLoading(false);
        return;
      }

      if (data) {
        const loadedActivities: Activity[] = data.map(act => {
          const category = act.category ? {
            id: act.category.id,
            name: act.category.name,
            color: act.category.color,
            emoji: act.category.emoji,
          } : categories[0];

          const activityDate = new Date(act.activity_date);
          
          return {
            id: act.id,
            title: act.title,
            date: activityDate,
            time: act.activity_time,
            location: act.location || 'Ingen lokation',
            category,
            tasks: [],
            isExternal: act.is_external,
            externalCalendarId: act.external_calendar_id || undefined,
            externalEventId: act.external_event_id || undefined,
          };
        });

        console.log('Loaded activities:', loadedActivities.length);
        
        // Separate internal and external activities
        const internal = loadedActivities.filter(a => !a.isExternal);
        const external = loadedActivities.filter(a => a.isExternal);
        
        setActivities(internal);
        setExternalActivities(external);
      }
      setIsLoading(false);
    };

    loadActivities();
  }, [userId, categories]);

  // Load trophies from database
  useEffect(() => {
    if (!userId) return;

    const loadTrophies = async () => {
      console.log('Loading trophies for user:', userId);
      const { data, error } = await supabase
        .from('trophies')
        .select('*')
        .eq('user_id', userId)
        .order('year', { ascending: false })
        .order('week', { ascending: false });

      if (error) {
        console.error('Error loading trophies:', error);
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
        console.log('Loaded trophies:', loadedTrophies.length);
        setTrophies(loadedTrophies);
      }
    };

    loadTrophies();
  }, [userId]);

  const fetchExternalCalendarEvents = useCallback(async (calendar: ExternalCalendar) => {
    if (!userId) {
      console.log('No user ID, skipping fetch');
      throw new Error('User not authenticated');
    }

    try {
      console.log('Fetching calendar:', calendar.name);
      console.log('Calendar URL:', calendar.icsUrl);
      
      // Get the current session to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error('Session error: ' + sessionError.message);
      }
      
      if (!session) {
        console.error('No active session');
        throw new Error('No active session');
      }

      console.log('Session valid, calling Edge Function...');
      console.log('Supabase URL:', supabase.supabaseUrl);

      // Call the Edge Function to sync the calendar
      const { data, error } = await supabase.functions.invoke('sync-external-calendar', {
        body: { calendarId: calendar.id }
      });

      if (error) {
        console.error('Error syncing calendar:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('Sync response:', data);

      // Update the calendar's last fetched time
      const { error: updateError } = await supabase
        .from('external_calendars')
        .update({ 
          last_fetched: new Date().toISOString(),
          event_count: data?.eventCount || 0
        })
        .eq('id', calendar.id);

      if (updateError) {
        console.error('Error updating calendar:', updateError);
      }

      // Reload activities to get the newly synced ones
      const { data: activitiesData, error: activitiesError } = await supabase
        .from('activities')
        .select(`
          *,
          category:activity_categories(*)
        `)
        .eq('user_id', userId)
        .eq('is_external', true)
        .eq('external_calendar_id', calendar.id);

      if (activitiesError) {
        console.error('Error loading synced activities:', activitiesError);
        return;
      }

      if (activitiesData) {
        const syncedActivities: Activity[] = activitiesData.map(act => {
          const category = act.category ? {
            id: act.category.id,
            name: act.category.name,
            color: act.category.color,
            emoji: act.category.emoji,
          } : categories[0];

          return {
            id: act.id,
            title: act.title,
            date: new Date(act.activity_date),
            time: act.activity_time,
            location: act.location || 'Ingen lokation',
            category,
            tasks: [],
            isExternal: true,
            externalCalendarId: act.external_calendar_id || undefined,
            externalEventId: act.external_event_id || undefined,
          };
        });

        console.log(`Loaded ${syncedActivities.length} synced activities`);

        setExternalActivities(prev => {
          const filtered = prev.filter(a => a.externalCalendarId !== calendar.id);
          return [...filtered, ...syncedActivities];
        });

        setExternalCalendars(prev => prev.map(cal => 
          cal.id === calendar.id 
            ? { ...cal, lastFetched: new Date(), eventCount: syncedActivities.length }
            : cal
        ));
      }

      console.log(`Successfully synced calendar: ${calendar.name}`);
    } catch (error: any) {
      console.error('Error fetching external calendar:', error);
      console.error('Error name:', error?.name);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      throw error;
    }
  }, [userId, categories]);

  // Auto-fetch enabled calendars on mount and when calendars change
  useEffect(() => {
    if (!userId) return;

    const enabledCalendars = externalCalendars.filter(cal => cal.enabled);
    console.log(`Found ${enabledCalendars.length} enabled calendars to fetch`);
    
    enabledCalendars.forEach(calendar => {
      // Only fetch if not recently fetched (within last 5 minutes)
      const shouldFetch = !calendar.lastFetched || 
        (new Date().getTime() - new Date(calendar.lastFetched).getTime()) > 5 * 60 * 1000;
      
      if (shouldFetch) {
        console.log(`Fetching calendar: ${calendar.name}`);
        fetchExternalCalendarEvents(calendar).catch(err => {
          console.error(`Failed to fetch calendar ${calendar.name}:`, err);
        });
      } else {
        console.log(`Skipping fetch for ${calendar.name} - recently fetched`);
      }
    });
  }, [externalCalendars, fetchExternalCalendarEvents, userId]);

  const getCurrentWeekStats = useMemo(() => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 7);

    const weekActivities = activities.filter(activity => {
      const activityDate = new Date(activity.date);
      return activityDate >= startOfWeek && activityDate < endOfWeek;
    });

    const totalTasks = weekActivities.reduce((sum, activity) => sum + activity.tasks.length, 0);
    const completedTasks = weekActivities.reduce(
      (sum, activity) => sum + activity.tasks.filter(task => task.completed).length,
      0
    );

    const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    return {
      percentage,
      completedTasks,
      totalTasks,
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

  const addActivity = (activity: Omit<Activity, 'id'>) => {
    const newActivity: Activity = {
      ...activity,
      id: `activity-${Date.now()}`,
    };
    setActivities([...activities, newActivity]);
  };

  const updateActivity = (id: string, updates: Partial<Activity>) => {
    setActivities(activities.map(activity => 
      activity.id === id ? { ...activity, ...updates } : activity
    ));
  };

  const deleteActivity = async (id: string) => {
    console.log('Deleting activity:', id);
    
    // Check if it's an external activity
    const isExternal = externalActivities.some(a => a.id === id);
    
    if (isExternal) {
      console.log('Cannot delete external activity from app');
      return;
    }

    // Delete from Supabase
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting activity from database:', error);
      return;
    }

    console.log('Activity deleted from database successfully');

    // Update local state
    setActivities(activities.filter(activity => activity.id !== id));
  };

  const duplicateActivity = (id: string) => {
    const activity = activities.find(a => a.id === id);
    if (activity) {
      const newActivity: Activity = {
        ...activity,
        id: `activity-${Date.now()}`,
        title: `${activity.title} (kopi)`,
        tasks: activity.tasks.map(task => ({
          ...task,
          id: `${task.id}-copy-${Date.now()}`,
          completed: false,
        })),
      };
      setActivities([...activities, newActivity]);
    }
  };

  const addTask = (task: Omit<Task, 'id'>) => {
    const newTask: Task = {
      ...task,
      id: `task-${Date.now()}`,
    };
    setTasks([...tasks, newTask]);
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks(tasks.map(task => 
      task.id === id ? { ...task, ...updates } : task
    ));
    
    setActivities(activities.map(activity => ({
      ...activity,
      tasks: activity.tasks.map(task =>
        task.id === id ? { ...task, ...updates } : task
      ),
    })));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id));
    
    setActivities(activities.map(activity => ({
      ...activity,
      tasks: activity.tasks.filter(task => task.id !== id),
    })));
  };

  const duplicateTask = (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      const newTask: Task = {
        ...task,
        id: `task-${Date.now()}`,
        title: `${task.title} (kopi)`,
      };
      setTasks([...tasks, newTask]);
    }
  };

  const toggleTaskCompletion = (activityId: string, taskId: string) => {
    setActivities(activities.map(activity => {
      if (activity.id === activityId) {
        return {
          ...activity,
          tasks: activity.tasks.map(task =>
            task.id === taskId ? { ...task, completed: !task.completed } : task
          ),
        };
      }
      return activity;
    }));
  };

  const addExternalCalendar = async (calendar: Omit<ExternalCalendar, 'id'>) => {
    if (!userId) {
      console.error('No user ID, cannot add calendar');
      throw new Error('User not authenticated');
    }

    console.log('Adding external calendar to Supabase:', calendar.name);
    console.log('User ID:', userId);
    console.log('Calendar URL:', calendar.icsUrl);

    try {
      // First, verify the user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('Session error:', sessionError);
        throw new Error('No active session. Please log in again.');
      }

      console.log('Session verified, user:', session.user.id);
      console.log('Inserting calendar into database...');

      // Insert the calendar
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
        console.error('Error adding external calendar:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        console.error('Error details:', error.details);
        console.error('Error hint:', error.hint);
        throw error;
      }

      if (data) {
        console.log('Calendar inserted successfully:', data.id);
        
        const newCalendar: ExternalCalendar = {
          id: data.id,
          name: data.name,
          icsUrl: data.ics_url,
          enabled: data.enabled,
          lastFetched: data.last_fetched ? new Date(data.last_fetched) : undefined,
          eventCount: data.event_count || 0,
        };
        
        console.log('Adding calendar to state:', newCalendar);
        setExternalCalendars(prev => [...prev, newCalendar]);

        // Immediately fetch events for the new calendar
        if (newCalendar.enabled) {
          console.log('Triggering initial sync for new calendar');
          try {
            await fetchExternalCalendarEvents(newCalendar);
            console.log('Initial sync completed successfully');
          } catch (syncError) {
            console.error('Error during initial sync:', syncError);
            // Don't throw here - the calendar was added successfully
            // The user can manually sync later
          }
        }
        
        return newCalendar;
      }
    } catch (error) {
      console.error('Failed to add external calendar:', error);
      throw error;
    }
  };

  const toggleCalendar = async (id: string) => {
    const calendar = externalCalendars.find(cal => cal.id === id);
    if (!calendar) {
      console.error('Calendar not found:', id);
      return;
    }

    const newEnabled = !calendar.enabled;
    console.log(`Toggling calendar ${calendar.name} to ${newEnabled ? 'enabled' : 'disabled'}`);

    try {
      // Update the database first
      const { error } = await supabase
        .from('external_calendars')
        .update({ enabled: newEnabled })
        .eq('id', id);

      if (error) {
        console.error('Error toggling calendar:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('Calendar toggle successful in database');

      // Update local state
      setExternalCalendars(externalCalendars.map(cal => {
        if (cal.id === id) {
          const updated = { ...cal, enabled: newEnabled };
          
          // If enabling, fetch events
          if (newEnabled) {
            console.log('Calendar enabled, fetching events');
            fetchExternalCalendarEvents(updated).catch(err => {
              console.error('Failed to fetch calendar events:', err);
              console.error('Error name:', err?.name);
              console.error('Error message:', err?.message);
            });
          } else {
            // If disabling, remove external activities from this calendar
            console.log('Calendar disabled, removing activities');
            setExternalActivities(prev => prev.filter(a => a.externalCalendarId !== id));
          }
          
          return updated;
        }
        return cal;
      }));
    } catch (error: any) {
      console.error('Error in toggleCalendar:', error);
      console.error('Error type:', typeof error);
      console.error('Error keys:', Object.keys(error || {}));
      throw error;
    }
  };

  const deleteExternalCalendar = async (id: string) => {
    console.log('Deleting external calendar:', id);

    try {
      // First delete all activities associated with this calendar
      const { error: activitiesError } = await supabase
        .from('activities')
        .delete()
        .eq('external_calendar_id', id);

      if (activitiesError) {
        console.error('Error deleting calendar activities:', activitiesError);
        throw activitiesError;
      }

      // Then delete the calendar itself
      const { error } = await supabase
        .from('external_calendars')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting calendar:', error);
        throw error;
      }

      console.log('Calendar deleted successfully');

      // Update local state
      setExternalCalendars(externalCalendars.filter(cal => cal.id !== id));
      setExternalActivities(prev => prev.filter(a => a.externalCalendarId !== id));
    } catch (error) {
      console.error('Failed to delete calendar:', error);
      throw error;
    }
  };

  const importExternalActivity = async (externalActivityId: string, categoryId: string) => {
    if (!userId) {
      console.error('No user ID, cannot import activity');
      return;
    }

    const externalActivity = externalActivities.find(a => a.id === externalActivityId);
    if (!externalActivity) {
      console.log('External activity not found:', externalActivityId);
      return;
    }

    const category = categories.find(c => c.id === categoryId) || categories[0];
    
    console.log('Importing activity to Supabase:', externalActivity.title);

    // Format date and time for Supabase
    const activityDate = new Date(externalActivity.date);
    const dateStr = activityDate.toISOString().split('T')[0];

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
      })
      .select()
      .single();

    if (error) {
      console.error('Error importing activity:', error);
      return;
    }

    if (data) {
      const activityTasks = tasks
        .filter(task => task.isTemplate && task.categoryIds.includes(category.id))
        .map(task => ({
          ...task,
          id: `${task.id}-imported-${Date.now()}`,
          isTemplate: false,
          completed: false,
        }));

      const importedActivity: Activity = {
        id: data.id,
        title: data.title,
        date: new Date(data.activity_date),
        time: data.activity_time,
        location: data.location || 'Ingen lokation',
        category,
        tasks: activityTasks,
        isExternal: false,
      };

      setActivities([...activities, importedActivity]);
      console.log('Activity imported successfully:', importedActivity.title);
    }
  };

  const importMultipleActivities = (activityIds: string[], categoryId: string) => {
    console.log(`Importing ${activityIds.length} activities`);
    activityIds.forEach(id => importExternalActivity(id, categoryId));
  };

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
    updateActivity,
    deleteActivity,
    duplicateActivity,
    addTask,
    updateTask,
    deleteTask,
    duplicateTask,
    toggleTaskCompletion,
    addExternalCalendar,
    toggleCalendar,
    deleteExternalCalendar,
    importExternalActivity,
    importMultipleActivities,
    fetchExternalCalendarEvents,
  };
}
