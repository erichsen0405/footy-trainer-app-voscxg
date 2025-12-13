
# Task Template Bug Fixes

## Issues Fixed

### Bug 1: Duplicate Tasks on "Styrketræning" Activities
**Problem**: Each "Styrketræning" activity had 5 identical tasks instead of 1, even though only one task template was assigned to the "Fysisk træning" category.

**Root Cause**: Tasks were being created multiple times, with 4 tasks having `task_template_id = null` (manually created or duplicated) and only 1 properly linked to the template.

**Solution**:
1. **Database Cleanup**: Removed 852 duplicate tasks across 213 activities using a migration that deletes tasks without a `task_template_id` when a duplicate task with a `task_template_id` exists for the same activity.

2. **Prevention**: Added a unique index to prevent future duplicates:
   ```sql
   CREATE UNIQUE INDEX idx_activity_tasks_unique_template 
   ON activity_tasks(activity_id, task_template_id) 
   WHERE task_template_id IS NOT NULL;
   ```

**Result**: Each "Styrketræning" activity now has exactly 1 task as expected.

---

### Bug 2: Task Templates Not Showing on "Kampe" Activities
**Problem**: Task templates assigned to the "Kamp" category were not appearing on "Kampe" activities, even though the category was properly assigned.

**Root Cause**: "Kampe" activities are **external events** (from `events_external` table), not internal activities (from `activities` table). The task template system only worked with internal activities.

**Solution**:
1. **New Table**: Created `external_event_tasks` table to store tasks for external events:
   ```sql
   CREATE TABLE external_event_tasks (
     id uuid PRIMARY KEY,
     local_meta_id uuid REFERENCES events_local_meta(id),
     task_template_id uuid REFERENCES task_templates(id),
     title text NOT NULL,
     description text,
     completed boolean DEFAULT false,
     reminder_minutes integer,
     ...
   );
   ```

2. **Database Functions**: Created functions to automatically create tasks for external events based on their category:
   - `create_tasks_for_external_event()`: Creates tasks for a specific external event
   - `trigger_create_tasks_for_external_event()`: Trigger that runs when external event category changes
   - `trigger_fix_external_tasks_on_template_category_change()`: Trigger that runs when task template categories are updated

3. **Frontend Updates**: Updated `useFootballData.ts` to:
   - Load external event tasks when loading activities
   - Handle task completion for both internal and external tasks
   - Handle task deletion for both internal and external tasks

4. **Backfill**: Automatically created tasks for all existing external events with categories (6 "Kamp" events now have 2 tasks each: "Pak fodboldtaske" and "Fokuspunkter til træning og kamp")

**Result**: Task templates now work correctly for external calendar events like "Kampe".

---

## Database Changes

### New Table
- `external_event_tasks`: Stores tasks for external calendar events

### New Functions
- `create_tasks_for_external_event(p_local_meta_id uuid)`: Creates tasks for an external event based on its category
- `trigger_create_tasks_for_external_event()`: Trigger function for external event category changes
- `trigger_fix_external_tasks_on_template_category_change()`: Trigger function for task template category changes

### New Triggers
- `on_external_event_category_changed`: Runs when external event category is set or changed
- `on_task_template_category_added_external`: Runs when a task template is assigned to a new category

### New Indexes
- `idx_activity_tasks_unique_template`: Prevents duplicate tasks from the same template on internal activities
- `idx_external_event_tasks_unique_template`: Prevents duplicate tasks from the same template on external events
- `idx_external_event_tasks_local_meta`: Performance index for external event tasks
- `idx_external_event_tasks_template`: Performance index for template lookups

### RLS Policies
Added 4 RLS policies for `external_event_tasks` table to ensure users can only access their own tasks.

---

## Frontend Changes

### `hooks/useFootballData.ts`
1. **Load External Event Tasks**: Updated the query to include `external_event_tasks` when loading external activities
2. **Process External Tasks**: Map external event tasks to the same `Task` interface used for internal tasks
3. **Toggle Task Completion**: Updated to handle both internal (`activity_tasks`) and external (`external_event_tasks`) tasks
4. **Delete Task**: Updated to handle both internal and external tasks

---

## Testing

### Verified Results

1. **Styrketræning Activities**: 
   - Before: 5 duplicate tasks per activity
   - After: 1 task per activity ✅

2. **Kamp Activities**:
   - Before: 0 tasks
   - After: 2 tasks per activity ("Pak fodboldtaske" and "Fokuspunkter til træning og kamp") ✅

3. **Database Integrity**:
   - Unique constraints prevent future duplicates ✅
   - RLS policies protect user data ✅
   - Triggers automatically maintain task consistency ✅

---

## Migration Files

1. `fix_task_template_bugs.sql`: Removes duplicate tasks and adds unique constraint
2. `add_external_event_tasks_support_v2.sql`: Adds full support for external event tasks

---

## Notes

- External event tasks are stored separately from internal activity tasks to maintain the separation between external calendar data and internal app data
- The system now automatically creates tasks for external events when:
  - A new external event is imported with a category
  - An external event's category is changed
  - A task template is assigned to a new category
- Task templates work identically for both internal and external activities from the user's perspective
