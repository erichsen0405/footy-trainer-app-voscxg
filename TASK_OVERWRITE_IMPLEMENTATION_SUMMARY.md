
# Task Overwrite Implementation Summary

## Overview

This update enables overwriting existing tasks on activities when saving a task template again. This provides a way to update existing tasks across all activities.

## Key Changes

### 1. Modified Database Functions

#### `create_tasks_for_activity(p_activity_id uuid)`
**Before**: Skipped task creation if a task already existed for the activity-template combination.

**After**: 
- Checks if a task exists for the activity-template combination
- If exists: **UPDATES** the existing task with latest template data
- If not exists: **CREATES** a new task
- Updates: title, description, reminder_minutes, updated_at
- Recreates all subtasks from the template

#### `create_tasks_for_external_event(p_local_meta_id uuid)`
**Before**: Used `ON CONFLICT DO NOTHING` to avoid duplicates.

**After**:
- Checks if a task exists for the event-template combination
- If exists: **UPDATES** the existing task
- If not exists: **CREATES** a new task
- Same update logic as activity tasks

### 2. New Database Functions

#### `update_all_tasks_from_template(p_template_id uuid)`
Purpose: Update all existing tasks when a template is modified.

Logic:
1. Finds all activities with tasks linked to the template
2. Finds all external events with tasks linked to the template
3. Calls `create_tasks_for_activity()` or `create_tasks_for_external_event()` for each
4. These functions now update existing tasks instead of skipping

#### `trigger_update_tasks_on_template_change()`
Trigger function that:
- Fires AFTER UPDATE on `task_templates` table
- Checks if title, description, or reminder_minutes changed
- Calls `update_all_tasks_from_template()` to propagate changes

#### `trigger_update_tasks_on_subtask_change()`
Trigger function that:
- Fires AFTER INSERT, UPDATE, or DELETE on `task_template_subtasks` table
- Calls `update_all_tasks_from_template()` to propagate changes

### 3. Database Triggers

#### `update_tasks_on_template_change`
- Table: `task_templates`
- Timing: AFTER UPDATE
- Level: ROW
- Function: `trigger_update_tasks_on_template_change()`

#### `update_tasks_on_subtask_change`
- Table: `task_template_subtasks`
- Timing: AFTER INSERT OR UPDATE OR DELETE
- Level: ROW
- Function: `trigger_update_tasks_on_subtask_change()`

## How It Works

### Flow Diagram

```
User edits task template
         ↓
User clicks "Save"
         ↓
Frontend calls updateTask()
         ↓
Supabase updates task_templates table
         ↓
Trigger: update_tasks_on_template_change fires
         ↓
Calls: update_all_tasks_from_template()
         ↓
For each activity with this template:
    Calls: create_tasks_for_activity()
         ↓
    Checks if task exists
         ↓
    If exists: UPDATE task
    If not: CREATE task
         ↓
    Delete old subtasks
    Create new subtasks
         ↓
All tasks updated automatically
```

## Data Preservation

### What is preserved?
- `completed` status (whether task is completed)
- `activity_id` (link to activity)
- `task_template_id` (link to template)
- `id` (task ID)
- `created_at` (original creation timestamp)

### What is updated?
- `title` (from template)
- `description` (from template)
- `reminder_minutes` (from template)
- `updated_at` (set to now())

### What is recreated?
- All subtasks (deleted and recreated to ensure correct order and content)

## Benefits

1. **Single Source of Truth**: Edit template once, all tasks update automatically
2. **Consistency**: All tasks from same template always have same content
3. **No Duplicates**: System ensures no duplicate tasks are created
4. **Automatic**: No manual action required - happens automatically on save
5. **Preserves User Data**: Completed status is preserved

## Example Scenario

### Before Implementation:
```
1. Create task template "Preparation" with description "Remember boots"
2. Task is created on 10 activities
3. You discover an error and change description to "Remember boots and gloves"
4. The 10 existing tasks remain unchanged with old description
5. Only new activities get the updated description
```

### After Implementation:
```
1. Create task template "Preparation" with description "Remember boots"
2. Task is created on 10 activities
3. You discover an error and change description to "Remember boots and gloves"
4. All 10 existing tasks are automatically updated with new description
5. All future activities also get the updated description
```

## Technical Details

