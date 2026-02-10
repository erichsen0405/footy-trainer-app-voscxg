
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import ICAL from 'https://esm.sh/ical.js@2.0.0';
import {
  resolveActivityCategory,
  type ActivityCategoryCandidate,
  type CategoryMappingRecord,
} from '../../../shared/activityCategoryResolver.ts';

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
  status?: string;
  method?: string;
}

type ActivityCategoryRow = ActivityCategoryCandidate & { user_id?: string | null; is_system?: boolean | null };

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
      
      // Extract STATUS and METHOD
      let status: string | undefined;
      let method: string | undefined;
      
      try {
        const statusProp = vevent.getFirstProperty('status');
        if (statusProp) {
          status = statusProp.getFirstValue();
        }
      } catch (error) {
        // No status
      }
      
      try {
        const methodProp = vevent.getFirstProperty('method');
        if (methodProp) {
          method = methodProp.getFirstValue();
        }
      } catch (error) {
        // No method
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
        status: status,
        method: method,
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
  userId: string
): Promise<string> {
  // Always prefer a single canonical "Ukendt" category across the system
  const { data: found, error: findError } = await supabaseClient
    .from('activity_categories')
    .select('*')
    .ilike('name', 'ukendt%')
    .order('is_system', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1);

  if (findError) {
    console.error('Error locating canonical "Ukendt" category:', findError);
  }

  const existing = Array.isArray(found) && found.length > 0 ? found[0] : null;
  if (existing) {
    return existing.id;
  }

  // No row exists yet – create a system-level one to avoid per-user duplicates
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
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (categoryError) {
    throw categoryError;
  }

  console.log(`Created canonical "Ukendt" category for user ${userId}:`, newCategory.id);
  return newCategory.id;
}

// Inline computeSyncOps implementation
function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9æøå\s]/g, ' ')
    .trim();
  
  const tokens = normalized.split(/\s+/).filter(t => t.length > 2);
  return new Set(tokens);
}

function calculateTokenOverlap(text1: string, text2: string): number {
  const tokens1 = tokenize(text1);
  const tokens2 = tokenize(text2);
  
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  const intersection = new Set([...tokens1].filter(t => tokens2.has(t)));
  const union = new Set([...tokens1, ...tokens2]);
  
  return intersection.size / union.size;
}

function isWithinTimeTolerance(
  dt1: Date,
  dt2: Date,
  toleranceSeconds: number
): boolean {
  const diffMs = Math.abs(dt1.getTime() - dt2.getTime());
  const diffSeconds = diffMs / 1000;
  
  return diffSeconds <= toleranceSeconds;
}

function isCancelled(event: ParsedEvent): boolean {
  const status = event.status?.toUpperCase();
  const method = event.method?.toUpperCase();
  
  return status === 'CANCELLED' || method === 'CANCEL';
}

function parseDateParts(dateString: string): { year: number; month: number; day: number } | null {
  const trimmed = String(dateString ?? '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split('-');
  if (parts.length < 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  return { year, month, day };
}

function parseTimeParts(timeString?: string | null): { hour: number; minute: number; second: number } {
  const trimmed = String(timeString ?? '').trim();
  if (!trimmed) return { hour: 0, minute: 0, second: 0 };
  const parts = trimmed.split(':').map((part) => Number(part));
  const hour = Number.isFinite(parts[0]) ? parts[0] : 0;
  const minute = Number.isFinite(parts[1]) ? parts[1] : 0;
  const second = Number.isFinite(parts[2]) ? parts[2] : 0;
  return { hour, minute, second };
}

function copenhagenToUtcMs(args: { date?: string | null; time?: string | null; isAllDay?: boolean }): number {
  const dateParts = args.date ? parseDateParts(args.date) : null;
  if (!dateParts) return NaN;
  const baseTime = parseTimeParts(args.time);
  const time =
    args.isAllDay && (!args.time || String(args.time).startsWith('00:00'))
      ? { hour: 23, minute: 59, second: 59 }
      : baseTime;
  return Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, time.hour, time.minute, time.second);
}

function getCopenhagenNowUtcMs(): number {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const map: Record<string, string> = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  });
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = Number(map.hour);
  const minute = Number(map.minute);
  const second = Number(map.second);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second)
  ) {
    return Date.now();
  }
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

