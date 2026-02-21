import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, TextInput, useColorScheme, Platform, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';
import { supabase } from '@/integrations/supabase/client';
import CreatePlayerModal from '@/components/CreatePlayerModal';
import PlayersList from '@/components/PlayersList';
import ExternalCalendarManager from '@/components/ExternalCalendarManager';
import SubscriptionManager from '@/components/SubscriptionManager';
import AppleSubscriptionManager from '@/components/AppleSubscriptionManager';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';
import { useAppleIAP, PRODUCT_IDS } from '@/contexts/AppleIAPContext';
import { getSubscriptionGateState } from '@/utils/subscriptionGate';

interface UserProfile {
  full_name: string | null;
  phone_number: string | null;
}

interface AdminInfo {
  full_name: string;
  phone_number: string;
  email: string;
}

type UpgradeTarget = 'library' | 'calendarSync' | 'trainerLinking';

type CollapsibleSectionProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  titleColor: string;
  chevronColor: string;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
};

const normalizeUpgradeTarget = (value: string | string[] | undefined): UpgradeTarget | null => {
  if (!value) {
    return null;
  }
  const resolved = Array.isArray(value) ? value[0] : value;
  if (resolved === 'library' || resolved === 'calendarSync' || resolved === 'trainerLinking') {
    return resolved;
  }
  return null;
};

const extractFirstParamValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);
const AUTH_REDIRECT_URL = 'footballcoach://auth/callback';

const isTruthySearchParam = (value?: string | null) => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
};

const FullScreenLoading = ({ message }: { message: string }) => (
  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
    <ActivityIndicator size="large" color={colors.primary} />
    <Text style={{ marginTop: 16, color: colors.text, fontSize: 16 }}>{message}</Text>
  </View>
);

