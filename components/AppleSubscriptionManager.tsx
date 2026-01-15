import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  useColorScheme,
  Platform,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useAppleIAP, PRODUCT_IDS } from '@/contexts/AppleIAPContext';

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

  const defaultFeatures: PlanFeature[] = [
    { label: 'Fuld adgang til alle funktioner', status: 'included' },
  ];

  let specificFeatures: PlanFeature[] = defaultFeatures;
  if (planType === 'player_basic') specificFeatures = playerBasicFeatures;
  else if (planType === 'player_premium') specificFeatures = playerPremiumFeatures;
  else if (planType === 'trainer_basic' || planType === 'trainer_standard' || planType === 'trainer_premium') {
    specificFeatures = trainerFeatures;
  }

  return [
    capacityFeature,
    ...specificFeatures,
    { label: '14 dages gratis prøveperiode', status: 'included' },
    { label: 'Opsig når som helst via App Store', status: 'included' },
  ];
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
    restorePurchases 
  } = useAppleIAP();
  
  const [showPlans, setShowPlans] = useState(isSignupFlow);
  const [isOrangeBoxExpanded, setIsOrangeBoxExpanded] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  // Filter products based on role in signup flow
  const filteredProducts = isSignupFlow && selectedRole
    ? selectedRole === 'player'
      ? products.filter(p => p.maxPlayers <= 1)
      : products.filter(p => p.maxPlayers > 1)
    : products;

  const handleSelectPlan = async (productId: string, title: string) => {
    if (isSignupFlow && onPlanSelected) {
      onPlanSelected(productId);
      return;
    }

    // Purchase subscription
    await purchaseSubscription(productId);
  };

  const handleRestorePurchases = async () => {
    await restorePurchases();
  };

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

  const getPlanName = (product: any) => {
    if (product.productId === PRODUCT_IDS.PLAYER_PREMIUM) return 'Premium spiller';
    if (product.productId === PRODUCT_IDS.PLAYER_BASIC) return 'Basis spiller';
    if (product.productId.includes('spiller')) return 'Spiller';
    if (product.productId.includes('basic')) return 'Træner Basis';
    if (product.productId.includes('standard')) return 'Træner Standard';
    if (product.productId.includes('premium')) return 'Træner Premium';
    return product.title;
  };

  const isCurrentPlan = (productId: string): boolean => {
    return subscriptionStatus?.isActive && subscriptionStatus.productId === productId;
  };

  useEffect(() => {
    if (forceShowPlans) {
      setShowPlans(true);
    }
  }, [forceShowPlans]);

  if (Platform.OS !== 'ios') {
    return (
      <View style={styles.notAvailableContainer}>
        <IconSymbol
          ios_icon_name="exclamationmark.triangle.fill"
          android_material_icon_name="warning"
          size={48}
          color={colors.warning}
        />
        <Text style={[styles.notAvailableTitle, { color: textColor }]}>
          Ikke tilgængelig
        </Text>
        <Text style={[styles.notAvailableText, { color: textSecondaryColor }]}>
          Apple In-App Purchases er kun tilgængelige på iOS enheder.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: textColor }]}>
          Henter abonnementer fra App Store...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled={true}
    >
      {/* Header */}
      {!isSignupFlow && !subscriptionStatus?.isActive && (
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Vælg dit abonnement</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            Alle abonnementer inkluderer 14 dages gratis prøveperiode
          </Text>
        </View>
      )}

      {/* Current Subscription Banner */}
      {!isSignupFlow && subscriptionStatus?.isActive && subscriptionStatus.productId && (
        <TouchableOpacity
          style={[styles.currentPlanBanner, { backgroundColor: getPlanColor(subscriptionStatus.productId) }]}
          onPress={() => setIsOrangeBoxExpanded(!isOrangeBoxExpanded)}
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

      {/* Restore Purchases Button */}
      {!isSignupFlow && (
        <TouchableOpacity
          style={[styles.restoreButton, { backgroundColor: cardBgColor }]}
          onPress={handleRestorePurchases}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="arrow.clockwise"
            android_material_icon_name="restore"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.restoreButtonText, { color: colors.primary }]}>
            Gendan køb
          </Text>
        </TouchableOpacity>
      )}

      {/* Toggle Plans Button */}
      {!isSignupFlow && (
        <TouchableOpacity
          style={[styles.expandButton, { backgroundColor: cardBgColor }]}
          onPress={() => setShowPlans(!showPlans)}
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

      {/* Plans List */}
      {showPlans && (
        <View style={styles.plansContainer}>
          {filteredProducts.map((product, index) => {
            const isPopular = index === Math.floor(filteredProducts.length / 2);
            const isCurrentActive = isCurrentPlan(product.productId);
            const isHighlightTarget = highlightProductId === product.productId;
            const features = getPlanFeatures(product.productId, product.maxPlayers || 1);

            return (
              <TouchableOpacity
                key={product.productId}
                style={[
                  styles.planCard,
                  { backgroundColor: cardBgColor },
                  isPopular && !isCurrentActive && styles.popularPlan,
                  isCurrentActive && styles.currentPlanCard,
                  isHighlightTarget && styles.highlightedPlan,
                ]}
                onPress={() => handleSelectPlan(product.productId, product.title)}
                disabled={purchasing || isCurrentActive}
                activeOpacity={0.7}
              >
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
                  <Text style={[styles.planName, { color: textColor }]}>
                    {getPlanName(product)}
                  </Text>
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
                  <Text style={[styles.price, { color: isCurrentActive ? colors.success : colors.primary }]}>
                    {product.localizedPrice}
                  </Text>
                  <Text style={[styles.priceUnit, { color: textSecondaryColor }]}>/ måned</Text>
                </View>

                <View style={styles.featuresContainer}>
                  {features.map(feature => {
                    const isIncluded = feature.status === 'included';
                    const iconColor = isIncluded
                      ? (isCurrentActive ? colors.success : colors.primary)
                      : colors.error;
                    return (
                      <View style={styles.featureRow} key={`${product.productId}-${feature.label}`}>
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
                      purchasing && { opacity: 0.6 },
                    ]}
                    onPress={() => handleSelectPlan(product.productId, product.title)}
                    disabled={purchasing}
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
          })}
        </View>
      )}

      {/* Info Box */}
      {showPlans && (
        <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
          <IconSymbol
            ios_icon_name="info.circle.fill"
            android_material_icon_name="info"
            size={24}
            color={colors.secondary}
          />
          <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
            Abonnementer håndteres via App Store. Du kan opsige når som helst i dine App Store indstillinger.
            {'\n\n'}
            Alle abonnementer inkluderer 14 dages gratis prøveperiode.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    minHeight: 200,
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
  },
  notAvailableContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  notAvailableTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  notAvailableText: {
    fontSize: 16,
    textAlign: 'center',
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  currentPlanBanner: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  currentPlanContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  currentPlanInfo: {
    flex: 1,
  },
  currentPlanLabel: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 4,
  },
  currentPlanName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  currentPlanBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  currentPlanBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  orangeBoxExpandedContent: {
    marginTop: 16,
  },
  orangeBoxDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginBottom: 16,
  },
  orangeBoxDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  orangeBoxDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orangeBoxDetailLabel: {
    fontSize: 15,
    color: '#fff',
    opacity: 0.9,
  },
  orangeBoxDetailValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  expandIndicator: {
    alignItems: 'center',
    marginTop: 12,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  expandButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expandButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  plansContainer: {
    gap: 16,
    marginBottom: 20,
  },
  planCard: {
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  highlightedPlan: {
    borderColor: colors.warning,
    shadowColor: colors.warning,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  popularPlan: {
    borderColor: colors.primary,
  },
  currentPlanCard: {
    borderColor: colors.success,
    borderWidth: 3,
    backgroundColor: 'rgba(76, 175, 80, 0.05)',
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  popularBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  currentBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currentBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  activeIndicatorCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 20,
  },
  price: {
    fontSize: 36,
    fontWeight: 'bold',
  },
  priceUnit: {
    fontSize: 16,
    marginLeft: 4,
  },
  featuresContainer: {
    gap: 12,
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    flex: 1,
  },
  lockedFeatureText: {
    textDecorationLine: 'line-through',
  },
  selectButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  currentPlanIndicator: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  currentPlanIndicatorText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    marginTop: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
});
