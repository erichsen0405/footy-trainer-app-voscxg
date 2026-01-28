import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';

// Stub types for web
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

interface IapDiagnostics {
  requestedSkus: string[];
  returnedSkus: string[];
  missingSkus: string[];
  lastFetchAt: string | null;
  lastFetchError: string | null;
  appOwnership: string | null;
  configBundleId: string | null;
  runtimeBundleId: string | null;
  bundleIdMismatch: boolean;
  platform: string;
  hermesEnabled: boolean;
  lastFetchCount: number;
  returnedProductsDetailed: Array<{ productId: string; title: string; localizedPrice: string; rawKeys?: string[] }>;
  lastFetchMethod: string | null;
}

interface UserEntitlement {
  entitlement: string;
  source: string;
  expires_at: string | null;
}

interface AppleIAPContextType {
  products: SubscriptionProduct[];
  subscriptionStatus: SubscriptionStatus | null;
  loading: boolean;
  purchasing: boolean;
  purchaseSubscription: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<{ restoredCount: number }>;
  refreshSubscriptionStatus: (options?: { force?: boolean; reason?: string }) => Promise<void>;
  refetchProducts: () => Promise<void>;
  iapReady: boolean;
  ensureIapReady: () => Promise<boolean>;
  iapDiagnostics: IapDiagnostics;
  iapUnavailableReason: string | null;
  pendingProductId: string | null;
  pendingEffectiveDate: number | null;
  entitlements: UserEntitlement[];
  hasComplimentaryPlayerPremium: boolean;
  hasComplimentaryTrainerPremium: boolean;
  hasPlayerPremium: boolean;
  hasTrainerPremium: boolean;
  isRestoring: boolean;
  entitlementSnapshot: {
    resolving: boolean;
    hasActiveSubscription: boolean;
    activeProductId: string | null;
    subscriptionTier: string | null;
    isEntitled: boolean;
  };
  verifiedActiveProductId: string | null;
  verifying: boolean;
}

const defaultDiagnostics: IapDiagnostics = {
  requestedSkus: [],
  returnedSkus: [],
  missingSkus: [],
  lastFetchAt: null,
  lastFetchError: 'not available on web',
  appOwnership: 'web',
  configBundleId: null,
  runtimeBundleId: null,
  bundleIdMismatch: false,
  platform: 'web',
  hermesEnabled: false,
  lastFetchCount: 0,
  returnedProductsDetailed: [],
  lastFetchMethod: null,
};

const AppleIAPContext = createContext<AppleIAPContextType | undefined>(undefined);

// Stub provider for web - Apple IAP is not available on web
export function AppleIAPProvider({ children }: { children: ReactNode }) {
  const { ingestAppleEntitlements } = useSubscription();
  useEffect(() => {
    ingestAppleEntitlements?.({
      resolving: false,
      isEntitled: false,
      activeProductId: null,
      subscriptionTier: null,
    });
  }, [ingestAppleEntitlements]);

  const stubValue: AppleIAPContextType = {
    products: [],
    subscriptionStatus: null,
    loading: false,
    purchasing: false,
    purchaseSubscription: async (productId: string) => {
      console.log('[AppleIAP Web] Purchase not available on web for', productId);
    },
    restorePurchases: async () => {
      console.log('[AppleIAP Web] Restore not available on web');
      return { restoredCount: 0 };
    },
    refreshSubscriptionStatus: async () => {
      console.log('[AppleIAP Web] Refresh not available on web');
    },
    refetchProducts: async () => {
      console.log('[AppleIAP Web] Refetch not available on web');
    },
    iapReady: true,
    ensureIapReady: async () => true,
    iapUnavailableReason: 'Apple In-App Purchases er ikke tilgængelige på web.',
    iapDiagnostics: defaultDiagnostics,
    pendingProductId: null,
    pendingEffectiveDate: null,
    entitlements: [],
    hasComplimentaryPlayerPremium: false,
    hasComplimentaryTrainerPremium: false,
    hasPlayerPremium: false,
    hasTrainerPremium: false,
    isRestoring: false,
    entitlementSnapshot: {
      resolving: false,
      hasActiveSubscription: false,
      activeProductId: null,
      subscriptionTier: null,
      isEntitled: false,
    },
    verifiedActiveProductId: null,
    verifying: false,
  };

  return (
    <AppleIAPContext.Provider value={stubValue}>
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
