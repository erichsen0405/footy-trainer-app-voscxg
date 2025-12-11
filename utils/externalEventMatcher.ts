
import { supabase } from '@/app/integrations/supabase/client';

export interface FetchedEvent {
  provider: string;
  provider_uid: string;
  dtstart_utc: string;
  summary: string;
  location?: string;
  external_last_modified?: string;
  raw_payload?: any;
}

export interface MatchResult {
  matched: boolean;
  external_event_id?: number;
  action: 'existing' | 'new' | 'updated';
  match_method?: 'provider_uid' | 'exact' | 'fuzzy';
}

/**
 * Match an external event using the new unstable UID matching logic.
 * This function calls the match-external-event Edge Function.
 */
export async function matchExternalEvent(event: FetchedEvent): Promise<MatchResult> {
  try {
    const { data, error } = await supabase.functions.invoke('match-external-event', {
      body: { event },
    });

    if (error) {
      console.error('Error matching external event:', error);
      throw error;
    }

    return data.result;
  } catch (error) {
    console.error('Exception in matchExternalEvent:', error);
    throw error;
  }
}

/**
 * Tokenize a string for fuzzy matching (client-side utility).
 */
export function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9\u00e6\u00f8\u00e5\s]/g, ' ')
    .trim();
  
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  return new Set(tokens);
}

/**
 * Calculate token overlap between two strings (client-side utility).
 */
export function calculateTokenOverlap(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}

/**
 * Check if two timestamps are within tolerance (client-side utility).
 */
export function isWithinTimeTolerance(
  dt1: string,
  dt2: string,
  toleranceMinutes: number = 15
): boolean {
  const date1 = new Date(dt1);
  const date2 = new Date(dt2);
  
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  const diffMinutes = diffMs / (1000 * 60);
  
  return diffMinutes <= toleranceMinutes;
}
