
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useAppleIAP } from '@/contexts/AppleIAPContext';
import { supabase } from '@/app/integrations/supabase/client';

interface SubscriptionFeatures {
  hasActiveSubscription: boolean;
  maxPlayers: number;
  subscriptionTier: string | null;
  canAddMorePlayers: (currentPlayerCount: number) => boolean;
  isLoading: boolean;
}

export function useSubscriptionFeatures(): SubscriptionFeatures {
  // Safely get Apple IAP context - it should always be available since provider is in _layout
  const appleIAPContext = useAppleIAP();
  const { subscriptionStatus, products, loading: iapLoading } = appleIAPContext;
  
  const [profileData, setProfileData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfileData();
  }, []);

  const fetchProfileData = async () => {
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
  };

  const getMaxPlayers = (): number => {
    if (Platform.OS === 'ios' && subscriptionStatus?.isActive && subscriptionStatus.productId) {
      const product = products.find(p => p.productId === subscriptionStatus.productId);
      return product?.maxPlayers || 0;
    }

    // Fallback to profile data
    if (profileData?.subscription_tier) {
      const tier = profileData.subscription_tier;
      if (tier === 'player') return 1;
      if (tier === 'trainer_basic') return 5;
      if (tier === 'trainer_standard') return 15;
      if (tier === 'trainer_premium') return 50;
    }

    return 0;
  };

  const hasActiveSubscription = Platform.OS === 'ios' 
    ? (subscriptionStatus?.isActive || false)
    : (profileData?.subscription_tier != null);

  const maxPlayers = getMaxPlayers();
  const subscriptionTier = Platform.OS === 'ios'
    ? subscriptionStatus?.productId || null
    : profileData?.subscription_tier || null;

  const canAddMorePlayers = (currentPlayerCount: number): boolean => {
    return hasActiveSubscription && currentPlayerCount < maxPlayers;
  };

  return {
    hasActiveSubscription,
    maxPlayers,
    subscriptionTier,
    canAddMorePlayers,
    isLoading: loading || iapLoading,
  };
}
