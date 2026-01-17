import React, { useEffect } from 'react';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { FootballProvider } from '@/contexts/FootballContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { TeamPlayerProvider } from '@/contexts/TeamPlayerContext';
import { AppleIAPProvider } from '@/contexts/AppleIAPContext';
import { AdminProvider } from '@/contexts/AdminContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    if (__DEV__) {
      const hermesEnabled = typeof (globalThis as any).HermesInternal === 'object';
      console.log(`[Hermes] Runtime ${hermesEnabled ? 'ENABLED' : 'DISABLED'}`);
    }
  }, []);

  return (
    <AppleIAPProvider>
      <SubscriptionProvider>
        <TeamPlayerProvider>
          <AdminProvider>
            <FootballProvider>
              <Stack initialRouteName="index">
                {/* Root redirect route (/) */}
                <Stack.Screen name="index" options={{ headerShown: false }} />

                {/* Main tabs */}
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />

                {/* Modals overlay */}
                <Stack.Screen
                  name="(modals)"
                  options={{
                    presentation: 'transparentModal',
                    headerShown: false,
                    contentStyle: { backgroundColor: 'transparent' },
                    animation: 'fade',
                  }}
                />

                {/* Activity details */}
                <Stack.Screen
                  name="activity-details"
                  options={{
                    presentation: 'modal',
                    headerShown: false,
                  }}
                />

                {/* Not found */}
                <Stack.Screen name="+not-found" options={{ headerShown: false }} />

                {/* Debug routes - only available in development */}
                {__DEV__ && (
                  <React.Fragment>
                    <Stack.Screen
                      name="console-logs"
                      options={{
                        presentation: 'modal',
                        headerShown: false,
                        title: 'Console Logs (DEV)',
                      }}
                    />
                    <Stack.Screen
                      name="notification-debug"
                      options={{
                        presentation: 'modal',
                        headerShown: false,
                        title: 'Notification Debug (DEV)',
                      }}
                    />
                  </React.Fragment>
                )}

                <Stack.Screen name="email-confirmed" options={{ headerShown: false }} />
                <Stack.Screen name="update-password" options={{ headerShown: false }} />
              </Stack>

              <StatusBar style="auto" />
            </FootballProvider>
          </AdminProvider>
        </TeamPlayerProvider>
      </SubscriptionProvider>
    </AppleIAPProvider>
  );
}
