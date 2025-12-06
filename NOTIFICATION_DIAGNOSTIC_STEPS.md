
# 🔍 Notification Diagnostic Steps

## Your Current Situation

From the logs you provided:
```
📂 Loading notification identifiers from storage...
✅ Loaded 103 notification identifiers
📤 Scheduling notification with Expo Notifications API...
```

This shows that:
1. ✅ The app is loading notification identifiers (103 of them!)
2. ✅ The app is attempting to schedule a notification
3. ❓ But we don't see if it succeeded or failed

## Step-by-Step Diagnosis

### Step 1: Check Notification Debug Screen

1. Open your app on iPhone
2. Go to **Admin** tab (bottom navigation)
3. Tap the **"Debug"** button in the Notifications section
4. Take screenshots of:
   - **Tilladelser** (Permissions) section
   - **Statistik** (Stats) section
   - **Planlagte Notifikationer** (Scheduled Notifications) section

**What to look for:**
- **Permissions Status:** Should say "Godkendt" (Granted)
- **Scheduled count:** Should match the number of tasks with reminders
- **Orphaned count:** Should be 0 (if not, tap "Synk" button)

### Step 2: Test Notification

1. In the Admin panel, tap **"Test notifikation"** button
2. Wait 2 seconds
3. **Expected result:** You should see a notification appear

**If test notification works:**
- ✅ Permissions are correct
- ✅ Notification system is working
- ❌ Problem is with task notification scheduling

**If test notification doesn't work:**
- ❌ Check iPhone Settings → Notifications → Your App
- ❌ Make sure all notification options are enabled
- ❌ Make sure iPhone is not in Do Not Disturb mode
- ❌ Make sure iPhone is not in Silent mode (notifications will still show, but no sound)

### Step 3: Check Scheduled Notifications

In the Debug screen, look at the **"Planlagte Notifikationer"** list:

**For each notification, check:**
- **Title:** Should match your task title
- **Scheduled time:** Should be in the future
- **"om X minutter"** (in X minutes): Should show positive time

**Common issues:**
- ❌ **"X minutter siden"** (X minutes ago): Notification time is in the past - won't fire
- ❌ **No notifications listed:** Notifications aren't being scheduled
- ❌ **Wrong time:** Timezone or calculation issue

### Step 4: Create a Test Task

Let's create a test task with a very short reminder time:

