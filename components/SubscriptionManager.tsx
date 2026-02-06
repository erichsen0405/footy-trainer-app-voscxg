import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  useColorScheme,
  Linking,
  Platform,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { formatPrice } from '@/utils/formatPrice';

interface SubscriptionManagerProps {
  onPlanSelected?: (planId: string) => void;
  isSignupFlow?: boolean;
  selectedRole?: 'player' | 'trainer' | null;
  forceShowPlans?: boolean;
}

const PRIVACY_POLICY_URL = 'https://footballcoach.online/privacy';
const APPLE_STANDARD_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

type SubscriptionStatusType = ReturnType<typeof useSubscription>['subscriptionStatus'];

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const copenhagenDateFormatter = new Intl.DateTimeFormat('da-DK', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Copenhagen',
});
const copenhagenDatePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Copenhagen',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const toCopenhagenStartOfDayMs = (date: Date) => {
  const parts = copenhagenDatePartsFormatter.formatToParts(date);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  return Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? Date.UTC(year, month - 1, day)
    : NaN;
};

const formatDate = (dateString: string | null) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return copenhagenDateFormatter.format(date);
};

const getDaysRemaining = (dateString: string | null) => {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return null;
  const diff = toCopenhagenStartOfDayMs(date) - toCopenhagenStartOfDayMs(new Date());
  if (Number.isNaN(diff)) return null;
  return Math.max(0, Math.round(diff / MS_PER_DAY));
};

const datesEqual = (a?: string | null, b?: string | null) => {
  if (!a || !b) return false;
  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) {
    return a.trim() === b.trim();
  }
  return aTime === bTime;
};

const buildRenewalSummary = (status?: SubscriptionStatusType | null, isLifetime: boolean = false) => {
  if (isLifetime) {
    return {
      isTrial: false,
      trialEnd: null,
      renewalDate: null,
      primaryDate: null,
      daysRemaining: null,
      isLifetime: true,
    };
  }
  const isTrial = status?.status === 'trial';
  const trialEnd = status?.trialEnd ?? null;
  const renewalDate = status?.currentPeriodEnd ?? trialEnd ?? null;
  const primaryDate = isTrial ? trialEnd : renewalDate;
  return {
    isTrial,
    trialEnd,
    renewalDate,
    primaryDate,
    daysRemaining: getDaysRemaining(primaryDate),
    isLifetime: false,
  };
};

const getPlanColor = (planName?: string | null) => {
  const name = (planName ?? '').toLowerCase();
  if (name.includes('premium') || name.includes('gold')) return '#FFD700';
  if (name.includes('standard') || name.includes('silver')) return '#C0C0C0';
  if (name.includes('basic') || name.includes('bronze') || name.includes('spiller')) return '#CD7F32';
  return colors.primary;
};

const getPlanIcon = (planName?: string | null) => {
  const name = (planName ?? '').toLowerCase();
  if (name.includes('premium') || name.includes('gold')) return 'star.circle.fill';
  if (name.includes('standard') || name.includes('silver')) return 'star.leadinghalf.filled';
  if (name.includes('basic') || name.includes('bronze') || name.includes('spiller')) return 'star.fill';
  return 'checkmark.seal.fill';
};

const getPlanPriceLabel = (plan: { price_amount?: number | null; price_dkk?: number | null; localized_price?: string | null; currency_code?: string | null }) => {
  const amountOrLabel = plan.price_amount ?? plan.price_dkk ?? plan.localized_price ?? null;
  return formatPrice(amountOrLabel, (plan.currency_code ?? 'DKK') || 'DKK') ?? '—';
};

const openLegalLink = async (url: string) => {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('unsupported');
    await Linking.openURL(url);
  } catch {
    Alert.alert('Kunne ikke åbne linket', 'Prøv igen senere.');
  }
};

