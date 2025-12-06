
# Smart Notification Scheduler Guide

## Overview

This app now uses a **smart notification scheduler** that solves the iOS notification limitation problem. Instead of trying to schedule all notifications at once (which fails when you have more than 64), it uses a "rolling window" approach similar to how iOS Calendar works.

## How It Works

### The Problem
- iOS has a hard limit of 64 scheduled local notifications
- When you try to schedule more, older ones get silently dropped
- This made it impossible to create activities far into the future with reminders

### The Solution
The new scheduler implements a **rolling window** approach:

1. **Only schedules notifications within a 60-day window**
   - Notifications beyond 60 days are stored in the database but not scheduled yet
   - This keeps us well below the 64 notification limit

2. **Automatically refreshes the notification queue**
   - When the app starts
   - When the app comes to foreground
   - After creating/updating/deleting activities or tasks
   - Once per day (automatically)

3. **Stores all reminder data in the database**
   - All activities and tasks with reminders are in Supabase
   - The scheduler reads from the database to know what to schedule

4. **Handles app lifecycle events**
   - Notifications are rescheduled when needed
   - No manual intervention required

## Key Features

### Automatic Scheduling
- Notifications are scheduled automatically when you create tasks with reminders
- If a notification is beyond the 60-day window, it will be scheduled later automatically
- No need to worry about the iOS limit

### Smart Refresh
- The app checks if notifications need refreshing:
  - On app start
  - When app comes to foreground
  - After bulk operations (creating/deleting activities)
  - Once every 24 hours

### Transparent to Users
- Users don't need to know about the technical limitations
- They can create activities years into the future with reminders
- Notifications will appear at the right time

## Technical Details

### Files
- `utils/notificationScheduler.ts` - Main scheduler logic
- `app/_layout.tsx` - App lifecycle integration
- `hooks/useFootballData.ts` - Integration with data operations

### Configuration
```typescript
const SCHEDULING_WINDOW_DAYS = 60;  // Only schedule within 60 days
const MAX_NOTIFICATIONS_IOS = 60;   // Leave buffer below 64 limit
const REFRESH_INTERVAL_HOURS = 24;  // Refresh daily
```

### Key Functions

#### `refreshNotificationQueue(force?: boolean)`
Refreshes the entire notification queue. Called automatically by the app.

#### `scheduleTaskReminderImmediate()`
Schedules a single task reminder immediately (used when creating new tasks).

#### `getNotificationQueueStats()`
Returns statistics about the notification queue:
- How many notifications are scheduled
- How many are pending in the window
- How many are beyond the window
- When the last refresh happened

### Database Schema
All reminder data is stored in Supabase:
- `activities` table - Contains activity date and time
- `activity_tasks` table - Contains task reminders (`reminder_minutes` column)

The scheduler queries these tables to determine what notifications to schedule.

## User Experience

### Creating Activities Far in the Future
1. User creates an activity 6 months from now
2. User adds a task with a 30-minute reminder
3. The task is saved to the database
4. If the notification is beyond 60 days, it's not scheduled yet
5. As time passes and the activity enters the 60-day window, the notification is automatically scheduled

### Viewing Notification Status
Users can see notification statistics in the admin panel:
- Number of scheduled notifications
- Number of pending reminders
- Last refresh time
- Next refresh time

## Comparison with iOS Calendar

This approach is similar to how iOS Calendar handles many future reminders:

| Feature | iOS Calendar | This App |
|---------|-------------|----------|
| Stores all events in database | ✅ | ✅ |
| Only schedules near-future notifications | ✅ | ✅ |
| Automatically refreshes queue | ✅ | ✅ |
| Handles app lifecycle | ✅ | ✅ |
| Transparent to users | ✅ | ✅ |

## Benefits

1. **No More Notification Limits**
   - Create unlimited activities with reminders
   - No silent failures

2. **Reliable Notifications**
   - Notifications always fire at the right time
   - Automatic recovery from app restarts

3. **Better Performance**
   - Only schedules what's needed
   - Reduces memory usage

4. **Future-Proof**
   - Works with activities years in the future
   - Scales to any number of reminders

## Troubleshooting

### Notifications Not Appearing?
1. Check notification permissions in Settings
2. Verify the activity is within 60 days
3. Check the notification queue stats in admin panel
4. Force refresh by restarting the app

### Too Many Notifications?
The scheduler automatically limits to 60 notifications on iOS. If you see more than 60 activities with reminders in the next 60 days, only the nearest 60 will be scheduled.

### Notifications Disappearing?
This should no longer happen with the new scheduler. If it does:
1. Check the console logs for errors
2. Verify the database has the reminder data
3. Force a refresh by restarting the app

## Future Enhancements

Possible improvements:
- Server-side notification scheduling using Supabase Edge Functions
- Push notifications for better reliability
- Configurable scheduling window (currently 60 days)
- Notification history and analytics
