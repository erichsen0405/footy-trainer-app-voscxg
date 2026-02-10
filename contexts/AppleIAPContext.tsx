/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef, useMemo } from 'react';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { supabase } from '@/integrations/supabase/client';
import { bumpEntitlementsVersion } from '@/services/entitlementsEvents';
import { syncEntitlementsSnapshot, SubscriptionTier } from '@/services/entitlementsSync';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PRODUCT_IDS } from '@/contexts/appleProductIds';

export { PRODUCT_IDS } from '@/contexts/appleProductIds';

const executionEnvironment =
  (Constants as any)?.executionEnvironment ??
  (Constants as any)?.ExecutionEnvironment ??
  null;

// Check if we're running in Expo Go (covers classic appOwnership + new executionEnvironment flag)
const isExpoGo =
  executionEnvironment != null
    ? executionEnvironment === 'storeClient'
    : Constants.appOwnership === 'expo';

// Prevents refresh loops by throttling auto-refresh calls
const REFRESH_THROTTLE_MS = 10_000;

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

export const APP_STORE_SUBSCRIPTION_SKUS = [
  PRODUCT_IDS.PLAYER_BASIC,
  PRODUCT_IDS.PLAYER_PREMIUM,
  PRODUCT_IDS.TRAINER_BASIC,
  PRODUCT_IDS.TRAINER_STANDARD,
  PRODUCT_IDS.TRAINER_PREMIUM,
] as const;
const APP_STORE_SKU_SET = new Set(APP_STORE_SUBSCRIPTION_SKUS);

export const TRAINER_PRODUCT_IDS = [
  PRODUCT_IDS.TRAINER_BASIC,
  PRODUCT_IDS.TRAINER_STANDARD,
  PRODUCT_IDS.TRAINER_PREMIUM,
] as const;
export const TRAINER_PRODUCT_SET = new Set<string>(TRAINER_PRODUCT_IDS);

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

const subscriptionTierFromSku = (sku: string | null): SubscriptionTier | null => {
  if (!sku) return null;
  return (PLAN_CODE_BY_SKU[sku] ?? null) as SubscriptionTier | null;
};

const hermesRuntimeEnabled = typeof (globalThis as any).HermesInternal === 'object';

const IAP_UNAVAILABLE_IOS_MESSAGE =
  'In-app purchases kræver en development build eller TestFlight – virker ikke i Expo Go.';
const IAP_UNAVAILABLE_NOT_IOS_MESSAGE = 'Apple In-App Purchases er kun tilgængelige på iOS.';
const getIapUnavailableMessage = () =>
  Platform.OS === 'ios' ? IAP_UNAVAILABLE_IOS_MESSAGE : IAP_UNAVAILABLE_NOT_IOS_MESSAGE;
const PURCHASE_MATCH_WINDOW_MS = 2 * 60 * 1000;
const FLOW_MATCH_WINDOW_MS = 2 * 60 * 1000;
const OPTIMISTIC_GRACE_MS = 5 * 60 * 1000;

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
  returnedProductsDetailed: { productId: string; title: string; localizedPrice: string; rawKeys?: string[] }[];
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
    subscriptionTier: SubscriptionTier | null;
    isEntitled: boolean;
  };
  verifiedActiveProductId: string | null;
  verifying: boolean;
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

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeEpochMs = (value: any): number => {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric < 1e12 ? Math.trunc(numeric * 1000) : Math.trunc(numeric);
};

const buildPurchaseDebugSnapshot = (purchase: any, sku: string | null) => {
  const transactionId =
    purchase?.transactionId ??
    purchase?.transactionIdIOS ??
    purchase?.transactionIdentifier ??
    purchase?.originalTransactionIdentifierIOS ??
    purchase?.orderId ??
    null;
  const environmentIOS = purchase?.environment ?? purchase?.environmentIOS ?? null;
  const expirationDateIOS =
    purchase?.expirationDateIOS ??
    purchase?.expiresDate ??
    purchase?.expiryTimeMs ??
    purchase?.purchaseTokenExpirationDate ??
    null;
  return {
    productId: sku,
    transactionId,
    environmentIOS,
    expirationDateIOS,
  };
};

