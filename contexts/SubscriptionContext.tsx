import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PRODUCT_IDS } from '@/contexts/appleProductIds';
import { bumpEntitlementsVersion, subscribeToEntitlementVersion } from '@/services/entitlementsEvents';
import type { SubscriptionTier } from '@/services/entitlementsSync';

export function forceEntitlementVersionBump(reason = 'external') {
  bumpEntitlementsVersion(reason);
}

function forceUserRoleRefresh(reason: string) {
  try {
    console.log('[SubscriptionContext] forceUserRoleRefresh', { reason });
    bumpEntitlementsVersion(`role-refresh:${reason}`);
  } catch (error) {
    console.warn('[SubscriptionContext] forceUserRoleRefresh failed', error, { reason });
  }
}

type SubscriptionPlan = {
  id: string;
  name: string;
  price_dkk: number;
  max_players: number;
  currency_code?: string | null;
  price_amount?: number | null;
  localized_price?: string | null;
};

type SubscriptionStatus = {
  hasSubscription: boolean;
  status: string | null;
  planName: string | null;
  maxPlayers: number;
  currentPlayers: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  subscriptionTier: SubscriptionTier | null;
};

export type AppleEntitlementIngest = {
  resolving: boolean;
  isEntitled: boolean;
  activeProductId: string | null;
  subscriptionTier: SubscriptionTier | null;
};

const defaultAppleEntitlements: AppleEntitlementIngest = {
  resolving: true,
  isEntitled: false,
  activeProductId: null,
  subscriptionTier: null,
};

const buildEmptyStatus = (): SubscriptionStatus => ({
  hasSubscription: false,
  status: null,
  planName: null,
  maxPlayers: 0,
  currentPlayers: 0,
  trialEnd: null,
  currentPeriodEnd: null,
  subscriptionTier: null,
});

interface SubscriptionContextType {
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionPlans: SubscriptionPlan[];
  loading: boolean;
  refreshSubscription: () => Promise<void>;
  createSubscription: (
    planId: string
  ) => Promise<{ success: boolean; error?: string; alreadyHasSubscription?: boolean }>;
  changeSubscriptionPlan: (
    planId: string
  ) => Promise<{
    success: boolean;
    error?: string;
    unsupported?: boolean;
    alreadyOnPlan?: boolean;
  }>;
  entitlementVersion: number;
  ingestAppleEntitlements?: (snapshot: AppleEntitlementIngest | null) => void;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

/**
 * Signature skal kun indeholde felter der påvirker adgang/gating,
 * ellers risikerer vi remounts ved “støj” (fx currentPlayers ændringer).
 */
const buildEntitlementSignature = (s: SubscriptionStatus | null): string => {
  if (!s) return 'null';
  return [
    s.hasSubscription ? '1' : '0',
    s.status ?? 'none',
    s.planName ?? 'none',
    s.subscriptionTier ?? 'none',
    String(s.maxPlayers ?? 0),
  ].join('|');
};

const derivePlanMetaFromSku = (sku: string | null) => {
  switch (sku) {
    case PRODUCT_IDS.PLAYER_PREMIUM:
      return { name: 'Premium spiller', maxPlayers: 1 };
    case PRODUCT_IDS.PLAYER_BASIC:
      return { name: 'Basis spiller', maxPlayers: 1 };
    case PRODUCT_IDS.TRAINER_BASIC:
      return { name: 'Træner Basis', maxPlayers: 5 };
    case PRODUCT_IDS.TRAINER_STANDARD:
      return { name: 'Træner Standard', maxPlayers: 15 };
    case PRODUCT_IDS.TRAINER_PREMIUM:
      return { name: 'Træner Premium', maxPlayers: 50 };
    default:
      return null;
  }
};

const derivePlanMetaFromTier = (tier: SubscriptionTier | null) => {
  switch (tier) {
    case 'player_premium':
      return { name: 'Premium spiller', maxPlayers: 1 };
    case 'player_basic':
      return { name: 'Basis spiller', maxPlayers: 1 };
    case 'trainer_basic':
      return { name: 'Træner Basis', maxPlayers: 5 };
    case 'trainer_standard':
      return { name: 'Træner Standard', maxPlayers: 15 };
    case 'trainer_premium':
      return { name: 'Træner Premium', maxPlayers: 50 };
    default:
      return null;
  }
};

const subscriptionTierFromSku = (sku: string | null): SubscriptionTier | null => {
  switch (sku) {
    case PRODUCT_IDS.PLAYER_PREMIUM:
      return 'player_premium';
    case PRODUCT_IDS.PLAYER_BASIC:
      return 'player_basic';
    case PRODUCT_IDS.TRAINER_BASIC:
      return 'trainer_basic';
    case PRODUCT_IDS.TRAINER_STANDARD:
      return 'trainer_standard';
    case PRODUCT_IDS.TRAINER_PREMIUM:
      return 'trainer_premium';
    default:
      return null;
  }
};

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [entitlementVersion, setEntitlementVersion] = useState(0);
  const [appleEntitlements, setAppleEntitlements] = useState<AppleEntitlementIngest>(defaultAppleEntitlements);

