
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
      const { data, error } = await supabase.functions.invoke('create-subscription', {
        body: { planId },
      });

      if (error) {
        console.error('Error creating subscription:', error);
        return { success: false, error: error.message || 'Failed to create subscription' };
      }

      if (!data.success) {
        return { success: false, error: data.error || 'Failed to create subscription' };
      }

      // Refresh subscription status
      await fetchSubscriptionStatus();

      return { success: true };
    } catch (error: any) {
      console.error('Error in createSubscription:', error);
      return { success: false, error: error.message || 'An error occurred' };
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
