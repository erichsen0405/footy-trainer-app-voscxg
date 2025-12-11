
# External Events Architecture - Separation of External Data and Local Metadata

## Problem Statement

The previous architecture stored external calendar events directly in the `activities` table alongside internal activities. This caused a critical issue: when synchronizing external calendars, the sync process would overwrite user-defined categories and other metadata, even when users had manually set them.

The core problem was that **external event data** (title, time, location from the calendar) and **local user metadata** (categories, reminders, custom fields) were stored in the same table, making it impossible to update one without potentially overwriting the other.

## Solution: Separation of Concerns

Following the ChatGPT suggestion, we've implemented a clean separation between:

1. **External Event Data** (`events_external` table) - Raw data from external calendars
2. **Local User Metadata** (`events_local_meta` table) - User-specific customizations
3. **Sync History** (`event_sync_log` table) - Audit trail for debugging

## Database Schema

### 1. `events_external` Table

Stores raw external calendar event data. This table is **only** updated by the sync process and never by user actions.

```sql
CREATE TABLE events_external (
  id UUID PRIMARY KEY,
  provider TEXT NOT NULL,  -- 'ics', 'google', 'outlook', 'caldav'
  provider_event_uid TEXT NOT NULL,  -- UID from external calendar
  provider_calendar_id UUID REFERENCES external_calendars(id),
  recurrence_id TEXT,  -- For recurring event exceptions
  
  -- Event data (from external source)
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  start_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_date DATE,
  end_time TIME,
  is_all_day BOOLEAN DEFAULT FALSE,
  
  -- Sync tracking
  external_last_modified TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  raw_payload JSONB,  -- Original iCal/JSON for reference
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(provider_calendar_id, provider_event_uid, recurrence_id)
);
```

**Key Points:**
- Contains ONLY data from the external calendar
- Updated ONLY by the sync process
- Never modified by user actions
- Unique constraint ensures no duplicates

### 2. `events_local_meta` Table

Stores user-specific metadata and overrides for external events.

```sql
CREATE TABLE events_local_meta (
  id UUID PRIMARY KEY,
  external_event_id UUID REFERENCES events_external(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  
  -- Local overrides (optional)
  category_id UUID REFERENCES activity_categories(id),
  local_title_override TEXT,
  local_description TEXT,
  local_start_override TIMESTAMPTZ,
  local_end_override TIMESTAMPTZ,
  
  -- Local metadata
  reminders JSONB DEFAULT '[]'::jsonb,
  pinned BOOLEAN DEFAULT FALSE,
  custom_fields JSONB DEFAULT '{}'::jsonb,
  
  -- Tracking
  last_local_modified TIMESTAMPTZ DEFAULT NOW(),
  manually_set_category BOOLEAN DEFAULT FALSE,  -- CRITICAL FLAG
  category_updated_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(external_event_id, user_id)
);
```

**Key Points:**
- Contains ONLY user-specific metadata
- Updated ONLY by user actions
- **`manually_set_category` flag** is the key to preventing overwrites
- When `manually_set_category = TRUE`, sync NEVER touches the category

### 3. `event_sync_log` Table

Tracks all synchronization actions for debugging and conflict resolution.

```sql
CREATE TABLE event_sync_log (
  id UUID PRIMARY KEY,
  external_event_id UUID REFERENCES events_external(id),
  calendar_id UUID REFERENCES external_calendars(id),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,  -- 'created', 'updated', 'deleted', 'ignored', 'conflict'
  details JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Points:**
- Audit trail for all sync operations
- Helps debug sync issues
- Can be used for conflict resolution UI

## Synchronization Flow

### 1. Fetch External Events

```typescript
const events = await fetchAndParseICalendar(calendar.ics_url);
```

### 2. For Each Event

#### A. Update/Create External Event

```typescript
// Check if external event exists
const existingExternal = existingEventsMap.get(event.uid);

if (existingExternal) {
  // Update external event data (title, time, location, etc.)
  await supabase
    .from('events_external')
    .update({
      title: event.summary,
      location: event.location,
      start_date: event.startDateString,
      start_time: event.startTimeString,
      // ... other external fields
    })
    .eq('id', existingExternal.id);
} else {
  // Create new external event
  const { data: newExternal } = await supabase
    .from('events_external')
    .insert({
      provider: 'ics',
      provider_event_uid: event.uid,
      title: event.summary,
      // ... other fields
    })
    .select('id')
    .single();
}
```

#### B. Handle Local Metadata

```typescript
const existingMeta = localMetaMap.get(event.uid);

