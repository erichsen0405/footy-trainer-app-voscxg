import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/app/integrations/supabase/client';
import { Platform } from 'react-native';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';

/**
 * SMART NOTIFICATION SCHEDULER
 * 
 * This service implements a "rolling window" approach to notification scheduling,
 * similar to how iOS Calendar handles many future reminders.
 * 
 * Key Features:
 * - Only schedules notifications within a configurable window (default: 5 days)
 * - Stores all reminder metadata in the database
 * - Automatically refreshes the notification queue as time passes
 * - Respects iOS's 64 notification limit
 * - Handles app lifecycle events to keep notifications fresh
 * - Supports deep linking to specific activities
 */

// Configuration
const SCHEDULING_WINDOW_DAYS = 5; // Only schedule notifications within this window
const MAX_NOTIFICATIONS_IOS = 60; // Leave some buffer below the 64 limit
const LAST_REFRESH_KEY = '@notification_last_refresh';
const REFRESH_INTERVAL_HOURS = 24; // Refresh daily

interface PendingReminder {
  id: string;
  taskId: string;
  activityId: string;
  taskTitle: string;
  taskDescription: string;
  activityTitle: string;
  activityDate: string; // ISO date string
  activityTime: string;
  reminderMinutes?: number;
  notificationTime: Date;
  kind: 'task-reminder' | 'after-training-feedback';
  templateId?: string | null;
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
 * Calculate notification time for after-training feedback reminders
 * Trigger at activity end time + delayMinutes
 */
function calculateAfterTrainingNotificationTime(
  activityDate: string,
  activityEndTime: string,
  delayMinutes: number
): Date | null {
  try {
    const dateParts = activityDate.split('T')[0].split('-');
    const year = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    const day = parseInt(dateParts[2], 10);

    const timeParts = activityEndTime.split(':');
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return null;
    }

    const endDateTime = new Date(year, month, day, hours, minutes, 0, 0);
    const notificationTime = new Date(endDateTime.getTime() + delayMinutes * 60 * 1000);

    if (notificationTime.getTime() <= Date.now()) {
      return null;
    }

    return notificationTime;
  } catch (error) {
    console.error('❌ Error calculating after-training notification time:', error);
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
    
    // Always build into this array so after-training can run even if there are 0 task reminders.
    const reminders: PendingReminder[] = [];

    // --- Task reminders (reminder_minutes) ---
    const { data: tasks, error } = await supabase
      .from('activity_tasks')
      .select(`
        id,
        title,
        description,
        reminder_minutes,
        activity_id,
        activities!inner (
          id,
          title,
          activity_date,
          activity_time,
          user_id
        )
      `)
      .not('reminder_minutes', 'is', null)
      .eq('activities.user_id', user.id)
      .gte('activities.activity_date', now.toISOString().split('T')[0])
      .lte('activities.activity_date', windowEnd.toISOString().split('T')[0])
      .order('activity_date', { 
        ascending: true,
        foreignTable: 'activities'
      });
    
    if (error) {
      // Fail-soft: keep going so after-training reminders can still be built.
      console.error('❌ Task reminders query failed (continuing to after-training):', error);
    } else if (!tasks || tasks.length === 0) {
      console.log('ℹ️ No task reminders (reminder_minutes) found');
    } else {
      console.log(`✅ Found ${tasks.length} tasks with reminders`);
      
      for (const task of tasks) {
        const activity = (task as any).activities;
        if (!activity) continue;

        const reminderMinutes = Number(task.reminder_minutes);
        if (!Number.isFinite(reminderMinutes)) {
          console.log('⚠️ Skipping task with invalid reminder value:', task.id);
          continue;
        }

        const notificationTime = calculateNotificationTime(
          activity.activity_date,
          activity.activity_time,
          reminderMinutes
        );

        if (notificationTime) {
          reminders.push({
            id: `${task.id}_${activity.id}`,
            taskId: task.id,
            activityId: activity.id,
            taskTitle: task.title,
            taskDescription: task.description || '',
            activityTitle: activity.title,
            activityDate: activity.activity_date,
            activityTime: activity.activity_time,
            reminderMinutes,
            notificationTime,
            kind: 'task-reminder',
          });
        }
      }
    }

    /* ----------------------------------
       After-training feedback reminders
       ---------------------------------- */
    try {
      const { data: feedbackTasks, error: feedbackError } = await supabase
        .from('activity_tasks')
        .select(`
          id,
          title,
          description,
          completed,
          activity_id,
          activities!inner (
            id,
            title,
            activity_date,
            activity_time,
            activity_end_time,
            user_id
          )
        `)
        .is('task_template_id', null)
        .ilike('description', '%[auto-after-training:%')
        .eq('activities.user_id', user.id)
        .gte('activities.activity_date', now.toISOString().split('T')[0])
        .lte('activities.activity_date', windowEnd.toISOString().split('T')[0]);

      if (feedbackError) {
        console.error('❌ Error fetching after-training feedback tasks:', feedbackError);
      } else if (feedbackTasks && feedbackTasks.length) {
        console.log(`ℹ️ After-training: found ${feedbackTasks.length} feedback tasks`);

        const templateIds = Array.from(
          new Set(
            feedbackTasks
              .map((t: any) => parseTemplateIdFromMarker(String(t?.description ?? '')))
              .filter((id: any) => typeof id === 'string' && id.length > 0)
          )
        ) as string[];

        const templateDelayById = new Map<string, number>();
        if (templateIds.length) {
          const { data: templates, error: templatesError } = await supabase
            .from('task_templates')
            .select('id, after_training_enabled, after_training_delay_minutes')
            .eq('user_id', user.id)
            .in('id', templateIds);

          if (templatesError) {
            console.error('❌ Error fetching template delay for after-training:', templatesError);
          } else {
            (templates || []).forEach((tt: any) => {
              if (!tt?.id) return;
              if (!tt.after_training_enabled) return;
              const delay = tt.after_training_delay_minutes;
              templateDelayById.set(String(tt.id), typeof delay === 'number' && Number.isFinite(delay) ? delay : 0);
            });
          }
        }

        console.log(`ℹ️ After-training: enabled templates=${templateDelayById.size}`);

        for (const feedbackTask of feedbackTasks) {
          if ((feedbackTask as any)?.completed) continue;

          const activity = (feedbackTask as any).activities;
          if (!activity) continue;

          const templateId = parseTemplateIdFromMarker(String((feedbackTask as any)?.description ?? ''));
          if (!templateId) continue;

          // Strict: skip when template is disabled/missing (no fallback)
          if (!templateDelayById.has(templateId)) {
            console.log('⚠️ Skipping after-training reminder (template disabled/missing)', {
              activityId: activity.id,
              taskId: feedbackTask.id,
              templateId,
            });
            continue;
          }
          const delayMinutes = templateDelayById.get(templateId)!;

          const endTime = String(activity.activity_end_time ?? '').trim();
          if (!endTime) {
            console.log('⚠️ Skipping after-training reminder (missing end time)', {
              activityId: activity.id,
              taskId: feedbackTask.id,
              templateId,
            });
            continue;
          }

          const notificationTime = calculateAfterTrainingNotificationTime(
            String(activity.activity_date),
            endTime,
            delayMinutes
          );

          if (!notificationTime) continue;

          reminders.push({
            id: `${feedbackTask.id}_${activity.id}_after_training`,
            taskId: feedbackTask.id,
            activityId: activity.id,
            taskTitle: String(feedbackTask.title ?? 'Feedback'),
            taskDescription: String(feedbackTask.description ?? ''),
            activityTitle: String(activity.title ?? ''),
            activityDate: String(activity.activity_date),
            activityTime: String(activity.activity_time ?? ''),
            notificationTime,
            kind: 'after-training-feedback',
            templateId,
          });

          console.log('✅ After-training reminder queued', { activityId: activity.id, taskId: feedbackTask.id, templateId });
        }
      } else {
        console.log('ℹ️ After-training: found 0 feedback tasks');
      }
    } catch (feedbackUnexpectedError) {
      console.error('❌ Unexpected error building after-training reminders:', feedbackUnexpectedError);
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
        const isAfterTraining = reminder.kind === 'after-training-feedback';

        // Build notification body with task description
        let notificationBody = '';
        if (isAfterTraining) {
          notificationBody = `Husk at udfylde feedback efter ${reminder.activityTitle}`;
        } else {
          const mins = reminder.reminderMinutes ?? 0;
          notificationBody = `${reminder.activityTitle} starter om ${mins} minutter`;
        }

        if (reminder.taskDescription) {
          notificationBody += `\n\n${reminder.taskDescription}`;
        }

        const notificationContent: Notifications.NotificationContentInput = {
          title: isAfterTraining ? `⚽ Feedback: ${reminder.activityTitle}` : `⚽ Påmindelse: ${reminder.taskTitle}`,
          body: notificationBody,
          sound: 'default',
          data: {
            taskId: reminder.taskId,
            activityId: reminder.activityId,
            type: isAfterTraining ? 'after-training-feedback' : 'task-reminder',
            templateId: reminder.templateId ?? null,
            scheduledFor: reminder.notificationTime.toISOString(),
            // Deep linking data
            url: `/activity-details?id=${reminder.activityId}`,
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
  taskDescription: string,
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
    
    // Build notification body with task description
    let notificationBody = `${activityTitle} starter om ${reminderMinutes} minutter`;
    if (taskDescription) {
      notificationBody += `\n\n${taskDescription}`;
    }

    // Schedule the notification
    const notificationContent: Notifications.NotificationContentInput = {
      title: `⚽ Påmindelse: ${taskTitle}`,
      body: notificationBody,
      sound: 'default',
      data: {
        taskId,
        activityId,
        type: 'task-reminder',
        scheduledFor: notificationTime.toISOString(),
        // Deep linking data
        url: `/activity-details?id=${activityId}`,
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
