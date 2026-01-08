
export interface Activity {
  id: string;
  title: string;
  date: Date;
  time: string;
  endTime?: string | null;
  location: string;
  category: ActivityCategory;
  tasks: Task[];
  intensity?: number | null;
  intensityEnabled?: boolean;
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
  activityEndTime?: string | null;
  createdAt: Date;
  updatedAt: Date;
  intensityEnabled?: boolean;
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
  videoUrl?: string;
  afterTrainingEnabled?: boolean;
  afterTrainingDelayMinutes?: number | null;
  afterTrainingFeedbackEnableScore?: boolean;
  afterTrainingFeedbackScoreExplanation?: string | null;
  afterTrainingFeedbackEnableIntensity?: boolean;
  afterTrainingFeedbackEnableNote?: boolean;
  taskTemplateId?: string | null;
  feedbackTemplateId?: string | null;
  isFeedbackTask?: boolean;
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

export interface SubscriptionPlan {
  id: string;
  name: string;
  price_dkk: number;
  max_players: number;
  stripe_price_id?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Subscription {
  id: string;
  admin_id: string;
  plan_id: string;
  status: 'trial' | 'active' | 'past_due' | 'canceled' | 'expired';
  trial_start?: Date;
  trial_end?: Date;
  current_period_start?: Date;
  current_period_end?: Date;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  cancel_at_period_end: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Team {
  id: string;
  admin_id: string;
  name: string;
  description?: string;
  created_at: Date;
  updated_at: Date;
}

export interface TeamMember {
  id: string;
  team_id: string;
  player_id: string;
  created_at: Date;
}

export interface TaskTemplateSelfFeedback {
  id: string;
  userId: string;
  taskTemplateId: string;
  activityId: string;
  rating?: number | null;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}