  const lastSignatureRef = useRef<string>(buildEntitlementSignature(null));
  const statusRef = useRef<SubscriptionStatus | null>(null);
  const lastAppleSignatureRef = useRef<string>('');

  useEffect(() => {
    statusRef.current = subscriptionStatus;
  }, [subscriptionStatus]);

  const ingestAppleEntitlements = useCallback((snapshot: AppleEntitlementIngest | null) => {
    const next = snapshot ?? defaultAppleEntitlements;
    const signature = `${next.resolving ? 1 : 0}|${next.isEntitled ? 1 : 0}|${next.activeProductId ?? 'none'}|${next.subscriptionTier ?? 'none'}`;
    if (lastAppleSignatureRef.current === signature) {
      return;
    }
    lastAppleSignatureRef.current = signature;
    setAppleEntitlements(next);
  }, []);

  const applyStatus = useCallback((next: SubscriptionStatus, reason: string) => {
    setSubscriptionStatus(next);

    const nextSig = buildEntitlementSignature(next);
    const prevSig = lastSignatureRef.current;

    if (nextSig !== prevSig) {
      lastSignatureRef.current = nextSig;
      setEntitlementVersion(prev => {
        const v = prev + 1;
        console.log('[SubscriptionContext] Entitlements changed', {
          reason,
          version: v,
          signature: nextSig,
          at: new Date().toISOString(),
        });
        return v;
      });
    } else {
      if (__DEV__) {
        console.log('[SubscriptionContext] Entitlements unchanged (skip bump)', {
          reason,
          signature: nextSig,
        });
      }
    }
  }, []);

  const fetchSubscriptionPlans = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_dkk', { ascending: true });

      if (error) {
        console.warn('[SubscriptionContext] Could not fetch subscription plans');
        return;
      }