1. **Create a new activity:**
   - Date: Today
   - Time: 5 minutes from now (e.g., if it's 14:00, set it to 14:05)
   - Category: Any category

2. **Add a task to the activity:**
   - Title: "Test notification"
   - Description: "Testing notifications"
   - Enable reminder: Yes
   - Reminder minutes: 1 (1 minute before activity)

3. **Expected result:**
   - Notification should fire in 4 minutes (5 minutes - 1 minute reminder)

4. **Check the Debug screen:**
   - Go to Admin → Debug
   - Look for your test notification in the list
   - It should show "om 4 minutter" (or similar)

5. **Wait for the notification:**
   - Keep the app open or close it
   - Wait for the notification time
   - Notification should appear

### Step 5: Check for Common Issues

#### Issue A: Too Many Notifications (iOS Limit)

iOS has a limit of **64 scheduled notifications**. If you have 103 stored identifiers but only 64 (or fewer) scheduled, this is the issue.

**Solution:**
1. In Admin panel, tap **"Genplanlæg alle notifikationer"**
2. This will cancel all notifications and reschedule only upcoming ones
3. Check Debug screen to verify

#### Issue B: Orphaned Notifications

If the Debug screen shows **"Forældreløse" > 0**, you have orphaned notifications.

**Solution:**
1. In Admin panel, tap **"Synk"** button
2. This will clean up orphaned notifications
3. Check Debug screen to verify

#### Issue C: Notification Time in the Past

If you create a task on an activity that's in the past, or if the reminder time exceeds the time until the activity, the notification won't be scheduled.

**Example of WRONG setup:**
- Current time: 14:00
- Activity time: 14:05 (5 minutes from now)
- Reminder: 10 minutes before
- Notification time: 13:55 (5 minutes AGO) ❌ Won't schedule

**Example of CORRECT setup:**
- Current time: 14:00
- Activity time: 14:10 (10 minutes from now)
- Reminder: 5 minutes before
- Notification time: 14:05 (5 minutes from now) ✅ Will schedule

#### Issue D: Permissions Not Granted

Even if you granted permissions before, they might have been revoked.

**Check:**
1. iPhone Settings → Notifications → Your App
2. Verify:
   - ✅ Allow Notifications: ON
   - ✅ Sounds: ON
   - ✅ Badges: ON
   - ✅ Show in Notification Center: ON
   - ✅ Show on Lock Screen: ON
   - ✅ Show as Banners: ON

#### Issue E: Do Not Disturb Mode

If iPhone is in Do Not Disturb mode, notifications might not appear.

**Check:**
1. Swipe down from top-right corner (Control Center)
2. Make sure the moon icon (Do Not Disturb) is NOT highlighted
3. If it is, tap it to turn off Do Not Disturb

#### Issue F: Focus Mode

iOS Focus modes can block notifications.

**Check:**
1. Settings → Focus
2. Make sure no Focus mode is active
3. Or configure your app to break through Focus modes

### Step 6: Check Console Logs (Advanced)

If you want to see the full console logs:

**On Mac with iPhone connected:**
1. Open **Console.app** (Applications → Utilities → Console)
2. Select your iPhone from the left sidebar
3. In the search box, type: `Expo Go` (or your app name)
4. Create a task with a reminder
5. Look for logs with these emojis: 🔔, 📅, ✅, ❌, 📤, 💾

**What to look for:**
```
✅ Notification scheduled successfully with ID: [some-id]
✅ Verified notification is in schedule queue
💾 Saving notification identifier...
✅ Notification identifier saved
```

**If you see:**
```
⚠️ No notification permissions, skipping scheduling
```
→ Permissions issue

**If you see:**
```
⚠️ Notification time is X minutes in the past, skipping
```
→ Timing issue

**If you see:**
```
❌ Error scheduling notification: [error message]
```
→ Scheduling error (share the error message)

## Quick Checklist

Before creating a task with a reminder:

- [ ] iPhone notifications are enabled for the app
- [ ] iPhone is not in Do Not Disturb mode
- [ ] iPhone is not in a Focus mode that blocks notifications
- [ ] Activity date/time is in the future
- [ ] Reminder minutes is less than time until activity
- [ ] Test notification works (from Admin panel)
- [ ] Debug screen shows permissions are granted

## What to Share for Further Help

If notifications still don't work, please share:

1. **Screenshots from Debug screen:**
   - Permissions section
   - Stats section
   - First few scheduled notifications

2. **Test scenario details:**
   - Current time when you created the task
   - Activity date and time
   - Reminder minutes
   - Expected notification time

3. **Console logs** (if possible):
   - From Console.app on Mac
   - Filter by "Expo Go" or your app name
   - Copy logs from when you created the task

4. **iPhone details:**
   - iOS version
   - iPhone model
   - Any special settings (Do Not Disturb, Focus modes, etc.)

## Expected Behavior

When everything works correctly:

1. **Create task with reminder:**
   - Console shows: "✅ Notification scheduled successfully"
   - Debug screen shows notification in list
   - Notification time is in the future

2. **Wait for notification time:**
   - Notification appears on lock screen
   - Notification plays sound (if not in silent mode)
   - Badge appears on app icon

3. **Tap notification:**
   - App opens
   - (Future: Navigate to the task)

## Common Misconceptions

❌ **"I have 103 stored identifiers, so I have 103 scheduled notifications"**
- Not necessarily! iOS limit is 64 notifications
- Stored identifiers might be outdated
- Use Debug screen to see actual scheduled count

❌ **"Test notification works, so all notifications should work"**
- Test notification uses a simple 2-second trigger
- Task notifications use date-based triggers
- Different code paths, different potential issues

❌ **"I granted permissions once, so they're always granted"**
- Permissions can be revoked by user
- Permissions can be reset by iOS
- Always check current permission status

## Next Steps

1. **Start with Step 1** (Check Debug Screen)
2. **Do Step 2** (Test Notification)
3. **If test works, do Step 4** (Create Test Task)
4. **If test doesn't work, check Step 5 Issue D** (Permissions)
5. **Share results** if still not working

---

**Remember:** The Debug screen is your best friend! It shows you exactly what's happening with notifications in real-time.
