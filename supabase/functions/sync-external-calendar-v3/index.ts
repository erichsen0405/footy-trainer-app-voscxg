
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import ICAL from 'https://esm.sh/ical.js@2.0.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ParsedEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  startDate: Date;
  endDate: Date;
  startDateString: string;
  startTimeString: string;
  endDateString: string;
  endTimeString: string;
  timezone?: string;
  isAllDay: boolean;
  categories: string[];
  lastModified?: Date;
}

/**
 * Tokenize a string for fuzzy matching.
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
 * Calculate Jaccard similarity between two strings.
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
 * Check if two timestamps are within tolerance.
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
 * Match an external event using unstable UID matching logic.
 * Returns the external_event_id if matched, or null if new.
 */
async function matchEvent(
  supabaseClient: any,
  provider: string,
  providerUid: string,
  dtstart: string,
  summary: string,
  location: string
): Promise<{ matched: boolean; externalEventId?: number; method?: string }> {
  console.log(`\n🔍 Matching: "${summary}"`);

  // STEP 1: Try provider_uid match via mappings
  const { data: mapping } = await supabaseClient
    .from('external_event_mappings')
    .select('external_event_id')
    .eq('provider', provider)
    .eq('provider_uid', providerUid)
    .single();

  if (mapping) {
    console.log(`   ✅ Match via provider_uid`);
    return { matched: true, externalEventId: mapping.external_event_id, method: 'provider_uid' };
  }

  // STEP 2: Try exact match on summary + dtstart
  const { data: exactMatches } = await supabaseClient
    .from('external_events')
    .select('id, primary_provider_uid')
    .eq('provider', provider)
    .eq('summary', summary)
    .eq('dtstart_utc', dtstart);

  if (exactMatches && exactMatches.length > 0) {
    const match = exactMatches[0];
    console.log(`   ✅ Exact match (summary + dtstart)`);
    
    // Create mapping
    await supabaseClient
      .from('external_event_mappings')
      .insert({
        external_event_id: match.id,
        provider: provider,
        provider_uid: providerUid,
      });
    
    // Update primary UID
    await supabaseClient
      .from('external_events')
      .update({ primary_provider_uid: providerUid })
      .eq('id', match.id);
    
    return { matched: true, externalEventId: match.id, method: 'exact' };
  }

  // STEP 3: Try fuzzy match
  const startWindow = new Date(new Date(dtstart).getTime() - 30 * 60 * 1000).toISOString();
  const endWindow = new Date(new Date(dtstart).getTime() + 30 * 60 * 1000).toISOString();
  
  const { data: candidates } = await supabaseClient
    .from('external_events')
    .select('id, primary_provider_uid, summary, dtstart_utc, location')
    .eq('provider', provider)
    .gte('dtstart_utc', startWindow)
    .lte('dtstart_utc', endWindow);

  if (!candidates || candidates.length === 0) {
    console.log(`   ❌ No match found`);
    return { matched: false };
  }

  const OVERLAP_THRESHOLD = 0.6;
  const TIME_TOLERANCE_MINUTES = 15;

  let bestMatch: any = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const summaryOverlap = calculateTokenOverlap(summary, candidate.summary);
    const locationOverlap = location && candidate.location 
      ? calculateTokenOverlap(location, candidate.location)
      : 0;
    
    const withinTime = isWithinTimeTolerance(dtstart, candidate.dtstart_utc, TIME_TOLERANCE_MINUTES);
    const score = summaryOverlap * 0.7 + locationOverlap * 0.3;

    if (withinTime && summaryOverlap >= OVERLAP_THRESHOLD && score > bestScore) {
      bestMatch = candidate;
      bestScore = score;
    }
  }

  if (bestMatch) {
    console.log(`   ✅ Fuzzy match (${(bestScore * 100).toFixed(1)}%)`);
    
    await supabaseClient
      .from('external_event_mappings')
      .insert({
        external_event_id: bestMatch.id,
        provider: provider,
        provider_uid: providerUid,
      });
    
    await supabaseClient
      .from('external_events')
      .update({ primary_provider_uid: providerUid })
      .eq('id', bestMatch.id);
    
    return { matched: true, externalEventId: bestMatch.id, method: 'fuzzy' };
  }

  console.log(`   ❌ No match found`);
  return { matched: false };
}

