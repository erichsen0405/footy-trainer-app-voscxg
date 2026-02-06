
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

interface CategoryKeywords {
  categoryName: string;
  keywords: string[];
  priority: number;
}

const DEFAULT_CATEGORY_KEYWORDS: CategoryKeywords[] = [
  {
    categoryName: 'Kamp',
    keywords: ['kamp', 'match', 'game', 'turnering', 'tournament', 'finale', 'semifinale', 'kvartfinale', 'vs', '-'],
    priority: 10,
  },
  {
    categoryName: 'Træning',
    keywords: ['træning', 'training', 'practice', 'øvelse', 'drill', 'session'],
    priority: 9,
  },
  {
    categoryName: 'Fysisk træning',
    keywords: ['fysisk', 'fitness', 'kondition', 'styrke', 'cardio', 'løb', 'gym', 'vægt'],
    priority: 8,
  },
  {
    categoryName: 'Taktik',
    keywords: ['taktik', 'tactics', 'strategi', 'strategy', 'analyse', 'video', 'gennemgang'],
    priority: 8,
  },
  {
    categoryName: 'Møde',
    keywords: ['møde', 'meeting', 'samtale', 'briefing', 'debriefing', 'evaluering', 'forældremøde', 'spillermøde'],
    priority: 7,
  },
  {
    categoryName: 'Holdsamling',
    keywords: ['holdsamling', 'team building', 'social', 'sammenkomst', 'event', 'fest'],
    priority: 7,
  },
  {
    categoryName: 'Lægebesøg',
    keywords: ['læge', 'doctor', 'fysioterapi', 'physio', 'behandling', 'skade', 'injury', 'sundhed'],
    priority: 6,
  },
  {
    categoryName: 'Rejse',
    keywords: ['rejse', 'travel', 'transport', 'bus', 'fly', 'flight', 'afgang', 'departure'],
    priority: 6,
  },
];

function parseActivityNameForCategory(
  activityName: string,
  userCategories: any[]
): { categoryId: string; categoryName: string; confidence: number } | null {
  if (!activityName || !userCategories || userCategories.length === 0) {
    return null;
  }

  const normalizedName = activityName.toLowerCase().trim();
  const sortedKeywords = [...DEFAULT_CATEGORY_KEYWORDS].sort((a, b) => b.priority - a.priority);

  const matches: Array<{
    category: any;
    score: number;
    matchedKeyword: string;
  }> = [];

  for (const keywordSet of sortedKeywords) {
    const matchingCategory = userCategories.find(
      (cat) => cat.name.toLowerCase().trim() === keywordSet.categoryName.toLowerCase().trim()
    );

    if (!matchingCategory) {
      continue;
    }

    for (const keyword of keywordSet.keywords) {
      const normalizedKeyword = keyword.toLowerCase();
      
      const wordBoundaryRegex = new RegExp(`\\b${normalizedKeyword}\\b`, 'i');
      if (wordBoundaryRegex.test(normalizedName)) {
        matches.push({
          category: matchingCategory,
          score: keywordSet.priority * 10 + 5,
          matchedKeyword: keyword,
        });
        continue;
      }

      if (normalizedName.includes(normalizedKeyword)) {
        matches.push({
          category: matchingCategory,
          score: keywordSet.priority * 10,
          matchedKeyword: keyword,
        });
      }
    }
  }

  if (matches.length === 0) {
    for (const category of userCategories) {
      const categoryNameLower = category.name.toLowerCase().trim();
      
      if (normalizedName.includes(categoryNameLower)) {
        matches.push({
          category: category,
          score: 50,
          matchedKeyword: category.name,
        });
      }
    }
  }

  if (matches.length > 0) {
    matches.sort((a, b) => b.score - a.score);
    const bestMatch = matches[0];

    const maxPossibleScore = 100;
    const confidence = Math.min(100, Math.round((bestMatch.score / maxPossibleScore) * 100));

    console.log(`Activity "${activityName}" matched to category "${bestMatch.category.name}" (confidence: ${confidence}%, keyword: "${bestMatch.matchedKeyword}")`);

    return {
      categoryId: bestMatch.category.id,
      categoryName: bestMatch.category.name,
      confidence: confidence,
    };
  }

  console.log(`No category match found for activity "${activityName}"`);
  return null;
}

