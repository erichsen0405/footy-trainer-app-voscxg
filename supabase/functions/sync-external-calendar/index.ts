
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

interface CategoryKeywords {
  categoryName: string;
  keywords: string[];
  priority: number;
}

const DEFAULT_CATEGORY_KEYWORDS: CategoryKeywords[] = [
  {
    categoryName: 'Kamp',
    keywords: ['kamp', 'match', 'game', 'turnering', 'tournament', 'finale', 'semifinale', 'kvartfinale'],
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
    keywords: ['møde', 'meeting', 'samtale', 'briefing', 'debriefing', 'evaluering'],
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
): Promise<string | null> {
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

  const normalizedExternal = externalCategory.toLowerCase().trim();
  const matchingCategory = userCategories.find(
    (cat) => cat.name.toLowerCase().trim() === normalizedExternal
  );

  if (matchingCategory) {
    console.log(`Found matching category by name: ${externalCategory} -> ${matchingCategory.name}`);
    
    await supabaseClient
      .from('category_mappings')
      .insert({
        user_id: userId,
        external_category: externalCategory,
        internal_category_id: matchingCategory.id,
      });

    return matchingCategory.id;
  }

  const partialMatch = userCategories.find((cat) => {
    const catName = cat.name.toLowerCase();
    return catName.includes(normalizedExternal) || normalizedExternal.includes(catName);
  });

  if (partialMatch) {
    console.log(`Found partial match: ${externalCategory} -> ${partialMatch.name}`);
    
    await supabaseClient
      .from('category_mappings')
      .insert({
        user_id: userId,
        external_category: externalCategory,
        internal_category_id: partialMatch.id,
      });

    return partialMatch.id;
  }

  console.log(`No matching category found for: ${externalCategory}`);
  return null;
}

async function ensureUnknownCategory(
  supabaseClient: any,
  userId: string
): Promise<string> {
  const { data: existingCategory } = await supabaseClient
    .from('activity_categories')
    .select('*')
    .eq('user_id', userId)
    .ilike('name', 'ukendt')
    .single();

  if (existingCategory) {
    console.log('Found existing "Ukendt" category:', existingCategory.id);
    return existingCategory.id;
  }

  console.log('Creating "Ukendt" category for user:', userId);
  const { data: newCategory, error: categoryError } = await supabaseClient
    .from('activity_categories')
    .insert({
      user_id: userId,
      name: 'Ukendt',
      color: '#9E9E9E',
      emoji: '❓',
    })
    .select()
    .single();

  if (categoryError) {
    console.error('Error creating "Ukendt" category:', categoryError);
    throw categoryError;
  }

  console.log('Created "Ukendt" category:', newCategory.id);
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

    console.log('🔄 ========== SYNC STARTED ==========');
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

    const unknownCategoryId = await ensureUnknownCategory(supabaseClient, user.id);

    const { data: refreshedCategories } = await supabaseClient
      .from('activity_categories')
      .select('*')
      .eq('user_id', user.id);

    // CRITICAL: Fetch existing external activities with manually_set_category flag
    console.log('📋 Fetching existing activities from database...');
    const { data: existingActivities } = await supabaseClient
      .from('activities')
      .select('id, external_event_id, category_id, manually_set_category, activity_categories(name)')
      .eq('external_calendar_id', calendarId)
      .eq('user_id', user.id);

    console.log(`Found ${existingActivities?.length || 0} existing activities in database`);

    // CRITICAL FIX: Double-check the manually_set_category values
    if (existingActivities && existingActivities.length > 0) {
      console.log('🔍 VERIFYING manually_set_category flags in database:');
      for (const act of existingActivities) {
        const flagValue = act.manually_set_category;
        const flagType = typeof flagValue;
        console.log(`  Activity ${act.id}: manually_set_category = ${flagValue} (type: ${flagType})`);
      }
    }

    // Create a map of existing activities by external_event_id
    const existingActivitiesMap = new Map();
    if (existingActivities) {
      console.log('📊 Existing activities status:');
      existingActivities.forEach((activity: any) => {
        const manuallySet = activity.manually_set_category === true;
        existingActivitiesMap.set(activity.external_event_id, {
          id: activity.id,
          categoryId: activity.category_id,
          categoryName: activity.activity_categories?.name || 'Unknown',
          manuallySetCategory: manuallySet,
        });
        
        // Log each existing activity's status
        const eventIdShort = activity.external_event_id.substring(0, 30);
        console.log(`  📌 "${eventIdShort}..." -> Category: "${activity.activity_categories?.name || 'Unknown'}", Manually set: ${manuallySet} (raw: ${activity.manually_set_category})`);
      });
    }

    // Get the list of external event IDs from the fetched events
    const fetchedEventIds = new Set(events.map(event => event.uid));

    // Delete activities that no longer exist in the external calendar
    const activitiesToDelete = existingActivities?.filter(
      (activity: any) => !fetchedEventIds.has(activity.external_event_id)
    ) || [];

    if (activitiesToDelete.length > 0) {
      const idsToDelete = activitiesToDelete.map((a: any) => a.id);
      const { error: deleteError } = await supabaseClient
        .from('activities')
        .delete()
        .in('id', idsToDelete);

      if (deleteError) {
        console.error('Error deleting removed activities:', deleteError);
      } else {
        console.log(`Deleted ${activitiesToDelete.length} activities that no longer exist in calendar`);
      }
    }

    let categoriesFromExplicitMapping = 0;
    let categoriesFromNameParsing = 0;
    let categoriesAssignedToUnknown = 0;
    let categoriesPreserved = 0;
    let activitiesUpdated = 0;
    let activitiesCreated = 0;

    console.log('🔄 Processing events...');
    const activitiesToUpsert = await Promise.all(
      events.map(async (event) => {
        const existingActivity = existingActivitiesMap.get(event.uid);
        
        let categoryId = unknownCategoryId;
        let externalCategory = null;
        let assignmentMethod = 'unknown';

        console.log(`\n📝 Processing event: "${event.summary}"`);
        console.log(`   External ID: ${event.uid.substring(0, 30)}...`);

        // CRITICAL: Check if this activity has manually_set_category = true
        if (existingActivity) {
          console.log(`   ✅ Found existing activity in database`);
          console.log(`   📊 Current category: "${existingActivity.categoryName}"`);
          console.log(`   🔒 Manually set flag: ${existingActivity.manuallySetCategory} (type: ${typeof existingActivity.manuallySetCategory})`);
          
          // CRITICAL FIX: Use strict equality check
          if (existingActivity.manuallySetCategory === true) {
            // User has manually set this category - NEVER change it
            categoryId = existingActivity.categoryId;
            assignmentMethod = 'manually_set';
            categoriesPreserved++;
            console.log(`   🔒 PRESERVING manually set category "${existingActivity.categoryName}" (manually_set_category=true)`);
          } else if (existingActivity.categoryName.toLowerCase() !== 'ukendt') {
            // Preserve existing non-"Ukendt" categories (backward compatibility)
            categoryId = existingActivity.categoryId;
            assignmentMethod = 'preserved';
            categoriesPreserved++;
            console.log(`   ✓ Preserving existing category "${existingActivity.categoryName}"`);
          } else {
            console.log(`   ⚠️ Existing category is "Ukendt", will try to assign new category`);
          }
        } else {
          console.log(`   ➕ New activity - will assign category`);
        }

        // Only assign new category if not manually set and not already assigned
        if (assignmentMethod === 'unknown') {
          // Try explicit category from calendar first
          if (event.categories && event.categories.length > 0) {
            externalCategory = event.categories[0];
            console.log(`   📋 Found explicit category in calendar: "${externalCategory}"`);
            
            try {
              const mappedCategoryId = await findOrCreateCategoryMapping(
                supabaseClient,
                user.id,
                externalCategory,
                refreshedCategories
              );
              
              if (mappedCategoryId) {
                categoryId = mappedCategoryId;
                assignmentMethod = 'explicit_category';
                categoriesFromExplicitMapping++;
                console.log(`   ✅ Mapped to category via explicit mapping`);
              } else {
                categoriesAssignedToUnknown++;
                console.log(`   ❌ No match for external category "${externalCategory}", assigning to "Ukendt"`);
              }
            } catch (error) {
              console.error('   ❌ Error mapping category:', error);
              categoriesAssignedToUnknown++;
            }
          }
          
          // Try name parsing if no explicit category worked
          if (assignmentMethod === 'unknown') {
            console.log(`   🔍 Trying name parsing for: "${event.summary}"`);
            const parsedCategory = parseActivityNameForCategory(event.summary, refreshedCategories);
            
            if (parsedCategory) {
              categoryId = parsedCategory.categoryId;
              externalCategory = parsedCategory.categoryName;
              assignmentMethod = `name_parsing (${parsedCategory.confidence}% confidence)`;
              categoriesFromNameParsing++;
              
              console.log(`   ✅ Assigned category "${parsedCategory.categoryName}" via name parsing (${parsedCategory.confidence}% confidence)`);
            } else {
              categoriesAssignedToUnknown++;
              console.log(`   ❌ No category match, assigning to "Ukendt"`);
            }
          }
        }

        if (existingActivity) {
          activitiesUpdated++;
        } else {
          activitiesCreated++;
        }
        
        // Build activity data
        const baseActivityData = {
          user_id: user.id,
          title: event.summary,
          activity_date: event.startDateString,
          activity_time: event.startTimeString,
          location: event.location || 'Ingen lokation',
          is_external: true,
          external_calendar_id: calendarId,
          external_event_id: event.uid,
          external_category: externalCategory,
        };

        if (existingActivity) {
          // Update existing activity
          if (existingActivity.manuallySetCategory === true) {
            // CRITICAL: Do NOT update category_id if manually set
            console.log(`   🔒 Keeping manually set category, NOT updating category_id`);
            return {
              ...baseActivityData,
              id: existingActivity.id,
              category_id: existingActivity.categoryId, // Keep existing category
              manually_set_category: true, // Preserve the flag
            };
          } else {
            // Update category normally
            console.log(`   🔄 Updating category_id to: ${categoryId}`);
            return {
              ...baseActivityData,
              id: existingActivity.id,
              category_id: categoryId,
              manually_set_category: false,
            };
          }
        } else {
          // Create new activity
          console.log(`   ➕ Creating new activity with category_id: ${categoryId}`);
          return {
            ...baseActivityData,
            category_id: categoryId,
            manually_set_category: false,
          };
        }
      })
    );

    // Separate updates and inserts
    const activitiesToUpdate = activitiesToUpsert.filter((a: any) => a.id);
    const activitiesToInsert = activitiesToUpsert.filter((a: any) => !a.id);

    console.log('\n📤 Applying database changes...');
    console.log(`   Updates: ${activitiesToUpdate.length}`);
    console.log(`   Inserts: ${activitiesToInsert.length}`);

    // Update existing activities
    if (activitiesToUpdate.length > 0) {
      for (const activity of activitiesToUpdate) {
        const { id, ...updateData } = activity;
        
        console.log(`\n🔄 Updating activity ${id}:`);
        console.log(`   Title: ${updateData.title}`);
        console.log(`   Category ID: ${updateData.category_id}`);
        console.log(`   Manually set: ${updateData.manually_set_category}`);
        
        const { error: updateError } = await supabaseClient
          .from('activities')
          .update(updateData)
          .eq('id', id);

        if (updateError) {
          console.error(`   ❌ Error updating activity:`, updateError);
        } else {
          console.log(`   ✅ Updated successfully`);
          
          // CRITICAL FIX: Verify the update by reading back the value
          const { data: verifyData, error: verifyError } = await supabaseClient
            .from('activities')
            .select('id, manually_set_category, category_id')
            .eq('id', id)
            .single();
          
          if (verifyError) {
            console.error(`   ⚠️ Could not verify update:`, verifyError);
          } else {
            console.log(`   ✅ VERIFIED: manually_set_category = ${verifyData.manually_set_category}, category_id = ${verifyData.category_id}`);
          }
        }
      }
      console.log(`\n✅ Updated ${activitiesToUpdate.length} existing activities`);
    }

    // Insert new activities
    if (activitiesToInsert.length > 0) {
      const { error: insertError } = await supabaseClient
        .from('activities')
        .insert(activitiesToInsert);

      if (insertError) {
        console.error('❌ Error inserting activities:', insertError);
        throw insertError;
      }

      console.log(`✅ Inserted ${activitiesToInsert.length} new activities`);
    }

    console.log('\n📊 Sync Summary:');
    console.log(`   🔒 Categories preserved (manually set): ${categoriesPreserved}`);
    console.log(`   📋 From explicit calendar categories: ${categoriesFromExplicitMapping}`);
    console.log(`   🔍 From name parsing: ${categoriesFromNameParsing}`);
    console.log(`   ❓ Assigned to "Ukendt": ${categoriesAssignedToUnknown}`);
    console.log(`   ➕ New activities created: ${activitiesCreated}`);
    console.log(`   🔄 Existing activities updated: ${activitiesUpdated}`);
    console.log(`   🗑️ Activities deleted: ${activitiesToDelete.length}`);

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

    console.log('🔄 ========== SYNC COMPLETED ==========\n');

    return new Response(
      JSON.stringify({
        success: true,
        eventCount: events.length,
        categoriesPreserved,
        categoriesFromExplicitMapping,
        categoriesFromNameParsing,
        categoriesAssignedToUnknown,
        activitiesCreated,
        activitiesUpdated,
        activitiesDeleted: activitiesToDelete.length,
        message: `Successfully synced ${events.length} events (${activitiesCreated} new, ${activitiesUpdated} updated, ${activitiesToDelete.length} deleted). ${categoriesPreserved} manually set categories preserved, ${categoriesFromNameParsing} via name parsing, ${categoriesFromExplicitMapping} via explicit categories, ${categoriesAssignedToUnknown} assigned to "Ukendt")`,
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
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
