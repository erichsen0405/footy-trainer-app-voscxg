
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
}

function formatTimeFromICALTime(icalTime: any): { date: string; time: string; isAllDay: boolean } {
  try {
    // Check if this is an all-day event
    const isAllDay = icalTime.isDate || false;
    
    console.log('Parsing ICAL time:', {
      original: icalTime.toString(),
      timezone: icalTime.zone?.tzid || 'none',
      isAllDay: isAllDay,
      isDate: icalTime.isDate,
    });
    
    // For all-day events, use the date components directly without timezone conversion
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
    
    // For timed events, we need to handle timezone properly
    // ICAL.js already converts to the correct timezone when calling toJSDate()
    // The issue is that if the event is in UTC, toJSDate() gives us UTC time
    // We need to convert that to Copenhagen time
    
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
    
    // If the event has no timezone or is in UTC, we need to convert to Copenhagen
    // If it already has a timezone, ICAL.js has already handled it
    let copenhagenDate: Date;
    
    if (!originalTimezone || originalTimezone === 'UTC' || originalTimezone === 'Z') {
      // Event is in UTC, convert to Copenhagen
      // Use the ICAL time components directly and interpret them as UTC
      const utcDate = new Date(Date.UTC(
        icalTime.year,
        icalTime.month - 1, // JavaScript months are 0-indexed
        icalTime.day,
        icalTime.hour,
        icalTime.minute,
        icalTime.second || 0
      ));
      
      console.log('UTC date created:', utcDate.toISOString());
      copenhagenDate = utcDate;
    } else {
      // Event already has a timezone, use the JS Date as-is
      copenhagenDate = jsDate;
    }
    
    // Now format this date in Copenhagen timezone
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
    // Fallback to current date/time in Copenhagen
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
  
  // Convert webcal:// to https://
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
      
      // Parse start date/time with Copenhagen timezone conversion
      const startInfo = formatTimeFromICALTime(event.startDate);
      const endInfo = formatTimeFromICALTime(event.endDate);
      
      // Extract categories from the event
      // Categories can be stored in the CATEGORIES property
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
      
      console.log('Event parsed:', {
        summary: event.summary,
        startDate: startInfo.date,
        startTime: startInfo.time,
        isAllDay: startInfo.isAllDay,
        categories: categories,
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
      };
    });
    
    return events;
  } catch (error) {
    console.error('Error parsing iCal data:', error);
    throw error;
  }
}