function formatTimeFromICALTime(icalTime: any): { date: string; time: string; isAllDay: boolean } {
  try {
    const isAllDay = icalTime.isDate || false;
    
    if (isAllDay) {
      const year = icalTime.year;
      const month = String(icalTime.month).padStart(2, '0');
      const day = String(icalTime.day).padStart(2, '0');
      
      return {
        date: `${year}-${month}-${day}`,
        time: '00:00:00',
        isAllDay: true,
      };
    }
    
    const jsDate = icalTime.toJSDate();
    const originalTimezone = icalTime.zone?.tzid;
    
    let copenhagenDate: Date;
    
    if (!originalTimezone || originalTimezone === 'UTC' || originalTimezone === 'Z') {
      const utcDate = new Date(Date.UTC(
        icalTime.year,
        icalTime.month - 1,
        icalTime.day,
        icalTime.hour,
        icalTime.minute,
        icalTime.second || 0
      ));
      copenhagenDate = utcDate;
    } else {
      copenhagenDate = jsDate;
    }
    
    const copenhagenFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Copenhagen',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    
    const parts = copenhagenFormatter.formatToParts(copenhagenDate);
    const partsMap: { [key: string]: string } = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        partsMap[part.type] = part.value;
      }
    });
    
    const year = partsMap.year;
    const month = partsMap.month;
    const day = partsMap.day;
    const hour = partsMap.hour;
    const minute = partsMap.minute;
    const second = partsMap.second || '00';
    
    return {
      date: `${year}-${month}-${day}`,
      time: `${hour}:${minute}:${second}`,
      isAllDay: false,
    };
  } catch (error) {
    console.error('Error formatting ICAL time:', error);
    const now = new Date();
    const copenhagenFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Copenhagen',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false
    });
    
    const parts = copenhagenFormatter.formatToParts(now);
    const partsMap: { [key: string]: string } = {};
    parts.forEach(part => {
      if (part.type !== 'literal') {
        partsMap[part.type] = part.value;
      }
    });
    
    return {
      date: `${partsMap.year}-${partsMap.month}-${partsMap.day}`,
      time: '12:00:00',
      isAllDay: false,
    };
  }
}

