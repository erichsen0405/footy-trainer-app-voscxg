
import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { FootballProvider } from '@/contexts/FootballContext';
import { WidgetProvider } from '@/contexts/WidgetContext';
import { AppState, AppStateStatus } from 'react-native';
import { refreshNotificationQueue } from '@/utils/notificationScheduler';
import { requestNotificationPermissions } from '@/utils/notificationService';

export default function RootLayout() {
  const appState = useRef(AppState.currentState);

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
