import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import 'react-native-reanimated';

import { FootballProvider } from '@/contexts/FootballContext';
import { SubscriptionProvider, useSubscription } from '@/contexts/SubscriptionContext';
import { TeamPlayerProvider } from '@/contexts/TeamPlayerContext';
import { AdminProvider } from '@/contexts/AdminContext';
import { AppleIAPProvider, useAppleIAP } from '@/contexts/AppleIAPContext';
import { supabase } from '@/integrations/supabase/client';

SplashScreen.preventAutoHideAsync().catch(() => {});

/* ---------------------------------- */
/* CRITICAL: Block tolt.js runtime    */
/* ---------------------------------- */
if (typeof window !== 'undefined') {
  if ((window as any).tolt) {
    console.warn('[RN Web] Detected tolt.js - removing for React Native Web compatibility');
    try {
      delete (window as any).tolt;
    } catch (error) {
      console.warn('[RN Web] Unable to delete tolt.js reference', error);
    }
  }

  const toltDescriptor = Object.getOwnPropertyDescriptor(window, 'tolt');
  const shouldPatchTolt = !toltDescriptor || isDescriptorConfigurable(toltDescriptor);

  if (shouldPatchTolt) {
    try {
      Object.defineProperty(window, 'tolt', {
        get: () => undefined,
        set: () => {
          console.warn('[RN Web] Blocked tolt.js injection attempt');
        },
        configurable: false,
      });
    } catch (error) {
      console.warn('[RN Web] Failed to lock tolt.js property', error);
    }
  } else if (__DEV__) {
    console.log('[RN Web] tolt.js guard already installed');
  }
}

function isDescriptorConfigurable(descriptor: PropertyDescriptor) {
  return descriptor.configurable !== false;
}

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
  if (!tier) return { tier: null as string | null, tierKey: null as string | null };
  const tierKey = tier.trim().toLowerCase();
  if (!tierKey || NO_PLAN_TIER_VALUES.has(tierKey)) {
    return { tier: null as string | null, tierKey: null as string | null };
  }
  return { tier: tier.trim(), tierKey };
};

const isUserEmailConfirmed = (user: any) =>
  Boolean(user?.email_confirmed_at || user?.confirmed_at);

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

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
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="choose-plan" />
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="profile" />
                <Stack.Screen name="+not-found" />
                <Stack.Screen name="activity-details" options={{ presentation: 'modal' }} />
                <Stack.Screen name="auth/check-email" />
                <Stack.Screen name="auth/callback" />
                <Stack.Screen name="email-confirmed" />
                <Stack.Screen name="update-password" />
                {__DEV__ ? <Stack.Screen name="console-logs" options={{ headerShown: true }} /> : null}
                {__DEV__ ? (
                  <Stack.Screen name="notification-debug" options={{ headerShown: true }} />
                ) : null}
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
      setUserId(sessionUser?.id ?? null);
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
      setUserId(sessionUser?.id ?? null);
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
  const isPaywallExemptRoute = PAYWALL_EXEMPT_PREFIXES.some(prefix => pathname?.startsWith(prefix));
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
        console.log('[WebSubscriptionRedirect] Paywall suppressed (still resolving)', {
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

    if (!hasAnyPlan && !onPaywall && !isPaywallExemptRoute && !paywallRedirectedRef.current) {
      paywallRedirectedRef.current = true;
      console.log('[WebSubscriptionRedirect] Redirecting to paywall (missing plan)', {
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
      console.log('[WebSubscriptionRedirect] Leaving paywall (plan detected)', {
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
