import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef, useMemo } from 'react';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { supabase } from '@/integrations/supabase/client';

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

const resolveRniapModule = (module: any) => {
  if (!module) return module;
  if (module?.getSubscriptions || module?.initConnection) {
    return module;
  }
  if (module?.default?.getSubscriptions || module?.default?.initConnection) {
    return module.default;
  }
  return module?.default ?? module;
};

if ((Platform.OS === 'ios' || Platform.OS === 'android') && !isExpoGo) {
  rniapImportPromise = import('react-native-iap')
    .then(module => {
      const resolved = resolveRniapModule(module);
      RNIap = resolved;
      const exportedKeys =
        resolved && typeof resolved === 'object' ? Object.keys(resolved) : [];
      const capabilities = {
        initConnection: typeof resolved?.initConnection === 'function',
        getSubscriptions: typeof resolved?.getSubscriptions === 'function',
        getProducts: typeof resolved?.getProducts === 'function',
        fetchProducts: typeof resolved?.fetchProducts === 'function',
        getAvailablePurchases: typeof resolved?.getAvailablePurchases === 'function',
        requestPurchase: typeof resolved?.requestPurchase === 'function',
        requestSubscription: typeof resolved?.requestSubscription === 'function',
        purchaseUpdatedListener: typeof resolved?.purchaseUpdatedListener === 'function',
        purchaseErrorListener: typeof resolved?.purchaseErrorListener === 'function',
      };
      console.log('[AppleIAP] ✅ react-native-iap loaded successfully', { exportedKeys, capabilities });
    })
    .catch(error => {
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

export const APP_STORE_SUBSCRIPTION_SKUS = [
  PRODUCT_IDS.PLAYER_BASIC,
  PRODUCT_IDS.PLAYER_PREMIUM,
  PRODUCT_IDS.TRAINER_BASIC,
  PRODUCT_IDS.TRAINER_STANDARD,
  PRODUCT_IDS.TRAINER_PREMIUM,
] as const;
const APP_STORE_SKU_SET = new Set(APP_STORE_SUBSCRIPTION_SKUS);

// Shared ordering for UI components that need deterministic plan sorting
export const ORDERED_PRODUCT_IDS = [...APP_STORE_SUBSCRIPTION_SKUS];

export const APP_STORE_SKU_BY_PLAN_CODE = {
  player_basic: PRODUCT_IDS.PLAYER_BASIC,
  player_premium: PRODUCT_IDS.PLAYER_PREMIUM,
  trainer_basic: PRODUCT_IDS.TRAINER_BASIC,
  trainer_standard: PRODUCT_IDS.TRAINER_STANDARD,
  trainer_premium: PRODUCT_IDS.TRAINER_PREMIUM,
} as const;

export const PLAN_CODE_BY_SKU: Record<string, keyof typeof APP_STORE_SKU_BY_PLAN_CODE> =
  Object.fromEntries(Object.entries(APP_STORE_SKU_BY_PLAN_CODE).map(([plan, sku]) => [sku, plan as keyof typeof APP_STORE_SKU_BY_PLAN_CODE]));

const PLAN_TIER_RANK: Record<keyof typeof APP_STORE_SKU_BY_PLAN_CODE, number> = {
  player_basic: 0,
  player_premium: 1,
  trainer_basic: 0,
  trainer_standard: 1,
  trainer_premium: 2,
};

const getPlanMeta = (sku: string | null) => {
  const planCode = sku ? PLAN_CODE_BY_SKU[sku] ?? null : null;
  const group = planCode ? planCode.split('_')[0] : null;
  const tierRank = planCode ? PLAN_TIER_RANK[planCode] ?? null : null;
  return { planCode, group, tierRank };
};

const hermesRuntimeEnabled = typeof (globalThis as any).HermesInternal === 'object';

const IAP_UNAVAILABLE_IOS_MESSAGE =
  'In-app purchases kræver en development build eller TestFlight – virker ikke i Expo Go.';
const IAP_UNAVAILABLE_NOT_IOS_MESSAGE = 'Apple In-App Purchases er kun tilgængelige på iOS.';
const getIapUnavailableMessage = () =>
  Platform.OS === 'ios' ? IAP_UNAVAILABLE_IOS_MESSAGE : IAP_UNAVAILABLE_NOT_IOS_MESSAGE;

// Subscription product details
interface SubscriptionProduct {
  productId: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  localizedPrice: string;
  maxPlayers: number;
}

// Subscription status information
interface SubscriptionStatus {
  isActive: boolean;
  productId: string | null;
  expiryDate: number | null;
  isInTrialPeriod: boolean;
}

// IAP diagnostics and logging
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

const getConfigBundleId = (): string | null => {
  const manifest2BundleId =
    (Constants as any)?.manifest2?.extra?.expoClient?.iosBundleIdentifier ?? null;
  const legacyManifestBundleId = (Constants as any)?.manifest?.ios?.bundleIdentifier ?? null;

  return (
    Constants?.expoConfig?.ios?.bundleIdentifier ??
    manifest2BundleId ??
    legacyManifestBundleId ??
    null
  );
};

const getRuntimeBundleId = (): string | null => Application?.applicationId ?? null;

const buildBundleIdSnapshot = () => {
  const configBundleId = getConfigBundleId();
  const runtimeBundleId = getRuntimeBundleId();
  return {
    configBundleId,
    runtimeBundleId,
    bundleIdMismatch: Boolean(configBundleId && runtimeBundleId && configBundleId !== runtimeBundleId),
  };
};

const defaultDiagnostics: IapDiagnostics = {
  requestedSkus: [...APP_STORE_SUBSCRIPTION_SKUS],
  returnedSkus: [],
  missingSkus: [...APP_STORE_SUBSCRIPTION_SKUS],
  lastFetchAt: null,
  lastFetchError: null,
  appOwnership: Constants.appOwnership ?? null,
  ...buildBundleIdSnapshot(),
  platform: Platform.OS,
  hermesEnabled: hermesRuntimeEnabled,
  lastFetchCount: 0,
  returnedProductsDetailed: [],
  lastFetchMethod: null,
};

interface AppleIAPContextType {
  products: SubscriptionProduct[];
  subscriptionStatus: SubscriptionStatus | null;
  loading: boolean;
  purchasing: boolean;
  purchaseSubscription: (productId: string) => Promise<void>;
  restorePurchases: () => Promise<void>;
  refreshSubscriptionStatus: () => Promise<void>;
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
}

const AppleIAPContext = createContext<AppleIAPContextType | undefined>(undefined);

type FetchMethod = 'getSubscriptions' | 'getProducts' | 'fetchProducts';
const resolveFetchMethod = (): {
  method: FetchMethod;
  run: (skus: string[]) => Promise<any[]>;
} => {
  if (!RNIap) {
    throw new Error('[AppleIAP] react-native-iap module is not available.');
  }

  if (typeof RNIap.getSubscriptions === 'function') {
    return {
      method: 'getSubscriptions',
      run: skus => RNIap.getSubscriptions({ skus }),
    };
  }

  if (typeof RNIap.getProducts === 'function') {
    return {
      method: 'getProducts',
      run: skus => RNIap.getProducts({ skus }),
    };
  }

  if (typeof RNIap.fetchProducts === 'function') {
    return {
      method: 'fetchProducts',
      run: skus => RNIap.fetchProducts({ skus, type: 'subs' }),
    };
  }

  throw new Error(
    '[AppleIAP] No compatible product fetch method found (expected getSubscriptions, getProducts or fetchProducts).'
  );
};

type NormalizedStoreProduct = {
  productId: string;
  title: string;
  description: string;
  price: string;
  currency: string;
  localizedPrice: string;
  rawKeys: string[];
};

type NormalizedPurchase = {
  original: any;
  productId: string;
  expiryDate: number;
  transactionDate: number;
};

const normalizeProductId = (product: any): string | null => {
  const candidates = [
    product?.productId,
    product?.id,
    product?.sku,
    product?.productIdentifier,
    product?.identifier,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length) return trimmed;
    }
  }
  return null;
};

const normalizePurchaseProductId = (purchase: any): string | null => {
  const candidates = [
    purchase?.productId,
    purchase?.productIdentifier,
    purchase?.sku,
    purchase?.identifier,
    purchase?.productIdIOS,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.length) return trimmed;
    }
  }
  return null;
};

