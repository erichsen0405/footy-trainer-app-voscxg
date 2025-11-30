
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Set the notification handler to show notifications when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface ScheduledNotification {
  identifier: string;
  taskId: string;
  activityId: string;
}

// Request notification permissions
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permissions not granted');
      return false;
    }

    // Set up notification channel for Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('task-reminders', {
        name: 'Opgave påmindelser',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    console.log('Notification permissions granted');
    return true;
  } catch (error) {
    console.error('Error requesting notification permissions:', error);
    return false;
  }
}

// Schedule a notification for a task reminder
export async function scheduleTaskReminder(
  taskTitle: string,
  activityTitle: string,
  activityDate: Date,
  activityTime: string,
  reminderMinutes: number,
  taskId: string,
  activityId: string
): Promise<string | null> {
  try {
    // Parse the activity time (HH:MM:SS or HH:MM)
    const [hours, minutes] = activityTime.split(':').map(Number);
    
    // Create the activity datetime
    const activityDateTime = new Date(activityDate);
    activityDateTime.setHours(hours, minutes, 0, 0);
    
    // Calculate the notification time (subtract reminder minutes)
    const notificationTime = new Date(activityDateTime.getTime() - reminderMinutes * 60 * 1000);
    
    // Don't schedule if the notification time is in the past
    if (notificationTime.getTime() <= Date.now()) {
      console.log('Notification time is in the past, skipping:', notificationTime);
      return null;
    }

    console.log('Scheduling notification for:', notificationTime);
    console.log('Task:', taskTitle);
    console.log('Activity:', activityTitle);

    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⚽ Påmindelse: ${taskTitle}`,
        body: `${activityTitle} starter om ${reminderMinutes} minutter`,
        sound: 'default',
        data: {
          taskId,
          activityId,
          type: 'task-reminder',
        },
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationTime,
        channelId: Platform.OS === 'android' ? 'task-reminders' : undefined,
      },
    });

    console.log('Notification scheduled with identifier:', identifier);
    return identifier;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return null;
  }
}

// Cancel a scheduled notification
export async function cancelNotification(identifier: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    console.log('Notification cancelled:', identifier);
  } catch (error) {
    console.error('Error cancelling notification:', error);
  }
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('All notifications cancelled');
  } catch (error) {
    console.error('Error cancelling all notifications:', error);
  }
}

// Get all scheduled notifications
export async function getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    console.log('Scheduled notifications:', notifications.length);
    return notifications;
  } catch (error) {
    console.error('Error getting scheduled notifications:', error);
    return [];
  }
}

// Listen for notification responses (when user taps on a notification)
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// Listen for incoming notifications
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  return Notifications.addNotificationReceivedListener(callback);
}
