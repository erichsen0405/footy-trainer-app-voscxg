/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { supabase } from '@/integrations/supabase/client';
import { ExternalCalendar } from '@/types';

export const calendarService = {
  async addExternalCalendar(userId: string, name: string, icsUrl: string, enabled: boolean = true, signal?: AbortSignal): Promise<ExternalCalendar> {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      throw new Error('No active session. Please log in again.');
    }

    const { data, error } = await supabase
      .from('external_calendars')
      .insert({
        user_id: userId,
        name,
        ics_url: icsUrl,
        enabled,
      })
      .select()
      .abortSignal(signal)
      .single();

    if (error) throw error;

    return {
      id: data.id,
      name: data.name,
      icsUrl: data.ics_url,
      enabled: data.enabled,
      lastFetched: data.last_fetched ? new Date(data.last_fetched) : undefined,
      eventCount: data.event_count || 0,
    };
  },

  async toggleCalendar(calendarId: string, userId: string, newEnabled: boolean, signal?: AbortSignal): Promise<void> {
    const { error } = await supabase
      .from('external_calendars')
      .update({ enabled: newEnabled })
      .eq('id', calendarId)
      .eq('user_id', userId)
      .abortSignal(signal);

    if (error) throw error;
  },

  async deleteExternalCalendar(calendarId: string, userId: string, signal?: AbortSignal): Promise<void> {
    const nowIso = new Date().toISOString();
    const { error: eventsError } = await supabase
      .from('events_external')
      .update({
        deleted: true,
        deleted_at: nowIso,
        deleted_at_reason: 'user-delete',
        updated_at: nowIso,
        provider_calendar_id: null,
      })
      .eq('provider_calendar_id', calendarId)
      .abortSignal(signal);

    if (eventsError) throw eventsError;

    const { error } = await supabase
      .from('external_calendars')
      .delete()
      .eq('id', calendarId)
      .eq('user_id', userId)
      .abortSignal(signal);

    if (error) throw error;
  },

  async syncCalendar(calendarId: string, signal?: AbortSignal): Promise<{ eventCount: number }> {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      throw new Error('No active session');
    }

    const { data, error } = await supabase.functions.invoke('sync-external-calendar-v4', {
      body: { calendarId }
    });

    if (error) throw error;

    const { error: updateError } = await supabase
      .from('external_calendars')
      .update({ 
        last_fetched: new Date().toISOString(),
        event_count: data?.eventCount || 0
      })
      .eq('id', calendarId)
      .abortSignal(signal);

    if (updateError) console.error('Error updating calendar:', updateError);

    return { eventCount: data?.eventCount || 0 };
  },
};


