import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useFootballData } from '@/hooks/useFootballData';
import { Activity, ActivityCategory, Task, Trophy, ExternalCalendar } from '@/types';

interface FootballContextType {
  categories: ActivityCategory[];
  tasks: Task[];
  activities: Activity[];
  trophies: Trophy[];
  externalCalendars: ExternalCalendar[];
  externalActivities: Activity[];
  isLoading: boolean;
  currentWeekStats: {
    percentage: number;
    completedTasks: number;
    totalTasks: number;
    completedTasksForWeek: number;
    totalTasksForWeek: number;
    weekActivities: Activity[];
  };
  todayActivities: Activity[];
  addActivity: (activity: Omit<Activity, 'id'>) => void;
  createActivity: (activityData: {
    title: string;
    location: string;
    categoryId: string;
    date: Date;
    time: string;
    isRecurring: boolean;
    recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
    recurrenceDays?: number[];
    endDate?: Date;
  }) => Promise<void>;
  updateActivity: (id: string, updates: Partial<Activity>) => void;
  updateActivitySingle: (activityId: string, updates: {
    title?: string;
    location?: string;
    categoryId?: string;
    date?: Date;
    time?: string;
  }) => Promise<void>;
  updateActivitySeries: (seriesId: string, updates: {
    title?: string;
    location?: string;
    categoryId?: string;
    time?: string;
  }) => Promise<void>;
  deleteActivity: (id: string) => void;
  deleteActivitySingle: (activityId: string) => Promise<void>;
  deleteActivitySeries: (seriesId: string) => Promise<void>;
  duplicateActivity: (id: string) => void;
  addTask: (task: Omit<Task, 'id'>) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  duplicateTask: (id: string) => Promise<void>;
  toggleTaskCompletion: (activityId: string, taskId: string) => void;
  deleteActivityTask: (activityId: string, taskId: string) => Promise<void>;
  refreshData: () => Promise<void>;
  refreshAll: () => Promise<void>;
  addExternalCalendar: (calendar: Omit<ExternalCalendar, 'id'>) => void;
  toggleCalendar: (id: string) => void;
  deleteExternalCalendar: (id: string) => void;
  importExternalActivity: (externalActivityId: string, categoryId: string) => void;
  importMultipleActivities: (
    activityIds: string[], 
    categoryId: string,
    onProgress?: (current: number, total: number) => void
  ) => Promise<{ successCount: number; failCount: number }>;
  fetchExternalCalendarEvents: (calendar: ExternalCalendar) => Promise<void>;
  refreshCategories?: () => Promise<void>;
}

const FootballContext = createContext<FootballContextType | undefined>(undefined);

export function FootballProvider({ children }: { children: ReactNode }) {
  const {
    categories,
    tasks,
    activities,
    trophies,
    externalCalendars,
    externalActivities,
    isLoading,
    currentWeekStats,
    todayActivities,
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
    refreshAll,
    addExternalCalendar,
    toggleCalendar,
    deleteExternalCalendar,
    importExternalActivity,
    importMultipleActivities,
    fetchExternalCalendarEvents,
    refreshCategories,
  } = useFootballData();

  // ✅ Runtime-safe wrapper: createActivity must always be a function
  // If useFootballData() doesn't provide it, fall back to addActivity + refreshData (fail-soft).
  const safeCreateActivity = useMemo<FootballContextType['createActivity']>(() => {
    if (typeof createActivity === 'function') {
      return createActivity;
    }

    return async (activityData) => {
      console.error('[FootballProvider] createActivity is not a function. Using fallback.');

      if (typeof addActivity !== 'function') {
        throw new Error('[FootballProvider] createActivity/addActivity are unavailable');
      }

      const dateObj = activityData?.date instanceof Date ? activityData.date : new Date();
      const isoDate = isNaN(dateObj.getTime()) ? new Date().toISOString().slice(0, 10) : dateObj.toISOString().slice(0, 10);
      const timeStr = typeof activityData?.time === 'string' && activityData.time ? activityData.time : '12:00';

      // Use a conservative payload shape; cast to any to avoid schema/type coupling here.
      const payload: any = {
        title: activityData?.title ?? '',
        location: activityData?.location ?? 'Ingen lokation',
        category_id: activityData?.categoryId ?? activityData?.category_id ?? '',
        activity_date: isoDate,
        activity_time: timeStr,
        is_recurring: !!activityData?.isRecurring,
        recurrence_type: activityData?.recurrenceType,
        recurrence_days: activityData?.recurrenceDays,
        end_date: activityData?.endDate instanceof Date ? activityData.endDate.toISOString().slice(0, 10) : undefined,
      };

      addActivity(payload);

      if (typeof refreshData === 'function') {
        await refreshData();
      }
    };
  }, [createActivity, addActivity, refreshData]);

  const value = useMemo(
    () => ({
      categories,
      tasks,
      activities,
      trophies,
      externalCalendars,
      externalActivities,
      isLoading,
      currentWeekStats,
      todayActivities,
      addActivity,
      createActivity: safeCreateActivity,
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
      refreshAll,
      addExternalCalendar,
      toggleCalendar,
      deleteExternalCalendar,
      importExternalActivity,
      importMultipleActivities,
      fetchExternalCalendarEvents,
      refreshCategories,
    }),
    [
      categories,
      tasks,
      activities,
      trophies,
      externalCalendars,
      externalActivities,
      isLoading,
      currentWeekStats,
      todayActivities,
      addActivity,
      safeCreateActivity,
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
      refreshAll,
      addExternalCalendar,
      toggleCalendar,
      deleteExternalCalendar,
      importExternalActivity,
      importMultipleActivities,
      fetchExternalCalendarEvents,
      refreshCategories,
    ]
  );

  return (
    <FootballContext.Provider value={value}>
      {children}
    </FootballContext.Provider>
  );
}

export function useFootball() {
  const context = useContext(FootballContext);
  if (context === undefined) {
    throw new Error('useFootball must be used within a FootballProvider');
  }
  return context;
}
