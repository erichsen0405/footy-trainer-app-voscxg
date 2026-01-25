
import { supabase } from '@/integrations/supabase/client';

/**
 * Delete all duplicate "test" tasks from "træning" activities
 * This is an admin-only function
 */
export async function deleteTestTasksFromTraening(): Promise<{
  success: boolean;
  deletedCount: number;
  error?: string;
}> {
  try {
    console.log('🧹 Starting cleanup of "test" tasks from "træning" activities...');

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error('User not authenticated:', userError);
      return { success: false, deletedCount: 0, error: 'User not authenticated' };
    }

    // First, find all "træning" category IDs for this user
    const { data: traeningCategories, error: categoryError } = await supabase
      .from('activity_categories')
      .select('id')
      .eq('user_id', user.id)
      .ilike('name', 'træning');

    if (categoryError) {
      console.error('Error fetching træning categories:', categoryError);
      return { success: false, deletedCount: 0, error: categoryError.message };
    }

    if (!traeningCategories || traeningCategories.length === 0) {
      console.log('No "træning" categories found');
      return { success: true, deletedCount: 0 };
    }

    const categoryIds = traeningCategories.map(cat => cat.id);
    console.log(`Found ${categoryIds.length} "træning" categories`);

    // Find all activities with these categories
    const { data: traeningActivities, error: activitiesError } = await supabase
      .from('activities')
      .select('id')
      .eq('user_id', user.id)
      .in('category_id', categoryIds);

    if (activitiesError) {
      console.error('Error fetching træning activities:', activitiesError);
      return { success: false, deletedCount: 0, error: activitiesError.message };
    }

    if (!traeningActivities || traeningActivities.length === 0) {
      console.log('No "træning" activities found');
      return { success: true, deletedCount: 0 };
    }

    const activityIds = traeningActivities.map(act => act.id);
    console.log(`Found ${activityIds.length} "træning" activities`);

    // Find all "test" tasks in these activities
    const { data: testTasks, error: tasksError } = await supabase
      .from('activity_tasks')
      .select('id, title, activity_id')
      .in('activity_id', activityIds)
      .ilike('title', 'test');

    if (tasksError) {
      console.error('Error fetching test tasks:', tasksError);
      return { success: false, deletedCount: 0, error: tasksError.message };
    }

    if (!testTasks || testTasks.length === 0) {
      console.log('No "test" tasks found in "træning" activities');
      return { success: true, deletedCount: 0 };
    }

    console.log(`Found ${testTasks.length} "test" tasks to delete`);

    // Delete all these tasks
    const taskIds = testTasks.map(task => task.id);
    const { error: deleteError } = await supabase
      .from('activity_tasks')
      .delete()
      .in('id', taskIds);

    if (deleteError) {
      console.error('Error deleting test tasks:', deleteError);
      return { success: false, deletedCount: 0, error: deleteError.message };
    }

    console.log(`✅ Successfully deleted ${testTasks.length} "test" tasks from "træning" activities`);
    return { success: true, deletedCount: testTasks.length };
  } catch (error: any) {
    console.error('Unexpected error during cleanup:', error);
    return { success: false, deletedCount: 0, error: error?.message || 'Unknown error' };
  }
}
