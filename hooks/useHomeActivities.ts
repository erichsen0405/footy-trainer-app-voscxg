
import { useEffect, useState, useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { format, isToday, startOfWeek, endOfWeek } from 'date-fns';
import { da } from 'date-fns/locale';
import { supabase } from '@/app/integrations/supabase/client';
import { getActivities, getCategories, DatabaseActivity, DatabaseActivityCategory } from '@/services/activities';

interface WeekGroup {
  weekKey: string;
  label: string;
  items: DatabaseActivity[];
}

interface UseHomeActivitiesResult {
  today: DatabaseActivity[];
  upcomingByWeek: WeekGroup[];
  isLoading: boolean;
  activities: DatabaseActivity[];
  activitiesSafe: DatabaseActivity[];
  categories: DatabaseActivityCategory[];
  loading: boolean;
  refetchActivities: () => Promise<void>;
  refetchCategories: () => Promise<void>;
}

export function useHomeActivities(): UseHomeActivitiesResult {
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<DatabaseActivity[]>([]);
  const [categories, setCategories] = useState<DatabaseActivityCategory[]>([]);
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
        // Get external event metadata for this user
        const { data: metaData, error: metaError } = await supabase
          .from('events_local_meta')
          .select('id, external_event_id, category_id, user_id')
          .eq('user_id', userId);
        
        if (metaError) {
          console.error('[useHomeActivities] Error fetching external event metadata:', metaError);
        } else if (metaData && metaData.length > 0) {
          console.log('[useHomeActivities] External event metadata:', metaData.length);
          
          const externalEventIds = metaData.map(m => m.external_event_id).filter(Boolean);
          
          if (externalEventIds.length > 0) {
            // Fetch the actual external events
            const { data: eventsData, error: eventsError } = await supabase
              .from('events_external')
              .select('id, title, start_date, start_time, location, provider_calendar_id, provider_event_uid')
              .in('id', externalEventIds)
              .in('provider_calendar_id', calendarIds)
              .eq('deleted', false);
            
            if (eventsError) {
              console.error('[useHomeActivities] Error fetching external events:', eventsError);
            } else if (eventsData) {
              console.log('[useHomeActivities] External events:', eventsData.length);
              
              // Combine external events with their metadata
              externalActivities = eventsData.map(event => {
                const meta = metaData.find(m => m.external_event_id === event.id);
                
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

  const refetchCategories = useCallback(async () => {
    if (!userId) {
      setCategories([]);
      return;
    }

    try {
      const data = await getCategories(userId);
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch categories:', err);
      setCategories([]);
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
        await Promise.all([
          refetchActivities(),
          refetchCategories(),
        ]);
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
  }, [userId, refetchActivities, refetchCategories]);

  // Process activities into today and upcoming by week
  const { today, upcomingByWeek } = useMemo(() => {
    const todayActivities: DatabaseActivity[] = [];
    const weekGroups: Record<string, DatabaseActivity[]> = {};

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');

    activities.forEach((activity) => {
      if (!activity.activity_date) return;

      const activityDate = new Date(activity.activity_date);
      
      // Check if today
      if (activity.activity_date === todayStr || isToday(activityDate)) {
        todayActivities.push(activity);
      } else if (activityDate > now) {
        // Group by week
        const weekStart = startOfWeek(activityDate, { locale: da });
        const weekKey = format(weekStart, 'yyyy-MM-dd');
        
        if (!weekGroups[weekKey]) {
          weekGroups[weekKey] = [];
        }
        weekGroups[weekKey].push(activity);
      }
    });

    // Sort today activities by time
    todayActivities.sort((a, b) => {
      if (!a.activity_time || !b.activity_time) return 0;
      return a.activity_time.localeCompare(b.activity_time);
    });

    // Convert week groups to array and sort
    const weekKeys = Object.keys(weekGroups).sort();
    const upcomingWeeks: WeekGroup[] = weekKeys.map((weekKey) => {
      const weekStart = new Date(weekKey);
      const weekEnd = endOfWeek(weekStart, { locale: da });
      
      const label = `${format(weekStart, 'd. MMM', { locale: da })} - ${format(weekEnd, 'd. MMM', { locale: da })}`;
      
      const items = weekGroups[weekKey].sort((a, b) => {
        if (!a.activity_date || !b.activity_date) return 0;
        const dateCompare = a.activity_date.localeCompare(b.activity_date);
        if (dateCompare !== 0) return dateCompare;
        if (!a.activity_time || !b.activity_time) return 0;
        return a.activity_time.localeCompare(b.activity_time);
      });

      return {
        weekKey,
        label,
        items,
      };
    });

    return {
      today: todayActivities,
      upcomingByWeek: upcomingWeeks,
    };
  }, [activities]);

  return {
    today,
    upcomingByWeek,
    isLoading: loading,
    activities,
    activitiesSafe: activities,
    categories,
    loading,
    refetchActivities,
    refetchCategories,
  };
}
