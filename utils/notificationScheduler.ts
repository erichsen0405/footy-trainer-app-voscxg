
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';
import { Platform } from 'react-native';

/**
 * SMART NOTIFICATION SCHEDULER
 * 
 * This service implements a "rolling window" approach to notification scheduling,
 * similar to how iOS Calendar handles many future reminders.
 * 
 * Key Features:
 * - Only schedules notifications within a configurable window (default: 60 days)
 * - Stores all reminder metadata in the database
 * - Automatically refreshes the notification queue as time passes
 * - Respects iOS's 64 notification limit
 * - Handles app lifecycle events to keep notifications fresh
 */

// Configuration
const SCHEDULING_WINDOW_DAYS = 60; // Only schedule notifications within this window
const MAX_NOTIFICATIONS_IOS = 60; // Leave some buffer below the 64 limit
const LAST_REFRESH_KEY = '@notification_last_refresh';
const REFRESH_INTERVAL_HOURS = 24; // Refresh daily

interface PendingReminder {
  id: string;
  taskId: string;
  activityId: string;
  taskTitle: string;
  activityTitle: string;
  activityDate: string; // ISO date string
  activityTime: string;
  reminderMinutes: number;
  notificationTime: Date;
}

/**
 * Calculate the notification time for a task reminder
 */
function calculateNotificationTime(
  activityDate: string,
  activityTime: string,
  reminderMinutes: number
): Date | null {
  try {
    // Parse date in local timezone
    const dateParts = activityDate.split('T')[0].split('-');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);
    
    // Parse time
    const timeParts = activityTime.split(':');
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    
    // Create activity datetime
    const activityDateTime = new Date(year, month, day, hours, minutes, 0, 0);
    
    // Calculate notification time
    const notificationTime = new Date(activityDateTime.getTime() - reminderMinutes * 60 * 1000);
    
    // Don't schedule if in the past
    if (notificationTime.getTime() <= Date.now()) {
      return null;
    }
    
    return notificationTime;
  } catch (error) {
    console.error('❌ Error calculating notification time:', error);
    return null;
  }
}

/**
 * Fetch all pending reminders from the database
 */
async function fetchPendingReminders(): Promise<PendingReminder[]> {
  try {
    console.log('📋 Fetching pending reminders from database...');
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.log('⚠️ No authenticated user');
      return [];
    }
    
    // Get all future activities with tasks that have reminders
    const now = new Date();
    const windowEnd = new Date(now.getTime() + SCHEDULING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    
    const { data: tasks, error } = await supabase
      .from('activity_tasks')
      .select(`
        id,
        title,
        reminder_minutes,
        activity_id,
        activities!inner (
          id,
          title,
          date,
          time
        )
      `)
      .not('reminder_minutes', 'is', null)
      .gte('activities.date', now.toISOString().split('T')[0])
      .lte('activities.date', windowEnd.toISOString().split('T')[0])
      .order('activities.date', { ascending: true });
    
    if (error) {
      console.error('❌ Error fetching reminders:', error);
      return [];
    }
    
    if (!tasks || tasks.length === 0) {
      console.log('ℹ️ No pending reminders found');
      return [];
    }
    
    console.log(`✅ Found ${tasks.length} tasks with reminders`);
    
    // Transform to PendingReminder format
    const reminders: PendingReminder[] = [];
    
    for (const task of tasks) {
      const activity = (task as any).activities;
      if (!activity) continue;
      
      const notificationTime = calculateNotificationTime(
        activity.date,
        activity.time,
        task.reminder_minutes!
      );
      
      if (notificationTime) {
        reminders.push({
          id: `${task.id}_${activity.id}`,
          taskId: task.id,
          activityId: activity.id,
          taskTitle: task.title,
          activityTitle: activity.title,
          activityDate: activity.date,
          activityTime: activity.time,
          reminderMinutes: task.reminder_minutes!,
          notificationTime,
        });
      }
    }
    
    console.log(`✅ Processed ${reminders.length} valid reminders`);
    return reminders;
  } catch (error) {
    console.error('❌ Error fetching pending reminders:', error);
    return [];
  }
}

/**
 * Schedule notifications for pending reminders
 */
