
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
      const data = await getActivities(userId);
      setActivities(Array.isArray(data) ? data : []);
      
      // 🧪 Midlertidig debug
      console.log('[useHomeActivities]', {
        userId: userId,
        activitiesCount: data?.length ?? 0,
      });
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
      if (!activity.date) return;

      const activityDate = new Date(activity.date);
      
      // Check if today
      if (activity.date === todayStr || isToday(activityDate)) {
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
      if (!a.start_time || !b.start_time) return 0;
      return a.start_time.localeCompare(b.start_time);
    });

    // Convert week groups to array and sort
    const weekKeys = Object.keys(weekGroups).sort();
    const upcomingWeeks: WeekGroup[] = weekKeys.map((weekKey) => {
      const weekStart = new Date(weekKey);
      const weekEnd = endOfWeek(weekStart, { locale: da });
      
      const label = `${format(weekStart, 'd. MMM', { locale: da })} - ${format(weekEnd, 'd. MMM', { locale: da })}`;
      
      const items = weekGroups[weekKey].sort((a, b) => {
        if (!a.date || !b.date) return 0;
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        if (!a.start_time || !b.start_time) return 0;
        return a.start_time.localeCompare(b.start_time);
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
    categories,
    loading,
    refetchActivities,
    refetchCategories,
  };
}
