
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
  createSubscription: (planId: string) => Promise<{ success: boolean; error?: string }>;
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
        console.error('Error fetching subscription plans:', error);
        return;
      }

      setSubscriptionPlans(data || []);
    } catch (error) {
      console.error('Error in fetchSubscriptionPlans:', error);
    }
  };

  const fetchSubscriptionStatus = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setSubscriptionStatus(null);
        return;
      }

      const { data, error } = await supabase.functions.invoke('get-subscription-status');

      if (error) {
        console.error('Error fetching subscription status:', error);
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

      setSubscriptionStatus(data);
    } catch (error) {
      console.error('Error in fetchSubscriptionStatus:', error);
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
    await fetchSubscriptionStatus();
  };

  const createSubscription = async (planId: string): Promise<{ success: boolean; error?: string }> => {
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

      console.log('[SubscriptionContext] Session verified, calling Edge Function...');

      // Call the Edge Function with explicit headers
      const { data, error } = await supabase.functions.invoke('create-subscription', {
        body: { planId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      console.log('[SubscriptionContext] Edge Function response:', { data, error });

      if (error) {
        console.error('[SubscriptionContext] Error creating subscription:', error);
        
        // Provide more specific error messages
        if (error.message?.includes('Failed to send a request')) {
          return { 
            success: false, 
            error: 'Kunne ikke oprette forbindelse til serveren. Tjek din internetforbindelse og prøv igen.' 
          };
        }
        
        if (error.message?.includes('Unauthorized')) {
          return { 
            success: false, 
            error: 'Din session er udløbet. Prøv at logge ud og ind igen.' 
          };
        }
        
        return { 
          success: false, 
          error: error.message || 'Kunne ikke oprette abonnement. Prøv igen.' 
        };
      }

      if (!data || !data.success) {
        console.error('[SubscriptionContext] Subscription creation failed:', data);
        return { 
          success: false, 
          error: data?.error || 'Kunne ikke oprette abonnement. Prøv igen.' 
        };
      }

      console.log('[SubscriptionContext] Subscription created successfully, refreshing status...');

      // Refresh subscription status
      await fetchSubscriptionStatus();

      return { success: true };
    } catch (error: any) {
      console.error('[SubscriptionContext] Unexpected error in createSubscription:', error);
      
      // Provide user-friendly error messages
      if (error.message?.includes('network') || error.message?.includes('fetch')) {
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
