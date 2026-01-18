import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { useAppleIAP, PRODUCT_IDS } from '@/contexts/AppleIAPContext';
import { supabase } from '@/app/integrations/supabase/client';

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
  if (!tier) {
    return {
      library: false,
      calendarSync: false,
      trainerLinking: false,
    };
  }

  const isTrainerTier = tier.startsWith('trainer');
  const isPremiumPlayer = tier === 'player_premium';

  const hasAccess = isTrainerTier || isPremiumPlayer;

  return {
    library: hasAccess,
    calendarSync: hasAccess,
    trainerLinking: hasAccess,
  };
};

export function useSubscriptionFeatures(): SubscriptionFeatures {
  // Safely get Apple IAP context - it should always be available since provider is in _layout
  const appleIAPContext = useAppleIAP();
  const {
    subscriptionStatus,
    products,
    loading: iapLoading,
    hasPlayerPremium,
    hasTrainerPremium,
  } = appleIAPContext;
  
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfileData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('subscription_tier, subscription_product_id')
        .eq('user_id', user.id)
        .single();

      if (error) {
        console.error('[useSubscriptionFeatures] Error fetching profile:', error);
      } else {
        setProfileData(data);
      }
    } catch (error) {
      console.error('[useSubscriptionFeatures] Error:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

  useEffect(() => {
    if (subscriptionStatus?.productId || hasPlayerPremium || hasTrainerPremium) {
      fetchProfileData();
    }
  }, [subscriptionStatus?.productId, hasPlayerPremium, hasTrainerPremium, fetchProfileData]);

  const tierFromComplimentary = hasTrainerPremium
    ? 'trainer_premium'
    : hasPlayerPremium
    ? 'player_premium'
    : null;

  const tierFromStore = Platform.OS === 'ios' ? tierFromProductId(subscriptionStatus?.productId || null) : null;
  const subscriptionTier = tierFromComplimentary ?? tierFromProfile ?? tierFromStore;

  const getMaxPlayers = (): number => {
    if (Platform.OS === 'ios') {
      if (hasTrainerPremium) return 50;
      if (hasPlayerPremium) return 1;
      if (subscriptionStatus?.isActive && subscriptionStatus.productId) {
        const product = products.find(p => p.productId === subscriptionStatus.productId);
        if (product?.maxPlayers) return product.maxPlayers;
      }
    }

    if (subscriptionTier === 'player_basic' || subscriptionTier === 'player_premium') return 1;
    if (subscriptionTier === 'trainer_basic') return 5;
    if (subscriptionTier === 'trainer_standard') return 15;
    if (subscriptionTier === 'trainer_premium') return 50;

    return 0;
  };

  const hasActiveSubscription = Platform.OS === 'ios'
    ? Boolean(subscriptionStatus?.isActive || hasPlayerPremium || hasTrainerPremium)
    : subscriptionTier != null;

  const maxPlayers = getMaxPlayers();
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
