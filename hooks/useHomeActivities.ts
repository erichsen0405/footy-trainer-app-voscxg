
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { fetchActivities, createActivity } from '@/services/activities';

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

  const loadActivities = useCallback(
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

        const data = await fetchActivities(clubId, controller.signal);

        setActivities(data);
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
    loadActivities();
    return () => abortRef.current?.abort();
  }, [loadActivities]);

  const refresh = useCallback(() => {
    loadActivities(true);
  }, [loadActivities]);

  const createNewActivity = useCallback(
    async (payload: any) => {
      try {
        await createActivity({
          ...payload,
          club_id: clubId!,
          team_id: teamId,
          player_id: playerId,
        });

        loadActivities(true);
      } catch {
        Alert.alert('Fejl', 'Kunne ikke oprette aktivitet');
      }
    },
    [clubId, teamId, playerId, loadActivities]
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
    loadActivities(true);
  }, [pendingContextChange, loadActivities]);

  const dismissContextChange = useCallback(() => {
    setPendingContextChange(null);
  }, []);

  return {
    activities,
    isLoading,
    isRefreshing,
    refresh,
    createActivity: createNewActivity,
    pendingContextChange,
    requestContextChange,
    confirmContextChange,
    dismissContextChange,
  };
}