async function findOrCreateCategoryMapping(
  supabaseClient: any,
  userId: string,
  externalCategory: string,
  userCategories: any[]
): Promise<string> {
  // First, check if we have a mapping for this external category
  const { data: existingMapping } = await supabaseClient
    .from('category_mappings')
    .select('internal_category_id')
    .eq('user_id', userId)
    .eq('external_category', externalCategory)
    .single();

  if (existingMapping) {
    console.log(`Found existing mapping: ${externalCategory} -> ${existingMapping.internal_category_id}`);
    return existingMapping.internal_category_id;
  }

  // Try to find a matching category by name (case-insensitive)
  const normalizedExternal = externalCategory.toLowerCase().trim();
  const matchingCategory = userCategories.find(
    (cat) => cat.name.toLowerCase().trim() === normalizedExternal
  );

  if (matchingCategory) {
    console.log(`Found matching category by name: ${externalCategory} -> ${matchingCategory.name}`);
    
    // Create the mapping for future use
    await supabaseClient
      .from('category_mappings')
      .insert({
        user_id: userId,
        external_category: externalCategory,
        internal_category_id: matchingCategory.id,
      });

    return matchingCategory.id;
  }

  // Try partial matching (e.g., "Training" matches "Træning")
  const partialMatch = userCategories.find((cat) => {
    const catName = cat.name.toLowerCase();
    return catName.includes(normalizedExternal) || normalizedExternal.includes(catName);
  });

  if (partialMatch) {
    console.log(`Found partial match: ${externalCategory} -> ${partialMatch.name}`);
    
    // Create the mapping
    await supabaseClient
      .from('category_mappings')
      .insert({
        user_id: userId,
        external_category: externalCategory,
        internal_category_id: partialMatch.id,
      });

    return partialMatch.id;
  }

  // No match found, create a new category
  console.log(`Creating new category for: ${externalCategory}`);
  
  // Generate a color based on the category name (simple hash)
  const colors = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4', '#FFEB3B', '#E91E63'];
  const colorIndex = externalCategory.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
  
  // Generate an emoji based on common category names
  const emojiMap: { [key: string]: string } = {
    'træning': '⚽',
    'training': '⚽',
    'kamp': '🏆',
    'match': '🏆',
    'game': '🏆',
    'møde': '📋',
    'meeting': '📋',
    'event': '📅',
    'begivenhed': '📅',
    'default': '📌',
  };
  
  const emoji = Object.keys(emojiMap).find((key) => 
    normalizedExternal.includes(key)
  ) ? emojiMap[Object.keys(emojiMap).find((key) => normalizedExternal.includes(key))!] : emojiMap.default;

  const { data: newCategory, error: categoryError } = await supabaseClient
    .from('activity_categories')
    .insert({
      user_id: userId,
      name: externalCategory,
      color: colors[colorIndex],
      emoji: emoji,
    })
    .select()
    .single();

  if (categoryError) {
    console.error('Error creating category:', categoryError);
    throw categoryError;
  }

  // Create the mapping
  await supabaseClient
    .from('category_mappings')
    .insert({
      user_id: userId,
      external_category: externalCategory,
      internal_category_id: newCategory.id,
    });

  console.log(`Created new category: ${externalCategory} with ID ${newCategory.id}`);
  return newCategory.id;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    console.log('User authenticated:', user.id);

    // Get the calendar ID from the request
    const { calendarId } = await req.json();
    
    if (!calendarId) {
      throw new Error('Calendar ID is required');
    }

    console.log('Syncing calendar:', calendarId);

    // Fetch the calendar from the database
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

    // Fetch and parse the iCal data
    const events = await fetchAndParseICalendar(calendar.ics_url);
    console.log(`Parsed ${events.length} events`);

    // Get all user's categories for mapping
    const { data: userCategories } = await supabaseClient
      .from('activity_categories')
      .select('*')
      .eq('user_id', user.id);

    let defaultCategoryId = userCategories && userCategories.length > 0 ? userCategories[0].id : null;

    // If no category exists, create a default one
    if (!defaultCategoryId) {
      const { data: newCategory, error: categoryError } = await supabaseClient
        .from('activity_categories')
        .insert({
          user_id: user.id,
          name: 'Træning',
          color: '#4CAF50',
          emoji: '⚽',
        })
        .select()
        .single();

      if (categoryError) {
        console.error('Error creating category:', categoryError);
      } else {
        defaultCategoryId = newCategory.id;
        userCategories.push(newCategory);
      }
    }

    // Delete existing external activities for this calendar
    const { error: deleteError } = await supabaseClient
      .from('activities')
      .delete()
      .eq('external_calendar_id', calendarId)
      .eq('user_id', user.id);

    if (deleteError) {
      console.error('Error deleting old activities:', deleteError);
    }

    // Process each event and determine its category
    const activitiesToInsert = await Promise.all(
      events.map(async (event) => {
        let categoryId = defaultCategoryId;
        let externalCategory = null;

        // If the event has categories, try to map them
        if (event.categories && event.categories.length > 0) {
          // Use the first category
          externalCategory = event.categories[0];
          
          try {
            categoryId = await findOrCreateCategoryMapping(
              supabaseClient,
              user.id,
              externalCategory,
              userCategories
            );
          } catch (error) {
            console.error('Error mapping category:', error);
            // Fall back to default category
            categoryId = defaultCategoryId;
          }
        }

        console.log('Inserting activity with Copenhagen time:', {
          title: event.summary,
          date: event.startDateString,
          time: event.startTimeString,
          isAllDay: event.isAllDay,
          originalTimezone: event.timezone,
          category: externalCategory || 'default',
          categoryId: categoryId,
        });
        
        return {
          user_id: user.id,
          title: event.summary,
          activity_date: event.startDateString,
          activity_time: event.startTimeString,
          location: event.location || 'Ingen lokation',
          category_id: categoryId,
          is_external: true,
          external_calendar_id: calendarId,
          external_event_id: event.uid,
          external_category: externalCategory,
        };
      })
    );

    if (activitiesToInsert.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('activities')
        .insert(activitiesToInsert);

      if (insertError) {
        console.error('Error inserting activities:', insertError);
        throw insertError;
      }

      console.log(`Inserted ${activitiesToInsert.length} activities with Copenhagen timezone and intelligent category mapping`);
    }

    // Update the calendar's last_fetched and event_count
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

    return new Response(
      JSON.stringify({
        success: true,
        eventCount: events.length,
        message: `Successfully synced ${events.length} events with intelligent category mapping`,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in sync-external-calendar:', error);
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
