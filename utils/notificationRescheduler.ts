
import { Activity } from '@/types';
import { scheduleTaskReminder, checkNotificationPermissions, getAllScheduledNotifications } from './notificationService';

/**
 * CRITICAL: Reschedule all notifications for activities with tasks that have reminders
 * This should be called after data refresh to ensure all notifications are up to date
 */
export async function rescheduleAllNotifications(activities: Activity[]): Promise<void> {
  console.log('🔄 ========== RESCHEDULING ALL NOTIFICATIONS ==========');
  
  // Check if we have permission
  const hasPermission = await checkNotificationPermissions();
  if (!hasPermission) {
    console.log('⚠️ No notification permissions, skipping rescheduling');
    return;
  }

  let scheduledCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const activity of activities) {
    console.log(`📋 Processing activity: ${activity.title} (${activity.id})`);
    
    for (const task of activity.tasks) {
      if (task.reminder && !task.completed) {
        console.log(`  📝 Task "${task.title}" has reminder: ${task.reminder} minutes`);
        
        try {
          const identifier = await scheduleTaskReminder(
            task.title,
            activity.title,
            activity.date,
            activity.time,
            task.reminder,
            task.id,
            activity.id
          );

          if (identifier) {
            scheduledCount++;
            console.log(`  ✅ Scheduled notification for task "${task.title}"`);
          } else {
            skippedCount++;
            console.log(`  ⚠️ Skipped notification for task "${task.title}" (probably in the past)`);
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

  console.log('📊 ========== RESCHEDULING SUMMARY ==========');
  console.log(`  ✅ Scheduled: ${scheduledCount}`);
  console.log(`  ⚠️ Skipped: ${skippedCount}`);
  console.log(`  ❌ Errors: ${errorCount}`);
  console.log('============================================');
  
  // Log all scheduled notifications for debugging
  await getAllScheduledNotifications();
}
