
import * as Notifications from 'expo-notifications';
import { Platform, Alert, Linking } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// CRITICAL iOS FIX: Set notification handler with explicit iOS configuration
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    // iOS specific: ensure notifications show even when app is in foreground
    ...(Platform.OS === 'ios' && {
      shouldShowAlert: true,
    }),
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

function sanitizeNotificationLabel(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : fallback;
}

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

// CRITICAL iOS FIX: Setup notification categories for iOS
async function setupNotificationCategories() {
  if (Platform.OS === 'ios') {
    try {
      console.log('🍎 Setting up iOS notification categories...');
      
      await Notifications.setNotificationCategoryAsync('task-reminder', [
        {
          identifier: 'mark-complete',
          buttonTitle: 'Mark as done',
          options: {
            opensAppToForeground: false,
          },
        },
        {
          identifier: 'view-task',
          buttonTitle: 'View task',
          options: {
            opensAppToForeground: true,
          },
        },
      ]);
      
      console.log('✅ iOS notification categories configured');
    } catch (error) {
      console.error('❌ Error setting up iOS notification categories:', error);
    }
  }
}

// Request notification permissions with detailed logging and persistence
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    console.log('🔔 ========== REQUESTING NOTIFICATION PERMISSIONS ==========');
    console.log('  Platform:', Platform.OS);
    console.log('  iOS Version:', Platform.Version);
    
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    console.log('🔔 Existing permission status:', existingStatus);
    
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      console.log('🔔 Permissions not granted, requesting...');
      
      // iOS CRITICAL FIX: Request with explicit iOS options
      const requestOptions = Platform.OS === 'ios' ? {
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowDisplayInCarPlay: false,
          allowCriticalAlerts: false,
          provideAppNotificationSettings: false,
          allowProvisional: false,
          allowAnnouncements: false,
        },
      } : {};
      
      const { status } = await Notifications.requestPermissionsAsync(requestOptions);
      finalStatus = status;
      console.log('🔔 New permission status:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('❌ Notification permissions NOT granted');
      await AsyncStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'denied');
      
      // Show alert to user
      Alert.alert(
        'Notifications disabled',
        'To receive reminders about your tasks, enable notifications in the settings.',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Open settings', onPress: openNotificationSettings }
        ]
      );
      
      console.log('========== PERMISSION REQUEST FAILED ==========');
      return false;
    }

    await AsyncStorage.setItem(NOTIFICATION_PERMISSION_KEY, 'granted');
    console.log('✅ Notification permission status saved to AsyncStorage');

    // Set up notification channel for Android
    if (Platform.OS === 'android') {
      console.log('🔔 Setting up Android notification channel...');
      await Notifications.setNotificationChannelAsync('task-reminders', {
        name: 'Task reminders',
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

    // iOS CRITICAL FIX: Setup notification categories
    await setupNotificationCategories();

    console.log('✅ Notification permissions granted successfully');
    console.log('========== PERMISSION REQUEST SUCCESS ==========');
    return true;
  } catch (error) {
    console.error('❌ Error requesting notification permissions:', error);
    console.log('========== PERMISSION REQUEST ERROR ==========');
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
  activityDate: Date | string,
  activityTime: string,
  reminderMinutes: number
): Date | null {
  try {
    console.log('📅 ========== CALCULATING NOTIFICATION TIME ==========');
    console.log('  Input Activity Date:', activityDate);
    console.log('  Input Activity Date Type:', typeof activityDate);
    console.log('  Activity Time:', activityTime);
    console.log('  Reminder Minutes:', reminderMinutes);
    console.log('  Platform:', Platform.OS);
    console.log('  Current Time:', new Date().toString());
    console.log('  Current Time (ISO):', new Date().toISOString());
    
    // CRITICAL FIX: Parse the date properly
    // If activityDate is a string (from database), it's in format YYYY-MM-DD
    // We need to parse it in local timezone, not UTC
    let dateObj: Date;
    if (typeof activityDate === 'string') {
      // Parse YYYY-MM-DD in local timezone
      const dateParts = activityDate.split('T')[0].split('-');
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1; // Month is 0-indexed
      const day = parseInt(dateParts[2], 10);
      dateObj = new Date(year, month, day);
      console.log('  Parsed date from string:', dateObj.toString());
      console.log('  Parsed date (ISO):', dateObj.toISOString());
    } else {
      dateObj = new Date(activityDate);
      console.log('  Using date object:', dateObj.toString());
      console.log('  Using date (ISO):', dateObj.toISOString());
    }
    
    // Parse the activity time (HH:MM:SS or HH:MM)
    const timeParts = activityTime.split(':');
    const hours = parseInt(timeParts[0], 10);
    const minutes = parseInt(timeParts[1], 10);
    
    console.log('  Parsed time - Hours:', hours, 'Minutes:', minutes);
    
    // CRITICAL FIX: Create activity datetime in local timezone
    const activityDateTime = new Date(dateObj);
    activityDateTime.setHours(hours, minutes, 0, 0);
    
    console.log('  Activity DateTime (local):', activityDateTime.toString());
    console.log('  Activity DateTime (ISO):', activityDateTime.toISOString());
    console.log('  Activity DateTime (timestamp):', activityDateTime.getTime());
    
    // Calculate the notification time (subtract reminder minutes)
    const notificationTime = new Date(activityDateTime.getTime() - reminderMinutes * 60 * 1000);
    
    console.log('  Notification Time (local):', notificationTime.toString());
    console.log('  Notification Time (ISO):', notificationTime.toISOString());
    console.log('  Notification Time (timestamp):', notificationTime.getTime());
    
    const now = Date.now();
    console.log('  Current Time (timestamp):', now);
    console.log('  Time difference (ms):', notificationTime.getTime() - now);
    
    // Don't schedule if the notification time is in the past
    if (notificationTime.getTime() <= now) {
      const minutesAgo = Math.floor((now - notificationTime.getTime()) / 60000);
      console.log(`⚠️ Notification time is ${minutesAgo} minutes in the past, skipping`);
      console.log('========== CALCULATION FAILED (PAST TIME) ==========');
      return null;
    }

    const timeUntilNotification = notificationTime.getTime() - now;
    const minutesUntil = Math.floor(timeUntilNotification / 60000);
    const secondsUntil = Math.floor((timeUntilNotification % 60000) / 1000);
    const hoursUntil = Math.floor(minutesUntil / 60);
    const daysUntil = Math.floor(hoursUntil / 24);
    
    if (daysUntil > 0) {
      console.log(`  ⏰ Notification will fire in ${daysUntil} days, ${hoursUntil % 24} hours, ${minutesUntil % 60} minutes, ${secondsUntil} seconds`);
    } else if (hoursUntil > 0) {
      console.log(`  ⏰ Notification will fire in ${hoursUntil} hours, ${minutesUntil % 60} minutes, ${secondsUntil} seconds`);
    } else {
      console.log(`  ⏰ Notification will fire in ${minutesUntil} minutes, ${secondsUntil} seconds`);
    }
    
    console.log('========== CALCULATION SUCCESS ==========');
    return notificationTime;
  } catch (error) {
    console.error('❌ Error calculating notification time:', error);
    console.log('========== CALCULATION ERROR ==========');
    return null;
  }
}

// CRITICAL iOS FIX: Schedule a notification with iOS-specific configuration and deep linking
export async function scheduleTaskReminder(
  taskTitle: string,
  taskDescription: string,
  activityTitle: string,
  activityDate: Date | string,
  activityTime: string,
  reminderMinutes: number,
  taskId: string,
  activityId: string
): Promise<string | null> {
  try {
    console.log('📅 ========== SCHEDULING NOTIFICATION ==========');
    console.log('  Task:', taskTitle);
    console.log('  Activity:', activityTitle);
    console.log('  Task ID:', taskId);
    console.log('  Activity ID:', activityId);
    console.log('  Activity Date:', activityDate);
    console.log('  Activity Time:', activityTime);
    console.log('  Reminder Minutes:', reminderMinutes);
    console.log('  Platform:', Platform.OS);
    console.log('  Timestamp:', new Date().toISOString());
    
    // CRITICAL FIX: Check permissions before scheduling
    const hasPermission = await checkNotificationPermissions();
    if (!hasPermission) {
      console.log('⚠️ No notification permissions, skipping scheduling');
      console.log('========== SCHEDULING ABORTED (NO PERMISSION) ==========');
      return null;
    }
    
    // Calculate notification time
    const notificationTime = calculateNotificationTime(activityDate, activityTime, reminderMinutes);
    if (!notificationTime) {
      console.log('⚠️ Could not calculate valid notification time');
      console.log('========== SCHEDULING ABORTED (INVALID TIME) ==========');
      return null;
    }

    // CRITICAL FIX: Cancel any existing notification for this task
    const existingIdentifiers = await loadNotificationIdentifiers();
    if (existingIdentifiers[taskId]) {
      console.log('🔄 Cancelling existing notification for task:', taskId);
      await cancelNotification(existingIdentifiers[taskId].identifier);
      await removeNotificationIdentifier(taskId);
    }

    const safeTaskTitle = sanitizeNotificationLabel(
      taskTitle,
      sanitizeNotificationLabel(taskDescription, 'Task'),
    );
    const safeActivityTitle = sanitizeNotificationLabel(activityTitle, 'Activity');
    const notificationTitle = 'Assignment soon';
    const notificationBody = `${safeTaskTitle} · ${safeActivityTitle}`;

    // iOS CRITICAL FIX: Build notification content with iOS-specific options and deep linking
    const notificationContent: Notifications.NotificationContentInput = {
      title: notificationTitle,
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

    // iOS specific: Add category for actions
    if (Platform.OS === 'ios') {
      notificationContent.categoryIdentifier = 'task-reminder';
    }

    // Android specific: Add priority
    if (Platform.OS === 'android') {
      notificationContent.priority = Notifications.AndroidNotificationPriority.HIGH;
    }

    // Schedule the notification
    console.log('📤 Scheduling notification with Expo Notifications API...');
    console.log('  Trigger date:', notificationTime.toISOString());
    console.log('  Trigger timestamp:', notificationTime.getTime());
    console.log('  Notification content:', JSON.stringify(notificationContent, null, 2));
    
    // iOS CRITICAL FIX: Use explicit date trigger
    const trigger: Notifications.NotificationTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: notificationTime,
    };

    // Android specific: Add channel ID
    if (Platform.OS === 'android') {
      (trigger as any).channelId = 'task-reminders';
    }

    console.log('  Trigger config:', JSON.stringify(trigger, null, 2));

    const identifier = await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger,
    });

    console.log('✅ Notification scheduled successfully with ID:', identifier);
    
    // CRITICAL FIX: Verify the notification was scheduled
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const ourNotification = scheduledNotifications.find(n => n.identifier === identifier);
    if (ourNotification) {
      console.log('✅ Verified notification is in schedule queue');
      console.log('   Trigger:', JSON.stringify(ourNotification.trigger, null, 2));
      
      // CRITICAL FIX: Persist the notification identifier
      await saveNotificationIdentifier(taskId, activityId, identifier, notificationTime);
      
      // Log summary
      console.log('📊 NOTIFICATION SCHEDULED SUMMARY:');
      console.log('   - Notification ID:', identifier);
      console.log('   - Task:', taskTitle);
      console.log('   - Activity:', activityTitle);
      console.log('   - Will fire at:', notificationTime.toString());
      console.log('   - Time until fire:', Math.floor((notificationTime.getTime() - Date.now()) / 1000), 'seconds');
    } else {
      console.log('⚠️ Warning: Notification not found in schedule queue after scheduling');
      console.log('========== SCHEDULING FAILED (NOT IN QUEUE) ==========');
      return null;
    }
    
    console.log('========== NOTIFICATION SCHEDULED SUCCESSFULLY ==========');
    return identifier;
  } catch (error) {
    console.error('❌ Error scheduling notification:', error);
    console.error('   Error details:', JSON.stringify(error, null, 2));
    console.log('========== SCHEDULING ERROR ==========');
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
    console.log(`📋 ========== SCHEDULED NOTIFICATIONS (${notifications.length}) ==========`);
    console.log(`  Platform: ${Platform.OS}`);
    console.log(`  Current time: ${new Date().toString()}`);
    console.log(`  Current time (ISO): ${new Date().toISOString()}`);
    
    notifications.forEach((notification, index) => {
      console.log(`  ${index + 1}. ID: ${notification.identifier}`);
      console.log(`     Title: ${notification.content.title}`);
      console.log(`     Body: ${notification.content.body}`);
      if (notification.trigger && 'date' in notification.trigger) {
        const triggerDate = new Date(notification.trigger.date);
        const now = new Date();
        const secondsUntil = Math.floor((triggerDate.getTime() - now.getTime()) / 1000);
        const minutesUntil = Math.floor(secondsUntil / 60);
        console.log(`     Scheduled for: ${triggerDate.toISOString()}`);
        console.log(`     Local time: ${triggerDate.toString()}`);
        console.log(`     Fires in: ${minutesUntil} minutes (${secondsUntil} seconds)`);
      }
      if (notification.content.data) {
        console.log(`     Task ID: ${notification.content.data.taskId}`);
        console.log(`     Activity ID: ${notification.content.data.activityId}`);
        console.log(`     Deep link URL: ${notification.content.data.url}`);
      }
    });
    
    console.log('========================================');
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
export function addNotificationResponseReceivedListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.EventSubscription {
  console.log('👂 Setting up notification response listener');
  return Notifications.addNotificationResponseReceivedListener((response) => {
    console.log('🔔 Notification tapped:', response.notification.request.content.title);
    console.log('   Action identifier:', response.actionIdentifier);
    console.log('   Notification data:', response.notification.request.content.data);
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
    console.log('🧪 ========== SENDING TEST NOTIFICATION ==========');
    console.log('  Platform:', Platform.OS);
    
    const hasPermission = await checkNotificationPermissions();
    if (!hasPermission) {
      Alert.alert(
        'Notifications disabled',
        'You need to enable notifications to test them.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open settings', onPress: openNotificationSettings }
        ]
      );
      return;
    }
    
    const notificationContent: Notifications.NotificationContentInput = {
      title: '⚽ Test Reminder',
      body: 'This is a test notification. If you see this, notifications are working!\n\nTap this notification to test deep linking.',
      sound: 'default',
      data: {
        type: 'test',
        // Test deep linking - this would navigate to home screen
        url: '/(tabs)/(home)',
      },
      badge: 1,
    };

    // iOS specific: Add category
    if (Platform.OS === 'ios') {
      notificationContent.categoryIdentifier = 'task-reminder';
    }

    // Android specific: Add priority
    if (Platform.OS === 'android') {
      notificationContent.priority = Notifications.AndroidNotificationPriority.HIGH;
    }

    const trigger: Notifications.NotificationTriggerInput = {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
    };

    // Android specific: Add channel ID
    if (Platform.OS === 'android') {
      (trigger as any).channelId = 'task-reminders';
    }

    console.log('  Scheduling test notification...');
    console.log('  Content:', JSON.stringify(notificationContent, null, 2));
    console.log('  Trigger:', JSON.stringify(trigger, null, 2));

    await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger,
    });
    
    console.log('✅ Test notification scheduled for 2 seconds from now');
    console.log('========== TEST NOTIFICATION SCHEDULED ==========');
    
    Alert.alert('Test notification', 'A test notification will appear in 2 seconds. Tap it to test deep linking!');
  } catch (error) {
    console.error('❌ Error sending test notification:', error);
    console.error('   Error details:', JSON.stringify(error, null, 2));
    console.log('========== TEST NOTIFICATION ERROR ==========');
    Alert.alert('Error', 'Failed to send test notification: ' + (error as Error).message);
  }
}

// Open device notification settings
export async function openNotificationSettings(): Promise<void> {
  try {
    console.log('📱 Opening notification settings...');
    console.log('  Platform:', Platform.OS);
    
    if (Platform.OS === 'ios') {
      await Linking.openURL('app-settings:');
    } else {
      await Linking.openSettings();
    }
    
    console.log('✅ Settings opened');
  } catch (error) {
    console.error('❌ Error opening settings:', error);
    Alert.alert('Error', 'Could not open settings');
  }
}

// CRITICAL FIX: Get notification statistics
export async function getNotificationStats(): Promise<{
  scheduled: number;
  stored: number;
  orphaned: number;
  upcoming: { taskId: string; scheduledFor: string; minutesUntil: number }[];
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
        const taskIdValue = n.content.data?.taskId;
        return {
          taskId: typeof taskIdValue === 'string' ? taskIdValue : 'unknown',
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
