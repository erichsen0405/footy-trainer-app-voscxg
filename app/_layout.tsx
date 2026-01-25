import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, router as globalRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { FootballProvider } from '@/contexts/FootballContext';
import { SubscriptionProvider, useSubscription } from '@/contexts/SubscriptionContext';
import { TeamPlayerProvider } from '@/contexts/TeamPlayerContext';
import { AppleIAPProvider } from '@/contexts/AppleIAPContext';
import { AdminProvider } from '@/contexts/AdminContext';
import { supabase } from '@/integrations/supabase/client';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';
import { useAppleIAP } from '@/contexts/AppleIAPContext';

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {});

// DEV: Catch + normalize any accidental router.replace("profile")
if (__DEV__) {
  const r: any = globalRouter as any;
  if (!r.__fc_router_patched) {
    r.__fc_router_patched = true;

    const normalizeHref = (href: any) => {
      if (!href) return href;

      if (typeof href === 'string') {
        if (href === 'profile') return '/(tabs)/profile';
        if (!href.startsWith('/') && ['profile', 'home', 'library', 'tasks'].includes(href)) {
          return `/(tabs)/${href}`;
        }
        return href;
      }

      if (typeof href === 'object') {
        const { name, pathname, params } = href as any;
        if (name === 'profile' || pathname === 'profile') {
          return { pathname: '/(tabs)/profile', params };
        }
      }

      return href;
    };

    const origReplace = r.replace?.bind(r);
    if (typeof origReplace === 'function') {
      r.replace = (href: any, ...rest: any[]) => {
        const normalized = normalizeHref(href);
        if (href !== normalized) {
          console.warn('[RouterPatch] Normalized router.replace target', {
            from: href,
            to: normalized,
            stack: new Error().stack,
          });
        }
        return origReplace(normalized, ...rest);
      };
    }
  }
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const didHideSplashRef = useRef(false);

  useEffect(() => {
    if (!loaded || didHideSplashRef.current) return;
    didHideSplashRef.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  useEffect(() => {
    const splashFallbackTimer = setTimeout(() => {
      if (didHideSplashRef.current) return;
      didHideSplashRef.current = true;
      SplashScreen.hideAsync().catch(() => {});
      console.log('[RootLayout] Splash fallback hide fired');
    }, 1500);
    return () => clearTimeout(splashFallbackTimer);
  }, []);

  useEffect(() => {
    if (__DEV__) {
      const hermesEnabled = typeof (globalThis as any).HermesInternal === 'object';
      console.log(`[Hermes] Runtime ${hermesEnabled ? 'ENABLED' : 'DISABLED'}`);
    }
  }, []);

  return (
    <AppleIAPProvider>
      <SubscriptionProvider>
        <SubscriptionRedirectObserver />
        <TeamPlayerProvider>
          <AdminProvider>
            <FootballProvider>
              <Stack initialRouteName="index">
                {/* Root redirect route (/) */}
                <Stack.Screen name="index" options={{ headerShown: false }} />

                {/* Subscription paywall */}
                <Stack.Screen name="choose-plan" options={{ headerShown: false }} />

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
                {__DEV__ ? (
                  <Stack.Screen
                    name="console-logs"
                    options={{
                      presentation: 'modal',
                      headerShown: false,
                      title: 'Console Logs (DEV)',
                    }}
                  />
                ) : null}
                {__DEV__ ? (
                  <Stack.Screen
                    name="notification-debug"
                    options={{
                      presentation: 'modal',
                      headerShown: false,
                      title: 'Notification Debug (DEV)',
                    }}
                  />
                ) : null}
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

function SubscriptionRedirectObserver() {
  const router = useRouter();
  const pathname = usePathname();
  const { loading } = useSubscription();
  const { entitlementSnapshot } = useAppleIAP();
  const { resolving, isEntitled, hasActiveSubscription, subscriptionTier } = entitlementSnapshot;
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const lastRedirectRef = useRef(0);
  const paywallRedirectedRef = useRef(false);
  const lastSuppressedLogAtRef = useRef(0);
  useEffect(() => {
    paywallRedirectedRef.current = false;
    lastRedirectRef.current = 0;
  }, [userId]);
  const triggerRedirect = useCallback(
    (target: string) => {
      if (!target || pathname === target) return;
      const now = Date.now();
      if (now - lastRedirectRef.current < 400) return;
      lastRedirectRef.current = now;
      router.replace(target as any);
    },
    [pathname, router]
  );

  useEffect(() => {
    let isActive = true;
    const syncSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!isActive) return;
      const newUserId = data.session?.user?.id ?? null;
      setUserId(newUserId);
      if (newUserId) {
        // const entitlements = await getProfileEntitlements(newUserId).catch(error => {
        //   console.warn('[SubscriptionRedirectObserver] Initial entitlement fetch failed', error);
        //   return { hasEntitlement: false };
        // });
        // if (isActive) setProfileEntitled(Boolean(entitlements?.hasEntitlement));
      } else {
        // setProfileEntitled(false);
      }
      setAuthChecked(true);
    };
    syncSession();
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!isActive) return;
      const newUserId = session?.user?.id ?? null;
      setUserId(newUserId);
      if (newUserId) {
        // const entitlements = await getProfileEntitlements(newUserId).catch(error => {
        //   console.warn('[SubscriptionRedirectObserver] Auth entitlement fetch failed', error);
        //   return { hasEntitlement: false };
        // });
        // if (isActive) setProfileEntitled(Boolean(entitlements?.hasEntitlement));
      } else {
        // setProfileEntitled(false);
      }
      setAuthChecked(true);
    });
    return () => {
      isActive = false;
      listener.subscription.unsubscribe();
    };
  }, []);
  const isCreatorCandidate = Boolean(subscriptionTier?.startsWith('trainer'));
  const onPaywall = pathname?.startsWith('/choose-plan');
  const entitlementReady = authChecked && !resolving;
  useEffect(() => {
    if (!authChecked || resolving || !userId) {
      const now = Date.now();
      if (now - lastSuppressedLogAtRef.current > 2000) {
        lastSuppressedLogAtRef.current = now;
        console.log('[SubscriptionRedirectObserver] Paywall suppressed (still resolving)', {
          userId,
          entitlementReady: false,
          loading,
          hasActiveSubscription,
          subscriptionTier,
          isCreatorCandidate,
          isEntitled,
        });
      }
      return;
    }
    if (!isEntitled && !onPaywall && !paywallRedirectedRef.current) {
      paywallRedirectedRef.current = true;
      console.log('[SubscriptionRedirectObserver] Redirecting to paywall (missing subscription)', {
        userId,
        hasActiveSubscription,
        subscriptionTier,
        isCreatorCandidate,
        isEntitled,
        entitlementReady: true,
      });
      triggerRedirect('/choose-plan');
      return;
    }
    if (onPaywall && isEntitled) {
      console.log('[SubscriptionRedirectObserver] Leaving paywall (subscription restored)', {
        userId,
        hasActiveSubscription,
        subscriptionTier,
        isCreatorCandidate,
        isEntitled,
        entitlementReady: true,
      });
      triggerRedirect('/(tabs)');
    }
  }, [authChecked, resolving, userId, loading, hasActiveSubscription, subscriptionTier, isEntitled, onPaywall, triggerRedirect]);
  return null;
}
