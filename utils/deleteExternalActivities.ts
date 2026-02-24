
import { supabase } from '@/integrations/supabase/client';

function isMissingDeletedAtReasonColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  const message = String((error as { message?: unknown }).message ?? '');
  return code === 'PGRST204' && message.includes("'deleted_at_reason'") && message.includes("'events_external'");
}

async function softDeleteEventsExternal(
  nowIso: string,
  applyFilter: (query: any) => any,
  withSelectIds: boolean,
) {
  const payloadWithReason = {
    deleted: true,
    deleted_at: nowIso,
    deleted_at_reason: 'user-delete',
    updated_at: nowIso,
  };

  let query = applyFilter(supabase.from('events_external').update(payloadWithReason));
  if (withSelectIds) {
    query = query.select('id');
  }

  let result = await query;
  if (!isMissingDeletedAtReasonColumn(result?.error)) {
    return result;
  }

  console.warn('⚠️ events_external.deleted_at_reason missing in schema; retrying soft delete without reason');

  const payloadWithoutReason = {
    deleted: true,
    deleted_at: nowIso,
    updated_at: nowIso,
  };

  query = applyFilter(supabase.from('events_external').update(payloadWithoutReason));
  if (withSelectIds) {
    query = query.select('id');
  }

  result = await query;
  return result;
}

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

    // Fetch all calendars (enabled or disabled) so we delete everything external
    const { data: calendars, error: calendarError } = await supabase
      .from('external_calendars')
      .select('id')
      .eq('user_id', user.id);

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
    console.log(`📅 Calendars targeted: ${details.targetedCalendarCount}`);

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
        const nowIso = new Date().toISOString();
        const { data: softDeletedEvents, error: eventsDeleteError } = await softDeleteEventsExternal(
          nowIso,
          (query) => query.in('id', externalEventIds),
          true,
        );

        if (eventsDeleteError) {
          console.error('❌ Error soft deleting events_external rows:', eventsDeleteError);
          return {
            success: false,
            count: 0,
            error: eventsDeleteError.message,
          };
        }

        details.externalEventsDeleted = softDeletedEvents?.length ?? 0;
        console.log(`✅ Soft deleted ${details.externalEventsDeleted} events_external rows`);
      }
    }

    // Legacy fallback for activity rows that still live in the old table
    // We no longer delete legacy external activities to preserve completed task/history data.
    details.legacyActivitiesDeleted = 0;
    console.log('ℹ️ Skipping legacy external activity deletion to preserve completion history');

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

    const nowIso = new Date().toISOString();
    let externalEventId: string | null = null;
    let externalEventUid: string | null = null;

    // Try resolving by local meta ID first (most common on UI)
    const { data: metaRow, error: metaError } = await supabase
      .from('events_local_meta')
      .select('id, external_event_id, external_event_uid')
      .eq('id', activityId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (metaError) {
      console.warn('⚠️ Error checking events_local_meta:', metaError);
    }

    if (metaRow?.external_event_id) {
      externalEventId = String(metaRow.external_event_id);
    }
    if ((metaRow as any)?.external_event_uid) {
      externalEventUid = String((metaRow as any).external_event_uid);
    }

    // If not found, try resolving by external event row id
    if (!externalEventId) {
      const { data: metaByEventId, error: metaByEventError } = await supabase
        .from('events_local_meta')
        .select('id, external_event_uid')
        .eq('external_event_id', activityId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (metaByEventError) {
        console.warn('⚠️ Error checking events_local_meta by external_event_id:', metaByEventError);
      }

      if (metaByEventId?.id) {
        externalEventId = String(activityId);
        if ((metaByEventId as any)?.external_event_uid) {
          externalEventUid = String((metaByEventId as any).external_event_uid);
        }
      }
    }

    // Fallback: verify ownership via calendar on events_external
    if (!externalEventId) {
      const { data: eventRow, error: eventError } = await supabase
        .from('events_external')
        .select('id, provider_calendar_id, provider_event_uid')
        .eq('id', activityId)
        .single();

      if (!eventError && eventRow?.provider_calendar_id) {
        const { data: calendarRow, error: calendarError } = await supabase
          .from('external_calendars')
          .select('id')
          .eq('id', eventRow.provider_calendar_id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (!calendarError && calendarRow?.id) {
          externalEventId = String(eventRow.id);
          if ((eventRow as any)?.provider_event_uid) {
            externalEventUid = String((eventRow as any).provider_event_uid);
          }
        }
      }
    }

    if (externalEventId) {
      const { data: eventById, error: eventByIdError } = await supabase
        .from('events_external')
        .select('id')
        .eq('id', externalEventId)
        .maybeSingle();

      if (eventByIdError) {
        console.error('❌ Error resolving external event id before delete:', eventByIdError);
        return {
          success: false,
          error: eventByIdError.message,
        };
      }

      if (eventById?.id) {
        const { data: softDeletedRowsById, error: softDeleteError } = await softDeleteEventsExternal(
          nowIso,
          (query) => query.eq('id', externalEventId),
          true,
        );

        if (softDeleteError) {
          console.error('❌ Error soft deleting external event:', softDeleteError);
          return {
            success: false,
            error: softDeleteError.message,
          };
        }

        if ((softDeletedRowsById?.length ?? 0) > 0) {
          console.log(`✅ Soft deleted external event ${externalEventId}`);
          return { success: true };
        }

        console.warn('⚠️ Soft delete by external event id updated 0 rows', {
          externalEventId,
        });
      }
    }

    if (externalEventUid) {
      const { data: ownedCalendars, error: ownedCalendarsError } = await supabase
        .from('external_calendars')
        .select('id')
        .eq('user_id', user.id);

      if (ownedCalendarsError) {
        console.error('❌ Error loading owned calendars for UID fallback:', ownedCalendarsError);
        return {
          success: false,
          error: ownedCalendarsError.message,
        };
      }

      const ownedCalendarIds = (ownedCalendars || []).map((row: any) => String(row.id)).filter(Boolean);
      if (ownedCalendarIds.length > 0) {
        const { data: eventsByUid, error: eventsByUidError } = await supabase
          .from('events_external')
          .select('id')
          .eq('provider_event_uid', externalEventUid)
          .in('provider_calendar_id', ownedCalendarIds);

        if (eventsByUidError) {
          console.error('❌ Error resolving external event by UID fallback:', eventsByUidError);
          return {
            success: false,
            error: eventsByUidError.message,
          };
        }

        const idsByUid = (eventsByUid || []).map((row: any) => String(row.id)).filter(Boolean);
        if (idsByUid.length > 0) {
          const { data: softDeletedRowsByUid, error: softDeleteByUidError } = await softDeleteEventsExternal(
            nowIso,
            (query) => query.in('id', idsByUid),
            true,
          );

          if (softDeleteByUidError) {
            console.error('❌ Error soft deleting external event by UID fallback:', softDeleteByUidError);
            return {
              success: false,
              error: softDeleteByUidError.message,
            };
          }

          if ((softDeletedRowsByUid?.length ?? 0) > 0) {
            console.log(`✅ Soft deleted external event(s) by UID ${externalEventUid}`);
            return { success: true };
          }
        }
      }
    }

    if (externalEventId || externalEventUid) {
      console.error('❌ Resolved external event identity but soft delete updated 0 rows', {
        externalEventId,
        externalEventUid,
      });
      return {
        success: false,
        error: 'Kunne ikke soft-delete ekstern aktivitet (ingen rækker blev opdateret)',
      };
    }

    // Legacy fallback for old external activities
    const { data: activity, error: fetchError } = await supabase
      .from('activities')
      .select('id, is_external, user_id, intensity')
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

    const [completedTasksRes, feedbackRes] = await Promise.all([
      supabase
        .from('activity_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', activityId)
        .eq('completed', true),
      supabase
        .from('task_template_self_feedback')
        .select('id', { count: 'exact', head: true })
        .eq('activity_id', activityId),
    ]);

    const hasCompletedTasks = (completedTasksRes.count ?? 0) > 0;
    const hasFeedback = (feedbackRes.count ?? 0) > 0;
    const hasIntensity = activity.intensity !== null;

    if (hasCompletedTasks || hasFeedback || hasIntensity) {
      console.warn('⚠️ Skipping legacy external activity deletion to preserve completed history.');
      return {
        success: false,
        error: 'Aktiviteten kan ikke slettes, fordi den indeholder gennemført data.',
      };
    }

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

    console.log(`✅ Successfully deleted legacy external activity ${activityId}`);

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

    const { data: calendarRow, error: calendarError } = await supabase
      .from('external_calendars')
      .select('id')
      .eq('id', calendarId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (calendarError || !calendarRow?.id) {
      console.error('❌ Calendar not found or access denied:', calendarError);
      return {
        success: false,
        count: 0,
        error: 'Calendar not found or access denied',
      };
    }

    const nowIso = new Date().toISOString();
    const { data: softDeletedEvents, error: deleteError } = await softDeleteEventsExternal(
      nowIso,
      (query) => query.eq('provider_calendar_id', calendarId),
      true,
    );

    if (deleteError) {
      console.error('❌ Error soft deleting calendar events:', deleteError);
      return {
        success: false,
        count: 0,
        error: deleteError.message,
      };
    }

    const deletedCount = softDeletedEvents?.length ?? 0;
    console.log(`✅ Soft deleted ${deletedCount} events for calendar`);

    return {
      success: true,
      count: deletedCount,
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
