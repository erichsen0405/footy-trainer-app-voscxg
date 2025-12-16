
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
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
  const [showPlans, setShowPlans] = useState(isSignupFlow); // Collapsed by default unless in signup flow
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
    const confirmed = window.confirm(
      `Vil du starte en 14-dages gratis prøveperiode med ${planName} planen?\n\nDu kan oprette op til ${maxPlayers} spiller${maxPlayers > 1 ? 'e' : ''}.`
    );

    if (confirmed) {
      await attemptCreateSubscription(planId, planName);
    }
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
        
        window.alert('Succes! 🎉\n\nDin 14-dages gratis prøveperiode er startet. Du kan nu oprette spillere.');
      } else if (result.alreadyHasSubscription) {
        // User already has a subscription - hide plans and show current subscription
        console.log('[SubscriptionManager] User already has subscription, hiding plans and showing current subscription');
        setShowPlans(false);
        setRetryCount(0);
        
        // Show a friendly message
        window.alert('Du har allerede et abonnement\n\nDit nuværende abonnement vises nu.');
      } else {
        console.error('[SubscriptionManager] Subscription creation failed:', result.error);
        
        // Show error with retry option
        const retry = window.confirm(
          `Fejl ved oprettelse af abonnement\n\n${result.error || 'Kunne ikke oprette abonnement'}\n\nVil du prøve igen?`
        );

        if (retry) {
          const newRetryCount = retryCount + 1;
          setRetryCount(newRetryCount);
          
          if (newRetryCount >= 3) {
            window.alert(
              'Vedvarende fejl\n\n' +
              'Der er problemer med at oprette dit abonnement. Dette kan skyldes:\n\n' +
              '• Dårlig internetforbindelse\n' +
              '• Server problemer\n\n' +
              'Prøv venligst:\n' +
              '1. Tjek din internetforbindelse\n' +
              '2. Log ud og ind igen\n' +
              '3. Genindlæs siden\n\n' +
              'Hvis problemet fortsætter, kontakt support.'
            );
            setRetryCount(0);
          } else {
            attemptCreateSubscription(planId, planName, true);
          }
        } else {
          setRetryCount(0);
        }
      }
    } catch (error: any) {
      console.error('[SubscriptionManager] Unexpected error:', error);
      window.alert('Uventet fejl\n\nDer opstod en uventet fejl. Prøv venligst igen.');
      setRetryCount(0);
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

  return (
    <View style={styles.container}>
      {/* Header */}
      {!isSignupFlow && (
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Vælg din plan</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            Start med 14 dages gratis prøveperiode
          </Text>
        </View>
      )}

      {/* Current Plan Display */}
      {!isSignupFlow && subscriptionStatus?.hasSubscription && (
        <View style={[styles.currentPlanBanner, { backgroundColor: getPlanColor(subscriptionStatus.planName) }]}>
          <View style={styles.currentPlanContent}>
            <IconSymbol
              ios_icon_name={getPlanIcon(subscriptionStatus.planName)}
              android_material_icon_name="verified"
              size={32}
              color="#fff"
            />
            <View style={styles.currentPlanInfo}>
              <Text style={styles.currentPlanLabel}>Din nuværende plan:</Text>
              <Text style={styles.currentPlanName}>{subscriptionStatus.planName}</Text>
            </View>
            <View style={styles.currentPlanBadge}>
              <Text style={styles.currentPlanBadgeText}>
                {subscriptionStatus.status === 'trial' ? 'Prøveperiode' : 'Aktiv'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Collapsible Plans Section */}
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

      {/* Plans List (Collapsible) */}
      {showPlans && (
        <View style={styles.plansContainer}>
          {filteredPlans.map((plan, index) => {
            const isPopular = index === Math.floor(filteredPlans.length / 2); // Middle plan is popular
            const isCreating = creatingPlanId === plan.id;
            const isCurrentPlan = !isSignupFlow && subscriptionStatus?.planName === plan.name;

            return (
              <TouchableOpacity
                key={plan.id}
                style={[
                  styles.planCard,
                  { backgroundColor: cardBgColor },
                  isPopular && styles.popularPlan,
                  isCurrentPlan && styles.currentPlanCard,
                ]}
                onPress={() => handleSelectPlan(plan.id, plan.name, plan.max_players)}
                disabled={isCreating || isCurrentPlan}
                activeOpacity={0.7}
              >
                {isPopular && !isCurrentPlan && (
                  <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                    <Text style={styles.popularBadgeText}>Mest populær</Text>
                  </View>
                )}

                {isCurrentPlan && (
                  <View style={[styles.currentBadge, { backgroundColor: colors.success || '#4CAF50' }]}>
                    <Text style={styles.currentBadgeText}>Din nuværende plan</Text>
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

                {!isCurrentPlan && (
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

      {/* Subscription Details (when not showing plans) */}
      {!isSignupFlow && subscriptionStatus?.hasSubscription && !showPlans && (
        <View style={styles.subscriptionDetailsContainer}>
          <View style={[styles.detailCard, { backgroundColor: cardBgColor }]}>
            <View style={styles.detailHeader}>
              <IconSymbol
                ios_icon_name="person.3.fill"
                android_material_icon_name="group"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.detailTitle, { color: textColor }]}>Spillere</Text>
            </View>
            <Text style={[styles.detailValue, { color: textColor }]}>
              {subscriptionStatus.currentPlayers} / {subscriptionStatus.maxPlayers}
            </Text>
          </View>

          {subscriptionStatus.status === 'trial' && (
            <View style={[styles.detailCard, { backgroundColor: cardBgColor }]}>
              <View style={styles.detailHeader}>
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="event"
                  size={24}
                  color={colors.primary}
                />
                <Text style={[styles.detailTitle, { color: textColor }]}>Prøveperiode</Text>
              </View>
              <Text style={[styles.detailValue, { color: textColor }]}>
                {getDaysRemaining(subscriptionStatus.trialEnd)} dage tilbage
              </Text>
            </View>
          )}

          <View style={[styles.detailCard, { backgroundColor: cardBgColor }]}>
            <View style={styles.detailHeader}>
              <IconSymbol
                ios_icon_name="clock"
                android_material_icon_name="schedule"
                size={24}
                color={colors.primary}
              />
              <Text style={[styles.detailTitle, { color: textColor }]}>Udløber</Text>
            </View>
            <Text style={[styles.detailValue, { color: textColor, fontSize: 14 }]}>
              {formatDate(subscriptionStatus.status === 'trial' ? subscriptionStatus.trialEnd : subscriptionStatus.currentPeriodEnd)}
            </Text>
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
                Din prøveperiode udløber om {getDaysRemaining(subscriptionStatus.trialEnd)} dage. Efter prøveperioden skal du tilføje betalingsoplysninger for at fortsætte.
              </Text>
            </View>
          )}
        </View>
      )}
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
  popularPlan: {
    borderColor: colors.primary,
  },
  currentPlanCard: {
    borderColor: colors.success || '#4CAF50',
    opacity: 0.7,
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
  },
  currentBadgeText: {
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
  subscriptionDetailsContainer: {
    gap: 16,
  },
  detailCard: {
    borderRadius: 12,
    padding: 20,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 24,
    fontWeight: 'bold',
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