### Migrations Applied
1. `update_existing_activity_tasks_on_template_save`
   - Updates `create_tasks_for_activity()` function
   - Updates `create_tasks_for_external_event()` function
   - Creates `update_all_tasks_from_template()` function
   - Creates `trigger_update_tasks_on_template_change()` function
   - Creates trigger on `task_templates` table

2. `trigger_update_tasks_on_subtask_change`
   - Creates `trigger_update_tasks_on_subtask_change()` function
   - Creates trigger on `task_template_subtasks` table

### Database Objects Created/Modified

**Functions Modified:**
- `create_tasks_for_activity()` - Now updates instead of skipping
- `create_tasks_for_external_event()` - Now updates instead of skipping

**Functions Created:**
- `update_all_tasks_from_template()` - Updates all tasks from a template
- `trigger_update_tasks_on_template_change()` - Trigger function for template changes
- `trigger_update_tasks_on_subtask_change()` - Trigger function for subtask changes

**Triggers Created:**
- `update_tasks_on_template_change` on `task_templates`
- `update_tasks_on_subtask_change` on `task_template_subtasks`

## Testing

### Test Case 1: Update Template Title
```sql
-- 1. Create a task template
INSERT INTO task_templates (user_id, title, description)
VALUES ('user-id', 'Original Title', 'Original Description')
RETURNING id;

-- 2. Create an activity with this template's category
-- (Task will be auto-created via existing triggers)

-- 3. Update the template
UPDATE task_templates
SET title = 'Updated Title'
WHERE id = 'template-id';

-- 4. Verify task was updated
SELECT title FROM activity_tasks
WHERE task_template_id = 'template-id';
-- Should return 'Updated Title'
```

### Test Case 2: Update Subtasks
```sql
-- 1. Add a subtask to template
INSERT INTO task_template_subtasks (task_template_id, title, sort_order)
VALUES ('template-id', 'New Subtask', 0);

-- 2. Verify subtask was added to all activity tasks
SELECT COUNT(*) FROM activity_task_subtasks ats
JOIN activity_tasks at ON ats.activity_task_id = at.id
WHERE at.task_template_id = 'template-id'
AND ats.title = 'New Subtask';
-- Should return count of all activities with this template
```

## Performance Considerations

### Potential Impact
- Updating a template will trigger updates on ALL activities with tasks from that template
- For templates used on many activities (e.g., 100+), this could take a few seconds
- Updates happen in a transaction, so either all succeed or all fail

### Optimization
- Triggers only fire when relevant fields change (title, description, reminder_minutes)
- Subtask updates are batched (delete all, then insert all)
- Uses SECURITY DEFINER for efficient execution

### Monitoring
- Check `updated_at` timestamp on `activity_tasks` to see when tasks were last updated
- Use `RAISE NOTICE` statements in functions for debugging (visible in logs)

## Edge Cases Handled

1. **Template with no categories**: No tasks to update, function exits early
2. **Activity with no category**: No tasks created/updated
3. **External activities**: Handled separately via `create_tasks_for_external_event()`
4. **Completed tasks**: Completed status is preserved during update
5. **Deleted templates**: Tasks remain but are no longer linked (task_template_id becomes orphaned)

## Future Enhancements

Potential improvements:
1. **Selective Updates**: Allow users to choose which tasks to update
2. **Update History**: Track when and what was updated
3. **User Notifications**: Notify users when their tasks are auto-updated
4. **Rollback**: Ability to revert to previous task versions
5. **Batch Processing**: For large updates, process in background job
6. **Conflict Resolution**: Handle cases where user has manually edited a task

## Rollback Plan

If issues arise, rollback by:

1. **Drop the new triggers:**
```sql
DROP TRIGGER IF EXISTS update_tasks_on_template_change ON task_templates;
DROP TRIGGER IF EXISTS update_tasks_on_subtask_change ON task_template_subtasks;
```

2. **Restore old function behavior:**
```sql
-- Restore create_tasks_for_activity to skip existing tasks
-- (Use the old version from git history)
```

3. **Drop new functions:**
```sql
DROP FUNCTION IF EXISTS update_all_tasks_from_template(uuid);
DROP FUNCTION IF EXISTS trigger_update_tasks_on_template_change();
DROP FUNCTION IF EXISTS trigger_update_tasks_on_subtask_change();
```

## Conclusion

This implementation provides a seamless way to update existing tasks when templates are modified. It maintains data integrity, preserves user actions (completed status), and works automatically without requiring user intervention.

The solution is robust, handles edge cases, and provides a foundation for future enhancements to the task management system.
