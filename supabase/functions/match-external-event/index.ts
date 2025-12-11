
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchedEvent {
  provider: string;
  provider_uid: string;
  dtstart_utc: string;
  summary: string;
  location?: string;
  external_last_modified?: string;
  raw_payload?: any;
  provider_calendar_id?: string;
}

interface MatchResult {
  matched: boolean;
  external_event_id?: string;
  action: 'existing' | 'new' | 'updated';
  match_method?: 'provider_uid' | 'exact' | 'fuzzy';
  confidence?: number;
}

/**
 * Tokenize a string for fuzzy matching.
 * Converts to lowercase, removes special chars, splits on whitespace.
 */
function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9æøå\s]/g, ' ')
    .trim();
  
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  return new Set(tokens);
}

/**
 * Calculate Jaccard similarity (token overlap) between two strings.
 */
function calculateTokenOverlap(text1: string, text2: string): number {
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
function isWithinTimeTolerance(
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
 * Match an external event using the unstable UID matching logic.
 * 
 * Matching strategy (in order):
 * 1. Try provider_uid exact match via mappings table
 * 2. Try summary + dtstart exact match
 * 3. Try fuzzy match (token overlap + time tolerance)
 * 
 * This is the TypeScript implementation of the Python code from:
 * https://docs.google.com/document/d/1bihJqUW4eFKsdHJECk9Tmj0iSReFV95I3yq6ER6D5Es/edit
 */
async function matchEvent(
  supabaseClient: any,
  fetchedEvent: FetchedEvent
): Promise<MatchResult> {
  const provider = fetchedEvent.provider;
  const providerUid = fetchedEvent.provider_uid;
  const dtstart = fetchedEvent.dtstart_utc;
  const summary = fetchedEvent.summary;
  const location = fetchedEvent.location || '';
  const calendarId = fetchedEvent.provider_calendar_id;

  console.log(`\n🔍 Matching event: "${summary}"`);
  console.log(`   Provider: ${provider}`);
  console.log(`   UID: ${providerUid.substring(0, 40)}...`);
  console.log(`   Start: ${dtstart}`);

  // STEP 1: Try provider_uid match via mappings
  console.log('   Step 1: Checking provider_uid via mappings...');
  
  const { data: mapping } = await supabaseClient
    .from('external_event_mappings')
    .select('external_event_id')
    .eq('provider', provider)
    .eq('provider_uid', providerUid)
    .single();

  if (mapping) {
    console.log(`   ✅ MATCH via provider_uid (mapping found)`);
    return {
      matched: true,
      external_event_id: mapping.external_event_id,
      action: 'existing',
      match_method: 'provider_uid',
      confidence: 100,
    };
  }

  console.log('   ❌ No mapping found for provider_uid');

  // STEP 2: Try exact match on summary + dtstart
  console.log('   Step 2: Checking exact summary + dtstart match...');
  
  const { data: exactMatches } = await supabaseClient
    .from('external_events')
    .select('id, primary_provider_uid, summary, dtstart_utc')
    .eq('provider', provider)
    .eq('summary', summary)
    .eq('dtstart_utc', dtstart);

  if (exactMatches && exactMatches.length > 0) {
    const match = exactMatches[0];
    console.log(`   ✅ EXACT MATCH found (summary + dtstart)`);
    
    // Update mapping if provider_uid is different
    if (match.primary_provider_uid !== providerUid) {
      console.log(`   🔄 Updating mapping: old UID -> new UID`);
      
      await supabaseClient
        .from('external_event_mappings')
        .insert({
          external_event_id: match.id,
          provider: provider,
          provider_uid: providerUid,
        });
      
      // Update primary_provider_uid if needed
      await supabaseClient
        .from('external_events')
        .update({ primary_provider_uid: providerUid })
        .eq('id', match.id);
    }
    
    return {
      matched: true,
      external_event_id: match.id,
      action: 'existing',
      match_method: 'exact',
      confidence: 100,
    };
  }

  console.log('   ❌ No exact match found');

  // STEP 3: Try fuzzy match (token overlap + time tolerance)
  console.log('   Step 3: Attempting fuzzy match...');
  
  // Fetch candidates within time window (±30 minutes)
  const startWindow = new Date(new Date(dtstart).getTime() - 30 * 60 * 1000).toISOString();
  const endWindow = new Date(new Date(dtstart).getTime() + 30 * 60 * 1000).toISOString();
  
  const { data: candidates } = await supabaseClient
    .from('external_events')
    .select('id, primary_provider_uid, summary, dtstart_utc, location')
    .eq('provider', provider)
    .gte('dtstart_utc', startWindow)
    .lte('dtstart_utc', endWindow);

  if (!candidates || candidates.length === 0) {
    console.log('   ❌ No candidates in time window');
    console.log('   ➕ Creating NEW external event');
    return {
      matched: false,
      action: 'new',
    };
  }

  console.log(`   📋 Found ${candidates.length} candidates in time window`);

  // Calculate fuzzy scores
  const OVERLAP_THRESHOLD = 0.6;
  const TIME_TOLERANCE_MINUTES = 15;

  let bestMatch: any = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const summaryOverlap = calculateTokenOverlap(summary, candidate.summary);
    const locationOverlap = location && candidate.location 
      ? calculateTokenOverlap(location, candidate.location)
      : 0;
    
    const withinTime = isWithinTimeTolerance(
      dtstart,
      candidate.dtstart_utc,
      TIME_TOLERANCE_MINUTES
    );

    // Combined score: summary overlap is most important
    const score = summaryOverlap * 0.7 + locationOverlap * 0.3;

    console.log(`      Candidate: "${candidate.summary.substring(0, 40)}..."`);
    console.log(`         Summary overlap: ${(summaryOverlap * 100).toFixed(1)}%`);
    console.log(`         Location overlap: ${(locationOverlap * 100).toFixed(1)}%`);
    console.log(`         Within time: ${withinTime}`);
    console.log(`         Combined score: ${(score * 100).toFixed(1)}%`);

    if (withinTime && summaryOverlap >= OVERLAP_THRESHOLD && score > bestScore) {
      bestMatch = candidate;
      bestScore = score;
    }
  }

  if (bestMatch) {
    console.log(`   ✅ FUZZY MATCH found (confidence: ${(bestScore * 100).toFixed(1)}%)`);
    console.log(`      Matched to: "${bestMatch.summary}"`);
    
    // Create mapping for new provider_uid
    await supabaseClient
      .from('external_event_mappings')
      .insert({
        external_event_id: bestMatch.id,
        provider: provider,
        provider_uid: providerUid,
      });
    
    // Update primary_provider_uid if needed
    if (bestMatch.primary_provider_uid !== providerUid) {
      await supabaseClient
        .from('external_events')
        .update({ primary_provider_uid: providerUid })
        .eq('id', bestMatch.id);
    }
    
    return {
      matched: true,
      external_event_id: bestMatch.id,
      action: 'existing',
      match_method: 'fuzzy',
      confidence: Math.round(bestScore * 100),
    };
  }

  console.log('   ❌ No fuzzy match found');
  console.log('   ➕ Creating NEW external event');
  
  return {
    matched: false,
    action: 'new',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { event } = await req.json();
    
    if (!event) {
      throw new Error('Event data is required');
    }

    console.log('🔍 ========== MATCH EVENT REQUEST ==========');
    console.log('User:', user.id);
    console.log('Event:', event.summary);

    const result = await matchEvent(supabaseClient, event);

    console.log('🔍 ========== MATCH RESULT ==========');
    console.log('Matched:', result.matched);
    console.log('Action:', result.action);
    console.log('Method:', result.match_method || 'N/A');
    console.log('Confidence:', result.confidence || 'N/A');

    return new Response(
      JSON.stringify({ success: true, result }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('❌ Error in match-external-event:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
