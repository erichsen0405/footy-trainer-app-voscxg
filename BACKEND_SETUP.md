
# Football Training App - Backend Setup Documentation

## Overview
This document describes the complete Supabase backend setup for the Football Training App. The backend is fully configured with database tables, Row Level Security (RLS) policies, triggers, and helper functions.

## Database Schema

### 1. **activity_categories**
Stores activity categories (e.g., Training, Match, Tournament)

**Columns:**
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `name` (text) - Category name
- `color` (text) - Hex color code
- `emoji` (text) - Emoji icon
- `created_at` (timestamp)
- `updated_at` (timestamp)

**RLS Policies:**
- Users can only view, insert, update, and delete their own categories

---

### 2. **task_templates**
Stores reusable task templates that can be assigned to categories

**Columns:**
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `title` (text) - Task title
- `description` (text, nullable) - Task description
- `reminder_minutes` (integer, nullable) - Minutes before activity to send reminder
- `created_at` (timestamp)
- `updated_at` (timestamp)

**RLS Policies:**
- Users can only view, insert, update, and delete their own task templates

---

### 3. **task_template_categories**
Junction table linking task templates to categories (many-to-many)

**Columns:**
- `id` (uuid, primary key)
- `task_template_id` (uuid, references task_templates)
- `category_id` (uuid, references activity_categories)
- `created_at` (timestamp)

**Unique Constraint:** (task_template_id, category_id)

**RLS Policies:**
- Users can only manage links for their own task templates

---

### 4. **task_template_subtasks**
Stores subtasks/checkboxes for task templates

**Columns:**
- `id` (uuid, primary key)
- `task_template_id` (uuid, references task_templates)
- `title` (text) - Subtask title
- `sort_order` (integer) - Display order
- `created_at` (timestamp)

**RLS Policies:**
- Users can only manage subtasks for their own task templates

---

### 5. **activities**
Stores individual activities (training sessions, matches, etc.)

**Columns:**
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `title` (text) - Activity title
- `activity_date` (date) - Date of activity
- `activity_time` (time) - Time of activity
- `location` (text, nullable) - Activity location
- `category_id` (uuid, references activity_categories, nullable)
- `is_external` (boolean) - Whether from external calendar
- `external_calendar_id` (uuid, nullable) - Reference to external calendar
- `external_event_id` (text, nullable) - External event UID
- `created_at` (timestamp)
- `updated_at` (timestamp)

**RLS Policies:**
- Users can only view, insert, update, and delete their own activities

**Indexes:**
- `activities_user_id_idx` on user_id
- `activities_date_idx` on activity_date
- `activities_category_id_idx` on category_id
- `activities_external_calendar_id_idx` on external_calendar_id (where not null)

---

### 6. **activity_tasks**
Stores tasks associated with specific activities

**Columns:**
- `id` (uuid, primary key)
- `activity_id` (uuid, references activities)
- `task_template_id` (uuid, references task_templates, nullable) - Link to template if created from one
- `title` (text) - Task title
- `description` (text, nullable) - Task description
- `completed` (boolean) - Completion status
- `reminder_minutes` (integer, nullable) - Minutes before activity to send reminder
- `created_at` (timestamp)
- `updated_at` (timestamp)

**RLS Policies:**
- Users can only manage tasks for their own activities

**Indexes:**
- `activity_tasks_activity_id_idx` on activity_id
- `activity_tasks_template_id_idx` on task_template_id (where not null)

---

### 7. **activity_task_subtasks**
Stores subtasks/checkboxes for activity tasks

**Columns:**
- `id` (uuid, primary key)
- `activity_task_id` (uuid, references activity_tasks)
- `title` (text) - Subtask title
- `completed` (boolean) - Completion status
- `sort_order` (integer) - Display order
- `created_at` (timestamp)

**RLS Policies:**
- Users can only manage subtasks for their own activity tasks

---

### 8. **external_calendars**
Stores external calendar subscriptions (iCal format)

