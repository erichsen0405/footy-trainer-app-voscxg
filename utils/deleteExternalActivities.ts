
import { supabase } from '@/app/integrations/supabase/client';

/**
 * Delete all external activities for the current user
 * @returns Object with success status and count of deleted activities
 */
export async function deleteAllExternalActivities(): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return {
        success: false,
        count: 0,
        error: 'User not authenticated',
      };
    }

    console.log('🗑️ Deleting all external activities for user:', user.id);

    // First, count how many external activities exist
    const { count: activityCount, error: countError } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_external', true);

    if (countError) {
      console.error('❌ Error counting external activities:', countError);
      return {
        success: false,
        count: 0,
        error: countError.message,
      };
    }

    console.log(`📊 Found ${activityCount || 0} external activities to delete`);

    if (!activityCount || activityCount === 0) {
      return {
        success: true,
        count: 0,
      };
    }

    // Delete all external activities
    const { error: deleteError } = await supabase
      .from('activities')
      .delete()
      .eq('user_id', user.id)
      .eq('is_external', true);

    if (deleteError) {
      console.error('❌ Error deleting external activities:', deleteError);
      return {
        success: false,
        count: 0,
        error: deleteError.message,
      };
    }

    console.log(`✅ Successfully deleted ${activityCount} external activities`);

    return {
      success: true,
      count: activityCount,
    };
  } catch (error: any) {
    console.error('❌ Failed to delete external activities:', error);
    return {
      success: false,
      count: 0,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Delete all external activities for a specific external calendar
 * @param calendarId - The ID of the external calendar
 * @returns Object with success status and count of deleted activities
 */
export async function deleteExternalActivitiesForCalendar(calendarId: string): Promise<{
  success: boolean;
  count: number;
  error?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return {
        success: false,
        count: 0,
        error: 'User not authenticated',
      };
    }

    console.log('🗑️ Deleting external activities for calendar:', calendarId);

    // First, count how many activities exist for this calendar
    const { count: activityCount, error: countError } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('external_calendar_id', calendarId);

    if (countError) {
      console.error('❌ Error counting calendar activities:', countError);
      return {
        success: false,
        count: 0,
        error: countError.message,
      };
    }

    console.log(`📊 Found ${activityCount || 0} activities to delete for calendar`);

    if (!activityCount || activityCount === 0) {
      return {
        success: true,
        count: 0,
      };
    }

    // Delete all activities for this calendar
    const { error: deleteError } = await supabase
      .from('activities')
      .delete()
      .eq('user_id', user.id)
      .eq('external_calendar_id', calendarId);

    if (deleteError) {
      console.error('❌ Error deleting calendar activities:', deleteError);
      return {
        success: false,
        count: 0,
        error: deleteError.message,
      };
    }

    console.log(`✅ Successfully deleted ${activityCount} activities for calendar`);

    return {
      success: true,
      count: activityCount,
    };
  } catch (error: any) {
    console.error('❌ Failed to delete calendar activities:', error);
    return {
      success: false,
      count: 0,
      error: error.message || 'Unknown error',
    };
  }
}
