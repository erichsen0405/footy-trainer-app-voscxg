
# Task Template Diagnostic Report

## Issue Analysis

The task template functionality is working correctly from a technical standpoint. The issue is a **category mismatch** between the task templates and activities.

## Current State

### Task Template
- **Template ID**: `d30df0ba-cf06-44f1-9e00-01d899077751`
- **Title**: "Test"
- **Assigned Categories**: 
  - "Møde" (Meeting)
  - "Kamp" (Match)

### Activities
- All recent activities have the category: **"Sprinttræning" (Sprint Training)**
- **Task Count**: 0 (because no task templates are assigned to this category)

## How It Works

The system automatically creates tasks for activities based on category matching:

1. When you create a **task template** and assign it to categories (e.g., "Møde", "Kamp")
2. The system automatically creates tasks for **all activities** in those categories
3. When you create a **new activity** with one of those categories, tasks are automatically added

## Solution

To see tasks appear on your activities, you have two options:

### Option 1: Assign Task Template to "Sprinttræning" Category
1. Go to the Tasks page
2. Edit the "Test" task template
3. Add "Sprinttræning" to the assigned categories
4. The system will automatically create tasks for all "Sprinttræning" activities

### Option 2: Create Activities with "Møde" or "Kamp" Categories
1. Create a new activity
2. Select "Møde" or "Kamp" as the category
3. The "Test" task will automatically appear on that activity

## Technical Details

### Database Triggers
The system uses PostgreSQL triggers to automatically manage tasks:

1. **`on_activity_created`**: When an activity is created, it calls `create_tasks_for_activity()`
2. **`on_task_template_category_added`**: When a category is assigned to a task template, it creates tasks for all matching activities
3. **`on_activity_category_changed`**: When an activity's category changes, it updates the tasks

### Function Logic
```sql
CREATE OR REPLACE FUNCTION public.create_tasks_for_activity(p_activity_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
declare
  v_category_id uuid;
  v_template record;
begin
  -- Get the category of the activity
  select category_id into v_category_id
  from activities
  where id = p_activity_id;

  -- Loop through all task templates for this category
  for v_template in
    select distinct tt.*
    from task_templates tt
    join task_template_categories ttc on ttc.task_template_id = tt.id
    where ttc.category_id = v_category_id
    and tt.user_id = (select user_id from activities where id = p_activity_id)
  loop
    -- Create the activity task
    insert into activity_tasks (
      activity_id,
      task_template_id,
      title,
      description,
      reminder_minutes
    )
    values (
      p_activity_id,
      v_template.id,
      v_template.title,
      v_template.description,
      v_template.reminder_minutes
    );
  end loop;
end;
$function$
```

## Verification Steps

After assigning the task template to the correct category:

1. Check existing activities:
   ```sql
   SELECT 
     a.title,
     ac.name as category,
     COUNT(at.id) as task_count
   FROM activities a
   LEFT JOIN activity_categories ac ON ac.id = a.category_id
   LEFT JOIN activity_tasks at ON at.activity_id = a.id
   WHERE a.is_external = false
   GROUP BY a.id, a.title, ac.name
   ORDER BY a.activity_date DESC
   LIMIT 10;
   ```

2. Create a new activity with the matching category and verify tasks appear

## Summary

✅ **The system is working correctly**
❌ **The issue is a category mismatch**

**Action Required**: Assign the task template to the "Sprinttræning" category or create activities with "Møde"/"Kamp" categories.