async function scheduleNotifications(reminders: PendingReminder[]): Promise<number> {
  try {
    console.log(`📅 Scheduling ${reminders.length} notifications...`);
    
    // Check permissions
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.log('⚠️ Notification permissions not granted');
      return 0;
    }
    
    // Cancel all existing scheduled notifications
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('🗑️ Cleared all existing scheduled notifications');
    
    // Sort by notification time
    const sortedReminders = reminders.sort(
      (a, b) => a.notificationTime.getTime() - b.notificationTime.getTime()
    );
    
    // Limit to max notifications (iOS constraint)
    const maxToSchedule = Platform.OS === 'ios' 
      ? Math.min(sortedReminders.length, MAX_NOTIFICATIONS_IOS)
      : sortedReminders.length;
    
    const toSchedule = sortedReminders.slice(0, maxToSchedule);
    
    if (toSchedule.length < sortedReminders.length) {
      console.log(`⚠️ Limiting to ${maxToSchedule} notifications (iOS constraint)`);
    }
    
    let scheduledCount = 0;
    
    for (const reminder of toSchedule) {
      try {
        const notificationContent: Notifications.NotificationContentInput = {
          title: `⚽ Påmindelse: ${reminder.taskTitle}`,
          body: `${reminder.activityTitle} starter om ${reminder.reminderMinutes} minutter`,
          sound: 'default',
          data: {
            taskId: reminder.taskId,
            activityId: reminder.activityId,
            type: 'task-reminder',
            scheduledFor: reminder.notificationTime.toISOString(),
          },
          badge: 1,
        };
        
        if (Platform.OS === 'ios') {
          notificationContent.categoryIdentifier = 'task-reminder';
        }
        
        if (Platform.OS === 'android') {
          notificationContent.priority = Notifications.AndroidNotificationPriority.HIGH;
        }
        
        const trigger: Notifications.NotificationTriggerInput = {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.notificationTime,
        };
        
        if (Platform.OS === 'android') {
          (trigger as any).channelId = 'task-reminders';
        }
        
        await Notifications.scheduleNotificationAsync({
          content: notificationContent,
          trigger,
        });
        
        scheduledCount++;
      } catch (error) {
        console.error(`❌ Error scheduling notification for task ${reminder.taskId}:`, error);
      }
    }
    
    console.log(`✅ Successfully scheduled ${scheduledCount} notifications`);
    return scheduledCount;
  } catch (error) {
    console.error('❌ Error scheduling notifications:', error);
    return 0;
  }
}

/**
 * Check if notifications need to be refreshed
 */
async function shouldRefresh(): Promise<boolean> {
  try {
    const lastRefreshStr = await AsyncStorage.getItem(LAST_REFRESH_KEY);
    if (!lastRefreshStr) {
      return true; // Never refreshed before
    }
    
    const lastRefresh = new Date(lastRefreshStr);
    const hoursSinceRefresh = (Date.now() - lastRefresh.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceRefresh >= REFRESH_INTERVAL_HOURS;
  } catch (error) {
    console.error('❌ Error checking refresh status:', error);
    return true; // Refresh on error to be safe
  }
}

/**
 * Update the last refresh timestamp
 */
async function updateLastRefresh(): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_REFRESH_KEY, new Date().toISOString());
  } catch (error) {
    console.error('❌ Error updating last refresh:', error);
  }
}

/**
 * Main function to refresh the notification queue
 * This should be called:
 * - When the app starts
 * - When the app comes to foreground
 * - After creating/updating/deleting activities or tasks
 * - Periodically (e.g., daily)
 */
export async function refreshNotificationQueue(force: boolean = false): Promise<void> {
  try {
    console.log('🔄 ========== REFRESHING NOTIFICATION QUEUE ==========');
    console.log('  Platform:', Platform.OS);
    console.log('  Force refresh:', force);
    console.log('  Timestamp:', new Date().toISOString());
    
    // Check if refresh is needed
    if (!force && !(await shouldRefresh())) {
      console.log('ℹ️ Refresh not needed yet');
      console.log('========== REFRESH SKIPPED ==========');
      return;
    }
    
    // Fetch pending reminders
    const reminders = await fetchPendingReminders();
    
    if (reminders.length === 0) {
      console.log('ℹ️ No reminders to schedule');
      await Notifications.cancelAllScheduledNotificationsAsync();
      await updateLastRefresh();
      console.log('========== REFRESH COMPLETE (NO REMINDERS) ==========');
      return;
    }
    
    // Schedule notifications
    const scheduledCount = await scheduleNotifications(reminders);
    
    // Update last refresh time
    await updateLastRefresh();
    
    // Log summary
    console.log('📊 REFRESH SUMMARY:');
    console.log(`   - Total reminders in window: ${reminders.length}`);
    console.log(`   - Notifications scheduled: ${scheduledCount}`);
    console.log(`   - Window: ${SCHEDULING_WINDOW_DAYS} days`);
    console.log(`   - Next refresh: ${new Date(Date.now() + REFRESH_INTERVAL_HOURS * 60 * 60 * 1000).toISOString()}`);
    console.log('========== REFRESH COMPLETE ==========');
  } catch (error) {
    console.error('❌ Error refreshing notification queue:', error);
    console.log('========== REFRESH FAILED ==========');
  }
}

