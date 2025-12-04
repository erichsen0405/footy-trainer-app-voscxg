
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
  scheduledFor: string; // ISO timestamp
}

const NOTIFICATION_PERMISSION_KEY = '@notification_permission_status';
const NOTIFICATION_IDENTIFIERS_KEY = '@notification_identifiers';

// CRITICAL FIX: Persist notification identifiers to AsyncStorage
export async function saveNotificationIdentifier(
  taskId: string,
  activityId: string,
  notificationId: string,
  scheduledFor: Date
): Promise<void> {
  try {
    console.log('💾 Saving notification identifier:', { taskId, activityId, notificationId });
    
    const stored = await AsyncStorage.getItem(NOTIFICATION_IDENTIFIERS_KEY);
    const identifiers: Record<string, ScheduledNotification> = stored ? JSON.parse(stored) : {};
    
    identifiers[taskId] = {
      identifier: notificationId,
      taskId,
      activityId,
      scheduledFor: scheduledFor.toISOString(),
    };
    
    await AsyncStorage.setItem(NOTIFICATION_IDENTIFIERS_KEY, JSON.stringify(identifiers));
    console.log('✅ Notification identifier saved');
  } catch (error) {
    console.error('❌ Error saving notification identifier:', error);
  }
}

// CRITICAL FIX: Load persisted notification identifiers
export async function loadNotificationIdentifiers(): Promise<Record<string, ScheduledNotification>> {
  try {
    console.log('📂 Loading notification identifiers from storage...');
    const stored = await AsyncStorage.getItem(NOTIFICATION_IDENTIFIERS_KEY);
    const identifiers = stored ? JSON.parse(stored) : {};
    console.log(`✅ Loaded ${Object.keys(identifiers).length} notification identifiers`);
    return identifiers;
  } catch (error) {
    console.error('❌ Error loading notification identifiers:', error);
    return {};
  }
}

// CRITICAL FIX: Remove notification identifier from storage
export async function removeNotificationIdentifier(taskId: string): Promise<void> {
  try {
    console.log('🗑️ Removing notification identifier for task:', taskId);
    const stored = await AsyncStorage.getItem(NOTIFICATION_IDENTIFIERS_KEY);
    const identifiers: Record<string, ScheduledNotification> = stored ? JSON.parse(stored) : {};
    
    delete identifiers[taskId];
    
    await AsyncStorage.setItem(NOTIFICATION_IDENTIFIERS_KEY, JSON.stringify(identifiers));
    console.log('✅ Notification identifier removed');
  } catch (error) {
    console.error('❌ Error removing notification identifier:', error);
  }
}

// CRITICAL FIX: Clear all notification identifiers
export async function clearAllNotificationIdentifiers(): Promise<void> {
  try {
    console.log('🗑️ Clearing all notification identifiers...');
    await AsyncStorage.removeItem(NOTIFICATION_IDENTIFIERS_KEY);
    console.log('✅ All notification identifiers cleared');
  } catch (error) {
    console.error('❌ Error clearing notification identifiers:', error);
  }
}

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
      await AsyncStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'denied');
      
      // Show alert to user
      Alert.alert(
        'Notifikationer deaktiveret',
        'For at modtage påmindelser om dine opgaver skal du aktivere notifikationer i indstillingerne.',
        [
          { text: 'Senere', style: 'cancel' },
          { text: 'Åbn indstillinger', onPress: openNotificationSettings }
        ]
      );
      
      return false;
    }

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
    
    const { status } = await Notifications.getPermissionsAsync();
    console.log('🔍 System permission status:', status);
    
    const isGranted = status === 'granted';
    
    await AsyncStorage.setItem(NOTIFICATION_PERMISSION_KEY, isGranted ? 'granted' : 'denied');
    console.log('✅ Updated stored permission status to:', isGranted ? 'granted' : 'denied');
    
    return isGranted;
  } catch (error) {
    console.error('❌ Error checking notification permissions:', error);
    return false;
  }
}

