import React, { createContext, useContext, ReactNode } from 'react';

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

interface AppleIAPContextType {
  products: SubscriptionProduct[];
  subscriptionStatus: SubscriptionStatus | null;
  loading: boolean;
  purchasing: boolean;
  purchaseSubscription: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
  refreshSubscriptionStatus: (options?: { force?: boolean }) => Promise<void>;
  iapReady: boolean;
  ensureIapReady: () => Promise<boolean>;
  iapUnavailableReason: string | null;
}

const AppleIAPContext = createContext<AppleIAPContextType | undefined>(undefined);

// Stub provider for web - Apple IAP is not available on web
export function AppleIAPProvider({ children }: { children: ReactNode }) {
  const stubValue: AppleIAPContextType = {
    products: [],
    subscriptionStatus: null,
    loading: false,
    purchasing: false,
    purchaseSubscription: async () => {
      console.log('[AppleIAP Web] Purchase not available on web');
    },
    restorePurchases: async () => {
      console.log('[AppleIAP Web] Restore not available on web');
    },
    refreshSubscriptionStatus: async () => {
      console.log('[AppleIAP Web] Refresh not available on web');
    },
    iapReady: true,
    ensureIapReady: async () => true,
    iapUnavailableReason: 'Apple In-App Purchases er ikke tilgængelige på web.',
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
