
# Notification Debugging Guide

## Problem Description

Notifications are not firing even though:
1. Test notifications work fine
2. Permissions are granted
3. Activities and tasks are created successfully

## Test Scenario That Failed

1. Created a new activity with category "VR træning"
2. Set activity date 10 minutes in the future
3. Created a task directly on the activity with 1-minute reminder
4. No notification appeared at the reminder time

## Root Cause Analysis

Based on the code review and logs, the potential issues are:

### 1. **Logging Not Captured**
The runtime logs only show Metro bundler activity, which means:
- Console logs from the app aren't being captured
- We need to check device logs directly

### 2. **Timing Issues**
When creating a task directly on an activity:
- The task is created in the database
- The notification should be scheduled immediately
- But there might be race conditions or the notification scheduling might fail silently

### 3. **Date/Time Parsing**
The `calculateNotificationTime` function:
- Parses dates from the database (YYYY-MM-DD format)
- Converts to local timezone
- Calculates notification time by subtracting reminder minutes
- If any step fails, the notification won't be scheduled

## Debugging Steps

### Step 1: Check Device Logs

**For iOS:**
```bash
# Open Console.app on Mac
# Filter by your app name or "expo"
# Look for logs starting with 🔔, 📅, ✅, ❌
```

**For Android:**
```bash
# Use adb logcat
adb logcat | grep -E "(Notification|expo|ReactNative)"
```

### Step 2: Use Admin Panel Tools

The admin panel now has comprehensive debugging tools:

1. **Notification Stats** - Shows:
   - Number of scheduled notifications
   - Number of stored notification identifiers
   - Number of orphaned notifications

2. **Test Notification** - Sends a test notification in 2 seconds

3. **Sync Notifications** - Cleans up orphaned notifications

4. **Reschedule All Notifications** - Reschedules all notifications for all activities

### Step 3: Check Notification Permissions

1. Go to device Settings → Notifications → Your App
2. Verify that:
   - Notifications are enabled
   - Banners are enabled
   - Sounds are enabled
   - Badges are enabled

**For iOS specifically:**
- Check that "Background App Refresh" is enabled
- Check that the app has permission to send notifications

### Step 4: Verify Activity Date/Time

When creating an activity:
1. Make sure the date is in the future
2. Make sure the time is in the future
3. The notification time (activity time - reminder minutes) must be in the future

Example:
- Current time: 14:00
- Activity time: 14:10 (10 minutes from now)
- Reminder: 1 minute before
- Notification time: 14:09 (9 minutes from now) ✅ Valid

If the notification time is in the past, it won't be scheduled.

### Step 5: Check Console Logs

Look for these log patterns:

**Successful scheduling:**
```
📅 ========== SCHEDULING NOTIFICATION ==========
  Task: [task title]
  Activity: [activity title]
  ...
✅ Notification scheduled successfully with ID: [identifier]
✅ Verified notification is in schedule queue
========== NOTIFICATION SCHEDULED SUCCESSFULLY ==========
```

**Failed scheduling:**
```
⚠️ No notification permissions, skipping scheduling
========== SCHEDULING ABORTED (NO PERMISSION) ==========
```

or

```
⚠️ Notification time is X minutes in the past, skipping
========== CALCULATION FAILED (PAST TIME) ==========
```

## Enhanced Logging

The notification service now includes comprehensive logging:

1. **Timestamp logging** - Every log includes the current time
2. **Detailed date parsing** - Shows how dates are parsed and converted
3. **Time calculations** - Shows the exact time until notification fires
4. **Verification** - Confirms the notification is in the queue after scheduling

## Common Issues and Solutions

### Issue 1: Notifications Not Appearing

**Symptoms:**
- Notification is scheduled successfully (logs show ✅)
- But notification doesn't appear at the scheduled time

**Solutions:**
1. Check device notification settings
2. Restart the app
3. Try the "Test Notification" button in admin panel
4. Check if the device is in Do Not Disturb mode

### Issue 2: Notification Time in the Past

**Symptoms:**
- Logs show: "Notification time is X minutes in the past"

**Solutions:**
1. Verify the activity date/time is in the future
2. Check that the reminder minutes don't exceed the time until the activity
3. Make sure the device clock is correct

### Issue 3: Permissions Not Granted

**Symptoms:**
- Logs show: "No notification permissions"

**Solutions:**
1. Go to device Settings → Notifications → Your App
2. Enable all notification permissions
3. Restart the app
4. Try requesting permissions again

### Issue 4: Orphaned Notifications

**Symptoms:**
- Admin panel shows orphaned notifications > 0

**Solutions:**
1. Click "Sync Notifications" in admin panel
2. This will clean up notifications that are no longer valid

## Testing Checklist

When testing notifications:

- [ ] Permissions are granted
- [ ] Activity date/time is in the future
- [ ] Reminder time is less than time until activity
- [ ] Test notification works
- [ ] Device is not in Do Not Disturb mode
- [ ] Background App Refresh is enabled (iOS)
- [ ] Console logs show successful scheduling
- [ ] Admin panel shows notification in "Scheduled" count
- [ ] Wait for the notification time
- [ ] Check device logs if notification doesn't appear

## Next Steps

If notifications still don't work after following this guide:

1. **Capture full device logs** during the test
2. **Share the logs** showing:
   - Activity creation
   - Task creation
   - Notification scheduling
   - The time when notification should have fired
3. **Check iOS/Android specific issues**:
   - iOS: Background modes, notification categories
   - Android: Notification channels, exact alarm permission

## Code Changes Made

### 1. Enhanced Logging in `notificationService.ts`
- Added timestamps to all logs
- Added detailed date/time parsing logs
- Added verification after scheduling
- Added summary logs

### 2. Enhanced `CreateActivityTaskModal.tsx`
- Added comprehensive logging when creating tasks
- Added immediate notification scheduling
- Added verification after scheduling
- Added user feedback with alerts

### 3. Enhanced Admin Panel
- Added notification stats display
- Added sync notifications button
- Added reschedule all notifications button
- Added visual feedback for operations

## Important Notes

1. **Local Notifications Only**: This app uses local notifications, not push notifications
2. **Foreground Behavior**: Notifications will show even when app is in foreground (iOS)
3. **Background Modes**: iOS requires `remote-notification` in UIBackgroundModes (already configured)
4. **Exact Alarms**: Android 12+ requires SCHEDULE_EXACT_ALARM permission (already configured)

## Monitoring

To monitor notifications in real-time:

1. Open the app
2. Go to Admin panel
3. Check notification stats
4. Create a test activity with a task
5. Watch the console logs
6. Verify the notification appears in "Scheduled" count
7. Wait for the notification time
8. Check if notification appears

If the notification doesn't appear but logs show it was scheduled successfully, the issue is likely with device settings or OS-level restrictions.
