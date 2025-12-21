
import { supabase } from '@/app/integrations/supabase/client';

export interface Activity {
  id: string;
  title: string;
  description?: string;
  club_id: string;
  team_id?: string;
  player_id?: string;
  created_at: string;
}

/**
 * Hent aktiviteter
 * - Abort-safe
 * - Sorteret korrekt
 * - Klar til production
 */
export async function fetchActivities(
  clubId: string,
  signal?: AbortSignal
): Promise<Activity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('club_id', clubId)
    .order('created_at', { ascending: false })
    .abortSignal(signal);

  if (error) {
    throw error;
  }

  return data ?? [];
}

/**
 * Opret aktivitet
 * - Ingen side effects
 * - Caller bestemmer refetch
 */
export async function createActivity(payload: {
  title: string;
  description?: string;
  club_id: string;
  team_id?: string;
  player_id?: string;
}) {
  const { error } = await supabase.from('activities').insert(payload);

  if (error) {
    throw error;
  }
}

/**
 * Slet aktivitet (forberedt til senere brug)
 */
export async function deleteActivity(
  activityId: string,
  signal?: AbortSignal
) {
  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId)
    .abortSignal(signal);

  if (error) {
    throw error;
  }
}
