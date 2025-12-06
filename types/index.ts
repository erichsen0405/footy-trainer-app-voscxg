
export interface Activity {
  id: string;
  title: string;
  date: Date;
  time: string;
  location: string;
  category: ActivityCategory;
  tasks: Task[];
  isExternal?: boolean;
  externalCalendarId?: string;
  externalEventId?: string;
  externalCategory?: string;
  seriesId?: string;
  seriesInstanceDate?: Date;
}

export interface ActivityCategory {
  id: string;
  name: string;
  color: string;
  emoji: string;
}

export interface ActivitySeries {
  id: string;
  userId: string;
  title: string;
  location: string;
  categoryId: string;
  recurrenceType: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
  recurrenceDays: number[]; // Days of week (0=Sunday, 1=Monday, etc.)
  startDate: Date;
  endDate?: Date;
  activityTime: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  isTemplate: boolean;
  categoryIds: string[];
  reminder?: number;
  subtasks: Subtask[];
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Trophy {
  week: number;
  year: number;
  type: 'gold' | 'silver' | 'bronze';
  percentage: number;
  completedTasks: number;
  totalTasks: number;
}

export interface ExternalCalendar {
  id: string;
  name: string;
  icsUrl: string;
  enabled: boolean;
  lastFetched?: Date;
  eventCount?: number;
  autoSyncEnabled?: boolean;
  syncIntervalMinutes?: number;
}

export interface ExternalEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  calendarId: string;
  categories?: string[];
}

export interface CategoryMapping {
  id: string;
  userId: string;
  externalCategory: string;
  internalCategoryId: string;
  createdAt: Date;
  updatedAt: Date;
}