      if (__DEV__) {
        console.log('[SubscriptionContext] Fetched subscription plans:', data);
      }
      setSubscriptionPlans(data || []);
    } catch {
      console.warn('[SubscriptionContext] Network error fetching subscription plans');
    }
  }, []);

  const applyOptimisticSubscription = useCallback(
    (planId: string) => {
      const plan = subscriptionPlans.find(p => p.id === planId);

      const fallback = statusRef.current ?? buildEmptyStatus();
      const optimisticStatus: SubscriptionStatus = {
        ...fallback,
        hasSubscription: true,
        status: fallback.status ?? 'trial',
        planName: plan?.name ?? fallback.planName ?? 'Aktivt abonnement',
        maxPlayers: plan?.max_players ?? fallback.maxPlayers,
        subscriptionTier: fallback.subscriptionTier,
      };

      console.log('[SubscriptionContext] Applying optimistic subscription state', optimisticStatus);
      applyStatus(optimisticStatus, `optimistic-${planId}`);
    },
    [applyStatus, subscriptionPlans]
  );

  const appleResolving = appleEntitlements.resolving;
  const appleIsEntitled = appleEntitlements.isEntitled;
  const appleActiveProductId = appleEntitlements.activeProductId ?? null;
  const appleEntitlementTier = appleEntitlements.subscriptionTier ?? null;

  const coerceWithEntitlements = useCallback(
    (status: SubscriptionStatus, source: string): SubscriptionStatus => {
      if (!appleIsEntitled) return status;

      const tierFromSku = subscriptionTierFromSku(appleActiveProductId);
      const tierOverride = appleEntitlementTier ?? tierFromSku;
      if (!tierOverride) return status;

      const planMeta =
        derivePlanMetaFromTier(appleEntitlementTier) ??
        derivePlanMetaFromSku(appleActiveProductId) ??
        derivePlanMetaFromTier(tierOverride);

      const merged: SubscriptionStatus = {
        ...status,
        hasSubscription: true,
        status: 'active',
        planName: planMeta?.name ?? status.planName ?? 'Aktivt abonnement',
        maxPlayers: planMeta?.maxPlayers ?? status.maxPlayers ?? 1,
        subscriptionTier: appleEntitlementTier ?? tierFromSku ?? status.subscriptionTier,
      };
      if (!status.hasSubscription) {
        console.warn('[SubscriptionContext] Backend reported no subscription while Apple is active', {
          source,
          backend: status,
          appleSku: appleActiveProductId,
          appleTier: appleEntitlementTier,
          appleResolving,
        });
      }
      return merged;
    },
    [appleIsEntitled, appleActiveProductId, appleEntitlementTier, appleResolving]
  );

  const fetchSubscriptionStatus = useCallback(async () => {
    try {
      console.log('[SubscriptionContext] Fetching subscription status');
      setLoading(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        applyStatus(coerceWithEntitlements(buildEmptyStatus(), 'no-user'), 'no-user');
        return;
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.warn('[SubscriptionContext] No valid session');
        applyStatus(coerceWithEntitlements(buildEmptyStatus(), 'no-session'), 'no-session');
        return;
      }

      const supabaseUrl = 'https://lhpczofddvwcyrgotzha.supabase.co';
      const functionUrl = `${supabaseUrl}/functions/v1/get-subscription-status`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          apikey:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocGN6b2ZkZHZ3Y3lyZ290emhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgzMjQsImV4cCI6MjA3OTczNDMyNH0.5oWZ_G5ryy_ae77CG8YMeEDEyAJkSS7Jv4cFZy-G7qA',
        },
      });

      console.log('[SubscriptionContext] Response status:', response.status);

      if (!response.ok) {
        console.warn('[SubscriptionContext] Edge function returned non-OK status:', response.status);

        // Undgå at “nulstille” hvis vi allerede har en status (forhindrer flicker/remounts ved net-issues)
        if (!statusRef.current) {
          applyStatus(coerceWithEntitlements(buildEmptyStatus(), 'edge-nok-initial'), 'edge-nok-initial');
        }
        return;
      }

      const data = await response.json();

      const statusData: SubscriptionStatus = {
        hasSubscription: Boolean(data?.hasSubscription),
        status: data?.status ?? null,
        planName: data?.planName ?? null,
        maxPlayers: Number(data?.maxPlayers) || 0,
        currentPlayers: Number(data?.currentPlayers) || 0,
        trialEnd: data?.trialEnd ?? null,
        currentPeriodEnd: data?.currentPeriodEnd ?? null,
        subscriptionTier: (data?.subscriptionTier as SubscriptionTier | null) ?? null,
      };

      applyStatus(coerceWithEntitlements(statusData, 'fetch-success'), 'fetch-success');
    } catch {
      console.warn('[SubscriptionContext] Network request failed');

      // Kun set empty hvis vi ikke har noget i forvejen
      if (!statusRef.current) {
        applyStatus(coerceWithEntitlements(buildEmptyStatus(), 'network-error-initial'), 'network-error-initial');
      }
    } finally {
      setLoading(false);
      if (__DEV__) {
        console.log('[SubscriptionContext] Loading set to false');
      }
    }
  }, [applyStatus, coerceWithEntitlements]);

  const refreshSubscription = useCallback(async () => {
    console.log('[SubscriptionContext] Manual refresh requested');
    await fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  const createSubscription = useCallback(
    async (planId: string) => {
      try {
        console.log('[SubscriptionContext] Creating subscription', { planId });

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          console.warn('[SubscriptionContext] No valid session for subscription creation');
          return {
            success: false,
            error: 'Du skal være logget ind for at oprette et abonnement. Prøv at logge ud og ind igen.',
          };
        }

        const supabaseUrl = 'https://lhpczofddvwcyrgotzha.supabase.co';
        const functionUrl = `${supabaseUrl}/functions/v1/create-subscription`;

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            apikey:
              'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocGN6b2ZkZHZ3Y3lyZ290emhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgzMjQsImV4cCI6MjA3OTczNDMyNH0.5oWZ_G5ryy_ae77CG8YMeEDEyAJkSS7Jv4cFZy-G7qA',
          },
          body: JSON.stringify({ planId }),
        });

        const responseData = await response.json().catch(() => ({}));
        console.log('[SubscriptionContext] Response status:', response.status, responseData);

        if (!response.ok || !responseData?.success) {
          const errorMessage = responseData?.error || '';

          if (errorMessage.includes('allerede et abonnement') || errorMessage.includes('already has')) {
            await new Promise(resolve => setTimeout(resolve, 800));
            await fetchSubscriptionStatus();
            forceUserRoleRefresh('subscription-exists');
            return {
              success: false,
              error: errorMessage || 'Du har allerede et abonnement.',
              alreadyHasSubscription: true,
            };
          }

          return {
            success: false,
            error: errorMessage || `HTTP ${response.status}: Kunne ikke oprette abonnement`,
          };
        }

        // Optimistisk: opdater UI straks (bump kun hvis signature ændrer sig)
        applyOptimisticSubscription(planId);
        forceUserRoleRefresh('subscription-success');

        // Refresh faktiske data efter kort delay
        await new Promise(resolve => setTimeout(resolve, 1200));
        await fetchSubscriptionStatus();

        return { success: true };
      } catch (error: any) {
        console.warn('[SubscriptionContext] Network error during subscription creation');

        if (
          error?.message?.includes('network') ||
          error?.message?.includes('fetch') ||
          error?.message?.includes('Failed to fetch')
        ) {
          return { success: false, error: 'Netværksfejl. Tjek din internetforbindelse og prøv igen.' };
        }

        return { success: false, error: 'Der opstod en uventet fejl. Prøv igen om et øjeblik.' };
      }
    },
    [applyOptimisticSubscription, fetchSubscriptionStatus]
  );

  const changeSubscriptionPlan = useCallback(
    async (
      planId: string
    ): Promise<{
      success: boolean;
      error?: string;
      unsupported?: boolean;
      alreadyOnPlan?: boolean;
    }> => {
      const endpointBase = 'https://lhpczofddvwcyrgotzha.supabase.co/functions/v1';
      const endpointCandidates = ['change-subscription', 'update-subscription'];

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          return {
            success: false,
            error:
              'Du skal være logget ind for at skifte abonnement. Log ud og ind igen, og prøv derefter at skifte plan.',
          };
        }

        let lastError = 'Plan-skift fejlede';
        let sawUnsupported = false;

        for (const path of endpointCandidates) {
          const functionUrl = `${endpointBase}/${path}`;
          let response: Response | null = null;
          let responseData: any = null;

          try {
            response = await fetch(functionUrl, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                apikey:
                  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocGN6b2ZkZHZ3Y3lyZ290emhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgzMjQsImV4cCI6MjA3OTczNDMyNH0.5oWZ_G5ryy_ae77CG8YMeEDEyAJkSS7Jv4cFZy-G7qA',
              },
              body: JSON.stringify({ planId }),
            });

            responseData = await response.json().catch(() => ({}));

            if (response.status === 404) {
              sawUnsupported = true;
              continue;
            }

            if (!response.ok || !responseData?.success) {
              const errorMessage = responseData?.error || `HTTP ${response.status}: Kunne ikke skifte plan`;
              lastError = errorMessage;

              if (responseData?.alreadyOnPlan) {
                return { success: false, error: errorMessage, alreadyOnPlan: true };
              }

              continue;
            }

            applyOptimisticSubscription(planId);
            await new Promise(resolve => setTimeout(resolve, 900));
            await fetchSubscriptionStatus();
            forceUserRoleRefresh('subscription-change-success');
            return { success: true };
          } catch (error: any) {
            lastError =
              error?.message?.includes('network') || error?.message?.includes('fetch')
                ? 'Netværksfejl. Tjek forbindelsen og prøv igen.'
                : 'Plan-skift fejlede. Prøv igen om lidt.';
          }
        }

        if (sawUnsupported) {
          return {
            success: false,
            unsupported: true,
            error: 'Plan-skift er ikke aktiveret endnu. Brug "Administrer abonnement" for at ændre din plan.',
          };
        }

        return { success: false, error: lastError };
      } catch {
        return {
          success: false,
          error: 'Der opstod en uventet fejl under plan-skift. Prøv igen.',
        };
      }
    },
    [applyOptimisticSubscription, fetchSubscriptionStatus]
  );

  useEffect(() => {
    console.log('[SubscriptionContext] Context initialized');
    fetchSubscriptionPlans();
    fetchSubscriptionStatus();
  }, [fetchSubscriptionPlans, fetchSubscriptionStatus]);

  useEffect(() => {
    if (__DEV__) {
      console.log('[SubscriptionContext] Subscription status changed', subscriptionStatus);
    }
  }, [subscriptionStatus]);

  useEffect(() => {
    const listener = (reason?: string) => {
      setEntitlementVersion(prev => {
        const next = prev + 1;
        if (__DEV__) {
          console.log('[SubscriptionContext] External entitlement bump', { reason, version: next });
        }
        return next;
      });
    };
    const unsubscribe = subscribeToEntitlementVersion(listener);
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <SubscriptionContext.Provider
      value={{
        subscriptionStatus,
        subscriptionPlans,
        loading,
        refreshSubscription,
        createSubscription,
        changeSubscriptionPlan,
        entitlementVersion,
        ingestAppleEntitlements,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
