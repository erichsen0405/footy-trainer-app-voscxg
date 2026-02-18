import { Activity } from '@/types';
import { scheduleTaskReminder, checkNotificationPermissions, getAllScheduledNotifications, cancelAllNotifications } from './notificationService';

/**
 * CRITICAL: Reschedule all notifications for activities with tasks that have reminders
 * This should be called after data refresh to ensure all notifications are up to date
 */
export async function rescheduleAllNotifications(activities: Activity[]): Promise<void> {
  console.log('🔄 ========== RESCHEDULING ALL NOTIFICATIONS ==========');
  console.log(`  Total activities to process: ${activities.length}`);
  
  // Check if we have permission
  const hasPermission = await checkNotificationPermissions();
  if (!hasPermission) {
    console.log('⚠️ No notification permissions, skipping rescheduling');
    console.log('========== RESCHEDULING ABORTED (NO PERMISSION) ==========');
    return;
  }

  // CRITICAL FIX: Cancel all existing notifications first to avoid duplicates
  console.log('🗑️ Cancelling all existing notifications before rescheduling...');
  await cancelAllNotifications();
  console.log('✅ All existing notifications cancelled');

  let scheduledCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let totalTasksWithReminders = 0;

  for (const activity of activities) {
    console.log(`\n📋 Processing activity: "${activity.title}" (${activity.id})`);
    console.log(`  Activity Date: ${activity.date}`);
    console.log(`  Activity Date Type: ${typeof activity.date}`);
    console.log(`  Activity Time: ${activity.time}`);
    console.log(`  Tasks count: ${activity.tasks.length}`);
    
    for (const task of activity.tasks) {
      const reminderValue = (task as any)?.reminder;
      const hasReminder = reminderValue !== null && reminderValue !== undefined;

      if (hasReminder && !task.completed) {
        totalTasksWithReminders++;
        const reminderMinutes = Number(reminderValue);

        if (!Number.isFinite(reminderMinutes)) {
          console.log(`  ⚠️ Invalid reminder for task "${task.title}", skipping`);
          continue;
        }

        console.log(`  📝 Task "${task.title}" has reminder: ${reminderMinutes} minutes`);
        console.log(`     Task ID: ${task.id}`);
        console.log(`     Task completed: ${task.completed}`);
        
        try {
          // CRITICAL FIX: Pass the date as-is (can be Date object or string)
          // The scheduleTaskReminder function will handle the parsing
          const identifier = await scheduleTaskReminder(
            task.title,
            task.description || '',
            activity.title,
            activity.date,
            activity.time,
            reminderMinutes,
            task.id,
            activity.id
          );

          if (identifier) {
            scheduledCount++;
            console.log(`  ✅ Scheduled notification for task "${task.title}"`);
          } else {
            skippedCount++;
            console.log(`  ⚠️ Skipped notification for task "${task.title}" (probably in the past or invalid)`);
          }
        } catch (error) {
          errorCount++;
          console.error(`  ❌ Error scheduling notification for task "${task.title}":`, error);
        }
      } else if (task.completed) {
        console.log(`  ⏭️ Task "${task.title}" is completed, skipping`);
      } else {
        console.log(`  ⏭️ Task "${task.title}" has no reminder, skipping`);
      }
    }
  }

  console.log('\n📊 ========== RESCHEDULING SUMMARY ==========');
  console.log(`  Total activities processed: ${activities.length}`);
  console.log(`  Total tasks with reminders: ${totalTasksWithReminders}`);
  console.log(`  ✅ Successfully scheduled: ${scheduledCount}`);
  console.log(`  ⚠️ Skipped (past/invalid): ${skippedCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log('============================================\n');
  
  // Log all scheduled notifications for debugging
  await getAllScheduledNotifications();
}

