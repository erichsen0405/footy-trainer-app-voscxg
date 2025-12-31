import { supabase } from '@/app/integrations/supabase/client';
import { Task } from '@/types';

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
  async deleteTask(taskId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from('task_templates')
      .delete()
      .eq('id', taskId)
      .eq('user_id', userId);

    if (error) {
      throw error;
    }
  },
};
