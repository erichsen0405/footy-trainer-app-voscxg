
import { supabase } from '@/integrations/supabase/client';

/**
 * Delete all external activities for the current user
 * @returns Object with success status and count of deleted activities
 */
export async function deleteAllExternalActivities(): Promise<{
  success: boolean;
  count: number;
  error?: string;
  details?: {
    targetedCalendarCount: number;
    externalEventsDeleted: number;
    localMetaDeleted: number;
    legacyActivitiesDeleted: number;
  };
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

    const details = {
      targetedCalendarCount: 0,
      externalEventsDeleted: 0,
      localMetaDeleted: 0,
      legacyActivitiesDeleted: 0,
    };

    // Fetch enabled calendars so we only touch active sources
    const { data: calendars, error: calendarError } = await supabase
      .from('external_calendars')
      .select('id')
      .eq('user_id', user.id)
      .eq('enabled', true);

    if (calendarError) {
      console.error('❌ Error fetching active calendars:', calendarError);
      return {
        success: false,
        count: 0,
        error: calendarError.message,
      };
    }

    const calendarIds = calendars?.map((calendar) => calendar.id) ?? [];
    details.targetedCalendarCount = calendarIds.length;
    console.log(`📅 Active calendars targeted: ${details.targetedCalendarCount}`);

    let externalEventIds: string[] = [];

    if (calendarIds.length > 0) {
      const { data: externalEvents, error: eventsError } = await supabase
        .from('events_external')
        .select('id')
        .in('provider_calendar_id', calendarIds);

      if (eventsError) {
        console.error('❌ Error fetching external events to delete:', eventsError);
        return {
          success: false,
          count: 0,
          error: eventsError.message,
        };
      }

      externalEventIds = externalEvents?.map((event) => event.id) ?? [];
      console.log(`🧹 External events queued for deletion: ${externalEventIds.length}`);

      if (externalEventIds.length > 0) {
        // Delete metadata first to satisfy FK constraints and keep tasks in sync
        const { data: deletedMeta, error: metaDeleteError } = await supabase
          .from('events_local_meta')
          .delete()
          .in('external_event_id', externalEventIds)
          .eq('user_id', user.id)
          .select('id');

        if (metaDeleteError) {
          console.error('❌ Error deleting events_local_meta rows:', metaDeleteError);
          return {
            success: false,
            count: 0,
            error: metaDeleteError.message,
          };
        }

        details.localMetaDeleted = deletedMeta?.length ?? 0;
        console.log(`🧼 Deleted ${details.localMetaDeleted} events_local_meta rows`);

        const { data: deletedEvents, error: eventsDeleteError } = await supabase
          .from('events_external')
          .delete()
          .in('id', externalEventIds)
          .select('id');

        if (eventsDeleteError) {
          console.error('❌ Error deleting events_external rows:', eventsDeleteError);
          return {
            success: false,
            count: 0,
            error: eventsDeleteError.message,
          };
        }

        details.externalEventsDeleted = deletedEvents?.length ?? 0;
        console.log(`✅ Deleted ${details.externalEventsDeleted} events_external rows`);
      }
    }

    // Legacy fallback for activity rows that still live in the old table
    const { data: legacyDeleted, error: legacyError } = await supabase
      .from('activities')
      .delete()
      .eq('user_id', user.id)
      .eq('is_external', true)
      .select('id');

    if (legacyError) {
      console.error('❌ Error deleting legacy external activities:', legacyError);
      return {
        success: false,
        count: 0,
        error: legacyError.message,
      };
    }

    details.legacyActivitiesDeleted = legacyDeleted?.length ?? 0;
    console.log(`🧹 Deleted ${details.legacyActivitiesDeleted} legacy activities`);

    const totalCount = details.externalEventsDeleted + details.legacyActivitiesDeleted;

    return {
      success: true,
      count: totalCount,
      details,
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
 * Delete a single external activity by ID
 * @param activityId - The ID of the activity to delete
 * @returns Object with success status
 */
export async function deleteSingleExternalActivity(activityId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return {
        success: false,
        error: 'User not authenticated',
      };
    }

    console.log('🗑️ Deleting external activity:', activityId);

    // Verify the activity exists and belongs to the user
    const { data: activity, error: fetchError } = await supabase
      .from('activities')
      .select('id, is_external, user_id')
      .eq('id', activityId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !activity) {
      console.error('❌ Activity not found or access denied:', fetchError);
      return {
        success: false,
        error: 'Activity not found or access denied',
      };
    }

    if (!activity.is_external) {
      console.error('❌ Activity is not an external activity');
      return {
        success: false,
        error: 'This is not an external activity',
      };
    }

    // Delete the activity
    const { error: deleteError } = await supabase
      .from('activities')
      .delete()
      .eq('id', activityId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('❌ Error deleting activity:', deleteError);
      return {
        success: false,
        error: deleteError.message,
      };
    }

    console.log(`✅ Successfully deleted external activity ${activityId}`);

    return {
      success: true,
    };
  } catch (error: any) {
    console.error('❌ Failed to delete external activity:', error);
    return {
      success: false,
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
