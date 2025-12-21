
import { supabase } from '@/app/integrations/supabase/client';
import { Activity, ActivityCategory } from '@/types';

export interface CreateActivityData {
  title: string;
  location: string;
  categoryId: string;
  date: Date;
  time: string;
  isRecurring: boolean;
  recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
  recurrenceDays?: number[];
  endDate?: Date;
  userId: string;
  playerId?: string | null;
  teamId?: string | null;
}

export interface UpdateActivityData {
  title?: string;
  location?: string;
  categoryId?: string;
  date?: Date;
  time?: string;
}

// Helper function to generate dates for recurring activities
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

export const activityService = {
  async createActivity(data: CreateActivityData): Promise<void> {
    console.log('Creating activity:', data);

    if (data.isRecurring) {
      const { data: seriesData, error: seriesError } = await supabase
        .from('activity_series')
        .insert({
          user_id: data.userId,
          title: data.title,
          location: data.location,
          category_id: data.categoryId,
          recurrence_type: data.recurrenceType!,
          recurrence_days: data.recurrenceDays || [],
          start_date: data.date.toISOString().split('T')[0],
          end_date: data.endDate ? data.endDate.toISOString().split('T')[0] : null,
          activity_time: data.time,
          player_id: data.playerId,
          team_id: data.teamId,
        })
        .select()
        .single();

      if (seriesError) throw seriesError;

      const dates = generateRecurringDates(
        data.date,
        data.endDate,
        data.recurrenceType!,
        data.recurrenceDays
      );

      const activitiesToInsert = dates.map(date => ({
        user_id: data.userId,
        title: data.title,
        activity_date: date.toISOString().split('T')[0],
        activity_time: data.time,
        location: data.location,
        category_id: data.categoryId,
        series_id: seriesData.id,
        series_instance_date: date.toISOString().split('T')[0],
        is_external: false,
        player_id: data.playerId,
        team_id: data.teamId,
      }));

      const { error: activitiesError } = await supabase
        .from('activities')
        .insert(activitiesToInsert);

      if (activitiesError) throw activitiesError;
    } else {
      const { error } = await supabase
        .from('activities')
        .insert({
          user_id: data.userId,
          title: data.title,
          activity_date: data.date.toISOString().split('T')[0],
          activity_time: data.time,
          location: data.location,
          category_id: data.categoryId,
          is_external: false,
          player_id: data.playerId,
          team_id: data.teamId,
        });

      if (error) throw error;
    }
  },

  async updateActivitySingle(activityId: string, updates: UpdateActivityData, isExternal: boolean): Promise<void> {
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

      const { error } = await supabase
        .from('events_local_meta')
        .update(updateData)
        .eq('id', activityId);

      if (error) throw error;
    } else {
      const updateData: any = {};
      
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.location !== undefined) updateData.location = updates.location;
      if (updates.date !== undefined) updateData.activity_date = updates.date.toISOString().split('T')[0];
      if (updates.time !== undefined) updateData.activity_time = updates.time;
      
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

      const { error } = await supabase
        .from('activities')
        .update(updateData)
        .eq('id', activityId);

      if (error) throw error;
    }
  },

  async updateActivitySeries(seriesId: string, userId: string, updates: UpdateActivityData): Promise<void> {
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

    if (error) throw error;
  },

  async deleteActivitySingle(activityId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', activityId)
      .eq('user_id', userId);

    if (error) throw error;
  },

  async deleteActivitySeries(seriesId: string, userId: string): Promise<void> {
    const { error: activitiesError } = await supabase
      .from('activities')
      .delete()
      .eq('series_id', seriesId)
      .eq('user_id', userId);

    if (activitiesError) throw activitiesError;

    const { error: seriesError } = await supabase
      .from('activity_series')
      .delete()
      .eq('id', seriesId)
      .eq('user_id', userId);

    if (seriesError) throw seriesError;
  },

  async duplicateActivity(activityId: string, userId: string, playerId?: string | null, teamId?: string | null): Promise<void> {
    const { data: activity, error: fetchError } = await supabase
      .from('activities')
      .select(`
        *,
        activity_tasks(
          id,
          title,
          description,
          completed,
          reminder_minutes
        )
      `)
      .eq('id', activityId)
      .single();

    if (fetchError || !activity) throw new Error('Activity not found');

    const duplicateTitle = `${activity.title} (kopi)`;

    const { data: newActivity, error: activityError } = await supabase
      .from('activities')
      .insert({
        user_id: userId,
        title: duplicateTitle,
        activity_date: activity.activity_date,
        activity_time: activity.activity_time,
        location: activity.location,
        category_id: activity.category_id,
        is_external: false,
        player_id: playerId,
        team_id: teamId,
      })
      .select()
      .single();

    if (activityError) throw activityError;

    if (activity.activity_tasks && activity.activity_tasks.length > 0) {
      const tasksToInsert = activity.activity_tasks.map((task: any) => ({
        activity_id: newActivity.id,
        task_template_id: null,
        title: task.title,
        description: task.description,
        completed: false,
        reminder_minutes: task.reminder_minutes,
      }));

      const { error: tasksError } = await supabase
        .from('activity_tasks')
        .insert(tasksToInsert);

      if (tasksError) console.error('Error duplicating tasks:', tasksError);
    }
  },
};