const finishPurchaseWithLogging = async (purchase: any, sku: string | null, label: string) => {
  const debug = buildPurchaseDebugSnapshot(purchase, sku);
  console.log('[AppleIAP] FLOW FINISH_TRANSACTION_START', { label, ...debug });
  try {
    await RNIap?.finishTransaction?.({ purchase, isConsumable: false });
    console.log('[AppleIAP] FLOW FINISH_TRANSACTION_DONE', { label, ...debug });
  } catch (finishError) {
    console.error('[AppleIAP] FLOW FINISH_TRANSACTION_ERROR', { label, ...debug, error: finishError });
  }
};

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
  const entitlementsSignatureRef = useRef<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [verifiedActiveProductId, setVerifiedActiveProductId] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const lastRequestedSkuRef = useRef<string | null>(null);
  const lastRequestedAtRef = useRef<number | null>(null);
  const subscriptionStatusRef = useRef<SubscriptionStatus | null>(null);
  const handledPurchaseEventsRef = useRef<Map<string, number>>(new Map());
  const alertInFlightRef = useRef(false);
  const refreshAfterPurchasePromiseRef = useRef<Promise<void> | null>(null);
  const activePurchaseFlowRef = useRef<{ key: string; sku: string; startedAt: number } | null>(null);
  const lastAlertKeyRef = useRef<string | null>(null);
  const lastAlertAtRef = useRef<number>(0);
  const pendingPlanRef = useRef<{ productId: string; effectiveDate: number | null } | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const entitlementsUnsupportedRef = useRef(false);
  const entitlementsWarnedRef = useRef(false);
  const autoRestoreAttemptedRef = useRef(false);
  const { ingestAppleEntitlements } = useSubscription();

  useEffect(() => {
    subscriptionStatusRef.current = subscriptionStatus;
  }, [subscriptionStatus]);

  useEffect(() => {
    pendingPlanRef.current = pendingPlan;
  }, [pendingPlan]);

  const buildFlowKey = (sku: string) => `${sku}_${Date.now()}`;

  const showAlertOnceByKey = (key: string, title: string, message: string) => {
    if (alertInFlightRef.current) return;
    if (lastAlertKeyRef.current === key) return;
    const now = Date.now();
    if (now - lastAlertAtRef.current < 1500) return;
    lastAlertKeyRef.current = key;
    lastAlertAtRef.current = now;
    alertInFlightRef.current = true;
    Alert.alert(title, message, [
      {
        text: 'OK',
        onPress: () => {
          alertInFlightRef.current = false;
        },
      },
    ]);
  };

  const shouldShowPurchaseAlerts = (sku: string) => {
    const flow = activePurchaseFlowRef.current;
    if (flow?.sku === sku) return true;
    const lastAt = lastRequestedAtRef.current ?? 0;
    const lastSku = lastRequestedSkuRef.current;
    return lastSku === sku && Date.now() - lastAt < PURCHASE_MATCH_WINDOW_MS;
  };

  const fetchEntitlements = useCallback(async () => {
    if (entitlementsUnsupportedRef.current) {
      return;
    }
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
        const message = error.message ?? '';
        if (message.includes('get_my_entitlements')) {
          if (!entitlementsWarnedRef.current) {
            console.warn('[AppleIAP] Entitlements RPC unavailable:', message);
            entitlementsWarnedRef.current = true;
          }
          entitlementsUnsupportedRef.current = true;
          setEntitlements([]);
          return;
        }
        console.warn('[AppleIAP] Failed to load entitlements', message);
        return;
      }
      setEntitlements(Array.isArray(data) ? data : []);
    } catch (error: any) {
      const message = error?.message ?? '';
      if (message.includes('get_my_entitlements')) {
        if (!entitlementsWarnedRef.current) {
          console.warn('[AppleIAP] Entitlements RPC unavailable:', message);
          entitlementsWarnedRef.current = true;
        }
        entitlementsUnsupportedRef.current = true;
        setEntitlements([]);
        return;
      }
      console.warn('[AppleIAP] Unexpected entitlement fetch error', error);
    }
  }, []);

  useEffect(() => {
    void fetchEntitlements();
  }, [fetchEntitlements]);

  useEffect(() => {
    const signature = JSON.stringify(entitlements);
    if (entitlementsSignatureRef.current !== signature) {
      entitlementsSignatureRef.current = signature;
      bumpEntitlementsVersion('complimentary-entitlements');
    }
  }, [entitlements]);

  const syncIapReadyState = useCallback(async () => {
    const ready = await ensureIapReady();
    setIapReady(ready);
    return ready;
  }, []);

  const getAvailablePurchasesSafe = useCallback(async () => {
    if (!RNIap || typeof RNIap.getAvailablePurchases !== 'function') {
      throw Object.assign(new Error('iap_module_unavailable'), { code: 'iap_module_unavailable' });
    }
    try {
      return await RNIap.getAvailablePurchases({ ios: { onlyIncludeActiveItemsIOS: true } });
    } catch (error) {
      console.warn('[AppleIAP] getAvailablePurchases (filtered) failed – retrying unfiltered.', error);
      return await RNIap.getAvailablePurchases();
    }
  }, []);

  const performRestore = useCallback(
    async (reason: string) => {
      if (Platform.OS !== 'ios') {
        return { restoredCount: 0, purchases: [] as any[] };
      }
      const ready = await syncIapReadyState();
      if (!ready) {
        const message = getIapUnavailableMessage();
        setIapUnavailableReason(message);
        throw Object.assign(new Error('iap_not_ready'), { code: 'iap_not_ready', reason: message });
      }
      setIapUnavailableReason(null);
      setIsRestoring(true);
      try {
        const purchases = await getAvailablePurchasesSafe();
        const restoredCount = (purchases ?? [])
          .map(normalizePurchaseProductId)
          .filter(productId => productId && APP_STORE_SKU_SET.has(productId)).length;
        console.log(`[AppleIAP] Restore (${reason}) completed`, { restoredCount });
        return { restoredCount, purchases };
      } finally {
        setIsRestoring(false);
      }
    },
    [getAvailablePurchasesSafe, syncIapReadyState],
  );

  const refreshSubscriptionStatus = useCallback(
    async ({ force = false, reason = 'refresh' }: { force?: boolean; reason?: string } = {}) => {
      if (refreshInFlightRef.current) {
        return refreshPromiseRef.current ?? Promise.resolve();
      }
      const now = Date.now();
      if (!force && now - lastRefreshAtRef.current < REFRESH_THROTTLE_MS) {
        return refreshPromiseRef.current ?? Promise.resolve();
      }
      refreshInFlightRef.current = true;
      lastRefreshAtRef.current = now;
      const runner = (async () => {
        try {
          await fetchEntitlements();
          const ready = await syncIapReadyState();
          if (!ready) {
            setIapUnavailableReason(getIapUnavailableMessage());
            const emptyStatus: SubscriptionStatus = { isActive: false, productId: null, expiryDate: null, isInTrialPeriod: false };
            setSubscriptionStatus(emptyStatus);
            subscriptionStatusRef.current = emptyStatus;
            setPendingPlan(null);
            return;
          }
          if (!RNIap || typeof RNIap.getAvailablePurchases !== 'function') {
            setIapUnavailableReason(getIapUnavailableMessage());
            console.error('[AppleIAP] getAvailablePurchases unavailable – native module missing.');
            const emptyStatus: SubscriptionStatus = { isActive: false, productId: null, expiryDate: null, isInTrialPeriod: false };
            setSubscriptionStatus(emptyStatus);
            subscriptionStatusRef.current = emptyStatus;
            setPendingPlan(null);
            return;
          }
          setIapUnavailableReason(null);
          try {
            console.log('[AppleIAP] Refreshing subscription status…');
            const availablePurchases = await getAvailablePurchasesSafe();
            let normalizedPurchases: NormalizedPurchase[] = (availablePurchases ?? [])
              .map(purchase => {
                const productId = normalizePurchaseProductId(purchase);
                if (!productId || !APP_STORE_SKU_SET.has(productId)) return null;

                const transactionDate = normalizeEpochMs(
                  purchase?.transactionDate ??
                    purchase?.originalTransactionDateIOS ??
                    purchase?.transactionDateIOS ??
                    purchase?.transactionTimestamp
                );

                const rawExpiry =
                  purchase?.expirationDateIOS ??
                  purchase?.expiresDate ??
                  purchase?.expiryTimeMs ??
                  purchase?.purchaseTokenExpirationDate;
                const expiryDate = rawExpiry
                  ? normalizeEpochMs(rawExpiry)
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

            const bestPurchase = pickPreferredPurchase(normalizedPurchases);
            const desiredSku = lastRequestedSkuRef.current;
            const desiredPurchase = desiredSku
              ? pickLatestPurchase(normalizedPurchases.filter(purchase => purchase.productId === desiredSku))
              : null;

            let activePurchase = bestPurchase;
            let nextPending: { productId: string; effectiveDate: number | null } | null = null;

            if (desiredPurchase) {
              const bestMeta = getPlanMeta(bestPurchase?.productId ?? null);
              const desiredMeta = getPlanMeta(desiredPurchase.productId);
              const isDowngrade =
                Boolean(
                  bestPurchase &&
                    desiredMeta.group &&
                    bestMeta.group &&
                    desiredMeta.group === bestMeta.group &&
                    desiredMeta.tierRank != null &&
                    bestMeta.tierRank != null &&
                    desiredMeta.tierRank < bestMeta.tierRank
                );

              if (isDowngrade && bestPurchase) {
                activePurchase = bestPurchase;
                nextPending = { productId: desiredPurchase.productId, effectiveDate: bestPurchase.expiryDate };
              } else {
                activePurchase = desiredPurchase;
                nextPending = null;
                lastRequestedSkuRef.current = null;
                lastRequestedAtRef.current = null;
              }
            } else if (desiredSku && bestPurchase) {
              const desiredMeta = getPlanMeta(desiredSku);
              const activeMeta = getPlanMeta(bestPurchase.productId);
              const shouldQueueDowngrade =
                Boolean(
                  desiredMeta.group &&
                    activeMeta.group &&
                    desiredMeta.group === activeMeta.group &&
                    desiredMeta.tierRank != null &&
                    activeMeta.tierRank != null &&
                    desiredMeta.tierRank < activeMeta.tierRank
                );

              nextPending = shouldQueueDowngrade
                ? { productId: desiredSku, effectiveDate: bestPurchase.expiryDate }
                : null;

              if (!shouldQueueDowngrade && desiredSku === bestPurchase.productId) {
                lastRequestedSkuRef.current = null;
                lastRequestedAtRef.current = null;
              }
            }

            if (
              desiredSku &&
              !desiredPurchase &&
              subscriptionStatusRef.current?.productId === desiredSku &&
              lastRequestedAtRef.current &&
              Date.now() - lastRequestedAtRef.current < OPTIMISTIC_GRACE_MS
            ) {
              console.log('[AppleIAP] Grace window active – keeping optimistic plan visible');
              setPendingPlan(null);
              return;
            }

            if (desiredSku && bestPurchase?.productId === desiredSku) {
              lastRequestedSkuRef.current = null;
              lastRequestedAtRef.current = null;
            }

            if (activePurchase) {
              if (desiredSku && activePurchase.productId === desiredSku) {
                lastRequestedSkuRef.current = null;
                lastRequestedAtRef.current = null;
              }
              const nextStatus: SubscriptionStatus = {
                isActive: true,
                productId: activePurchase.productId,
                expiryDate: activePurchase.expiryDate,
                isInTrialPeriod: false,
              };
              setSubscriptionStatus(nextStatus);
              subscriptionStatusRef.current = nextStatus;
              setPendingPlan(nextPending);

              const receiptOrToken =
                activePurchase.original?.transactionReceipt ||
                activePurchase.original?.transactionReceiptIOS ||
                activePurchase.original?.purchaseToken ||
                activePurchase.original?.transactionToken ||
                null;

              if (!receiptOrToken) {
                console.warn('[AppleIAP] No receipt/token found for active purchase – persisting entitlements anyway');
              }

              await persistAppleEntitlements({
                productId: activePurchase.productId,
                receipt: receiptOrToken ?? null,
                reason: `refresh:${reason}`,
              });
            } else {
              const emptyStatus: SubscriptionStatus = {
                isActive: false,
                productId: null,
                expiryDate: null,
                isInTrialPeriod: false,
              };
              setSubscriptionStatus(emptyStatus);
              subscriptionStatusRef.current = emptyStatus;
              setPendingPlan(null);
              console.log('[AppleIAP] No active subscriptions found');
              if (!autoRestoreAttemptedRef.current && Platform.OS === 'ios') {
                autoRestoreAttemptedRef.current = true;
                console.log('[AppleIAP] Triggering auto-restore (no active subscriptions detected)');
                void (async () => {
                  try {
                    await performRestore('auto_no_active');
                    await refreshSubscriptionStatus({ force: true, reason: 'post_auto_restore' });
                  } catch (error) {
                    console.warn('[AppleIAP] Auto-restore failed', error);
                  }
                })();
              }
            }
          } catch (error) {
            console.error('[AppleIAP] Error refreshing subscription status:', error);
          }
        } finally {
          refreshInFlightRef.current = false;
          refreshPromiseRef.current = null;
        }
      })();
      refreshPromiseRef.current = runner;
      return runner;
    },
    [
      fetchEntitlements,
      getAvailablePurchasesSafe,
      performRestore,
      pickLatestPurchase,
      pickPreferredPurchase,
      syncIapReadyState,
    ],
  );

  useEffect(() => {
    const emptyStatus: SubscriptionStatus = { isActive: false, productId: null, expiryDate: null, isInTrialPeriod: false };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        autoRestoreAttemptedRef.current = false;
        setVerifiedActiveProductId(null);
        void refreshSubscriptionStatus({ force: true, reason: 'auth_login' });
        return;
      }
      setSubscriptionStatus(emptyStatus);
      subscriptionStatusRef.current = emptyStatus;
      setEntitlements([]);
      setVerifiedActiveProductId(null);
      setPendingPlan(null);
      pendingPlanRef.current = null;
      lastRequestedSkuRef.current = null;
      lastRequestedAtRef.current = null;
      activePurchaseFlowRef.current = null;
      refreshAfterPurchasePromiseRef.current = null;
      refreshInFlightRef.current = false;
      refreshPromiseRef.current = null;
      setPurchasing(false);
      handledPurchaseEventsRef.current = new Map();
      alertInFlightRef.current = false;
      lastAlertKeyRef.current = null;
      lastAlertAtRef.current = 0;
      setIapUnavailableReason(null);
    });
    return () => {
      data.subscription.unsubscribe();
    };
  }, [refreshSubscriptionStatus]);

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

  const complimentaryTier = useMemo<SubscriptionTier | null>(() => {
    if (hasComplimentaryTrainerPremium) return 'trainer_premium';
    if (hasComplimentaryPlayerPremium) return 'player_premium';
    return null;
  }, [hasComplimentaryPlayerPremium, hasComplimentaryTrainerPremium]);

  const appleActiveSku = subscriptionStatus?.isActive ? subscriptionStatus.productId ?? null : null;
  const appleTierSourceSku = verifiedActiveProductId ?? appleActiveSku ?? null;

  const appleTier = useMemo(() => {
    return subscriptionTierFromSku(appleTierSourceSku);
  }, [appleTierSourceSku]);

  const effectiveSubscriptionTier = useMemo<SubscriptionTier | null>(() => {
    return complimentaryTier ?? appleTier;
  }, [appleTier, complimentaryTier]);

  useEffect(() => {
    const runtimeBundleId = getRuntimeBundleId();
    console.log('[AppleIAP] Runtime bundle ID (expo-application):', runtimeBundleId ?? 'unknown');
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
    const ready = await syncIapReadyState();
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
    const requestedSkus = [...ORDERED_PRODUCT_IDS];
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
  }, [updateDiagnostics, syncIapReadyState]);

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

  const purchaseErrorListenerCleanupRef = useRef<(() => void) | null>(null);
  const purchaseUpdateListenerCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || isExpoGo || !iapReady) return;

    if (!RNIap || typeof RNIap.purchaseUpdatedListener !== 'function' || typeof RNIap.purchaseErrorListener !== 'function') {
      console.warn('[AppleIAP] purchaseUpdatedListener/purchaseErrorListener not available on react-native-iap – skipping listeners');
      return;
    }

    const purchaseUpdateSubscription = RNIap.purchaseUpdatedListener(async (purchase: any) => {
      console.log('[AppleIAP] Purchase updated:', purchase);
      setPurchasing(false);

      const normalizedSku = normalizePurchaseProductId(purchase);
      const receivedDebug = buildPurchaseDebugSnapshot(purchase, normalizedSku);
      console.log('[AppleIAP] FLOW PURCHASE_RECEIVED', receivedDebug);

      const eventTimestamp = Date.now();
      const activeFlow = activePurchaseFlowRef.current;
      const requestedSku = activeFlow?.sku ?? lastRequestedSkuRef.current ?? null;
      const flowMatch = Boolean(
        activeFlow &&
          eventTimestamp - activeFlow.startedAt < FLOW_MATCH_WINDOW_MS
      );
      const recentRequestMatch = Boolean(
        requestedSku &&
          lastRequestedAtRef.current != null &&
          eventTimestamp - (lastRequestedAtRef.current ?? 0) < PURCHASE_MATCH_WINDOW_MS
      );
      const isUserInitiatedEvent = flowMatch || recentRequestMatch;
      if (!normalizedSku && !isUserInitiatedEvent) {
        console.warn('[AppleIAP] Ignoring purchase event without productId', { purchase });
        await finishPurchaseWithLogging(purchase, null, 'no_product_id');
        return;
      }
      const shouldPreferRequestedSku =
        Boolean(
          requestedSku &&
          normalizedSku &&
          isUserInitiatedEvent &&
          (Boolean(
            TRAINER_PRODUCT_SET.has(requestedSku) && !TRAINER_PRODUCT_SET.has(normalizedSku)
          ) ||
            (() => {
              const requestedMeta = getPlanMeta(requestedSku);
              const normalizedMeta = getPlanMeta(normalizedSku);
              return Boolean(
                requestedMeta.group &&
                  normalizedMeta.group &&
                  requestedMeta.group === normalizedMeta.group &&
                  requestedMeta.tierRank != null &&
                  normalizedMeta.tierRank != null &&
                  requestedMeta.tierRank > normalizedMeta.tierRank
              );
            })())
        );
      const purchasedSku = shouldPreferRequestedSku
        ? requestedSku
        : (normalizedSku ?? requestedSku);
      if (!purchasedSku) {
        console.warn('[AppleIAP] Purchase missing productId – skipping update');
        return;
      }
      if (isUserInitiatedEvent) {
        lastRequestedSkuRef.current = purchasedSku;
        lastRequestedAtRef.current = eventTimestamp;
      }

      pruneHandledPurchaseEvents();
      const purchaseEventKey = buildPurchaseEventKey(purchase, purchasedSku);

      if (handledPurchaseEventsRef.current.has(purchaseEventKey)) {
        console.log('[AppleIAP] Duplicate purchase update – finishing silently', { purchaseEventKey });
        await finishPurchaseWithLogging(purchase, purchasedSku, 'duplicate_event');
        return;
      }
      handledPurchaseEventsRef.current.set(purchaseEventKey, Date.now());

      const optimisticExpiry =
        normalizeEpochMs(purchase?.expirationDateIOS ?? purchase?.expiresDate ?? purchase?.expiryTimeMs) ||
        Date.now() + 30 * 24 * 60 * 60 * 1000;

      const currentStatus = subscriptionStatusRef.current;
      const currentSku = currentStatus?.productId ?? null;
      const pendingUpgradeSkuRaw =
        (purchase as any)?.renewalInfoIOS?.pendingUpgradeProductId ??
        (purchase as any)?.pendingUpgradeProductId ??
        (purchase as any)?.renewalInfo?.pendingUpgradeProductId ??
        null;
      const pendingUpgradeSku =
        typeof pendingUpgradeSkuRaw === 'string' && pendingUpgradeSkuRaw.trim().length
          ? pendingUpgradeSkuRaw.trim()
          : null;
      const purchasedMeta = getPlanMeta(purchasedSku);
      const currentMeta = getPlanMeta(currentSku);
      const pendingUpgradeMeta = getPlanMeta(pendingUpgradeSku);
      const isDowngradeWithinGroup =
        Boolean(
          currentSku &&
          purchasedMeta.group &&
          currentMeta.group &&
          purchasedMeta.group === currentMeta.group &&
          purchasedMeta.tierRank != null &&
          currentMeta.tierRank != null &&
          purchasedMeta.tierRank < currentMeta.tierRank
        );
      const isPendingUpgradeWithinGroup =
        Boolean(
          pendingUpgradeSku &&
          currentSku &&
          pendingUpgradeMeta.group &&
          currentMeta.group &&
          pendingUpgradeMeta.group === currentMeta.group &&
          pendingUpgradeMeta.tierRank != null &&
          currentMeta.tierRank != null &&
          pendingUpgradeMeta.tierRank > currentMeta.tierRank
        );

      if (isPendingUpgradeWithinGroup) {
        const nextStatus: SubscriptionStatus = {
          isActive: true,
          productId: pendingUpgradeSku,
          expiryDate: optimisticExpiry,
          isInTrialPeriod: false,
        };
        setSubscriptionStatus(nextStatus);
        subscriptionStatusRef.current = nextStatus;
        setPendingPlan(null);
      } else if (isDowngradeWithinGroup) {
        setPendingPlan({
          productId: purchasedSku,
          effectiveDate: currentStatus?.expiryDate ?? null,
        });
        console.log('[AppleIAP] Detected pending downgrade – keeping current plan active', {
          activeSku: currentSku,
          pendingSku: purchasedSku,
        });
      } else {
        const nextStatus: SubscriptionStatus = {
          isActive: true,
          productId: purchasedSku,
          expiryDate: optimisticExpiry,
          isInTrialPeriod: false,
        };
        setSubscriptionStatus(nextStatus);
        subscriptionStatusRef.current = nextStatus;
        setPendingPlan(null);
      }

      const receiptOrToken = purchase?.transactionReceipt ?? purchase?.purchaseToken ?? null;
      await finishPurchaseWithLogging(purchase, purchasedSku, 'normal_flow');

      const shouldAlert = isUserInitiatedEvent && shouldShowPurchaseAlerts(purchasedSku);
      if (shouldAlert) {
        const alertKey = flowMatch && activeFlow ? activeFlow.key : purchaseEventKey;
        const alertTitle = receiptOrToken ? 'Køb gennemført! 🎉' : 'Køb registreret';
        const alertMessage = receiptOrToken
          ? 'Dit abonnement er nu aktivt. Du kan nu bruge alle funktioner.'
          : 'Vi kunne ikke verificere kvitteringen endnu. Tjek dit abonnement lidt senere.';
        showAlertOnceByKey(alertKey, alertTitle, alertMessage);
      } else {
        console.log('[AppleIAP] Suppressing purchase alert (silent update)', {
          purchasedSku,
          purchaseEventKey,
        });
      }
      const refreshTargetSku = isPendingUpgradeWithinGroup ? pendingUpgradeSku : purchasedSku;
      void queueRefreshAfterPurchase(refreshTargetSku);

      if (receiptOrToken && !isDowngradeWithinGroup) {
        const entitlementSku = isPendingUpgradeWithinGroup ? pendingUpgradeSku : purchasedSku;
        console.log('[AppleIAP] FLOW PURCHASE_VERIFY_START', {
          productId: entitlementSku,
          hasReceipt: Boolean(receiptOrToken),
          source: 'purchase',
        });
        void persistAppleEntitlements({
          productId: entitlementSku,
          receipt: receiptOrToken,
          reason: 'purchase',
        }).catch(error => console.error('[AppleIAP] Error updating subscription after purchase:', error));
      } else if (!receiptOrToken) {
        console.warn('[AppleIAP] Purchase missing receipt/purchaseToken.');
      }

      if (flowMatch) {
        activePurchaseFlowRef.current = null;
      }
    });

    const purchaseErrorSubscription = RNIap.purchaseErrorListener((error: any) => {
      console.error('[AppleIAP] Purchase error:', error);
      setPurchasing(false);
      activePurchaseFlowRef.current = null;
      if (error?.code === 'E_USER_CANCELLED') {
        return;
      }
      Alert.alert('Fejl ved køb', 'Der opstod en fejl ved køb af abonnement. Prøv venligst igen.', [{ text: 'OK' }]);
    });

    purchaseUpdateListenerCleanupRef.current = () => {
      purchaseUpdateSubscription.remove();
    };
    purchaseErrorListenerCleanupRef.current = () => {
      purchaseErrorSubscription.remove();
    };
    return () => {
      purchaseUpdateSubscription.remove();
      purchaseErrorSubscription.remove();
    };
  }, [iapReady, queueRefreshAfterPurchase, refreshSubscriptionStatus]);

  const startSubscriptionPurchase = useCallback(async (sku: string) => {
    const errors: { method: string; error: any }[] = [];

    if (typeof RNIap?.requestSubscription === 'function') {
      try {
        await RNIap.requestSubscription({ sku });
        console.log('[AppleIAP] startPurchase ok via requestSubscription({sku})', { sku });
        return;
      } catch (e) {
        errors.push({ method: 'requestSubscription({sku})', error: e });
      }

      try {
        await RNIap.requestSubscription(sku);
        console.log('[AppleIAP] startPurchase ok via requestSubscription(sku)', { sku });
        return;
      } catch (e) {
        errors.push({ method: 'requestSubscription(sku)', error: e });
      }
    }

    if (typeof RNIap?.requestPurchase === 'function') {
      try {
        await RNIap.requestPurchase({
          request: {
            apple: { sku },
            google: { skus: [sku] },
          },
          type: 'subs',
        });
        console.log('[AppleIAP] startPurchase ok via requestPurchase({request,type})', { sku });
        return;
      } catch (e) {
        errors.push({ method: 'requestPurchase({request,type})', error: e });
      }

      try {
        await RNIap.requestPurchase({ sku });
        console.log('[AppleIAP] startPurchase ok via requestPurchase({sku})', { sku });
        return;
      } catch (e) {
        errors.push({ method: 'requestPurchase({sku})', error: e });
      }

      try {
        await RNIap.requestPurchase(sku);
        console.log('[AppleIAP] startPurchase ok via requestPurchase(sku)', { sku });
        return;
      } catch (e) {
        errors.push({ method: 'requestPurchase(sku)', error: e });
      }
    }

    const top = errors[0]?.error;
    console.error('[AppleIAP] startPurchase failed (all methods)', { sku, errors });
    throw top ?? new Error('IAP startPurchase failed (no compatible method)');
  }, []);

  const purchaseSubscription = async (productId: string) => {
    if (Platform.OS !== 'ios') {
      throw Object.assign(new Error('iap_ios_only'), { code: 'iap_ios_only' });
    }

    const ready = await syncIapReadyState();
    if (!ready) {
      const reason = iapUnavailableReason ?? getIapUnavailableMessage();
      setIapUnavailableReason(reason);
      throw Object.assign(new Error('iap_not_ready'), { code: 'iap_not_ready', reason });
    }

    if (!RNIap) {
      throw Object.assign(new Error('iap_module_unavailable'), { code: 'iap_module_unavailable' });
    }

    setIapUnavailableReason(null);
    lastRequestedSkuRef.current = productId;
    lastRequestedAtRef.current = Date.now();
    const flow = {
      key: buildFlowKey(productId),
      sku: productId,
      startedAt: Date.now(),
    };
    activePurchaseFlowRef.current = flow;
    setPurchasing(true);

    try {
      await startSubscriptionPurchase(productId);
      void refreshSubscriptionStatus({ force: true, reason: 'post_purchase_request' });
    } catch (error) {
      if (activePurchaseFlowRef.current?.key === flow.key) {
        activePurchaseFlowRef.current = null;
      }
      lastRequestedSkuRef.current = null;
      lastRequestedAtRef.current = null;
      throw error;
    } finally {
      setPurchasing(false);
    }
  };

  const restorePurchases = async (): Promise<{ restoredCount: number }> => {
    const { restoredCount } = await performRestore('manual_restore');
    await refreshSubscriptionStatus({ force: true, reason: 'manual_restore' });
    return { restoredCount };
  };

  const refetchProducts = useCallback(async () => {
    await fetchProducts();
  }, [fetchProducts]);

  const buildPurchaseEventKey = (purchase: any, sku: string | null) => {
    const stable =
      purchase?.transactionId ??
      purchase?.transactionIdentifier ??
      purchase?.originalTransactionIdentifierIOS ??
      purchase?.purchaseToken;
    if (stable) return stable;
    const fallbackDate = normalizeEpochMs(
      purchase?.transactionDate ?? purchase?.transactionTimestamp ?? purchase?.transactionDateIOS ?? null
    );
    return `${sku ?? 'unknown'}_${fallbackDate || 'unknownDate'}`;
  };

  const pickLatestPurchase = useCallback((items: NormalizedPurchase[]) => {
    if (!items.length) return null;
    return items.reduce<NormalizedPurchase | null>((winner, candidate) => {
      if (!candidate) return winner;
      if (!winner) return candidate;
      if (candidate.expiryDate !== winner.expiryDate) {
        return candidate.expiryDate > winner.expiryDate ? candidate : winner;
      }
      return candidate.transactionDate > winner.transactionDate ? candidate : winner;
    }, null);
  }, []);

  const pickPreferredPurchase = useCallback((items: NormalizedPurchase[]) => {
    if (!items.length) return null;
    const now = Date.now();
    const isNonExpiringPurchase = (item: NormalizedPurchase) => {
      if (item.expiryDate) return false;
      const original = item.original ?? {};
      const hasNoExpiry =
        original.expirationDateIOS == null &&
        original.expiresDate == null &&
        original.expiryTimeMs == null &&
        original.purchaseTokenExpirationDate == null;
      const isNonExpiring = Boolean(
        original.isNonConsumable ||
          original.isLifetime ||
          original.productType === 'non-consumable' ||
          original.type === 'non-consumable'
      );
      return hasNoExpiry && isNonExpiring;
    };
    const effectiveExpiry = (item: NormalizedPurchase) =>
      isNonExpiringPurchase(item) ? Number.POSITIVE_INFINITY : (item.expiryDate ?? -1);
    const activeItems = items.filter(item => {
      if (item.expiryDate && item.expiryDate > now) return true;
      if (!item.expiryDate) {
        return isNonExpiringPurchase(item);
      }
      return false;
    });
    if (!activeItems.length) {
      return pickLatestPurchase(items);
    }
    return activeItems.reduce<NormalizedPurchase | null>((winner, candidate) => {
      if (!candidate) return winner;
      if (!winner) return candidate;
      const winnerMeta = getPlanMeta(winner.productId);
      const candidateMeta = getPlanMeta(candidate.productId);
      const winnerGroupPriority = winnerMeta.group === 'trainer' ? 2 : winnerMeta.group === 'player' ? 1 : 0;
      const candidateGroupPriority = candidateMeta.group === 'trainer' ? 2 : candidateMeta.group === 'player' ? 1 : 0;
      if (winnerGroupPriority !== candidateGroupPriority) {
        return candidateGroupPriority > winnerGroupPriority ? candidate : winner;
      }
      const winnerTierRank = winnerMeta.tierRank ?? -1;
      const candidateTierRank = candidateMeta.tierRank ?? -1;
      if (winnerTierRank !== candidateTierRank) {
        return candidateTierRank > winnerTierRank ? candidate : winner;
      }
      const winnerExpiry = effectiveExpiry(winner);
      const candidateExpiry = effectiveExpiry(candidate);
      if (candidateExpiry !== winnerExpiry) {
        return candidateExpiry > winnerExpiry ? candidate : winner;
      }
      return candidate.transactionDate > winner.transactionDate ? candidate : winner;
    }, null);
  }, [pickLatestPurchase]);

  const pruneHandledPurchaseEvents = () => {
    const ttlMs = 10 * 60 * 1000;
    const now = Date.now();
    const map = handledPurchaseEventsRef.current;
    for (const [key, ts] of map) {
      if (now - ts > ttlMs) map.delete(key);
    }
    if (map.size <= 100) return;
    const oldest = [...map.entries()].sort((a, b) => a[1] - b[1]);
    while (oldest.length > 100) {
      const [oldKey] = oldest.shift()!;
      map.delete(oldKey);
    }
  };

  const queueRefreshAfterPurchase = useCallback((targetSku: string | null) => {
    if (!targetSku) return Promise.resolve();
    if (refreshAfterPurchasePromiseRef.current) {
      return refreshAfterPurchasePromiseRef.current;
    }
    const runner = (async () => {
      const delays = [0, 300, 800, 1500, 2500];
      for (const delay of delays) {
        if (delay) await sleep(delay);
        try {
          await refreshSubscriptionStatus({ force: true });
        } catch (error) {
          console.warn('[AppleIAP] queueRefreshAfterPurchase failed', error);
        }
        const currentProductId = subscriptionStatusRef.current?.productId ?? null;
        const pendingProductId = pendingPlanRef.current?.productId ?? null;
        if (currentProductId === targetSku || pendingProductId === targetSku) {
          break;
        }
      }
    })();
    refreshAfterPurchasePromiseRef.current = runner.finally(() => {
      refreshAfterPurchasePromiseRef.current = null;
    });
    return refreshAfterPurchasePromiseRef.current;
  }, [refreshSubscriptionStatus]);

  const persistAppleEntitlements = async ({
    productId,
    receipt,
    reason,
  }: {
    productId: string;
    receipt: string | null;
    reason: string;
  }) => {
    const tier = subscriptionTierFromSku(productId);
    if (!tier) {
      if (__DEV__) {
        console.log('[AppleIAP] Skipping entitlement persist – unknown tier for sku', productId);
      }
      setVerifiedActiveProductId(null);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      console.warn('[AppleIAP] Cannot persist entitlements without authenticated user');
      setVerifiedActiveProductId(null);
      return;
    }

    try {
      setVerifying(true);
      console.log('[AppleIAP] FLOW PROFILE_UPSERT_START', {
        userId: user.id,
        productId,
        subscriptionTier: tier,
        reason,
      });

      const result = await syncEntitlementsSnapshot({
        userId: user.id,
        productId,
        subscriptionTier: tier,
        receipt,
        source: reason,
      });

      console.log('[AppleIAP] FLOW PURCHASE_VERIFY_RESULT', {
        userId: user.id,
        productId,
        subscriptionTier: tier,
        reason,
        success: result.success,
        resolvedRole: result.resolvedRole,
        roleChanged: result.roleChanged,
        profileError: result.profileError ?? null,
        roleError: result.roleError ?? null,
      });

      console.log('[AppleIAP] FLOW PROFILE_UPSERT_DONE', {
        userId: user.id,
        subscription_product_id: productId,
        subscription_tier: tier,
        roleChanged: result.roleChanged,
      });

      if (result.success) {
        setVerifiedActiveProductId(productId);
      } else {
        setVerifiedActiveProductId(null);
        console.warn('[AppleIAP] Entitlement persistence reported errors', {
          productId,
          reason,
          profileError: result.profileError,
          roleError: result.roleError,
        });
      }
    } catch (error) {
      setVerifiedActiveProductId(null);
      console.error('[AppleIAP] Entitlement persistence failed', error, { productId, reason });
    } finally {
      setVerifying(false);
    }
  };

  const entitlementSnapshot = useMemo(() => {
    const resolving =
      Platform.OS === 'ios'
        ? loading || isRestoring || verifying || (!iapReady && !isExpoGo)
        : loading;
    const hasActiveSubscription = Boolean(effectiveSubscriptionTier);
    return {
      resolving,
      hasActiveSubscription,
      activeProductId: verifiedActiveProductId ?? appleActiveSku ?? null,
      subscriptionTier: effectiveSubscriptionTier,
      isEntitled: hasActiveSubscription,
    };
  }, [appleActiveSku, effectiveSubscriptionTier, iapReady, isRestoring, loading, verifying, verifiedActiveProductId]);

  const lastEntitlementSignatureRef = useRef<string | null>(null);
  useEffect(() => {
    const signature = JSON.stringify(entitlementSnapshot);
    if (signature !== lastEntitlementSignatureRef.current) {
      lastEntitlementSignatureRef.current = signature;
      console.log('[Entitlements] SNAPSHOT', entitlementSnapshot);
    }
  }, [entitlementSnapshot]);

  useEffect(() => {
    if (!ingestAppleEntitlements) return;
    ingestAppleEntitlements({
      resolving: entitlementSnapshot.resolving,
      isEntitled: entitlementSnapshot.isEntitled,
      activeProductId: entitlementSnapshot.activeProductId,
      subscriptionTier: entitlementSnapshot.subscriptionTier,
    });
  }, [entitlementSnapshot, ingestAppleEntitlements]);

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
        isRestoring,
        entitlementSnapshot,
        verifiedActiveProductId,
        verifying,
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


