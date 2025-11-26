
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, ActivityCategory, Task, Trophy, ExternalCalendar } from '@/types';
import { fetchAndParseICalendar, formatTimeFromDate } from '@/utils/icalParser';

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
    generateSampleActivities();
    generateSampleTrophies();
  }, [generateSampleActivities]);

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
    try {
      console.log('Fetching calendar:', calendar.name);
      const events = await fetchAndParseICalendar(calendar.icsUrl);
      
      const newActivities: Activity[] = events.map(event => ({
        id: `external-${calendar.id}-${event.uid}`,
        title: event.summary,
        date: event.startDate,
        time: formatTimeFromDate(event.startDate),
        location: event.location || 'Ingen lokation',
        category: categories[0],
        tasks: [],
        isExternal: true,
        externalCalendarId: calendar.id,
        externalEventId: event.uid,
      }));

      console.log(`Parsed ${newActivities.length} activities from ${calendar.name}`);

      setExternalActivities(prev => {
        const filtered = prev.filter(a => a.externalCalendarId !== calendar.id);
        const updated = [...filtered, ...newActivities];
        console.log(`Total external activities after update: ${updated.length}`);
        return updated;
      });

      setExternalCalendars(prev => prev.map(cal => 
        cal.id === calendar.id 
          ? { ...cal, lastFetched: new Date(), eventCount: events.length }
          : cal
      ));

      console.log(`Successfully fetched ${events.length} events from ${calendar.name}`);
    } catch (error) {
      console.error('Error fetching external calendar:', error);
    }
  }, [categories]);

  // Auto-fetch enabled calendars on mount and when calendars change
  useEffect(() => {
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
  }, [externalCalendars, fetchExternalCalendarEvents]);

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

  const addExternalCalendar = (calendar: Omit<ExternalCalendar, 'id'>) => {
    const newCalendar: ExternalCalendar = {
      ...calendar,
      id: `calendar-${Date.now()}`,
    };
    console.log('Adding external calendar:', newCalendar.name);
    setExternalCalendars([...externalCalendars, newCalendar]);
  };

  const toggleCalendar = (id: string) => {
    setExternalCalendars(externalCalendars.map(calendar => {
      if (calendar.id === id) {
        const updated = { ...calendar, enabled: !calendar.enabled };
        console.log(`Toggling calendar ${calendar.name} to ${updated.enabled ? 'enabled' : 'disabled'}`);
        return updated;
      }
      return calendar;
    }));
  };

  const deleteExternalCalendar = (id: string) => {
    console.log('Deleting external calendar:', id);
    setExternalCalendars(externalCalendars.filter(cal => cal.id !== id));
    setExternalActivities(prev => prev.filter(a => a.externalCalendarId !== id));
  };

  const importExternalActivity = (externalActivityId: string, categoryId: string) => {
    const externalActivity = externalActivities.find(a => a.id === externalActivityId);
    if (!externalActivity) {
      console.log('External activity not found:', externalActivityId);
      return;
    }

    const category = categories.find(c => c.id === categoryId) || categories[0];
    
    const activityTasks = tasks
      .filter(task => task.isTemplate && task.categoryIds.includes(category.id))
      .map(task => ({
        ...task,
        id: `${task.id}-imported-${Date.now()}`,
        isTemplate: false,
        completed: false,
      }));

    const importedActivity: Activity = {
      ...externalActivity,
      id: `imported-${Date.now()}`,
      category,
      tasks: activityTasks,
      isExternal: false,
      externalCalendarId: undefined,
      externalEventId: undefined,
    };

    setActivities([...activities, importedActivity]);
    console.log('Activity imported:', importedActivity.title);
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
