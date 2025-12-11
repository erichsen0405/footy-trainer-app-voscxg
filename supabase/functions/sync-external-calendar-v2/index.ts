
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

// Tokenize a string for fuzzy matching
function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9\u00e6\u00f8\u00e5\s]/g, ' ')
    .trim();
  
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  return new Set(tokens);
}

// Calculate token overlap between two strings
function calculateTokenOverlap(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}

// Check if two timestamps are within tolerance
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

// Main matching function
async function matchEvent(
  supabaseClient: any,
  provider: string,
  providerUid: string,
  dtstartUtc: string,
  summary: string
): Promise<{ matched: boolean; externalEventId?: number; matchMethod?: string }> {
  console.log(`\n🔍 Matching event: "${summary}"`);
  console.log(`   Provider UID: ${providerUid}`);
  console.log(`   Start time: ${dtstartUtc}`);
  
  // Step 1: Try to match by provider_uid via mappings
  console.log('   Step 1: Checking provider_uid mapping...');
  const { data: mapping } = await supabaseClient
    .from('external_event_mappings')
    .select('external_event_id')
    .eq('provider', provider)
    .eq('provider_uid', providerUid)
    .single();
  
  if (mapping) {
    console.log(`   ✅ Found via provider_uid mapping: external_event_id=${mapping.external_event_id}`);
    return {
      matched: true,
      externalEventId: mapping.external_event_id,
      matchMethod: 'provider_uid',
    };
  }
  
  console.log('   ❌ No provider_uid mapping found');
  
  // Step 2: Try exact match on summary + dtstart_utc
  console.log('   Step 2: Checking exact summary + dtstart match...');
  const { data: exactMatch } = await supabaseClient
    .from('external_events')
    .select('id, primary_provider_uid')
    .eq('provider', provider)
    .eq('summary', summary)
    .eq('dtstart_utc', dtstartUtc)
    .single();
  
  if (exactMatch) {
    console.log(`   ✅ Found via exact match: external_event_id=${exactMatch.id}`);
    
    // Update mapping if provider_uid is different
    if (exactMatch.primary_provider_uid !== providerUid) {
      console.log(`   🔄 Creating new mapping for changed UID`);
      await supabaseClient
        .from('external_event_mappings')
        .insert({
          external_event_id: exactMatch.id,
          provider: provider,
          provider_uid: providerUid,
        });
    }
    
    return {
      matched: true,
      externalEventId: exactMatch.id,
      matchMethod: 'exact',
    };
  }
  
  console.log('   ❌ No exact match found');
  
  // Step 3: Fuzzy match (token overlap + time tolerance)
  console.log('   Step 3: Attempting fuzzy match...');
  
  // Get candidates within a time window (±1 hour)
  const startTime = new Date(dtstartUtc);
  const windowStart = new Date(startTime.getTime() - 60 * 60 * 1000);
  const windowEnd = new Date(startTime.getTime() + 60 * 60 * 1000);
  
  const { data: candidates } = await supabaseClient
    .from('external_events')
    .select('id, summary, dtstart_utc, primary_provider_uid')
    .eq('provider', provider)
    .gte('dtstart_utc', windowStart.toISOString())
    .lte('dtstart_utc', windowEnd.toISOString());
  
  if (candidates && candidates.length > 0) {
    console.log(`   Found ${candidates.length} candidates in time window`);
    
    let bestMatch: any = null;
    let bestScore = 0;
    
    for (const candidate of candidates) {
      const tokenOverlap = calculateTokenOverlap(summary, candidate.summary);
      const withinTimeTolerance = isWithinTimeTolerance(dtstartUtc, candidate.dtstart_utc, 15);
      
      // Require at least 60% token overlap and within time tolerance
      if (tokenOverlap >= 0.6 && withinTimeTolerance) {
        if (tokenOverlap > bestScore) {
          bestScore = tokenOverlap;
          bestMatch = candidate;
        }
      }
    }
    
    if (bestMatch) {
      console.log(`   ✅ Found via fuzzy match: external_event_id=${bestMatch.id}`);
      console.log(`   Token overlap: ${(bestScore * 100).toFixed(1)}%`);
      
      // Update mapping if provider_uid is different
      if (bestMatch.primary_provider_uid !== providerUid) {
        console.log(`   🔄 Creating new mapping for changed UID`);
        await supabaseClient
          .from('external_event_mappings')
          .insert({
            external_event_id: bestMatch.id,
            provider: provider,
            provider_uid: providerUid,
          });
      }
      
      return {
        matched: true,
        externalEventId: bestMatch.id,
        matchMethod: 'fuzzy',
      };
    }
  }
  
  console.log('   ❌ No fuzzy match found');
  console.log('   ➕ Will create new external_event');
  
  // No match found
  return {
    matched: false,
  };
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

    console.log('🔄 ========== SYNC STARTED (UNSTABLE UID ARCHITECTURE) ==========');
    console.log('User authenticated:', user.id);
    console.log('Timestamp:', new Date().toISOString());

    const { calendarId } = await req.json();
    
    if (!calendarId) {
      throw new Error('Calendar ID is required');
    }

    console.log('Syncing calendar:', calendarId);

    const { data: calendar, error: calendarError } = await supabaseClient
      .from('external_calendars')
      .select('*')
      .eq('id', calendarId)
      .eq('user_id', user.id)
      .single();

    if (calendarError || !calendar) {
      throw new Error('Calendar not found');
    }

    console.log('Calendar found:', calendar.name);

    const events = await fetchAndParseICalendar(calendar.ics_url);
    console.log(`Parsed ${events.length} events`);

    const { data: userCategories } = await supabaseClient
      .from('activity_categories')
      .select('*')
      .eq('user_id', user.id);

    let eventsCreated = 0;
    let eventsUpdated = 0;
    let mappingsCreated = 0;

    console.log('🔄 Processing events with UNSTABLE UID matching...');
    
    for (const event of events) {
      // Convert start date/time to UTC timestamp
      const dtstartUtc = new Date(`${event.startDateString}T${event.startTimeString}Z`).toISOString();
      
      // Try to match the event
      const matchResult = await matchEvent(
        supabaseClient,
        'ics',
        event.uid,
        dtstartUtc,
        event.summary
      );
      
      let externalEventId: number;
      
      if (matchResult.matched && matchResult.externalEventId) {
        // Update existing external event
        console.log(`   ✅ Updating existing external event (${matchResult.matchMethod})`);
        
        const { error: updateError } = await supabaseClient
          .from('external_events')
          .update({
            summary: event.summary,
            location: event.location,
            dtstart_utc: dtstartUtc,
            external_last_modified: event.lastModified?.toISOString() || new Date().toISOString(),
            raw_payload: JSON.stringify({
              description: event.description,
              categories: event.categories,
              timezone: event.timezone,
              isAllDay: event.isAllDay,
            }),
            last_seen: new Date().toISOString(),
          })
          .eq('id', matchResult.externalEventId);

        if (updateError) {
          console.error(`   ❌ Error updating external event:`, updateError);
          continue;
        }

        externalEventId = matchResult.externalEventId;
        eventsUpdated++;
      } else {
        // Create new external event
        console.log(`   ➕ Creating new external event`);
        
        const { data: newExternal, error: insertError } = await supabaseClient
          .from('external_events')
          .insert({
            provider: 'ics',
            primary_provider_uid: event.uid,
            dtstart_utc: dtstartUtc,
            summary: event.summary,
            location: event.location,
            external_last_modified: event.lastModified?.toISOString() || new Date().toISOString(),
            raw_payload: JSON.stringify({
              description: event.description,
              categories: event.categories,
              timezone: event.timezone,
              isAllDay: event.isAllDay,
            }),
            first_seen: new Date().toISOString(),
            last_seen: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (insertError || !newExternal) {
          console.error(`   ❌ Error creating external event:`, insertError);
          continue;
        }

        externalEventId = newExternal.id;
        eventsCreated++;
        
        // Create initial mapping
        await supabaseClient
          .from('external_event_mappings')
          .insert({
            external_event_id: externalEventId,
            provider: 'ics',
            provider_uid: event.uid,
          });
        
        mappingsCreated++;
      }
      
      // Check if local_event_meta exists for this user
      const { data: existingMeta } = await supabaseClient
        .from('local_event_meta')
        .select('id')
        .eq('external_event_id', externalEventId)
        .eq('user_id', user.id)
        .single();
      
      if (!existingMeta) {
        // Create local_event_meta
        console.log(`   ➕ Creating local_event_meta for user`);
        
        await supabaseClient
          .from('local_event_meta')
          .insert({
            external_event_id: externalEventId,
            user_id: user.id,
            category_id: null,
            overrides: {},
          });
      }
    }

    console.log('\n📊 Sync Summary (UNSTABLE UID ARCHITECTURE):');
    console.log(`   ➕ External events created: ${eventsCreated}`);
    console.log(`   🔄 External events updated: ${eventsUpdated}`);
    console.log(`   🔗 Mappings created: ${mappingsCreated}`);
    console.log(`   ✅ Total events processed: ${events.length}`);

    const { error: updateError } = await supabaseClient
      .from('external_calendars')
      .update({
        last_fetched: new Date().toISOString(),
        event_count: events.length,
      })
      .eq('id', calendarId);

    if (updateError) {
      console.error('Error updating calendar:', updateError);
    }

    console.log('🔄 ========== SYNC COMPLETED (UNSTABLE UID ARCHITECTURE) ==========\n');

    return new Response(
      JSON.stringify({
        success: true,
        eventCount: events.length,
        eventsCreated,
        eventsUpdated,
        mappingsCreated,
        message: `Successfully synced ${events.length} events using unstable UID matching.`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('❌ Error in sync-external-calendar-v2:', error);
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
