
import React, { createContext, useContext, ReactNode } from 'react';
import { useFootballData } from '@/hooks/useFootballData';
import { Activity, ActivityCategory, Task, Trophy, ExternalCalendar } from '@/types';

interface FootballContextType {
  categories: ActivityCategory[];
  tasks: Task[];
  activities: Activity[];
  trophies: Trophy[];
  externalCalendars: ExternalCalendar[];
  externalActivities: Activity[];
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
  updateActivity: (id: string, updates: Partial<Activity>) => void;
  deleteActivity: (id: string) => void;
  duplicateActivity: (id: string) => void;
  addTask: (task: Omit<Task, 'id'>) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  duplicateTask: (id: string) => void;
  toggleTaskCompletion: (activityId: string, taskId: string) => void;
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
}

const FootballContext = createContext<FootballContextType | undefined>(undefined);

export function FootballProvider({ children }: { children: ReactNode }) {
  const footballData = useFootballData();

  return (
    <FootballContext.Provider value={footballData}>
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
