import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/integrations/supabase/client';
import AppleSubscriptionManager from '@/components/AppleSubscriptionManager';
import SubscriptionManager from '@/components/SubscriptionManager';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useAppleIAP, PRODUCT_IDS, TRAINER_PRODUCT_IDS } from '@/contexts/AppleIAPContext';
import { getSubscriptionGateState } from '@/utils/subscriptionGate';
import { withTimeout } from '@/utils/withTimeout';

type Role = 'admin' | 'trainer' | 'player';

type GateState = {
  hydrating: boolean;
  user: any;
  role: Role | null;
  needsSubscription: boolean;
  initError: string | null;
};

interface OnboardingGateProps {
  children: React.ReactNode;
  renderInlinePaywall?: boolean;
}

const FullScreenLoader = ({ message }: { message: string }) => (
  <View style={styles.loaderContainer}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={styles.loaderText}>{message}</Text>
  </View>
);

export function OnboardingGate({ children, renderInlinePaywall = false }: OnboardingGateProps) {
  const STARTUP_TIMEOUT_MS = 12000;
  const STARTUP_ERROR_MESSAGE = 'Kunne ikke klargøre konto. Prøv igen.';

  const [state, setState] = useState<GateState>({
    hydrating: true,
    user: null,
    role: null,
    needsSubscription: false,
    initError: null,
  });
  const [activatingSubscription, setActivatingSubscription] = useState(false);
  const [activationMessage, setActivationMessage] = useState('Aktiverer abonnement...');
  const { subscriptionStatus, refreshSubscription, createSubscription } = useSubscription();
  const { entitlementSnapshot, refreshSubscriptionStatus } = useAppleIAP();
  const { resolving } = entitlementSnapshot;
  const router = useRouter();
  const pathname = usePathname();
  const trainerProductSet = useMemo(
    () => new Set(TRAINER_PRODUCT_IDS.map(id => id.toLowerCase())),
    []
  );
  const lastNavRef = useRef<number>(0);
  const lastGateUserIdRef = useRef<string | null>(null);
  const lastNonPaywallPathRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  const hydrationRunRef = useRef(0);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      hydrationRunRef.current += 1;
    };
  }, []);
  const safeReplace = useCallback(
    (target: string) => {
      const now = Date.now();
      if (now - lastNavRef.current < 400) return;
      lastNavRef.current = now;
      router.replace(target as any);
    },
    [router]
  );
  useEffect(() => {
    setState(prev => {
      if (prev.hydrating) return prev;
      const gateState = getSubscriptionGateState({
        user: prev.user,
        subscriptionStatus,
        entitlementSnapshot,
      });
      const shouldNeed = gateState.shouldShowChooseSubscription;
      if (shouldNeed === prev.needsSubscription) return prev;
      console.log('[OnboardingGate] needsSubscription updated', {
        shouldNeed,
        user: prev.user?.id ?? null,
        role: prev.role,
        resolving: gateState.isResolving,
        isEntitled: gateState.hasActiveEntitlement,
        backendHasSubscription: gateState.hasBackendSubscription,
      });
      return { ...prev, needsSubscription: shouldNeed };
    });
  }, [entitlementSnapshot, subscriptionStatus]);
  useEffect(() => {
    subscriptionStatusRef.current = subscriptionStatus;
  }, [subscriptionStatus]);
  useEffect(() => {
    if (!resolving) {
      setActivatingSubscription(false);
    }
  }, [resolving]);
  const subscriptionStatusRef = useRef(subscriptionStatus);
  const refreshCalledRef = useRef(false);
  const ensureSubscriptionStatus = useCallback(async () => {
    if (subscriptionStatusRef.current || refreshCalledRef.current) {
      return subscriptionStatusRef.current;
    }
    refreshCalledRef.current = true;
    try {
      await refreshSubscription();
      const next = subscriptionStatusRef.current;
      if (!next) {
        refreshCalledRef.current = false;
      }
      return next ?? null;
    } catch (error) {
      console.warn('[OnboardingGate] Subscription refresh failed', error);
      refreshCalledRef.current = false;
      return subscriptionStatusRef.current ?? null;
    }
  }, [refreshSubscription]);
  const deriveRoleFromSubscription = useCallback((status: any): Role | null => {
    if (!status) return null;
    const maxPlayers = status.maxPlayers ?? status.max_players ?? status.playerLimit ?? null;
    if (typeof maxPlayers === 'number') {
      if (maxPlayers > 1) return 'trainer';
      if (maxPlayers === 1) return 'player';
    }

    const productId = (status.productId ?? status.product_id ?? status.planId ?? '').toString().toLowerCase();
    const planName = (status.planName ?? status.plan ?? '').toString().toLowerCase();

    if (productId && (trainerProductSet.has(productId) || productId.includes('trainer') || productId.includes('coach'))) {
      return 'trainer';
    }
    if (planName && (planName.includes('trainer') || planName.includes('coach'))) {
      return 'trainer';
    }
    if (productId && (productId.includes('player') || productId === PRODUCT_IDS.PLAYER_BASIC.toLowerCase() || productId === PRODUCT_IDS.PLAYER_PREMIUM.toLowerCase())) {
      return 'player';
    }
    if (planName.includes('spiller') || planName.includes('player')) return 'player';
    return null;
  }, [trainerProductSet]);
  const upsertRole = useCallback(async (userId: string, role: Role | null) => {
    if (!role) return;
    try {
      await supabase
        .from('user_roles')
        .upsert({ user_id: userId, role }, { onConflict: 'user_id' });
    } catch (error) {
      console.warn('[OnboardingGate] Failed to upsert role', error);
    }
  }, []);
  const refreshRoleAndSubscription = useCallback(
    async (user: any) => {
      const runId = ++hydrationRunRef.current;
      const setStateIfCurrent = (next: React.SetStateAction<GateState>) => {
        if (!isMountedRef.current || hydrationRunRef.current !== runId) {
          return;
        }
        setState(next);
      };
      const nextUserId = user?.id ?? null;
      if (lastGateUserIdRef.current !== nextUserId) {
        lastGateUserIdRef.current = nextUserId;
        refreshCalledRef.current = false;
        subscriptionStatusRef.current = null;
      }
      setStateIfCurrent(prev => ({ ...prev, hydrating: true, user, initError: null }));

      if (!user) {
        setStateIfCurrent({
          hydrating: false,
          user: null,
          role: null,
          needsSubscription: false,
          initError: null,
        });
        return;
      }

      try {
        const { data: roleData } = await withTimeout(
          supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle(),
          STARTUP_TIMEOUT_MS,
          'Onboarding role query timed out'
        );

        const roleFromDb = (roleData?.role as Role | null) ?? null;

        const visibleStatus = await withTimeout(
          ensureSubscriptionStatus(),
          STARTUP_TIMEOUT_MS,
          'Onboarding subscription query timed out'
        );
        const gateState = getSubscriptionGateState({
          user,
          subscriptionStatus: visibleStatus,
          entitlementSnapshot,
        });
        const derivedRole = gateState.hasActiveSubscription
          ? deriveRoleFromSubscription(visibleStatus) ?? roleFromDb
          : roleFromDb;

        if (derivedRole) {
          await withTimeout(
            upsertRole(user.id, derivedRole),
            STARTUP_TIMEOUT_MS,
            'Onboarding role upsert timed out'
          );
        }

        setStateIfCurrent({
          hydrating: false,
          user,
          role: derivedRole ?? roleFromDb,
          needsSubscription: gateState.shouldShowChooseSubscription,
          initError: null,
        });
      } catch (error) {
        console.warn('[OnboardingGate] Startup hydration failed', error);
        setStateIfCurrent(prev => ({
          ...prev,
          hydrating: false,
          user,
          needsSubscription: false,
          initError: STARTUP_ERROR_MESSAGE,
        }));
      }
    },
    [
      STARTUP_ERROR_MESSAGE,
      STARTUP_TIMEOUT_MS,
      deriveRoleFromSubscription,
      ensureSubscriptionStatus,
      entitlementSnapshot,
      upsertRole,
    ]
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const { data } = await withTimeout(
          supabase.auth.getUser(),
          STARTUP_TIMEOUT_MS,
          'Onboarding auth lookup timed out'
        );
        if (active) {
          await refreshRoleAndSubscription(data.user ?? null);
        }
      } catch (error) {
        console.warn('[OnboardingGate] Startup bootstrap failed', error);
        if (!active || !isMountedRef.current) return;
        setState(prev => ({
          ...prev,
          hydrating: false,
          needsSubscription: false,
          initError: STARTUP_ERROR_MESSAGE,
        }));
      }
    };

    bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((_, session) => {
      if (!active) return;
      refreshRoleAndSubscription(session?.user ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [refreshRoleAndSubscription]);

  const handleRetryStartup = useCallback(async () => {
    if (!isMountedRef.current) return;
    setState(prev => ({ ...prev, hydrating: true, initError: null }));
    try {
      const { data } = await withTimeout(
        supabase.auth.getUser(),
        STARTUP_TIMEOUT_MS,
        'Onboarding retry auth lookup timed out'
      );
      await refreshRoleAndSubscription(data.user ?? null);
    } catch (error) {
      console.warn('[OnboardingGate] Startup retry failed', error);
      if (!isMountedRef.current) return;
      setState(prev => ({
        ...prev,
        hydrating: false,
        needsSubscription: false,
        initError: STARTUP_ERROR_MESSAGE,
      }));
    }
  }, [STARTUP_ERROR_MESSAGE, STARTUP_TIMEOUT_MS, refreshRoleAndSubscription]);

  const handleCreateSubscription = useCallback(async (planId: string) => {
    if (!state.user) return;
    setActivationMessage('Aktiverer abonnement...');
    setActivatingSubscription(true);
    try {
      const result = await createSubscription(planId);
      if (!result.success && !result.alreadyHasSubscription) {
        Alert.alert('Fejl', result.error || 'Kunne ikke oprette abonnement. Prøv igen.');
        return;
      }
      await refreshSubscription();
      await refreshSubscriptionStatus({ force: true, reason: 'onboarding_create' });
    } catch (error: any) {
      Alert.alert('Fejl', error?.message || 'Der opstod en fejl.');
    } finally {
      setActivatingSubscription(false);
    }
  }, [createSubscription, refreshSubscription, refreshSubscriptionStatus, state.user]);

  const handleIOSPurchaseStarted = useCallback(() => {
    setActivationMessage('Aktiverer abonnement...');
    setActivatingSubscription(true);
  }, []);

  const handleIOSPurchaseFinished = useCallback(async (success: boolean) => {
    if (!success) {
      setActivatingSubscription(false);
      return;
    }
    try {
      await refreshSubscriptionStatus({ force: true, reason: 'onboarding_ios_finish' });
    } finally {
      if (!resolving) {
        setActivatingSubscription(false);
      }
    }
  }, [refreshSubscriptionStatus, resolving]);

  const needsPaywall = Boolean(state.user && state.needsSubscription && !resolving);

  const normalizeFallbackTarget = useCallback((target: string) => {
    if (target.startsWith('/(tabs)/') || target === '/(tabs)') return target;
    if (target === '/profile') return '/(tabs)/profile';
    if (target === '/library') return '/(tabs)/library';
    if (target === '/home' || target === '/') return '/(tabs)';
    return target;
  }, []);

  useEffect(() => {
    if (renderInlinePaywall) return;

    if (needsPaywall) {
      if (pathname !== '/choose-plan') {
        lastNonPaywallPathRef.current = pathname ?? null;
        safeReplace('/choose-plan');
      }
      return;
    }

    if (pathname === '/choose-plan') {
      const rawTarget = lastNonPaywallPathRef.current ?? '/(tabs)';
      const fallbackTarget = normalizeFallbackTarget(rawTarget);
      lastNonPaywallPathRef.current = null;
      safeReplace(fallbackTarget);
    }
  }, [needsPaywall, normalizeFallbackTarget, pathname, renderInlinePaywall, safeReplace]);

  if (needsPaywall && renderInlinePaywall) {
    return (
      <View style={styles.paywallContainer}>
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Vælg dit abonnement</Text>
          <Text style={styles.subtitle}>Vælg et abonnement for at fortsætte — du kan altid ændre det senere.</Text>

          <View style={styles.card}>
            {Platform.OS === 'ios' ? (
              <AppleSubscriptionManager
                isSignupFlow
                forceShowPlans
                onPurchaseStarted={handleIOSPurchaseStarted}
                onPurchaseFinished={handleIOSPurchaseFinished}
              />
            ) : (
              <SubscriptionManager
                onPlanSelected={handleCreateSubscription}
                isSignupFlow
                forceShowPlans
              />
            )}
          </View>
        </ScrollView>

        {activatingSubscription && (
          <View style={styles.overlay}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.overlayText}>{activationMessage}</Text>
          </View>
        )}
      </View>
    );
  }

  const showBlockingOverlay =
    state.hydrating ||
    Boolean(state.initError) ||
    (!renderInlinePaywall && needsPaywall && pathname !== '/choose-plan');
  const overlayMessage = state.hydrating
    ? 'Klargører konto'
    : state.initError ?? 'Åbner Vælg abonnement...';

  return (
    <View style={styles.container}>
      {children}
      {showBlockingOverlay && (
        <View style={styles.blockingOverlay} pointerEvents="auto">
          {!state.initError ? <ActivityIndicator size="large" color={colors.primary} /> : null}
          <Text style={styles.blockingOverlayText}>{overlayMessage}</Text>
          {state.initError ? (
            <Pressable
              style={styles.retryButton}
              onPress={handleRetryStartup}
              testID="onboarding.error.retryButton"
            >
              <Text style={styles.retryButtonText}>Prøv igen</Text>
            </Pressable>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 80,
    backgroundColor: colors.background,
  },
  loaderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: colors.background,
  },
  loaderText: {
    marginTop: 16,
    color: colors.text,
    fontSize: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  paywallContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    padding: 24,
  },
  overlayText: {
    marginTop: 12,
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  blockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: colors.background,
  },
  blockingOverlayText: {
    marginTop: 16,
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
