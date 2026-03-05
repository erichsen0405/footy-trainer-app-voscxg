import { supabase } from '@/integrations/supabase/client';

export interface ProfileEntitlements {
  tier: string | null;
  productId: string | null;
  hasEntitlement: boolean;
}

const NO_PLAN_VALUES = new Set([
  'none',
  '(none)',
  'no_plan',
  'no_subscription',
  'unknown',
  'ukendt',
  'unsubscribed',
  'null',
  'undefined',
]);

const hasMeaningfulValue = (value: unknown): boolean => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized.length) return false;
  return !NO_PLAN_VALUES.has(normalized);
};

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
    const { data: profileById, error: profileByIdError } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_product_id')
      .eq('id', userId)
      .maybeSingle();

    if (!profileByIdError && profileById) {
      const tier = profileById.subscription_tier;
      const productId = profileById.subscription_product_id;
      const hasEntitlement = hasMeaningfulValue(tier) || hasMeaningfulValue(productId);
      return { tier, productId, hasEntitlement };
    }

    const { data: profileByUserId, error: profileByUserIdError } = await supabase
      .from('profiles')
      .select('subscription_tier, subscription_product_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profileByUserIdError && profileByUserId) {
      const tier = profileByUserId.subscription_tier;
      const productId = profileByUserId.subscription_product_id;
      const hasEntitlement = hasMeaningfulValue(tier) || hasMeaningfulValue(productId);
      return { tier, productId, hasEntitlement };
    }

    // No data found or read failed
    return { tier: null, productId: null, hasEntitlement: false };
  } catch (error) {
    console.warn('[ProfileEntitlements] Error fetching profile entitlements:', error);
    return { tier: null, productId: null, hasEntitlement: false };
  }
}
