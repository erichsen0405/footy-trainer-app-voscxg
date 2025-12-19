
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import * as RNIap from 'react-native-iap';
import { supabase } from '@/app/integrations/supabase/client';

// Product IDs from App Store Connect - MUST MATCH EXACTLY
const PRODUCT_IDS = {
  PLAYER: 'fc_spiller_monthly',
  TRAINER_BASIC: 'fc_trainer_basic_monthly',
  TRAINER_STANDARD: 'fc_trainer_standard_monthly',
  TRAINER_PREMIUM: 'fc_trainer_premium_monthly',
};

interface SubscriptionProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  localizedPrice: string;
  maxPlayers: number;
}

interface SubscriptionStatus {
  isActive: boolean;
  productId: string | null;
  expiryDate: number | null;
  isInTrialPeriod: boolean;
}

interface AppleIAPContextType {
  products: SubscriptionProduct[];
  subscriptionStatus: SubscriptionStatus | null;
  loading: boolean;
  purchasing: boolean;
  purchaseSubscription: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
  refreshSubscriptionStatus: () => Promise<void>;
}

const AppleIAPContext = createContext<AppleIAPContextType | undefined>(undefined);

export function AppleIAPProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);

  // Initialize IAP connection
  useEffect(() => {
    if (Platform.OS === 'ios') {
      initializeIAP();
    } else {
      setLoading(false);
      console.log('[AppleIAP] Not on iOS, skipping IAP initialization');
    }

    return () => {
      if (Platform.OS === 'ios') {
        RNIap.endConnection();
      }
    };
  }, []);

  // Set up purchase update listener
  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    const purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(
      async (purchase) => {
        console.log('[AppleIAP] Purchase updated:', purchase);
        const receipt = purchase.transactionReceipt;
        
        if (receipt) {
          try {
            // Finish the transaction
            await RNIap.finishTransaction({ purchase, isConsumable: false });
            
            // Update subscription status in Supabase
            await updateSubscriptionInSupabase(purchase.productId, receipt);
            
            // Refresh subscription status
            await refreshSubscriptionStatus();
            
            Alert.alert(
              'Køb gennemført! 🎉',
              'Dit abonnement er nu aktivt. Du kan nu bruge alle funktioner.',
              [{ text: 'OK' }]
            );
          } catch (error) {
            console.error('[AppleIAP] Error finishing transaction:', error);
          }
        }
      }
    );

    const purchaseErrorSubscription = RNIap.purchaseErrorListener(
      (error) => {
        console.error('[AppleIAP] Purchase error:', error);
        if (error.code !== 'E_USER_CANCELLED') {
          Alert.alert(
            'Fejl ved køb',
            'Der opstod en fejl ved køb af abonnement. Prøv venligst igen.',
            [{ text: 'OK' }]
          );
        }
      }
    );

    return () => {
      purchaseUpdateSubscription.remove();
      purchaseErrorSubscription.remove();
    };
  }, []);

  const initializeIAP = async () => {
    try {
      console.log('[AppleIAP] Initializing IAP connection...');
      await RNIap.initConnection();
      console.log('[AppleIAP] IAP connection initialized');

      // Fetch products from App Store
      await fetchProducts();

      // Check current subscription status
      await refreshSubscriptionStatus();

      setLoading(false);
    } catch (error) {
      console.error('[AppleIAP] Error initializing IAP:', error);
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      console.log('[AppleIAP] Fetching products from App Store...');
      const productIds = Object.values(PRODUCT_IDS);
      console.log('[AppleIAP] Product IDs to fetch:', productIds);
      
      const availableProducts = await RNIap.getSubscriptions({ skus: productIds });
      
      console.log('[AppleIAP] Available products:', availableProducts);

      // Map products to our format with max players info
      const mappedProducts: SubscriptionProduct[] = availableProducts.map((product) => {
        let maxPlayers = 1;
        if (product.productId === PRODUCT_IDS.PLAYER) maxPlayers = 1;
        else if (product.productId === PRODUCT_IDS.TRAINER_BASIC) maxPlayers = 5;
        else if (product.productId === PRODUCT_IDS.TRAINER_STANDARD) maxPlayers = 15;
        else if (product.productId === PRODUCT_IDS.TRAINER_PREMIUM) maxPlayers = 50;

        return {
          productId: product.productId,
          title: product.title,
          description: product.description,
          price: product.price,
          currency: product.currency,
          localizedPrice: product.localizedPrice,
          maxPlayers,
        };
      });

      setProducts(mappedProducts);
      console.log('[AppleIAP] Products fetched successfully:', mappedProducts.length);
    } catch (error) {
      console.error('[AppleIAP] Error fetching products:', error);
    }
  };

  const refreshSubscriptionStatus = async () => {
    try {
      console.log('[AppleIAP] Refreshing subscription status...');
      
      // Get available purchases (receipts)
      const availablePurchases = await RNIap.getAvailablePurchases();
      console.log('[AppleIAP] Available purchases:', availablePurchases);

      if (availablePurchases.length > 0) {
        // Find the most recent subscription
        const sortedPurchases = availablePurchases.sort((a, b) => {
          return (b.transactionDate || 0) - (a.transactionDate || 0);
        });

        const latestPurchase = sortedPurchases[0];
        
        // Check if subscription is still valid
        // Note: For auto-renewable subscriptions, Apple handles expiry automatically
        // We rely on getAvailablePurchases() which only returns active subscriptions
        const expiryDate = latestPurchase.transactionDate 
          ? latestPurchase.transactionDate + (30 * 24 * 60 * 60 * 1000) // 30 days estimate
          : null;
        
        const isActive = true; // If it's in availablePurchases, it's active

        const status: SubscriptionStatus = {
          isActive,
          productId: latestPurchase.productId,
          expiryDate,
          isInTrialPeriod: false, // Apple handles trial period automatically
        };

        setSubscriptionStatus(status);
        console.log('[AppleIAP] Subscription status:', status);

        // Update Supabase with current status
        if (isActive && latestPurchase.transactionReceipt) {
          await updateSubscriptionInSupabase(
            latestPurchase.productId,
            latestPurchase.transactionReceipt
          );
        }
      } else {
        setSubscriptionStatus({
          isActive: false,
          productId: null,
          expiryDate: null,
          isInTrialPeriod: false,
        });
        console.log('[AppleIAP] No active subscriptions found');
      }
    } catch (error) {
      console.error('[AppleIAP] Error refreshing subscription status:', error);
    }
  };

  const updateSubscriptionInSupabase = async (productId: string, receipt: string) => {
    try {
      console.log('[AppleIAP] Updating subscription in Supabase...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[AppleIAP] No user found');
        return;
      }

      // Determine subscription tier based on product ID
      let subscriptionTier = 'player';
      if (productId === PRODUCT_IDS.PLAYER) subscriptionTier = 'player';
      else if (productId === PRODUCT_IDS.TRAINER_BASIC) subscriptionTier = 'trainer_basic';
      else if (productId === PRODUCT_IDS.TRAINER_STANDARD) subscriptionTier = 'trainer_standard';
      else if (productId === PRODUCT_IDS.TRAINER_PREMIUM) subscriptionTier = 'trainer_premium';

      console.log('[AppleIAP] Subscription tier:', subscriptionTier);

      // Update or create profile with subscription info
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          subscription_tier: subscriptionTier,
          subscription_product_id: productId,
          subscription_receipt: receipt,
          subscription_updated_at: new Date().toISOString(),
        });

      if (error) {
        console.error('[AppleIAP] Error updating subscription in Supabase:', error);
      } else {
        console.log('[AppleIAP] Subscription updated in Supabase successfully');
      }
    } catch (error) {
      console.error('[AppleIAP] Error in updateSubscriptionInSupabase:', error);
    }
  };

  const purchaseSubscription = async (productId: string) => {
    if (Platform.OS !== 'ios') {
      Alert.alert(
        'Ikke tilgængelig',
        'Apple In-App Purchases er kun tilgængelige på iOS.',
        [{ text: 'OK' }]
      );
      return;
    }

    setPurchasing(true);
    try {
      console.log('[AppleIAP] Requesting subscription:', productId);
      await RNIap.requestSubscription({ sku: productId });
      // Purchase update will be handled by the listener
    } catch (error: any) {
      console.error('[AppleIAP] Error purchasing subscription:', error);
      if (error.code !== 'E_USER_CANCELLED') {
        Alert.alert(
          'Fejl ved køb',
          'Der opstod en fejl ved køb af abonnement. Prøv venligst igen.',
          [{ text: 'OK' }]
        );
      }
    } finally {
      setPurchasing(false);
    }
  };

  const restorePurchases = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert(
        'Ikke tilgængelig',
        'Apple In-App Purchases er kun tilgængelige på iOS.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      console.log('[AppleIAP] Restoring purchases...');
      const availablePurchases = await RNIap.getAvailablePurchases();
      console.log('[AppleIAP] Restored purchases:', availablePurchases);

      if (availablePurchases.length > 0) {
        // Update subscription status
        await refreshSubscriptionStatus();
        
        Alert.alert(
          'Køb gendannet! ✅',
          'Dine tidligere køb er blevet gendannet.',
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Ingen køb fundet',
          'Der blev ikke fundet nogen tidligere køb at gendanne.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[AppleIAP] Error restoring purchases:', error);
      Alert.alert(
        'Fejl ved gendannelse',
        'Der opstod en fejl ved gendannelse af køb. Prøv venligst igen.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <AppleIAPContext.Provider
      value={{
        products,
        subscriptionStatus,
        loading,
        purchasing,
        purchaseSubscription,
        restorePurchases,
        refreshSubscriptionStatus,
      }}
    >
      {children}
    </AppleIAPContext.Provider>
  );
}

export function useAppleIAP() {
  const context = useContext(AppleIAPContext);
  if (context === undefined) {
    throw new Error('useAppleIAP must be used within an AppleIAPProvider');
  }
  return context;
}
