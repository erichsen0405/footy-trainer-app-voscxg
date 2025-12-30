
import { supabase } from '@/app/integrations/supabase/client';

export interface CreateTaskData {
  title: string;
  description: string;
  categoryIds: string[];
  reminder?: number;
  videoUrl?: string;
  playerId?: string | null;
  teamId?: string | null;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  categoryIds?: string[];
  reminder?: number;
  videoUrl?: string | null;
}

export const taskService = {
  async createTask(data: CreateTaskData, signal?: AbortSignal): Promise<void> {
    console.log('[P8] createTask called', { data });
    const { data: { user } } = await supabase.auth.getUser();

    const { data: templateData, error: templateError } = await supabase
      .from('task_templates')
      .insert({
        user_id: user.id,
        title: data.title,
        description: data.description,
        reminder_minutes: data.reminder,
        video_url: data.videoUrl || null,
        player_id: data.playerId,
        team_id: data.teamId,
      })
      .select('id')
      .single()
      .abortSignal(signal);

    if (templateError) {
      throw templateError;
    }

    if (data.categoryIds && data.categoryIds.length > 0) {
      const categoryInserts = data.categoryIds.map(categoryId => ({
        task_template_id: templateData.id,
        category_id: categoryId,
      }));

      const { error: categoryError } = await supabase
        .from('task_template_categories')
        .insert(categoryInserts)
        .abortSignal(signal);

      if (categoryError) {
        throw categoryError;
      }
    }
  },

  async updateTask(taskId: string, userId: string, updates: UpdateTaskData, signal?: AbortSignal): Promise<void> {
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
      .eq('id', taskId)
      .eq('user_id', userId)
      .abortSignal(signal);

    if (templateError) throw templateError;

    if (updates.categoryIds !== undefined) {
      const { error: deleteError } = await supabase
        .from('task_template_categories')
        .delete()
        .eq('task_template_id', taskId)
        .abortSignal(signal);

      if (deleteError) throw deleteError;

      if (updates.categoryIds.length > 0) {
        const categoryInserts = updates.categoryIds.map(categoryId => ({
          task_template_id: taskId,
          category_id: categoryId,
        }));

        const { error: categoryError } = await supabase
          .from('task_template_categories')
          .insert(categoryInserts)
          .abortSignal(signal);

        if (categoryError) throw categoryError;
      }
    }

    if (updateData.title || updateData.description || updateData.reminder_minutes !== undefined) {
      const activityUpdateData: any = {};
      if (updateData.title) activityUpdateData.title = updateData.title;
      if (updateData.description) activityUpdateData.description = updateData.description;
      if (updateData.reminder_minutes !== undefined) activityUpdateData.reminder_minutes = updateData.reminder_minutes;
      
      if (Object.keys(activityUpdateData).length > 0) {
        await supabase
          .from('activity_tasks')
          .update(activityUpdateData)
          .eq('task_template_id', taskId)
          .abortSignal(signal);
      }
    }
  },

  async deleteTask(taskId: string, userId: string, signal?: AbortSignal): Promise<void> {
    const { error } = await supabase
      .from('task_templates')
      .delete()
      .eq('id', taskId)
      .eq('user_id', userId)
      .abortSignal(signal);

    if (error) throw error;
  },

  async toggleTaskCompletion(taskId: string, isExternal: boolean, newCompleted: boolean, signal?: AbortSignal): Promise<void> {
    const tableName = isExternal ? 'external_event_tasks' : 'activity_tasks';
    
    const { error } = await supabase
      .from(tableName)
      .update({ completed: newCompleted })
      .eq('id', taskId)
      .abortSignal(signal);

    if (error) throw error;
  },

  async deleteActivityTask(activityId: string, taskId: string, userId: string, isExternal: boolean, signal?: AbortSignal): Promise<void> {
    if (!isExternal) {
      const { data: activityData, error: activityError } = await supabase
        .from('activities')
        .select('id, user_id')
        .eq('id', activityId)
        .eq('user_id', userId)
        .abortSignal(signal)
        .single();

      if (activityError || !activityData) {
        throw new Error('Activity not found or you do not have permission to delete this task');
      }

      const { error: deleteError } = await supabase
        .from('activity_tasks')
        .delete()
        .eq('id', taskId)
        .eq('activity_id', activityId)
        .abortSignal(signal);

      if (deleteError) throw deleteError;
    } else {
      const { error: deleteError } = await supabase
        .from('external_event_tasks')
        .delete()
        .eq('id', taskId)
        .abortSignal(signal);

      if (deleteError) throw deleteError;
    }
  },
};
