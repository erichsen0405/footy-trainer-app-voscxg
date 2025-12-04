
import * as Notifications from 'expo-notifications';
import { Platform, Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// CRITICAL: Set the notification handler to show notifications in ALL states
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

const NOTIFICATION_PERMISSION_KEY = '@notification_permission_status';

// Request notification permissions with detailed logging and persistence
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    console.log('🔔 Requesting notification permissions...');
    
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('🔔 Existing permission status:', existingStatus);
    
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      console.log('🔔 Permissions not granted, requesting...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('🔔 New permission status:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('❌ Notification permissions NOT granted');
      // Store the denied status
      await AsyncStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'denied');
      
      return false;
    }

    // Store the granted status
    await AsyncStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'granted');
    console.log('✅ Notification permission status saved to AsyncStorage');

    // Set up notification channel for Android
    if (Platform.OS === 'android') {
      console.log('🔔 Setting up Android notification channel...');
      await Notifications.setNotificationChannelAsync('task-reminders', {
        name: 'Opgave påmindelser',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
        enableLights: true,
        lightColor: '#FF6347',
      });
      console.log('✅ Android notification channel created');
    }

    console.log('✅ Notification permissions granted successfully');
    return true;
  } catch (error) {
    console.error('❌ Error requesting notification permissions:', error);
    return false;
  }
}

// CRITICAL FIX: Check if notification permissions are granted (system check ONLY)
export async function checkNotificationPermissions(): Promise<boolean> {
  try {
    console.log('🔍 Checking notification permissions...');
    
    // ONLY check system permissions - this is the source of truth
    const { status } = await Notifications.getPermissionsAsync();
    console.log('🔍 System permission status:', status);
    
    const isGranted = status === 'granted';
    
    // Update stored status to match system status
    await AsyncStorage.setItem(NOTIFICATION_PERMISSION_KEY, isGranted ? 'granted' : 'denied');
    console.log('✅ Updated stored permission status to:', isGranted ? 'granted' : 'denied');
    
    return isGranted;
  } catch (error) {
    console.error('❌ Error checking notification permissions:', error);
    return false;
  }
}

// Schedule a notification for a task reminder with extensive logging
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
    console.log('📅 Scheduling notification...');
    console.log('  Task:', taskTitle);
    console.log('  Activity:', activityTitle);
    console.log('  Activity Date:', activityDate);
    console.log('  Activity Time:', activityTime);
    console.log('  Reminder Minutes:', reminderMinutes);
    
    // Parse the activity time (HH:MM:SS or HH:MM)
    const timeParts = activityTime.split(':');
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    
    console.log('  Parsed time - Hours:', hours, 'Minutes:', minutes);
    
    // Create the activity datetime
    const activityDateTime = new Date(activityDate);
    activityDateTime.setHours(hours, minutes, 0, 0);
    
    console.log('  Activity DateTime:', activityDateTime.toISOString());
    
    // Calculate the notification time (subtract reminder minutes)
    const notificationTime = new Date(activityDateTime.getTime() - reminderMinutes * 60 * 1000);
    
    console.log('  Notification Time:', notificationTime.toISOString());
    console.log('  Current Time:', new Date().toISOString());
    
    // Don't schedule if the notification time is in the past
    if (notificationTime.getTime() <= Date.now()) {
      console.log('⚠️ Notification time is in the past, skipping');
      return null;
    }

    const timeUntilNotification = notificationTime.getTime() - Date.now();
    const minutesUntil = Math.floor(timeUntilNotification / 60000);
    console.log(`  ⏰ Notification will fire in ${minutesUntil} minutes`);

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
        // CRITICAL: Add badge for iOS
        badge: 1,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationTime,
        channelId: Platform.OS === 'android' ? 'task-reminders' : undefined,
      },
    });

    console.log('✅ Notification scheduled successfully with ID:', identifier);
    
    // Verify the notification was scheduled
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const ourNotification = scheduledNotifications.find(n => n.identifier === identifier);
    if (ourNotification) {
      console.log('✅ Verified notification is in schedule queue');
    } else {
      console.log('⚠️ Warning: Notification not found in schedule queue');
    }
    
    return identifier;
  } catch (error) {
    console.error('❌ Error scheduling notification:', error);
    return null;
  }
}

// Cancel a scheduled notification
export async function cancelNotification(identifier: string): Promise<void> {
  try {
    console.log('🗑️ Cancelling notification:', identifier);
    await Notifications.cancelScheduledNotificationAsync(identifier);
    console.log('✅ Notification cancelled successfully');
  } catch (error) {
    console.error('❌ Error cancelling notification:', error);
  }
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  try {
    console.log('🗑️ Cancelling all notifications...');
    await Notifications.cancelAllScheduledNotificationsAsync();
    console.log('✅ All notifications cancelled');
  } catch (error) {
    console.error('❌ Error cancelling all notifications:', error);
  }
}

// Get all scheduled notifications with detailed logging
export async function getAllScheduledNotifications(): Promise<Notifications.NotificationRequest[]> {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    console.log(`📋 Found ${notifications.length} scheduled notifications:`);
    
    notifications.forEach((notification, index) => {
      console.log(`  ${index + 1}. ID: ${notification.identifier}`);
      console.log(`     Title: ${notification.content.title}`);
      console.log(`     Body: ${notification.content.body}`);
      if (notification.trigger && 'date' in notification.trigger) {
        console.log(`     Scheduled for: ${new Date(notification.trigger.date).toISOString()}`);
      }
    });
    
    return notifications;
  } catch (error) {
    console.error('❌ Error getting scheduled notifications:', error);
    return [];
  }
}

// Listen for notification responses (when user taps on a notification)
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  console.log('👂 Setting up notification response listener');
  return Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('🔔 Notification tapped:', response.notification.request.content.title);
    callback(response);
  });
}

// Listen for incoming notifications (when notification is received)
export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.EventSubscription {
  console.log('👂 Setting up notification received listener');
  return Notifications.addNotificationReceivedListener((notification) => {
    console.log('🔔 Notification received:', notification.request.content.title);
    callback(notification);
  });
}

// Debug function to test notifications immediately
export async function testNotification(): Promise<void> {
  try {
    console.log('🧪 Sending test notification...');
    
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚽ Test Påmindelse',
        body: 'Dette er en test notifikation. Hvis du ser denne, virker notifikationer!',
        sound: 'default',
        data: {
          type: 'test',
        },
        priority: Notifications.AndroidNotificationPriority.HIGH,
        badge: 1,
      },
      trigger: {
        seconds: 2,
        channelId: Platform.OS === 'android' ? 'task-reminders' : undefined,
      },
    });
    
    console.log('✅ Test notification scheduled for 2 seconds from now');
  } catch (error) {
    console.error('❌ Error sending test notification:', error);
  }
}

// Open device notification settings
export async function openNotificationSettings(): Promise<void> {
  try {
    console.log('📱 Opening notification settings...');
    
    if (Platform.OS === 'ios') {
      // On iOS, open the app-specific settings
      await Linking.openURL('app-settings:');
    } else {
      // On Android, open the general settings
      await Linking.openSettings();
    }
    
    console.log('✅ Settings opened');
  } catch (error) {
    console.error('❌ Error opening settings:', error);
    Alert.alert('Fejl', 'Kunne ikke åbne indstillinger');
  }
}
