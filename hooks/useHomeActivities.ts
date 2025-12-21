
import { useEffect, useState, useCallback } from 'react';
import { ActivityCategory, Activity } from '@/types';
import { supabase } from '@/app/integrations/supabase/client';
import { getActivities, getCategories } from '@/services/activities';

interface UseHomeActivitiesResult {
  activities: Activity[];
  categories: ActivityCategory[];
  loading: boolean;
  refetchActivities: () => Promise<void>;
  refetchCategories: () => Promise<void>;
}

export function useHomeActivities(): UseHomeActivitiesResult {
  const [clubId, setClubId] = useState<string | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Get user and club ID
  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // For now, use user ID as club ID
        // This can be extended to fetch actual club_id from profiles table
        setClubId(user.id);
      }
    };
    fetchUser();
  }, []);

  const refetchActivities = useCallback(async () => {
    if (!clubId) {
      setActivities([]);
      return;
    }

    try {
      const data = await getActivities(clubId);
      setActivities(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch activities', err);
      setActivities([]);
    }
  }, [clubId]);

  const refetchCategories = useCallback(async () => {
    if (!clubId) {
      setCategories([]);
      return;
    }

    try {
      const data = await getCategories(clubId);
      setCategories(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch categories', err);
      setCategories([]);
    }
  }, [clubId]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!clubId) {
        setLoading(false);
        return;
      }

      try {
        await Promise.all([
          refetchActivities(),
          refetchCategories(),
        ]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [clubId, refetchActivities, refetchCategories]);

  return {
    activities,
    categories,
    loading,
    refetchActivities,
    refetchCategories,
  };
}
