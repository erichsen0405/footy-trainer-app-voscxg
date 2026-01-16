import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '@/app/integrations/supabase/client';

// Check if we're running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

// Dynamically import react-native-iap only on native platforms AND not in Expo Go
let RNIap: any = null;
let rniapImportPromise: Promise<void> | null = null;
let iapReadyFlag = false;
let iapInitPromise: Promise<void> | null = null;

export async function ensureIapReady(): Promise<boolean> {
  if (iapReadyFlag) return true;
  if (rniapImportPromise) {
    try {
      await rniapImportPromise;
    } catch {
      return false;
    }
  }
  if (!RNIap) {
    console.log('[AppleIAP] react-native-iap not yet available');
    return false;
  }
  if (!iapInitPromise) {
    iapInitPromise = (async () => {
      try {
        console.log('[AppleIAP] ⏳ initConnection starting…');
        await RNIap.initConnection();
        console.log('[AppleIAP] ✅ initConnection completed');
        iapReadyFlag = true;
      } catch (error) {
        console.error('[AppleIAP] ❌ initConnection failed:', error);
        iapInitPromise = null;
        throw error;
      }
    })();
  }
  try {
    await iapInitPromise;
    return iapReadyFlag;
  } catch {
    return false;
  }
}

if ((Platform.OS === 'ios' || Platform.OS === 'android') && !isExpoGo) {
  rniapImportPromise = import('react-native-iap')
    .then((module) => {
      RNIap = module;
      console.log('[AppleIAP] ✅ react-native-iap loaded successfully');
    })
    .catch((error) => {
      console.warn('[AppleIAP] ⚠️ react-native-iap not available', error);
      throw error;
    });
}

// Product IDs from App Store Connect - MUST MATCH EXACTLY
export const PRODUCT_IDS = {
  PLAYER_BASIC: 'fc_spiller_monthly',
  PLAYER_PREMIUM: 'fc_player_premium_monthly',
  TRAINER_BASIC: 'fc_trainer_basic_monthly',
  TRAINER_STANDARD: 'fc_trainer_standard_monthly',
  TRAINER_PREMIUM: 'fc_trainer_premium_monthly',
} as const;

export const ORDERED_PRODUCT_IDS = [
  PRODUCT_IDS.PLAYER_BASIC,
  PRODUCT_IDS.PLAYER_PREMIUM,
  PRODUCT_IDS.TRAINER_BASIC,
  PRODUCT_IDS.TRAINER_STANDARD,
  PRODUCT_IDS.TRAINER_PREMIUM,
] as const;

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
  iapReady: boolean;
  ensureIapReady: () => Promise<boolean>;
}

const AppleIAPContext = createContext<AppleIAPContextType | undefined>(undefined);

