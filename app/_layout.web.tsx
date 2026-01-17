import React, { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import 'react-native-reanimated';

import { FootballProvider } from '@/contexts/FootballContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { TeamPlayerProvider } from '@/contexts/TeamPlayerContext';
import { AdminProvider } from '@/contexts/AdminContext';

SplashScreen.preventAutoHideAsync().catch(() => {});

/* ---------------------------------- */
/* CRITICAL: Block tolt.js runtime    */
/* ---------------------------------- */
if (typeof window !== 'undefined') {
  // Ensure tolt.js never executes on Web
  if ((window as any).tolt) {
    console.warn('[RN Web] Detected tolt.js - removing for React Native Web compatibility');
    delete (window as any).tolt;
  }
  
  // Block any future tolt injection
  Object.defineProperty(window, 'tolt', {
    get: () => undefined,
    set: () => {
      console.warn('[RN Web] Blocked tolt.js injection attempt');
    },
    configurable: false,
  });
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  // Additional runtime check for tolt.js
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).tolt) {
      console.error('[RN Web] CRITICAL: tolt.js detected after mount - this should not happen');
      delete (window as any).tolt;
    }
  }, []);

  // Hermes log mirroring
  useEffect(() => {
    if (__DEV__) {
      const hermesEnabled = typeof (globalThis as any).HermesInternal === 'object';
      console.log(`[Hermes] Runtime ${hermesEnabled ? 'ENABLED' : 'DISABLED'}`);
    }
  }, []);

  // Don't return null - always render the router
  // Fonts will load in the background
  return (
    <SubscriptionProvider>
      <TeamPlayerProvider>
        <AdminProvider>
          <FootballProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="+not-found" />
              <Stack.Screen name="activity-details" options={{ presentation: 'modal' }} />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
              <Stack.Screen name="formsheet" options={{ presentation: 'formSheet' }} />
              <Stack.Screen
                name="transparent-modal"
                options={{ presentation: 'transparentModal', animation: 'fade' }}
              />
              <Stack.Screen name="console-logs" options={{ headerShown: true }} />
              <Stack.Screen name="notification-debug" options={{ headerShown: true }} />
              <Stack.Screen name="email-confirmed" />
              <Stack.Screen name="update-password" />
            </Stack>
            <StatusBar style="auto" />
          </FootballProvider>
        </AdminProvider>
      </TeamPlayerProvider>
    </SubscriptionProvider>
  );
}
