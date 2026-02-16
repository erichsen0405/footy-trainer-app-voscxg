/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  Alert,
  Platform,
  ActivityIndicator,
  FlatList,
  Modal,
  Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
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
import { forceUserRoleRefresh } from '@/hooks/useUserRole';
import { useAppleIAP, PRODUCT_IDS } from '@/contexts/AppleIAPContext';
import { getSubscriptionGateState } from '@/utils/subscriptionGate';
import { checkNotificationPermissions, openNotificationSettings, requestNotificationPermissions } from '@/utils/notificationService';
import { syncPushTokenForCurrentUser } from '@/utils/pushTokenService';

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
  admin_id: string;
  full_name: string;
  phone_number: string;
  email: string;
  link_status: 'pending' | 'accepted';
  request_id: string | null;
}

type SubscriptionStatusType = ReturnType<typeof useSubscription>['subscriptionStatus'];

type UpgradeTarget = 'library' | 'calendarSync' | 'trainerLinking';

type CollapsibleSectionProps = {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  titleColor: string;
  chevronColor: string;
  icon?: React.ReactNode;
  headerActions?: React.ReactNode;
  testID?: string;
  children: React.ReactNode;
};

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

const extractFirstParamValue = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

const DELETE_ACCOUNT_CONFIRMATION_PHRASE = 'SLET';
const ACCOUNT_DELETION_REVIEW_PATH = 'Profil -> Indstillinger -> Konto -> Slet konto';

