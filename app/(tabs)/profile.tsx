import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  Alert,
  Platform,
  ActivityIndicator,
  FlatList,
  Modal,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';
import { supabase } from '@/integrations/supabase/client';
import ExternalCalendarManager from '@/components/ExternalCalendarManager';
import SubscriptionManager from '@/components/SubscriptionManager';
import AppleSubscriptionManager from '@/components/AppleSubscriptionManager';
import CreatePlayerModal from '@/components/CreatePlayerModal';
import PlayersList from '@/components/PlayersList';
import TeamManagement from '@/components/TeamManagement';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { useFootball } from '@/contexts/FootballContext';
import { deleteAllExternalActivities } from '@/utils/deleteExternalActivities';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';
import { PRODUCT_IDS } from '@/contexts/AppleIAPContext';
import { forceUserRoleRefresh } from '@/hooks/useUserRole';

// Conditionally import GlassView only on native platforms
let GlassView: any = View;
if (Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const glassModule = require('expo-glass-effect');
    GlassView = glassModule.GlassView;
  } catch (error) {
    console.log('expo-glass-effect not available, using View instead');
  }
}

interface UserProfile {
  full_name: string;
  phone_number: string;
}

interface AdminInfo {
  full_name: string;
  phone_number: string;
  email: string;
}

type SubscriptionStatusType = ReturnType<typeof useSubscription>['subscriptionStatus'];

type UpgradeTarget = 'library' | 'calendarSync' | 'trainerLinking';

const normalizeUpgradeTarget = (value: string | string[] | undefined): UpgradeTarget | null => {
  if (!value) {
    return null;
  }
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === 'library' || candidate === 'calendarSync' || candidate === 'trainerLinking') {
    return candidate;
  }
  return null;
};

