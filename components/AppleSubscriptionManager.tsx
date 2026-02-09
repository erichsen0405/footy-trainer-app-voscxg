/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, Alert, Linking, ScrollView } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAppleIAP, PRODUCT_IDS, ORDERED_PRODUCT_IDS, TRAINER_PRODUCT_IDS } from '@/contexts/AppleIAPContext';
import { formatPrice } from '@/utils/formatPrice';

interface AppleSubscriptionManagerProps {
  onPlanSelected?: (productId: string) => void;
  isSignupFlow?: boolean;
  selectedRole?: 'player' | 'trainer' | null;
  highlightProductId?: string;
  forceShowPlans?: boolean;
  onPurchaseStarted?: () => void;
  onPurchaseFinished?: (success: boolean) => void;
  transparentBackground?: boolean;
}

type PlanType =
  | 'player_basic'
  | 'player_premium'
  | 'trainer_basic'
  | 'trainer_standard'
  | 'trainer_premium'
  | 'unknown';

type FeatureStatus = 'included' | 'locked';

interface PlanFeature {
  label: string;
  status: FeatureStatus;
}

const THIRTY_SECONDS_MS = 30 * 1000;
const PRIVACY_POLICY_URL = 'https://footballcoach.online/privacy';
const APPLE_STANDARD_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

const getPlanTypeFromProductId = (productId: string): PlanType => {
  switch (productId) {
    case PRODUCT_IDS.PLAYER_BASIC:
      return 'player_basic';
    case PRODUCT_IDS.PLAYER_PREMIUM:
      return 'player_premium';
    case PRODUCT_IDS.TRAINER_BASIC:
      return 'trainer_basic';
    case PRODUCT_IDS.TRAINER_STANDARD:
      return 'trainer_standard';
    case PRODUCT_IDS.TRAINER_PREMIUM:
      return 'trainer_premium';
    default:
      return 'unknown';
  }
};

const trialFeature = (): PlanFeature => ({ label: '14 dages gratis prøveperiode', status: 'included' });
const cancelFeature = (): PlanFeature => ({ label: 'Opsig når som helst via App Store', status: 'included' });

const getPlanFeatures = (productId: string, maxPlayers: number): PlanFeature[] => {
  const planType = getPlanTypeFromProductId(productId);
  const capacityFeature: PlanFeature = {
    label: maxPlayers <= 1 ? 'Personlig spiller konto' : `Op til ${maxPlayers} spillere`,
    status: 'included',
  };

  const playerBasicFeatures: PlanFeature[] = [
    { label: 'Daglige aktiviteter og mål', status: 'included' },
    { label: 'Progression og statistik', status: 'included' },
    { label: 'Bibliotek', status: 'locked' },
    { label: 'Kalender-synk', status: 'locked' },
    { label: 'Træner-tilknytning', status: 'locked' },
  ];

  const playerPremiumFeatures: PlanFeature[] = [
    { label: 'Bibliotek', status: 'included' },
    { label: 'Kalender-synk', status: 'included' },
    { label: 'Træner-tilknytning', status: 'included' },
    { label: 'Alt fra Basis spiller', status: 'included' },
  ];

  const trainerFeatures: PlanFeature[] = [
    { label: 'Fuld adgang til FootballCoach værktøjer', status: 'included' },
    { label: 'Planlægning, bibliotek og rapporter', status: 'included' },
  ];

  if (planType === 'player_basic') return [capacityFeature, ...playerBasicFeatures, trialFeature(), cancelFeature()];
  if (planType === 'player_premium') return [capacityFeature, ...playerPremiumFeatures, trialFeature(), cancelFeature()];
  if (planType.startsWith('trainer')) return [capacityFeature, ...trainerFeatures, trialFeature(), cancelFeature()];
  return [capacityFeature, { label: 'Fuld adgang til alle funktioner', status: 'included' }, trialFeature(), cancelFeature()];
};

const getPlanName = (product: { productId: string }) => {
  switch (getPlanTypeFromProductId(product.productId)) {
    case 'player_basic':
      return 'Basis spiller';
    case 'player_premium':
      return 'Premium spiller';
    case 'trainer_basic':
      return 'Træner Basis';
    case 'trainer_standard':
      return 'Træner Standard';
    case 'trainer_premium':
      return 'Træner Premium';
    default:
      return product.productId;
  }
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const daDateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Copenhagen',
});
const daDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Copenhagen',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const toCopenhagenStartOfDayMs = (date: Date) => {
  const parts = daDatePartsFormatter.formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? Date.UTC(year, month - 1, day)
    : NaN;
};

const formatDateDa = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return daDateFormatter.format(date);
};

const getDaysRemaining = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = toCopenhagenStartOfDayMs(date) - toCopenhagenStartOfDayMs(new Date());
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.round(diff / MS_PER_DAY));
};

type AppleSubscriptionStatus = ReturnType<typeof useAppleIAP>['subscriptionStatus'];
type AppleRenewalSummary = {
  isTrial: boolean;
  primaryDate: string | null;
  renewalDate: string | null;
  daysRemaining: number | null;
};

const dateStringsEqual = (a?: string | null, b?: string | null) => {
  if (!a || !b) return false;
  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
    return a.trim() === b.trim();
  }
  return aTime === bTime;
};

const buildAppleRenewalSummary = (status: AppleSubscriptionStatus | null | undefined): AppleRenewalSummary => {
  const raw = (status as Record<string, any>) || null;
  const trialEnd = raw?.trialEndDate ?? raw?.trialEnd ?? raw?.trialEndsAt ?? null;
  const renewalDate =
    raw?.renewalDate ??
    raw?.expiryDate ??
    raw?.expirationDate ??
    raw?.expiration_at ??
    trialEnd ??
    null;
  const isTrial =
    Boolean(
      raw?.isTrialPeriod ||
        raw?.isTrial ||
        raw?.periodType === 'trial' ||
        raw?.status === 'trial'
    ) && Boolean(trialEnd);
  const primaryDate = isTrial ? trialEnd : renewalDate;
  return {
    isTrial,
    primaryDate,
    renewalDate,
    daysRemaining: primaryDate ? getDaysRemaining(primaryDate) : null,
  };
};

