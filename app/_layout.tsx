
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { useColorScheme } from 'react-native';
import { FootballProvider } from '@/contexts/FootballContext';
import { SubscriptionProvider } from '@/contexts/SubscriptionContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <FootballProvider>
        <SubscriptionProvider>
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
        </SubscriptionProvider>
      </FootballProvider>
    </ThemeProvider>
  );
}