// CRITICAL FIX: Calculate notification time with proper timezone handling
function calculateNotificationTime(
  activityDate: Date,
  activityTime: string,
  reminderMinutes: number
): Date | null {
  try {
    console.log('📅 Calculating notification time...');
    console.log('  Activity Date:', activityDate.toISOString());
    console.log('  Activity Time:', activityTime);
    console.log('  Reminder Minutes:', reminderMinutes);
    
    // Parse the activity time (HH:MM:SS or HH:MM)
    const timeParts = activityTime.split(':');
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    
    // CRITICAL FIX: Create activity datetime in local timezone
    // Use the date components directly without timezone conversion
    const activityDateTime = new Date(activityDate);
    activityDateTime.setHours(hours, minutes, 0, 0);
    
    console.log('  Activity DateTime (local):', activityDateTime.toISOString());
    console.log('  Activity DateTime (local string):', activityDateTime.toString());
    
    // Calculate the notification time (subtract reminder minutes)
    const notificationTime = new Date(activityDateTime.getTime() - reminderMinutes * 60 * 1000);
    
    console.log('  Notification Time (local):', notificationTime.toISOString());
    console.log('  Notification Time (local string):', notificationTime.toString());
    console.log('  Current Time:', new Date().toISOString());
    
    // Don't schedule if the notification time is in the past
    if (notificationTime.getTime() <= Date.now()) {
      console.log('⚠️ Notification time is in the past, skipping');
      return null;
    }

    const timeUntilNotification = notificationTime.getTime() - Date.now();
    const minutesUntil = Math.floor(timeUntilNotification / 60000);
    const hoursUntil = Math.floor(minutesUntil / 60);
    const daysUntil = Math.floor(hoursUntil / 24);
    
    if (daysUntil > 0) {
      console.log(`  ⏰ Notification will fire in ${daysUntil} days, ${hoursUntil % 24} hours, ${minutesUntil % 60} minutes`);
    } else if (hoursUntil > 0) {
      console.log(`  ⏰ Notification will fire in ${hoursUntil} hours, ${minutesUntil % 60} minutes`);
    } else {
      console.log(`  ⏰ Notification will fire in ${minutesUntil} minutes`);
    }

    return notificationTime;
  } catch (error) {
    console.error('❌ Error calculating notification time:', error);
    return null;
  }
}

// CRITICAL FIX: Schedule a notification for a task reminder with extensive logging and validation
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
    console.log('  Task ID:', taskId);
    console.log('  Activity ID:', activityId);
    
    // CRITICAL FIX: Check permissions before scheduling
    const hasPermission = await checkNotificationPermissions();
    if (!hasPermission) {
      console.log('⚠️ No notification permissions, skipping scheduling');
      return null;
    }
    
    // Calculate notification time
    const notificationTime = calculateNotificationTime(activityDate, activityTime, reminderMinutes);
    if (!notificationTime) {
      return null;
    }

    // CRITICAL FIX: Cancel any existing notification for this task
    const existingIdentifiers = await loadNotificationIdentifiers();
    if (existingIdentifiers[taskId]) {
      console.log('🔄 Cancelling existing notification for task:', taskId);
      await cancelNotification(existingIdentifiers[taskId].identifier);
      await removeNotificationIdentifier(taskId);
    }

    // Schedule the notification
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: `⚽ Påmindelse: ${taskTitle}`,
        body: `${activityTitle} starter om ${reminderMinutes} minutter`,
        sound: 'default',
        data: {
          taskId,
          activityId,
          type: 'task-reminder',
          scheduledFor: notificationTime.toISOString(),
        },
        priority: Notifications.AndroidNotificationPriority.HIGH,
        badge: 1,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: notificationTime,
        channelId: Platform.OS === 'android' ? 'task-reminders' : undefined,
      },
    });

    console.log('✅ Notification scheduled successfully with ID:', identifier);
    
    // CRITICAL FIX: Verify the notification was scheduled
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const ourNotification = scheduledNotifications.find(n => n.identifier === identifier);
    if (ourNotification) {
      console.log('✅ Verified notification is in schedule queue');
      
      // CRITICAL FIX: Persist the notification identifier
      await saveNotificationIdentifier(taskId, activityId, identifier, notificationTime);
    } else {
      console.log('⚠️ Warning: Notification not found in schedule queue after scheduling');
      return null;
    }
    
    return identifier;
  } catch (error) {
    console.error('❌ Error scheduling notification:', error);
    return null;
  }
}

// CRITICAL FIX: Cancel a scheduled notification and remove from storage
export async function cancelNotification(identifier: string): Promise<void> {
  try {
    console.log('🗑️ Cancelling notification:', identifier);
    await Notifications.cancelScheduledNotificationAsync(identifier);
    console.log('✅ Notification cancelled successfully');
  } catch (error) {
    console.error('❌ Error cancelling notification:', error);
  }
}