export default function AppleSubscriptionManager({
  onPlanSelected,
  isSignupFlow = false,
  selectedRole = null,
  highlightProductId,
  forceShowPlans = false,
  onPurchaseStarted,
  onPurchaseFinished,
  transparentBackground = false,
}: AppleSubscriptionManagerProps) {
  const {
    products,
    subscriptionStatus,
    loading,
    purchasing,
    purchaseSubscription,
    restorePurchases,
    iapReady,
    ensureIapReady,
    iapDiagnostics,
    refetchProducts,
    iapUnavailableReason,
    pendingProductId,
    pendingEffectiveDate,
    refreshSubscriptionStatus,
    hasComplimentaryPlayerPremium,
    hasComplimentaryTrainerPremium,
    isRestoring,
    entitlementSnapshot,
  } = useAppleIAP();
  const entitlementSnapshotRef = useRef(entitlementSnapshot);
  useEffect(() => {
    entitlementSnapshotRef.current = entitlementSnapshot;
  }, [entitlementSnapshot]);
  const pendingProductIdRef = useRef<string | null>(pendingProductId ?? null);
  useEffect(() => {
    pendingProductIdRef.current = pendingProductId ?? null;
  }, [pendingProductId]);
  const trainerUpgradeAlertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trainerUpgradeTargetRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (trainerUpgradeAlertTimeoutRef.current) {
        clearTimeout(trainerUpgradeAlertTimeoutRef.current);
        trainerUpgradeAlertTimeoutRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!trainerUpgradeAlertTimeoutRef.current) return;
    const targetSku = trainerUpgradeTargetRef.current;
    if (!targetSku) return;
    if (
      entitlementSnapshot?.activeProductId === targetSku ||
      pendingProductIdRef.current === targetSku
    ) {
      clearTimeout(trainerUpgradeAlertTimeoutRef.current);
      trainerUpgradeAlertTimeoutRef.current = null;
      trainerUpgradeTargetRef.current = null;
    }
  }, [entitlementSnapshot?.activeProductId, pendingProductId]);

  type AppleProduct = (typeof products)[number];

  const getProductCurrency = useCallback(
    (product: AppleProduct) =>
      product?.currency ?? product?.priceCurrencyCode ?? product?.priceLocale?.currencyCode ?? 'DKK',
    [],
  );

  const getProductPriceLabel = useCallback(
    (product: AppleProduct) => {
      const value = (product?.price ?? product?.localizedPrice) as number | string | null;
      return formatPrice(value, getProductCurrency(product));
    },
    [getProductCurrency],
  );

  const trainerProductSet = useMemo(() => new Set(TRAINER_PRODUCT_IDS), []);
  const hasApplePlayerPremium = subscriptionStatus?.isActive && subscriptionStatus.productId === PRODUCT_IDS.PLAYER_PREMIUM;
  const hasAppleTrainerPlan =
    subscriptionStatus?.isActive && !!subscriptionStatus.productId && trainerProductSet.has(subscriptionStatus.productId);
  const showComplimentaryPlayerBanner = hasComplimentaryPlayerPremium && !hasApplePlayerPremium;
  const showComplimentaryTrainerBanner = hasComplimentaryTrainerPremium && !hasAppleTrainerPlan;
  const complimentaryPlanProductId = hasComplimentaryTrainerPremium
    ? PRODUCT_IDS.TRAINER_PREMIUM
    : hasComplimentaryPlayerPremium
      ? PRODUCT_IDS.PLAYER_PREMIUM
      : null;
  const hasComplimentaryActive = Boolean(complimentaryPlanProductId);

  const isComplimentaryForProduct = useCallback(
    (productId: string) => {
      if (productId === PRODUCT_IDS.PLAYER_PREMIUM) return hasComplimentaryPlayerPremium;
      if (trainerProductSet.has(productId)) return hasComplimentaryTrainerPremium;
      return false;
    },
    [hasComplimentaryPlayerPremium, hasComplimentaryTrainerPremium, trainerProductSet]
  );

  const isPlanLockedByComplimentary = useCallback(
    (productId: string) => {
      if (productId === PRODUCT_IDS.PLAYER_PREMIUM) return hasComplimentaryPlayerPremium;
      if (trainerProductSet.has(productId)) return hasComplimentaryTrainerPremium;
      return false;
    },
    [hasComplimentaryPlayerPremium, hasComplimentaryTrainerPremium, trainerProductSet]
  );

  const [showPlans, setShowPlans] = useState(true);
  const [isOrangeBoxExpanded, setIsOrangeBoxExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const hasRequestedProductsRef = useRef(false);
  const skeletonItems = useMemo(() => ['skeleton-0', 'skeleton-1', 'skeleton-2'], []);
  const blockInteractions = purchasing || refreshing || loading || isRestoring;
  const effectivePlanProductId = hasComplimentaryActive
    ? complimentaryPlanProductId
    : subscriptionStatus?.isActive
      ? subscriptionStatus.productId
      : null;
  const hasAnyActivePlan = Boolean(subscriptionStatus?.isActive || hasComplimentaryActive);
  const activePlanProductId = effectivePlanProductId;

  const resetCheckoutUi = useCallback(() => {
    setIsOrangeBoxExpanded(false);
    setShowPlans(true);
    setRefreshing(false);
    hasRequestedProductsRef.current = false;
  }, []);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const planCardBgColor = isDark ? '#1d1d1f' : '#ffffff';
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;
  const containerBgColor = transparentBackground ? 'transparent' : planCardBgColor;

  const planOrder = useMemo(() => {
    return ORDERED_PRODUCT_IDS.reduce<Record<string, number>>((acc, id, index) => {
      acc[id] = index;
      return acc;
    }, {});
  }, []);

  const sortedProducts = useMemo(() => {
    const list = Array.isArray(products) ? [...products] : [];

    const predicate =
      isSignupFlow && selectedRole
        ? selectedRole === 'player'
          ? (plan: AppleProduct) => (plan.maxPlayers ?? 1) <= 1
          : (plan: AppleProduct) => (plan.maxPlayers ?? 1) > 1
        : null;

    const preferredRank = (plan: AppleProduct) => {
      if (!predicate) return 0;
      return predicate(plan) ? 0 : 1;
    };

    const orderRank = (plan: AppleProduct) => planOrder[plan.productId] ?? Number.MAX_SAFE_INTEGER;

    return list.sort((a, b) => {
      const prefDiff = preferredRank(a) - preferredRank(b);
      if (prefDiff !== 0) return prefDiff;
      return orderRank(a) - orderRank(b);
    });
  }, [isSignupFlow, planOrder, products, selectedRole]);

  const handleSelectPlan = useCallback(
    async (productId: string) => {
      if (purchasing) {
        Alert.alert('Vent lidt', 'Der behandles allerede et køb.');
        return;
      }
      if (!iapReady) {
        const ready = await ensureIapReady();
        if (!ready) {
          const reason = iapUnavailableReason ?? 'Forbinder til App Store – prøv igen om et øjeblik.';
          Alert.alert('App Store ikke klar', reason);
          return;
        }
      }
      let success = false;
      await safeInvoke(onPurchaseStarted);
      try {
        await purchaseSubscription(productId);
        success = true;
        if (Platform.OS === 'ios' && trainerProductSet.has(productId)) {
          const targetSku = productId;
          if (trainerUpgradeAlertTimeoutRef.current) {
            clearTimeout(trainerUpgradeAlertTimeoutRef.current);
            trainerUpgradeAlertTimeoutRef.current = null;
          }
          trainerUpgradeTargetRef.current = targetSku;
          trainerUpgradeAlertTimeoutRef.current = setTimeout(() => {
            const activeSku = entitlementSnapshotRef.current?.activeProductId ?? null;
            const pendingSku = pendingProductIdRef.current ?? null;
            if (activeSku === targetSku || pendingSku === targetSku) {
              if (trainerUpgradeAlertTimeoutRef.current) {
                clearTimeout(trainerUpgradeAlertTimeoutRef.current);
                trainerUpgradeAlertTimeoutRef.current = null;
              }
              trainerUpgradeTargetRef.current = null;
              return;
            }
            trainerUpgradeTargetRef.current = null;
            Alert.alert(
              'Skift abonnement',
              'Hvis App Store ikke viste en bekræftelse, kan du åbne Abonnementer og skifte derfra.',
              [
                {
                  text: 'Åbn App Store',
                  onPress: async () => {
                    try {
                      const url = 'itms-apps://apps.apple.com/account/subscriptions';
                      const supported = await Linking.canOpenURL(url);
                      if (!supported) throw new Error('unsupported');
                      await Linking.openURL(url);
                    } catch {
                      Alert.alert('Kunne ikke åbne App Store', 'Prøv igen senere.');
                    }
                  },
                },
                { text: 'OK', style: 'cancel' },
              ],
            );
          }, 8000);
        }
        resetCheckoutUi();
        await safeInvoke(onPlanSelected, productId);
      } catch (error) {
        console.warn('[AppleSubscriptionManager] Purchase failed', error);
        const errorCode = (error as any)?.code;
        if (errorCode === 'E_USER_CANCELLED') {
          return;
        }
        if (errorCode === 'already-owned' || errorCode === 'E_ALREADY_OWNED') {
          try {
            const { restoredCount } = await restorePurchases();
            await refreshSubscriptionStatus({ force: true, reason: 'already_owned' });
            await new Promise(resolve => setTimeout(resolve, 250));
            const hasEntitlement = Boolean(entitlementSnapshotRef.current?.hasActiveSubscription);
            if (restoredCount > 0 || hasEntitlement) {
              resetCheckoutUi();
              success = true;
              await safeInvoke(onPlanSelected, productId);
              Alert.alert(
                'Abonnement allerede aktivt',
                restoredCount > 0
                  ? 'Vi har gendannet dit køb.'
                  : 'Dit abonnement er allerede aktivt. Du kan fortsætte.'
              );
              return;
            }
            Alert.alert(
              'Abonnement allerede aktivt',
              'Vi kunne ikke gendanne et aktivt køb. Prøv at gendanne igen eller tjek dit Apple-abonnement.'
            );
            return;
          } catch (restoreError) {
            console.warn('[AppleSubscriptionManager] Auto-restore failed after already-owned', restoreError);
          }
        }
        const details = buildIapErrorDetails(error);
        Alert.alert('Køb fejlede', `${details.message}\n(Kode: ${details.code})`);
      } finally {
        await safeInvoke(onPurchaseFinished, success);
      }
    },
    [
      iapReady,
      onPlanSelected,
      onPurchaseFinished,
      onPurchaseStarted,
      ensureIapReady,
      iapUnavailableReason,
      purchaseSubscription,
      purchasing,
      pendingProductId,
      refreshSubscriptionStatus,
      resetCheckoutUi,
      restorePurchases,
      trainerProductSet,
    ]
  );

  const handleRestorePurchases = useCallback(async () => {
    if (blockInteractions) {
      Alert.alert(
        'Vent lidt',
        purchasing ? 'Der behandles allerede et køb.' : 'Forbinder til App Store – prøv igen om et øjeblik.',
      );
      return;
    }
    let success = false;
    await safeInvoke(onPurchaseStarted);
    try {
      const { restoredCount } = await restorePurchases();
      const title = restoredCount > 0 ? 'Køb gendannet! ✅' : 'Ingen køb fundet';
      const message =
        restoredCount > 0
          ? 'Dine tidligere køb er blevet gendannet.'
          : 'Der blev ikke fundet nogen tidligere køb at gendanne.';
      Alert.alert(title, message);
      resetCheckoutUi();
      success = restoredCount > 0;
    } catch (error) {
      console.warn('[AppleSubscriptionManager] Restore failed', error);
      const details = buildIapErrorDetails(error);
      Alert.alert('Gendan køb fejlede', `${details.message}\n(Kode: ${details.code})`);
    } finally {
      await safeInvoke(onPurchaseFinished, success);
    }
  }, [blockInteractions, purchasing, onPurchaseFinished, onPurchaseStarted, resetCheckoutUi, restorePurchases]);

  const executeProductRefresh = useCallback(async () => {
    await ensureIapReady();
    await refetchProducts();
    await refreshSubscriptionStatus({ force: true });
  }, [ensureIapReady, refetchProducts, refreshSubscriptionStatus]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await executeProductRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [executeProductRefresh]);

  const handleRetry = useCallback(() => {
    void handleRefresh();
  }, [handleRefresh]);

  const openLegalLink = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) throw new Error('unsupported');
      await Linking.openURL(url);
    } catch {
      Alert.alert('Kunne ikke åbne link', 'Prøv igen senere.');
    }
  }, []);

  const getPlanIcon = (productId: string) => {
    const planType = getPlanTypeFromProductId(productId);
    switch (planType) {
      case 'player_premium':
      case 'trainer_premium':
        return 'star.circle.fill';
      case 'trainer_standard':
        return 'star.leadinghalf.filled';
      default:
        return 'star.fill';
    }
  };

  const getPlanColor = (productId: string) => {
    const planType = getPlanTypeFromProductId(productId);
    switch (planType) {
      case 'player_basic':
      case 'trainer_basic':
        return '#CD7F32';
      case 'trainer_standard':
        return '#C0C0C0';
      case 'player_premium':
      case 'trainer_premium':
        return '#FFD700';
      default:
        return colors.primary;
    }
  };

  const isCurrentPlan = useCallback(
    (productId: string): boolean => Boolean(effectivePlanProductId && effectivePlanProductId === productId),
    [effectivePlanProductId],
  );

  useEffect(() => {
    if (!isSignupFlow && !hasComplimentaryActive && !subscriptionStatus?.isActive) {
      setShowPlans(true);
    }
  }, [hasComplimentaryActive, isSignupFlow, subscriptionStatus?.isActive]);

  useEffect(() => {
    if (hasComplimentaryActive && !forceShowPlans) {
      setShowPlans(false);
    }
  }, [forceShowPlans, hasComplimentaryActive]);

  useEffect(() => {
    if (forceShowPlans) {
      setShowPlans(true);
    }
  }, [forceShowPlans]);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      ensureIapReady().catch(() => {});
    }
  }, [ensureIapReady]);

  const shouldRefetchProducts = useCallback(() => {
    if (!iapDiagnostics?.lastFetchAt) {
      return true;
    }
    const lastFetchAtMs = new Date(iapDiagnostics.lastFetchAt).getTime();
    if (Number.isNaN(lastFetchAtMs)) {
      return true;
    }
    return Date.now() - lastFetchAtMs > THIRTY_SECONDS_MS;
  }, [iapDiagnostics?.lastFetchAt]);

  useEffect(() => {
    if (!showPlans) {
      return;
    }
    let cancelled = false;

    const ensureData = async () => {
      try {
        const ready = await ensureIapReady();
        if (!ready || cancelled) {
          return;
        }
        if (shouldRefetchProducts()) {
          await refetchProducts();
          if (cancelled) {
            return;
          }
        }
        await refreshSubscriptionStatus();
      } catch (error) {
        console.warn('[AppleSubscriptionManager] Auto refresh failed', error);
      }
    };

    ensureData();
    return () => {
      cancelled = true;
    };
  }, [showPlans, ensureIapReady, shouldRefetchProducts, refetchProducts, refreshSubscriptionStatus]);

  useEffect(() => {
    if (!showPlans) {
      hasRequestedProductsRef.current = false;
      return;
    }

    if (
      iapReady &&
      !loading &&
      !purchasing &&
      products.length === 0 &&
      !hasRequestedProductsRef.current
    ) {
      hasRequestedProductsRef.current = true;
      refetchProducts();
    }
  }, [showPlans, iapReady, loading, purchasing, products.length, refetchProducts]);

  const renderPendingDowngrade = useCallback(() => {
    if (!pendingProductId || !pendingEffectiveDate) return null;
    return (
      <Text style={styles.pendingDowngradeText}>
        Skifter til {getPlanName({ productId: pendingProductId })} ved næste fornyelse (
        {formatDateDa(pendingEffectiveDate)})
      </Text>
    );
  }, [pendingEffectiveDate, pendingProductId]);

  const appleRenewalSummary = useMemo(
    () => buildAppleRenewalSummary(subscriptionStatus),
    [subscriptionStatus],
  );
  const showTrialFollowUp =
    appleRenewalSummary.isTrial &&
    !!appleRenewalSummary.renewalDate &&
    !dateStringsEqual(appleRenewalSummary.renewalDate, appleRenewalSummary.primaryDate);
  const showComplimentaryCurrentPlan =
    !isSignupFlow && hasComplimentaryActive && Boolean(activePlanProductId);
  const showAppleCurrentPlan =
    !isSignupFlow && !hasComplimentaryActive && Boolean(subscriptionStatus?.isActive && subscriptionStatus.productId);

  const renderPlanItem = useCallback(
    (item: (typeof products)[number], index: number) => {
      const isPopular = index === Math.floor(sortedProducts.length / 2);
      const isCurrentActive = isCurrentPlan(item.productId);
      const isHighlightTarget = highlightProductId === item.productId;
      const features = getPlanFeatures(item.productId, item.maxPlayers || 1);
      const disabledByComplimentary = isPlanLockedByComplimentary(item.productId);
      const priceLabel = getProductPriceLabel(item);

      return (
        <TouchableOpacity
          key={item.productId}
          style={[
            styles.planCard,
            { backgroundColor: planCardBgColor },
            isPopular && !isCurrentActive && styles.popularPlan,
            isCurrentActive && styles.currentPlanCard,
            isHighlightTarget && styles.highlightedPlan,
            (blockInteractions || disabledByComplimentary) && styles.disabledCard,
          ]}
          onPress={() => handleSelectPlan(item.productId)}
          disabled={blockInteractions || isCurrentActive || disabledByComplimentary}
          activeOpacity={0.7}
        >
          {isComplimentaryForProduct(item.productId) && (
            <View style={[styles.partnerBadge, { backgroundColor: colors.secondary }]}>
              <Text style={styles.partnerBadgeText}>Partner-adgang</Text>
            </View>
          )}
          {isPopular && !isCurrentActive && (
            <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.popularBadgeText}>Mest populær</Text>
            </View>
          )}
          {isCurrentActive && (
            <View style={[styles.currentBadge, { backgroundColor: colors.success }]}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check_circle"
                size={16}
                color="#fff"
              />
              <Text style={styles.currentBadgeText}>Dit aktive abonnement</Text>
            </View>
          )}
          <View style={styles.planHeader}>
            <Text style={[styles.planName, { color: textColor }]}>{getPlanName(item)}</Text>
            {isCurrentActive && (
              <View style={styles.activeIndicatorCircle}>
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={20}
                  color="#fff"
                />
              </View>
            )}
          </View>
          <View style={styles.priceContainer}>
            <Text
              style={[
                styles.price,
                { color: isCurrentActive ? colors.success : colors.primary },
              ]}
            >
              {priceLabel}
            </Text>
            <Text style={[styles.priceUnit, { color: textSecondaryColor }]}>/ måned</Text>
          </View>
          <View style={styles.featuresContainer}>
            {features.map((feature, featureIndex) => {
              const isIncluded = feature.status === 'included';
              const iconColor = isIncluded
                ? isCurrentActive
                  ? colors.success
                  : colors.primary
                : colors.error;
              return (
                <View
                  style={styles.featureRow}
                  key={`${item.productId}-feature-${featureIndex}`}
                >
                  <IconSymbol
                    ios_icon_name={isIncluded ? 'checkmark.circle.fill' : 'xmark.circle'}
                    android_material_icon_name={isIncluded ? 'check_circle' : 'block'}
                    size={20}
                    color={iconColor}
                  />
                  <Text
                    style={[
                      styles.featureText,
                      { color: isIncluded ? textColor : textSecondaryColor },
                      !isIncluded && styles.lockedFeatureText,
                    ]}
                  >
                    {feature.label}
                  </Text>
                </View>
              );
            })}
          </View>
          {!isCurrentActive && (
            <TouchableOpacity
              style={[
                styles.selectButton,
                { backgroundColor: isPopular ? colors.primary : colors.highlight },
                (blockInteractions || disabledByComplimentary) && { opacity: 0.6 },
              ]}
              onPress={() => handleSelectPlan(item.productId)}
              disabled={blockInteractions || disabledByComplimentary}
            >
              {purchasing ? (
                <ActivityIndicator color={isPopular ? '#fff' : colors.primary} size="small" />
              ) : (
                <Text
                  style={[
                    styles.selectButtonText,
                    { color: isPopular ? '#fff' : colors.primary },
                  ]}
                >
                  {isSignupFlow ? 'Vælg denne plan' : 'Skift til denne plan'}
                </Text>
              )}
            </TouchableOpacity>
          )}
          {isCurrentActive && (
            <View style={[styles.currentPlanIndicator, { backgroundColor: colors.success }]}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check_circle"
                size={20}
                color="#fff"
              />
              <Text style={styles.currentPlanIndicatorText}>Din aktive plan</Text>
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [
      blockInteractions,
      planCardBgColor,
      getProductPriceLabel,
      handleSelectPlan,
      highlightProductId,
      isComplimentaryForProduct,
      isCurrentPlan,
      isPlanLockedByComplimentary,
      isSignupFlow,
      purchasing,
      sortedProducts.length,
      textColor,
      textSecondaryColor,
    ],
  );

  const renderListHeader = useCallback(() => (
    <View style={styles.listHeader}>
      {showComplimentaryPlayerBanner && (
        <View style={[styles.partnerBanner, { backgroundColor: colors.secondary }]}>
          <IconSymbol
            ios_icon_name="gift.fill"
            android_material_icon_name="redeem"
            size={20}
            color="#fff"
          />
          <Text style={styles.partnerBannerText}>Partner-adgang: Premium spiller</Text>
        </View>
      )}
      {showComplimentaryTrainerBanner && (
        <View style={[styles.partnerBanner, { backgroundColor: colors.primary }]}>
          <IconSymbol
            ios_icon_name="briefcase.fill"
            android_material_icon_name="workspace_premium"
            size={20}
            color="#fff"
          />
          <Text style={styles.partnerBannerText}>Partner-adgang: Træner Premium</Text>
        </View>
      )}
      {!isSignupFlow && !hasAnyActivePlan && (
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Vælg dit abonnement</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            Alle abonnementer inkluderer 14 dages gratis prøveperiode
          </Text>
        </View>
      )}
      {showComplimentaryCurrentPlan && (
        <View
          style={[
            styles.currentPlanBanner,
            { backgroundColor: getPlanColor(activePlanProductId) },
          ]}
        >
          <View style={styles.currentPlanContent}>
            <IconSymbol
              ios_icon_name={getPlanIcon(activePlanProductId)}
              android_material_icon_name="verified"
              size={32}
              color="#fff"
            />
            <View style={styles.currentPlanInfo}>
              <Text style={styles.currentPlanLabel}>Dit aktive abonnement:</Text>
              <Text style={styles.currentPlanName}>
                {getPlanName({ productId: activePlanProductId })}
              </Text>
              <Text style={styles.currentPlanDateSecondary}>Uendeligt (partner-adgang)</Text>
            </View>
            <View style={styles.currentPlanBadge}>
              <Text style={styles.currentPlanBadgeText}>Uendeligt</Text>
            </View>
          </View>
        </View>
      )}
      {showAppleCurrentPlan && (
        <TouchableOpacity
          style={[
            styles.currentPlanBanner,
            { backgroundColor: getPlanColor(subscriptionStatus.productId) },
          ]}
          onPress={() => setIsOrangeBoxExpanded(prev => !prev)}
          activeOpacity={0.8}
        >
          <View style={styles.currentPlanContent}>
            <IconSymbol
              ios_icon_name={getPlanIcon(subscriptionStatus.productId)}
              android_material_icon_name="verified"
              size={32}
              color="#fff"
            />
            <View style={styles.currentPlanInfo}>
              <Text style={styles.currentPlanLabel}>Dit aktive abonnement:</Text>
              <Text style={styles.currentPlanName}>
                {getPlanName({ productId: subscriptionStatus.productId })}
              </Text>
              {renderPendingDowngrade()}
            </View>
            <View style={styles.currentPlanBadge}>
              <Text style={styles.currentPlanBadgeText}>Aktiv</Text>
            </View>
          </View>
          {isOrangeBoxExpanded && (
            <View style={styles.orangeBoxExpandedContent}>
              <View style={styles.orangeBoxDivider} />
              {appleRenewalSummary.primaryDate ? (
                <View style={styles.orangeBoxDetailRow}>
                  <View style={styles.orangeBoxDetailItem}>
                    <IconSymbol
                      ios_icon_name="calendar"
                      android_material_icon_name="event"
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.orangeBoxDetailLabel}>
                      {appleRenewalSummary.isTrial ? 'Gratis prøveperiode til' : 'Fornyes'}
                    </Text>
                  </View>
                  <View style={styles.currentPlanDateMeta}>
                    <Text style={styles.currentPlanDatePrimary}>
                      {formatDateDa(appleRenewalSummary.primaryDate)}
                    </Text>
                    {appleRenewalSummary.daysRemaining !== null && (
                      <Text style={styles.currentPlanDateSecondary}>
                        {appleRenewalSummary.isTrial
                          ? `${appleRenewalSummary.daysRemaining} dage tilbage af prøveperioden`
                          : `${appleRenewalSummary.daysRemaining} dage tilbage`}
                      </Text>
                    )}
                  </View>
                </View>
              ) : null}

              {showTrialFollowUp ? (
                <View style={styles.orangeBoxDetailRow}>
                  <View style={styles.orangeBoxDetailItem}>
                    <IconSymbol
                      ios_icon_name="clock"
                      android_material_icon_name="schedule"
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.orangeBoxDetailLabel}>Herefter fornyes</Text>
                  </View>
                  <Text style={styles.orangeBoxDetailValue}>
                    {formatDateDa(appleRenewalSummary.renewalDate)}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
          <View style={styles.expandIndicator}>
            <IconSymbol
              ios_icon_name={isOrangeBoxExpanded ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={isOrangeBoxExpanded ? 'expand_less' : 'expand_more'}
              size={20}
              color="#fff"
            />
          </View>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[
          styles.restoreButton,
          { backgroundColor: cardBgColor },
          blockInteractions && styles.disabledButton,
        ]}
        onPress={handleRestorePurchases}
        activeOpacity={0.7}
        disabled={blockInteractions}
      >
        <IconSymbol
          ios_icon_name="arrow.clockwise"
          android_material_icon_name="restore"
          size={20}
          color={colors.primary}
        />
        <Text style={[styles.restoreButtonText, { color: colors.primary }]}>Gendan køb</Text>
      </TouchableOpacity>
      <View style={styles.legalLinksRow}>
        <TouchableOpacity
          style={styles.legalLinkButton}
          activeOpacity={0.6}
          onPress={() => openLegalLink(PRIVACY_POLICY_URL)}
        >
          <Text style={styles.legalLinkText}>Privatlivspolitik</Text>
        </TouchableOpacity>
        <View style={styles.legalLinkSeparator} />
        <TouchableOpacity
          style={styles.legalLinkButton}
          activeOpacity={0.6}
          onPress={() => openLegalLink(APPLE_STANDARD_EULA_URL)}
        >
          <Text style={styles.legalLinkText}>Vilkår (EULA)</Text>
        </TouchableOpacity>
      </View>
      {!isSignupFlow && (
        <TouchableOpacity
          style={[styles.expandButton, { backgroundColor: cardBgColor }]}
          onPress={() => setShowPlans(prev => !prev)}
          activeOpacity={0.7}
        >
          <View style={styles.expandButtonContent}>
            <IconSymbol
              ios_icon_name="list.bullet"
              android_material_icon_name="list"
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.expandButtonText, { color: textColor }]}>
              {showPlans ? 'Skjul abonnementer' : 'Se tilgængelige abonnementer'}
            </Text>
          </View>
          <IconSymbol
            ios_icon_name={showPlans ? 'chevron.up' : 'chevron.down'}
            android_material_icon_name={showPlans ? 'expand_less' : 'expand_more'}
            size={24}
            color={textSecondaryColor}
          />
        </TouchableOpacity>
      )}
    </View>
  ), [
    appleRenewalSummary,
    blockInteractions,
    cardBgColor,
    handleRestorePurchases,
    activePlanProductId,
    hasAnyActivePlan,
    hasComplimentaryActive,
    isOrangeBoxExpanded,
    isSignupFlow,
    openLegalLink,
    renderPendingDowngrade,
    setShowPlans,
    showComplimentaryPlayerBanner,
    showComplimentaryTrainerBanner,
    showComplimentaryCurrentPlan,
    showAppleCurrentPlan,
    showPlans,
    showTrialFollowUp,
    subscriptionStatus,
    textColor,
    textSecondaryColor,
  ]);

  const renderListFooter = useCallback(() => (
    <View style={styles.footerSpacing}>
      <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a2a' : '#e3f2fd' }]}>
        <IconSymbol
          ios_icon_name="info.circle.fill"
          android_material_icon_name="info"
          size={24}
          color={colors.secondary}
        />
        <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
          Abonnementer håndteres via App Store. Du kan opsige når som helst i dine App Store
          indstillinger.{'\n\n'}Alle abonnementer inkluderer 14 dages gratis prøveperiode.
        </Text>
      </View>
    </View>
  ), [isDark]);

  const fetchErrorMessage = iapUnavailableReason ?? iapDiagnostics?.lastFetchError ?? null;
  const hasProducts = showPlans && sortedProducts.length > 0;
  const showSkeletonState =
    showPlans && !hasProducts && (loading || (!iapReady && Platform.OS === 'ios'));
  const showErrorState = showPlans && !hasProducts && !loading && !!fetchErrorMessage;
  const showEmptyState = showPlans && !hasProducts && !loading && !fetchErrorMessage;

  if (Platform.OS !== 'ios') {
    return (
      <View style={styles.notAvailableContainer}>
        <IconSymbol
          ios_icon_name="exclamationmark.triangle.fill"
          android_material_icon_name="warning"
          size={48}
          color={colors.warning}
        />
        <Text style={[styles.notAvailableTitle, { color: textColor }]}>Ikke tilgængelig</Text>
        <Text style={[styles.notAvailableText, { color: textSecondaryColor }]}>
          Apple In-App Purchases er kun tilgængelige på iOS enheder.
        </Text>
      </View>
    );
  }

  let plansContent: React.ReactNode = null;
  if (showPlans) {
    if (showSkeletonState) {
      plansContent = (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.stateTitle}>Forbinder til App Store…</Text>
          <View style={styles.skeletonList}>
            {skeletonItems.map(key => (
              <View
                key={key}
                style={[styles.planCard, { backgroundColor: planCardBgColor }, styles.skeletonCard]}
              >
                <View style={[styles.skeletonLine, { width: '60%', height: 28 }]} />
                <View style={[styles.skeletonLine, { width: '40%', height: 20 }]} />
                <View style={styles.skeletonLine} />
                <View style={styles.skeletonLine} />
              </View>
            ))}
          </View>
        </View>
      );
    } else if (showErrorState && fetchErrorMessage) {
      plansContent = (
        <View style={styles.stateContainer}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={32}
            color={colors.error}
          />
          <Text style={styles.stateTitle}>Kunne ikke hente abonnementer</Text>
          <Text style={styles.stateText}>{fetchErrorMessage}</Text>
          <TouchableOpacity
            style={[
              styles.stateButton,
              (purchasing || refreshing) && styles.disabledButton,
            ]}
            onPress={handleRetry}
            activeOpacity={0.8}
            disabled={purchasing || refreshing}
          >
            {refreshing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.stateButtonText}>Prøv igen</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    } else if (showEmptyState) {
      plansContent = (
        <View style={styles.stateContainer}>
          <IconSymbol
            ios_icon_name="tray"
            android_material_icon_name="inbox"
            size={32}
            color={colors.textSecondary}
          />
          <Text style={styles.stateTitle}>Ingen abonnementer fundet</Text>
          <Text style={styles.stateText}>Træk ned for at opdatere eller tryk “Prøv igen”.</Text>
          <TouchableOpacity
            style={[
              styles.stateButton,
              (purchasing || refreshing) && styles.disabledButton,
            ]}
            onPress={handleRetry}
            activeOpacity={0.8}
            disabled={purchasing || refreshing}
          >
            {refreshing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.stateButtonText}>Prøv igen</Text>
            )}
          </TouchableOpacity>
        </View>
      );
    } else if (hasProducts) {
      plansContent = (
        <View style={styles.planList}>
          {sortedProducts.map((product, index) => renderPlanItem(product, index))}
        </View>
      );
    }
  }

  const content = (
    <>
      {renderListHeader()}
      {plansContent}
      {showPlans ? renderListFooter() : null}
    </>
  );

  if (isSignupFlow) {
    return (
      <View style={[styles.container, styles.scrollContent, { backgroundColor: containerBgColor }]}>
        {content}
      </View>
    );
  }

  return <View style={[styles.container, styles.scrollContent, { backgroundColor: containerBgColor }]}>{content}</View>;
}

const safeInvoke = async <T extends any[]>(
  fn: ((...args: T) => any) | undefined,
  ...args: T
) => {
  try {
    await Promise.resolve(fn?.(...args));
  } catch (error) {
    console.warn('[AppleSubscriptionManager] callback error', error);
  }
};

const buildIapErrorDetails = (error: unknown) => {
  const err = error as Record<string, any>;
  const code =
    typeof err?.code === 'string'
      ? err.code
      : typeof err?.name === 'string'
      ? err.name
      : 'ukendt';
  const rawMessage =
    typeof err?.reason === 'string'
      ? err.reason
      : typeof err?.message === 'string'
      ? err.message
      : null;
  let serialized = rawMessage;
  if (!serialized) {
    try {
      serialized = JSON.stringify(err);
    } catch {
      serialized = null;
    }
  }
  return {
    code,
    message: serialized && serialized !== '{}' ? serialized : 'Prøv igen om lidt.',
  };
};

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  scrollContent: { gap: 12, paddingBottom: 12 },
  loadingContainer: { alignItems: 'center', gap: 12, paddingVertical: 24 },
  loadingText: { fontSize: 14, color: colors.textSecondary },
  notAvailableContainer: { alignItems: 'center', gap: 12, padding: 24 },
  notAvailableTitle: { fontSize: 20, fontWeight: '700', color: colors.text },
  notAvailableText: { fontSize: 14, textAlign: 'center', color: colors.textSecondary },
  header: { marginBottom: 24, alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: 'bold', marginBottom: 8, color: colors.text },
  headerSubtitle: { fontSize: 16, textAlign: 'center', color: colors.textSecondary },
  currentPlanBanner: { borderRadius: 16, padding: 20, marginBottom: 20 },
  currentPlanContent: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  currentPlanInfo: { flex: 1 },
  currentPlanLabel: { fontSize: 14, color: '#fff', opacity: 0.9, marginBottom: 4 },
  currentPlanName: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  pendingDowngradeText: { marginTop: 6, fontSize: 13, color: '#fff', opacity: 0.85 },
  currentPlanBadge: { backgroundColor: 'rgba(255,255,255,0.25)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  currentPlanBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  orangeBoxExpandedContent: { marginTop: 16 },
  orangeBoxDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.3)', marginBottom: 16 },
  orangeBoxDetailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  orangeBoxDetailItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orangeBoxDetailLabel: { fontSize: 15, color: '#fff', opacity: 0.9 },
  orangeBoxDetailValue: { fontSize: 16, fontWeight: '600', color: '#fff' },
  currentPlanDateMeta: {
    alignItems: 'flex-end',
  },
  currentPlanDatePrimary: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  currentPlanDateSecondary: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.85,
  },
  expandIndicator: { alignItems: 'center', marginTop: 12 },
  restoreButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 12, marginBottom: 12 },
  restoreButtonText: { fontWeight: '600', fontSize: 15 },
  disabledButton: { opacity: 0.5 },
  expandButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 12, marginBottom: 20 },
  expandButtonContent: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  expandButtonText: { fontSize: 16, fontWeight: '600' },
  plansContainer: { gap: 16, marginBottom: 20 },
  planCard: { borderRadius: 16, padding: 24, borderWidth: 2, borderColor: 'transparent' },
  highlightedPlan: {
    borderColor: colors.warning,
    shadowColor: colors.warning,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  popularPlan: { borderColor: colors.primary },
  currentPlanCard: { borderColor: colors.success, borderWidth: 3, backgroundColor: 'rgba(76,175,80,0.05)' },
  popularBadge: { position: 'absolute', top: -12, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12 },
  popularBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#fff' },
  currentBadge: { position: 'absolute', top: -12, alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 6 },
  currentBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#fff' },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  planName: { fontSize: 24, fontWeight: 'bold', flex: 1 },
  activeIndicatorCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.success, justifyContent: 'center', alignItems: 'center', marginLeft: 12 },
  priceContainer: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 20 },
  price: { fontSize: 36, fontWeight: 'bold' },
  priceUnit: { fontSize: 16, marginLeft: 4 },
  featuresContainer: { gap: 12, marginBottom: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureText: { fontSize: 16, flex: 1 },
  lockedFeatureText: { textDecorationLine: 'line-through' },
  selectButton: { paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  selectButtonText: { fontSize: 16, fontWeight: '600' },
  currentPlanIndicator: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  currentPlanIndicatorText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  infoBox: { flexDirection: 'row', gap: 14, padding: 16, borderRadius: 12, marginTop: 20 },
  infoText: { flex: 1, fontSize: 15, lineHeight: 22 },
  legalLinksRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 },
  legalLinkButton: { paddingVertical: 6, paddingHorizontal: 4 },
  legalLinkText: { fontSize: 13, fontWeight: '600', color: colors.primary, textDecorationLine: 'underline' },
  legalLinkSeparator: { width: 1, height: 14, backgroundColor: 'rgba(0,0,0,0.2)' },
  listHeader: { gap: 12, marginBottom: 16 },
  footerSpacing: { marginTop: 12 },
  planList: { gap: 16 },
  stateContainer: { alignItems: 'center', gap: 12, paddingVertical: 32 },
  stateTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  stateText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  stateButton: { backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  stateButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  skeletonList: { width: '100%', gap: 12 },
  skeletonCard: { opacity: 0.4 },
  skeletonLine: { width: '100%', height: 16, borderRadius: 8, backgroundColor: '#dfe3e6', marginTop: 12 },
  debugToggle: { marginTop: 8 },
  debugToggleText: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  debugContainer: { borderRadius: 12, padding: 12, backgroundColor: 'rgba(0,0,0,0.05)', marginTop: 8, gap: 6 },
  debugTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  debugRow: { flexDirection: 'row', justifyContent: 'space-between' },
  debugLabel: { fontSize: 12, color: colors.textSecondary },
  debugValue: { fontSize: 12, color: colors.text },
  debugWarningText: { fontSize: 12, color: colors.warning },
  debugHelp: { fontSize: 12, color: colors.primary, textAlign: 'center', marginTop: 4 },
  refreshButton: { marginTop: 12, alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: colors.primary },
  refreshButtonText: { color: '#fff', fontWeight: '600' },
  partnerBanner: { padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  partnerBannerText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  partnerBadge: { position: 'absolute', right: 12, top: 12, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999 },
  partnerBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  disabledCard: { opacity: 0.6 },
});


