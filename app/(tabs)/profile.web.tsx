import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Pressable, TextInput, useColorScheme, Platform, ActivityIndicator, Image } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';
import { supabase } from '@/integrations/supabase/client';
import CreatePlayerModal from '@/components/CreatePlayerModal';
import PlayersList from '@/components/PlayersList';
import ExternalCalendarManager from '@/components/ExternalCalendarManager';
import SubscriptionManager from '@/components/SubscriptionManager';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';
import { getSubscriptionGateState } from '@/utils/subscriptionGate';
import { pickAndUploadProfileImage } from '@/utils/profileImageUpload';
import {
  MAX_PLAYER_PROFILE_POSITIONS,
  PLAYER_PROFILE_POSITION_OPTIONS,
  PROFILE_SELECT_LEGACY,
  PROFILE_SELECT_WITH_PLAYER_FIELDS,
  isMissingPlayerProfileFieldsError,
  normalizePlayerProfilePositions,
  withProfilePlayerFieldDefaults,
} from '@/utils/playerProfileOptions';

interface UserProfile {
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  player_positions: string[];
  club_name: string | null;
  playing_level: string | null;
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
const PROFILE_EDIT_COLLAPSE_MESSAGE = 'Press Cancel or Save before you can close the section.';

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
        {headerActions ? <View style={styles.sectionHeaderActions}>{headerActions}</View> : null}
        <View style={styles.chevronContainer}>
          <IconSymbol
            ios_icon_name={expanded ? 'chevron.up' : 'chevron.down'}
            android_material_icon_name={expanded ? 'expand_less' : 'expand_more'}
            size={24}
            color={chevronColor}
          />
        </View>
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
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editPositions, setEditPositions] = useState<string[]>([]);
  const [editClubName, setEditClubName] = useState('');
  const [editPlayingLevel, setEditPlayingLevel] = useState('');
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);
  
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
  const openSubscriptionScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileSchemaWarningShownRef = useRef(false);
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

  const clearOpenSubscriptionScrollTimeout = useCallback(() => {
    if (openSubscriptionScrollTimeoutRef.current) {
      clearTimeout(openSubscriptionScrollTimeoutRef.current);
      openSubscriptionScrollTimeoutRef.current = null;
    }
  }, []);

  const handleToggleProfileInfoSection = useCallback(() => {
    if (isEditingProfile && isProfileInfoExpanded) {
      window.alert(PROFILE_EDIT_COLLAPSE_MESSAGE);
      return;
    }
    setIsProfileInfoExpanded(prev => !prev);
  }, [isEditingProfile, isProfileInfoExpanded]);

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
  useEffect(() => () => clearOpenSubscriptionScrollTimeout(), [clearOpenSubscriptionScrollTimeout]);

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
  const subscriptionStatusRef = useRef(subscriptionStatus);
  useEffect(() => {
    subscriptionStatusRef.current = subscriptionStatus;
  }, [subscriptionStatus]);
  const subscriptionGate = getSubscriptionGateState({
    user,
    subscriptionStatus,
    entitlementSnapshot: null,
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
  const shouldHighlightPremiumPlan = Boolean(userRole === 'player' && effectiveUpgradeTarget);
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
    clearOpenSubscriptionScrollTimeout();
    openSubscriptionScrollTimeoutRef.current = setTimeout(() => {
      scrollToSubscription();
      openSubscriptionScrollTimeoutRef.current = null;
    }, 200);
  }, [clearForceShowPlansTimeout, clearOpenSubscriptionScrollTimeout, scheduleForceShowPlansReset, scrollToSubscription]);

  const handleToggleSubscriptionSection = useCallback(() => {
    clearForceShowPlansTimeout();
    setForceShowPlansOnce(false);
    setIsSubscriptionExpanded(prev => !prev);
  }, [clearForceShowPlansTimeout]);

  const resetProfileEditor = useCallback((nextProfile: UserProfile | null) => {
    setEditName(nextProfile?.full_name || '');
    setEditPhone(nextProfile?.phone_number || '');
    setEditAvatarUrl(nextProfile?.avatar_url || '');
    setEditPositions(normalizePlayerProfilePositions(nextProfile?.player_positions));
    setEditClubName(nextProfile?.club_name || '');
    setEditPlayingLevel(nextProfile?.playing_level || '');
  }, []);

  const handleProfileImageUpload = async (source: 'camera' | 'library') => {
    if (!user?.id || isUploadingProfileImage) return;

    setIsUploadingProfileImage(true);
    try {
      const uploadedImage = await pickAndUploadProfileImage(user.id, source);
      if (uploadedImage) {
        setEditAvatarUrl(uploadedImage.publicUrl);
      }
    } catch (error: any) {
      window.alert(error?.message || 'Failed to save profile picture');
    } finally {
      setIsUploadingProfileImage(false);
    }
  };

  const toggleProfilePosition = (position: string) => {
    setEditPositions((current) => {
      if (current.includes(position)) {
        return current.filter((item) => item !== position);
      }

      if (current.length >= MAX_PLAYER_PROFILE_POSITIONS) {
        window.alert('You can select up to five positions.');
        return current;
      }

      return [...current, position];
    });
  };

  const warnProfileSchemaFallback = useCallback(() => {
    if (!__DEV__ || profileSchemaWarningShownRef.current) return;
    profileSchemaWarningShownRef.current = true;
    console.warn('[PROFILE WEB] New player profile fields are missing in the database. Temporarily running with legacy profile fields.');
  }, []);

  const fetchUserProfile = useCallback(async (userId: string) => {
    try {
      let { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT_WITH_PLAYER_FIELDS)
        .eq('user_id', userId)
        .single();

      if (error && isMissingPlayerProfileFieldsError(error)) {
        warnProfileSchemaFallback();
        const legacyResult = await supabase
          .from('profiles')
          .select(PROFILE_SELECT_LEGACY)
          .eq('user_id', userId)
          .single();
        data = legacyResult.data ? withProfilePlayerFieldDefaults(legacyResult.data) : null;
        error = legacyResult.error;
      }

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        return;
      }

      if (data) {
        const normalizedProfile = withProfilePlayerFieldDefaults(data);
        setProfile(normalizedProfile);
        resetProfileEditor(normalizedProfile);
      } else {
        setProfile(null);
        resetProfileEditor(null);
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    }
  }, [resetProfileEditor, warnProfileSchemaFallback]);

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
  }, [fetchUserProfile, refreshSubscription]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      lastKnownUserRef.current = user;
      if (user) {
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
          await checkUserOnboarding(stable.id);
        }
        setAuthTransitioning(false);
      }, 600);
    });

    return () => {
      subscription.unsubscribe();
      if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current);
    };
  }, [checkUserOnboarding, clearForceShowPlansTimeout]);

  useEffect(() => {
    if (shouldHighlightPremiumPlan) {
      setIsSubscriptionExpanded(true);
    }
  }, [shouldHighlightPremiumPlan]);

  useEffect(() => {
    if (!shouldHighlightPremiumPlan || subscriptionSectionY === null) {
      return;
    }
    const hours = setTimeout(() => {
      scrollToSubscription();
    }, 300);
    return () => clearTimeout(hours);
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
        full_name: adminProfile?.full_name || 'Your coach',
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
      let savedLegacyOnly = false;
      let { error } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: user.id,
            full_name: editName,
            phone_number: editPhone,
            avatar_url: editAvatarUrl || null,
            player_positions: normalizePlayerProfilePositions(editPositions),
            club_name: editClubName,
            playing_level: editPlayingLevel,
          },
          { onConflict: 'user_id' }
        );

      if (error && isMissingPlayerProfileFieldsError(error)) {
        warnProfileSchemaFallback();
        savedLegacyOnly = true;
        const legacyResult = await supabase
          .from('profiles')
          .upsert(
            {
              user_id: user.id,
              full_name: editName,
              phone_number: editPhone,
            },
            { onConflict: 'user_id' }
          );
        error = legacyResult.error;
      }

      if (error) throw error;

      await fetchUserProfile(user.id);
      setIsEditingProfile(false);
      window.alert(
        savedLegacyOnly
          ? 'Profile saved: Name and phone are updated. The new player profile fields require the database migration to be run.'
          : 'Success! Your profile has been updated'
      );
    } catch (error: any) {
      console.error('Error saving profile:', error);
      window.alert('Error: Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!email || !password) {
      window.alert('Error: Please fill in both email and password');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      window.alert('Error: Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      window.alert('Error: Password must be at least 6 characters long');
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
        window.alert(`Could not create account\n\n${error.message || 'An error occurred. Please try again.'}`);
        return;
      }

      if (!data.user) {
        addDebugInfo('❌ No user returned from signup');
        window.alert('Error: Could not create user. Please try again.');
        return;
      }

      addDebugInfo(`✅ User created: ${data.user.id}`);
      addDebugInfo(`Session exists: ${data.session ? 'Yes - Auto logged in!' : 'No - Email confirmation required'}`);
      const identities = Array.isArray((data.user as any)?.identities) ? (data.user as any).identities : null;
      const isExistingUserResponse = Boolean(data.user && identities && identities.length === 0);
      if (isExistingUserResponse) {
        addDebugInfo('Account already exists (identities empty), redirecting to login');
        window.alert(
          'This email probably already has an account. Because of that, a new confirmation email is not always sent. Try logging in instead.'
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
      window.alert(`Error: ${error.message || 'An unexpected error occurred. Please try again.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      window.alert('Error: Please fill in both email and password');
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
          window.alert('Login failed\n\nEmail or password is incorrect.\n\nRemember:\n• Have you confirmed your email?\n• Are you sure you have created an account?\n• Try to reset your password if you have forgotten it.');
        } else {
          window.alert(`Login failed\n\n${error.message || 'An error occurred. Please try again.'}`);
        }
        return;
      }

      if (data.session) {
        window.alert('Success! 🎉\n\nYou are now logged in!');
        setEmail('');
        setPassword('');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      window.alert(`Error: ${error.message || 'An unexpected error occurred. Please try again.'}`);
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
      window.alert('Failed to open password reset.');
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
      setAuthTransitionMessage('Updating subscription...');
      setIsSubscriptionExpanded(false);
      setIsCalendarSyncExpanded(false);
      hasConsumedOpenSubscriptionRef.current = false;
      clearForceShowPlansTimeout();
      setForceShowPlansOnce(false);

      window.alert('Logged out\n\nYou are now logged out');
    } catch (error: any) {
      window.alert(`Error\n\n${error?.message || 'An error occurred. Try again.'}`);
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
  const isPlayerProfile = userRole === 'player';
  const displayAvatarUrl = isEditingProfile ? editAvatarUrl : profile?.avatar_url || '';
  const displayPlayerPositions = normalizePlayerProfilePositions(profile?.player_positions);
  const hasProfileInfo =
    Boolean(profile?.full_name) ||
    Boolean(profile?.phone_number) ||
    (isPlayerProfile &&
      (Boolean(profile?.club_name) || Boolean(profile?.playing_level) || displayPlayerPositions.length > 0));

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
            <Text style={[styles.headerTitle, { color: textColor }]}>Choose your subscription</Text>
            <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
              Select a subscription to continue — you can always change it later.
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
          <Text style={[styles.headerTitle, { color: textColor }]}>Profile</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            {user ? `Logged in as ${user.email}` : 'Log in to save your data'}
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
	                    {displayAvatarUrl ? (
	                      <Image
	                        source={{ uri: displayAvatarUrl }}
	                        style={styles.avatarImage}
	                        resizeMode="cover"
	                        accessibilityIgnoresInvertColors
	                      />
	                    ) : (
	                      <IconSymbol
	                        ios_icon_name="person.fill"
	                        android_material_icon_name="person"
	                        size={48}
	                        color="#fff"
	                      />
	                    )}
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
                    {profile?.full_name || user.email?.split('@')[0] || 'User'}
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
                          {isTrainer ? 'Coach' : 'Player'}
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
                title="Profile Information"
                expanded={isProfileInfoExpanded}
                onToggle={handleToggleProfileInfoSection}
                titleColor={textColor}
                chevronColor={textSecondaryColor}
                icon={<IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={24} color={colors.primary} />}
                headerActions={
                  !isEditingProfile ? (
                    <Pressable
                      style={styles.headerIconButton}
                      onPress={(event) => {
	                        event.stopPropagation?.();
	                        setIsEditingProfile(true);
	                        setIsProfileInfoExpanded(true);
	                        resetProfileEditor(profile);
	                      }}
                      accessibilityRole="button"
                      hitSlop={8}
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
	                    <View style={styles.profileImageEditor}>
	                      <View style={[styles.profileImagePreview, { backgroundColor: colors.primary }]}>
	                        {editAvatarUrl ? (
	                          <Image
	                            source={{ uri: editAvatarUrl }}
	                            style={styles.profileImagePreviewImage}
	                            resizeMode="cover"
	                            accessibilityIgnoresInvertColors
	                          />
	                        ) : (
	                          <IconSymbol ios_icon_name="person.circle.fill" android_material_icon_name="person" size={42} color="#fff" />
	                        )}
	                      </View>
	                      <View style={styles.profileImageActions}>
	                        <TouchableOpacity
	                          style={[styles.profileImageButton, { backgroundColor: colors.primary }]}
	                          onPress={() => handleProfileImageUpload('camera')}
	                          disabled={isUploadingProfileImage}
	                          activeOpacity={0.75}
	                        >
	                          <IconSymbol ios_icon_name="camera.fill" android_material_icon_name="photo_camera" size={18} color="#fff" />
	                          <Text style={[styles.profileImageButtonText, { color: '#fff' }]}>Kamera</Text>
	                        </TouchableOpacity>
	                        <TouchableOpacity
	                          style={[styles.profileImageButton, { backgroundColor: colors.highlight }]}
	                          onPress={() => handleProfileImageUpload('library')}
	                          disabled={isUploadingProfileImage}
	                          activeOpacity={0.75}
	                        >
	                          {isUploadingProfileImage ? (
	                            <ActivityIndicator size="small" color={textColor} />
	                          ) : (
	                            <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="photo_library" size={18} color={textColor} />
	                          )}
	                          <Text style={[styles.profileImageButtonText, { color: textColor }]}>Upload</Text>
	                        </TouchableOpacity>
	                      </View>
	                    </View>

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

	                    {isPlayerProfile && (
	                      <>
	                        <Text style={[styles.label, { color: textColor }]}>Positioner</Text>
	                        <View style={styles.chipGroup}>
	                          {PLAYER_PROFILE_POSITION_OPTIONS.map((position) => {
	                            const isSelected = editPositions.includes(position);
	                            const isDisabled = !isSelected && editPositions.length >= MAX_PLAYER_PROFILE_POSITIONS;
	                            return (
	                              <Pressable
	                                key={position}
	                                style={[
	                                  styles.selectionChip,
	                                  {
	                                    backgroundColor: isSelected ? colors.primary : 'transparent',
	                                    borderColor: isSelected ? colors.primary : textSecondaryColor,
	                                    opacity: isDisabled ? 0.45 : 1,
	                                  },
	                                ]}
	                                onPress={() => toggleProfilePosition(position)}
	                                accessibilityRole="button"
	                                accessibilityState={{ selected: isSelected, disabled: isDisabled }}
	                              >
	                                <Text style={[styles.selectionChipText, { color: isSelected ? '#fff' : textColor }]}>{position}</Text>
	                              </Pressable>
	                            );
	                          })}
	                        </View>

	                        <Text style={[styles.label, { color: textColor }]}>Klub</Text>
	                        <TextInput
	                          style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
	                          value={editClubName}
	                          onChangeText={setEditClubName}
	                          placeholder="Klubnavn"
	                          placeholderTextColor={textSecondaryColor}
	                        />

	                        <Text style={[styles.label, { color: textColor }]}>Niveau</Text>
	                        <TextInput
	                          style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
	                          value={editPlayingLevel}
	                          onChangeText={setEditPlayingLevel}
	                          placeholder="League 1, League 2, Champions League..."
	                          placeholderTextColor={textSecondaryColor}
	                        />
	                      </>
	                    )}

	                    <View style={styles.editButtons}>
	                      <TouchableOpacity
	                        style={[styles.button, { backgroundColor: colors.highlight }]}
	                        onPress={() => {
	                          setIsEditingProfile(false);
	                          resetProfileEditor(profile);
	                        }}
	                      >
                        <Text style={[styles.buttonText, { color: textColor }]}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
	                        style={[styles.button, { backgroundColor: colors.primary }]}
	                        onPress={handleSaveProfile}
	                        disabled={loading || isUploadingProfileImage}
	                      >
                        {loading ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={[styles.buttonText, { color: '#fff' }]}>Save</Text>
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
	                    {isPlayerProfile && displayPlayerPositions.length > 0 && (
	                      <View style={[styles.infoRow, styles.infoRowTop]}>
	                        <IconSymbol
	                          ios_icon_name="figure.soccer"
	                          android_material_icon_name="sports_soccer"
	                          size={20}
	                          color={colors.primary}
	                        />
	                        <View style={styles.chipGroup}>
	                          {displayPlayerPositions.map((position) => (
	                            <View key={position} style={[styles.infoChip, { backgroundColor: bgColor }]}>
	                              <Text style={[styles.infoChipText, { color: textColor }]}>{position}</Text>
	                            </View>
	                          ))}
	                        </View>
	                      </View>
	                    )}
	                    {isPlayerProfile && profile?.club_name && (
	                      <View style={styles.infoRow}>
	                        <IconSymbol
	                          ios_icon_name="building.2.fill"
	                          android_material_icon_name="groups"
	                          size={20}
	                          color={colors.primary}
	                        />
	                        <Text style={[styles.infoText, { color: textColor }]}>
	                          {profile.club_name}
	                        </Text>
	                      </View>
	                    )}
	                    {isPlayerProfile && profile?.playing_level && (
	                      <View style={styles.infoRow}>
	                        <IconSymbol
	                          ios_icon_name="chart.bar.fill"
	                          android_material_icon_name="leaderboard"
	                          size={20}
	                          color={colors.primary}
	                        />
	                        <Text style={[styles.infoText, { color: textColor }]}>
	                          {profile.playing_level}
	                        </Text>
	                      </View>
	                    )}
	                    {!hasProfileInfo && (
	                      <Text style={[styles.emptyText, { color: textSecondaryColor }]}>
	                        No profile information available. Tap edit to add it.
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
                    title="Your Coach"
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
                      title="Your Coach"
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
                    title="Your Coach"
                    expanded={isAdminInfoExpanded}
                    onToggle={() => setIsAdminInfoExpanded(prev => !prev)}
                    titleColor={textColor}
                    chevronColor={textSecondaryColor}
                    icon={<IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={24} color={colors.primary} />}
                  >
                    <PremiumFeatureGate
                      title="Premium required for coach access"
                      description="Upgrade to connect with your trainer and get customized activities."
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
                title="Calendar Sync"
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
                      Associate external calendars (iCal/webcal) to automatically import activities
                    </Text>
                    <ExternalCalendarManager />
                  </>
                ) : (
                  <PremiumFeatureGate
                    title="Calendar sync is unlocked with Premium"
                    description="Automatically import activities by upgrading to Premium."
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
                title="Subscription"
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
                  Manage your subscription
                </Text>
                {userRole === null ? (
                  <View style={{ paddingVertical: 24, alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ color: textSecondaryColor, fontSize: 14 }}>
                      Prepare Role...
                    </Text>
                  </View>
                ) : (
                  <SubscriptionManager
                    forceShowPlans={userRole === 'player' ? forcePlayerPlanListOpen : forceShowPlansOnce}
                    selectedRole={subscriptionSelectionRole ?? undefined}
                  />
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
              <Text style={styles.signOutButtonText}>Sign out</Text>
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
                <Text style={styles.successTitle}>Account created! 🎉</Text>
                <Text style={styles.successText}>
                  Your account has been created successfully.{'\n'}
                  Check your email to verify your account, then log in.
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
                      Create account
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
                    autoComplete="email"
                    textContentType="username"
                    autoCorrect={false}
                    contextMenuHidden={false}
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
                    autoComplete="password"
                    textContentType="password"
                    contextMenuHidden={false}
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
                    accessibilityLabel={isSignUp ? 'Create account' : 'Log ind'}
                  >
                    {loading ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={[styles.authButtonText, { marginLeft: 12 }]}>
                          {isSignUp ? 'Creating account...' : 'Logging in...'}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.authButtonText}>
                        {isSignUp ? 'Create account' : 'Log ind'}
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
                        ? 'Confirm your email and log in.\nThen choose subscription as player or coach.'
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
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
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
  },
  sectionHeaderActions: {
    marginRight: 12,
  },
  chevronContainer: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
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
  infoRowTop: {
    alignItems: 'flex-start',
  },
  infoText: {
    fontSize: 16,
    flexShrink: 1,
  },
  chipGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectionChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  selectionChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  infoChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  infoChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  editForm: {
    gap: 8,
  },
  profileImageEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
  },
  profileImagePreview: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileImagePreviewImage: {
    width: '100%',
    height: '100%',
  },
  profileImageActions: {
    flex: 1,
    gap: 8,
  },
  profileImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileImageButtonText: {
    fontSize: 14,
    fontWeight: '700',
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