/**
 * Schedule a single task reminder immediately
 * This is used when creating a new task with a reminder
 */
export async function scheduleTaskReminderImmediate(
  taskId: string,
  taskTitle: string,
  activityId: string,
  activityTitle: string,
  activityDate: string,
  activityTime: string,
  reminderMinutes: number
): Promise<boolean> {
  try {
    console.log('📅 Scheduling immediate task reminder...');
    console.log('  Task:', taskTitle);
    console.log('  Activity:', activityTitle);
    
    const notificationTime = calculateNotificationTime(
      activityDate,
      activityTime,
      reminderMinutes
    );
    
    if (!notificationTime) {
      console.log('⚠️ Notification time is in the past, skipping');
      return false;
    }
    
    // Check if within scheduling window
    const windowEnd = new Date(Date.now() + SCHEDULING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (notificationTime.getTime() > windowEnd.getTime()) {
      console.log(`ℹ️ Notification is beyond ${SCHEDULING_WINDOW_DAYS}-day window, will be scheduled later`);
      return true; // Not an error, just deferred
    }
    
    // Check permissions
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.log('⚠️ Notification permissions not granted');
      return false;
    }
    
    // Schedule the notification
    const notificationContent: Notifications.NotificationContentInput = {
      title: `⚽ Påmindelse: ${taskTitle}`,
      body: `${activityTitle} starter om ${reminderMinutes} minutter`,
      sound: 'default',
      data: {
        taskId,
        activityId,
        type: 'task-reminder',
        scheduledFor: notificationTime.toISOString(),
      },
      badge: 1,
    };
    
    if (Platform.OS === 'ios') {
      notificationContent.categoryIdentifier = 'task-reminder';
    }
    
    if (Platform.OS === 'android') {
      notificationContent.priority = Notifications.AndroidNotificationPriority.HIGH;
    }
    
    const trigger: Notifications.NotificationTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: notificationTime,
    };
    
    if (Platform.OS === 'android') {
      (trigger as any).channelId = 'task-reminders';
    }
    
    const identifier = await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger,
    });
    
    console.log('✅ Notification scheduled:', identifier);
    return true;
  } catch (error) {
    console.error('❌ Error scheduling immediate task reminder:', error);
    return false;
  }
}

/**
 * Get statistics about the notification queue
 */
export async function getNotificationQueueStats(): Promise<{
  scheduledCount: number;
  pendingInWindow: number;
  pendingBeyondWindow: number;
  windowDays: number;
  lastRefresh: string | null;
  nextRefresh: string | null;
}> {
  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const allReminders = await fetchPendingReminders();
    
    const now = Date.now();
    const windowEnd = now + SCHEDULING_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    
    const pendingInWindow = allReminders.filter(
      r => r.notificationTime.getTime() <= windowEnd
    ).length;
    
    const pendingBeyondWindow = allReminders.filter(
      r => r.notificationTime.getTime() > windowEnd
    ).length;
    
    const lastRefreshStr = await AsyncStorage.getItem(LAST_REFRESH_KEY);
    const nextRefresh = lastRefreshStr
      ? new Date(new Date(lastRefreshStr).getTime() + REFRESH_INTERVAL_HOURS * 60 * 60 * 1000).toISOString()
      : null;
    
    return {
      scheduledCount: scheduledNotifications.length,
      pendingInWindow,
      pendingBeyondWindow,
      windowDays: SCHEDULING_WINDOW_DAYS,
      lastRefresh: lastRefreshStr,
      nextRefresh,
    };
  } catch (error) {
    console.error('❌ Error getting notification queue stats:', error);
    return {
      scheduledCount: 0,
      pendingInWindow: 0,
      pendingBeyondWindow: 0,
      windowDays: SCHEDULING_WINDOW_DAYS,
      lastRefresh: null,
      nextRefresh: null,
    };
  }
}

/**
 * Force a full refresh of the notification queue
 * Use this after bulk operations (e.g., deleting all activities)
 */
export async function forceRefreshNotificationQueue(): Promise<void> {
  await refreshNotificationQueue(true);
}
