
import React, { Suspense } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { useColorScheme, View, Text, ActivityIndicator } from 'react-native';
import { FootballProvider } from '@/contexts/FootballContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';
import { TeamPlayerProvider } from '@/contexts/TeamPlayerContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

// Simple loading component for web
function LoadingScreen() {
  return (
    <View style={{ 
      flex: 1, 
      justifyContent: 'center', 
      alignItems: 'center', 
      backgroundColor: '#FF6347' 
    }}>
      <ActivityIndicator size="large" color="#FFFFFF" />
      <Text style={{ color: '#FFFFFF', marginTop: 20, fontSize: 16 }}>
        Indlæser...
      </Text>
    </View>
  );
}

// Error Boundary for web
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('Web Error Boundary caught:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Web App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ 
          flex: 1, 
          justifyContent: 'center', 
          alignItems: 'center', 
          padding: 20,
          backgroundColor: '#f5f5f5'
        }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: '#333' }}>
            Noget gik galt
          </Text>
          <Text style={{ textAlign: 'center', color: '#666', marginBottom: 20 }}>
            {this.state.error?.message || 'Der opstod en uventet fejl'}
          </Text>
          <Text 
            style={{ color: '#FF6347', textDecorationLine: 'underline', cursor: 'pointer' }}
            onPress={() => window.location.reload()}
          >
            Genindlæs siden
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function RootLayoutContent() {
  const colorScheme = useColorScheme();
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Log for debugging
    console.log('Web layout mounting, fonts loaded:', loaded, 'error:', error);
    
    if (loaded || error) {
      // Even if fonts fail to load, continue to show the app
      const timer = setTimeout(() => {
        SplashScreen.hideAsync().catch(err => {
          console.log('SplashScreen hide error (safe to ignore):', err);
        });
        setIsReady(true);
      }, 50); // Minimal delay for web

      return () => clearTimeout(timer);
    }
  }, [loaded, error]);

  // Show loading screen while initializing
  if (!isReady) {
    return <LoadingScreen />;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SubscriptionProvider>
        <TeamPlayerProvider>
          <FootballProvider>
            <Suspense fallback={<LoadingScreen />}>
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
                <Stack.Screen 
                  name="modal" 
                  options={{ 
                    presentation: 'modal',
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
                  name="transparent-modal" 
                  options={{ 
                    presentation: 'transparentModal',
                    headerShown: false,
                    animation: 'fade',
                  }} 
                />
                <Stack.Screen 
                  name="console-logs" 
                  options={{ 
                    presentation: 'modal',
                    headerShown: true,
                    title: 'Console Logs',
                  }} 
                />
                <Stack.Screen 
                  name="notification-debug" 
                  options={{ 
                    presentation: 'modal',
                    headerShown: true,
                    title: 'Notification Debug',
                  }} 
                />
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
            </Suspense>
          </FootballProvider>
        </TeamPlayerProvider>
      </SubscriptionProvider>
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
