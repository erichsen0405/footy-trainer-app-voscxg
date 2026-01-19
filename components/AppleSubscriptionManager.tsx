import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, useColorScheme, Platform, Alert, Linking } from 'react-native';
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

export default function AppleSubscriptionManager({
  onPlanSelected,
  isSignupFlow = false,
  selectedRole = null,
  highlightProductId,
  forceShowPlans = false,
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
  } = useAppleIAP();

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

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const filteredProducts =
    isSignupFlow && selectedRole
      ? selectedRole === 'player'
        ? products.filter(p => p.maxPlayers <= 1)
        : products.filter(p => p.maxPlayers > 1)
      : products;

  const planOrder = useMemo(() => {
    return ORDERED_PRODUCT_IDS.reduce<Record<string, number>>((acc, id, index) => {
      acc[id] = index;
      return acc;
    }, {});
  }, []);

  const sortedProducts = useMemo(() => {
    return [...filteredProducts].sort((a, b) => {
      const orderA = planOrder[a.productId] ?? Number.MAX_SAFE_INTEGER;
      const orderB = planOrder[b.productId] ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB;
    });
  }, [filteredProducts, planOrder]);

  const handleSelectPlan = useCallback(
    async (productId: string) => {
      if (isSignupFlow && onPlanSelected) {
        onPlanSelected(productId);
        return;
      }
      await purchaseSubscription(productId);
    },
    [isSignupFlow, onPlanSelected, purchaseSubscription]
  );

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

  const handleRestorePurchases = useCallback(async () => {
    await restorePurchases();
  }, [restorePurchases]);

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

  const isCurrentPlan = (productId: string): boolean => {
    return !!(subscriptionStatus?.isActive && subscriptionStatus.productId === productId);
  };

  useEffect(() => {
    if (!isSignupFlow && !subscriptionStatus?.isActive) {
      setShowPlans(true);
    }
  }, [isSignupFlow, subscriptionStatus?.isActive]);

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

  const renderPendingDowngrade = () => {
    if (!pendingProductId || !pendingEffectiveDate) return null;
    return (
      <Text style={styles.pendingDowngradeText}>
        Skifter til {getPlanName({ productId: pendingProductId })} ved næste fornyelse (
        {new Date(pendingEffectiveDate).toLocaleDateString('da-DK')})
      </Text>
    );
  };

  const renderPlanItem = useCallback(
    (item: (typeof products)[number], index: number) => {
      const isPopular = index === Math.floor(sortedProducts.length / 2);
      const isCurrentActive =
        isCurrentPlan(item.productId) || isComplimentaryForProduct(item.productId);
      const isHighlightTarget = highlightProductId === item.productId;
      const features = getPlanFeatures(item.productId, item.maxPlayers || 1);
      const disabledByComplimentary = isPlanLockedByComplimentary(item.productId);
      const priceLabel = getProductPriceLabel(item);

      return (
        <TouchableOpacity
          key={item.productId}
          style={[
            styles.planCard,
            { backgroundColor: cardBgColor },
            isPopular && !isCurrentActive && styles.popularPlan,
            isCurrentActive && styles.currentPlanCard,
            isHighlightTarget && styles.highlightedPlan,
          ]}
          onPress={() => handleSelectPlan(item.productId)}
          disabled={purchasing || isCurrentActive || disabledByComplimentary}
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
                (purchasing || disabledByComplimentary) && { opacity: 0.6 },
              ]}
              onPress={() => handleSelectPlan(item.productId)}
              disabled={purchasing || disabledByComplimentary}
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
      cardBgColor,
      colors.error,
      colors.highlight,
      colors.primary,
      colors.secondary,
      colors.success,
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
      {!isSignupFlow && !subscriptionStatus?.isActive && (
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Vælg dit abonnement</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            Alle abonnementer inkluderer 14 dages gratis prøveperiode
          </Text>
        </View>
      )}
      {!isSignupFlow && subscriptionStatus?.isActive && subscriptionStatus.productId && (
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
          {isOrangeBoxExpanded && subscriptionStatus.expiryDate && (
            <View style={styles.orangeBoxExpandedContent}>
              <View style={styles.orangeBoxDivider} />
              <View style={styles.orangeBoxDetailRow}>
                <View style={styles.orangeBoxDetailItem}>
                  <IconSymbol
                    ios_icon_name="clock"
                    android_material_icon_name="schedule"
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.orangeBoxDetailLabel}>Fornyes</Text>
                </View>
                <Text style={styles.orangeBoxDetailValue}>
                  {new Date(subscriptionStatus.expiryDate).toLocaleDateString('da-DK')}
                </Text>
              </View>
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
      {!isSignupFlow && (
        <TouchableOpacity
          style={[
            styles.restoreButton,
            { backgroundColor: cardBgColor },
            (!iapReady || purchasing) && styles.disabledButton,
          ]}
          onPress={handleRestorePurchases}
          activeOpacity={0.7}
          disabled={!iapReady || purchasing}
        >
          <IconSymbol
            ios_icon_name="arrow.clockwise"
            android_material_icon_name="restore"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.restoreButtonText, { color: colors.primary }]}>Gendan køb</Text>
        </TouchableOpacity>
      )}
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
    cardBgColor,
    colors.primary,
    colors.secondary,
    handleRestorePurchases,
    iapReady,
    isOrangeBoxExpanded,
    isSignupFlow,
    openLegalLink,
    purchasing,
    renderPendingDowngrade,
    setShowPlans,
    showComplimentaryPlayerBanner,
    showComplimentaryTrainerBanner,
    showPlans,
    subscriptionStatus?.expiryDate,
    subscriptionStatus?.isActive,
    subscriptionStatus?.productId,
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
                style={[styles.planCard, { backgroundColor: cardBgColor }, styles.skeletonCard]}
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

  return (
    <View style={styles.container}>
      {renderListHeader()}
      {plansContent}
      {showPlans ? renderListFooter() : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 12 },
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
});
