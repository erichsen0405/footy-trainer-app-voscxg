import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { forceUserRoleRefresh } from '@/hooks/useUserRole';

interface SubscriptionPlan {
  id: string;
  name: string;
  price_dkk: number;
  max_players: number;
  currency_code?: string | null;
  price_amount?: number | null;
  localized_price?: string | null;
}

interface SubscriptionStatus {
  hasSubscription: boolean;
  status: string | null;
  planName: string | null;
  maxPlayers: number;
  currentPlayers: number;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
}

const buildEmptyStatus = (): SubscriptionStatus => ({
  hasSubscription: false,
  status: null,
  planName: null,
  maxPlayers: 0,
  currentPlayers: 0,
  trialEnd: null,
  currentPeriodEnd: null,
});

interface SubscriptionContextType {
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionPlans: SubscriptionPlan[];
  loading: boolean;
  refreshSubscription: () => Promise<void>;
  createSubscription: (
    planId: string
  ) => Promise<{ success: boolean; error?: string; alreadyHasSubscription?: boolean }>;
  entitlementVersion: number;
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
    String(s.maxPlayers ?? 0),
  ].join('|');
};

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [entitlementVersion, setEntitlementVersion] = useState(0);

  const lastSignatureRef = useRef<string>(buildEntitlementSignature(null));
  const statusRef = useRef<SubscriptionStatus | null>(null);

  useEffect(() => {
    statusRef.current = subscriptionStatus;
  }, [subscriptionStatus]);

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
      };

      console.log('[SubscriptionContext] Applying optimistic subscription state', optimisticStatus);
      applyStatus(optimisticStatus, `optimistic-${planId}`);
    },
    [applyStatus, subscriptionPlans]
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
        console.log('[SubscriptionContext] No user found');
        applyStatus(buildEmptyStatus(), 'no-user');
        return;
      }

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.warn('[SubscriptionContext] No valid session');
        applyStatus(buildEmptyStatus(), 'no-session');
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
          applyStatus(buildEmptyStatus(), 'edge-nok-initial');
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
      };

      applyStatus(statusData, 'fetch-success');
    } catch {
      console.warn('[SubscriptionContext] Network request failed');

      // Kun set empty hvis vi ikke har noget i forvejen
      if (!statusRef.current) {
        applyStatus(buildEmptyStatus(), 'network-error-initial');
      }
    } finally {
      setLoading(false);
      if (__DEV__) {
        console.log('[SubscriptionContext] Loading set to false');
      }
    }
  }, [applyStatus]);

  const refreshSubscription = useCallback(async () => {
    console.log('[SubscriptionContext] Manual refresh requested');
    await fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  const createSubscription = useCallback(
    async (
      planId: string
    ): Promise<{ success: boolean; error?: string; alreadyHasSubscription?: boolean }> => {
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

  return (
    <SubscriptionContext.Provider
      value={{
        subscriptionStatus,
        subscriptionPlans,
        loading,
        refreshSubscription,
        createSubscription,
        entitlementVersion,
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
