import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, router as globalRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';
import { FootballProvider } from '@/contexts/FootballContext';
import { SubscriptionProvider, useSubscription } from '@/contexts/SubscriptionContext';
import { TeamPlayerProvider } from '@/contexts/TeamPlayerContext';
import { AppleIAPProvider, useAppleIAP } from '@/contexts/AppleIAPContext';
import { AdminProvider } from '@/contexts/AdminContext';
import NotificationPermissionPrompt from '@/components/NotificationPermissionPrompt';
import { supabase } from '@/integrations/supabase/client';
// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {});

const NO_PLAN_TIER_VALUES = new Set([
  'none',
  '(none)',
  'no_plan',
  'no_subscription',
  'unknown',
  'unsubscribed',
  'null',
  'undefined',
]);
const normalizeSubscriptionTier = (tier?: string | null) => {
  if (!tier) return { tier: null, tierKey: null };
  const tierKey = tier.trim().toLowerCase();
  if (!tierKey || NO_PLAN_TIER_VALUES.has(tierKey)) {
    return { tier: null, tierKey: null };
  }
  return { tier: tier.trim(), tierKey };
};

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
    <SubscriptionProvider>
      <AppleIAPProvider>
        <SubscriptionRedirectObserver />
        <TeamPlayerProvider>
          <AdminProvider>
            <FootballProvider>
              <NotificationPermissionPrompt />
              <Stack initialRouteName="index">
                {/* Root redirect route (/) */}
                <Stack.Screen name="index" options={{ headerShown: false }} />

                {/* Subscription paywall */}
                <Stack.Screen name="choose-plan" options={{ headerShown: false }} />

                {/* Main tabs */}
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="profile" options={{ headerShown: false }} />

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
      </AppleIAPProvider>
    </SubscriptionProvider>
  );
}

function SubscriptionRedirectObserver() {
  const router = useRouter();
  const pathname = usePathname();
  const { subscriptionStatus, loading: subscriptionLoading } = useSubscription();
  const { entitlementSnapshot } = useAppleIAP();

  const appleResolving = entitlementSnapshot.resolving;
  const resolving = Boolean(subscriptionLoading || appleResolving);

  const rawSubscriptionTier =
    subscriptionStatus?.subscriptionTier ?? entitlementSnapshot.subscriptionTier;
  const { tier: subscriptionTier, tierKey } = normalizeSubscriptionTier(rawSubscriptionTier);
  const backendHasSubscription = Boolean(subscriptionStatus?.hasSubscription);
  const hasAnyPlan = backendHasSubscription || Boolean(tierKey);

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

  const isCreatorCandidate = Boolean(tierKey?.startsWith('trainer'));

  const PAYWALL_EXEMPT_PREFIXES = ['/choose-plan', '/update-password', '/email-confirmed'];
  const isPaywallExemptRoute = PAYWALL_EXEMPT_PREFIXES.some(prefix =>
    pathname?.startsWith(prefix)
  );
  const onPaywall = pathname?.startsWith('/choose-plan');

  const entitlementReady = authChecked && Boolean(userId) && !resolving;

  useEffect(() => {
    if (!authChecked || resolving || !userId) {
      const now = Date.now();
      if (now - lastSuppressedLogAtRef.current > 2000) {
        lastSuppressedLogAtRef.current = now;
        console.log('[SubscriptionRedirectObserver] Paywall suppressed (still resolving)', {
          userId,
          entitlementReady: false,
          loading: subscriptionLoading,
          hasAnyPlan,
          subscriptionTier,
          isCreatorCandidate,
        });
      }
      return;
    }

    if (
      !hasAnyPlan &&
      !onPaywall &&
      !isPaywallExemptRoute &&
      !paywallRedirectedRef.current
    ) {
      paywallRedirectedRef.current = true;
      console.log('[SubscriptionRedirectObserver] Redirecting to paywall (missing plan)', {
        userId,
        hasAnyPlan,
        subscriptionTier,
        isCreatorCandidate,
        entitlementReady,
      });
      triggerRedirect('/choose-plan');
      return;
    }

    if (onPaywall && hasAnyPlan) {
      console.log('[SubscriptionRedirectObserver] Leaving paywall (plan detected)', {
        userId,
        hasAnyPlan,
        subscriptionTier,
        isCreatorCandidate,
        entitlementReady,
      });
      triggerRedirect('/(tabs)');
    }
  }, [
    authChecked,
    resolving,
    userId,
    subscriptionLoading,
    hasAnyPlan,
    subscriptionTier,
    onPaywall,
    isPaywallExemptRoute,
    triggerRedirect,
    isCreatorCandidate,
    entitlementReady,
  ]);

  return null;
}