export function AppleIAPProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [iapReady, setIapReady] = useState<boolean>(iapReadyFlag);

  const syncIapReadyState = useCallback(async () => {
    const ready = await ensureIapReady();
    setIapReady(ready);
    return ready;
  }, []);

  const fetchProducts = useCallback(async () => {
    const ready = await ensureIapReady();
    if (!ready) return;

    try {
      console.log('[AppleIAP] Fetching products from App Store…');
      const productIds = ORDERED_PRODUCT_IDS;
      const availableProducts = await RNIap.getSubscriptions({ skus: productIds });

      const productMap = new Map(
        (availableProducts ?? []).map((product: any) => [product.productId, product])
      );

      const orderedProducts = productIds
        .map((id) => productMap.get(id))
        .filter(Boolean) as any[];

      // Map products to our format with max players info
      const mappedProducts: SubscriptionProduct[] = orderedProducts.map((product: any) => {
        let maxPlayers = 1;
        if (product.productId === PRODUCT_IDS.PLAYER_BASIC || product.productId === PRODUCT_IDS.PLAYER_PREMIUM) {
          maxPlayers = 1;
        } else if (product.productId === PRODUCT_IDS.TRAINER_BASIC) maxPlayers = 5;
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
      console.log('[AppleIAP] Products fetched:', mappedProducts.length);
    } catch (error) {
      console.error('[AppleIAP] Error fetching products:', error);
    }
  }, []);

  const refreshSubscriptionStatus = useCallback(async () => {
    const ready = await ensureIapReady();
    if (!ready) {
      setSubscriptionStatus({
        isActive: false,
        productId: null,
        expiryDate: null,
        isInTrialPeriod: false,
      });
      return;
    }

    try {
      console.log('[AppleIAP] Refreshing subscription status…');
      
      // Get available purchases (receipts)
      const availablePurchases = await RNIap.getAvailablePurchases();
      console.log('[AppleIAP] Available purchases:', availablePurchases);

      if (availablePurchases.length > 0) {
        // Find the most recent subscription
        const sortedPurchases = availablePurchases.sort((a: any, b: any) => {
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
  }, []);

  const initializeIAP = useCallback(async () => {
    if (Platform.OS !== 'ios' || !RNIap || isExpoGo) {
      setLoading(false);
      return;
    }

    const ready = await syncIapReadyState();
    if (!ready) {
      setLoading(false);
      return;
    }

    await fetchProducts();
    await refreshSubscriptionStatus();
    setLoading(false);
  }, [fetchProducts, refreshSubscriptionStatus, syncIapReadyState]);

  // Initialize IAP connection
  useEffect(() => {
    if (Platform.OS === 'ios' && !isExpoGo) {
      initializeIAP();
    } else {
      setLoading(false);
    }

    return () => {
      if (Platform.OS === 'ios' && RNIap && !isExpoGo) {
        RNIap.endConnection?.();
        iapReadyFlag = false;
        iapInitPromise = null;
        setIapReady(false);
      }
    };
  }, [initializeIAP]);

  // Set up purchase update listener
  useEffect(() => {
    if (Platform.OS !== 'ios' || !RNIap || isExpoGo) return;

    const purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(
      async (purchase: any) => {
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
      (error: any) => {
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
  }, [refreshSubscriptionStatus]);

  const updateSubscriptionInSupabase = async (productId: string, receipt: string) => {
    try {
      console.log('[AppleIAP] Updating subscription in Supabase...');
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[AppleIAP] No user found');
        return;
      }

      // Determine subscription tier based on product ID
      let subscriptionTier = 'player_basic';
      if (productId === PRODUCT_IDS.PLAYER_BASIC) subscriptionTier = 'player_basic';
      else if (productId === PRODUCT_IDS.PLAYER_PREMIUM) subscriptionTier = 'player_premium';
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
      Alert.alert('Ikke tilgængelig', 'Apple In-App Purchases er kun tilgængelige på iOS.', [{ text: 'OK' }]);
      return;
    }

    const ready = await ensureIapReady();
    if (!ready || !RNIap || isExpoGo) {
      Alert.alert(
        'Kræver Development Build',
        'In-App Purchases virker ikke i Expo Go.\n\nByg appen med EAS:\n1. eas build --profile development --platform ios\n2. Installer build på din enhed\n3. expo start --dev-client',
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
      Alert.alert('Ikke tilgængelig', 'Apple In-App Purchases er kun tilgængelige på iOS.', [{ text: 'OK' }]);
      return;
    }

    const ready = await ensureIapReady();
    if (!ready || !RNIap || isExpoGo) {
      Alert.alert(
        'Kræver Development Build',
        'In-App Purchases virker ikke i Expo Go.\n\nByg appen med EAS:\n1. eas build --profile development --platform ios\n2. Installer build på din enhed\n3. expo start --dev-client',
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
        iapReady,
        ensureIapReady: syncIapReadyState,
      }}
    >
      {children}
    </AppleIAPContext.Provider>
  );
}

export function useAppleIAP() {
  const context = useContext(AppleIAPContext);
  if (!context) {
    throw new Error('useAppleIAP must be used within an AppleIAPProvider');
  }
  return context;
}
