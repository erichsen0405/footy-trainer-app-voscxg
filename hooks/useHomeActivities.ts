
import { useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';
import { getActivities, getCategories, DatabaseActivity, DatabaseActivityCategory } from '@/services/activities';

interface ActivityWithCategory extends DatabaseActivity {
  category?: DatabaseActivityCategory | null;
}

interface UseHomeActivitiesResult {
  activities: ActivityWithCategory[];
  loading: boolean;
}

export function useHomeActivities(): UseHomeActivitiesResult {
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityWithCategory[]>([]);
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
      
      // 1. Fetch categories first
      const categoriesData = await getCategories(userId);
      console.log('[useHomeActivities] Categories fetched:', categoriesData?.length ?? 0);
      
      // Create a map for quick category lookup
      const categoryMap = new Map<string, DatabaseActivityCategory>();
      (categoriesData || []).forEach(cat => {
        categoryMap.set(cat.id, cat);
      });
      
      console.log('[useHomeActivities] Category map size:', categoryMap.size);
      
      // 2. Fetch internal activities
      const internalData = await getActivities(userId);
      console.log('[useHomeActivities] Internal activities:', internalData?.length ?? 0);
      
      // Mark internal activities with is_external: false and resolve category
      const internalActivities: ActivityWithCategory[] = (internalData || []).map(activity => {
        const resolvedCategory = activity.category_id ? categoryMap.get(activity.category_id) || null : null;
        
        return {
          ...activity,
          is_external: false,
          category: resolvedCategory,
        };
      });
      
      // 3. Fetch external calendar activities
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
      
      let externalActivities: ActivityWithCategory[] = [];
      
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
          
          // Map external events to activity format with resolved category
          externalActivities = eventsData.map(event => {
            const meta = metaData?.find(m => m.external_event_id === event.id);
            const categoryId = meta?.category_id || null;
            const resolvedCategory = categoryId ? categoryMap.get(categoryId) || null : null;
            
            return {
              id: meta?.id || event.id,
              user_id: userId,
              title: event.title,
              activity_date: event.start_date,
              activity_time: event.start_time || '12:00:00',
              location: event.location || '',
              category_id: categoryId,
              category: resolvedCategory,
              is_external: true,
              external_calendar_id: event.provider_calendar_id,
              external_event_id: event.provider_event_uid,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            } as ActivityWithCategory;
          });
        }
      }
      
      console.log('[useHomeActivities] External activities:', externalActivities.length);
      
      // 4. Merge internal and external activities
      const mergedActivities = [...internalActivities, ...externalActivities];
      console.log('[useHomeActivities] Total merged activities:', mergedActivities.length);
      console.log('[useHomeActivities] Activities with resolved category:', mergedActivities.filter(a => a.category).length);
      console.log('[useHomeActivities] Activities WITHOUT resolved category:', mergedActivities.filter(a => !a.category).length);
      
      // 🔍 DEBUG: Log all activities without resolved categories
      const activitiesWithoutCategory = mergedActivities.filter(a => !a.category);
      if (activitiesWithoutCategory.length > 0) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('⚠️ ACTIVITIES WITHOUT RESOLVED CATEGORY:');
        activitiesWithoutCategory.forEach(activity => {
          console.log(`  - Title: ${activity.title}`);
          console.log(`    ID: ${activity.id}`);
          console.log(`    Category ID: ${activity.category_id || 'NULL'}`);
          console.log(`    Is External: ${activity.is_external}`);
          console.log(`    Category exists in map: ${activity.category_id ? categoryMap.has(activity.category_id) : 'N/A'}`);
          console.log('  ---');
        });
        console.log('═══════════════════════════════════════════════════════');
      }
      
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
