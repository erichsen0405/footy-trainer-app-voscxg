
import React from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { useColorScheme, View, Text, ActivityIndicator, Platform } from 'react-native';
import { FootballProvider } from '@/contexts/FootballContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { TeamPlayerProvider } from '@/contexts/TeamPlayerContext';
import { AppleIAPProvider } from '@/contexts/AppleIAPContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10 }}>
            Noget gik galt
          </Text>
          <Text style={{ textAlign: 'center', color: '#666' }}>
            {this.state.error?.message || 'Der opstod en uventet fejl'}
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (loaded) {
      // Add a small delay for web to ensure everything is mounted
      if (Platform.OS === 'web') {
        setTimeout(() => {
          SplashScreen.hideAsync();
          setIsReady(true);
        }, 100);
      } else {
        SplashScreen.hideAsync();
        setIsReady(true);
      }
    }
  }, [loaded]);

  // Show a simple loading indicator while fonts are loading
  if (!loaded || !isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FF6347' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppleIAPProvider>
        <SubscriptionProvider>
          <TeamPlayerProvider>
            <FootballProvider>
              <Stack>
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="+not-found" />
                <Stack.Screen 
                  name="activity-details" 
                  options={{ 
                    presentation: 'modal',
                    headerShown: false,
                  }} 
                />
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
                <Stack.Screen 
                  name="email-confirmed" 
                  options={{ 
                    headerShown: false,
                  }} 
                />
                <Stack.Screen 
                  name="update-password" 
                  options={{ 
                    headerShown: false,
                  }} 
                />
              </Stack>
              <StatusBar style="auto" />
            </FootballProvider>
          </TeamPlayerProvider>
        </SubscriptionProvider>
      </AppleIAPProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <RootLayoutContent />
    </ErrorBoundary>
  );
}
