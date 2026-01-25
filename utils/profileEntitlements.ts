import { supabase } from '@/integrations/supabase/client';

export interface ProfileEntitlements {
  tier: string | null;
  productId: string | null;
  hasEntitlement: boolean;
}

/**
 * Fetches profile entitlements (subscription_tier, subscription_product_id) from Supabase.
 * Tries 'profiles' table (id = userId).
 * 
 * @param userId - The user ID to fetch entitlements for
 * @returns ProfileEntitlements object with tier, productId, and hasEntitlement flag
 */
export async function getProfileEntitlements(userId: string | null | undefined): Promise<ProfileEntitlements> {
  if (!userId) {
    return { tier: null, productId: null, hasEntitlement: false };
  }

  try {
    // Try 'profiles' table (primary key: id = userId)
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_product_id')
      .eq('id', userId)
      .maybeSingle();

    if (!profileError && profileData) {
      const tier = profileData.subscription_tier;
      const productId = profileData.subscription_product_id;
      const hasEntitlement = Boolean(tier || productId);
      
      return { tier, productId, hasEntitlement };
    }

    // No data found
    return { tier: null, productId: null, hasEntitlement: false };
  } catch (error) {
    console.warn('[ProfileEntitlements] Error fetching profile entitlements:', error);
    return { tier: null, productId: null, hasEntitlement: false };
  }
}
