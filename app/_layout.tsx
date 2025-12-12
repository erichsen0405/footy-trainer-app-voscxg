
import { useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { FootballProvider } from '@/contexts/FootballContext';
import { WidgetProvider } from '@/contexts/WidgetContext';
import { AppState, AppStateStatus } from 'react-native';
import { refreshNotificationQueue } from '@/utils/notificationScheduler';
import { requestNotificationPermissions, addNotificationResponseReceivedListener } from '@/utils/notificationService';
import * as Notifications from 'expo-notifications';

export default function RootLayout() {
  const appState = useRef(AppState.currentState);
  const router = useRouter();

  useEffect(() => {
    // Initialize notifications on app start
    const initializeNotifications = async () => {
      console.log('🚀 Initializing notifications...');
      
      // Request permissions
      const hasPermission = await requestNotificationPermissions();
      
      if (hasPermission) {
        // Refresh notification queue
        await refreshNotificationQueue();
      }
    };

    initializeNotifications();

    // Listen for app state changes
    const subscription = AppState.addEventListener('change', async (nextAppState: AppStateStatus) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('📱 App has come to the foreground');
        
        // Refresh notifications when app comes to foreground
        await refreshNotificationQueue();
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // DEEP LINKING: Handle notification responses
  useEffect(() => {
    console.log('🔗 Setting up notification deep linking...');

    // Handle notification that opened the app (when app was closed)
    const checkInitialNotification = async () => {
      const response = await Notifications.getLastNotificationResponseAsync();
      if (response?.notification) {
        console.log('📬 App opened from notification (was closed)');
        handleNotificationResponse(response.notification);
      }
    };

    checkInitialNotification();

    // Handle notification taps when app is running or in background
    const subscription = addNotificationResponseReceivedListener((response) => {
      console.log('📬 Notification tapped (app was running/background)');
      handleNotificationResponse(response.notification);
    });

    return () => {
      subscription.remove();
    };
  }, [router]);

  // Navigate to activity details when notification is tapped
  const handleNotificationResponse = (notification: Notifications.Notification) => {
    try {
      const data = notification.request.content.data;
      console.log('🔍 Notification data:', data);

      if (data?.type === 'task-reminder' && data?.activityId) {
        const activityId = data.activityId as string;
        console.log('🎯 Navigating to activity:', activityId);
        
        // Navigate to activity details screen
        // Use a small delay to ensure the app is fully loaded
        setTimeout(() => {
          router.push(`/activity-details?id=${activityId}`);
        }, 100);
      }
    } catch (error) {
      console.error('❌ Error handling notification response:', error);
    }
  };

  return (
    <FootballProvider>
      <WidgetProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="modal"
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="transparent-modal"
            options={{
              presentation: 'transparentModal',
              animation: 'fade',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="formsheet"
            options={{
              presentation: 'formSheet',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="activity-details"
            options={{
              presentation: 'modal',
              headerShown: false,
            }}
          />
          <Stack.Screen
            name="notification-debug"
            options={{
              presentation: 'modal',
              title: 'Notification Debug',
            }}
          />
          <Stack.Screen
            name="console-logs"
            options={{
              presentation: 'modal',
              title: 'Console Logs',
            }}
          />
        </Stack>
      </WidgetProvider>
    </FootballProvider>
  );
}