const DELETE_ACCOUNT_CONFIRMATION_PHRASE = 'SLET';
const ACCOUNT_DELETION_REVIEW_PATH = 'Profil -> Indstillinger -> Konto -> Slet konto';

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'trainer' | 'player' | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  // New onboarding flow states
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);
  const [needsSubscription, setNeedsSubscription] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'player' | 'trainer' | null>(null);

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [originalPhone, setOriginalPhone] = useState('');

  // Collapsible sections - Calendar Sync now collapsed by default
  const [isCalendarSyncExpanded, setIsCalendarSyncExpanded] = useState(false);
  const [isSubscriptionExpanded, setIsSubscriptionExpanded] = useState(false);
  const [subscriptionSectionY, setSubscriptionSectionY] = useState<number | null>(null);
  const scrollViewRef = useRef<any>(null);
  const params = useLocalSearchParams<{ upgradeTarget?: string }>();
  const routeUpgradeTarget = normalizeUpgradeTarget(params.upgradeTarget);
  const [manualUpgradeTarget, setManualUpgradeTarget] = useState<UpgradeTarget | null>(null);

  // Delete external activities state
  const [isDeletingExternalActivities, setIsDeletingExternalActivities] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Get subscription status
  const { subscriptionStatus, refreshSubscription, createSubscription } = useSubscription();
  const { refreshAll } = useFootball();
  const { featureAccess, isLoading: subscriptionFeaturesLoading } = useSubscriptionFeatures();

  const canUseCalendarSync = featureAccess.calendarSync;
  const canLinkTrainer = featureAccess.trainerLinking;
  const effectiveUpgradeTarget = manualUpgradeTarget ?? routeUpgradeTarget;
  const highlightProductId =
    userRole === 'player' && effectiveUpgradeTarget ? PRODUCT_IDS.PLAYER_PREMIUM : undefined;
  const shouldHighlightPremiumPlan = Boolean(highlightProductId);

  const canManagePlayers = userRole === 'admin' || userRole === 'trainer';

  const scrollToSubscription = useCallback(() => {
    if (!scrollViewRef.current || subscriptionSectionY === null) {
      return;
    }
    const targetOffset = Math.max(subscriptionSectionY - 32, 0);

    if (typeof scrollViewRef.current.scrollTo === 'function') {
      scrollViewRef.current.scrollTo({ y: targetOffset, animated: true });
    } else if (typeof scrollViewRef.current.scrollToOffset === 'function') {
      scrollViewRef.current.scrollToOffset({ offset: targetOffset, animated: true });
    }
  }, [subscriptionSectionY]);

  const handleOpenSubscriptionSection = useCallback(
    (target?: UpgradeTarget) => {
      if (target) {
        setManualUpgradeTarget(target);
      }
      setIsSubscriptionExpanded(true);
      setTimeout(() => {
        scrollToSubscription();
      }, 200);
    },
    [scrollToSubscription]
  );

  const fetchUserProfile = async (userId: string) => {
    try {
      if (__DEV__) {
        console.log('[PROFILE] Fetching profile for user:', userId);
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone_number')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[PROFILE] Error fetching profile:', error);
        return;
      }

      if (data) {
        if (__DEV__) {
          console.log('[PROFILE] Profile data fetched:', data.full_name, data.phone_number);
        }
        setProfile(data);
        setEditName(data.full_name || '');
        setEditPhone(data.phone_number || '');
        setOriginalName(data.full_name || '');
        setOriginalPhone(data.phone_number || '');
      } else {
        if (__DEV__) {
          console.log('[PROFILE] No profile data found for user');
        }
        setProfile(null);
      }
    } catch (error) {
      console.error('[PROFILE] Error in fetchUserProfile:', error);
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

  const checkUserOnboarding = useCallback(
    async (userId: string) => {
      if (__DEV__) {
        console.log('[PROFILE] Checking user onboarding status for user:', userId);
      }

      // Check if user has a role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (roleError || !roleData) {
        if (__DEV__) {
          console.log('[PROFILE] No role found - needs role selection');
        }
        setNeedsRoleSelection(true);
        setNeedsSubscription(false);
        return;
      }

      const role = roleData.role as 'admin' | 'trainer' | 'player';
      setUserRole(role);
      if (__DEV__) {
        console.log(`[PROFILE] Role found: ${role}`);
      }

      // If role is trainer or admin, check if they have a subscription
      if (role === 'trainer' || role === 'admin') {
        const { data: subData, error: subError } = await supabase
          .from('subscriptions')
          .select('id, status')
          .eq('admin_id', userId)
          .single();

        if (subError || !subData) {
          if (__DEV__) {
            console.log('[PROFILE] No subscription found - needs subscription');
          }
          setNeedsRoleSelection(false);
          setNeedsSubscription(true);
          return;
        }

        if (__DEV__) {
          console.log(`[PROFILE] Subscription found: ${subData.status}`);
        }
        // Refresh subscription status
        await refreshSubscription();
      }

      // User is fully onboarded
      setNeedsRoleSelection(false);
      setNeedsSubscription(false);
      await fetchUserProfile(userId);

      if (role === 'player') {
        await fetchAdminInfo(userId);
      }
    },
    [refreshSubscription]
  );

  useEffect(() => {
    const checkUser = async () => {
      console.log('[PROFILE] Checking current user...');
      const {
        data: { user },
      } = await supabase.auth.getUser();
      console.log('[PROFILE] Current user:', user?.id, user?.email);
      setUser(user);

      if (user) {
        // Refresh subscription status immediately when user is detected
        await refreshSubscription();
        await checkUserOnboarding(user.id);
      }
    };
    checkUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('[PROFILE] Auth state changed:', _event, session?.user?.id);
      setUser(session?.user || null);

      if (session?.user) {
        // Refresh subscription status immediately on auth state change
        await refreshSubscription();
        await checkUserOnboarding(session.user.id);
      } else {
        setUserRole(null);
        setProfile(null);
        setAdminInfo(null);
        setNeedsRoleSelection(false);
        setNeedsSubscription(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkUserOnboarding, refreshSubscription]);

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

  const handleSaveProfile = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    // Check if there are any changes BEFORE setting loading
    const hasChanges = editName !== originalName || editPhone !== originalPhone;

    if (!hasChanges) {
      console.log('[PROFILE] No changes detected, skipping API call');
      setIsEditingProfile(false);
      return;
    }

    setLoading(true);

    try {
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
        const { error } = await supabase.from('profiles').insert({
          user_id: user.id,
          full_name: editName,
          phone_number: editPhone,
        });

        if (error) throw error;
      }

      await fetchUserProfile(user.id);
      setIsEditingProfile(false);
      Alert.alert('Succes', 'Din profil er opdateret');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Fejl', 'Kunne ikke gemme profil');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Fejl', 'Udfyld venligst både email og adgangskode');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Fejl', 'Indtast venligst en gyldig email-adresse');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Fejl', 'Adgangskoden skal være mindst 6 tegn lang');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'natively://auth-callback',
        },
      });

      if (error) {
        if (__DEV__) {
          console.log(`[PROFILE] Signup error: ${error.message}`);
        }
        console.error('Sign up error:', error);
        Alert.alert(
          'Kunne ikke oprette konto',
          error.message || 'Der opstod en fejl. Prøv venligst igen.'
        );
        return;
      }

      if (!data.user) {
        if (__DEV__) {
          console.log('[PROFILE] No user returned from signup');
        }
        Alert.alert('Fejl', 'Kunne ikke oprette bruger. Prøv venligst igen.');
        return;
      }

      if (__DEV__) {
        console.log(`[PROFILE] User created: ${data.user.id}`);
        console.log(
          `[PROFILE] Session exists: ${data.session ? 'Yes - Auto logged in!' : 'No - Email confirmation required'}`
        );
      }

      setEmail('');
      setPassword('');

      // Check if user is automatically logged in
      if (data.session) {
        // User is logged in immediately - show success and they'll be prompted for role
        Alert.alert(
          'Velkommen! 🎉',
          `Din konto er oprettet og du er nu logget ind!\n\nVi har sendt en bekræftelsesmail til ${email}. Bekræft venligst din email når du får tid.\n\nNu skal du vælge din rolle for at fortsætte.`,
          [{ text: 'OK' }]
        );
      } else {
        // Email confirmation required before login
        setShowSuccessMessage(true);

        setTimeout(() => {
          setShowSuccessMessage(false);
          setIsSignUp(false);
        }, 5000);

        Alert.alert(
          'Bekræft din email ✉️',
          `Din konto er oprettet!\n\nVi har sendt en bekræftelsesmail til ${email}.\n\nTjek venligst din indbakke og klik på linket for at bekræfte din email. Derefter kan du logge ind.\n\n⚠️ Bemærk: Tjek også din spam-mappe hvis du ikke kan finde emailen.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      if (__DEV__) {
        console.log(`[PROFILE] Unexpected error: ${error.message}`);
      }
      console.error('Signup error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en uventet fejl. Prøv venligst igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Fejl', 'Udfyld venligst både email og adgangskode');
      return;
    }

    setLoading(true);
    console.log('Attempting to sign in with:', email);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      console.log('Sign in response:', {
        user: data.user?.id,
        session: data.session ? 'exists' : 'null',
        error: error?.message,
      });

      if (error) {
        console.error('Sign in error:', error);

        if (error.message.includes('Invalid login credentials')) {
          Alert.alert(
            'Login fejlede',
            'Email eller adgangskode er forkert.\n\nHusk:\n• Har du bekræftet din email?\n• Er du sikker på at du har oprettet en konto?\n• Prøv at nulstille din adgangskode hvis du har glemt den.'
          );
        } else if (error.message.includes('Email not confirmed')) {
          Alert.alert(
            'Email ikke bekræftet',
            'Du skal bekræfte din email før du kan logge ind. Tjek din indbakke for bekræftelsesmailen.\n\nTjek også din spam-mappe.'
          );
        } else {
          Alert.alert('Login fejlede', error.message || 'Der opstod en fejl. Prøv venligst igen.');
        }
        return;
      }

      if (data.session) {
        Alert.alert('Succes! 🎉', 'Du er nu logget ind!');
        setEmail('');
        setPassword('');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en uventet fejl. Prøv venligst igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelection = async (role: 'player' | 'trainer') => {
    if (!user) return;

    setLoading(true);
    if (__DEV__) {
      console.log(`[PROFILE] Setting role to: ${role}`);
    }

    try {
      // Insert role into user_roles table
      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: user.id,
        role: role,
      });

      if (roleError) {
        if (__DEV__) {
          console.log(`[PROFILE] Error setting role: ${roleError.message}`);
        }
        Alert.alert('Fejl', 'Kunne ikke gemme rolle. Prøv venligst igen.');
        return;
      }

      if (__DEV__) {
        console.log('[PROFILE] Role set successfully');
      }
      setSelectedRole(role);
      setUserRole(role);
      setNeedsRoleSelection(false);
      forceUserRoleRefresh('role-selection');

      // If trainer, show subscription selection
      if (role === 'trainer') {
        setNeedsSubscription(true);
        Alert.alert(
          'Vælg abonnement',
          'Som træner skal du vælge et abonnement for at kunne administrere spillere.',
          [{ text: 'OK' }]
        );
      } else {
        // Player doesn't need subscription
        Alert.alert('Velkommen! 🎉', 'Din konto er nu klar til brug!', [{ text: 'OK' }]);
      }
    } catch (error: any) {
      if (__DEV__) {
        console.log(`[PROFILE] Unexpected error: ${error.message}`);
      }
      Alert.alert('Fejl', error.message || 'Der opstod en fejl. Prøv venligst igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSubscription = async (planId: string) => {
    if (!user) return;

    setLoading(true);
    if (__DEV__) {
      console.log(`[PROFILE] Creating subscription with plan: ${planId}`);
    }

    try {
      const result = await createSubscription(planId);

      if (result.success) {
        setNeedsSubscription(false);
        Alert.alert(
          'Velkommen! 🎉',
          'Dit abonnement er aktiveret med 14 dages gratis prøveperiode. Du kan nu oprette spillere og hold!',
          [{ text: 'OK' }]
        );
        return;
      }

      if (result.alreadyHasSubscription) {
        setNeedsSubscription(false);
        Alert.alert(
          'Du har allerede et abonnement',
          result.error || 'Dit nuværende abonnement er aktivt.',
          [{ text: 'OK' }]
        );
        return;
      }

      Alert.alert('Fejl', result.error || 'Kunne ikke oprette abonnement. Prøv venligst igen.');
    } catch (error: any) {
      if (__DEV__) {
        console.log(`[PROFILE] Unexpected error: ${error.message}`);
      }
      Alert.alert('Fejl', error.message || 'Der opstod en fejl. Prøv venligst igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      Alert.alert('Logget ud', 'Du er nu logget ud');
    } catch (error: any) {
      console.error('Sign out error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en fejl');
    }
  };

  const handleDeleteAllExternalActivities = async () => {
    if (!canUseCalendarSync) {
      Alert.alert(
        'Premium påkrævet',
        'Kalendersynk kræver et Premium-abonnement. Opgrader for at fortsætte.'
      );
      return;
    }

    Alert.alert(
      'Slet alle eksterne aktiviteter',
      'Er du sikker på at du vil slette ALLE dine eksterne aktiviteter?\n\nDette vil slette alle aktiviteter importeret fra eksterne kalendere. Aktiviteterne vil blive importeret igen ved næste synkronisering, medmindre du fjerner kalenderne fra din profil.\n\n⚠️ Denne handling kan ikke fortrydes!',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet alle',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingExternalActivities(true);
            try {
              const result = await deleteAllExternalActivities();

              if (!result.success) {
                throw new Error(result.error || 'Kunne ikke slette aktiviteter');
              }

              if (result.count === 0) {
                Alert.alert('Ingen aktiviteter', 'Du har ingen eksterne aktiviteter at slette');
              } else {
                Alert.alert(
                  'Slettet',
                  `${result.count} eksterne aktivitet${result.count === 1 ? '' : 'er'} er blevet slettet fra din app`
                );
              }

              if (typeof refreshAll === 'function') {
                try {
                  await refreshAll();
                } catch (refreshError) {
                  console.error('[PROFILE] Failed to refresh data after deletion:', refreshError);
                }
              }
            } catch (error: any) {
              console.error('Error deleting external activities:', error);
              Alert.alert('Fejl', error.message || 'Kunne ikke slette eksterne aktiviteter');
            } finally {
              setIsDeletingExternalActivities(false);
            }
          },
        },
      ]
    );
  };

  const openDeleteAccountDialog = useCallback(() => {
    setDeleteAccountError(null);
    setDeleteConfirmationInput('');
    setIsDeleteDialogVisible(true);
  }, []);

  const closeDeleteAccountDialog = useCallback(() => {
    setIsDeleteDialogVisible(false);
    setDeleteConfirmationInput('');
    setDeleteAccountError(null);
  }, []);

  const handleConfirmDeleteAccount = useCallback(async () => {
    if (isDeletingAccount) {
      return;
    }
    if (!user) {
      setDeleteAccountError('Ingen bruger er logget ind.');
      return;
    }
    const normalizedInput = deleteConfirmationInput.trim().toUpperCase();
    if (normalizedInput !== DELETE_ACCOUNT_CONFIRMATION_PHRASE) {
      setDeleteAccountError(`Skriv ${DELETE_ACCOUNT_CONFIRMATION_PHRASE} for at bekræfte sletningen.`);
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) {
        throw new Error(error.message ?? 'Kunne ikke slette kontoen.');
      }
      if (!data?.success) {
        throw new Error(data?.error ?? 'Kunne ikke slette kontoen.');
      }

      let signOutMessageSuffix = ' Du er nu logget ud.';
      try {
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          console.warn('[PROFILE] Sign-out after deletion failed, continuing anyway:', signOutError);
          signOutMessageSuffix = ' Din konto er slettet, men vi kunne ikke logge dig ud automatisk. Genstart appen for at bekræfte.';
        }
      } catch (signOutUnexpected) {
        console.warn('[PROFILE] Unexpected sign-out failure after deletion, continuing anyway:', signOutUnexpected);
        signOutMessageSuffix = ' Din konto er slettet, men vi kunne ikke logge dig ud automatisk. Genstart appen for at bekræfte.';
      }

      setUser(null);
      setUserRole(null);
      setProfile(null);
      setAdminInfo(null);
      setNeedsRoleSelection(false);
      setNeedsSubscription(false);
      setManualUpgradeTarget(null);
      setIsEditingProfile(false);
      closeDeleteAccountDialog();

      Alert.alert('Konto slettet', `Din konto og alle dine data er blevet slettet.${signOutMessageSuffix}`);
    } catch (error: any) {
      console.error('[PROFILE] Account deletion failed:', error);
      setDeleteAccountError(error?.message ?? 'Der opstod en fejl under sletningen. Prøv igen.');
    } finally {
      setIsDeletingAccount(false);
    }
  }, [
    closeDeleteAccountDialog,
    deleteConfirmationInput,
    isDeletingAccount,
    user,
  ]);

  const getPlanColor = (planName: string | null) => {
    if (!planName) return colors.primary;

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

  const bgColor = isDark
    ? Platform.OS === 'ios'
      ? '#000'
      : '#1a1a1a'
    : Platform.OS === 'ios'
      ? '#f8f9fa'
      : colors.background;
  const cardBgColor = isDark
    ? Platform.OS === 'ios'
      ? '#1a1a1a'
      : '#2a2a2a'
    : Platform.OS === 'ios'
      ? '#fff'
      : colors.card;
  const textColor = isDark
    ? Platform.OS === 'ios'
      ? '#fff'
      : '#e3e3e3'
    : Platform.OS === 'ios'
      ? '#1a1a1a'
      : colors.text;
  const textSecondaryColor = isDark ? '#999' : Platform.OS === 'ios' ? '#666' : colors.textSecondary;
  const nestedCardBgColor =
    Platform.OS === 'ios'
      ? isDark
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(0,0,0,0.04)'
      : isDark
        ? '#1f1f1f'
        : '#f5f6f9';
  const destructiveColor = Platform.OS === 'ios' ? '#ff3b30' : colors.error;
  const deleteRowBackground = Platform.OS === 'ios'
    ? isDark
      ? 'rgba(255,59,48,0.16)'
      : 'rgba(255,59,48,0.08)'
    : isDark
      ? '#3a1a1a'
      : '#ffecec';
  const isDeleteConfirmationValid =
    deleteConfirmationInput.trim().toUpperCase() === DELETE_ACCOUNT_CONFIRMATION_PHRASE;

  // Platform-specific wrapper component
  const CardWrapper = Platform.OS === 'ios' ? GlassView : View;
  const cardWrapperProps = Platform.OS === 'ios' ? { glassEffectStyle: 'regular' as const } : {};

  // Platform-specific container
  const ContainerWrapper = Platform.OS === 'ios' ? SafeAreaView : View;
  const containerEdges = Platform.OS === 'ios' ? (['top'] as const) : undefined;

  // Show role selection if user is logged in but has no role
  if (user && needsRoleSelection) {
    return (
      <ContainerWrapper style={[styles.safeArea, { backgroundColor: bgColor }]} edges={containerEdges}>
        <FlatList
          style={styles.container}
          data={[]}
          keyExtractor={(_, index) => `profile-role-${index}`}
          renderItem={() => null}
          ListHeaderComponent={
            <React.Fragment>
              <View style={Platform.OS !== 'ios' ? { paddingTop: 60 } : undefined}>
                <Text style={[styles.title, { color: textColor }]}>Vælg din rolle</Text>
                <Text style={[styles.subtitle, { color: textSecondaryColor }]}>
                  Vælg om du er spiller eller træner for at fortsætte
                </Text>

                <CardWrapper
                  style={[styles.onboardingCard, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]}
                  {...cardWrapperProps}
                >
                  <Text style={[styles.onboardingTitle, { color: textColor }]}>Velkommen til din nye konto! 🎉</Text>
                  <Text style={[styles.onboardingDescription, { color: textSecondaryColor }]}>
                    For at komme i gang skal du vælge din rolle. Dette hjælper os med at tilpasse oplevelsen til dig.
                  </Text>

                  <TouchableOpacity
                    style={[
                      styles.roleCard,
                      {
                        backgroundColor:
                          Platform.OS === 'ios'
                            ? isDark
                              ? 'rgba(255,255,255,0.1)'
                              : 'rgba(0,0,0,0.05)'
                            : bgColor,
                      },
                    ]}
                    onPress={() => handleRoleSelection('player')}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <IconSymbol ios_icon_name="figure.run" android_material_icon_name="directions_run" size={48} color={colors.primary} />
                    <Text style={[styles.roleTitle, { color: textColor }]}>Spiller</Text>
                    <Text style={[styles.roleDescription, { color: textSecondaryColor }]}>
                      Jeg er en spiller og vil holde styr på min træning
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.roleCard,
                      {
                        backgroundColor:
                          Platform.OS === 'ios'
                            ? isDark
                              ? 'rgba(255,255,255,0.1)'
                              : 'rgba(0,0,0,0.05)'
                            : bgColor,
                      },
                    ]}
                    onPress={() => handleRoleSelection('trainer')}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <IconSymbol ios_icon_name="person.3.fill" android_material_icon_name="group" size={48} color={colors.primary} />
                    <Text style={[styles.roleTitle, { color: textColor }]}>Træner</Text>
                    <Text style={[styles.roleDescription, { color: textSecondaryColor }]}>
                      Jeg er træner og vil administrere spillere og hold
                    </Text>
                  </TouchableOpacity>

                  {loading && (
                    <View style={styles.loadingOverlay}>
                      <ActivityIndicator size="large" color={colors.primary} />
                      <Text style={[styles.loadingText, { color: textColor }]}>Gemmer din rolle...</Text>
                    </View>
                  )}
                </CardWrapper>
              </View>
            </React.Fragment>
          }
          contentContainerStyle={[styles.contentContainer]}
          showsVerticalScrollIndicator={false}
        />
      </ContainerWrapper>
    );
  }

  // Show subscription selection if user is trainer but has no subscription
  if (user && needsSubscription) {
    return (
      <ContainerWrapper style={[styles.safeArea, { backgroundColor: bgColor }]} edges={containerEdges}>
        <FlatList
          style={styles.container}
          data={[]}
          keyExtractor={(_, index) => `profile-sub-${index}`}
          renderItem={() => null}
          ListHeaderComponent={
            <React.Fragment>
              <View style={Platform.OS !== 'ios' ? { paddingTop: 60 } : undefined}>
                <Text style={[styles.title, { color: textColor }]}>Vælg dit abonnement</Text>
                <Text style={[styles.subtitle, { color: textSecondaryColor }]}>
                  Som træner skal du vælge et abonnement for at administrere spillere
                </Text>

                <CardWrapper
                  style={[styles.subscriptionCard, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]}
                  {...cardWrapperProps}
                >
                  <SubscriptionManager onPlanSelected={handleCompleteSubscription} isSignupFlow={true} selectedRole="trainer" />
                </CardWrapper>
              </View>
            </React.Fragment>
          }
          contentContainerStyle={[styles.contentContainer]}
          showsVerticalScrollIndicator={false}
        />
      </ContainerWrapper>
    );
  }

  // Logged-in main view now rendered via FlatList (see return)
  const renderProfileContent = () => (
    <View>
      {user ? (
        <>
          <CardWrapper style={[styles.profileHeader, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
            <View style={styles.avatarContainer}>
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: subscriptionStatus?.hasSubscription ? getPlanColor(subscriptionStatus.planName) : colors.primary,
                  },
                ]}
              >
                <IconSymbol ios_icon_name="person.circle.fill" android_material_icon_name="person" size={Platform.OS === 'ios' ? 80 : 48} color="#fff" />
              </View>
              {subscriptionStatus?.hasSubscription && (
                <View style={[styles.subscriptionBadge, { backgroundColor: getPlanColor(subscriptionStatus.planName) }]}>
                  <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={16} color="#fff" />
                </View>
              )}
            </View>
            <Text style={[styles.name, { color: textColor }]}>{profile?.full_name || user.email?.split('@')[0] || 'Bruger'}</Text>
            <Text style={[styles.email, { color: textSecondaryColor }]}>{user.email}</Text>
            {/* Only show subscription badge if user has an active subscription */}
            {subscriptionStatus?.hasSubscription && subscriptionStatus.planName && (
              <View style={styles.badgesRow}>
                <View style={[styles.planBadge, { backgroundColor: getPlanColor(subscriptionStatus.planName) }]}>
                  <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={12} color="#fff" />
                  <Text style={styles.planBadgeText}>{subscriptionStatus.planName}</Text>
                </View>
              </View>
            )}
          </CardWrapper>

          {/* Profile Info Section */}
          <CardWrapper style={[styles.section, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: textColor }]}>Profil Information</Text>
              {!isEditingProfile && (
                <TouchableOpacity
                  onPress={() => {
                    setIsEditingProfile(true);
                    setOriginalName(profile?.full_name || '');
                    setOriginalPhone(profile?.phone_number || '');
                  }}
                >
                  <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.primary} />
                </TouchableOpacity>
              )}
            </View>

            {isEditingProfile ? (
              <View style={styles.editForm}>
                <Text style={[styles.label, { color: textColor }]}>Navn</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : bgColor,
                      color: textColor,
                    },
                  ]}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Dit navn"
                  placeholderTextColor={textSecondaryColor}
                />

                <Text style={[styles.label, { color: textColor }]}>Telefon</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : bgColor,
                      color: textColor,
                    },
                  ]}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="+45 12 34 56 78"
                  placeholderTextColor={textSecondaryColor}
                  keyboardType="phone-pad"
                />

                <View style={styles.editButtons}>
                  <TouchableOpacity
                    style={[
                      styles.button,
                      { backgroundColor: Platform.OS === 'ios' ? (isDark ? '#3a3a3c' : '#e5e5e5') : colors.highlight },
                    ]}
                    onPress={() => {
                      setIsEditingProfile(false);
                      setEditName(profile?.full_name || '');
                      setEditPhone(profile?.phone_number || '');
                    }}
                  >
                    <Text style={[styles.buttonText, { color: textColor }]}>Annuller</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleSaveProfile} disabled={loading}>
                    {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.buttonText, { color: '#fff' }]}>Gem</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.profileInfo}>
                {profile?.full_name && (
                  <View style={styles.infoRow}>
                    <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={20} color={colors.primary} />
                    <Text style={[styles.infoText, { color: textColor }]}>{profile.full_name}</Text>
                  </View>
                )}
                {profile?.phone_number && (
                  <View style={styles.infoRow}>
                    <IconSymbol ios_icon_name="phone.fill" android_material_icon_name="phone" size={20} color={colors.primary} />
                    <Text style={[styles.infoText, { color: textColor }]}>{profile.phone_number}</Text>
                  </View>
                )}
                {!profile?.full_name && !profile?.phone_number && (
                  <Text style={[styles.emptyText, { color: textSecondaryColor }]}>
                    Ingen profilinformation tilgængelig. Tryk på rediger for at tilføje.
                  </Text>
                )}
              </View>
            )}
          </CardWrapper>

          {/* Admin Info for Players */}
          {userRole === 'player' &&
            (subscriptionFeaturesLoading ? (
              <CardWrapper style={[styles.section, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
                <View style={[styles.loadingContainer, { paddingVertical: 24 }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              </CardWrapper>
            ) : canLinkTrainer ? (
              adminInfo ? (
                <CardWrapper style={[styles.section, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
                  <Text style={[styles.sectionTitle, { color: textColor }]}>Din Træner</Text>
                  <View style={styles.profileInfo}>
                    <View style={styles.infoRow}>
                      <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={20} color={colors.primary} />
                      <Text style={[styles.infoText, { color: textColor }]}>{adminInfo.full_name}</Text>
                    </View>
                    {adminInfo.phone_number && (
                      <View style={styles.infoRow}>
                        <IconSymbol ios_icon_name="phone.fill" android_material_icon_name="phone" size={20} color={colors.primary} />
                        <Text style={[styles.infoText, { color: textColor }]}>{adminInfo.phone_number}</Text>
                      </View>
                    )}
                  </View>
                </CardWrapper>
              ) : null
            ) : (
              <CardWrapper style={[styles.section, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
                <PremiumFeatureGate
                  title="Tilslut din træner med Premium"
                  description="Opgrader for at give din træner adgang til dine aktiviteter og opgaver."
                  onPress={() => handleOpenSubscriptionSection('trainerLinking')}
                  icon={{ ios: 'person.2.circle', android: 'groups' }}
                  align="left"
                />
              </CardWrapper>
            ))}

          {canManagePlayers && (
            <ManagePlayersSection
              CardWrapperComponent={CardWrapper}
              cardWrapperProps={cardWrapperProps}
              cardBgColor={cardBgColor}
              nestedCardBgColor={nestedCardBgColor}
              textColor={textColor}
              textSecondaryColor={textSecondaryColor}
              subscriptionStatus={subscriptionStatus}
            />
          )}

          {/* Calendar Sync Section - Collapsible - Available for all users */}
          <CardWrapper style={[styles.section, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setIsCalendarSyncExpanded(!isCalendarSyncExpanded)}
              activeOpacity={0.7}
            >
              <View style={styles.sectionTitleContainer}>
                <IconSymbol ios_icon_name="calendar.badge.plus" android_material_icon_name="event" size={28} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: textColor }]}>Kalender Synkronisering</Text>
              </View>
              <IconSymbol
                ios_icon_name={isCalendarSyncExpanded ? 'chevron.up' : 'chevron.down'}
                android_material_icon_name={isCalendarSyncExpanded ? 'expand_less' : 'expand_more'}
                size={24}
                color={textSecondaryColor}
              />
            </TouchableOpacity>

            {isCalendarSyncExpanded &&
              (subscriptionFeaturesLoading ? (
                <View style={[styles.loadingContainer, { paddingVertical: 24 }]}>
                  <ActivityIndicator size="small" color={colors.primary} />
                </View>
              ) : canUseCalendarSync ? (
                <>
                  <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
                    Tilknyt eksterne kalendere (iCal/webcal) for automatisk at importere aktiviteter
                  </Text>
                  <ExternalCalendarManager />

                  {/* Delete All External Activities Button */}
                  <TouchableOpacity
                    style={[
                      styles.deleteExternalButton,
                      {
                        backgroundColor:
                          Platform.OS === 'ios'
                            ? isDark
                              ? 'rgba(255,59,48,0.2)'
                              : 'rgba(255,59,48,0.1)'
                            : isDark
                              ? '#3a1a1a'
                              : '#ffe5e5',
                      },
                    ]}
                    onPress={handleDeleteAllExternalActivities}
                    activeOpacity={0.7}
                    disabled={isDeletingExternalActivities}
                  >
                    {isDeletingExternalActivities ? (
                      <ActivityIndicator size="small" color={Platform.OS === 'ios' ? '#ff3b30' : colors.error} />
                    ) : (
                      <React.Fragment>
                        <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={24} color={Platform.OS === 'ios' ? '#ff3b30' : colors.error} />
                        <Text style={[styles.deleteExternalButtonText, { color: Platform.OS === 'ios' ? '#ff3b30' : colors.error }]}>
                          Slet alle eksterne aktiviteter
                        </Text>
                      </React.Fragment>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <PremiumFeatureGate
                  title="Kalendersynk er en Premium-fordel"
                  description="Importer dine aktiviteter automatisk fra eksterne kalendere ved at opgradere."
                  onPress={() => handleOpenSubscriptionSection('calendarSync')}
                  icon={{ ios: 'calendar.badge.plus', android: 'event' }}
                  align="left"
                />
              ))}
          </CardWrapper>

          {/* Subscription Section - Collapsible - Available for all users */}
          <View onLayout={event => setSubscriptionSectionY(event.nativeEvent.layout.y)}>
            <CardWrapper style={[styles.section, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
              <TouchableOpacity
                style={styles.collapsibleHeader}
                onPress={() => setIsSubscriptionExpanded(!isSubscriptionExpanded)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionTitleContainer}>
                  <IconSymbol ios_icon_name="creditcard.fill" android_material_icon_name="payment" size={28} color={colors.primary} />
                  <Text style={[styles.sectionTitle, { color: textColor }]}>Abonnement</Text>
                </View>
                <IconSymbol
                  ios_icon_name={isSubscriptionExpanded ? 'chevron.up' : 'chevron.down'}
                  android_material_icon_name={isSubscriptionExpanded ? 'expand_less' : 'expand_more'}
                  size={24}
                  color={textSecondaryColor}
                />
              </TouchableOpacity>

              {isSubscriptionExpanded && (
                <>
                  <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>Administrer dit abonnement</Text>
                  {userRole === 'player' ? (
                    <AppleSubscriptionManager
                      highlightProductId={highlightProductId}
                      forceShowPlans={userRole === 'player' && !subscriptionStatus?.hasSubscription}
                    />
                  ) : (
                    <SubscriptionManager />
                  )}
                </>
              )}
            </CardWrapper>
          </View>

          <CardWrapper style={[styles.section, styles.settingsCard, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Indstillinger</Text>
            <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>Administrer din konto og sikkerhed.</Text>
            <View style={styles.settingsGroup}>
              <Text style={[styles.settingsGroupTitle, { color: textSecondaryColor }]}>Konto</Text>
              {/* Review note (App Store): Indstillinger -> Konto -> Slet konto */}
              <TouchableOpacity
                style={[styles.settingsRow, { backgroundColor: deleteRowBackground }]}
                onPress={openDeleteAccountDialog}
                activeOpacity={0.7}
                disabled={isDeletingAccount}
                accessibilityHint={ACCOUNT_DELETION_REVIEW_PATH}
              >
                <IconSymbol
                  ios_icon_name="trash.fill"
                  android_material_icon_name="delete"
                  size={22}
                  color={destructiveColor}
                />
                <View style={styles.settingsRowContent}>
                  <Text style={[styles.settingsRowTitle, { color: destructiveColor }]}>Slet konto</Text>
                  <Text style={[styles.settingsRowSubtitle, { color: textSecondaryColor }]}>
                    Sletter din konto og alle data permanent
                  </Text>
                </View>
                <IconSymbol
                  ios_icon_name="chevron.right"
                  android_material_icon_name="chevron_right"
                  size={18}
                  color={destructiveColor}
                />
              </TouchableOpacity>
            </View>
          </CardWrapper>

          <TouchableOpacity
            style={[styles.signOutButton, { backgroundColor: Platform.OS === 'ios' ? '#ff3b30' : colors.error }]}
            onPress={handleSignOut}
            activeOpacity={0.7}
          >
            {Platform.OS !== 'ios' && <IconSymbol ios_icon_name="arrow.right.square" android_material_icon_name="logout" size={24} color="#fff" />}
            <Text style={styles.signOutButtonText}>Log ud</Text>
          </TouchableOpacity>
        </>
      ) : (
        // Login/Sign up view
        <CardWrapper style={[styles.authCard, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
          {showSuccessMessage && (
            <View style={[styles.successMessage, { backgroundColor: colors.primary }]}>
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={Platform.OS === 'ios' ? 64 : 48} color="#fff" />
              <Text style={styles.successTitle}>Konto oprettet! 🎉</Text>
              <Text style={styles.successText}>
                Din konto er blevet oprettet succesfuldt.{'\n'}
                Tjek din email for at bekræfte din konto, og log derefter ind.
              </Text>
            </View>
          )}

          {!showSuccessMessage && (
            <>
              {Platform.OS === 'ios' && <Text style={[styles.title, { color: textColor }]}>{isSignUp ? 'Opret konto' : 'Log ind'}</Text>}

              <View style={styles.authToggle}>
                <TouchableOpacity
                  style={[
                    styles.authToggleButton,
                    !isSignUp && [
                      styles.authToggleButtonActive,
                      Platform.OS === 'ios' ? { backgroundColor: 'rgba(0,122,255,0.3)' } : { backgroundColor: colors.primary },
                    ],
                  ]}
                  onPress={() => {
                    setIsSignUp(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.authToggleText,
                      { color: Platform.OS === 'ios' ? textColor : isSignUp ? colors.textSecondary : '#fff' },
                      !isSignUp && styles.authToggleTextActive,
                    ]}
                  >
                    Log ind
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.authToggleButton,
                    isSignUp && [
                      styles.authToggleButtonActive,
                      Platform.OS === 'ios' ? { backgroundColor: 'rgba(0,122,255,0.3)' } : { backgroundColor: colors.primary },
                    ],
                  ]}
                  onPress={() => {
                    setIsSignUp(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.authToggleText,
                      { color: Platform.OS === 'ios' ? textColor : !isSignUp ? colors.textSecondary : '#fff' },
                      isSignUp && styles.authToggleTextActive,
                    ]}
                  >
                    Opret konto
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.form}>
                <Text style={[styles.label, { color: textColor }]}>Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : bgColor,
                      color: textColor,
                    },
                  ]}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="din@email.dk"
                  placeholderTextColor={textSecondaryColor}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  editable={!loading}
                  autoCorrect={false}
                />

                <Text style={[styles.label, { color: textColor }]}>Adgangskode</Text>
                <TextInput
                  style={[
                    styles.input,
                    {
                      backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : bgColor,
                      color: textColor,
                    },
                  ]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Mindst 6 tegn"
                  placeholderTextColor={textSecondaryColor}
                  secureTextEntry
                  editable={!loading}
                  autoCorrect={false}
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={[styles.authButton, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
                  onPress={isSignUp ? handleSignup : handleLogin}
                  disabled={loading}
                  activeOpacity={0.7}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[styles.authButtonText, { marginLeft: 12 }]}>{isSignUp ? 'Opretter konto...' : 'Logger ind...'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.authButtonText}>{isSignUp ? 'Opret konto' : 'Log ind'}</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View
                style={[
                  styles.infoBox,
                  { backgroundColor: Platform.OS === 'ios' ? 'rgba(128,128,128,0.1)' : isDark ? '#2a3a4a' : '#e3f2fd' },
                ]}
              >
                <IconSymbol
                  ios_icon_name="info.circle"
                  android_material_icon_name="info"
                  size={Platform.OS === 'ios' ? 24 : 28}
                  color={Platform.OS === 'ios' ? colors.primary : colors.secondary}
                />
                <View style={Platform.OS !== 'ios' && styles.infoTextContainer}>
                  {Platform.OS !== 'ios' && (
                    <Text style={[styles.infoTitle, { color: textColor }]}>
                      {isSignUp ? 'Hvad sker der efter oprettelse?' : 'Hvorfor skal jeg logge ind?'}
                    </Text>
                  )}
                  <Text style={[styles.infoBoxText, { color: textSecondaryColor }]}>
                    {isSignUp
                      ? 'Efter du opretter din konto, bliver du automatisk logget ind og kan begynde at bruge appen med det samme. Du vil modtage en bekræftelsesmail som du kan bekræfte når du har tid.\n\nDu vil blive bedt om at vælge din rolle (spiller eller træner) og derefter vælge et abonnement hvis du er træner.'
                      : Platform.OS === 'ios'
                        ? 'Log ind for at gemme dine data sikkert i skyen.'
                        : 'For at gemme eksterne kalendere og synkronisere dine data på tværs af enheder, skal du oprette en gratis konto.\n\nDine data gemmes sikkert i Supabase og er kun tilgængelige for dig.'}
                  </Text>
                </View>
              </View>
            </>
          )}
        </CardWrapper>
      )}
    </View>
  );

  return (
    <ContainerWrapper style={[styles.safeArea, { backgroundColor: bgColor }]} edges={containerEdges}>
      <FlatList
        ref={scrollViewRef}
        data={[]}
        keyExtractor={(_, index) => `profile-flatlist-${index}`}
        renderItem={() => null}
        ListHeaderComponent={
          <React.Fragment>
            {renderProfileContent()}
          </React.Fragment>
        }
        ListFooterComponent={<View style={{ height: 120 }} />}
        contentContainerStyle={[styles.contentContainer, Platform.OS !== 'ios' && { paddingTop: 60 }]}
        showsVerticalScrollIndicator={false}
      />
      <Modal
        animationType="fade"
        transparent
        visible={isDeleteDialogVisible}
        onRequestClose={() => {
          if (!isDeletingAccount) {
            closeDeleteAccountDialog();
          }
        }}
      >
        <View style={styles.deleteModalOverlay}>
          <View style={[styles.deleteModalCard, { backgroundColor: cardBgColor }]}>
            <IconSymbol
              ios_icon_name="trash.fill"
              android_material_icon_name="delete"
              size={42}
              color={destructiveColor}
            />
            <Text style={[styles.deleteModalTitle, { color: textColor }]}>Vil du slette din konto?</Text>
            <Text style={[styles.deleteModalDescription, { color: textSecondaryColor }]}>
              Denne handling kan ikke fortrydes. Skriv {DELETE_ACCOUNT_CONFIRMATION_PHRASE} for at bekræfte, at du vil slette alle dine data permanent.
            </Text>
            <TextInput
              value={deleteConfirmationInput}
              onChangeText={value => {
                setDeleteConfirmationInput(value);
                if (deleteAccountError) {
                  setDeleteAccountError(null);
                }
              }}
              placeholder={DELETE_ACCOUNT_CONFIRMATION_PHRASE}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isDeletingAccount}
              style={[
                styles.deleteModalInput,
                {
                  color: textColor,
                  borderColor: destructiveColor,
                  backgroundColor: Platform.OS === 'ios'
                    ? isDark
                      ? 'rgba(255,255,255,0.1)'
                      : 'rgba(0,0,0,0.04)'
                    : nestedCardBgColor,
                },
              ]}
              placeholderTextColor={textSecondaryColor}
            />
            {deleteAccountError ? (
              <Text style={styles.deleteModalError}>{deleteAccountError}</Text>
            ) : null}
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={[styles.deleteModalButton, styles.deleteModalCancel]}
                onPress={() => {
                  if (!isDeletingAccount) {
                    closeDeleteAccountDialog();
                  }
                }}
                activeOpacity={0.7}
                disabled={isDeletingAccount}
              >
                <Text style={[styles.buttonText, { color: textColor }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteModalButton,
                  {
                    backgroundColor: destructiveColor,
                    opacity: isDeleteConfirmationValid && !isDeletingAccount ? 1 : 0.6,
                  },
                ]}
                onPress={handleConfirmDeleteAccount}
                activeOpacity={0.7}
                disabled={!isDeleteConfirmationValid || isDeletingAccount}
              >
                {isDeletingAccount ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, { color: '#fff' }]}>Slet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ContainerWrapper>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  profileHeader: {
    alignItems: 'center',
    borderRadius: 12,
    padding: 32,
    marginBottom: 16,
    gap: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: Platform.OS === 'ios' ? 100 : 80,
    height: Platform.OS === 'ios' ? 100 : 80,
    borderRadius: Platform.OS === 'ios' ? 50 : 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: Platform.OS === 'ios' ? 32 : 28,
    height: Platform.OS === 'ios' ? 32 : 28,
    borderRadius: Platform.OS === 'ios' ? 16 : 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  email: {
    fontSize: 16,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Platform.OS === 'ios' ? 12 : 10,
    paddingVertical: Platform.OS === 'ios' ? 6 : 4,
    borderRadius: Platform.OS === 'ios' ? 20 : 12,
  },
  planBadgeText: {
    fontSize: Platform.OS === 'ios' ? 14 : 12,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
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
  sectionDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16,
    marginBottom: 20,
  },
  manageBlock: {
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    marginBottom: 8,
    gap: 12,
  },
  manageBlockTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  manageBlockDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  manageActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 24,
  },
  manageActionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
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
    fontSize: Platform.OS === 'ios' ? 14 : 17,
    fontWeight: '600',
    marginBottom: Platform.OS === 'ios' ? 4 : 8,
    marginTop: 8,
  },
  input: {
    borderRadius: Platform.OS === 'ios' ? 8 : 12,
    padding: Platform.OS === 'ios' ? 12 : 16,
    fontSize: Platform.OS === 'ios' ? 16 : 17,
    marginBottom: Platform.OS === 'ios' ? 8 : 12,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 14,
    borderRadius: Platform.OS === 'ios' ? 8 : 12,
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
    paddingVertical: Platform.OS === 'ios' ? 16 : 18,
    borderRadius: Platform.OS === 'ios' ? 12 : 14,
    marginTop: Platform.OS === 'ios' ? 16 : 8,
  },
  signOutButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  authCard: {
    borderRadius: Platform.OS === 'ios' ? 12 : 20,
    padding: 24,
  },
  successMessage: {
    borderRadius: Platform.OS === 'ios' ? 12 : 16,
    padding: Platform.OS === 'ios' ? 40 : 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Platform.OS === 'ios' ? 20 : 16,
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
  title: {
    fontSize: Platform.OS === 'ios' ? 28 : 36,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 24,
    textAlign: 'center',
  },
  authToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: Platform.OS === 'ios' ? 24 : 32,
  },
  authToggleButton: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 12 : 14,
    borderRadius: Platform.OS === 'ios' ? 8 : 12,
    alignItems: 'center',
    backgroundColor: Platform.OS === 'ios' ? 'rgba(128,128,128,0.2)' : colors.highlight,
  },
  authToggleButtonActive: {},
  authToggleText: {
    fontSize: Platform.OS === 'ios' ? 16 : 17,
    fontWeight: '600',
  },
  authToggleTextActive: {
    fontWeight: 'bold',
  },
  form: {
    gap: 8,
  },
  authButton: {
    paddingVertical: Platform.OS === 'ios' ? 16 : 18,
    borderRadius: Platform.OS === 'ios' ? 8 : 14,
    alignItems: 'center',
    marginTop: 16,
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
    gap: Platform.OS === 'ios' ? 12 : 16,
    marginTop: 24,
    padding: Platform.OS === 'ios' ? 16 : 20,
    borderRadius: Platform.OS === 'ios' ? 8 : 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoBoxText: {
    flex: Platform.OS === 'ios' ? 1 : undefined,
    fontSize: Platform.OS === 'ios' ? 14 : 15,
    lineHeight: Platform.OS === 'ios' ? 20 : 22,
  },
  onboardingCard: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
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
    borderColor: Platform.OS === 'ios' ? 'rgba(0,122,255,0.5)' : colors.primary,
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
  subscriptionCard: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  },
  settingsCard: {
    gap: 16,
  },
  settingsGroup: {
    marginTop: 20,
    gap: 12,
  },
  settingsGroupTitle: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: Platform.OS === 'ios' ? 14 : 16,
    paddingHorizontal: Platform.OS === 'ios' ? 12 : 16,
    borderRadius: Platform.OS === 'ios' ? 12 : 14,
  },
  settingsRowContent: {
    flex: 1,
    gap: 2,
  },
  settingsRowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  settingsRowSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  deleteExternalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: Platform.OS === 'ios' ? 16 : 16,
    borderRadius: Platform.OS === 'ios' ? 12 : 14,
    marginTop: 20,
  },
  deleteExternalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  deleteModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deleteModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: Platform.OS === 'ios' ? 16 : 20,
    padding: Platform.OS === 'ios' ? 24 : 28,
    alignItems: 'center',
    gap: 16,
  },
  deleteModalTitle: {
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  deleteModalDescription: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  deleteModalInput: {
    width: '100%',
    marginTop: 8,
    borderWidth: 1,
    borderRadius: Platform.OS === 'ios' ? 10 : 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 14,
    paddingHorizontal: 16,
    fontSize: 16,
    textTransform: 'uppercase',
  },
  deleteModalError: {
    width: '100%',
    marginTop: 8,
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
    color: Platform.OS === 'ios' ? '#ff3b30' : colors.error,
  },
  deleteModalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    width: '100%',
  },
  deleteModalButton: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 16,
    borderRadius: Platform.OS === 'ios' ? 12 : 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalCancel: {
    borderWidth: 1,
    borderColor: Platform.OS === 'ios' ? 'rgba(60,60,67,0.18)' : 'rgba(0,0,0,0.3)',
  },
});

interface ManagePlayersSectionProps {
  CardWrapperComponent: React.ComponentType<any>;
  cardWrapperProps: Record<string, unknown>;
  cardBgColor: string;
  nestedCardBgColor: string;
  textColor: string;
  textSecondaryColor: string;
  subscriptionStatus: SubscriptionStatusType;
}

function ManagePlayersSection({
  CardWrapperComponent,
  cardWrapperProps,
  cardBgColor,
  nestedCardBgColor,
  textColor,
  textSecondaryColor,
  subscriptionStatus,
}: ManagePlayersSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [playersRefreshTrigger, setPlayersRefreshTrigger] = useState(0);
  const { refreshTeams, refreshPlayers } = useTeamPlayer();

  const handleManagePlayerCreated = useCallback(() => {
    setPlayersRefreshTrigger(prev => prev + 1);
    refreshPlayers();
    refreshTeams();
  }, [refreshPlayers, refreshTeams]);

  const handleOpenCreatePlayer = useCallback(() => {
    if (!subscriptionStatus?.hasSubscription) {
      Alert.alert(
        'Abonnement påkrævet',
        'Du skal have et aktivt abonnement for at oprette spillere. Start din 14-dages gratis prøveperiode nu!',
        [{ text: 'OK' }]
      );
      return;
    }

    const maxPlayers = subscriptionStatus?.maxPlayers;
    const currentPlayers = subscriptionStatus?.currentPlayers;

    if (typeof maxPlayers === 'number' && typeof currentPlayers === 'number' && currentPlayers >= maxPlayers) {
      Alert.alert(
        'Spillergrænse nået',
        `Din ${subscriptionStatus?.planName ?? 'nuværende'} plan tillader op til ${maxPlayers} spiller${maxPlayers > 1 ? 'e' : ''}. Opgrader din plan for at tilføje flere spillere.`,
        [{ text: 'OK' }]
      );
      return;
    }

    setShowCreatePlayerModal(true);
  }, [subscriptionStatus]);

  return (
    <>
      <CardWrapperComponent style={[styles.section, Platform.OS !== 'ios' && { backgroundColor: cardBgColor }]} {...cardWrapperProps}>
        <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setIsExpanded(prev => !prev)} activeOpacity={0.7}>
          <View style={styles.sectionTitleContainer}>
            <IconSymbol ios_icon_name="person.3.fill" android_material_icon_name="groups" size={28} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: textColor }]}>Administrer spillere</Text>
          </View>
          <IconSymbol
            ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
            android_material_icon_name={isExpanded ? 'expand_less' : 'expand_more'}
            size={24}
            color={textSecondaryColor}
          />
        </TouchableOpacity>

        {isExpanded && (
          <>
            <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
              Opret teams, tilføj spillere og administrer dine eksisterende relationer direkte fra din profil.
            </Text>

            <View style={[styles.manageBlock, { backgroundColor: nestedCardBgColor }]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleContainer}>
                  <IconSymbol ios_icon_name="person.3" android_material_icon_name="groups" size={24} color={colors.primary} />
                  <Text style={[styles.manageBlockTitle, { color: textColor }]}>Teams</Text>
                </View>
              </View>
              <Text style={[styles.manageBlockDescription, { color: textSecondaryColor }]}>
                Opret og administrer teams, og tilknyt spillere til de rigtige hold.
              </Text>
              <TeamManagement />
            </View>

            <View style={[styles.manageBlock, { backgroundColor: nestedCardBgColor }]}>
              <View style={styles.sectionHeader}>
                <View style={styles.sectionTitleContainer}>
                  <IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="group" size={24} color={colors.primary} />
                  <Text style={[styles.manageBlockTitle, { color: textColor }]}>Spillere</Text>
                </View>
                <TouchableOpacity
                  style={[styles.manageActionButton, { backgroundColor: colors.primary }]}
                  onPress={handleOpenCreatePlayer}
                  activeOpacity={0.7}
                >
                  <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={18} color="#fff" />
                  <Text style={styles.manageActionButtonText}>Tilføj spiller</Text>
                </TouchableOpacity>
              </View>
              <PlayersList onCreatePlayer={handleOpenCreatePlayer} refreshTrigger={playersRefreshTrigger} />
            </View>
          </>
        )}
      </CardWrapperComponent>

      <CreatePlayerModal visible={showCreatePlayerModal} onClose={() => setShowCreatePlayerModal(false)} onPlayerCreated={handleManagePlayerCreated} />
    </>
  );
}
