import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useAppleIAP, PRODUCT_IDS } from '@/contexts/AppleIAPContext';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionFeatures {
  hasActiveSubscription: boolean;
  maxPlayers: number;
  subscriptionTier: SubscriptionTier | null;
  canAddMorePlayers: (currentPlayerCount: number) => boolean;
  isLoading: boolean;
  isPlayerPremium: boolean;
  isPlayerBasic: boolean;
  featureAccess: FeatureAccess;
}

type SubscriptionTier =
  | 'player_basic'
  | 'player_premium'
  | 'trainer_basic'
  | 'trainer_standard'
  | 'trainer_premium';

type FeatureAccess = {
  library: boolean;
  calendarSync: boolean;
  trainerLinking: boolean;
};

const TIER_RANK: Record<SubscriptionTier, number> = {
  player_basic: 10,
  player_premium: 20,
  trainer_basic: 30,
  trainer_standard: 40,
  trainer_premium: 50,
};

const pickBestTier = (tiers: Array<SubscriptionTier | null | undefined>): SubscriptionTier | null => {
  let best: SubscriptionTier | null = null;
  for (const tier of tiers) {
    if (!tier) continue;
    if (!best || TIER_RANK[tier] > TIER_RANK[best]) best = tier;
  }
  return best;
};

const normalizeTier = (value?: string | null): SubscriptionTier | null => {
  if (!value) return null;
  if (value === 'player') return 'player_basic';
  if (
    value === 'player_basic' ||
    value === 'player_premium' ||
    value === 'trainer_basic' ||
    value === 'trainer_standard' ||
    value === 'trainer_premium'
  ) {
    return value;
  }
  return null;
};

const tierFromProductId = (productId?: string | null): SubscriptionTier | null => {
  if (!productId) return null;
  if (productId === PRODUCT_IDS.PLAYER_PREMIUM) return 'player_premium';
  if (productId === PRODUCT_IDS.PLAYER_BASIC) return 'player_basic';
  if (productId === PRODUCT_IDS.TRAINER_BASIC) return 'trainer_basic';
  if (productId === PRODUCT_IDS.TRAINER_STANDARD) return 'trainer_standard';
  if (productId === PRODUCT_IDS.TRAINER_PREMIUM) return 'trainer_premium';
  return null;
};

const featureAccessForTier = (tier: SubscriptionTier | null): FeatureAccess => {
  if (!tier) return { library: false, calendarSync: false, trainerLinking: false };
  const isTrainerTier = tier.startsWith('trainer');
  const isPremiumPlayer = tier === 'player_premium';
  const hasAccess = isTrainerTier || isPremiumPlayer;
  return { library: hasAccess, calendarSync: hasAccess, trainerLinking: hasAccess };
};

export function useSubscriptionFeatures(): SubscriptionFeatures {
  const {
    subscriptionStatus,
    products,
    loading: iapLoading,
    entitlements,
    iapUnavailableReason,
  } = useAppleIAP();

  const [profileData, setProfileData] = useState<{ subscription_tier?: string | null; subscription_product_id?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfileData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setProfileData(null);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_product_id')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('[useSubscriptionFeatures] Error fetching profile:', error);
        return;
      }
      setProfileData(data ?? null);
    } catch (error) {
      console.error('[useSubscriptionFeatures] Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  // Refetch profile when StoreKit sku changes or entitlements change (so UI catches up after purchase)
  useEffect(() => {
    if (subscriptionStatus?.productId || (entitlements?.length ?? 0) > 0) {
      fetchProfileData();
    }
  }, [subscriptionStatus?.productId, entitlements?.length, fetchProfileData]);

  const tierFromComplimentary = useMemo<SubscriptionTier | null>(() => {
    if (!entitlements?.length) return null;
    if (entitlements.some(e => e.entitlement === 'træner_premium')) return 'trainer_premium';
    if (entitlements.some(e => e.entitlement === 'spiller_premium')) return 'player_premium';
    return null;
  }, [entitlements]);

  const tierFromProfile = useMemo<SubscriptionTier | null>(
    () => normalizeTier(profileData?.subscription_tier ?? null),
    [profileData?.subscription_tier]
  );

  const tierFromStore = useMemo<SubscriptionTier | null>(() => {
    if (Platform.OS !== 'ios') return null;
    return tierFromProductId(subscriptionStatus?.productId ?? null);
  }, [subscriptionStatus?.productId]);

  const subscriptionTier = useMemo<SubscriptionTier | null>(
    () => tierFromComplimentary ?? tierFromStore ?? tierFromProfile,
    [tierFromComplimentary, tierFromStore, tierFromProfile]
  );

  const maxPlayers = useMemo(() => {
    if (Platform.OS === 'ios' && subscriptionStatus?.isActive && subscriptionStatus.productId) {
      const product = products.find(p => p.productId === subscriptionStatus.productId);
      if (product?.maxPlayers && product.maxPlayers > 0) return product.maxPlayers;
    }

    switch (subscriptionTier) {
      case 'player_basic':
      case 'player_premium':
        return 1;
      case 'trainer_basic':
        return 5;
      case 'trainer_standard':
        return 15;
      case 'trainer_premium':
        return 50;
      default:
        return 0;
    }
  }, [subscriptionStatus?.isActive, subscriptionStatus?.productId, products, subscriptionTier]);

  const hasActiveSubscription = useMemo(() => {
    if (Platform.OS === 'ios') {
      if (subscriptionStatus?.isActive) return true;
      if (tierFromComplimentary) return true;
      if (iapUnavailableReason && subscriptionTier) return true;
      return false;
    }
    return subscriptionTier != null;
  }, [subscriptionStatus?.isActive, tierFromComplimentary, iapUnavailableReason, subscriptionTier]);

  const featureAccess = useMemo(() => featureAccessForTier(subscriptionTier), [subscriptionTier]);

  const canAddMorePlayers = (currentPlayerCount: number): boolean => {
    return hasActiveSubscription && currentPlayerCount < maxPlayers;
  };

  return {
    hasActiveSubscription,
    maxPlayers,
    subscriptionTier,
    canAddMorePlayers,
    isLoading: loading || iapLoading,
    isPlayerPremium: subscriptionTier === 'player_premium',
    isPlayerBasic: subscriptionTier === 'player_basic',
    featureAccess,
  };
}