
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/app/integrations/supabase/client';

interface Params {
  clubId?: string;
  teamId?: string;
  playerId?: string;
}

export function useHomeActivities({
  clubId,
  teamId,
  playerId,
}: Params) {
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [pendingContextChange, setPendingContextChange] =
    useState<Params | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const fetchActivities = useCallback(
    async (refresh = false) => {
      if (!clubId) {
        setActivities([]);
        setIsLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (refresh) setIsRefreshing(true);

        const { data, error } = await supabase
          .from('activities')
          .select('*')
          .eq('club_id', clubId)
          .abortSignal(controller.signal)
          .order('created_at', { ascending: false });

        if (error) throw error;

        setActivities(data ?? []);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          Alert.alert('Fejl', 'Kunne ikke hente aktiviteter');
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [clubId]
  );

  useEffect(() => {
    fetchActivities();
    return () => abortRef.current?.abort();
  }, [fetchActivities]);

  const refresh = useCallback(() => {
    fetchActivities(true);
  }, [fetchActivities]);

  const createActivity = useCallback(
    async (payload: any) => {
      try {
        const { error } = await supabase.from('activities').insert({
          ...payload,
          club_id: clubId,
          team_id: teamId,
          player_id: playerId,
        });

        if (error) throw error;

        fetchActivities(true);
      } catch {
        Alert.alert('Fejl', 'Kunne ikke oprette aktivitet');
      }
    },
    [clubId, teamId, playerId, fetchActivities]
  );

  const requestContextChange = useCallback(
    (next: Params) => {
      setPendingContextChange(next);
    },
    []
  );

  const confirmContextChange = useCallback(() => {
    if (!pendingContextChange) return;
    setPendingContextChange(null);
    fetchActivities(true);
  }, [pendingContextChange, fetchActivities]);

  const dismissContextChange = useCallback(() => {
    setPendingContextChange(null);
  }, []);

  return {
    activities,
    isLoading,
    isRefreshing,
    refresh,
    createActivity,
    pendingContextChange,
    requestContextChange,
    confirmContextChange,
    dismissContextChange,
  };
}
