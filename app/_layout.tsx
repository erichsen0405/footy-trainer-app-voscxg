import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, useRootNavigationState } from 'expo-router';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearPushTokenCache, syncPushTokenForCurrentUser } from '@/utils/pushTokenService';
import { buildNotificationRouteFromResponse } from '@/utils/notificationDeepLink';
// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync().catch(() => {});

const PENDING_NOTIFICATION_ROUTE_KEY = '@pending_notification_route_v1';

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
  const pendingTaskIdRef = useRef<string | null>(null);
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pendingRouteStorageLoaded, setPendingRouteStorageLoaded] = useState(false);
  const isNavigationReady = Boolean(rootNavigationState?.key);
  const canHandleNotificationNavigation = isNavigationReady && authReady && isAuthenticated;

  const persistPendingRoute = useCallback(
    (route: { pathname: string; params?: Record<string, string> } | null) => {
      if (!route) {
        AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY).catch(() => {});
        return;
      }
      AsyncStorage.setItem(PENDING_NOTIFICATION_ROUTE_KEY, JSON.stringify(route)).catch(() => {});
    },
    [],
  );

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

  const handleNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      if (response?.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const responseId = response?.notification?.request?.identifier;
      if (responseId && handledNotificationIdsRef.current.has(responseId)) return;

      const route: { pathname: string; params?: Record<string, string> } =
        buildNotificationRouteFromResponse(response) ?? {
          pathname: '/(tabs)/(home)',
          params: {},
        };

      if (responseId) handledNotificationIdsRef.current.add(responseId);
      if (route.pathname === '/(tabs)/(home)') {
        console.warn('[NotificationDeepLink] Missing or invalid payload; falling back to home');
      }
      if (
        route.pathname === '/activity-details' &&
        !route.params?.openTaskId &&
        !route.params?.openFeedbackTaskId
      ) {
        console.warn('[NotificationDeepLink] Missing task id; opening activity task list instead');
      }

      pendingRouteRef.current = route;
      pendingTaskIdRef.current =
        route.params?.openTaskId ?? route.params?.openFeedbackTaskId ?? null;
      persistPendingRoute(route);

      if (!canHandleNotificationNavigation) {
        Notifications.clearLastNotificationResponseAsync().catch(() => {});
        return;
      }

      pendingRouteRef.current = null;
      pendingTaskIdRef.current = null;
      persistPendingRoute(null);
      router.push(route as any);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    },
    [canHandleNotificationNavigation, persistPendingRoute, router],
  );

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PENDING_NOTIFICATION_ROUTE_KEY)
      .then((serialized) => {
        if (cancelled) return;
        if (!serialized) {
          setPendingRouteStorageLoaded(true);
          return;
        }
        try {
          const parsed = JSON.parse(serialized) as { pathname?: string; params?: Record<string, string> };
          if (typeof parsed?.pathname !== 'string' || !parsed.pathname.trim().length) return;
          pendingRouteRef.current = {
            pathname: parsed.pathname,
            params: parsed.params && typeof parsed.params === 'object' ? parsed.params : undefined,
          };
          pendingTaskIdRef.current =
            pendingRouteRef.current.params?.openTaskId ??
            pendingRouteRef.current.params?.openFeedbackTaskId ??
            null;
        } catch {
          AsyncStorage.removeItem(PENDING_NOTIFICATION_ROUTE_KEY).catch(() => {});
        } finally {
          setPendingRouteStorageLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setPendingRouteStorageLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
    if (!canHandleNotificationNavigation) return;
    if (!pendingRouteStorageLoaded) return;
    const pendingRoute = pendingRouteRef.current;
    if (!pendingRoute) return;
    pendingRouteRef.current = null;
    pendingTaskIdRef.current = null;
    persistPendingRoute(null);
    router.push(pendingRoute as any);
    Notifications.clearLastNotificationResponseAsync().catch(() => {});
  }, [canHandleNotificationNavigation, pendingRouteStorageLoaded, persistPendingRoute, router]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!isMounted) return;
        setIsAuthenticated(Boolean(data.session?.user));
        setAuthReady(true);
      })
      .catch(() => {
        if (!isMounted) return;
        setIsAuthenticated(false);
        setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session?.user));
      setAuthReady(true);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const syncPushToken = async (force = false) => {
      if (cancelled) return;
      await syncPushTokenForCurrentUser(force);
    };

    void syncPushToken();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        void clearPushTokenCache();
        return;
      }
      if (session?.user) {
        void syncPushToken(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
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
                <Stack.Screen name="auth/check-email" options={{ headerShown: false }} />
                <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
                <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
                <Stack.Screen name="auth/recovery-callback" options={{ headerShown: false }} />
                <Stack.Screen name="auth/recovery-redirect" options={{ headerShown: false }} />
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
  const isRecoveryFlowRoute = Boolean(
    pathname?.startsWith('/auth/callback') ||
    pathname?.startsWith('/auth/recovery-callback') ||
    pathname?.startsWith('/auth/recovery-redirect') ||
    pathname?.startsWith('/update-password')
  );

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
      if (sessionUser && !isUserEmailConfirmed(sessionUser) && !isRecoveryFlowRoute) {
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
      if (sessionUser && !isUserEmailConfirmed(sessionUser) && !isRecoveryFlowRoute) {
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
  }, [isRecoveryFlowRoute]);

  const isCreatorCandidate = Boolean(tierKey?.startsWith('trainer'));

  const PAYWALL_EXEMPT_PREFIXES = [
    '/choose-plan',
    '/update-password',
    '/email-confirmed',
    '/auth/check-email',
    '/auth/forgot-password',
    '/auth/callback',
    '/auth/recovery-callback',
    '/auth/recovery-redirect',
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
