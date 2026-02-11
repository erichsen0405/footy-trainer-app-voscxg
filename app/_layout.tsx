import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, useRootNavigationState, router as globalRouter } from 'expo-router';
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
import * as Notifications from 'expo-notifications';
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

const isUserEmailConfirmed = (user: any) =>
  Boolean(user?.email_confirmed_at || user?.confirmed_at);

export default function RootLayout() {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });
  const didHideSplashRef = useRef(false);
  const pendingRouteRef = useRef<{ pathname: string; params?: Record<string, string> } | null>(null);
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());
  const isNavigationReady = Boolean(rootNavigationState?.key);

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

  const buildNotificationRoute = useCallback((response: Notifications.NotificationResponse) => {
    const data = response?.notification?.request?.content?.data ?? {};
    const activityIdRaw =
      (data as any)?.activityId ??
      (data as any)?.activity_id ??
      (data as any)?.activityID;
    const taskIdRaw = (data as any)?.taskId ?? (data as any)?.task_id ?? (data as any)?.taskID;
    const typeRaw = (data as any)?.type;
    const templateIdRaw = (data as any)?.templateId ?? (data as any)?.template_id;

    if (activityIdRaw === undefined || activityIdRaw === null) return null;
    const activityId = String(activityIdRaw);

    const params: Record<string, string> = {
      id: activityId,
      activityId,
    };

    if (taskIdRaw !== undefined && taskIdRaw !== null) {
      const taskId = String(taskIdRaw);
      const type = typeof typeRaw === 'string' ? typeRaw.toLowerCase() : '';
      const hasTemplate = typeof templateIdRaw === 'string' && templateIdRaw.length > 0;
      const isFeedback = type === 'after-training-feedback' || type === 'feedback' || hasTemplate;
      if (isFeedback) {
        params.openFeedbackTaskId = taskId;
      } else {
        params.openTaskId = taskId;
      }
    }

    return { pathname: '/activity-details', params };
  }, []);

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const responseId = response?.notification?.request?.identifier;
      if (responseId && handledNotificationIdsRef.current.has(responseId)) return;

      const route = buildNotificationRoute(response);
      if (!route) return;

      if (responseId) handledNotificationIdsRef.current.add(responseId);

      if (!isNavigationReady) {
        pendingRouteRef.current = route;
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
        return;
      }

      router.push(route as any);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    },
    [buildNotificationRoute, isNavigationReady, router],
  );

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response);
    });

    return () => {
      subscription.remove();
    };
  }, [handleNotificationResponse]);

  useEffect(() => {
    let isMounted = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!isMounted || !response) return;
        handleNotificationResponse(response);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [handleNotificationResponse]);

  useEffect(() => {
    if (!isNavigationReady) return;
    const pendingRoute = pendingRouteRef.current;
    if (!pendingRoute) return;
    pendingRouteRef.current = null;
    router.push(pendingRoute as any);
  }, [isNavigationReady, router]);

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
                <Stack.Screen name="auth/check-email" options={{ headerShown: false }} />
                <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
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
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const forcingUnverifiedSignOutRef = useRef(false);
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
      const sessionUser = data.session?.user ?? null;
      if (sessionUser && !isUserEmailConfirmed(sessionUser)) {
        setUnverifiedEmail(sessionUser.email ?? null);
        setUserId(null);
        forcingUnverifiedSignOutRef.current = true;
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        setAuthChecked(true);
        return;
      }
      forcingUnverifiedSignOutRef.current = false;
      setUnverifiedEmail(null);
      const newUserId = sessionUser?.id ?? null;
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
      const sessionUser = session?.user ?? null;
      if (!sessionUser) {
        if (!forcingUnverifiedSignOutRef.current) {
          setUnverifiedEmail(null);
        }
        forcingUnverifiedSignOutRef.current = false;
        setUserId(null);
        setAuthChecked(true);
        return;
      }
      if (sessionUser && !isUserEmailConfirmed(sessionUser)) {
        setUnverifiedEmail(sessionUser.email ?? null);
        setUserId(null);
        forcingUnverifiedSignOutRef.current = true;
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        setAuthChecked(true);
        return;
      }
      forcingUnverifiedSignOutRef.current = false;
      setUnverifiedEmail(null);
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

  const PAYWALL_EXEMPT_PREFIXES = [
    '/choose-plan',
    '/update-password',
    '/email-confirmed',
    '/auth/check-email',
    '/auth/callback',
  ];
  const isPaywallExemptRoute = PAYWALL_EXEMPT_PREFIXES.some(prefix =>
    pathname?.startsWith(prefix)
  );
  const onPaywall = pathname?.startsWith('/choose-plan');

  const entitlementReady = authChecked && Boolean(userId) && !resolving;

  useEffect(() => {
    if (!authChecked || !unverifiedEmail) return;
    if (pathname?.startsWith('/auth/check-email')) return;
    const target = `/auth/check-email?email=${encodeURIComponent(unverifiedEmail)}`;
    triggerRedirect(target);
  }, [authChecked, pathname, triggerRedirect, unverifiedEmail]);

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