**Columns:**
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `name` (text) - Calendar name
- `ics_url` (text) - iCal URL
- `enabled` (boolean) - Whether calendar is active
- `last_fetched` (timestamp, nullable) - Last fetch time
- `event_count` (integer) - Number of events
- `created_at` (timestamp)
- `updated_at` (timestamp)

**RLS Policies:**
- Users can only view, insert, update, and delete their own external calendars

---

### 9. **weekly_performance**
Stores weekly performance statistics and trophy awards

**Columns:**
- `id` (uuid, primary key)
- `user_id` (uuid, references auth.users)
- `week_number` (integer) - ISO week number
- `year` (integer) - Year
- `trophy_type` (text) - 'gold', 'silver', or 'bronze'
- `percentage` (integer) - Completion percentage (0-100)
- `completed_tasks` (integer) - Number of completed tasks
- `total_tasks` (integer) - Total number of tasks
- `created_at` (timestamp)

**Unique Constraint:** (user_id, week_number, year)

**RLS Policies:**
- Users can only view, insert, update, and delete their own performance records

**Indexes:**
- `weekly_performance_user_id_idx` on user_id
- `weekly_performance_year_week_idx` on (year, week_number)

---

## Database Functions

### 1. **create_tasks_for_activity(p_activity_id uuid)**
Automatically creates tasks for an activity based on its category.

**Logic:**
- Finds all task templates linked to the activity's category
- Creates activity_tasks for each template
- Copies subtasks from template to activity task

**Usage:** Called automatically by trigger when activity is created or category changes

---

### 2. **calculate_weekly_performance(p_user_id uuid, p_week_number integer, p_year integer)**
Calculates performance statistics for a specific week.

**Returns:**
- `percentage` - Completion percentage
- `completed_tasks` - Number of completed tasks
- `total_tasks` - Total number of tasks
- `trophy_type` - 'gold' (≥80%), 'silver' (≥60%), or 'bronze' (<60%)

---

### 3. **update_weekly_performance(p_user_id uuid, p_week_number integer, p_year integer)**
Updates or inserts weekly performance record.

**Logic:**
- Calls calculate_weekly_performance
- Upserts record in weekly_performance table

**Usage:** Called automatically by trigger when task completion changes

---

### 4. **seed_default_data_for_user(p_user_id uuid)**
Seeds default categories and task templates for new users.

**Creates:**
- 5 default categories: Træning, Styrketræning, VR træning, Kamp, Turnering
- 6 default task templates with appropriate category assignments

**Usage:** Called automatically when new user signs up

---

## Database Triggers

### 1. **on_activity_created**
Fires after activity insert.

**Action:** Calls `create_tasks_for_activity()` if activity has category and is not external

---

### 2. **on_activity_category_changed**
Fires after activity update when category changes.

**Action:**
- Deletes existing template-linked tasks
- Creates new tasks based on new category

---

### 3. **on_activity_task_changed**
Fires after activity_tasks insert, update, or delete.

**Action:** Calls `update_weekly_performance()` to recalculate weekly stats

---

### 4. **on_user_created**
Fires after new user is created in auth.users.

**Action:** Calls `seed_default_data_for_user()` to set up default data

---

### 5. **update_*_timestamp**
Fires before update on various tables.

**Action:** Sets `updated_at` to current timestamp

**Applied to:**
- activity_categories
- task_templates
- activities
- activity_tasks
- external_calendars

---

## Row Level Security (RLS)

All tables have RLS enabled with policies ensuring:

1. **User Isolation:** Users can only access their own data
2. **Cascading Access:** Users can access related data (e.g., subtasks of their tasks)
3. **Full CRUD:** Users have complete control over their own data