// CRITICAL FIX: Cancel notification by task ID
export async function cancelNotificationByTaskId(taskId: string): Promise<void> {
  try {
    console.log('🗑️ Cancelling notification for task:', taskId);
    const identifiers = await loadNotificationIdentifiers();
    
    if (identifiers[taskId]) {
      await cancelNotification(identifiers[taskId].identifier);
      await removeNotificationIdentifier(taskId);
      console.log('✅ Notification cancelled and removed from storage');
    } else {
      console.log('⚠️ No notification found for task:', taskId);
    }
  } catch (error) {
    console.error('❌ Error cancelling notification by task ID:', error);
  }
}

// Cancel all scheduled notifications
export async function cancelAllNotifications(): Promise<void> {
  try {
    console.log('🗑️ Cancelling all notifications...');
    await Notifications.cancelAllScheduledNotificationsAsync();
    await clearAllNotificationIdentifiers();
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
        const triggerDate = new Date(notification.trigger.date);
        const now = new Date();
        const minutesUntil = Math.floor((triggerDate.getTime() - now.getTime()) / 60000);
        console.log(`     Scheduled for: ${triggerDate.toISOString()} (in ${minutesUntil} minutes)`);
      }
    });
    
    return notifications;
  } catch (error) {
    console.error('❌ Error getting scheduled notifications:', error);
    return [];
  }
}

// CRITICAL FIX: Sync scheduled notifications with stored identifiers
export async function syncNotifications(): Promise<void> {
  try {
    console.log('🔄 Syncing notifications with storage...');
    
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const storedIdentifiers = await loadNotificationIdentifiers();
    
    // Get all scheduled notification IDs
    const scheduledIds = new Set(scheduledNotifications.map(n => n.identifier));
    
    // Remove stored identifiers that are no longer scheduled
    let removedCount = 0;
    for (const taskId in storedIdentifiers) {
      if (!scheduledIds.has(storedIdentifiers[taskId].identifier)) {
        console.log(`  Removing orphaned identifier for task: ${taskId}`);
        await removeNotificationIdentifier(taskId);
        removedCount++;
      }
    }
    
    console.log(`✅ Sync complete: removed ${removedCount} orphaned identifiers`);
  } catch (error) {
    console.error('❌ Error syncing notifications:', error);
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
    
    const hasPermission = await checkNotificationPermissions();
    if (!hasPermission) {
      Alert.alert(
        'Notifikationer deaktiveret',
        'Du skal aktivere notifikationer for at teste dem.',
        [
          { text: 'Annuller', style: 'cancel' },
          { text: 'Åbn indstillinger', onPress: openNotificationSettings }
        ]
      );
      return;
    }
    
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
    Alert.alert('Test notifikation', 'En test notifikation vil vises om 2 sekunder');
  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    Alert.alert('Fejl', 'Kunne ikke sende test notifikation');
  }
}

// Open device notification settings
export async function openNotificationSettings(): Promise<void> {
  try {
    console.log('📱 Opening notification settings...');
    
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
    
    console.log('✅ Settings opened');
  } catch (error) {
    console.error('❌ Error opening settings:', error);
    Alert.alert('Fejl', 'Kunne ikke åbne indstillinger');
  }
}

// CRITICAL FIX: Get notification statistics
export async function getNotificationStats(): Promise<{
  scheduled: number;
  stored: number;
  orphaned: number;
  upcoming: Array<{ taskId: string; scheduledFor: string; minutesUntil: number }>;
}> {
  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const storedIdentifiers = await loadNotificationIdentifiers();
    
    const scheduledIds = new Set(scheduledNotifications.map(n => n.identifier));
    const orphanedCount = Object.values(storedIdentifiers).filter(
      stored => !scheduledIds.has(stored.identifier)
    ).length;
    
    const now = Date.now();
    const upcoming = scheduledNotifications
      .filter(n => n.trigger && 'date' in n.trigger)
      .map(n => {
        const triggerDate = new Date((n.trigger as any).date);
        const minutesUntil = Math.floor((triggerDate.getTime() - now) / 60000);
        return {
          taskId: n.content.data?.taskId || 'unknown',
          scheduledFor: triggerDate.toISOString(),
          minutesUntil,
        };
      })
      .sort((a, b) => a.minutesUntil - b.minutesUntil)
      .slice(0, 10); // Top 10 upcoming
    
    return {
      scheduled: scheduledNotifications.length,
      stored: Object.keys(storedIdentifiers).length,
      orphaned: orphanedCount,
      upcoming,
    };
  } catch (error) {
    console.error('❌ Error getting notification stats:', error);
    return {
      scheduled: 0,
      stored: 0,
      orphaned: 0,
      upcoming: [],
    };
  }
}