if (existingMeta) {
  // Metadata exists - check if manually set
  if (existingMeta.manuallySetCategory) {
    // SKIP - User has manually set category
    console.log('🔒 Category preserved (manually set)');
  } else {
    // Auto-update category based on name parsing
    const categoryMatch = parseActivityNameForCategory(event.summary, userCategories);
    const newCategoryId = categoryMatch ? categoryMatch.categoryId : unknownCategoryId;
    
    await supabase
      .from('events_local_meta')
      .update({ category_id: newCategoryId })
      .eq('id', existingMeta.id);
  }
} else {
  // Create new metadata with auto-detected category
  const categoryMatch = parseActivityNameForCategory(event.summary, userCategories);
  const categoryId = categoryMatch ? categoryMatch.categoryId : unknownCategoryId;
  
  await supabase
    .from('events_local_meta')
    .insert({
      external_event_id: externalEventId,
      user_id: user.id,
      category_id: categoryId,
      manually_set_category: false,  // Auto-detected
    });
}
```

### 3. Log Sync Action

```typescript
await supabase
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
```

## User Actions

### Updating Category (Manual)

When a user manually changes a category:

```typescript
// For external activities
await supabase
  .from('events_local_meta')
  .update({
    category_id: newCategoryId,
    manually_set_category: true,  // CRITICAL FLAG
    category_updated_at: new Date().toISOString(),
    last_local_modified: new Date().toISOString(),
  })
  .eq('id', activityId)
  .eq('user_id', userId);
```

**Result:** The sync process will NEVER overwrite this category again.

### Viewing Activities

The `activities_combined` view provides a unified view of internal and external activities:

```sql
CREATE VIEW activities_combined AS
SELECT 
  COALESCE(elm.id, ee.id) as id,
  COALESCE(elm.local_title_override, ee.title) as title,
  COALESCE(DATE(elm.local_start_override), ee.start_date) as activity_date,
  elm.category_id,
  elm.manually_set_category,
  -- ... other fields
FROM events_external ee
LEFT JOIN events_local_meta elm ON ee.id = elm.external_event_id
UNION ALL
SELECT * FROM activities WHERE is_external = FALSE;
```

## Benefits

### 1. **Guaranteed Category Preservation**

Once a user manually sets a category, it is **guaranteed** to never be overwritten by sync:

```typescript
if (existingMeta.manuallySetCategory === true) {
  // SKIP - Never touch this category
  console.log('🔒 Category preserved');
  continue;
}
```

### 2. **Clean Separation of Concerns**

- External data changes → Update `events_external`
- User metadata changes → Update `events_local_meta`
- No conflicts, no overwrites

### 3. **Audit Trail**

Every sync action is logged in `event_sync_log`:

```sql
SELECT * FROM event_sync_log 
WHERE user_id = 'user-id' 
ORDER BY timestamp DESC;
```

### 4. **Flexible Overrides**

Users can override any field:

- Title: `local_title_override`
- Description: `local_description`
- Start time: `local_start_override`
- End time: `local_end_override`

### 5. **Future-Proof**

Easy to add new features:

- Two-way sync (write back to external calendar)
- Conflict resolution UI
- Custom reminders per event
- Event pinning
- Custom fields

## Migration

Existing external activities are migrated using:

```sql
SELECT * FROM migrate_external_activities();
```

This function:
1. Reads all external activities from `activities` table
2. Creates corresponding entries in `events_external`
3. Creates corresponding entries in `events_local_meta`
4. Preserves `manually_set_category` flags

## Client-Side Changes

### Loading Activities

```typescript
// Load external activities using NEW ARCHITECTURE
const { data: externalData } = await supabase
  .from('events_external')
  .select(`
    *,
    events_local_meta!inner(
      id,
      user_id,
      category_id,
      manually_set_category,
      activity_categories(*)
    )
  `)
  .eq('events_local_meta.user_id', userId);
```

### Updating Category

```typescript
if (isExternal) {
  // Update local metadata
  await supabase
    .from('events_local_meta')
    .update({
      category_id: newCategoryId,
      manually_set_category: true,
      category_updated_at: new Date().toISOString(),
    })
    .eq('id', activityId);
} else {
  // Update internal activity
  await supabase
    .from('activities')
    .update({ category_id: newCategoryId })
    .eq('id', activityId);
}
```

## Testing

### Verify Category Preservation

1. Sync external calendar → Activities get auto-assigned categories
2. Manually change category on an activity
3. Sync again → Verify category is NOT overwritten
4. Check `event_sync_log` → Should show "manually_set_preserved: true"

### Verify Sync Updates

1. Change event title in external calendar
2. Sync → Verify title is updated in app
3. Verify category is still preserved (if manually set)

## Conclusion

This architecture provides a **robust, scalable solution** for managing external calendar events while preserving user customizations. The separation of external data and local metadata ensures that:

- ✅ External events are always up-to-date
- ✅ User customizations are never lost
- ✅ Sync process is predictable and debuggable
- ✅ Future enhancements are easy to implement

The key insight is: **External data and user metadata are fundamentally different and should be stored separately.**
