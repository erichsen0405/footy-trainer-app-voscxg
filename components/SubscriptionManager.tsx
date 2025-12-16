
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useSubscription } from '@/contexts/SubscriptionContext';

interface SubscriptionManagerProps {
  onPlanSelected?: (planId: string) => void;
  isSignupFlow?: boolean;
  selectedRole?: 'player' | 'trainer' | null;
}

export default function SubscriptionManager({ 
  onPlanSelected, 
  isSignupFlow = false,
  selectedRole = null 
}: SubscriptionManagerProps) {
  const { subscriptionStatus, subscriptionPlans, loading, createSubscription, refreshSubscription } = useSubscription();
  const [creatingPlanId, setCreatingPlanId] = useState<string | null>(null);
  const [showPlans, setShowPlans] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  // Refresh subscription status when component mounts
  useEffect(() => {
    if (!isSignupFlow) {
      refreshSubscription();
    }
  }, [isSignupFlow]);

  // Filter plans based on role in signup flow
  const filteredPlans = isSignupFlow && selectedRole
    ? selectedRole === 'player'
      ? subscriptionPlans.filter(plan => plan.max_players <= 1) // Player plans
      : subscriptionPlans.filter(plan => plan.max_players > 1)  // Trainer plans
    : subscriptionPlans;

  const handleSelectPlan = async (planId: string, planName: string, maxPlayers: number) => {
    if (isSignupFlow && onPlanSelected) {
      // In signup flow, just pass the plan ID back
      onPlanSelected(planId);
      return;
    }

    // Normal flow - create subscription
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

  const attemptCreateSubscription = async (planId: string, planName: string, isRetry: boolean = false) => {
    setCreatingPlanId(planId);
    
    try {
      console.log(`[SubscriptionManager] Attempting to create subscription (retry: ${isRetry})`);
      const result = await createSubscription(planId);
      
      if (result.success) {
        // Collapse the plan selection
        setShowPlans(false);
        setRetryCount(0);
        
        Alert.alert(
          'Succes! 🎉',
          'Din 14-dages gratis prøveperiode er startet. Du kan nu oprette spillere.',
          [{ text: 'OK' }]
        );
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
                  attemptCreateSubscription(planId, planName, true);
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('da-DK', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const getDaysRemaining = (endDate: string | null) => {
    if (!endDate) return 0;
    const end = new Date(endDate);
    const now = new Date();
    const diff = end.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const getPlanIcon = (planName: string | null) => {
    if (!planName) return 'star.fill';
    
    const lowerName = planName.toLowerCase();
    if (lowerName.includes('bronze') || lowerName.includes('basic')) {
      return 'star.fill';
    } else if (lowerName.includes('silver') || lowerName.includes('standard')) {
      return 'star.leadinghalf.filled';
    } else if (lowerName.includes('gold') || lowerName.includes('premium')) {
      return 'star.circle.fill';
    }
    return 'star.fill';
  };

  const getPlanColor = (planName: string | null) => {
    if (!planName) return '#CD7F32';
    
    const lowerName = planName.toLowerCase();
    if (lowerName.includes('bronze') || lowerName.includes('basic')) {
      return '#CD7F32'; // Bronze
    } else if (lowerName.includes('silver') || lowerName.includes('standard')) {
      return '#C0C0C0'; // Silver
    } else if (lowerName.includes('gold') || lowerName.includes('premium')) {
      return '#FFD700'; // Gold
    }
    return colors.primary;
  };

  if (loading && !isSignupFlow) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: textColor }]}>Henter abonnement...</Text>
      </View>
    );
  }

  // Show current subscription if exists (not in signup flow)
  if (!isSignupFlow && subscriptionStatus?.hasSubscription && !showPlans) {
    const daysRemaining = getDaysRemaining(
      subscriptionStatus.status === 'trial'
        ? subscriptionStatus.trialEnd
        : subscriptionStatus.currentPeriodEnd
    );

    const planColor = getPlanColor(subscriptionStatus.planName);

    return (
      <View style={styles.container}>
        <View style={[styles.currentSubscriptionCard, { backgroundColor: planColor }]}>
          <View style={styles.subscriptionHeader}>
            <IconSymbol
              ios_icon_name={getPlanIcon(subscriptionStatus.planName)}
              android_material_icon_name="verified"
              size={48}
              color="#fff"
            />
            <View style={styles.subscriptionInfo}>
              <Text style={styles.currentPlanName}>{subscriptionStatus.planName}</Text>
              <Text style={styles.currentPlanStatus}>
                {subscriptionStatus.status === 'trial' ? 'Prøveperiode' : 'Aktiv'}
              </Text>
            </View>
          </View>

          <View style={styles.subscriptionDetails}>
            <View style={styles.detailRow}>
              <IconSymbol
                ios_icon_name="person.3.fill"
                android_material_icon_name="group"
                size={20}
                color="#fff"
              />
              <Text style={styles.detailText}>
                {subscriptionStatus.currentPlayers} / {subscriptionStatus.maxPlayers} spillere
              </Text>
            </View>

            {subscriptionStatus.status === 'trial' && (
              <View style={styles.detailRow}>
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="event"
                  size={20}
                  color="#fff"
                />
                <Text style={styles.detailText}>
                  {daysRemaining} dage tilbage af prøveperioden
                </Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <IconSymbol
                ios_icon_name="clock"
                android_material_icon_name="schedule"
                size={20}
                color="#fff"
              />
              <Text style={styles.detailText}>
                Udløber {formatDate(subscriptionStatus.status === 'trial' ? subscriptionStatus.trialEnd : subscriptionStatus.currentPeriodEnd)}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.changePlanButton}
            onPress={() => setShowPlans(true)}
          >
            <Text style={styles.changePlanButtonText}>Skift abonnement</Text>
          </TouchableOpacity>
        </View>

        {subscriptionStatus.status === 'trial' && (
          <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
            <IconSymbol
              ios_icon_name="info.circle.fill"
              android_material_icon_name="info"
              size={24}
              color={colors.secondary}
            />
            <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
              Din prøveperiode udløber om {daysRemaining} dage. Efter prøveperioden skal du tilføje betalingsoplysninger for at fortsætte.
            </Text>
          </View>
        )}
      </View>
    );
  }

  // Show subscription plans
  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled={true}
    >
      {!isSignupFlow && showPlans && (
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setShowPlans(false)}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.backButtonText, { color: colors.primary }]}>Tilbage</Text>
        </TouchableOpacity>
      )}

      {!isSignupFlow && (
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Vælg din plan</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            Start med 14 dages gratis prøveperiode
          </Text>
        </View>
      )}

      <View style={styles.plansContainer}>
        {filteredPlans.map((plan, index) => {
          const isPopular = index === Math.floor(filteredPlans.length / 2); // Middle plan is popular
          const isCreating = creatingPlanId === plan.id;

          return (
            <TouchableOpacity
              key={plan.id}
              style={[
                styles.planCard,
                { backgroundColor: cardBgColor },
                isPopular && styles.popularPlan,
              ]}
              onPress={() => handleSelectPlan(plan.id, plan.name, plan.max_players)}
              disabled={isCreating}
              activeOpacity={0.7}
            >
              {isPopular && (
                <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.popularBadgeText}>Mest populær</Text>
                </View>
              )}

              <Text style={[styles.planName, { color: textColor }]}>{plan.name}</Text>
              
              <View style={styles.priceContainer}>
                <Text style={[styles.price, { color: colors.primary }]}>{plan.price_dkk} kr</Text>
                <Text style={[styles.priceUnit, { color: textSecondaryColor }]}>/ måned</Text>
              </View>

              <View style={styles.featuresContainer}>
                <View style={styles.featureRow}>
                  <IconSymbol
                    ios_icon_name="checkmark.circle.fill"
                    android_material_icon_name="check_circle"
                    size={20}
                    color={colors.primary}
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
                    color={colors.primary}
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
                    color={colors.primary}
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
                    color={colors.primary}
                  />
                  <Text style={[styles.featureText, { color: textColor }]}>
                    Opsig når som helst
                  </Text>
                </View>
              </View>

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
                    {isSignupFlow ? 'Vælg denne plan' : 'Start prøveperiode'}
                  </Text>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </View>

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
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
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
  currentSubscriptionCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
  },
  subscriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  subscriptionInfo: {
    flex: 1,
  },
  currentPlanName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  currentPlanStatus: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  subscriptionDetails: {
    gap: 12,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailText: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.95,
  },
  changePlanButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  changePlanButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
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
  infoBox: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
});