async function fetchAndParseICalendar(url: string): Promise<ParsedEvent[]> {
  console.log('Fetching iCal from:', url);
  
  const httpUrl = url.replace(/^webcal:\/\//, 'https://');
  const response = await fetch(httpUrl);
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  const icalData = await response.text();
  console.log('iCal data fetched, length:', icalData.length);
  
  return parseICalendarData(icalData);
}

function parseICalendarData(icalData: string): ParsedEvent[] {
  try {
    const jcalData = ICAL.parse(icalData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    console.log(`Found ${vevents.length} events in calendar`);
    
    const events: ParsedEvent[] = vevents.map((vevent) => {
      const event = new ICAL.Event(vevent);
      
      const startInfo = formatTimeFromICALTime(event.startDate);
      const endInfo = formatTimeFromICALTime(event.endDate);
      
      let categories: string[] = [];
      try {
        const categoriesProp = vevent.getFirstProperty('categories');
        if (categoriesProp) {
          const categoriesValue = categoriesProp.getValues();
          if (Array.isArray(categoriesValue)) {
            categories = categoriesValue.filter((cat: any) => typeof cat === 'string' && cat.trim());
          } else if (typeof categoriesValue === 'string') {
            categories = categoriesValue.split(',').map((cat: string) => cat.trim()).filter(Boolean);
          }
        }
      } catch (error) {
        console.log('No categories found for event:', event.summary);
      }

      let lastModified: Date | undefined;
      try {
        const lastModifiedProp = vevent.getFirstProperty('last-modified');
        if (lastModifiedProp) {
          const lastModifiedTime = lastModifiedProp.getFirstValue();
          if (lastModifiedTime) {
            lastModified = lastModifiedTime.toJSDate();
          }
        }
      } catch (error) {
        console.log('No LAST-MODIFIED found for event:', event.summary);
      }
      
      return {
        uid: event.uid || `event-${Date.now()}-${Math.random()}`,
        summary: event.summary || 'Ingen titel',
        description: event.description || '',
        location: event.location || '',
        startDate: event.startDate.toJSDate(),
        endDate: event.endDate.toJSDate(),
        startDateString: startInfo.date,
        startTimeString: startInfo.time,
        endDateString: endInfo.date,
        endTimeString: endInfo.time,
        timezone: event.startDate.zone?.tzid,
        isAllDay: startInfo.isAllDay,
        categories: categories,
        lastModified: lastModified,
      };
    });
    
    return events;
  } catch (error) {
    console.error('Error parsing iCal data:', error);
    throw error;
  }
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

    console.log('🔄 ========== SYNC STARTED (UNSTABLE UID MATCHING) ==========');
    console.log('User:', user.id);
    console.log('Timestamp:', new Date().toISOString());

    const { calendarId } = await req.json();
    
    if (!calendarId) {
      throw new Error('Calendar ID is required');
    }

    const { data: calendar, error: calendarError } = await supabaseClient
      .from('external_calendars')
      .select('*')
      .eq('id', calendarId)
      .eq('user_id', user.id)
      .single();

    if (calendarError || !calendar) {
      throw new Error('Calendar not found');
    }

    console.log('Calendar:', calendar.name);

    const events = await fetchAndParseICalendar(calendar.ics_url);
    console.log(`Parsed ${events.length} events`);

    let eventsCreated = 0;
    let eventsUpdated = 0;
    let matchedViaProviderUid = 0;
    let matchedViaExact = 0;
    let matchedViaFuzzy = 0;

    for (const event of events) {
      // Convert start date/time to UTC timestamp
      const dtstartUtc = new Date(`${event.startDateString}T${event.startTimeString}Z`).toISOString();
      
      const matchResult = await matchEvent(
        supabaseClient,
        'ics',
        event.uid,
        dtstartUtc,
        event.summary,
        event.location
      );

      if (matchResult.matched) {
        // Update existing event
        await supabaseClient
          .from('external_events')
          .update({
            summary: event.summary,
            location: event.location,
            dtstart_utc: dtstartUtc,
            external_last_modified: event.lastModified?.toISOString() || new Date().toISOString(),
            raw_payload: JSON.stringify({
              categories: event.categories,
              timezone: event.timezone,
              description: event.description,
            }),
            last_seen: new Date().toISOString(),
          })
          .eq('id', matchResult.externalEventId);

        eventsUpdated++;
        
        if (matchResult.method === 'provider_uid') matchedViaProviderUid++;
        else if (matchResult.method === 'exact') matchedViaExact++;
        else if (matchResult.method === 'fuzzy') matchedViaFuzzy++;
      } else {
        // Create new event
        const { data: newEvent, error: insertError } = await supabaseClient
          .from('external_events')
          .insert({
            provider: 'ics',
            primary_provider_uid: event.uid,
            dtstart_utc: dtstartUtc,
            summary: event.summary,
            location: event.location,
            external_last_modified: event.lastModified?.toISOString() || new Date().toISOString(),
            raw_payload: JSON.stringify({
              categories: event.categories,
              timezone: event.timezone,
              description: event.description,
            }),
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('Error creating event:', insertError);
          continue;
        }

        // Create initial mapping
        await supabaseClient
          .from('external_event_mappings')
          .insert({
            external_event_id: newEvent.id,
            provider: 'ics',
            provider_uid: event.uid,
          });

        eventsCreated++;
      }
    }

    console.log('\n📊 Sync Summary:');
    console.log(`   ➕ Events created: ${eventsCreated}`);
    console.log(`   🔄 Events updated: ${eventsUpdated}`);
    console.log(`   📍 Matched via provider_uid: ${matchedViaProviderUid}`);
    console.log(`   🎯 Matched via exact: ${matchedViaExact}`);
    console.log(`   🔍 Matched via fuzzy: ${matchedViaFuzzy}`);

    await supabaseClient
      .from('external_calendars')
      .update({
        last_fetched: new Date().toISOString(),
        event_count: events.length,
      })
      .eq('id', calendarId);

    console.log('🔄 ========== SYNC COMPLETED ==========\n');

    return new Response(
      JSON.stringify({
        success: true,
        eventCount: events.length,
        eventsCreated,
        eventsUpdated,
        matchStats: {
          providerUid: matchedViaProviderUid,
          exact: matchedViaExact,
          fuzzy: matchedViaFuzzy,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('❌ Error in sync:', error);
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