function isPastDbRow(row: any, nowMs: number): boolean {
  const date = row?.end_date ?? row?.start_date ?? null;
  if (!date) return false;
  const time = row?.end_time ?? row?.start_time ?? '00:00:00';
  const eventMs = copenhagenToUtcMs({ date, time, isAllDay: row?.is_all_day });
  if (!Number.isFinite(eventMs)) return false;
  return eventMs < nowMs;
}

function isPastParsedEvent(event: ParsedEvent, nowMs: number): boolean {
  const date = event.endDateString || event.startDateString;
  const time = event.endTimeString || event.startTimeString || '00:00:00';
  const eventMs = copenhagenToUtcMs({ date, time, isAllDay: event.isAllDay });
  if (!Number.isFinite(eventMs)) return false;
  return eventMs < nowMs;
}

function matchEvent(
  fetchedEvent: ParsedEvent,
  dbRows: any[],
  options: any
): any | null {
  // Step 1: Try exact UID match
  for (const row of dbRows) {
    if (row.provider_event_uid === fetchedEvent.uid) {
      return row;
    }
  }
  
  // Step 2: Try exact summary + datetime match
  const fetchedStart = new Date(`${fetchedEvent.startDateString}T${fetchedEvent.startTimeString}`);
  
  for (const row of dbRows) {
    const rowStart = new Date(`${row.start_date}T${row.start_time}`);
    
    if (
      row.title === fetchedEvent.summary &&
      fetchedStart.getTime() === rowStart.getTime()
    ) {
      return row;
    }
  }
  
  // Step 3: Try fuzzy match
  let bestMatch: any | null = null;
  let bestScore = 0;
  
  for (const row of dbRows) {
    const rowStart = new Date(`${row.start_date}T${row.start_time}`);
    
    if (!isWithinTimeTolerance(fetchedStart, rowStart, options.dtToleranceSeconds)) {
      continue;
    }
    
    const summaryOverlap = calculateTokenOverlap(fetchedEvent.summary, row.title);
    const locationOverlap = fetchedEvent.location && row.location
      ? calculateTokenOverlap(fetchedEvent.location, row.location)
      : 0;
    
    const score = summaryOverlap * 0.7 + locationOverlap * 0.3;
    
    if (score >= options.fuzzyThreshold && score > bestScore) {
      bestScore = score;
      bestMatch = row;
    }
  }
  
  return bestMatch;
}

