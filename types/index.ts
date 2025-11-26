
export interface Activity {
  id: string;
  title: string;
  date: Date;
  time: string;
  location: string;
  category: ActivityCategory;
  tasks: Task[];
}

export interface ActivityCategory {
  id: string;
  name: string;
  color: string;
  emoji: string;
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
}
