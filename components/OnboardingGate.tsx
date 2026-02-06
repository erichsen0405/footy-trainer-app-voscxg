import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
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

type Role = 'admin' | 'trainer' | 'player';

type GateState = {
  hydrating: boolean;
  user: any;
  role: Role | null;
  needsSubscription: boolean;
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
  const [state, setState] = useState<GateState>({
    hydrating: true,
    user: null,
    role: null,
    needsSubscription: false,
  });
  const [activatingSubscription, setActivatingSubscription] = useState(false);
  const [activationMessage, setActivationMessage] = useState('Aktiverer abonnement...');
  const { subscriptionStatus, refreshSubscription, createSubscription } = useSubscription();
  const { entitlementSnapshot, refreshSubscriptionStatus } = useAppleIAP();
  const { isEntitled, resolving } = entitlementSnapshot;
  const backendHasSubscription = Boolean(subscriptionStatus?.hasSubscription);
  const router = useRouter();
  const pathname = usePathname();
  const trainerProductSet = useMemo(
    () => new Set(TRAINER_PRODUCT_IDS.map(id => id.toLowerCase())),
    []
  );
  const lastNavRef = useRef<number>(0);
  const lastGateUserIdRef = useRef<string | null>(null);
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
      const shouldNeed = Boolean(prev.user && !resolving && !isEntitled && !backendHasSubscription);
      if (shouldNeed === prev.needsSubscription) return prev;
      console.log('[OnboardingGate] needsSubscription updated', {
        shouldNeed,
        user: prev.user?.id ?? null,
        role: prev.role,
        resolving,
        isEntitled,
        backendHasSubscription,
      });
      return { ...prev, needsSubscription: shouldNeed };
    });
  }, [backendHasSubscription, isEntitled, resolving]);
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
      if (maxPlayers >= 0) return 'player';
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
      const nextUserId = user?.id ?? null;
      if (lastGateUserIdRef.current !== nextUserId) {
        lastGateUserIdRef.current = nextUserId;
        refreshCalledRef.current = false;
        subscriptionStatusRef.current = null;
      }
      setState(prev => ({ ...prev, hydrating: true, user }));

      if (!user) {
        setState({ hydrating: false, user: null, role: null, needsSubscription: false });
        return;
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();

      const roleFromDb = (roleData?.role as Role | null) ?? null;

      const visibleStatus = await ensureSubscriptionStatus();
      const derivedRole = deriveRoleFromSubscription(visibleStatus) ?? roleFromDb;

      if (derivedRole) {
        await upsertRole(user.id, derivedRole);
      }

      setState({
        hydrating: false,
        user,
        role: derivedRole ?? roleFromDb,
        needsSubscription: !(isEntitled || visibleStatus?.hasSubscription),
      });
    },
    [deriveRoleFromSubscription, ensureSubscriptionStatus, isEntitled, upsertRole]
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const { data } = await supabase.auth.getUser();
      if (active) {
        await refreshRoleAndSubscription(data.user ?? null);
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

  useEffect(() => {
    if (renderInlinePaywall) return;

    if (needsPaywall) {
      if (pathname !== '/choose-plan') {
        safeReplace('/choose-plan');
      }
      return;
    }

    if (pathname === '/choose-plan') {
      safeReplace('/(tabs)');
    }
  }, [needsPaywall, pathname, renderInlinePaywall, safeReplace]);

  if (state.hydrating) {
    return <FullScreenLoader message="Klargør konto..." />;
  }

  if (needsPaywall) {
    if (!renderInlinePaywall) {
      // Important: allow the dedicated paywall route to render.
      if (pathname === '/choose-plan') {
        return <>{children}</>;
      }
      return <FullScreenLoader message="Åbner Vælg abonnement..." />;
    }

    const PaywallManager = Platform.OS === 'ios' ? AppleSubscriptionManager : SubscriptionManager;
    const paywallProps = Platform.OS === 'ios'
      ? {
          isSignupFlow: true,
          forceShowPlans: true,
          onPurchaseStarted: handleIOSPurchaseStarted,
          onPurchaseFinished: handleIOSPurchaseFinished,
        }
      : {
          onPlanSelected: handleCreateSubscription,
          isSignupFlow: true,
          forceShowPlans: true,
        };

    return (
      <View style={styles.paywallContainer}>
        <ScrollView contentContainerStyle={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Vælg dit abonnement</Text>
          <Text style={styles.subtitle}>Vælg et abonnement for at fortsætte — du kan altid ændre det senere.</Text>

          <View style={styles.card}>
            {/* eslint-disable-next-line @typescript-eslint/ban-ts-comment */}
            {/* @ts-ignore */}
            <PaywallManager {...paywallProps} />
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

  return <>{children}</>;
}

const styles = StyleSheet.create({
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
});
