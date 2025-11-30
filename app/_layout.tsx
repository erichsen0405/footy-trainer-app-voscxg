
import React, { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { useColorScheme } from 'react-native';
import { ThemeProvider, DarkTheme, DefaultTheme } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { FootballProvider } from '@/contexts/FootballContext';
import { addNotificationResponseListener } from '@/utils/notificationService';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  // Listen for notification responses (when user taps on a notification)
  useEffect(() => {
    const subscription = addNotificationResponseListener((response) => {
      console.log('Notification tapped:', response);
      
      const { activityId, taskId } = response.notification.request.content.data;
      
      if (activityId) {
        // Navigate to the activity details screen
        router.push(`/activity-details?id=${activityId}`);
      }
    });

    return () => {
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
