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
  if (!tier) return { library: false, calendarSync: false, trainerLinking: false };
  const isTrainerTier = tier.startsWith('trainer');
  const isPremiumPlayer = tier === 'player_premium';
  const hasAccess = isTrainerTier || isPremiumPlayer;
  return { library: hasAccess, calendarSync: hasAccess, trainerLinking: hasAccess };
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
