import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  fetchPlayerProgramExperience,
  PlayerProgramExperience,
} from '@/services/trainingProgramService';

export function usePlayerProgramExperience(enabled = true) {
  const [experience, setExperience] = useState<PlayerProgramExperience | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (asRefresh = false) => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (asRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const result = await fetchPlayerProgramExperience();
      if (result.apiVersion !== 2) throw new Error('Unsupported player program response.');
      setExperience(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your program.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [enabled]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  return {
    experience,
    loading,
    refreshing,
    error,
    refresh: () => load(true),
  };
}