function computeSyncOps(
  fetched: ParsedEvent[],
  dbRows: any[],
  methodCancel: boolean,
  opts: any
) {
  const options = {
    graceHours: opts.graceHours ?? 6,
    fuzzyThreshold: opts.fuzzyThreshold ?? 0.65,
    dtToleranceSeconds: opts.dtToleranceSeconds ?? 300,
    maxMissCount: opts.maxMissCount ?? 3,
  };
  
  const operations = {
    creates: [] as any[],
    updates: [] as any[],
    softDeletes: [] as any[],
    restores: [] as any[],
    immediateDeletes: [] as any[],
  };
  
  const matchedDbRowIds = new Set<string>();
  const now = new Date();
  const nowCopenhagenMs = getCopenhagenNowUtcMs();
  
  for (const event of fetched) {
    const matchedRow = matchEvent(event, dbRows, options);
    
    if (matchedRow) {
      matchedDbRowIds.add(matchedRow.id);
      
      if (methodCancel && isCancelled(event)) {
        if (isPastParsedEvent(event, nowCopenhagenMs)) {
          console.log(`Skipping delete for past cancelled event: "${event.summary}"`);
          continue;
        }
        operations.immediateDeletes.push({
          dbRowId: matchedRow.id,
          reason: `Event cancelled (STATUS:${event.status || 'N/A'}, METHOD:${event.method || 'N/A'})`,
        });
        continue;
      }
      
      if (matchedRow.deleted) {
        if (matchedRow.deleted_at_reason === 'user-delete') {
          console.log(`Skipping restore for user-deleted event: "${event.summary}"`);
          continue;
        }
        operations.restores.push({
          dbRowId: matchedRow.id,
          event: event,
          reason: 'Event reappeared in feed after soft delete',
        });
        continue;
      }
      
      operations.updates.push({
        dbRowId: matchedRow.id,
        event: event,
        reason: 'Event exists and needs update',
      });
    } else {
      if (methodCancel && isCancelled(event)) {
        console.log(`Skipping cancelled event: ${event.summary}`);
        continue;
      }
      
      operations.creates.push({
        event: event,
        reason: 'New event not found in database',
      });
    }
  }
  
  for (const row of dbRows) {
    if (matchedDbRowIds.has(row.id)) {
      continue;
    }
    
    if (row.deleted) {
      continue;
    }

    if (isPastDbRow(row, nowCopenhagenMs)) {
      console.log(`Skipping delete for past event missing from feed: "${row.title}"`);
      continue;
    }
    
    const updatedAt = new Date(row.updated_at);
    const hoursSinceUpdate = (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60);
    
    const missCount = row.miss_count ?? 0;
    
    if (hoursSinceUpdate >= options.graceHours || missCount >= options.maxMissCount) {
      operations.softDeletes.push({
        dbRowId: row.id,
        reason: `Event missing from feed (${hoursSinceUpdate.toFixed(1)}h since update, miss_count: ${missCount})`,
      });
    } else {
      console.log(`Event "${row.title}" missing but within grace period (${hoursSinceUpdate.toFixed(1)}h, miss_count: ${missCount})`);
    }
  }
  
  return operations;
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

    console.log('🔄 ========== SYNC STARTED (computeSyncOps v4) ==========');
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
      .or(`user_id.eq.${user.id},is_system.eq.true`);

    const { data: categoryMappings } = await supabaseClient
      .from('category_mappings')
      .select('external_category, internal_category_id')
      .eq('user_id', user.id);

    const categoriesList = ((userCategories || []) as ActivityCategoryRow[]).slice();
    const hadAnyCategories = categoriesList.length > 0;
    const unknownCategoryId = await ensureUnknownCategory(supabaseClient, user.id);

    if (!categoriesList.some((category) => category.id === unknownCategoryId)) {
      categoriesList.push({
        id: unknownCategoryId,
        name: 'Ukendt',
        color: '#9E9E9E',
        emoji: '❓',
        user_id: user.id,
        is_system: false,
      });
    }

    const unknownCategoryIds = new Set(
      categoriesList
        .filter((category) => (category.name || '').toLowerCase().trim() === 'ukendt')
        .map((category) => category.id)
    );
    unknownCategoryIds.add(unknownCategoryId);

    let missingCategoryWarningLogged = false;
    const warnMissingCategories = () => {
      if (!missingCategoryWarningLogged) {
        console.warn(
          `⚠️ No categories loaded for user ${user.id}. Falling back to 'Ukendt' for this sync run.`
        );
        missingCategoryWarningLogged = true;
      }
    };

    const determineCategoryId = (eventSummary: string, externalCategories?: string[]) => {
      if (categoriesList.length === 0) {
        warnMissingCategories();
        return unknownCategoryId;
      }

      const resolution = resolveActivityCategory({
        title: eventSummary,
        categories: categoriesList,
        externalCategories,
        categoryMappings: (categoryMappings || []) as CategoryMappingRecord[],
      });

      return resolution?.category.id ?? unknownCategoryId;
    };

    if (!hadAnyCategories) {
      warnMissingCategories();
    }

    const isUnknownCategory = (categoryId?: string | null) => {
      if (!categoryId) {
        return true;
      }
      return unknownCategoryIds.has(categoryId);
    };

    // Fetch existing external events for this calendar
    const { data: existingExternalEvents } = await supabaseClient
      .from('events_external')
      .select('*')
      .eq('provider_calendar_id', calendarId);

    console.log(`Found ${existingExternalEvents?.length || 0} existing external events in database`);

    // Compute sync operations
    const syncOps = computeSyncOps(
      events,
      existingExternalEvents || [],
      true, // methodCancel
      {
        graceHours: 6,
        fuzzyThreshold: 0.65,
        dtToleranceSeconds: 300,
        maxMissCount: 3,
      }
    );

    console.log('\n📊 Sync Operations Computed:');
    console.log(`   ➕ Creates: ${syncOps.creates.length}`);
    console.log(`   🔄 Updates: ${syncOps.updates.length}`);
    console.log(`   🗑️ Soft Deletes: ${syncOps.softDeletes.length}`);
    console.log(`   ♻️ Restores: ${syncOps.restores.length}`);
    console.log(`   ❌ Immediate Deletes: ${syncOps.immediateDeletes.length}`);

    let eventsCreated = 0;
    let eventsUpdated = 0;
    let eventsRestored = 0;
    let eventsSoftDeleted = 0;
    let eventsImmediatelyDeleted = 0;
    let metadataCreated = 0;
    let metadataPreserved = 0;
    let metadataAlreadyResolved = 0;
    let metadataAutoUpdated = 0;
    let metadataBackfilled = 0;
    let metadataCreatedDuringBackfill = 0;
    let eventsFailed = 0;
    const failedEvents: Array<{ title: string; error: string }> = [];

    // Execute creates
    console.log('\n🔄 Executing CREATE operations...');
    for (const op of syncOps.creates) {
      try {
        const event = op.event;
        console.log(`   ➕ Creating: "${event.summary}"`);
        
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
              status: event.status,
              method: event.method,
            },
            miss_count: 0,
            deleted: false,
          })
          .select('id')
          .single();

        if (insertError || !newExternal) {
          console.error(`   ❌ Error creating external event:`, insertError);
          eventsFailed++;
          failedEvents.push({ title: event.summary, error: insertError?.message || 'Unknown error' });
          continue;
        }

        eventsCreated++;
        
        // Create local metadata with auto-detected category
        const categoryId = determineCategoryId(event.summary, event.categories);
        
        const { error: insertMetaError } = await supabaseClient
          .from('events_local_meta')
          .insert({
            external_event_id: newExternal.id,
            user_id: user.id,
            category_id: categoryId,
            manually_set_category: false,
          });

        if (insertMetaError) {
          console.error(`   ❌ Error creating metadata:`, insertMetaError);
        } else {
          metadataCreated++;
        }

        await supabaseClient
          .from('event_sync_log')
          .insert({
            external_event_id: newExternal.id,
            calendar_id: calendarId,
            user_id: user.id,
            action: 'created',
            details: {
              title: event.summary,
              reason: op.reason,
            },
          });
      } catch (error: any) {
        console.error(`   ❌ Error in create operation:`, error);
        eventsFailed++;
        failedEvents.push({ title: op.event.summary, error: error.message });
      }
    }

    // Execute updates
    console.log('\n🔄 Executing UPDATE operations...');
    for (const op of syncOps.updates) {
      try {
        const event = op.event;
        console.log(`   🔄 Updating: "${event.summary}"`);
        
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
              status: event.status,
              method: event.method,
            },
            miss_count: 0, // Reset miss count
            updated_at: new Date().toISOString(),
          })
          .eq('id', op.dbRowId);

        if (updateError) {
          console.error(`   ❌ Error updating external event:`, updateError);
          eventsFailed++;
          failedEvents.push({ title: event.summary, error: updateError.message });
          continue;
        }

        eventsUpdated++;

        // Check if metadata exists and if category is manually set
        const { data: existingMeta } = await supabaseClient
          .from('events_local_meta')
          .select('*')
          .eq('external_event_id', op.dbRowId)
          .eq('user_id', user.id)
          .single();

        if (existingMeta) {
          if (existingMeta.manually_set_category) {
            metadataPreserved++;
            console.log(`   🔒 Category preserved (manually set)`);
          } else if (!isUnknownCategory(existingMeta.category_id)) {
            metadataAlreadyResolved++;
            console.log(`   ✅ Category already resolved, skipping auto-update`);
          } else {
            const newCategoryId = determineCategoryId(event.summary, event.categories);

            if (newCategoryId && newCategoryId !== existingMeta.category_id) {
              await supabaseClient
                .from('events_local_meta')
                .update({
                  category_id: newCategoryId,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingMeta.id);

              metadataAutoUpdated++;
              console.log(`   🎯 Category auto-backfilled`);
            }
          }
        } else {
          // Create metadata if it doesn't exist
          const categoryId = determineCategoryId(event.summary, event.categories);
          
          await supabaseClient
            .from('events_local_meta')
            .insert({
              external_event_id: op.dbRowId,
              user_id: user.id,
              category_id: categoryId,
              manually_set_category: false,
            });
          
          metadataCreated++;
        }

        await supabaseClient
          .from('event_sync_log')
          .insert({
            external_event_id: op.dbRowId,
            calendar_id: calendarId,
            user_id: user.id,
            action: 'updated',
            details: {
              title: event.summary,
              reason: op.reason,
            },
          });
      } catch (error: any) {
        console.error(`   ❌ Error in update operation:`, error);
        eventsFailed++;
        failedEvents.push({ title: op.event.summary, error: error.message });
      }
    }

    // Execute restores
    console.log('\n🔄 Executing RESTORE operations...');
    for (const op of syncOps.restores) {
      try {
        const event = op.event;
        console.log(`   ♻️ Restoring: "${event.summary}"`);
        
        const { error: restoreError } = await supabaseClient
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
              status: event.status,
              method: event.method,
            },
            miss_count: 0,
            deleted: false, // Restore
            deleted_at: null,
            deleted_at_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', op.dbRowId);

        if (restoreError) {
          console.error(`   ❌ Error restoring event:`, restoreError);
          eventsFailed++;
          failedEvents.push({ title: event.summary, error: restoreError.message });
          continue;
        }

        eventsRestored++;

        await supabaseClient
          .from('event_sync_log')
          .insert({
            external_event_id: op.dbRowId,
            calendar_id: calendarId,
            user_id: user.id,
            action: 'updated',
            details: {
              title: event.summary,
              reason: op.reason,
              restored: true,
            },
          });
      } catch (error: any) {
        console.error(`   ❌ Error in restore operation:`, error);
        eventsFailed++;
        failedEvents.push({ title: op.event.summary, error: error.message });
      }
    }

    // Execute soft deletes
    console.log('\n🔄 Executing SOFT DELETE operations...');
    for (const op of syncOps.softDeletes) {
      try {
        console.log(`   🗑️ Soft deleting: ${op.reason}`);
        
        const { error: softDeleteError } = await supabaseClient
          .from('events_external')
          .update({
            deleted: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', op.dbRowId);

        if (softDeleteError) {
          console.error(`   ❌ Error soft deleting event:`, softDeleteError);
          continue;
        }

        eventsSoftDeleted++;

        await supabaseClient
          .from('event_sync_log')
          .insert({
            external_event_id: op.dbRowId,
            calendar_id: calendarId,
            user_id: user.id,
            action: 'deleted',
            details: {
              reason: op.reason,
              soft_delete: true,
            },
          });
      } catch (error: any) {
        console.error(`   ❌ Error in soft delete operation:`, error);
      }
    }

    // Execute immediate deletes (soft delete only to preserve completion history)
    console.log('\n🔄 Executing IMMEDIATE DELETE operations (soft delete only)...');
    for (const op of syncOps.immediateDeletes) {
      try {
        console.log(`   ❌ Marking cancelled event as deleted: ${op.reason}`);
        
        const { error: deleteError } = await supabaseClient
          .from('events_external')
          .update({
            deleted: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', op.dbRowId);

        if (deleteError) {
          console.error(`   ❌ Error immediately deleting event:`, deleteError);
          continue;
        }

        eventsImmediatelyDeleted++;

        await supabaseClient
          .from('event_sync_log')
          .insert({
            external_event_id: op.dbRowId,
            calendar_id: calendarId,
            user_id: user.id,
            action: 'deleted',
            details: {
              reason: op.reason,
              soft_delete: true,
              cancelled: true,
            },
          });
      } catch (error: any) {
        console.error(`   ❌ Error in immediate delete operation:`, error);
      }
    }

    console.log('\n🔍 Auditing metadata for missing or unknown categories...');
    const { data: activeEvents, error: activeEventsError } = await supabaseClient
      .from('events_external')
      .select('id, title, raw_payload')
      .eq('provider_calendar_id', calendarId)
      .eq('deleted', false);

    if (activeEventsError) {
      console.error('   ❌ Failed to load active events for category audit:', activeEventsError);
    } else if (!activeEvents || activeEvents.length === 0) {
      console.log('   ℹ️ No active events to audit for categories.');
    } else {
      const activeEventIds = activeEvents.map((event) => event.id);
      const { data: metaRows, error: metaRowsError } = await supabaseClient
        .from('events_local_meta')
        .select('id, external_event_id, category_id, manually_set_category')
        .eq('user_id', user.id)
        .in('external_event_id', activeEventIds);

      if (metaRowsError) {
        console.error('   ❌ Failed to load metadata for category audit:', metaRowsError);
      } else {
        const metaList = metaRows || [];
        const eventsById = new Map(activeEvents.map((event) => [event.id, event]));
        const nowIso = new Date().toISOString();

        const metaUpdates: Array<{ id: string; category_id: string; updated_at: string }> = [];
        metaList.forEach((meta) => {
          if (meta.manually_set_category || !isUnknownCategory(meta.category_id)) {
            return;
          }

          const relatedEvent = eventsById.get(meta.external_event_id);
          if (!relatedEvent) {
            return;
          }

          const providerCategories = Array.isArray(relatedEvent.raw_payload?.categories)
            ? relatedEvent.raw_payload.categories.filter(
                (category: unknown): category is string =>
                  typeof category === 'string' && category.trim().length > 0
              )
            : undefined;

          const resolvedCategoryId = determineCategoryId(
            relatedEvent.title,
            providerCategories
          );

          if (resolvedCategoryId && resolvedCategoryId !== meta.category_id) {
            metaUpdates.push({
              id: meta.id,
              category_id: resolvedCategoryId,
              updated_at: nowIso,
            });
          }
        });

        if (metaUpdates.length > 0) {
          const { error: backfillError } = await supabaseClient
            .from('events_local_meta')
            .upsert(metaUpdates);

          if (backfillError) {
            console.error('   ❌ Failed to backfill metadata categories:', backfillError);
          } else {
            metadataBackfilled += metaUpdates.length;
            console.log(
              `   ✅ Backfilled categories for ${metaUpdates.length} metadata entr${
                metaUpdates.length === 1 ? 'y' : 'ies'
              }.`
            );
          }
        } else {
          console.log('   ℹ️ No metadata rows required category backfill.');
        }

        const metaByEventId = new Map(metaList.map((meta) => [meta.external_event_id, meta]));
        const missingMetaInserts = activeEvents
          .filter((event) => !metaByEventId.has(event.id))
          .map((event) => {
            const providerCategories = Array.isArray(event.raw_payload?.categories)
              ? event.raw_payload.categories.filter(
                  (category: unknown): category is string =>
                    typeof category === 'string' && category.trim().length > 0
                )
              : undefined;

            return {
              external_event_id: event.id,
              user_id: user.id,
              category_id: determineCategoryId(event.title, providerCategories),
              manually_set_category: false,
            };
          });

        if (missingMetaInserts.length > 0) {
          const { error: missingMetaError } = await supabaseClient
            .from('events_local_meta')
            .insert(missingMetaInserts);

          if (missingMetaError) {
            console.error('   ❌ Failed to create missing metadata rows:', missingMetaError);
          } else {
            metadataCreated += missingMetaInserts.length;
            metadataCreatedDuringBackfill += missingMetaInserts.length;
            console.log(
              `   ✅ Created ${missingMetaInserts.length} missing metadata entr${
                missingMetaInserts.length === 1 ? 'y' : 'ies'
              }.`
            );
          }
        }
      }
    }

    console.log('\n📊 ========== SYNC SUMMARY (computeSyncOps v4) ==========');
    console.log(`   📥 Total events in iCal feed: ${events.length}`);
    console.log(`   ➕ NEW external events created: ${eventsCreated}`);
    console.log(`   🔄 Existing external events updated: ${eventsUpdated}`);
    console.log(`   ♻️ Events restored: ${eventsRestored}`);
    console.log(`   🗑️ Events soft-deleted: ${eventsSoftDeleted}`);
    console.log(`   ❌ Events cancelled (soft-deleted): ${eventsImmediatelyDeleted}`);
    console.log(`   ➕ NEW local metadata created: ${metadataCreated}`);
    console.log(`   🔒 Local metadata preserved (manually set): ${metadataPreserved}`);
    console.log(`   ✅ Metadata already resolved (skipped): ${metadataAlreadyResolved}`);
    console.log(`   🎯 Metadata auto-updated during sync: ${metadataAutoUpdated}`);
    console.log(`   ♻️ Metadata backfilled post-sync: ${metadataBackfilled}`);
    console.log(`   ➕ Metadata created during backfill: ${metadataCreatedDuringBackfill}`);
    console.log(`   ❌ Events FAILED to process: ${eventsFailed}`);
    
    if (failedEvents.length > 0) {
      console.log('\n   ⚠️ FAILED EVENTS:');
      failedEvents.forEach((failed, index) => {
        console.log(`      ${index + 1}. "${failed.title}": ${failed.error}`);
      });
    }
    
    console.log(`   ✅ GUARANTEE: Manually set categories are NEVER overwritten`);
    console.log('========================================================\n');

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

    console.log('🔄 ========== SYNC COMPLETED (computeSyncOps v4) ==========\n');

    return new Response(
      JSON.stringify({
        success: true,
        eventCount: events.length,
        eventsCreated,
        eventsUpdated,
        eventsRestored,
        eventsSoftDeleted,
        eventsImmediatelyDeleted,
        metadataCreated,
        metadataPreserved,
        metadataAlreadyResolved,
        metadataAutoUpdated,
        metadataBackfilled,
        metadataCreatedDuringBackfill,
        eventsFailed,
        failedEvents: failedEvents.length > 0 ? failedEvents : undefined,
        message: `Successfully synced ${events.length} events using computeSyncOps. ${eventsCreated} created, ${eventsUpdated} updated, ${eventsRestored} restored, ${eventsSoftDeleted} soft-deleted, ${eventsImmediatelyDeleted} cancelled (soft-deleted). ${metadataPreserved} manually set categories preserved, ${metadataAutoUpdated} categories auto-backfilled during sync, ${metadataBackfilled} categories backfilled post-sync.${eventsFailed > 0 ? ` WARNING: ${eventsFailed} events failed to process.` : ''}`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('❌ Error in sync-external-calendar-v4:', error);
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