export default function SubscriptionManager({ 
  onPlanSelected, 
  isSignupFlow = false,
  selectedRole = null,
  forceShowPlans = false,
}: SubscriptionManagerProps) {
  const {
    subscriptionStatus,
    subscriptionPlans,
    loading,
    createSubscription,
    changeSubscriptionPlan,
    refreshSubscription,
  } = useSubscription();
  const [creatingPlanId, setCreatingPlanId] = useState<string | null>(null);
  const [showPlans, setShowPlans] = useState(isSignupFlow || forceShowPlans); // Collapsed by default unless in signup flow
    useEffect(() => {
      if (forceShowPlans) {
        setShowPlans(true);
      }
    }, [forceShowPlans]);

  const [retryCount, setRetryCount] = useState(0);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const planCardBgColor = isDark ? '#1d1d1f' : '#ffffff';
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;
  const isLifetime = useMemo(
    () =>
      Boolean(
        subscriptionStatus?.isLifetime ||
          (subscriptionStatus?.subscriptionTier &&
            subscriptionStatus?.hasSubscription &&
            !subscriptionStatus?.trialEnd &&
            !subscriptionStatus?.currentPeriodEnd),
      ),
    [
      subscriptionStatus?.currentPeriodEnd,
      subscriptionStatus?.hasSubscription,
      subscriptionStatus?.isLifetime,
      subscriptionStatus?.subscriptionTier,
      subscriptionStatus?.trialEnd,
    ],
  );

  // LINT FIX: Include refreshSubscription in dependency array
  // Refresh subscription status when component mounts - ONLY ONCE
  useEffect(() => {
    if (!isSignupFlow) {
      console.log('[SubscriptionManager] Component mounted, refreshing subscription');
      refreshSubscription();
    }
  }, [isSignupFlow, refreshSubscription]);

  // Log subscription status changes for debugging
  useEffect(() => {
    console.log('[SubscriptionManager] Subscription status updated:', {
      hasSubscription: subscriptionStatus?.hasSubscription,
      planName: subscriptionStatus?.planName,
      status: subscriptionStatus?.status,
    });
  }, [subscriptionStatus]);

  // Filter plans based on role in signup flow
  const filteredPlans = isSignupFlow && selectedRole
    ? selectedRole === 'player'
      ? subscriptionPlans.filter(plan => plan.max_players <= 1) // Player plans
      : subscriptionPlans.filter(plan => plan.max_players > 1)  // Trainer plans
    : subscriptionPlans;

  const openManageSubscription = useCallback(async (): Promise<boolean> => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : Platform.OS === 'android'
          ? 'https://play.google.com/store/account/subscriptions'
          : null;

    if (!url) {
      Alert.alert(
        'Administrer abonnement',
        'Plan-skift skal håndteres via “Administrer abonnement”.'
      );
      return false;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) {
        Alert.alert(
          'Kunne ikke åbne abonnements-administration',
          'Plan-skift skal håndteres via “Administrer abonnement”.'
        );
        return false;
      }
      await Linking.openURL(url);
      return true;
    } catch {
      Alert.alert(
        'Kunne ikke åbne abonnements-administration',
        'Plan-skift skal håndteres via “Administrer abonnement”.'
      );
      return false;
    }
  }, []);

  const handleChangePlan = async (planId: string, planName: string) => {
    setCreatingPlanId(planId);
    try {
      const result = await changeSubscriptionPlan(planId);

      if (result.success) {
        setShowPlans(false);
        setRetryCount(0);
        Alert.alert('Plan opdateret', `Dit abonnement er opdateret til ${planName}.`);
        return;
      }

      if (result.unsupported) {
        setShowPlans(false);
        await openManageSubscription();
        return;
      }

      if (result.alreadyOnPlan) {
        Alert.alert('Ingen ændring', 'Du bruger allerede denne plan.');
        return;
      }

      Alert.alert('Plan-skift fejlede', result.error || 'Kunne ikke skifte plan. Prøv igen.');
    } catch (error: any) {
      Alert.alert('Plan-skift fejlede', error?.message || 'Der opstod en uventet fejl.');
    } finally {
      setCreatingPlanId(null);
    }
  };

  const handleSelectPlan = async (planId: string, planName: string, maxPlayers: number) => {
    if (isSignupFlow && onPlanSelected) {
      onPlanSelected(planId);
      return;
    }

    if (subscriptionStatus?.hasSubscription) {
      const normalizedCurrent = (subscriptionStatus.planName ?? '').trim().toLowerCase();
      const normalizedSelected = (planName ?? '').trim().toLowerCase();

      if (normalizedCurrent.length > 0 && normalizedCurrent === normalizedSelected) {
        Alert.alert('Allerede aktiv', 'Du er allerede på denne plan.');
        return;
      }

      await handleChangePlan(planId, planName);
      return;
    }

    Alert.alert(
      'Start prøveperiode',
      `Vil du starte en 14-dages gratis prøveperiode med ${planName} planen?\n\nDu kan oprette op til ${maxPlayers} spiller${maxPlayers > 1 ? 'e' : ''}.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Start prøveperiode',
          onPress: async () => {
            await attemptCreateSubscription(planId, planName);
          },
        },
      ]
    );
  };

  const attemptCreateSubscription = async (productId: string, planName: string, isRetry: boolean = false) => {
    setCreatingPlanId(productId);

    if (subscriptionStatus?.hasSubscription) {
      await handleChangePlan(productId, planName);
      return;
    }
    
    try {
      console.log(`[SubscriptionManager] Attempting to create subscription (retry: ${isRetry})`);
      const result = await createSubscription(productId);
      
      if (result.success) {
        // Collapse the plan selection
        setShowPlans(false);
        setRetryCount(0);
        
        Alert.alert(
          'Succes! 🎉',
          'Din 14-dages gratis prøveperiode er startet. Du kan nu oprette spillere.',
          [{ text: 'OK' }]
        );
      } else if (result.alreadyHasSubscription) {
        console.log('[SubscriptionManager] Subscription exists - attempting plan change instead');
        await handleChangePlan(productId, planName);
      } else {
        console.error('[SubscriptionManager] Subscription creation failed:', result.error);
        
        // Show error with retry option
        Alert.alert(
          'Fejl ved oprettelse af abonnement',
          result.error || 'Kunne ikke oprette abonnement',
          [
            { text: 'Annuller', style: 'cancel', onPress: () => setRetryCount(0) },
            {
              text: 'Prøv igen',
              onPress: () => {
                const newRetryCount = retryCount + 1;
                setRetryCount(newRetryCount);
                
                if (newRetryCount >= 3) {
                  Alert.alert(
                    'Vedvarende fejl',
                    'Der er problemer med at oprette dit abonnement. Dette kan skyldes:\n\n' +
                    '• Dårlig internetforbindelse\n' +
                    '• Server problemer\n\n' +
                    'Prøv venligst:\n' +
                    '1. Tjek din internetforbindelse\n' +
                    '2. Log ud og ind igen\n' +
                    '3. Genstart appen\n\n' +
                    'Hvis problemet fortsætter, kontakt support.',
                    [{ text: 'OK', onPress: () => setRetryCount(0) }]
                  );
                } else {
                  attemptCreateSubscription(productId, planName, true);
                }
              },
            },
          ]
        );
      }
    } catch (error: any) {
      console.error('[SubscriptionManager] Unexpected error:', error);
      Alert.alert(
        'Uventet fejl',
        'Der opstod en uventet fejl. Prøv venligst igen.',
        [
          { text: 'OK', onPress: () => setRetryCount(0) }
        ]
      );
    } finally {
      setCreatingPlanId(null);
    }
  };

  const renewalSummary = useMemo(
    () => buildRenewalSummary(subscriptionStatus, isLifetime),
    [isLifetime, subscriptionStatus],
  );
  const shouldShowRenewalAfterTrial =
    !renewalSummary.isLifetime &&
    renewalSummary.isTrial &&
    !!renewalSummary.renewalDate &&
    !datesEqual(renewalSummary.renewalDate, renewalSummary.primaryDate);

  const normalizedStatus = isLifetime ? 'lifetime' : (subscriptionStatus?.status ?? '').toLowerCase();
  const statusLabel = useMemo(() => {
    if (isLifetime) return 'Uendeligt';
    switch (normalizedStatus) {
      case 'trial':
        return 'Prøveperiode';
      case 'active':
        return 'Aktiv';
      case 'past_due':
        return 'Betaling afventer';
      case 'canceled':
      case 'cancelled':
        return 'Annulleret';
      case 'incomplete':
        return 'Ufuldstændig betaling';
      default:
        return subscriptionStatus?.hasSubscription ? 'Aktivt abonnement' : 'Ingen abonnement';
    }
  }, [isLifetime, normalizedStatus, subscriptionStatus?.hasSubscription]);

const statusTone = useMemo(() => {
    if (isLifetime || normalizedStatus === 'active') return { bg: isDark ? '#1f303e' : '#e6f0fb', text: isDark ? '#9ecbff' : '#1f5ca8', border: isDark ? '#2e4861' : '#c5dcfa' };
    if (normalizedStatus === 'trial') return { bg: isDark ? '#20361c' : '#e4f4e0', text: isDark ? '#b6e3a3' : '#2d6a2d', border: isDark ? '#2e4a28' : '#b7ddb1' };
    if (normalizedStatus === 'past_due' || normalizedStatus === 'incomplete') return { bg: isDark ? '#3a241f' : '#fbe9e7', text: isDark ? '#f5b19f' : '#c62828', border: isDark ? '#5a3a32' : '#ef9a9a' };
    if (normalizedStatus === 'canceled' || normalizedStatus === 'cancelled') return { bg: isDark ? '#2f2f2f' : '#f0f0f0', text: isDark ? '#dcdcdc' : '#4f4f4f', border: isDark ? '#3d3d3d' : '#d6d6d6' };
    return { bg: isDark ? '#2b2b2b' : '#f4f6f8', text: isDark ? '#d5d7da' : '#3a3f45', border: isDark ? '#3a3a3a' : '#e0e4e8' };
  }, [isDark, isLifetime, normalizedStatus]);

  const playerUsageLabel = useMemo(() => {
    if (!subscriptionStatus?.hasSubscription) return '—';
    const current = Number.isFinite(subscriptionStatus.currentPlayers) ? subscriptionStatus.currentPlayers : 0;
    const max = Number.isFinite(subscriptionStatus.maxPlayers) && subscriptionStatus.maxPlayers > 0 ? subscriptionStatus.maxPlayers : null;
    return max ? `${current} / ${max}` : `${current}`;
  }, [subscriptionStatus?.currentPlayers, subscriptionStatus?.hasSubscription, subscriptionStatus?.maxPlayers]);

  const isCurrentPlan = useCallback(
    (planName: string | null | undefined): boolean => {
      if (isSignupFlow || !subscriptionStatus?.hasSubscription || !subscriptionStatus?.planName) {
        return false;
      }
      const normalizedCurrent = subscriptionStatus.planName.trim().toLowerCase();
      const normalizedPlan = (planName ?? '').trim().toLowerCase();
      return normalizedCurrent.length > 0 && normalizedCurrent === normalizedPlan;
    },
    [isSignupFlow, subscriptionStatus?.hasSubscription, subscriptionStatus?.planName]
  );

  const hasDisplaySubscription = Boolean(
    subscriptionStatus?.hasSubscription || subscriptionStatus?.subscriptionTier || subscriptionStatus?.isLifetime,
  );
  const showFullLoader = loading && !isSignupFlow && !hasDisplaySubscription;
  const showOverlayLoader = false; // avoid background shifts while scrolling

  if (showFullLoader) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: textColor }]}>Henter abonnement...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: planCardBgColor }}>
      <View style={[styles.container, { backgroundColor: 'transparent', paddingBottom: 20 }]}>
      {showOverlayLoader && null}
      {/* Header - Only show when user doesn't have a subscription */}
      {!isSignupFlow && !subscriptionStatus?.hasSubscription && (
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Vælg din plan</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            Start med 14 dages gratis prøveperiode
          </Text>
        </View>
      )}

      {/* Current Plan Display */}
      {!isSignupFlow && subscriptionStatus?.hasSubscription && (
        <View
          style={[
            styles.currentPlanSummaryCard,
            {
              backgroundColor: cardBgColor,
              borderColor: statusTone.border,
            },
          ]}
        >
          <View style={styles.currentPlanHeaderRow}>
            <View style={styles.currentPlanTitleGroup}>
              <IconSymbol
                ios_icon_name={getPlanIcon(subscriptionStatus.planName)}
                android_material_icon_name="verified"
                size={32}
                color={colors.primary}
              />
              <View style={styles.currentPlanTextGroup}>
                <Text style={[styles.currentPlanLabel, { color: textSecondaryColor }]}>Nuværende plan</Text>
                <Text style={[styles.currentPlanName, { color: textColor }]}>
                  {subscriptionStatus.planName ?? 'Aktivt abonnement'}
                </Text>
              </View>
            </View>

            <View style={[styles.statusPill, { backgroundColor: statusTone.bg, borderColor: statusTone.border }]}>
              <Text style={[styles.statusPillText, { color: statusTone.text }]}>{statusLabel}</Text>
            </View>
          </View>

          <View style={styles.currentPlanMetaBlock}>
            <View style={styles.metaRow}>
              <IconSymbol
                ios_icon_name="person.3.fill"
                android_material_icon_name="group"
                size={22}
                color={colors.primary}
              />
              <View style={styles.metaTextGroup}>
                <Text style={[styles.metaLabel, { color: textSecondaryColor }]}>Spillerforbrug</Text>
                <Text style={[styles.metaValue, { color: textColor }]}>{playerUsageLabel}</Text>
                {subscriptionStatus?.maxPlayers ? (
                  <Text style={[styles.metaHint, { color: textSecondaryColor }]}>Opgrader for flere spillere</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.metaRow}>
              <IconSymbol
                ios_icon_name="calendar"
                android_material_icon_name="event"
                size={22}
                color={colors.primary}
              />
              <View style={styles.metaTextGroup}>
                <Text style={[styles.metaLabel, { color: textSecondaryColor }]}>
                  {renewalSummary.isLifetime ? 'Varighed' : renewalSummary.isTrial ? 'Prøveperiode til' : 'Fornyes'}
                </Text>
                <Text style={[styles.metaValue, { color: textColor }]}>
                  {renewalSummary.isLifetime
                    ? 'Uendeligt'
                    : renewalSummary.primaryDate
                      ? formatDate(renewalSummary.primaryDate)
                      : 'Dato ikke tilgængelig'}
                </Text>
                {!renewalSummary.isLifetime && renewalSummary.daysRemaining !== null && (
                  <Text style={[styles.metaHint, { color: textSecondaryColor }]}>
                    {renewalSummary.isTrial
                      ? `${renewalSummary.daysRemaining} dage tilbage af prøveperioden`
                      : `${renewalSummary.daysRemaining} dage til næste fornyelse`}
                  </Text>
                )}
                {!renewalSummary.isLifetime && shouldShowRenewalAfterTrial && renewalSummary.renewalDate ? (
                  <Text style={[styles.metaHint, { color: textSecondaryColor }]}>
                    Herefter fornyes {formatDate(renewalSummary.renewalDate)}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

        </View>
      )}

      {/* Collapsible Plans Section - Moved to bottom */}
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

      <View style={styles.legalLinksRow}>
        <TouchableOpacity
          style={styles.legalLinkButton}
          activeOpacity={0.6}
          onPress={() => openLegalLink(PRIVACY_POLICY_URL)}
        >
          <Text style={[styles.legalLinkText, { color: colors.primary }]}>Privatlivspolitik</Text>
        </TouchableOpacity>
        <View style={styles.legalLinkSeparator} />
        <TouchableOpacity
          style={styles.legalLinkButton}
          activeOpacity={0.6}
          onPress={() => openLegalLink(APPLE_STANDARD_EULA_URL)}
        >
          <Text style={[styles.legalLinkText, { color: colors.primary }]}>Vilkår (EULA)</Text>
        </TouchableOpacity>
      </View>

      {/* Plans List (Collapsible) */}
      {showPlans && (
        <View style={[styles.plansContainer, { backgroundColor: planCardBgColor }]}>
          {filteredPlans.map((plan, index) => {
            const isPopular = index === Math.floor(filteredPlans.length / 2); // Middle plan is popular
            const isCreating = creatingPlanId === plan.id;
            const isPlanCurrent = isCurrentPlan(plan.name);

            return (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCard,
                  { backgroundColor: planCardBgColor },
                  isPopular && !isPlanCurrent && styles.popularPlan,
                  isPlanCurrent && styles.currentPlanCard,
                ]}
                onPress={() => handleSelectPlan(plan.id, plan.name, plan.max_players)}
                disabled={isCreating || isPlanCurrent}
                activeOpacity={0.7}
              >
                {isPopular && !isPlanCurrent && (
                  <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.popularBadgeText}>Mest populær</Text>
                  </View>
                )}

                {isPlanCurrent && (
                  <View style={[styles.currentBadge, { backgroundColor: colors.success }]}>
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check_circle"
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.currentBadgeText}>Din nuværende plan</Text>
                  </View>
                )}

                <View style={styles.planHeader}>
                  <Text style={[styles.planName, { color: textColor }]}>{plan.name}</Text>
                  {isPlanCurrent && (
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
                  <Text style={[styles.price, { color: isPlanCurrent ? colors.success : colors.primary }]}>
                    {getPlanPriceLabel(plan)}
                  </Text>
                  <Text style={[styles.priceUnit, { color: textSecondaryColor }]}>/ måned</Text>
                </View>

                <View style={styles.featuresContainer}>
                  <View style={styles.featureRow}>
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check_circle"
                      size={20}
                      color={isPlanCurrent ? colors.success : colors.primary}
                    />
                    <Text style={[styles.featureText, { color: textColor }]}>
                      {plan.max_players === 1 
                        ? 'Personlig spiller konto'
                        : `Op til ${plan.max_players} spillere`
                      }
                    </Text>
                  </View>

                  <View style={styles.featureRow}>
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check_circle"
                      size={20}
                      color={isPlanCurrent ? colors.success : colors.primary}
                    />
                    <Text style={[styles.featureText, { color: textColor }]}>
                      14 dages gratis prøveperiode
                    </Text>
                  </View>

                  <View style={styles.featureRow}>
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check_circle"
                      size={20}
                      color={isPlanCurrent ? colors.success : colors.primary}
                    />
                    <Text style={[styles.featureText, { color: textColor }]}>
                      Fuld adgang til alle funktioner
                    </Text>
                  </View>

                  <View style={styles.featureRow}>
                    <IconSymbol
                      ios_icon_name="checkmark.circle.fill"
                      android_material_icon_name="check_circle"
                      size={20}
                      color={isPlanCurrent ? colors.success : colors.primary}
                    />
                    <Text style={[styles.featureText, { color: textColor }]}>
                      Opsig når som helst
                    </Text>
                  </View>
                </View>

                {!isPlanCurrent && (
                  <TouchableOpacity
                    style={[
                      styles.selectButton,
                      { backgroundColor: isPopular ? colors.primary : colors.highlight },
                      isCreating && { opacity: 0.6 },
                    ]}
                    onPress={() => handleSelectPlan(plan.id, plan.name, plan.max_players)}
                    disabled={isCreating}
                  >
                    {isCreating ? (
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

                {isPlanCurrent && (
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
            {isSignupFlow 
              ? 'Du får 14 dages gratis prøveperiode. Ingen binding - du kan opsige når som helst.'
              : 'Du kan opsige dit abonnement når som helst. Ingen binding.'
            }
          </Text>
        </View>
      )}
      </View>
    </View>
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
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
    zIndex: 2,
  },
  loadingText: {
    fontSize: 16,
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
  currentPlanSummaryCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
  },
  currentPlanHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 12,
  },
  currentPlanTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  currentPlanTextGroup: {
    flex: 1,
    gap: 2,
  },
  currentPlanLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  currentPlanName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  currentPlanMetaBlock: {
    gap: 14,
    marginTop: 6,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  metaTextGroup: {
    flex: 1,
    gap: 2,
  },
  metaLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  metaHint: {
    fontSize: 13,
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
  legalLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  legalLinkButton: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  legalLinkText: {
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  legalLinkSeparator: {
    width: 1,
    height: 14,
    backgroundColor: 'rgba(0,0,0,0.2)',
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