function formatTimeFromICALTime(icalTime: any): { date: string; time: string; isAllDay: boolean } {
  try {
    const isAllDay = icalTime.isDate || false;
    
    console.log('Parsing ICAL time:', {
      original: icalTime.toString(),
      timezone: icalTime.zone?.tzid || 'none',
      isAllDay: isAllDay,
      isDate: icalTime.isDate,
    });
    
    if (isAllDay) {
      const year = icalTime.year;
      const month = String(icalTime.month).padStart(2, '0');
      const day = String(icalTime.day).padStart(2, '0');
      
      console.log('All-day event:', { year, month, day });
      
      return {
        date: `${year}-${month}-${day}`,
        time: '00:00:00',
        isAllDay: true,
      };
    }
    
    const jsDate = icalTime.toJSDate();
    const originalTimezone = icalTime.zone?.tzid;
    
    console.log('Timed event - original:', {
      jsDateISO: jsDate.toISOString(),
      jsDateLocal: jsDate.toString(),
      timezone: originalTimezone,
      year: icalTime.year,
      month: icalTime.month,
      day: icalTime.day,
      hour: icalTime.hour,
      minute: icalTime.minute,
    });
    
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
      
      console.log('UTC date created:', utcDate.toISOString());
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
    
    console.log('Converted to Copenhagen time:', {
      originalUTC: copenhagenDate.toISOString(),
      copenhagenLocal: `${year}-${month}-${day} ${hour}:${minute}:${second}`,
      parts: partsMap,
    });
    
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
      
      console.log('Event parsed:', {
        summary: event.summary,
        uid: event.uid?.substring(0, 40) + '...',
        startDate: startInfo.date,
        startTime: startInfo.time,
        isAllDay: startInfo.isAllDay,
        categories: categories,
        lastModified: lastModified?.toISOString() || 'N/A',
      });
      
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

async function ensureUnknownCategory(
  supabaseClient: any,
  _userId: string
): Promise<string> {
  // Always prefer a single canonical "Ukendt" row (system-wide)
  const { data: found, error: findError } = await supabaseClient
    .from('activity_categories')
    .select('*')
    .ilike('name', 'ukendt%')
    .order('is_system', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (findError) {
    console.error('Error looking up canonical "Ukendt" category:', findError);
  }

  const existing = Array.isArray(found) && found.length > 0 ? found[0] : null;
  if (existing) {
    console.log('Found canonical "Ukendt" category:', existing.id);
    return existing.id;
  }

  console.log('Creating canonical system "Ukendt" category');
  const { data: newCategory, error: categoryError } = await supabaseClient
    .from('activity_categories')
    .insert({
      user_id: null,
      team_id: null,
      player_id: null,
      is_system: true,
      name: 'Ukendt',
      color: '#9E9E9E',
      emoji: '❓',
    })
    .select()
    .single();

  if (categoryError) {
    console.error('Error creating canonical "Ukendt" category:', categoryError);
    throw categoryError;
  }

  console.log('Created canonical "Ukendt" category:', newCategory.id);
  return newCategory.id;
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

    console.log('🔄 ========== SYNC STARTED (NEW ARCHITECTURE) ==========');
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
    console.log('Calendar URL:', calendar.ics_url);

    const events = await fetchAndParseICalendar(calendar.ics_url);
    console.log(`✅ Parsed ${events.length} events from iCal feed`);

    const { data: userCategories } = await supabaseClient
      .from('activity_categories')
      .select('*')
      .eq('user_id', user.id);

    const unknownCategoryId = await ensureUnknownCategory(supabaseClient, user.id);

    // Fetch existing external events for this calendar
    const { data: existingExternalEvents } = await supabaseClient
      .from('events_external')
      .select('id, provider_event_uid, external_last_modified')
      .eq('provider_calendar_id', calendarId);

    const existingEventsMap = new Map();
    if (existingExternalEvents) {
      existingExternalEvents.forEach((event: any) => {
        existingEventsMap.set(event.provider_event_uid, event);
      });
    }

    console.log(`Found ${existingEventsMap.size} existing external events in database`);

    // Fetch existing local metadata for this user
    const { data: existingLocalMeta } = await supabaseClient
      .from('events_local_meta')
      .select(`
        id,
        external_event_id,
        category_id,
        manually_set_category,
        events_external!inner(provider_event_uid, provider_calendar_id)
      `)
      .eq('user_id', user.id)
      .eq('events_external.provider_calendar_id', calendarId);

    const localMetaMap = new Map();
    if (existingLocalMeta) {
      existingLocalMeta.forEach((meta: any) => {
        const uid = meta.events_external?.provider_event_uid;
        if (uid) {
          localMetaMap.set(uid, {
            id: meta.id,
            externalEventId: meta.external_event_id,
            categoryId: meta.category_id,
            manuallySetCategory: meta.manually_set_category,
          });
        }
      });
    }

    console.log(`Found ${localMetaMap.size} existing local metadata entries`);

    const fetchedEventUids = new Set(events.map(event => event.uid));

    // Find events to delete (exist in DB but not in fetched events)
    const eventsToDelete = Array.from(existingEventsMap.keys()).filter(
      uid => !fetchedEventUids.has(uid)
    );

    if (eventsToDelete.length > 0) {
      console.log(`🗑️ Deleting ${eventsToDelete.length} events that no longer exist in calendar`);
      const idsToDelete = eventsToDelete.map(uid => existingEventsMap.get(uid).id);
      const { error: deleteError } = await supabaseClient
        .from('events_external')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        console.error('Error deleting removed events:', deleteError);
      } else {
        console.log(`✅ Deleted ${eventsToDelete.length} events`);
      }
    }

    let eventsCreated = 0;
    let eventsUpdated = 0;
    let metadataCreated = 0;
    let metadataPreserved = 0;
    let eventsFailed = 0;
    const failedEvents: Array<{ title: string; error: string }> = [];

    console.log('🔄 Processing events with NEW ARCHITECTURE...');
    
    for (const event of events) {
      try {
        const existingExternal = existingEventsMap.get(event.uid);
        const existingMeta = localMetaMap.get(event.uid);
        
        console.log(`\n📝 Processing event: "${event.summary}"`);
        console.log(`   UID: ${event.uid.substring(0, 50)}...`);
        console.log(`   Start: ${event.startDateString} ${event.startTimeString}`);

        let externalEventId: string;

        if (existingExternal) {
          // Update external event data
          console.log(`   🔄 Updating existing external event (ID: ${existingExternal.id})`);
          
          const { error: updateError } = await supabaseClient
            .from('events_external')
            .update({
              title: event.summary,
              description: event.description,
              location: event.location,
              start_date: event.startDateString,
              start_time: event.startTimeString,
              end_date: event.endDateString,
              end_time: event.endTimeString,
              is_all_day: event.isAllDay,
              external_last_modified: event.lastModified?.toISOString() || new Date().toISOString(),
              fetched_at: new Date().toISOString(),
              raw_payload: {
                categories: event.categories,
                timezone: event.timezone,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingExternal.id);

          if (updateError) {
            console.error(`   ❌ Error updating external event:`, updateError);
            eventsFailed++;
            failedEvents.push({ title: event.summary, error: updateError.message });
            continue;
          }

          externalEventId = existingExternal.id;
          eventsUpdated++;
          console.log(`   ✅ External event updated`);
        } else {
          // Create new external event
          console.log(`   ➕ Creating NEW external event`);
          
          const { data: newExternal, error: insertError } = await supabaseClient
            .from('events_external')
            .insert({
              provider: 'ics',
              provider_event_uid: event.uid,
              provider_calendar_id: calendarId,
              title: event.summary,
              description: event.description,
              location: event.location,
              start_date: event.startDateString,
              start_time: event.startTimeString,
              end_date: event.endDateString,
              end_time: event.endTimeString,
              is_all_day: event.isAllDay,
              external_last_modified: event.lastModified?.toISOString() || new Date().toISOString(),
              fetched_at: new Date().toISOString(),
              raw_payload: {
                categories: event.categories,
                timezone: event.timezone,
              },
            })
            .select('id')
            .single();

          if (insertError || !newExternal) {
            console.error(`   ❌ Error creating external event:`, insertError);
            eventsFailed++;
            failedEvents.push({ title: event.summary, error: insertError?.message || 'Unknown error' });
            continue;
          }

          externalEventId = newExternal.id;
          eventsCreated++;
          console.log(`   ✅ NEW external event created (ID: ${externalEventId})`);
        }

        // Handle local metadata
        if (existingMeta) {
          // Metadata exists - check if manually set
          if (existingMeta.manuallySetCategory) {
            metadataPreserved++;
            console.log(`   🔒 Local metadata preserved (manually set category)`);
            console.log(`   ⚠️ Category will NOT be updated - user has manually set it`);
          } else {
            // Not manually set - we can update the category based on name parsing
            const categoryMatch = parseActivityNameForCategory(event.summary, userCategories || []);
            const newCategoryId = categoryMatch ? categoryMatch.categoryId : unknownCategoryId;
            
            if (newCategoryId !== existingMeta.categoryId) {
              console.log(`   🔄 Updating category (auto-detected change)`);
              
              const { error: updateMetaError } = await supabaseClient
                .from('events_local_meta')
                .update({
                  category_id: newCategoryId,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingMeta.id);

              if (updateMetaError) {
                console.error(`   ❌ Error updating metadata:`, updateMetaError);
              } else {
                console.log(`   ✅ Category updated via auto-detection`);
              }
            } else {
              console.log(`   ✅ Category unchanged (same as before)`);
            }
          }
        } else {
          // Create new local metadata with auto-detected category
          console.log(`   ➕ Creating NEW local metadata`);
          
          const categoryMatch = parseActivityNameForCategory(event.summary, userCategories || []);
          const categoryId = categoryMatch ? categoryMatch.categoryId : unknownCategoryId;
          
          if (categoryMatch) {
            console.log(`   🎯 Auto-detected category: "${categoryMatch.categoryName}" (confidence: ${categoryMatch.confidence}%)`);
          } else {
            console.log(`   ❓ No category match - assigning "Ukendt"`);
          }
          
          const { error: insertMetaError } = await supabaseClient
            .from('events_local_meta')
            .insert({
              external_event_id: externalEventId,
              user_id: user.id,
              category_id: categoryId,
              manually_set_category: false,
            });

          if (insertMetaError) {
            console.error(`   ❌ Error creating metadata:`, insertMetaError);
            // Don't fail the whole sync if metadata creation fails
          } else {
            metadataCreated++;
            console.log(`   ✅ NEW local metadata created`);
          }
        }

        // Log sync action
        await supabaseClient
          .from('event_sync_log')
          .insert({
            external_event_id: externalEventId,
            calendar_id: calendarId,
            user_id: user.id,
            action: existingExternal ? 'updated' : 'created',
            details: {
              title: event.summary,
              manually_set_preserved: existingMeta?.manuallySetCategory || false,
            },
          });
      } catch (eventError: any) {
        console.error(`   ❌ CRITICAL ERROR processing event "${event.summary}":`, eventError);
        eventsFailed++;
        failedEvents.push({ title: event.summary, error: eventError.message });
      }
    }

    console.log('\n📊 ========== SYNC SUMMARY (NEW ARCHITECTURE) ==========');
    console.log(`   📥 Total events in iCal feed: ${events.length}`);
    console.log(`   ➕ NEW external events created: ${eventsCreated}`);
    console.log(`   🔄 Existing external events updated: ${eventsUpdated}`);
    console.log(`   🗑️ Events deleted (no longer in feed): ${eventsToDelete.length}`);
    console.log(`   ➕ NEW local metadata created: ${metadataCreated}`);
    console.log(`   🔒 Local metadata preserved (manually set): ${metadataPreserved}`);
    console.log(`   ❌ Events FAILED to process: ${eventsFailed}`);
    
    if (failedEvents.length > 0) {
      console.log('\n   ⚠️ FAILED EVENTS:');
      failedEvents.forEach((failed, index) => {
        console.log(`      ${index + 1}. "${failed.title}": ${failed.error}`);
      });
    }
    
    console.log(`   ✅ GUARANTEE: Manually set categories are NEVER overwritten`);
    console.log('========================================================\n');

    const successfullyProcessed = eventsCreated + eventsUpdated;

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

    console.log('🔄 ========== SYNC COMPLETED (NEW ARCHITECTURE) ==========\n');

    return new Response(
      JSON.stringify({
        success: true,
        eventCount: events.length,
        eventsCreated,
        eventsUpdated,
        metadataCreated,
        metadataPreserved,
        eventsDeleted: eventsToDelete.length,
        eventsFailed,
        failedEvents: failedEvents.length > 0 ? failedEvents : undefined,
        message: `Successfully synced ${events.length} events. ${eventsCreated} new events created, ${eventsUpdated} updated, ${eventsToDelete.length} deleted. ${metadataPreserved} manually set categories preserved.${eventsFailed > 0 ? ` WARNING: ${eventsFailed} events failed to process.` : ''}`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('❌ Error in sync-external-calendar:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
