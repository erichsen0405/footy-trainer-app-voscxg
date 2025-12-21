
import React, { Suspense, useEffect, useState } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import 'react-native-reanimated';
import {
  ActivityIndicator,
  Text,
  View,
  useColorScheme,
  Pressable,
} from 'react-native';

import { FootballProvider } from '@/contexts/FootballContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { TeamPlayerProvider } from '@/contexts/TeamPlayerContext';

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

/* ---------------------------------- */
/* Loading screen (RN-safe)            */
/* ---------------------------------- */
function LoadingScreen() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#FF6347',
      }}
    >
      <ActivityIndicator size="large" color="#FFFFFF" />
      <Text style={{ color: '#FFFFFF', marginTop: 16, fontSize: 16 }}>
        Indlæser…
      </Text>
    </View>
  );
}

/* ---------------------------------- */
/* Error Boundary (RN-safe)            */
/* ---------------------------------- */
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('Web Error Boundary:', error);
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
            backgroundColor: '#f5f5f5',
          }}
        >
          <Text style={{ fontSize: 22, fontWeight: '600', marginBottom: 12 }}>
            Noget gik galt
          </Text>

          <Text
            style={{
              textAlign: 'center',
              color: '#666',
              marginBottom: 24,
            }}
          >
            {this.state.message ?? 'Der opstod en uventet fejl'}
          </Text>

          <Pressable
            onPress={() => {
              // RN-safe reload trigger
              if (typeof window !== 'undefined') {
                window.location.reload();
              }
            }}
            style={{
              paddingHorizontal: 20,
              paddingVertical: 10,
              backgroundColor: '#FF6347',
              borderRadius: 6,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              Prøv igen
            </Text>
          </Pressable>
        </View>
      );
    }

    return this.props.children;
  }
}

/* ---------------------------------- */
/* Root layout content                 */
/* ---------------------------------- */
function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const [ready, setReady] = useState(false);

  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
      setReady(true);
    }
  }, [fontsLoaded]);

  // Additional runtime check for tolt.js
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).tolt) {
      console.error('[RN Web] CRITICAL: tolt.js detected after mount - this should not happen');
      delete (window as any).tolt;
    }
  }, []);

  if (!ready) {
    return <LoadingScreen />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SubscriptionProvider>
        <TeamPlayerProvider>
          <FootballProvider>
            <Suspense fallback={<LoadingScreen />}>
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
            </Suspense>
          </FootballProvider>
        </TeamPlayerProvider>
      </SubscriptionProvider>
    </ThemeProvider>
  );
}

/* ---------------------------------- */
/* Export                             */
/* ---------------------------------- */
export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RootLayoutContent />
    </ErrorBoundary>
  );
}
