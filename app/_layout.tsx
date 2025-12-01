
import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useColorScheme, Alert } from 'react-native';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { FootballProvider } from '@/contexts/FootballContext';
import { 
  addNotificationResponseListener, 
  addNotificationReceivedListener,
  requestNotificationPermissions,
  getAllScheduledNotifications 
} from '@/utils/notificationService';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // CRITICAL: Request notification permissions on app start
  useEffect(() => {
    const setupNotifications = async () => {
      console.log('🚀 Setting up notifications on app start...');
      
      // Request permissions
      const granted = await requestNotificationPermissions();
      
      if (granted) {
        console.log('✅ Notification permissions granted');
        
        // Log all scheduled notifications for debugging
        await getAllScheduledNotifications();
      } else {
        console.log('❌ Notification permissions denied');
      }
    };

    setupNotifications();
  }, []);

  // Listen for notification responses (when user taps on a notification)
  useEffect(() => {
    console.log('👂 Setting up notification response listener...');
    
    const subscription = addNotificationResponseListener((response) => {
      console.log('🔔 Notification tapped:', response);
      
      const { activityId, taskId } = response.notification.request.content.data;
      
      if (activityId) {
        console.log('📍 Navigating to activity:', activityId);
        // Navigate to the activity details screen
        router.push(`/activity-details?id=${activityId}`);
      }
    });

    return () => {
      console.log('🔇 Removing notification response listener');
      subscription.remove();
    };
  }, [router]);

  // CRITICAL: Listen for incoming notifications (when notification is received while app is open)
  useEffect(() => {
    console.log('👂 Setting up notification received listener...');
    
    const subscription = addNotificationReceivedListener((notification) => {
      console.log('🔔 Notification received while app is open:', notification.request.content.title);
      
      // Show an alert when notification is received while app is in foreground
      Alert.alert(
        notification.request.content.title || 'Påmindelse',
        notification.request.content.body || '',
        [
          {
            text: 'OK',
            style: 'default',
          },
          {
            text: 'Se opgave',
            style: 'default',
            onPress: () => {
              const { activityId } = notification.request.content.data;
              if (activityId) {
                router.push(`/activity-details?id=${activityId}`);
              }
            },
          },
        ]
      );
    });

    return () => {
      console.log('🔇 Removing notification received listener');
      subscription.remove();
    };
  }, [router]);

  return (
    <ThemeProvider value={DefaultTheme}>
      <FootballProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          <Stack.Screen name="formsheet" options={{ presentation: 'formSheet' }} />
          <Stack.Screen name="transparent-modal" options={{ presentation: 'transparentModal' }} />
        </Stack>
      </FootballProvider>
    </ThemeProvider>
  );
}