const CollapsibleSection = ({
  title,
  expanded,
  onToggle,
  titleColor,
  chevronColor,
  icon,
  headerActions,
  children,
}: CollapsibleSectionProps) => (
  <>
    <Pressable
      style={styles.collapsibleHeader}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <View style={styles.sectionTitleContainer}>
        {icon}
        <Text style={[styles.sectionTitle, { color: titleColor }]}>{title}</Text>
      </View>
      <View style={styles.sectionHeaderRight}>
        {headerActions}
        <IconSymbol
          ios_icon_name={expanded ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={expanded ? 'expand_less' : 'expand_more'}
          size={24}
          color={chevronColor}
        />
      </View>
    </Pressable>
    {expanded ? children : null}
  </>
);

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'trainer' | 'player' | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [playersRefreshTrigger, setPlayersRefreshTrigger] = useState(0);
  
  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  
  // Collapsible sections
  const [isProfileInfoExpanded, setIsProfileInfoExpanded] = useState(true);
  const [isAdminInfoExpanded, setIsAdminInfoExpanded] = useState(true);
  const [isCalendarSyncExpanded, setIsCalendarSyncExpanded] = useState(true);
  const [isSubscriptionExpanded, setIsSubscriptionExpanded] = useState(true);
  const [subscriptionSectionY, setSubscriptionSectionY] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const params = useLocalSearchParams<{
    upgradeTarget?: string | string[];
    openSubscription?: string | string[];
    email?: string | string[];
    authMode?: string | string[];
  }>();
  const routeUpgradeTarget = normalizeUpgradeTarget(params.upgradeTarget);
  const openSubscriptionParam = extractFirstParamValue(params.openSubscription);
  const routeEmail = extractFirstParamValue(params.email);
  const routeAuthMode = extractFirstParamValue(params.authMode);
  const shouldAutoOpenSubscription = isTruthySearchParam(openSubscriptionParam);
  const [manualUpgradeTarget, setManualUpgradeTarget] = useState<UpgradeTarget | null>(null);
  const hasConsumedOpenSubscriptionRef = useRef(false);
  const [forceShowPlansOnce, setForceShowPlansOnce] = useState(false);
  const forceShowPlansTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoOpenTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateOpenSubscriptionParam = useCallback(
    (value?: string) => {
      try {
        router.setParams({ openSubscription: value } as any);
      } catch (error) {
        console.warn('[PROFILE WEB] Failed to update openSubscription param', error);
      }
    },
    [router],
  );

  const clearForceShowPlansTimeout = useCallback(() => {
    if (forceShowPlansTimeoutRef.current) {
      clearTimeout(forceShowPlansTimeoutRef.current);
      forceShowPlansTimeoutRef.current = null;
    }
  }, []);

  const clearAutoOpenTimeout = useCallback(() => {
    if (autoOpenTimeoutRef.current) {
      clearTimeout(autoOpenTimeoutRef.current);
      autoOpenTimeoutRef.current = null;
    }
  }, []);

  const scheduleForceShowPlansReset = useCallback(
    (delay = 800) => {
      clearForceShowPlansTimeout();
      forceShowPlansTimeoutRef.current = setTimeout(() => {
        setForceShowPlansOnce(false);
        forceShowPlansTimeoutRef.current = null;
      }, delay);
    },
    [clearForceShowPlansTimeout],
  );

  useEffect(() => () => clearForceShowPlansTimeout(), [clearForceShowPlansTimeout]);
  useEffect(() => () => clearAutoOpenTimeout(), [clearAutoOpenTimeout]);

  useEffect(() => {
    if (!routeEmail) return;
    setEmail(routeEmail);
  }, [routeEmail]);

  useEffect(() => {
    if (routeAuthMode === 'signup') {
      setIsSignUp(true);
    } else if (routeAuthMode === 'login') {
      setIsSignUp(false);
    }
  }, [routeAuthMode]);
  
  // Debug state
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [authTransitioning, setAuthTransitioning] = useState(false);
  const [authTransitionMessage, setAuthTransitionMessage] = useState('Opdaterer abonnement...');
  const lastKnownUserRef = useRef<any>(null);
  const graceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Get subscription status
  const { subscriptionStatus, refreshSubscription } = useSubscription();
  const { entitlementSnapshot } = useAppleIAP();
  const subscriptionStatusRef = useRef(subscriptionStatus);
  useEffect(() => {
    subscriptionStatusRef.current = subscriptionStatus;
  }, [subscriptionStatus]);
  const subscriptionGate = getSubscriptionGateState({
    user,
    subscriptionStatus,
    entitlementSnapshot,
  });
  const shouldShowChooseSubscription = subscriptionGate.shouldShowChooseSubscription;

  const { featureAccess, isLoading: subscriptionFeaturesLoading } = useSubscriptionFeatures();
  const resolvedFeatureAccess = featureAccess ?? {
    calendarSync: false,
    trainerLinking: false,
    library: false,
  };

  const canUseCalendarSync = resolvedFeatureAccess.calendarSync;
  const canLinkTrainer = resolvedFeatureAccess.trainerLinking;
  const effectiveUpgradeTarget = manualUpgradeTarget ?? routeUpgradeTarget;
  const highlightProductId =
    userRole === 'player' && effectiveUpgradeTarget ? PRODUCT_IDS.PLAYER_PREMIUM : undefined;
  const shouldHighlightPremiumPlan = Boolean(highlightProductId);
  const forcePlayerPlanListOpen =
    forceShowPlansOnce ||
    (userRole === 'player' && !subscriptionStatus?.hasSubscription);
  const subscriptionSelectionRole =
    userRole === 'player' ? 'player' : userRole ? 'trainer' : null;

  const addDebugInfo = (message: string) => {
    console.log('[PROFILE DEBUG]', message);
    setDebugInfo(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]} - ${message}`]);
  };

  const scrollToSubscription = useCallback(() => {
    if (!scrollViewRef.current || subscriptionSectionY === null) {
      return;
    }
    scrollViewRef.current.scrollTo({ y: Math.max(subscriptionSectionY - 32, 0), animated: true });
  }, [subscriptionSectionY]);

  const handleOpenSubscriptionSection = useCallback((target?: UpgradeTarget) => {
    if (target) {
      setManualUpgradeTarget(target);
    }
    clearForceShowPlansTimeout();
    setForceShowPlansOnce(true);
    scheduleForceShowPlansReset();
    setIsSubscriptionExpanded(true);
    setTimeout(() => {
      scrollToSubscription();
    }, 200);
  }, [clearForceShowPlansTimeout, scheduleForceShowPlansReset, scrollToSubscription]);

  const handleToggleSubscriptionSection = useCallback(() => {
    clearForceShowPlansTimeout();
    setForceShowPlansOnce(false);
    setIsSubscriptionExpanded(prev => !prev);
  }, [clearForceShowPlansTimeout]);

  const checkUserOnboarding = useCallback(async (userId: string) => {
    addDebugInfo('Checking user onboarding status...');
    
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (roleError || !roleData) {
        addDebugInfo('No role found - defer to subscription for role');
        setUserRole(null);
        await refreshSubscription();
        return;
      }

      const role = roleData.role as 'admin' | 'trainer' | 'player';
      setUserRole(role);
      addDebugInfo(`Role found: ${role}`);

    // Refresh subscription status after role resolution
    await refreshSubscription();

    // User is fully onboarded
    await fetchUserProfile(userId);
    
    if (role === 'player') {
      await fetchAdminInfo(userId);
    }
  }, [refreshSubscription]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      lastKnownUserRef.current = user;
      if (user) {
        await refreshSubscription();
        await checkUserOnboarding(user.id);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setAuthTransitioning(false);
        setUser(null);
        lastKnownUserRef.current = null;
        hasConsumedOpenSubscriptionRef.current = false;
        clearForceShowPlansTimeout();
        setForceShowPlansOnce(false);
        return;
      }
      if (session?.user) {
        if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
        setAuthTransitioning(false);
        setUser(session.user);
        lastKnownUserRef.current = session.user;
        await refreshSubscription();
        await checkUserOnboarding(session.user.id);
        return;
      }
      setAuthTransitioning(true);
      setUser(lastKnownUserRef.current);
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
      graceTimeoutRef.current = setTimeout(async () => {
        const { data } = await supabase.auth.getSession();
        const stable = data.session?.user ?? null;
        setUser(stable);
        lastKnownUserRef.current = stable;
        if (stable) {
          await refreshSubscription();
          await checkUserOnboarding(stable.id);
        }
        setAuthTransitioning(false);
      }, 600);
    });

    return () => {
      subscription.unsubscribe();
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
    };
  }, [checkUserOnboarding, refreshSubscription, clearForceShowPlansTimeout]);

  useEffect(() => {
    if (shouldHighlightPremiumPlan) {
      setIsSubscriptionExpanded(true);
    }
  }, [shouldHighlightPremiumPlan]);

  useEffect(() => {
    if (!shouldHighlightPremiumPlan || subscriptionSectionY === null) {
      return;
    }
    const timer = setTimeout(() => {
      scrollToSubscription();
    }, 300);
    return () => clearTimeout(timer);
  }, [shouldHighlightPremiumPlan, subscriptionSectionY, scrollToSubscription]);

  useEffect(() => {
    if (!shouldAutoOpenSubscription) {
      if (hasConsumedOpenSubscriptionRef.current) {
        hasConsumedOpenSubscriptionRef.current = false;
      }
      return;
    }

    if (hasConsumedOpenSubscriptionRef.current) {
      return;
    }

    hasConsumedOpenSubscriptionRef.current = true;
    clearForceShowPlansTimeout();
    clearAutoOpenTimeout();
    setForceShowPlansOnce(true);
    setManualUpgradeTarget(null);
    setIsSubscriptionExpanded(true);

    autoOpenTimeoutRef.current = setTimeout(() => {
      scrollToSubscription();
      scheduleForceShowPlansReset();
      updateOpenSubscriptionParam(undefined);
      autoOpenTimeoutRef.current = null;
    }, 250);

    return () => {
      clearAutoOpenTimeout();
    };
  }, [
    clearAutoOpenTimeout,
    clearForceShowPlansTimeout,
    scheduleForceShowPlansReset,
    scrollToSubscription,
    shouldAutoOpenSubscription,
    updateOpenSubscriptionParam,
  ]);

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone_number')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        return;
      }

      if (data) {
        setProfile(data);
        setEditName(data.full_name || '');
        setEditPhone(data.phone_number || '');
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    }
  };

  const fetchAdminInfo = async (playerId: string) => {
    try {
      const { data: relationship, error: relError } = await supabase
        .from('admin_player_relationships')
        .select('admin_id')
        .eq('player_id', playerId)
        .maybeSingle();

      // If no relationship exists yet (player hasn't been added by a trainer), just return
      if (relError && relError.code !== 'PGRST116') {
        console.error('Error fetching admin relationship:', relError);
        return;
      }

      if (!relationship) {
        console.log('No admin relationship found yet - player has not been added by a trainer');
        setAdminInfo(null);
        return;
      }

      const { data: adminProfile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, phone_number')
        .eq('user_id', relationship.admin_id)
        .single();

      if (profileError) {
        console.error('Error fetching admin profile:', profileError);
      }

      setAdminInfo({
        full_name: adminProfile?.full_name || 'Din træner',
        phone_number: adminProfile?.phone_number || '',
        email: '',
      });
    } catch (error) {
      console.error('Error in fetchAdminInfo:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existingProfile) {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: editName,
            phone_number: editPhone,
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            full_name: editName,
            phone_number: editPhone,
          });

        if (error) throw error;
      }

      await fetchUserProfile(user.id);
      setIsEditingProfile(false);
      window.alert('Succes! Din profil er opdateret');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      window.alert('Fejl: Kunne ikke gemme profil');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!email || !password) {
      window.alert('Fejl: Udfyld venligst både email og adgangskode');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      window.alert('Fejl: Indtast venligst en gyldig email-adresse');
      return;
    }

    if (password.length < 6) {
      window.alert('Fejl: Adgangskoden skal være mindst 6 tegn lang');
      return;
    }

    setLoading(true);
    setDebugInfo([]);
    addDebugInfo('Starting signup process...');
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          emailRedirectTo: AUTH_REDIRECT_URL,
        }
      });

      if (error) {
        addDebugInfo(`❌ Signup error: ${error.message}`);
        console.error('Sign up error:', error);
        const errorMessage = error.message?.toLowerCase?.() ?? '';
        if (errorMessage.includes('already registered') || errorMessage.includes('already been registered')) {
          router.replace({
            pathname: '/auth/check-email',
            params: { email: email.trim().toLowerCase() },
          });
          return;
        }
        window.alert(`Kunne ikke oprette konto\n\n${error.message || 'Der opstod en fejl. Prøv venligst igen.'}`);
        return;
      }

      if (!data.user) {
        addDebugInfo('❌ No user returned from signup');
        window.alert('Fejl: Kunne ikke oprette bruger. Prøv venligst igen.');
        return;
      }

      addDebugInfo(`✅ User created: ${data.user.id}`);
      addDebugInfo(`Session exists: ${data.session ? 'Yes - Auto logged in!' : 'No - Email confirmation required'}`);
      const identities = Array.isArray((data.user as any)?.identities) ? (data.user as any).identities : null;
      const isExistingUserResponse = Boolean(data.user && identities && identities.length === 0);
      if (isExistingUserResponse) {
        addDebugInfo('Account already exists (identities empty), redirecting to login');
        window.alert(
          'Denne e-mail har sandsynligvis allerede en konto. Derfor sendes der ikke altid en ny bekrAeftelsesmail. Proev at logge ind i stedet.'
        );
        router.replace({
          pathname: '/(tabs)/profile',
          params: { email: email.trim().toLowerCase(), authMode: 'login' },
        });
        return;
      }
      setEmail('');
      setPassword('');
      setShowSuccessMessage(false);
      setIsSignUp(false);
      router.replace({
        pathname: '/auth/check-email',
        params: { email: email.trim().toLowerCase() },
      });
    } catch (error: any) {
      addDebugInfo(`❌ Unexpected error: ${error.message}`);
      console.error('Signup error:', error);
      window.alert(`Fejl: ${error.message || 'Der opstod en uventet fejl. Prøv venligst igen.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      window.alert('Fejl: Udfyld venligst både email og adgangskode');
      return;
    }

    setLoading(true);
    console.log('Attempting to sign in with:', email);
    
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      console.log('Sign in response:', { 
        user: data.user?.id, 
        session: data.session ? 'exists' : 'null',
        error: error?.message 
      });

      if (error) {
        console.error('Sign in error:', error);
        const errorMessage = error.message?.toLowerCase?.() ?? '';
        
        if (errorMessage.includes('email not confirmed')) {
          router.replace({
            pathname: '/auth/check-email',
            params: { email: normalizedEmail },
          });
        } else if (error.message.includes('Invalid login credentials')) {
          window.alert('Login fejlede\n\nEmail eller adgangskode er forkert.\n\nHusk:\n• Har du bekræftet din email?\n• Er du sikker på at du har oprettet en konto?\n• Prøv at nulstille din adgangskode hvis du har glemt den.');
        } else {
          window.alert(`Login fejlede\n\n${error.message || 'Der opstod en fejl. Prøv venligst igen.'}`);
        }
        return;
      }

      if (data.session) {
        window.alert('Succes! 🎉\n\nDu er nu logget ind!');
        setEmail('');
        setPassword('');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      window.alert(`Fejl: ${error.message || 'Der opstod en uventet fejl. Prøv venligst igen.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('[PROFILE WEB] Opening forgot-password', { normalizedEmail });
      router.replace({
        pathname: '/auth/forgot-password',
        params: { email: normalizedEmail },
      });
    } catch (error: any) {
      console.error('[PROFILE WEB] Failed to open forgot-password screen', error);
      window.alert('Kunne ikke aabne nulstilling af adgangskode.');
    }
  };

  const handleSignOut = useCallback(async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setUser(null);
      setUserRole(null);
      setProfile(null);
      setAdminInfo(null);
      setManualUpgradeTarget(null);
      setIsEditingProfile(false);
      setShowCreatePlayerModal(false);
      setPlayersRefreshTrigger(0);
      setEditName('');
      setEditPhone('');
      setEmail('');
      setPassword('');
      setShowSuccessMessage(false);
      setDebugInfo([]);
      setAuthTransitioning(false);
      setAuthTransitionMessage('Opdaterer abonnement...');
      setIsSubscriptionExpanded(false);
      setIsCalendarSyncExpanded(false);
      hasConsumedOpenSubscriptionRef.current = false;
      clearForceShowPlansTimeout();
      setForceShowPlansOnce(false);

      window.alert('Logget ud\n\nDu er nu logget ud');
    } catch (error: any) {
      window.alert(`Fejl\n\n${error?.message || 'Der opstod en fejl. Prøv igen.'}`);
    } finally {
      setLoading(false);
    }
  }, [clearForceShowPlansTimeout]);

  const getPlanColor = (planName: string | null) => {
    if (!planName) return colors.primary;
    const normalized = planName.toLowerCase();
    if (normalized.includes('premium') || normalized.includes('gold')) return '#FFD700';
    if (normalized.includes('standard') || normalized.includes('silver')) return '#C0C0C0';
    if (normalized.includes('basic') || normalized.includes('bronze') || normalized.includes('spiller')) return '#CD7F32';
    return colors.primary;
  };

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const isTrainer = userRole === 'admin' || userRole === 'trainer';

  // Auth-transition gate FIRST
  if (authTransitioning) {
    return <FullScreenLoading message={authTransitionMessage} />;
  }

  if (user && shouldShowChooseSubscription) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <ScrollView
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: textColor }]}>Vælg dit abonnement</Text>
            <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
              Vælg et abonnement for at fortsætte — du kan altid ændre det senere.
            </Text>
          </View>
          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            <SubscriptionManager
              isSignupFlow
              forceShowPlans
              selectedRole={subscriptionSelectionRole ?? undefined}
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Profil</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            {user ? `Logget ind som ${user.email}` : 'Log ind for at gemme dine data'}
          </Text>
        </View>

        {user ? (
          <>
            <View style={[styles.card, { backgroundColor: cardBgColor }]}>
              <View style={styles.userInfo}>
                <View style={styles.avatarContainer}>
                  <View style={[styles.avatar, { 
                    backgroundColor: subscriptionStatus?.hasSubscription 
                      ? getPlanColor(subscriptionStatus.planName)
                      : colors.primary 
                  }]}>
                    <IconSymbol 
                      ios_icon_name="person.fill" 
                      android_material_icon_name="person" 
                      size={48} 
                      color="#fff" 
                    />
                  </View>
                  {subscriptionStatus?.hasSubscription && (
                    <View style={[styles.subscriptionBadge, { 
                      backgroundColor: getPlanColor(subscriptionStatus.planName) 
                    }]}>
                      <IconSymbol
                        ios_icon_name="star.fill"
                        android_material_icon_name="star"
                        size={16}
                        color="#fff"
                      />
                    </View>
                  )}
                </View>
                <View style={styles.userDetails}>
                  <Text style={[styles.userName, { color: textColor }]}>
                    {profile?.full_name || user.email?.split('@')[0] || 'Bruger'}
                  </Text>
                  <Text style={[styles.userEmail, { color: textSecondaryColor }]}>
                    {user.email}
                  </Text>
                  <View style={styles.badgesRow}>
                    {userRole && (
                      <View style={[styles.roleBadge, { 
                        backgroundColor: isTrainer ? colors.primary : '#FF9500' 
                      }]}>
                        <Text style={styles.roleText}>
                          {isTrainer ? 'Træner' : 'Spiller'}
                        </Text>
                      </View>
                    )}
                    {subscriptionStatus?.hasSubscription && (
                      <View style={[styles.planBadge, { 
                        backgroundColor: getPlanColor(subscriptionStatus.planName) 
                      }]}>
                        <IconSymbol
                          ios_icon_name="star.fill"
                          android_material_icon_name="star"
                          size={12}
                          color="#fff"
                        />
                        <Text style={styles.planBadgeText}>
                          {subscriptionStatus.planName}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </View>

            {/* Profile Info Section */}
            <View style={[styles.card, { backgroundColor: cardBgColor }]}>
              <CollapsibleSection
                title="Profil Information"
                expanded={isProfileInfoExpanded}
                onToggle={() => setIsProfileInfoExpanded(prev => !prev)}
                titleColor={textColor}
                chevronColor={textSecondaryColor}
                icon={<IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={24} color={colors.primary} />}
                headerActions={
                  !isEditingProfile ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation?.();
                        setIsEditingProfile(true);
                      }}
                      accessibilityRole="button"
                    >
                      <IconSymbol
                        ios_icon_name="pencil"
                        android_material_icon_name="edit"
                        size={20}
                        color={colors.primary}
                      />
                    </Pressable>
                  ) : null
                }
              >
                {isEditingProfile ? (
                  <View style={styles.editForm}>
                    <Text style={[styles.label, { color: textColor }]}>Navn</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Dit navn"
                      placeholderTextColor={textSecondaryColor}
                    />

                    <Text style={[styles.label, { color: textColor }]}>Telefon</Text>
                    <TextInput
                      style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                      value={editPhone}
                      onChangeText={setEditPhone}
                      placeholder="+45 12 34 56 78"
                      placeholderTextColor={textSecondaryColor}
                    />

                    <View style={styles.editButtons}>
                      <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.highlight }]}
                        onPress={() => {
                          setIsEditingProfile(false);
                          setEditName(profile?.full_name || '');
                          setEditPhone(profile?.phone_number || '');
                        }}
                      >
                        <Text style={[styles.buttonText, { color: textColor }]}>Annuller</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.button, { backgroundColor: colors.primary }]}
                        onPress={handleSaveProfile}
                        disabled={loading}
                      >
                        {loading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={[styles.buttonText, { color: '#fff' }]}>Gem</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.profileInfo}>
                    {profile?.full_name && (
                      <View style={styles.infoRow}>
                        <IconSymbol
                          ios_icon_name="person.fill"
                          android_material_icon_name="person"
                          size={20}
                          color={colors.primary}
                        />
                        <Text style={[styles.infoText, { color: textColor }]}>
                          {profile.full_name}
                        </Text>
                      </View>
                    )}
                    {profile?.phone_number && (
                      <View style={styles.infoRow}>
                        <IconSymbol
                          ios_icon_name="phone.fill"
                          android_material_icon_name="phone"
                          size={20}
                          color={colors.primary}
                        />
                        <Text style={[styles.infoText, { color: textColor }]}>
                          {profile.phone_number}
                        </Text>
                      </View>
                    )}
                    {!profile?.full_name && !profile?.phone_number && (
                      <Text style={[styles.emptyText, { color: textSecondaryColor }]}>
                        Ingen profilinformation tilg?ngelig. Tryk p? rediger for at tilf?je.
                      </Text>
                    )}
                  </View>
                )}
              </CollapsibleSection>
            </View>

            {/* Admin Info for Players */}
            {userRole === 'player' && (
              subscriptionFeaturesLoading ? (
                <View style={[styles.card, { backgroundColor: cardBgColor, alignItems: 'center', paddingVertical: 24 }]}>
                  <CollapsibleSection
                    title="Din Træner"
                    expanded={isAdminInfoExpanded}
                    onToggle={() => setIsAdminInfoExpanded(prev => !prev)}
                    titleColor={textColor}
                    chevronColor={textSecondaryColor}
                    icon={<IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={24} color={colors.primary} />}
                  >
                    <ActivityIndicator size="small" color={colors.primary} />
                  </CollapsibleSection>
                </View>
              ) : canLinkTrainer ? (
                adminInfo ? (
                  <View style={[styles.card, { backgroundColor: cardBgColor }]}>
                    <CollapsibleSection
                      title="Din Træner"
                      expanded={isAdminInfoExpanded}
                      onToggle={() => setIsAdminInfoExpanded(prev => !prev)}
                      titleColor={textColor}
                      chevronColor={textSecondaryColor}
                      icon={<IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={24} color={colors.primary} />}
                    >
                      <View style={styles.profileInfo}>
                        <View style={styles.infoRow}>
                          <IconSymbol
                            ios_icon_name="person.fill"
                            android_material_icon_name="person"
                            size={20}
                            color={colors.primary}
                          />
                          <Text style={[styles.infoText, { color: textColor }]}>
                            {adminInfo.full_name}
                          </Text>
                        </View>
                        {adminInfo.phone_number && (
                          <View style={styles.infoRow}>
                            <IconSymbol
                              ios_icon_name="phone.fill"
                              android_material_icon_name="phone"
                              size={20}
                              color={colors.primary}
                            />
                            <Text style={[styles.infoText, { color: textColor }]}>
                              {adminInfo.phone_number}
                            </Text>
                          </View>
                        )}
                      </View>
                    </CollapsibleSection>
                  </View>
                ) : null
              ) : (
                <View style={[styles.card, { backgroundColor: cardBgColor }]}>
                  <CollapsibleSection
                    title="Din Træner"
                    expanded={isAdminInfoExpanded}
                    onToggle={() => setIsAdminInfoExpanded(prev => !prev)}
                    titleColor={textColor}
                    chevronColor={textSecondaryColor}
                    icon={<IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={24} color={colors.primary} />}
                  >
                    <PremiumFeatureGate
                      title="Premium kræves for træner-adgang"
                      description="Opgrader for at forbinde dig med din træner og få skræddersyede aktiviteter."
                      onPress={() => handleOpenSubscriptionSection('trainerLinking')}
                      icon={{ ios: 'person.2.circle', android: 'groups' }}
                      align="left"
                    />
                  </CollapsibleSection>
                </View>
              )
            )}

            {/* Calendar Sync Section - Collapsible - Available for all users */}
            <View style={[styles.card, { backgroundColor: cardBgColor }]}>
              <CollapsibleSection
                title="Kalender Synkronisering"
                expanded={isCalendarSyncExpanded}
                onToggle={() => setIsCalendarSyncExpanded(prev => !prev)}
                titleColor={textColor}
                chevronColor={textSecondaryColor}
                icon={(
                  <IconSymbol
                    ios_icon_name="calendar.badge.plus"
                    android_material_icon_name="event"
                    size={28}
                    color={colors.primary}
                  />
                )}
              >
                {subscriptionFeaturesLoading ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                ) : canUseCalendarSync ? (
                  <>
                    <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
                      Tilknyt eksterne kalendere (iCal/webcal) for automatisk at importere aktiviteter
                    </Text>
                    <ExternalCalendarManager />
                  </>
                ) : (
                  <PremiumFeatureGate
                    title="Kalendersynk er låst op i Premium"
                    description="Importer automatisk aktiviteter ved at opgradere til Premium."
                    onPress={() => handleOpenSubscriptionSection('calendarSync')}
                    icon={{ ios: 'calendar.badge.plus', android: 'event' }}
                    align="left"
                  />
                )}
              </CollapsibleSection>
            </View>

            {/* Subscription Section - Collapsible - Available for all users */}
            <View
              style={[styles.card, { backgroundColor: cardBgColor }]}
              onLayout={(event) => setSubscriptionSectionY(event.nativeEvent.layout.y)}
            >
              <CollapsibleSection
                title="Abonnement"
                expanded={isSubscriptionExpanded}
                onToggle={handleToggleSubscriptionSection}
                titleColor={textColor}
                chevronColor={textSecondaryColor}
                icon={(
                  <IconSymbol
                    ios_icon_name="creditcard.fill"
                    android_material_icon_name="payment"
                    size={28}
                    color={colors.primary}
                  />
                )}
              >
                <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
                  Administrer dit abonnement
                </Text>
                {userRole === null ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ color: textSecondaryColor, fontSize: 14 }}>
                      Klargør rolle...
                    </Text>
                  </View>
                ) : userRole === 'player' ? (
                  <AppleSubscriptionManager
                    highlightProductId={highlightProductId}
                    forceShowPlans={forcePlayerPlanListOpen}
                  />
                ) : Platform.OS === 'ios' ? (
                  <AppleSubscriptionManager forceShowPlans={forceShowPlansOnce} />
                ) : (
                  <SubscriptionManager forceShowPlans={forceShowPlansOnce} />
                )}
              </CollapsibleSection>
            </View>

            <TouchableOpacity
              style={[styles.signOutButton, { backgroundColor: colors.error }]}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <IconSymbol 
                ios_icon_name="arrow.right.square" 
                android_material_icon_name="logout" 
                size={24} 
                color="#fff" 
              />
              <Text style={styles.signOutButtonText}>Log ud</Text>
            </TouchableOpacity>
          </>
        ) : (
          // Login/Sign up view
          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            {showSuccessMessage && (
              <View style={[styles.successMessage, { backgroundColor: colors.primary }]}>
                <IconSymbol 
                  ios_icon_name="checkmark.circle.fill" 
                  android_material_icon_name="check_circle" 
                  size={48} 
                  color="#fff" 
                />
                <Text style={styles.successTitle}>Konto oprettet! 🎉</Text>
                <Text style={styles.successText}>
                  Din konto er blevet oprettet succesfuldt.{'\n'}
                  Tjek din email for at bekræfte din konto, og log derefter ind.
                </Text>
                
                {/* Debug Info */}
                {debugInfo.length > 0 && (
                  <View style={styles.debugContainer}>
                    <Text style={styles.debugTitle}>📋 Debug Log:</Text>
                    {debugInfo.map((info, index) => (
                      <Text key={index} style={styles.debugText}>{info}</Text>
                    ))}
                  </View>
                )}
              </View>
            )}

            {!showSuccessMessage && (
              <>
                <View style={styles.authToggle}>
                  <TouchableOpacity
                    style={[
                      styles.authToggleButton,
                      !isSignUp && [styles.authToggleButtonActive, { backgroundColor: colors.primary }]
                    ]}
                    onPress={() => {
                      setIsSignUp(false);
                      setDebugInfo([]);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.authToggleText,
                      !isSignUp && styles.authToggleTextActive
                    ]}>
                      Log ind
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.authToggleButton,
                      isSignUp && [styles.authToggleButtonActive, { backgroundColor: colors.primary }]
                    ]}
                    onPress={() => {
                      setIsSignUp(true);
                      setDebugInfo([]);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.authToggleText,
                      isSignUp && styles.authToggleTextActive
                    ]}>
                      Opret konto
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.form}>
                  <Text style={[styles.label, { color: textColor }]}>Email</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="din@email.dk"
                    placeholderTextColor={textSecondaryColor}
                    autoCapitalize="none"
                    autoCorrect={false}
                    testID="auth.login.emailInput"
                    accessibilityLabel="Email"
                  />

                  <Text style={[styles.label, { color: textColor }]}>Adgangskode</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Mindst 6 tegn"
                    placeholderTextColor={textSecondaryColor}
                    secureTextEntry
                    autoCorrect={false}
                    autoCapitalize="none"
                    testID="auth.login.passwordInput"
                    accessibilityLabel="Adgangskode"
                  />

                  <TouchableOpacity
                    style={[
                      styles.authButton,
                      { backgroundColor: colors.primary },
                      loading && { opacity: 0.6 }
                    ]}
                    onPress={isSignUp ? handleSignup : handleLogin}
                    disabled={loading}
                    activeOpacity={0.7}
                    testID="auth.login.submitButton"
                    accessibilityLabel={isSignUp ? 'Opret konto' : 'Log ind'}
                  >
                    {loading ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={[styles.authButtonText, { marginLeft: 12 }]}>
                          {isSignUp ? 'Opretter konto...' : 'Logger ind...'}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.authButtonText}>
                        {isSignUp ? 'Opret konto' : 'Log ind'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {!isSignUp ? (
                    <TouchableOpacity
                      style={styles.forgotPasswordButton}
                      onPress={handleForgotPassword}
                      activeOpacity={0.7}
                      disabled={loading}
                    >
                      <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Glemt adgangskode?</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd', marginTop: 24 }]}>
                  <IconSymbol 
                    ios_icon_name="info.circle" 
                    android_material_icon_name="info" 
                    size={28} 
                    color={colors.secondary} 
                  />
                  <View style={styles.infoTextContainer}>
                    <Text style={[styles.infoTitle, { color: textColor }]}>
                      {isSignUp ? 'Hvad sker der efter oprettelse?' : 'Hvorfor skal jeg logge ind?'}
                    </Text>
                    <Text style={[styles.infoBoxText, { color: textSecondaryColor }]}>
                      {isSignUp
                        ? 'Bekræft din e-mail og log ind.\nVælg derefter abonnement som spiller eller træner.'
                        : 'Log ind for at bruge appen.'
                      }
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <CreatePlayerModal
        visible={showCreatePlayerModal}
        onClose={() => setShowCreatePlayerModal(false)}
        onPlayerCreated={() => {
          setPlayersRefreshTrigger(prev => prev + 1);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 16,
  },
  card: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    marginBottom: 8,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  planBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16,
    marginBottom: 20,
  },
  profileInfo: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    fontSize: 16,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  editForm: {
    gap: 8,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
    marginBottom: 12,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    borderRadius: 14,
    marginHorizontal: 20,
    marginTop: 8,
  },
  signOutButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  successMessage: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  successText: {
    fontSize: 17,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
  },
  authToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  authToggleButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.highlight,
  },
  authToggleButtonActive: {},
  authToggleText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  authToggleTextActive: {
    color: '#fff',
  },
  form: {
    gap: 8,
  },
  authButton: {
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  forgotPasswordButton: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 6,
  },
  forgotPasswordText: {
    fontSize: 14,
    fontWeight: '600',
  },
  authButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 16,
    padding: 20,
    borderRadius: 16,
  },
  infoTextContainer: {
    flex: 1,
    minWidth: 0,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoBoxText: {
    fontSize: 15,
    lineHeight: 22,
  },
  debugContainer: {
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#fff',
  },
  debugScroll: {
    maxHeight: 200,
  },
  debugText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4,
    color: '#fff',
    opacity: 0.9,
  },
  onboardingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  onboardingDescription: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    textAlign: 'center',
  },
  roleCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    marginBottom: 16,
  },
  roleTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  roleDescription: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingOverlay: {
    marginTop: 24,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
});