### Policy Pattern Example:
```sql
-- SELECT policy
create policy "Users can view their own X"
  on table_name for select
  using (auth.uid() = user_id);

-- INSERT policy
create policy "Users can insert their own X"
  on table_name for insert
  with check (auth.uid() = user_id);

-- UPDATE policy
create policy "Users can update their own X"
  on table_name for update
  using (auth.uid() = user_id);

-- DELETE policy
create policy "Users can delete their own X"
  on table_name for delete
  using (auth.uid() = user_id);
```

---

## Data Flow

### Creating an Activity:
1. User creates activity with category
2. **Trigger:** `on_activity_created` fires
3. **Function:** `create_tasks_for_activity()` runs
4. Tasks are automatically created based on category's task templates
5. Subtasks are copied from templates

### Completing a Task:
1. User marks task as completed
2. **Trigger:** `on_activity_task_changed` fires
3. **Function:** `update_weekly_performance()` runs
4. Weekly performance record is updated/created
5. Trophy type is recalculated based on new percentage

### Changing Activity Category:
1. User changes activity category
2. **Trigger:** `on_activity_category_changed` fires
3. Old template-linked tasks are deleted
4. **Function:** `create_tasks_for_activity()` runs
5. New tasks are created based on new category

### New User Signup:
1. User signs up via Supabase Auth
2. **Trigger:** `on_user_created` fires
3. **Function:** `seed_default_data_for_user()` runs
4. Default categories and task templates are created

---

## Performance Optimizations

### Indexes:
- All foreign keys have indexes for fast joins
- Date fields have indexes for date-range queries
- Composite index on (year, week_number) for performance queries

### Caching:
- Weekly performance is pre-calculated and stored
- External calendar fetch times are tracked to avoid redundant fetches

### Efficient Queries:
- Use of `exists()` in RLS policies for better performance
- Proper use of `on delete cascade` to avoid orphaned records

---

## Security Features

1. **RLS Enabled:** All tables have Row Level Security enabled
2. **User Isolation:** Complete data isolation between users
3. **Secure Functions:** All functions use `security definer` with proper checks
4. **Cascading Deletes:** Proper foreign key constraints prevent orphaned data
5. **Input Validation:** Check constraints on critical fields (e.g., percentage 0-100)

---

## Next Steps for Frontend Integration

To integrate the frontend with this backend:

1. **Authentication:** Implement Supabase Auth signup/login
2. **Data Fetching:** Replace local state with Supabase queries
3. **Real-time Updates:** Use Supabase Realtime for live data sync
4. **Offline Support:** Implement local caching with sync
5. **Push Notifications:** Set up for task reminders

Example query patterns will be provided in the updated hooks.

---

## Maintenance

### Adding New Features:
1. Create migration with `apply_migration` tool
2. Update TypeScript types with `generate_typescript_types`
3. Add RLS policies for new tables
4. Update frontend types and hooks

### Monitoring:
- Check RLS policies: `SELECT * FROM pg_policies WHERE tablename = 'table_name';`
- View indexes: `SELECT * FROM pg_indexes WHERE schemaname = 'public';`
- Check triggers: `SELECT * FROM pg_trigger;`

---

## Database Diagram

```
auth.users (Supabase Auth)
    ↓
    ├─→ activity_categories
    │       ↓
    │       ├─→ task_template_categories ←─┐
    │       │                              │
    │       └─→ activities                 │
    │               ↓                      │
    │               └─→ activity_tasks     │
    │                       ↓              │
    │                       └─→ activity_task_subtasks
    │
    ├─→ task_templates ────────────────────┘
    │       ↓
    │       └─→ task_template_subtasks
    │
    ├─→ external_calendars
    │
    └─→ weekly_performance
```

---

## Summary

The backend is now fully set up with:
- ✅ 9 database tables with proper relationships
- ✅ Complete RLS policies for security
- ✅ 4 helper functions for automation
- ✅ 5 triggers for automatic data management
- ✅ Proper indexes for performance
- ✅ Default data seeding for new users
- ✅ Automatic task creation based on categories
- ✅ Automatic weekly performance tracking

The system is production-ready and follows Supabase best practices!
