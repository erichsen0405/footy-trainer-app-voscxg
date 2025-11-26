
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, ActivityCategory, Task, Trophy, ExternalCalendar } from '@/types';
import { fetchAndParseICalendar, formatTimeFromDate } from '@/utils/icalParser';
import { supabase } from '@/app/integrations/supabase/client';

const defaultCategories: ActivityCategory[] = [
  { id: '1', name: 'Træning', color: '#4CAF50', emoji: '⚽' },
  { id: '2', name: 'Styrketræning', color: '#2196F3', emoji: '💪' },
  { id: '3', name: 'VR træning', color: '#9C27B0', emoji: '🥽' },
  { id: '4', name: 'Kamp', color: '#FF9800', emoji: '🏆' },
  { id: '5', name: 'Turnering', color: '#F44336', emoji: '🎯' },
];

const defaultTasks: Task[] = [
  {
    id: 't1',
    title: 'VR træning',
    description: 'Gennemfør VR træning',
    completed: false,
    isTemplate: true,
    categoryIds: ['3'],
    reminder: 15,
    subtasks: [],
  },
  {
    id: 't2',
    title: 'Fokuspunkter til træning',
    description: 'Gennemgå fokuspunkter',
    completed: false,
    isTemplate: true,
    categoryIds: ['1'],
    reminder: 45,
    subtasks: [],
  },
  {
    id: 't3',
    title: 'Åndedrætsøvelser',
    description: 'Udfør åndedrætsøvelser',
    completed: false,
    isTemplate: true,
    categoryIds: ['1', '4', '5'],
    reminder: 15,
    subtasks: [],
  },
  {
    id: 't4',
    title: 'Styrketræning',
    description: 'Gennemfør styrketræning',
    completed: false,
    isTemplate: true,
    categoryIds: ['2'],
    reminder: 15,
    subtasks: [],
  },
  {
    id: 't5',
    title: 'Pak fodboldtaske',
    description: 'Pak alt nødvendigt udstyr',
    completed: false,
    isTemplate: true,
    categoryIds: ['1', '4', '5'],
    reminder: 90,
    subtasks: [],
  },
  {
    id: 't6',
    title: 'Fokuspunkter til kamp',
    description: 'Gennemgå fokuspunkter',
    completed: false,
    isTemplate: true,
    categoryIds: ['4'],
    reminder: 60,
    subtasks: [],
  },
];

function getWeekNumber(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

export function useFootballData() {
  const [categories, setCategories] = useState<ActivityCategory[]>(defaultCategories);
  const [tasks, setTasks] = useState<Task[]>(defaultTasks);
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
    if (!userId) return;

    const loadCategories = async () => {
      console.log('Loading categories for user:', userId);
      const { data, error } = await supabase
        .from('activity_categories')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('Error loading categories:', error);
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
        console.log('No categories found, using defaults');
      }
    };

    loadCategories();
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
    if (!userId) return;

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

  const generateSampleActivities = useCallback(() => {
    const now = new Date();
    const sampleActivities: Activity[] = [];

    for (let i = 0; i < 20; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i - 5);
      
      const categoryIndex = i % categories.length;
      const category = categories[categoryIndex];
      
      const activityTasks = tasks
        .filter(task => task.isTemplate && task.categoryIds.includes(category.id))
        .map(task => ({
          ...task,
          id: `${task.id}-${i}`,
          isTemplate: false,
          completed: Math.random() > 0.3,
        }));

      sampleActivities.push({
        id: `activity-${i}`,
        title: category.name,
        date,
        time: i % 2 === 0 ? '16:00' : '19:20',
        location: i % 3 === 0 ? 'Omklædningsrum på 1.sal' : 'Hjemme',
        category,
        tasks: activityTasks,
      });
    }

    setActivities(sampleActivities);
  }, [categories, tasks]);

  useEffect(() => {
    if (!userId && activities.length === 0) {
      generateSampleActivities();
    }
    generateSampleTrophies();
  }, [generateSampleActivities, userId, activities.length]);

  const generateSampleTrophies = () => {
    const sampleTrophies: Trophy[] = [];
    const now = new Date();
    
    for (let i = 0; i < 10; i++) {
      const percentage = Math.floor(Math.random() * 100);
      let type: 'gold' | 'silver' | 'bronze';
      
      if (percentage >= 80) type = 'gold';
      else if (percentage >= 60) type = 'silver';
      else type = 'bronze';

      sampleTrophies.push({
        week: getWeekNumber(now) - i,
        year: now.getFullYear(),
        type,
        percentage,
        completedTasks: Math.floor(percentage * 0.09),
        totalTasks: 9,
      });
    }

    setTrophies(sampleTrophies);
  };

  const fetchExternalCalendarEvents = useCallback(async (calendar: ExternalCalendar) => {
    if (!userId) {
      console.log('No user ID, skipping fetch');
      return;
    }

    try {
      console.log('Fetching calendar:', calendar.name);
      
      // Call the Edge Function to sync the calendar
      const { data, error } = await supabase.functions.invoke('sync-external-calendar', {
        body: { calendarId: calendar.id }
      });

      if (error) {
        console.error('Error syncing calendar:', error);
        return;
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
    } catch (error) {
      console.error('Error fetching external calendar:', error);
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
        fetchExternalCalendarEvents(calendar);
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

  const deleteActivity = (id: string) => {
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
      return;
    }

    console.log('Adding external calendar to Supabase:', calendar.name);

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
      return;
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
      
      console.log('Calendar added successfully:', newCalendar.id);
      setExternalCalendars([...externalCalendars, newCalendar]);

      // Immediately fetch events for the new calendar
      if (newCalendar.enabled) {
        console.log('Triggering initial sync for new calendar');
        fetchExternalCalendarEvents(newCalendar);
      }
    }
  };

  const toggleCalendar = async (id: string) => {
    const calendar = externalCalendars.find(cal => cal.id === id);
    if (!calendar) return;

    const newEnabled = !calendar.enabled;
    console.log(`Toggling calendar ${calendar.name} to ${newEnabled ? 'enabled' : 'disabled'}`);

    const { error } = await supabase
      .from('external_calendars')
      .update({ enabled: newEnabled })
      .eq('id', id);

    if (error) {
      console.error('Error toggling calendar:', error);
      return;
    }

    setExternalCalendars(externalCalendars.map(cal => {
      if (cal.id === id) {
        const updated = { ...cal, enabled: newEnabled };
        
        // If enabling, fetch events
        if (newEnabled) {
          console.log('Calendar enabled, fetching events');
          fetchExternalCalendarEvents(updated);
        } else {
          // If disabling, remove external activities from this calendar
          console.log('Calendar disabled, removing activities');
          setExternalActivities(prev => prev.filter(a => a.externalCalendarId !== id));
        }
        
        return updated;
      }
      return cal;
    }));
  };

  const deleteExternalCalendar = async (id: string) => {
    console.log('Deleting external calendar:', id);

    const { error } = await supabase
      .from('external_calendars')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting calendar:', error);
      return;
    }

    setExternalCalendars(externalCalendars.filter(cal => cal.id !== id));
    setExternalActivities(prev => prev.filter(a => a.externalCalendarId !== id));
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
