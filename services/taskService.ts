import { supabase } from '@/app/integrations/supabase/client';
import { Task } from '@/types';

export interface CreateTaskData {
  title: string;
  description: string;
  categoryIds: string[];
  reminder?: number;
  videoUrl?: string;
  afterTrainingEnabled?: boolean;
  playerId?: string | null;
  teamId?: string | null;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  categoryIds?: string[];
  reminder?: number;
  videoUrl?: string | null;
  afterTrainingEnabled?: boolean;
}

export const taskService = {
  /* ======================================================
     CREATE (P8 – autoriseret entry point)
     ====================================================== */
  async createTask(data: CreateTaskData): Promise<Task> {
    console.log('[P8] createTask called', data);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      throw new Error('No authenticated user');
    }

    /* ----------------------------------
       1. Insert task template
       ---------------------------------- */
    const { data: template, error: templateError } = await supabase
      .from('task_templates')
      .insert({
        user_id: user.id,
        title: data.title,
        description: data.description ?? '',
        reminder_minutes: data.reminder ?? null,
        video_url: data.videoUrl ?? null,
        after_training_enabled: data.afterTrainingEnabled ?? false,

        // admin-scope
        player_id: data.playerId ?? null,
        team_id: data.teamId ?? null,
      })
      .select('id, title, description, reminder_minutes, video_url, source_folder')
      .single();

    if (templateError) {
      throw templateError;
    }

    /* ----------------------------------
       2. Insert category relations
       ---------------------------------- */
    if (data.categoryIds?.length) {
      const rows = data.categoryIds.map(categoryId => ({
        task_template_id: template.id,
        category_id: categoryId,
      }));

      const { error: categoryError } = await supabase
        .from('task_template_categories')
        .insert(rows);

      if (categoryError) {
        throw categoryError;
      }
    }

    // Return the created task in the expected format
    return {
      id: template.id,
      title: template.title,
      description: template.description || '',
      completed: false,
      isTemplate: true,
      categoryIds: data.categoryIds || [],
      reminder: template.reminder_minutes ?? undefined,
      subtasks: [],
      videoUrl: template.video_url ?? undefined,
      source_folder: template.source_folder ?? undefined,
      afterTrainingEnabled: template.after_training_enabled ?? false,
    };
  },

  /* ======================================================
     UPDATE (bruges af aktiviteter – ikke Tasks-skærmen)
     ====================================================== */
  async updateTask(
    taskId: string,
    userId: string,
    updates: UpdateTaskData,
  ): Promise<void> {
    const updateData: Record<string, any> = {};

    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.reminder !== undefined) updateData.reminder_minutes = updates.reminder;

    if ('videoUrl' in updates) {
      updateData.video_url = updates.videoUrl ?? null;
    }

    if (updates.afterTrainingEnabled !== undefined) {
      updateData.after_training_enabled = updates.afterTrainingEnabled;
    }

    updateData.updated_at = new Date().toISOString();

    const { error: templateError } = await supabase
      .from('task_templates')
      .update(updateData)
      .eq('id', taskId)
      .eq('user_id', userId);

    if (templateError) {
      throw templateError;
    }

    /* ----------------------------------
       Categories (replace-all strategy)
       ---------------------------------- */
    if (updates.categoryIds) {
      await supabase
        .from('task_template_categories')
        .delete()
        .eq('task_template_id', taskId);

      if (updates.categoryIds.length) {
        const rows = updates.categoryIds.map(categoryId => ({
          task_template_id: taskId,
          category_id: categoryId,
        }));

        const { error } = await supabase
          .from('task_template_categories')
          .insert(rows);

        if (error) throw error;
      }
    }
  },

  /* ======================================================
     DELETE
     ====================================================== */
  async getHiddenTaskTemplateIds(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('hidden_task_templates')
      .select('task_template_id')
      .eq('user_id', userId);

    if (error) {
      throw error;
    }

    return (data || []).map(d => d.task_template_id);
  },

  async deleteTask(taskId: string, userId: string): Promise<void> {
    // Try hard delete for owned tasks
    const { data: deleted, error: deleteError } = await supabase
      .from('task_templates')
      .delete()
      .eq('id', taskId)
      .eq('user_id', userId)
      .select('id');

    if (deleteError) {
      throw deleteError;
    }

    if (deleted?.length) {
      // Successfully hard deleted
      return;
    }

    // Not owned, perform soft delete
    const { error: insertError } = await supabase
      .from('hidden_task_templates')
      .upsert({ user_id: userId, task_template_id: taskId }, { onConflict: 'user_id,task_template_id' });

    if (insertError) {
      throw insertError;
    }
  },
};
