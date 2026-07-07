import { useEffect, useMemo } from 'react';
import { useAppleIAP } from '@/contexts/AppleIAPContext';
import type { SubscriptionTier } from '@/services/entitlementsSync';

interface SubscriptionFeatures {
  hasActiveSubscription: boolean;
  maxPlayers: number;
  subscriptionTier: SubscriptionTier | null;
  canAddMorePlayers: (currentPlayerCount: number) => boolean;
  isLoading: boolean;
  isPlayerPremium: boolean;
  isPlayerBasic: boolean;
  featureAccess: FeatureAccess;
  isEntitlementResolving: boolean;
}

type FeatureAccess = {
  library: boolean;
  calendarSync: boolean;
  trainerLinking: boolean;
  reports: boolean;
  programs: boolean;
  videoFeedback: boolean;
  booking: boolean;
};

// Exported for unit tests; keep usage internal to this module in app code.
export const MAX_PLAYERS_BY_TIER: Record<SubscriptionTier, number> = {
  player_basic: 1,
  player_premium: 1,
  trainer_basic: 5,
  trainer_standard: 15,
  trainer_premium: 50,
};

export const featureAccessForTier = (tier: SubscriptionTier | null): FeatureAccess => {
  const locked = {
    library: false,
    calendarSync: false,
    trainerLinking: false,
    reports: false,
    programs: false,
    videoFeedback: false,
    booking: false,
  };
  if (!tier || tier === 'player_basic') return locked;
  if (tier === 'player_premium') {
    return { ...locked, library: true, calendarSync: true, trainerLinking: true };
  }
  if (tier === 'trainer_basic') {
    return {
      ...locked,
      library: true,
      calendarSync: true,
      trainerLinking: true,
      programs: true,
    };
  }
  if (tier === 'trainer_standard') {
    return {
      ...locked,
      library: true,
      calendarSync: true,
      trainerLinking: true,
      reports: true,
      programs: true,
      videoFeedback: true,
    };
  }
  return {
    library: true,
    calendarSync: true,
    trainerLinking: true,
    reports: true,
    programs: true,
    videoFeedback: true,
    booking: true,
  };
};

export function useSubscriptionFeatures(): SubscriptionFeatures {
  const { entitlementSnapshot } = useAppleIAP();
  const { subscriptionTier, hasActiveSubscription, resolving } = entitlementSnapshot;

  const featureAccess = useMemo(() => featureAccessForTier(subscriptionTier), [subscriptionTier]);

  const maxPlayers = subscriptionTier ? MAX_PLAYERS_BY_TIER[subscriptionTier] ?? 0 : 0;

  const canAddMorePlayers = (currentPlayerCount: number) =>
    hasActiveSubscription && currentPlayerCount < maxPlayers;

  useEffect(() => {
    if (!__DEV__) return;
    if (hasActiveSubscription && !subscriptionTier) {
      console.warn('[useSubscriptionFeatures] Active subscription without tier detected');
    }
    console.log('[useSubscriptionFeatures] Derived feature access', {
      subscriptionTier,
      hasActiveSubscription,
      featureAccess,
      isCreatorCandidate: subscriptionTier?.startsWith('trainer') ?? false,
    });
  }, [subscriptionTier, hasActiveSubscription, featureAccess]);

  return {
    hasActiveSubscription,
    maxPlayers,
    subscriptionTier,
    canAddMorePlayers,
    isLoading: resolving,
    isPlayerPremium: subscriptionTier === 'player_premium',
    isPlayerBasic: subscriptionTier === 'player_basic',
    featureAccess,
    isEntitlementResolving: resolving,
  };
}
