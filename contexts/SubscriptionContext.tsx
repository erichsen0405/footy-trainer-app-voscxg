
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/app/integrations/supabase/client';

interface SubscriptionPlan {
  id: string;
  name: string;
  price_dkk: number;
  max_players: number;
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

interface SubscriptionContextType {
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionPlans: SubscriptionPlan[];
  loading: boolean;
  refreshSubscription: () => Promise<void>;
  createSubscription: (planId: string) => Promise<{ success: boolean; error?: string; alreadyHasSubscription?: boolean }>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

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

      console.log('[SubscriptionContext] Fetched subscription plans:', data);
      setSubscriptionPlans(data || []);
    } catch (error) {
      console.warn('[SubscriptionContext] Network error fetching subscription plans');
    }
  }, []);

  const fetchSubscriptionStatus = useCallback(async () => {
    try {
      console.log('[SubscriptionContext] Fetching subscription status');
      setLoading(true);
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        console.log('[SubscriptionContext] No user found');
        const emptyStatus: SubscriptionStatus = {
          hasSubscription: false,
          status: null,
          planName: null,
          maxPlayers: 0,
          currentPlayers: 0,
          trialEnd: null,
          currentPeriodEnd: null,
        };
        setSubscriptionStatus(emptyStatus);
        console.log('[SubscriptionContext] Set empty subscription status');
        return;
      }

      console.log('[SubscriptionContext] User found:', user.email, user.id);
      
      // Get the current session for the access token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.warn('[SubscriptionContext] No valid session');
        const emptyStatus: SubscriptionStatus = {
          hasSubscription: false,
          status: null,
          planName: null,
          maxPlayers: 0,
          currentPlayers: 0,
          trialEnd: null,
          currentPeriodEnd: null,
        };
        setSubscriptionStatus(emptyStatus);
        return;
      }

      console.log('[SubscriptionContext] Session verified, calling Edge Function');
      
      // Use direct fetch to ensure proper headers and body handling
      const supabaseUrl = 'https://lhpczofddvwcyrgotzha.supabase.co';
      const functionUrl = `${supabaseUrl}/functions/v1/get-subscription-status`;

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocGN6b2ZkZHZ3Y3lyZ290emhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgzMjQsImV4cCI6MjA3OTczNDMyNH0.5oWZ_G5ryy_ae77CG8YMeEDEyAJkSS7Jv4cFZy-G7qA',
        },
      });

      console.log('[SubscriptionContext] Response status:', response.status);

      if (!response.ok) {
        console.warn('[SubscriptionContext] Edge function returned non-OK status:', response.status);
        const emptyStatus: SubscriptionStatus = {
          hasSubscription: false,
          status: null,
          planName: null,
          maxPlayers: 0,
          currentPlayers: 0,
          trialEnd: null,
          currentPeriodEnd: null,
        };
        setSubscriptionStatus(emptyStatus);
        return;
      }

      const data = await response.json();

      console.log('[SubscriptionContext] Edge function response received');
      console.log('[SubscriptionContext] Has subscription:', data?.hasSubscription);
      console.log('[SubscriptionContext] Plan name:', data?.planName);
      console.log('[SubscriptionContext] Status:', data?.status);

      // Ensure we have a valid subscription status object
      const statusData: SubscriptionStatus = {
        hasSubscription: Boolean(data?.hasSubscription),
        status: data?.status ?? null,
        planName: data?.planName ?? null,
        maxPlayers: Number(data?.maxPlayers) || 0,
        currentPlayers: Number(data?.currentPlayers) || 0,
        trialEnd: data?.trialEnd ?? null,
        currentPeriodEnd: data?.currentPeriodEnd ?? null,
      };

      console.log('[SubscriptionContext] Processed status:', JSON.stringify(statusData, null, 2));
      console.log('[SubscriptionContext] Setting subscription status to state');
      setSubscriptionStatus(statusData);
      
      console.log('[SubscriptionContext] Subscription status set successfully');
    } catch (error) {
      // Silent error handling - network failures are expected conditions
      console.warn('[SubscriptionContext] Network request failed - using fallback');
      const emptyStatus: SubscriptionStatus = {
        hasSubscription: false,
        status: null,
        planName: null,
        maxPlayers: 0,
        currentPlayers: 0,
        trialEnd: null,
        currentPeriodEnd: null,
      };
      setSubscriptionStatus(emptyStatus);
    } finally {
      setLoading(false);
      console.log('[SubscriptionContext] Loading set to false');
    }
  }, []);

  const refreshSubscription = useCallback(async () => {
    console.log('[SubscriptionContext] Manual refresh requested');
    await fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  const createSubscription = useCallback(async (planId: string): Promise<{ success: boolean; error?: string; alreadyHasSubscription?: boolean }> => {
    try {
      console.log('[SubscriptionContext] Creating subscription');
      console.log('[SubscriptionContext] Plan ID:', planId);
      
      // Verify we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.warn('[SubscriptionContext] No valid session for subscription creation');
        return { 
          success: false, 
          error: 'Du skal være logget ind for at oprette et abonnement. Prøv at logge ud og ind igen.' 
        };
      }

      console.log('[SubscriptionContext] Session verified, user ID:', session.user.id);

      // Get the Supabase URL
      const supabaseUrl = 'https://lhpczofddvwcyrgotzha.supabase.co';
      const functionUrl = `${supabaseUrl}/functions/v1/create-subscription`;

      // Prepare the request body
      const requestBody = { planId };
      console.log('[SubscriptionContext] Request body:', JSON.stringify(requestBody));

      // Make a direct fetch call with explicit body
      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocGN6b2ZkZHZ3Y3lyZ290emhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgzMjQsImV4cCI6MjA3OTczNDMyNH0.5oWZ_G5ryy_ae77CG8YMeEDEyAJkSS7Jv4cFZy-G7qA',
        },
        body: JSON.stringify(requestBody),
      });

      console.log('[SubscriptionContext] Response status:', response.status);

      // Parse the response
      const responseData = await response.json();
      console.log('[SubscriptionContext] Response data:', responseData);

      if (!response.ok) {
        console.warn('[SubscriptionContext] Subscription creation failed with status:', response.status);
        
        // Check if the error is "already has subscription"
        const errorMessage = responseData.error || '';
        if (errorMessage.includes('allerede et abonnement') || errorMessage.includes('already has')) {
          console.log('[SubscriptionContext] User already has a subscription, refreshing status');
          // Refresh subscription status to show current subscription
          await new Promise(resolve => setTimeout(resolve, 1500));
          await fetchSubscriptionStatus();
          return { 
            success: false, 
            error: errorMessage,
            alreadyHasSubscription: true 
          };
        }
        
        return { 
          success: false, 
          error: errorMessage || `HTTP ${response.status}: Kunne ikke oprette abonnement` 
        };
      }

      if (!responseData || !responseData.success) {
        console.warn('[SubscriptionContext] Subscription creation returned unsuccessful response');
        
        // Check if the error is "already has subscription"
        const errorMessage = responseData?.error || '';
        if (errorMessage.includes('allerede et abonnement') || errorMessage.includes('already has')) {
          console.log('[SubscriptionContext] User already has a subscription, refreshing status');
          await new Promise(resolve => setTimeout(resolve, 1500));
          await fetchSubscriptionStatus();
          return { 
            success: false, 
            error: errorMessage,
            alreadyHasSubscription: true 
          };
        }
        
        return { 
          success: false, 
          error: errorMessage || 'Kunne ikke oprette abonnement. Prøv igen.' 
        };
      }

      console.log('[SubscriptionContext] Subscription created successfully, refreshing status');

      // Refresh subscription status with a delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      await fetchSubscriptionStatus();

      return { success: true };
    } catch (error: any) {
      // Silent error handling - network failures are expected conditions
      console.warn('[SubscriptionContext] Network error during subscription creation');
      
      // Provide user-friendly error messages
      if (error.message?.includes('network') || error.message?.includes('fetch') || error.message?.includes('Failed to fetch')) {
        return { 
          success: false, 
          error: 'Netværksfejl. Tjek din internetforbindelse og prøv igen.' 
        };
      }
      
      return { 
        success: false, 
        error: 'Der opstod en uventet fejl. Prøv igen om et øjeblik.' 
      };
    }
  }, [fetchSubscriptionStatus]);

  useEffect(() => {
    console.log('[SubscriptionContext] Context initialized');
    fetchSubscriptionPlans();
    fetchSubscriptionStatus();
  }, [fetchSubscriptionPlans, fetchSubscriptionStatus]);

  // Log whenever subscription status changes
  useEffect(() => {
    console.log('[SubscriptionContext] Subscription status changed');
    console.log('[SubscriptionContext] New status:', JSON.stringify(subscriptionStatus, null, 2));
  }, [subscriptionStatus]);

  return (
    <SubscriptionContext.Provider
      value={{
        subscriptionStatus,
        subscriptionPlans,
        loading,
        refreshSubscription,
        createSubscription,
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
