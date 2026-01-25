
import { supabase } from '@/integrations/supabase/client';

export interface FetchedEvent {
  provider: string;
  provider_uid: string;
  dtstart_utc: string;
  summary: string;
  location?: string;
  external_last_modified?: string;
  raw_payload?: any;
  provider_calendar_id?: string;
}

export interface MatchResult {
  matched: boolean;
  external_event_id?: number;
  action: 'existing' | 'new' | 'updated';
  match_method?: 'provider_uid' | 'exact' | 'fuzzy';
  confidence?: number;
}

/**
 * Match an external event using the new unstable UID matching logic.
 * This function calls the match-external-event Edge Function.
 * 
 * The matching logic follows the Python implementation from:
 * https://docs.google.com/document/d/1bihJqUW4eFKsdHJECk9Tmj0iSReFV95I3yq6ER6D5Es/edit
 * 
 * Matching strategy (in order):
 * 1. Try provider_uid exact match via mappings table
 * 2. Try summary + dtstart exact match
 * 3. Try fuzzy match (token overlap + time tolerance)
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
 * Converts to lowercase, removes special chars except Danish letters (æ, ø, å).
 */
export function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9æøå\s]/g, ' ')
    .trim();
  
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  return new Set(tokens);
}

/**
 * Calculate Jaccard similarity (token overlap) between two strings.
 * Returns a value between 0 and 1, where 1 means identical token sets.
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
 * Check if two timestamps are within tolerance (default 15 minutes).
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

/**
 * Local matching function for client-side use (without database access).
 * This is useful for testing or preview purposes.
 * 
 * For production use, call matchExternalEvent() which uses the Edge Function.
 */
export function localFuzzyMatch(
  event1: { summary: string; dtstart_utc: string; location?: string },
  event2: { summary: string; dtstart_utc: string; location?: string },
  options: {
    overlapThreshold?: number;
    timeToleranceMinutes?: number;
  } = {}
): { matched: boolean; confidence: number } {
  const {
    overlapThreshold = 0.6,
    timeToleranceMinutes = 15,
  } = options;

  const summaryOverlap = calculateTokenOverlap(event1.summary, event2.summary);
  const locationOverlap = event1.location && event2.location
    ? calculateTokenOverlap(event1.location, event2.location)
    : 0;
  
  const withinTime = isWithinTimeTolerance(
    event1.dtstart_utc,
    event2.dtstart_utc,
    timeToleranceMinutes
  );

  // Combined score: summary overlap is most important
  const confidence = summaryOverlap * 0.7 + locationOverlap * 0.3;

  const matched = withinTime && summaryOverlap >= overlapThreshold;

  return { matched, confidence };
}
