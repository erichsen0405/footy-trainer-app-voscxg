
import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';
import { getActivities, getCategories, DatabaseActivity, DatabaseActivityCategory } from '@/services/activities';

interface UseHomeActivitiesResult {
  activities: DatabaseActivity[];
  loading: boolean;
}

export function useHomeActivities(): UseHomeActivitiesResult {
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<DatabaseActivity[]>([]);
  const [loading, setLoading] = useState(true);

  // Get user ID
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        const isWeb = Platform.OS === 'web';

        if (!user) {
          // 🔐 Programkritisk: ingen bruger = ingen aktiviteter
          // 🌐 Web preview må ikke crashe før auth er klar
          setActivities([]);
          setLoading(false);
          return;
        }

        setUserId(user.id);
      } catch (err) {
        console.error('Failed to fetch user:', err);
        setActivities([]);
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const refetchActivities = useCallback(async () => {
    if (!userId) {
      setActivities([]);
      return;
    }

    try {
      console.log('[useHomeActivities] Fetching activities for user:', userId);
      
      // 1. Fetch internal activities
      const internalData = await getActivities(userId);
      console.log('[useHomeActivities] Internal activities:', internalData?.length ?? 0);
      
      // Mark internal activities with is_external: false
      const internalActivities = (internalData || []).map(activity => ({
        ...activity,
        is_external: false,
      }));
      
      // 2. Fetch external calendar activities
      // First, get the user's external calendars
      const { data: calendarsData, error: calendarsError } = await supabase
        .from('external_calendars')
        .select('id')
        .eq('user_id', userId)
        .eq('enabled', true);
      
      if (calendarsError) {
        console.error('[useHomeActivities] Error fetching calendars:', calendarsError);
      }
      
      const calendarIds = calendarsData?.map(c => c.id) || [];
      console.log('[useHomeActivities] Found enabled calendars:', calendarIds.length);
      
      let externalActivities: DatabaseActivity[] = [];
      
      if (calendarIds.length > 0) {
        // Fetch all external events from enabled calendars
        const { data: eventsData, error: eventsError } = await supabase
          .from('events_external')
          .select('id, title, start_date, start_time, location, provider_calendar_id, provider_event_uid')
          .in('provider_calendar_id', calendarIds)
          .eq('deleted', false);
        
        if (eventsError) {
          console.error('[useHomeActivities] Error fetching external events:', eventsError);
        } else if (eventsData) {
          console.log('[useHomeActivities] External events found:', eventsData.length);
          
          // Get metadata for these events (if any)
          const externalEventIds = eventsData.map(e => e.id);
          const { data: metaData, error: metaError } = await supabase
            .from('events_local_meta')
            .select('id, external_event_id, category_id, user_id')
            .eq('user_id', userId)
            .in('external_event_id', externalEventIds);
          
          if (metaError) {
            console.error('[useHomeActivities] Error fetching external event metadata:', metaError);
          }
          
          // Map external events to activity format
          externalActivities = eventsData.map(event => {
            const meta = metaData?.find(m => m.external_event_id === event.id);
            
            return {
              id: meta?.id || event.id,
              user_id: userId,
              title: event.title,
              activity_date: event.start_date,
              activity_time: event.start_time || '12:00:00',
              location: event.location || '',
              category_id: meta?.category_id || null,
              is_external: true,
              external_calendar_id: event.provider_calendar_id,
              external_event_id: event.provider_event_uid,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as DatabaseActivity;
          });
        }
      }
      
      console.log('[useHomeActivities] External activities:', externalActivities.length);
      
      // 3. Merge internal and external activities
      const mergedActivities = [...internalActivities, ...externalActivities];
      console.log('[useHomeActivities] Total merged activities:', mergedActivities.length);
      console.log('[useHomeActivities] Activities with is_external=true:', mergedActivities.filter(a => a.is_external).length);
      console.log('[useHomeActivities] Activities with is_external=false:', mergedActivities.filter(a => !a.is_external).length);
      
      setActivities(mergedActivities);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
      setActivities([]);
    }
  }, [userId]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!userId) {
        setLoading(false);
        return;
      }

      try {
        await refetchActivities();
      } catch (err) {
        console.error('Failed to load home activities:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [userId, refetchActivities]);

  return {
    activities,
    loading,
  };
}