const authRedirectUrl = 'footballcoach://auth/callback';

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  contentContainer: { paddingHorizontal: 16, paddingBottom: 120 },
  title: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 16, textAlign: 'center', lineHeight: 22 },
  onboardingCard: { borderRadius: 20, padding: 20, marginTop: 24, gap: 16 },
  onboardingTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  onboardingDescription: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  roleCard: { borderRadius: 18, padding: 18, marginTop: 12, alignItems: 'center', gap: 8 },
  roleTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  roleDescription: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 12, fontSize: 14, fontWeight: '600' },
  purchaseOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: colors.background,
  },
  purchaseOverlayText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.text,
  },
  subscriptionCard: { borderRadius: 20, padding: 20, marginTop: 24 },
  profileHeader: { borderRadius: 24, padding: 24, marginHorizontal: 16, marginTop: 16, alignItems: 'center' },
  avatarContainer: { position: 'relative', marginBottom: 16 },
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  subscriptionBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  name: { fontSize: 24, fontWeight: '800', textAlign: 'center' },
  email: { fontSize: 14, textAlign: 'center' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 12 },
  planBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  planBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  section: { borderRadius: 20, padding: 20, marginHorizontal: 16, marginTop: 16 },
  subscriptionCardFrame: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  subscriptionCardFrameDark: {
    backgroundColor: '#1f1f1f',
    borderRadius: 20,
    padding: 20,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: 'rgba(0,0,0,0.4)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  sectionGlassFrame: {
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    overflow: 'hidden',
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editForm: { gap: 12 },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  editButtons: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  profileInfo: { gap: 12, marginTop: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoText: { fontSize: 15, fontWeight: '600' },
  emptyText: { fontSize: 14, fontStyle: 'italic' },
  collapsibleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitleContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sectionDescription: { fontSize: 14, lineHeight: 20, marginTop: 12 },
  deleteExternalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 16,
  },
  deleteExternalButtonText: { fontSize: 14, fontWeight: '700' },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  settingsCard: { borderRadius: 20, padding: 20, marginHorizontal: 16, marginTop: 16 },
  settingsGroup: { gap: 12, marginTop: 12 },
  settingsGroupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  settingsRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 14 },
  settingsRowContent: { flex: 1 },
  settingsRowTitle: { fontSize: 16, fontWeight: '700' },
  settingsRowSubtitle: { fontSize: 13, lineHeight: 18 },
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  addPlayerButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  statusBadgePending: {
    backgroundColor: '#f59e0b',
  },
  statusBadgeAccepted: {
    backgroundColor: '#16a34a',
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  acceptButton: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginVertical: 24,
    borderRadius: 16,
    paddingVertical: 16,
  },
  signOutButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  authCard: { borderRadius: 24, padding: 24, marginHorizontal: 16, marginTop: 24 },
  successMessage: { borderRadius: 20, padding: 24, alignItems: 'center', gap: 12 },
  successTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
  successText: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  authToggle: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  authToggleButton: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  authToggleButtonActive: { borderWidth: 0 },
  authToggleText: { fontSize: 16, fontWeight: '600' },
  authToggleTextActive: { color: '#fff' },
  form: { gap: 12 },
  authButton: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  authButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  forgotPasswordButton: { marginTop: 10, alignItems: 'center', paddingVertical: 6 },
  forgotPasswordText: { fontSize: 14, fontWeight: '600' },
  infoBox: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 16 },
  infoTextContainer: { flex: 1, minWidth: 0 },
  infoTitle: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
  infoBoxText: { fontSize: 14, lineHeight: 20 },
  deleteModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  deleteModalCard: { width: '100%', borderRadius: 20, padding: 24, gap: 16 },
  deleteModalTitle: { fontSize: 20, fontWeight: '800', textAlign: 'center' },
  deleteModalDescription: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  deleteModalInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, textAlign: 'center' },
  deleteModalError: { fontSize: 13, fontWeight: '600', color: '#ff3b30', textAlign: 'center' },
  deleteModalActions: { flexDirection: 'row', gap: 12 },
  deleteModalButton: { flex: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  deleteModalCancel: { borderWidth: 1 },
  paywallContainer: { flex: 1 },
  paywallContent: { flex: 1, paddingHorizontal: 20, paddingBottom: 24 },
  paywallHeader: { flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 16 },
  paywallCloseButton: { padding: 8 },
  paywallTitle: { fontSize: 28, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  paywallSubtitle: { fontSize: 16, lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  paywallBody: { flex: 1 },
});

const CollapsibleSection = ({
  title,
  expanded,
  onToggle,
  titleColor,
  chevronColor,
  icon,
  headerActions,
  testID,
  children,
}: CollapsibleSectionProps) => (
  <>
    <Pressable
      style={styles.collapsibleHeader}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      testID={testID}
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
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'trainer' | 'player' | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [, setPaywallProcessing] = useState(false);
  const [purchaseProcessing, setPurchaseProcessing] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const lastUserIdRef = useRef<string | null>(null);

  // New onboarding flow states

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [originalPhone, setOriginalPhone] = useState('');

  // Collapsible sections
  const [isProfileInfoExpanded, setIsProfileInfoExpanded] = useState(false);
  const [isAdminInfoExpanded, setIsAdminInfoExpanded] = useState(false);
  const [isTeamManagementExpanded, setIsTeamManagementExpanded] = useState(false);
  const [isCalendarSyncExpanded, setIsCalendarSyncExpanded] = useState(false);
  const [isSubscriptionExpanded, setIsSubscriptionExpanded] = useState(false);
  const [isSettingsExpanded, setIsSettingsExpanded] = useState(false);
  const [subscriptionSectionY, setSubscriptionSectionY] = useState<number | null>(null);
  const scrollViewRef = useRef<any>(null);
  const params = useLocalSearchParams<{
    upgradeTarget?: string;
    email?: string | string[];
    authMode?: string | string[];
    openTrainerRequests?: string | string[];
    openTeamPlayers?: string | string[];
    requestId?: string | string[];
  }>();
  const router = useRouter();
  const routeUpgradeTarget = normalizeUpgradeTarget(params.upgradeTarget);
  const routeEmail = extractFirstParamValue(params.email);
  const routeAuthMode = extractFirstParamValue(params.authMode);
  const routeOpenTrainerRequests = extractFirstParamValue(params.openTrainerRequests);
  const routeOpenTeamPlayers = extractFirstParamValue(params.openTeamPlayers);
  const [manualUpgradeTarget, setManualUpgradeTarget] = useState<UpgradeTarget | null>(null);
  const hasAutoOpenedUpgradeTargetRef = useRef<UpgradeTarget | null>(null);

  // Delete external activities state
  const [isDeletingExternalActivities, setIsDeletingExternalActivities] = useState(false);
  const [isDeleteDialogVisible, setIsDeleteDialogVisible] = useState(false);
  const [deleteConfirmationInput, setDeleteConfirmationInput] = useState('');
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(false);
  const [notificationsUpdating, setNotificationsUpdating] = useState(false);
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [playersRefreshTrigger, setPlayersRefreshTrigger] = useState(0);
  const [isAcceptingTrainerRequest, setIsAcceptingTrainerRequest] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        setFocusNonce(prev => prev + 1);
      });
      return () => cancelAnimationFrame(frame);
    }, [])
  );

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

  useEffect(() => {
    if (routeOpenTrainerRequests === '1' || routeOpenTrainerRequests === 'true') {
      setIsAdminInfoExpanded(true);
    }
  }, [routeOpenTrainerRequests]);

  useEffect(() => {
    if (routeOpenTeamPlayers === '1' || routeOpenTeamPlayers === 'true') {
      setIsTeamManagementExpanded(true);
      setPlayersRefreshTrigger(prev => prev + 1);
    }
  }, [routeOpenTeamPlayers]);

  const refreshNotificationPermission = useCallback(async () => {
    try {
      const granted = await checkNotificationPermissions();
      setNotificationsEnabled(granted);
    } catch {
      setNotificationsEnabled(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshNotificationPermission();
  }, [user, focusNonce, refreshNotificationPermission]);

  const handleNotificationsToggle = useCallback(
    async (nextValue: boolean) => {
      if (notificationsUpdating) return;
      setNotificationsUpdating(true);
      try {
        if (nextValue) {
          await requestNotificationPermissions();
        } else {
          Alert.alert(
            'Notifikationer',
            'For at deaktivere notifikationer skal du bruge systemindstillinger.',
            [
              { text: 'Annuller', style: 'cancel' },
              {
                text: 'Åbn indstillinger',
                onPress: () => {
                  void openNotificationSettings();
                },
              },
            ]
          );
        }
        const granted = await checkNotificationPermissions();
        setNotificationsEnabled(granted);
        if (granted) {
          await syncPushTokenForCurrentUser(true);
        }
      } finally {
        setNotificationsUpdating(false);
      }
    },
    [notificationsUpdating]
  );

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Get subscription status
  const {
    subscriptionStatus,
    refreshSubscription,
    createSubscription,
    subscriptionPlans,
    loading: subscriptionLoading,
  } = useSubscription();
  const { refreshAll } = useFootball();
  const {
    entitlementSnapshot,
    refreshSubscriptionStatus,
    loading: iapLoading,
    iapReady,
    iapUnavailableReason,
    isRestoring,
    products: iapProducts,
  } = useAppleIAP();
  const { featureAccess, isLoading: subscriptionFeaturesLoading } = useSubscriptionFeatures();
  const subscriptionGate = getSubscriptionGateState({
    user,
    subscriptionStatus,
    entitlementSnapshot,
  });
  const shouldShowChooseSubscription = subscriptionGate.shouldShowChooseSubscription;

  const subscriptionPlansLoading =
    Platform.OS === 'ios'
      ? (iapLoading || isRestoring || (!iapReady && !iapUnavailableReason) || (!iapUnavailableReason && iapProducts.length === 0))
      : subscriptionLoading;

  const entitlementSnapshotRef = useRef(entitlementSnapshot);
  const subscriptionLoadingRef = useRef(subscriptionLoading);
  const subscriptionFeaturesLoadingRef = useRef(subscriptionFeaturesLoading);

  useEffect(() => {
    entitlementSnapshotRef.current = entitlementSnapshot;
  }, [entitlementSnapshot]);

  useEffect(() => {
    subscriptionLoadingRef.current = subscriptionLoading;
  }, [subscriptionLoading]);

  useEffect(() => {
    subscriptionFeaturesLoadingRef.current = subscriptionFeaturesLoading;
  }, [subscriptionFeaturesLoading]);

  const waitForPurchaseSettled = useCallback(async () => {
    const start = Date.now();
    const timeoutMs = 15000;
    while (Date.now() - start < timeoutMs) {
      const resolving = Boolean(entitlementSnapshotRef.current?.resolving);
      const subscriptionBusy = Boolean(subscriptionLoadingRef.current);
      const featuresBusy = Boolean(subscriptionFeaturesLoadingRef.current);
      if (!resolving && !subscriptionBusy && !featuresBusy) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return false;
  }, []);

  const canUseCalendarSync = featureAccess.calendarSync;
  const canLinkTrainer = featureAccess.trainerLinking;
  const effectiveUpgradeTarget = manualUpgradeTarget ?? routeUpgradeTarget;
  const highlightProductId =
    userRole === 'player' && effectiveUpgradeTarget ? PRODUCT_IDS.PLAYER_PREMIUM : undefined;
  const shouldHighlightPremiumPlan = Boolean(highlightProductId);

  const canManagePlayers = userRole === 'admin' || userRole === 'trainer';
  const subscriptionSelectionRole =
    userRole === 'player' ? 'player' : userRole ? 'trainer' : null;

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

  const closePaywallModal = useCallback(() => {
    setShowPaywallModal(false);
    setPaywallProcessing(false);
  }, []);

  const openPaywallModal = useCallback((target?: UpgradeTarget) => {
    if (target) setManualUpgradeTarget(target);
    setShowPaywallModal(true);
    setPaywallProcessing(false);
  }, []);

  const handleCreatePlayer = useCallback(() => {
    setShowCreatePlayerModal(true);
  }, []);

  const handlePlayerCreated = useCallback(() => {
    setShowCreatePlayerModal(false);
    setPlayersRefreshTrigger(prev => prev + 1);
  }, []);

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
      const { data: pendingRequest, error: pendingError } = await supabase
        .from('admin_player_link_requests')
        .select('id, admin_id')
        .eq('player_id', playerId)
        .eq('status', 'pending')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pendingError && pendingError.code !== 'PGRST116') {
        console.error('Error fetching pending trainer request:', pendingError);
        return;
      }

      let adminId: string | null = null;
      let linkStatus: 'pending' | 'accepted' = 'accepted';
      let requestId: string | null = null;

      if (pendingRequest?.admin_id) {
        adminId = pendingRequest.admin_id;
        requestId = pendingRequest.id;
        linkStatus = 'pending';
      } else {
        const { data: relationship, error: relError } = await supabase
          .from('admin_player_relationships')
          .select('admin_id')
          .eq('player_id', playerId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (relError && relError.code !== 'PGRST116') {
          console.error('Error fetching admin relationship:', relError);
          return;
        }

        if (!relationship?.admin_id) {
          setAdminInfo(null);
          return;
        }

        adminId = relationship.admin_id;
        linkStatus = 'accepted';
      }

      const { data: adminProfile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, phone_number')
        .eq('user_id', adminId)
        .maybeSingle();

      if (profileError) {
        console.error('Error fetching admin profile:', profileError);
      }

      setAdminInfo({
        admin_id: adminId,
        full_name: adminProfile?.full_name || 'Din træner',
        phone_number: adminProfile?.phone_number || '',
        email: '',
        link_status: linkStatus,
        request_id: requestId,
      });
    } catch (error) {
      console.error('Error in fetchAdminInfo:', error);
    }
  };

  const handleAcceptTrainerRequest = async () => {
    if (!adminInfo?.request_id || !user?.id || isAcceptingTrainerRequest) {
      return;
    }

    setIsAcceptingTrainerRequest(true);
    try {
      const { data, error } = await supabase.functions.invoke('player-link-requests', {
        body: {
          action: 'accept',
          requestId: adminInfo.request_id,
        },
      });

      if (error || !data?.success) {
        const message = data?.error || error?.message || 'Kunne ikke acceptere anmodningen';
        Alert.alert('Fejl', message);
        return;
      }

      Alert.alert('Succes', 'Anmodningen er accepteret.');
      await fetchAdminInfo(user.id);
      setPlayersRefreshTrigger(prev => prev + 1);
    } catch (acceptError: any) {
      Alert.alert('Fejl', acceptError?.message || 'Kunne ikke acceptere anmodningen');
    } finally {
      setIsAcceptingTrainerRequest(false);
    }
  };

  const checkUserOnboarding = useCallback(
    async (userId: string) => {
      if (lastUserIdRef.current !== userId) {
        lastUserIdRef.current = userId;
        setProfile(null);
        setAdminInfo(null);
        setUserRole(null);
        setShowPaywallModal(false);
        setPaywallProcessing(false);
        setIsEditingProfile(false);
      }
      if (__DEV__) {
        console.log('[PROFILE] Checking user onboarding status for user:', userId);
      }

      // Check if user has a role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      const role = roleError || !roleData ? null : (roleData.role as 'admin' | 'trainer' | 'player');
      setUserRole(role);
      if (__DEV__) {
        if (role) {
          console.log(`[PROFILE] Role found: ${role}`);
        } else {
          console.log('[PROFILE] No role found - skipping role selection');
        }
      }

      // Refresh subscription status after role resolution
      await refreshSubscription();

      // User is fully onboarded
      await fetchUserProfile(userId);

      if (role === 'player') {
        await fetchAdminInfo(userId);
      }
    },
    [refreshSubscription]
  );

  useEffect(() => {
    if (!user?.id) return;

    if (userRole === 'player') {
      void fetchAdminInfo(user.id);
      return;
    }

    if (userRole === 'admin' || userRole === 'trainer') {
      setPlayersRefreshTrigger(prev => prev + 1);
    }
  }, [focusNonce, user?.id, userRole]);

  useEffect(() => {
    if (!user?.id || userRole !== 'player') return;

    const channel = supabase
      .channel(`player-link-refresh-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_player_relationships',
          filter: `player_id=eq.${user.id}`,
        },
        () => {
          void fetchAdminInfo(user.id);
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'admin_player_link_requests',
          filter: `player_id=eq.${user.id}`,
        },
        () => {
          void fetchAdminInfo(user.id);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          void fetchAdminInfo(user.id);
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user?.id, userRole]);

  const handleIOSSubscriptionStarted = useCallback(() => {
    setPurchaseProcessing(true);
  }, []);

  const handleIOSSubscriptionFinished = useCallback(
    async (success: boolean) => {
      if (!success) {
        setPurchaseProcessing(false);
        return;
      }
      setPurchaseProcessing(true);
      try {
        await refreshSubscriptionStatus({ force: true, reason: 'profile_purchase' });
        await refreshSubscription();
        if (user?.id) {
          await checkUserOnboarding(user.id);
        }
        forceUserRoleRefresh('ios-purchase');
        await waitForPurchaseSettled();
      } finally {
        setPurchaseProcessing(false);
      }
    },
    [checkUserOnboarding, refreshSubscription, refreshSubscriptionStatus, user?.id, waitForPurchaseSettled]
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
        if (lastUserIdRef.current !== session.user.id) {
          lastUserIdRef.current = session.user.id;
          setProfile(null);
          setAdminInfo(null);
          setUserRole(null);
          setShowPaywallModal(false);
          setPaywallProcessing(false);
          setIsEditingProfile(false);
        }
        // Refresh subscription status immediately on auth state change
        await refreshSubscription();
        await checkUserOnboarding(session.user.id);
      } else {
        lastUserIdRef.current = null;
        setUserRole(null);
        setProfile(null);
        setAdminInfo(null);
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

  useEffect(() => {
    if (!user) return;
    if (shouldShowChooseSubscription) return;
    if (!effectiveUpgradeTarget) return;
    if (hasAutoOpenedUpgradeTargetRef.current === effectiveUpgradeTarget) return;
    hasAutoOpenedUpgradeTargetRef.current = effectiveUpgradeTarget;
    openPaywallModal(effectiveUpgradeTarget);
  }, [user, shouldShowChooseSubscription, effectiveUpgradeTarget, openPaywallModal]);

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
      Alert.alert('Fejl', 'Udfyld venligst baade email og adgangskode');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Fejl', 'Indtast venligst en gyldig email-adresse');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Fejl', 'Adgangskoden skal vaere mindst 6 tegn lang');
      return;
    }

    setLoading(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: authRedirectUrl,
        },
      });

      if (error) {
        if (__DEV__) {
          console.log(`[PROFILE] Signup error: ${error.message}`);
        }
        console.error('Sign up error:', error);
        const errorMessage = error.message?.toLowerCase?.() ?? '';
        if (errorMessage.includes('already registered') || errorMessage.includes('already been registered')) {
          router.replace({
            pathname: '/auth/check-email',
            params: { email: normalizedEmail },
          });
          return;
        }
        Alert.alert('Kunne ikke oprette konto', error.message || 'Der opstod en fejl. Proev venligst igen.');
        return;
      }

      const identities = Array.isArray((data.user as any)?.identities) ? (data.user as any).identities : null;
      const isExistingUserResponse = Boolean(data.user && identities && identities.length === 0);
      if (isExistingUserResponse) {
        Alert.alert(
          'Konto findes allerede',
          'Denne e-mail har sandsynligvis allerede en konto. Derfor sendes der ikke altid en ny bekræftelsesmail. Proev at logge ind i stedet.'
        );
        router.replace({
          pathname: '/(tabs)/profile',
          params: { email: normalizedEmail, authMode: 'login' },
        });
        return;
      }

      if (!data.user) {
        if (__DEV__) {
          console.log('[PROFILE] No user returned from signup');
        }
        Alert.alert('Fejl', 'Kunne ikke oprette bruger. Proev venligst igen.');
        return;
      }

      setEmail('');
      setPassword('');
      setShowSuccessMessage(false);
      setIsSignUp(false);
      router.replace({
        pathname: '/auth/check-email',
        params: { email: normalizedEmail },
      });
    } catch (error: any) {
      if (__DEV__) {
        console.log(`[PROFILE] Unexpected error: ${error.message}`);
      }
      console.error('Signup error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en uventet fejl. Proev venligst igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Fejl', 'Udfyld venligst baade email og adgangskode');
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
        error: error?.message,
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
          Alert.alert(
            'Login fejlede',
            'Email eller adgangskode er forkert.\n\nHusk:\n- Har du bekraeftet din email?\n- Er du sikker paa at du har oprettet en konto?\n- Proev at nulstille din adgangskode hvis du har glemt den.'
          );
        } else {
          Alert.alert('Login fejlede', error.message || 'Der opstod en fejl. Proev venligst igen.');
        }
        return;
      }

      if (data.session) {
        Alert.alert('Succes!', 'Du er nu logget ind!');
        setEmail('');
        setPassword('');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en uventet fejl. Proev venligst igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = useCallback(() => {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      console.log('[PROFILE] Navigating to forgot-password screen', { normalizedEmail });
      router.replace({
        pathname: '/auth/forgot-password',
        params: { email: normalizedEmail },
      });
    } catch (error: any) {
      console.error('[PROFILE] Failed to open forgot-password screen', error);
      Alert.alert('Fejl', 'Kunne ikke aabne nulstilling af adgangskode.');
    }
  }, [email, router]);

  const handleCompleteSubscription = async (planId: string) => {
    if (!user) return;

    setPurchaseProcessing(true);
    setLoading(true);
    if (__DEV__) {
      console.log(`[PROFILE] Creating subscription with plan: ${planId}`);
    }

    try {
      const result = await createSubscription(planId);

      if (result.success) {
        Alert.alert(
          'Velkommen!',
          'Dit abonnement er aktiveret med 14 dages gratis prøveperiode. Du kan nu oprette spillere og hold!',
          [{ text: 'OK' }]
        );
        return;
      }

      if (result.alreadyHasSubscription) {
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
      setPurchaseProcessing(false);
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
      'Er du sikker på at du vil slette ALLE dine eksterne aktiviteter?\n\nDette vil slette alle aktiviteter importeret fra eksterne kalendere. Aktiviteterne vil blive importeret igen ved næste synkronisering, medmindre du fjerner kalenderne fra din profil.\n\nBemærk: Denne handling kan ikke fortrydes!',
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
  // Use a non-blurred wrapper for subscription card to avoid flicker while keeping a frame
  const SubscriptionCardWrapper = Platform.OS === 'ios' ? View : CardWrapper;
  const subscriptionCardProps = Platform.OS === 'ios' ? {} : cardWrapperProps;
  const sectionCardStyle = Platform.OS === 'ios'
    ? (isDark ? styles.subscriptionCardFrameDark : styles.subscriptionCardFrame)
    : { backgroundColor: cardBgColor };

  // Platform-specific container
  const ContainerWrapper = Platform.OS === 'ios' ? SafeAreaView : View;
  const containerEdges = Platform.OS === 'ios' ? (['top'] as const) : undefined;
  const PaywallWrapper = Platform.OS === 'ios' ? SafeAreaView : View;
  const paywallEdges = Platform.OS === 'ios' ? (['top', 'bottom'] as const) : undefined;
  const paywallWrapperProps = Platform.OS === 'ios' ? { edges: paywallEdges } : {};

  const purchaseProcessingModal = (
    <Modal animationType="fade" transparent visible={purchaseProcessing}>
      <View style={styles.purchaseOverlay}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.purchaseOverlayText}>Opdaterer abonnement...</Text>
      </View>
    </Modal>
  );

  // Show subscription selection if user is trainer but has no subscription
  if (user && shouldShowChooseSubscription) {
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
                  {Platform.OS === 'ios' ? (
                    <AppleSubscriptionManager
                      isSignupFlow
                      forceShowPlans
                      selectedRole={subscriptionSelectionRole ?? undefined}
                      onPurchaseStarted={handleIOSSubscriptionStarted}
                      onPurchaseFinished={handleIOSSubscriptionFinished}
                    />
                  ) : (
                    <SubscriptionManager
                      onPlanSelected={handleCompleteSubscription}
                      isSignupFlow={true}
                      selectedRole={subscriptionSelectionRole ?? undefined}
                    />
                  )}
                </CardWrapper>
              </View>
            </React.Fragment>
          }
          contentContainerStyle={[styles.contentContainer]}
          showsVerticalScrollIndicator={false}
        />
        {purchaseProcessingModal}
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
                  <Text style={styles.planBadgeText} testID="profile.subscriptionPlanBadgeText">{subscriptionStatus.planName}</Text>
                </View>
              </View>
            )}
          </CardWrapper>

          {/* Profile Info Section */}
          <CardWrapper
            style={[styles.section, sectionCardStyle]}
            {...cardWrapperProps}
          >
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
                      setOriginalName(profile?.full_name || '');
                      setOriginalPhone(profile?.phone_number || '');
                    }}
                    accessibilityRole="button"
                  >
                    <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.primary} />
                  </Pressable>
                ) : null
              }
            >
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
            </CollapsibleSection>
          </CardWrapper>

          {/* Admin Info for Players */}
          {userRole === 'player' &&
            (subscriptionFeaturesLoading ? (
              <CardWrapper
                style={[styles.section, sectionCardStyle]}
                {...cardWrapperProps}
              >
                <CollapsibleSection
                  title="Din Træner"
                  expanded={isAdminInfoExpanded}
                  onToggle={() => setIsAdminInfoExpanded(prev => !prev)}
                  titleColor={textColor}
                  chevronColor={textSecondaryColor}
                  icon={<IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={24} color={colors.primary} />}
                >
                  <View style={[styles.loadingContainer, { paddingVertical: 24 }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                  </View>
                </CollapsibleSection>
              </CardWrapper>
            ) : adminInfo ? (
              <CardWrapper
                style={[styles.section, sectionCardStyle]}
                {...cardWrapperProps}
              >
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
                      <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={20} color={colors.primary} />
                      <Text style={[styles.infoText, { color: textColor }]}>{adminInfo.full_name}</Text>
                    </View>
                    {adminInfo.phone_number && (
                      <View style={styles.infoRow}>
                        <IconSymbol ios_icon_name="phone.fill" android_material_icon_name="phone" size={20} color={colors.primary} />
                        <Text style={[styles.infoText, { color: textColor }]}>{adminInfo.phone_number}</Text>
                      </View>
                    )}
                    <View
                      style={[
                        styles.statusBadge,
                        adminInfo.link_status === 'pending'
                          ? styles.statusBadgePending
                          : styles.statusBadgeAccepted,
                      ]}
                      testID="profile.trainerRequest.statusBadge"
                    >
                      <Text style={styles.statusBadgeText}>
                        {adminInfo.link_status === 'pending' ? 'Afventer accept' : 'Accepteret'}
                      </Text>
                    </View>
                    {adminInfo.link_status === 'pending' && (
                      <TouchableOpacity
                        style={[
                          styles.acceptButton,
                          { backgroundColor: colors.primary },
                          isAcceptingTrainerRequest && { opacity: 0.7 },
                        ]}
                        onPress={() => {
                          void handleAcceptTrainerRequest();
                        }}
                        disabled={isAcceptingTrainerRequest}
                        testID="profile.trainerRequest.acceptButton"
                      >
                        {isAcceptingTrainerRequest ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.acceptButtonText}>Accepter anmodning</Text>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </CollapsibleSection>
              </CardWrapper>
            ) : canLinkTrainer ? (
              <CardWrapper
                style={[styles.section, sectionCardStyle]}
                {...cardWrapperProps}
              >
                <CollapsibleSection
                  title="Din Træner"
                  expanded={isAdminInfoExpanded}
                  onToggle={() => setIsAdminInfoExpanded(prev => !prev)}
                  titleColor={textColor}
                  chevronColor={textSecondaryColor}
                  icon={<IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={24} color={colors.primary} />}
                >
                  <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
                    Du har ingen aktive træneranmodninger endnu.
                  </Text>
                </CollapsibleSection>
              </CardWrapper>
            ) : (
              <CardWrapper
                style={[styles.section, sectionCardStyle]}
                {...cardWrapperProps}
              >
                <CollapsibleSection
                  title="Din Træner"
                  expanded={isAdminInfoExpanded}
                  onToggle={() => setIsAdminInfoExpanded(prev => !prev)}
                  titleColor={textColor}
                  chevronColor={textSecondaryColor}
                  icon={<IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={24} color={colors.primary} />}
                >
                  <PremiumFeatureGate
                    title="Tilslut din træner med Premium"
                    description="Opgrader for at give din træner adgang til dine aktiviteter og opgaver."
                    onPress={() => openPaywallModal('trainerLinking')}
                    icon={{ ios: 'person.2.circle', android: 'groups' }}
                    align="left"
                  />
                </CollapsibleSection>
              </CardWrapper>
            ))}

          {canManagePlayers && (
            <CardWrapper
              style={[styles.section, sectionCardStyle]}
              {...cardWrapperProps}
            >
              <CollapsibleSection
                title="Hold & spillere"
                expanded={isTeamManagementExpanded}
                onToggle={() => setIsTeamManagementExpanded(prev => !prev)}
                titleColor={textColor}
                chevronColor={textSecondaryColor}
                testID="profile.teamPlayersSection.toggle"
                icon={(
                  <IconSymbol
                    ios_icon_name="person.3.fill"
                    android_material_icon_name="groups"
                    size={28}
                    color={colors.primary}
                  />
                )}
              >
                <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>Administrer dine teams og spillere direkte fra din profil.</Text>
                <TeamManagement />
                <View style={{ marginTop: 16 }}>
                  <TouchableOpacity
                    style={[styles.addPlayerButton, { backgroundColor: colors.primary }]}
                    onPress={handleCreatePlayer}
                    activeOpacity={0.7}
                    testID="profile.addPlayerButton"
                  >
                    <IconSymbol
                      ios_icon_name="plus"
                      android_material_icon_name="add"
                      size={20}
                      color="#fff"
                    />
                    <Text style={styles.addPlayerButtonText}>Tilføj spiller</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ marginTop: 16 }}>
                  <PlayersList
                    onCreatePlayer={handleCreatePlayer}
                    refreshTrigger={playersRefreshTrigger}
                  />
                </View>
              </CollapsibleSection>
            </CardWrapper>
          )}

          {/* Calendar Sync Section - Collapsible - Available for all users */}
          <CardWrapper
            style={[styles.section, sectionCardStyle]}
            {...cardWrapperProps}
          >
            <CollapsibleSection
              title="Kalender Synkronisering"
              expanded={isCalendarSyncExpanded}
              onToggle={() => setIsCalendarSyncExpanded(prev => !prev)}
              titleColor={textColor}
              chevronColor={textSecondaryColor}
              icon={<IconSymbol ios_icon_name="calendar.badge.plus" android_material_icon_name="event" size={28} color={colors.primary} />}
            >
              {subscriptionFeaturesLoading ? (
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
                  onPress={() => openPaywallModal('calendarSync')}
                  icon={{ ios: 'calendar.badge.plus', android: 'event' }}
                  align="left"
                />
              )}
            </CollapsibleSection>
          </CardWrapper>

          {/* Subscription Section - Collapsible - Available for all users */}
          <View onLayout={event => setSubscriptionSectionY(event.nativeEvent.layout.y)}>
            <SubscriptionCardWrapper
              style={[
                styles.section,
                Platform.OS === 'ios'
                  ? (isDark ? styles.subscriptionCardFrameDark : styles.subscriptionCardFrame)
                  : { backgroundColor: cardBgColor },
              ]}
              {...subscriptionCardProps}
            >
              <CollapsibleSection
                title="Abonnement"
                expanded={isSubscriptionExpanded}
                onToggle={() => setIsSubscriptionExpanded(prev => !prev)}
                titleColor={textColor}
                chevronColor={textSecondaryColor}
                icon={<IconSymbol ios_icon_name="creditcard.fill" android_material_icon_name="payment" size={28} color={colors.primary} />}
              >
                <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>Administrer dit abonnement</Text>
                {subscriptionPlansLoading ? (
                  <View style={[styles.loadingContainer, { paddingVertical: 24 }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: textSecondaryColor }]}>
                      Henter abonnementer...
                    </Text>
                  </View>
                ) : Platform.OS === 'ios' ? (
                  <AppleSubscriptionManager
                    highlightProductId={highlightProductId}
                    forceShowPlans={!subscriptionGate.hasActiveSubscription}
                    selectedRole={subscriptionSelectionRole ?? undefined}
                    transparentBackground
                    onPurchaseStarted={handleIOSSubscriptionStarted}
                  onPurchaseFinished={handleIOSSubscriptionFinished}
                  />
                ) : (
                  <SubscriptionManager transparentBackground={Platform.OS === 'ios'} />
                )}
              </CollapsibleSection>
            </SubscriptionCardWrapper>
          </View>

          <CardWrapper
            style={[styles.section, styles.settingsCard, sectionCardStyle]}
            {...cardWrapperProps}
          >
            <CollapsibleSection
              title="Indstillinger"
              expanded={isSettingsExpanded}
              onToggle={() => setIsSettingsExpanded(prev => !prev)}
              titleColor={textColor}
              chevronColor={textSecondaryColor}
              testID="profile.settingsSection.toggle"
              icon={<IconSymbol ios_icon_name="gearshape.fill" android_material_icon_name="settings" size={24} color={colors.primary} />}
            >
              <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>Administrer din konto og sikkerhed.</Text>
              <View style={styles.settingsGroup}>
                <Text style={[styles.settingsGroupTitle, { color: textSecondaryColor }]}>Konto</Text>
                <View
                  style={[styles.settingsRow, { backgroundColor: nestedCardBgColor }]}
                  testID="profile.notificationsRow"
                >
                  <IconSymbol
                    ios_icon_name="bell.badge.fill"
                    android_material_icon_name="notifications"
                    size={22}
                    color={colors.primary}
                  />
                  <View style={styles.settingsRowContent}>
                    <Text style={[styles.settingsRowTitle, { color: textColor }]}>Notifikationer</Text>
                    <Text style={[styles.settingsRowSubtitle, { color: textSecondaryColor }]}>
                      {notificationsEnabled ? 'Aktiveret' : 'Deaktiveret'}
                    </Text>
                  </View>
                  <Switch
                    testID="profile.notificationsToggle"
                    value={notificationsEnabled}
                    onValueChange={(value) => {
                      void handleNotificationsToggle(value);
                    }}
                    disabled={notificationsUpdating}
                    trackColor={{ false: '#c7c7cc', true: colors.primary }}
                  />
                </View>
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
            </CollapsibleSection>
          </CardWrapper>

          <TouchableOpacity
            style={[styles.signOutButton, { backgroundColor: Platform.OS === 'ios' ? '#ff3b30' : colors.error }]}
            onPress={handleSignOut}
            activeOpacity={0.7}
            testID="auth.signOutButton"
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
              <Text style={styles.successTitle}>Konto oprettet!</Text>
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
                  testID="auth.login.emailInput"
                  accessibilityLabel="Email"
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
                  testID="auth.login.passwordInput"
                  accessibilityLabel="Adgangskode"
                />

                <TouchableOpacity
                  style={[styles.authButton, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
                  onPress={isSignUp ? handleSignup : handleLogin}
                  disabled={loading}
                  activeOpacity={0.7}
                  testID="auth.login.submitButton"
                  accessibilityLabel={isSignUp ? 'Opret konto' : 'Log ind'}
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

                {!isSignUp ? (
                  <TouchableOpacity
                    style={styles.forgotPasswordButton}
                    onPress={handleForgotPassword}
                    activeOpacity={0.7}
                    disabled={loading}
                    accessibilityLabel="Glemt adgangskode"
                  >
                    <Text style={[styles.forgotPasswordText, { color: colors.primary }]}>Glemt adgangskode?</Text>
                  </TouchableOpacity>
                ) : null}
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
                <View style={styles.infoTextContainer}>
                  {Platform.OS !== 'ios' && (
                    <Text style={[styles.infoTitle, { color: textColor }]}>
                      {isSignUp ? 'Hvad sker der efter oprettelse?' : 'Hvorfor skal jeg logge ind?'}
                    </Text>
                  )}
                  <Text style={[styles.infoBoxText, { color: textSecondaryColor }]}>
                    {isSignUp
                      ? 'Bekræft din e-mail og log ind.\nVælg derefter abonnement som spiller eller træner.'
                      : 'Log ind for at bruge appen.'}
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
        keyboardShouldPersistTaps="handled"
        extraData={focusNonce}
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

      <Modal
        visible={showPaywallModal}
        transparent={false}
        animationType="slide"
        presentationStyle={Platform.OS === 'ios' ? 'fullScreen' : undefined}
        onRequestClose={closePaywallModal}
      >
        <PaywallWrapper
          style={[styles.paywallContainer, { backgroundColor: bgColor }]} {...paywallWrapperProps}
        >
          <View style={styles.paywallContent}>
            <View style={styles.paywallHeader}>
              <TouchableOpacity
                onPress={closePaywallModal}
                style={styles.paywallCloseButton}
                activeOpacity={0.7}
                testID="paywall.closeButton"
                accessibilityLabel="Luk paywall"
              >
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={textColor}
                />
              </TouchableOpacity>
            </View>
            <Text style={[styles.paywallTitle, { color: textColor }]}>Opgrader til Premium</Text>
            <Text style={[styles.paywallSubtitle, { color: textSecondaryColor }]}>
              Få adgang til denne funktion ved at opgradere dit abonnement.
            </Text>
            <View style={styles.paywallBody}>
              {Platform.OS === 'ios' ? (
                <AppleSubscriptionManager
                  highlightProductId={highlightProductId}
                  forceShowPlans={!subscriptionGate.hasActiveSubscription}
                  selectedRole={subscriptionSelectionRole ?? undefined}
                  onPurchaseStarted={handleIOSSubscriptionStarted}
                  onPurchaseFinished={handleIOSSubscriptionFinished}
                />
              ) : (
                <SubscriptionManager forceShowPlans={!subscriptionStatus?.hasSubscription} />
              )}
            </View>
          </View>
        </PaywallWrapper>
      </Modal>

      {purchaseProcessingModal}
      <CreatePlayerModal
        visible={showCreatePlayerModal}
        onClose={() => setShowCreatePlayerModal(false)}
        onPlayerCreated={handlePlayerCreated}
      />
    </ContainerWrapper>
  );
}