const coerceString = (value: any, fallback = '') => {
  if (typeof value === 'string' && value.trim().length) return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const tryConvertProduct = (product: any) => {
  if (typeof RNIap?.convertNitroProductToProduct === 'function') {
    try {
      const converted = RNIap.convertNitroProductToProduct(product);
      if (converted) return converted;
    } catch (error) {
      console.warn('[AppleIAP] convertNitroProductToProduct failed – using original payload.', error);
    }
  }
  return product;
};

const normalizeStoreProduct = (product: any): NormalizedStoreProduct | null => {
  const converted = tryConvertProduct(product);
  const productId = normalizeProductId(converted);
  if (!productId) return null;

  const title = coerceString(converted?.title ?? converted?.name ?? converted?.displayName ?? productId, productId);
  const description = coerceString(converted?.description ?? converted?.subtitle ?? '', '');
  const price = coerceString(converted?.price ?? converted?.formattedPrice ?? '', '');
  const currency = coerceString(converted?.currency ?? converted?.priceLocaleCurrencyCode ?? '', '');
  const localizedPrice = coerceString(
    converted?.localizedPrice ?? converted?.formattedPrice ?? converted?.price ?? '',
    price
  );

  return {
    productId,
    title,
    description,
    price,
    currency,
    localizedPrice,
    rawKeys: Object.keys(converted ?? {}),
  };
};

type ComplimentaryEntitlement = 'spiller_premium' | 'træner_premium';
interface UserEntitlement {
  entitlement: ComplimentaryEntitlement;
  source: string;
  expires_at: string | null;
}

export function AppleIAPProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<SubscriptionProduct[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [iapReady, setIapReady] = useState<boolean>(iapReadyFlag);
  const [iapDiagnostics, setIapDiagnostics] = useState<IapDiagnostics>(defaultDiagnostics);
  const [iapUnavailableReason, setIapUnavailableReason] = useState<string | null>(null);
  const [pendingPlan, setPendingPlan] = useState<{ productId: string; effectiveDate: number | null } | null>(null);
  const [entitlements, setEntitlements] = useState<UserEntitlement[]>([]);
  const lastRequestedSkuRef = useRef<string | null>(null);

  const fetchEntitlements = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setEntitlements([]);
        return;
      }
      const { data, error } = await supabase.rpc('get_my_entitlements');
      if (error) {
        console.warn('[AppleIAP] Failed to load entitlements', error.message);
        return;
      }
      setEntitlements(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('[AppleIAP] Unexpected entitlement fetch error', error);
    }
  }, []);

  useEffect(() => {
    fetchEntitlements();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        fetchEntitlements();
      } else {
        setEntitlements([]);
      }
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [fetchEntitlements]);

  const complimentaryFlags = useMemo(() => {
    const hasComplimentaryPlayerPremium = entitlements.some(e => e.entitlement === 'spiller_premium');
    const hasComplimentaryTrainerPremium = entitlements.some(e => e.entitlement === 'træner_premium');
    const applePlayerActive =
      subscriptionStatus?.isActive && subscriptionStatus.productId === PRODUCT_IDS.PLAYER_PREMIUM;
    const appleTrainerActive =
      subscriptionStatus?.isActive && !!subscriptionStatus.productId && TRAINER_PRODUCT_SET.has(subscriptionStatus.productId);
    return {
      hasComplimentaryPlayerPremium,
      hasComplimentaryTrainerPremium,
      hasPlayerPremium: Boolean(applePlayerActive || hasComplimentaryPlayerPremium),
      hasTrainerPremium: Boolean(appleTrainerActive || hasComplimentaryTrainerPremium),
      applePlayerActive,
      appleTrainerActive,
    };
  }, [entitlements, subscriptionStatus?.isActive, subscriptionStatus?.productId]);

  const { hasComplimentaryPlayerPremium, hasComplimentaryTrainerPremium, hasPlayerPremium, hasTrainerPremium } = complimentaryFlags;

  useEffect(() => {
    const runtimeBundleId = getRuntimeBundleId();
    console.log('[AppleIAP] Runtime bundle ID (expo-application):', runtimeBundleId ?? 'unknown');
  }, []);

  const syncIapReadyState = useCallback(async () => {
    const ready = await ensureIapReady();
    setIapReady(ready);
    return ready;
  }, []);

  const updateDiagnostics = useCallback(
    (partial: Partial<IapDiagnostics>) => {
      setIapDiagnostics(prev => ({
        ...prev,
        ...buildBundleIdSnapshot(),
        appOwnership: Constants.appOwnership ?? prev.appOwnership ?? null,
        platform: Platform.OS,
        ...partial,
      }));
    },
    []
  );

  const fetchProducts = useCallback(async () => {
    const ready = await ensureIapReady();
    if (!ready) {
      const reason = getIapUnavailableMessage();
      setIapUnavailableReason(reason);
      updateDiagnostics({
        lastFetchError: reason,
        lastFetchAt: new Date().toISOString(),
      });
      return;
    }

    if (!RNIap) {
      const reason = getIapUnavailableMessage();
      setIapUnavailableReason(reason);
      updateDiagnostics({
        lastFetchError: 'react-native-iap unavailable',
        lastFetchAt: new Date().toISOString(),
      });
      return;
    }

    setIapUnavailableReason(null);
    const requestedSkus = [...APP_STORE_SUBSCRIPTION_SKUS];
    const configBundleId = getConfigBundleId();
    const runtimeBundleId = getRuntimeBundleId();
    const bundleIdMismatch = Boolean(
      configBundleId && runtimeBundleId && configBundleId !== runtimeBundleId
    );
    console.log('[AppleIAP] Fetching products…', {
      requestedSkus,
      configBundleId,
      runtimeBundleId,
      bundleIdMismatch,
      isExpoGo,
      appOwnership: Constants.appOwnership,
    });
    updateDiagnostics({
      requestedSkus,
      returnedSkus: [],
      missingSkus: requestedSkus,
      lastFetchError: null,
      lastFetchCount: 0,
      returnedProductsDetailed: [],
    });

    try {
      const { method: fetchMethod, run } = resolveFetchMethod();
      updateDiagnostics({ lastFetchMethod: fetchMethod });
      const availableProducts = await run(requestedSkus);

      const normalizationResults = (availableProducts ?? []).map((original: any) => ({
        original,
        normalized: normalizeStoreProduct(original),
      }));
      const normalizedProducts = normalizationResults
        .map(result => result.normalized)
        .filter((product): product is NormalizedStoreProduct => Boolean(product));
      const invalidProducts = normalizationResults.filter(result => !result.normalized);

      if (invalidProducts.length) {
        console.warn('[AppleIAP] ⚠️ Dropping products without valid productId', {
          invalidProductCount: invalidProducts.length,
          sampleInvalidProductKeys: invalidProducts.slice(0, 2).map(item => Object.keys(item.original ?? {})),
        });
      }

      const returnedSkus = normalizedProducts.map(product => product.productId);
      const missingSkus = requestedSkus.filter(sku => !returnedSkus.includes(sku));
      console.log('[AppleIAP] Fetch completed', {
        fetchMethod,
        returnedCount: returnedSkus.length,
        returnedSkus,
        invalidProductCount: invalidProducts.length,
      });

      if (!returnedSkus.length) {
        console.error(
          '[AppleIAP] ⚠️ Apple returned zero products. Paid Apps Agreement / Banking must be ACTIVE and products must be Approved or properly submitted for sale.'
        );
        console.warn(
          '[AppleIAP] Common causes: products not cleared for sale, TestFlight build lacking IAP approval, missing sandbox testers, or bundle identifier mismatch.'
        );
      }

      const mappedProducts: SubscriptionProduct[] = normalizedProducts.map(product => {
        let maxPlayers = 1;
        if (product.productId === PRODUCT_IDS.TRAINER_BASIC) maxPlayers = 5;
        else if (product.productId === PRODUCT_IDS.TRAINER_STANDARD) maxPlayers = 15;
        else if (product.productId === PRODUCT_IDS.TRAINER_PREMIUM) maxPlayers = 50;

        const { rawKeys, ...storeProduct } = product;
        return {
          ...storeProduct,
          maxPlayers,
        };
      });

      updateDiagnostics({
        returnedSkus,
        missingSkus,
        lastFetchAt: new Date().toISOString(),
        lastFetchError: null,
        lastFetchCount: returnedSkus.length,
        returnedProductsDetailed: normalizedProducts.map(product => ({
          productId: product.productId,
          title: product.title,
          localizedPrice: product.localizedPrice,
          rawKeys: product.rawKeys,
        })),
      });

      setProducts(mappedProducts);
    } catch (error: any) {
      console.error('[AppleIAP] Error fetching products:', error?.code, error?.message);
      updateDiagnostics({
        returnedSkus: [],
        missingSkus: requestedSkus,
        lastFetchAt: new Date().toISOString(),
        lastFetchError: `${error?.code ?? 'UNKNOWN'}: ${error?.message ?? 'Unknown error'}`,
        lastFetchCount: 0,
        returnedProductsDetailed: [],
      });
    }
  }, [updateDiagnostics]);

  const refreshSubscriptionStatus = useCallback(async () => {
    await fetchEntitlements();
    const ready = await ensureIapReady();
    if (!ready) {
      setIapUnavailableReason(getIapUnavailableMessage());
      setSubscriptionStatus({
        isActive: false,
        productId: null,
        expiryDate: null,
        isInTrialPeriod: false,
      });
      setPendingPlan(null);
      return;
    }

    if (!RNIap || typeof RNIap.getAvailablePurchases !== 'function') {
      setIapUnavailableReason(getIapUnavailableMessage());
      console.error('[AppleIAP] getAvailablePurchases unavailable – native module missing.');
      setSubscriptionStatus({
        isActive: false,
        productId: null,
        expiryDate: null,
        isInTrialPeriod: false,
      });
      setPendingPlan(null);
      return;
    }

    setIapUnavailableReason(null);

    try {
      console.log('[AppleIAP] Refreshing subscription status…');

      let availablePurchases: any[] = [];
      try {
        availablePurchases = await RNIap.getAvailablePurchases({
          ios: { onlyIncludeActiveItemsIOS: true },
        });
      } catch (fetchError) {
        console.warn('[AppleIAP] getAvailablePurchases with iOS options failed, retrying without filters.', fetchError);
        availablePurchases = await RNIap.getAvailablePurchases();
      }

      const normalizedPurchases: NormalizedPurchase[] = (availablePurchases ?? [])
        .map(purchase => {
          const productId = normalizePurchaseProductId(purchase);
          if (!productId || !APP_STORE_SKU_SET.has(productId)) return null;

          const transactionDateRaw =
            purchase?.transactionDate ??
            purchase?.originalTransactionDateIOS ??
            purchase?.transactionDateIOS ??
            0;
          const transactionDate = Number(transactionDateRaw) || 0;

          const expiryDate = purchase?.expirationDateIOS
            ? Number(purchase.expirationDateIOS)
            : transactionDate
            ? transactionDate + 30 * 24 * 60 * 60 * 1000
            : Date.now() + 30 * 24 * 60 * 60 * 1000;

          return {
            original: purchase,
            productId,
            expiryDate,
            transactionDate,
          };
        })
        .filter(Boolean) as NormalizedPurchase[];

      const currentPurchase = normalizedPurchases.reduce<NormalizedPurchase | null>((winner, candidate) => {
        if (!candidate) return winner;
        if (!winner) return candidate;
        if (candidate.expiryDate !== winner.expiryDate) {
          return candidate.expiryDate > winner.expiryDate ? candidate : winner;
        }
        return candidate.transactionDate > winner.transactionDate ? candidate : winner;
      }, null);

      console.log('[AppleIAP] Purchases inspected', {
        purchaseCount: normalizedPurchases.length,
        chosenProductId: currentPurchase?.productId ?? null,
        chosenExpiry: currentPurchase?.expiryDate ?? null,
      });

      if (currentPurchase) {
        const status: SubscriptionStatus = {
          isActive: true,
          productId: currentPurchase.productId,
          expiryDate: currentPurchase.expiryDate,
          isInTrialPeriod: false,
        };

        setSubscriptionStatus(status);

        const desiredSku = lastRequestedSkuRef.current;
        const activeMeta = getPlanMeta(currentPurchase.productId);
        const desiredMeta = getPlanMeta(desiredSku ?? null);
        let nextPending: { productId: string; effectiveDate: number | null } | null = null;

        if (!desiredSku) {
          nextPending = null;
        } else if (desiredSku === currentPurchase.productId) {
          nextPending = null;
          lastRequestedSkuRef.current = null;
        } else if (
          desiredMeta.group &&
          activeMeta.group &&
          desiredMeta.group === activeMeta.group &&
          desiredMeta.tierRank != null &&
          activeMeta.tierRank != null &&
          desiredMeta.tierRank < activeMeta.tierRank
        ) {
          nextPending = {
            productId: desiredSku,
            effectiveDate: currentPurchase.expiryDate,
          };
        } else {
          nextPending = null;
        }

        setPendingPlan(nextPending);

        console.log('[AppleIAP] Pending plan evaluation', {
          activeSku: currentPurchase.productId,
          desiredSku,
          activeMeta,
          desiredMeta,
          pending: nextPending?.productId ?? null,
        });

        const receiptOrToken =
          currentPurchase.original?.transactionReceipt ?? currentPurchase.original?.purchaseToken ?? null;
        if (receiptOrToken) {
          await updateSubscriptionInSupabase(currentPurchase.productId, receiptOrToken);
        } else {
          console.warn('[AppleIAP] Current purchase missing receipt/purchaseToken.');
        }
      } else {
        setSubscriptionStatus({
          isActive: false,
          productId: null,
          expiryDate: null,
          isInTrialPeriod: false,
        });
        setPendingPlan(null);
        console.log('[AppleIAP] No active subscriptions found');
      }
    } catch (error) {
      console.error('[AppleIAP] Error refreshing subscription status:', error);
    }
  }, [fetchEntitlements]);

  const initializeIAP = useCallback(async () => {
    if (Platform.OS !== 'ios' || isExpoGo) {
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
    if (Platform.OS !== 'ios' || isExpoGo || !iapReady) return;

    if (!RNIap || typeof RNIap.purchaseUpdatedListener !== 'function' || typeof RNIap.purchaseErrorListener !== 'function') {
      console.warn('[AppleIAP] purchaseUpdatedListener/purchaseErrorListener not available on react-native-iap – skipping listeners');
      return;
    }

    const purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase: any) => {
      console.log('[AppleIAP] Purchase updated:', purchase);

      const normalizedProductId = normalizePurchaseProductId(purchase) ?? lastRequestedSkuRef.current;
      const optimisticExpiry = purchase?.expirationDateIOS
        ? Number(purchase.expirationDateIOS)
        : Date.now() + 30 * 24 * 60 * 60 * 1000;

      if (normalizedProductId) {
        setSubscriptionStatus({
          isActive: true,
          productId: normalizedProductId,
          expiryDate: optimisticExpiry,
          isInTrialPeriod: false,
        });
      }

      const receiptOrToken = purchase?.transactionReceipt ?? purchase?.purchaseToken ?? null;
      try {
        await RNIap.finishTransaction?.({ purchase, isConsumable: false });
      } catch (finishError) {
        console.error('[AppleIAP] Error finishing transaction:', finishError);
      }

      if (receiptOrToken && normalizedProductId) {
        try {
          await updateSubscriptionInSupabase(normalizedProductId, receiptOrToken);
        } catch (upsertError) {
          console.error('[AppleIAP] Error updating subscription after purchase:', upsertError);
        }
      } else {
        console.warn('[AppleIAP] Purchase missing receipt/purchaseToken.');
      }

      await refreshSubscriptionStatus();
      Alert.alert(
        receiptOrToken ? 'Køb gennemført! 🎉' : 'Køb registreret',
        receiptOrToken
          ? 'Dit abonnement er nu aktivt. Du kan nu bruge alle funktioner.'
          : 'Vi kunne ikke verificere kvitteringen endnu. Tjek dit abonnement lidt senere.',
        [{ text: 'OK' }]
      );
    });

    const purchaseErrorSubscription = RNIap.purchaseErrorListener((error: any) => {
      console.error('[AppleIAP] Purchase error:', error);
      if (error.code !== 'E_USER_CANCELLED') {
        Alert.alert('Fejl ved køb', 'Der opstod en fejl ved køb af abonnement. Prøv venligst igen.', [{ text: 'OK' }]);
      }
    });

    return () => {
      purchaseUpdateSubscription.remove();
      purchaseErrorSubscription.remove();
    };
  }, [iapReady, refreshSubscriptionStatus]);

  const updateSubscriptionInSupabase = async (productId: string, receipt: string) => {
    try {
      console.log('[AppleIAP] Updating subscription in Supabase...');

      const {
        data: { user },
      } = await supabase.auth.getUser();
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
        .upsert(
          {
            user_id: user.id,
            subscription_tier: subscriptionTier,
            subscription_product_id: productId,
            subscription_receipt: receipt,
            subscription_updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

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

    if (iapUnavailableReason) {
      Alert.alert('Ikke tilgængelig', iapUnavailableReason, [{ text: 'OK' }]);
      return;
    }

    if (!RNIap || typeof RNIap.requestPurchase !== 'function') {
      const reason = getIapUnavailableMessage();
      setIapUnavailableReason(reason);
      Alert.alert('Ikke tilgængelig', reason, [{ text: 'OK' }]);
      return;
    }

    lastRequestedSkuRef.current = productId;
    setPurchasing(true);
    try {
      console.log('[AppleIAP] Requesting subscription:', productId);
      await RNIap.requestPurchase({
        request: {
          apple: { sku: productId },
          google: { skus: [productId] },
        },
        type: 'subs',
      });
      // Purchase update will be handled by the listener
    } catch (error: any) {
      console.error('[AppleIAP] Error purchasing subscription:', error);
      if (error.code !== 'E_USER_CANCELLED') {
        Alert.alert('Fejl ved køb', 'Der opstod en fejl ved køb af abonnement. Prøv venligst igen.', [{ text: 'OK' }]);
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

    if (iapUnavailableReason) {
      Alert.alert('Ikke tilgængelig', iapUnavailableReason, [{ text: 'OK' }]);
      return;
    }

    if (!RNIap || typeof RNIap.getAvailablePurchases !== 'function') {
      const reason = getIapUnavailableMessage();
      setIapUnavailableReason(reason);
      Alert.alert('Ikke tilgængelig', reason, [{ text: 'OK' }]);
      return;
    }

    try {
      console.log('[AppleIAP] Restoring purchases...');
      const availablePurchases = await RNIap.getAvailablePurchases();
      console.log('[AppleIAP] Restored purchases:', availablePurchases);

      if (availablePurchases.length > 0) {
        await refreshSubscriptionStatus();
        Alert.alert('Køb gendannet! ✅', 'Dine tidligere køb er blevet gendannet.', [{ text: 'OK' }]);
      } else {
        Alert.alert('Ingen køb fundet', 'Der blev ikke fundet nogen tidligere køb at gendanne.', [{ text: 'OK' }]);
      }
    } catch (error) {
      console.error('[AppleIAP] Error restoring purchases:', error);
      Alert.alert('Fejl ved gendannelse', 'Der opstod en fejl ved gendannelse af køb. Prøv venligst igen.', [{ text: 'OK' }]);
    }
  };

  const refetchProducts = useCallback(async () => {
    await fetchProducts();
  }, [fetchProducts]);

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
        refetchProducts,
        iapReady,
        ensureIapReady: syncIapReadyState,
        iapDiagnostics,
        iapUnavailableReason,
        pendingProductId: pendingPlan?.productId ?? null,
        pendingEffectiveDate: pendingPlan?.effectiveDate ?? null,
        entitlements,
        hasComplimentaryPlayerPremium,
        hasComplimentaryTrainerPremium,
        hasPlayerPremium,
        hasTrainerPremium,
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
