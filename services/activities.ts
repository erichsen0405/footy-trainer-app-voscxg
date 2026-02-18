
import { supabase } from '@/integrations/supabase/client';

export interface DatabaseActivity {
  id: string;
  user_id: string;
  title: string;
  activity_date: string;
  activity_time: string;
  location?: string | null;
  category_id?: string | null;
  is_external: boolean;
  external_calendar_id?: string | null;
  external_event_id?: string | null;
  created_at: string;
  updated_at: string;
  series_id?: string | null;
  series_instance_date?: string | null;
  external_category?: string | null;
  manually_set_category?: boolean | null;
  category_updated_at?: string | null;
  team_id?: string | null;
  player_id?: string | null;
}

export interface DatabaseActivityCategory {
  id: string;
  user_id: string | null;
  name: string;
  color: string;
  emoji: string;
  created_at: string;
  updated_at: string;
  team_id?: string | null;
  player_id?: string | null;
  is_system?: boolean | null;
}

/**
 * Hent aktiviteter for en bruger
 * - Abort-safe
 * - Sorteret efter dato (nyeste først)
 */
export async function getActivities(
  userId: string,
  signal: AbortSignal = new AbortController().signal
): Promise<DatabaseActivity[]> {
  const { data, error } = await supabase
    .from('activities')
    .select('*')
    .eq('user_id', userId)
    .order('activity_date', { ascending: false })
    .abortSignal(signal);

  if (error) {
    console.error('Error fetching activities:', error);
    throw error;
  }

  return data ?? [];
}

/**
 * Hent kategorier for en bruger
 * - Abort-safe
 * - Sorteret alfabetisk
 */
export async function getCategories(
  userId: string,
  signal: AbortSignal = new AbortController().signal
): Promise<DatabaseActivityCategory[]> {
  const { data, error } = await supabase
    .from('activity_categories')
    .select('*')
    .or(`user_id.eq.${userId},is_system.eq.true`)
    .order('name', { ascending: true })
    .abortSignal(signal);

  if (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }

  return data ?? [];
}

/**
 * Opret aktivitet
 */
export async function createActivity(payload: {
  title: string;
  activity_date: string;
  activity_time: string;
  location?: string;
  user_id: string;
  category_id?: string;
  team_id?: string;
  player_id?: string;
}) {
  const { error } = await supabase.from('activities').insert(payload);

  if (error) {
    console.error('Error creating activity:', error);
    throw error;
  }
}

/**
 * Slet aktivitet
 */
export async function deleteActivity(
  activityId: string,
  signal: AbortSignal = new AbortController().signal
) {
  const { error } = await supabase
    .from('activities')
    .delete()
    .eq('id', activityId)
    .abortSignal(signal);

  if (error) {
    console.error('Error deleting activity:', error);
    throw error;
  }
}

// Legacy export for backward compatibility
export const fetchActivities = getActivities;

