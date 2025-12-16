
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

  const fetchSubscriptionPlans = async () => {
    try {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_dkk', { ascending: true });

      if (error) {
        console.error('[SubscriptionContext] Error fetching subscription plans:', error);
        return;
      }

      console.log('[SubscriptionContext] Fetched subscription plans:', data);
      setSubscriptionPlans(data || []);
    } catch (error) {
      console.error('[SubscriptionContext] Error in fetchSubscriptionPlans:', error);
    }
  };

  const fetchSubscriptionStatus = async () => {
    try {
      console.log('[SubscriptionContext] Fetching subscription status...');
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('[SubscriptionContext] No user found');
        setSubscriptionStatus({
          hasSubscription: false,
          status: null,
          planName: null,
          maxPlayers: 0,
          currentPlayers: 0,
          trialEnd: null,
          currentPeriodEnd: null,
        });
        return;
      }

      console.log('[SubscriptionContext] Calling get-subscription-status for user:', user.id);
      
      const { data, error } = await supabase.functions.invoke('get-subscription-status');

      console.log('[SubscriptionContext] Edge Function response:', {
        data,
        error,
        dataType: typeof data,
        dataKeys: data ? Object.keys(data) : null,
      });

      if (error) {
        console.error('[SubscriptionContext] Error from Edge Function:', error);
        // Even if there's an error, try to use the data if it exists
        if (data) {
          console.log('[SubscriptionContext] Using data despite error');
        } else {
          setSubscriptionStatus({
            hasSubscription: false,
            status: null,
            planName: null,
            maxPlayers: 0,
            currentPlayers: 0,
            trialEnd: null,
            currentPeriodEnd: null,
          });
          return;
        }
      }

      // Ensure we have a valid subscription status object
      const statusData: SubscriptionStatus = {
        hasSubscription: data?.hasSubscription ?? false,
        status: data?.status ?? null,
        planName: data?.planName ?? null,
        maxPlayers: data?.maxPlayers ?? 0,
        currentPlayers: data?.currentPlayers ?? 0,
        trialEnd: data?.trialEnd ?? null,
        currentPeriodEnd: data?.currentPeriodEnd ?? null,
      };

      console.log('[SubscriptionContext] Processed subscription status:', statusData);
      console.log('[SubscriptionContext] Setting subscription status to state');
      
      setSubscriptionStatus(statusData);
      
      console.log('[SubscriptionContext] Subscription status set successfully');
    } catch (error) {
      console.error('[SubscriptionContext] Error in fetchSubscriptionStatus:', error);
      setSubscriptionStatus({
        hasSubscription: false,
        status: null,
        planName: null,
        maxPlayers: 0,
        currentPlayers: 0,
        trialEnd: null,
        currentPeriodEnd: null,
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshSubscription = async () => {
    console.log('[SubscriptionContext] Manual refresh requested');
    await fetchSubscriptionStatus();
  };

  const createSubscription = async (planId: string): Promise<{ success: boolean; error?: string; alreadyHasSubscription?: boolean }> => {
    try {
      console.log('[SubscriptionContext] Creating subscription with planId:', planId);
      
      // Verify we have a valid session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error('[SubscriptionContext] No valid session:', sessionError);
        return { 
          success: false, 
          error: 'Du skal være logget ind for at oprette et abonnement. Prøv at logge ud og ind igen.' 
        };
      }

      console.log('[SubscriptionContext] Session verified, user ID:', session.user.id);
      console.log('[SubscriptionContext] Access token present:', !!session.access_token);

      // Get the Supabase URL
      const supabaseUrl = 'https://lhpczofddvwcyrgotzha.supabase.co';
      const functionUrl = `${supabaseUrl}/functions/v1/create-subscription`;

      // Prepare the request body
      const requestBody = { planId };
      console.log('[SubscriptionContext] Request body:', JSON.stringify(requestBody));
      console.log('[SubscriptionContext] Calling function URL:', functionUrl);

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
      console.log('[SubscriptionContext] Response ok:', response.ok);

      // Parse the response
      const responseData = await response.json();
      console.log('[SubscriptionContext] Response data:', responseData);

      if (!response.ok) {
        console.error('[SubscriptionContext] Error response:', responseData);
        
        // Check if the error is "already has subscription"
        const errorMessage = responseData.error || '';
        if (errorMessage.includes('allerede et abonnement') || errorMessage.includes('already has')) {
          console.log('[SubscriptionContext] User already has a subscription, refreshing status...');
          // Refresh subscription status to show current subscription
          // Add a small delay to ensure the database is consistent
          await new Promise(resolve => setTimeout(resolve, 1000));
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
        console.error('[SubscriptionContext] Subscription creation failed:', responseData);
        
        // Check if the error is "already has subscription"
        const errorMessage = responseData?.error || '';
        if (errorMessage.includes('allerede et abonnement') || errorMessage.includes('already has')) {
          console.log('[SubscriptionContext] User already has a subscription, refreshing status...');
          // Refresh subscription status to show current subscription
          // Add a small delay to ensure the database is consistent
          await new Promise(resolve => setTimeout(resolve, 1000));
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

      console.log('[SubscriptionContext] Subscription created successfully, refreshing status...');

      // Refresh subscription status with a small delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      await fetchSubscriptionStatus();

      return { success: true };
    } catch (error: any) {
      console.error('[SubscriptionContext] Unexpected error in createSubscription:', error);
      console.error('[SubscriptionContext] Error stack:', error.stack);
      
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
  };

  useEffect(() => {
    fetchSubscriptionPlans();
    fetchSubscriptionStatus();
  }, []);

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
