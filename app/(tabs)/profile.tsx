import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TouchableOpacity,
  Image,
  TextInput,
  useColorScheme,
  Alert,
  Platform,
  ActivityIndicator,
  FlatList,
  Modal,
  ScrollView,
  Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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
import CategoryManagementModal from '@/components/CategoryManagementModal';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useFootball } from '@/contexts/FootballContext';
import { deleteAllExternalActivities } from '@/utils/deleteExternalActivities';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';
import { forceUserRoleRefresh } from '@/hooks/useUserRole';
import { useAppleIAP, PRODUCT_IDS } from '@/contexts/AppleIAPContext';
import { getSubscriptionGateState } from '@/utils/subscriptionGate';
import { resolveSubscriptionAccessState } from '@/utils/accessGate';
import { checkNotificationPermissions, openNotificationSettings, requestNotificationPermissions } from '@/utils/notificationService';
import { syncPushTokenForCurrentUser } from '@/utils/pushTokenService';
import { pickAndUploadProfileImage } from '@/utils/profileImageUpload';
import {
  MAX_PLAYER_PROFILE_POSITIONS,
  PLAYER_PROFILE_POSITION_OPTIONS,
  PROFILE_SELECT_LEGACY,
  PROFILE_SELECT_WITH_PLAYER_FIELDS,
  arePlayerProfilePositionsEqual,
  isMissingPlayerProfileFieldsError,
  normalizePlayerProfilePositions,
  withProfilePlayerFieldDefaults,
} from '@/utils/playerProfileOptions';
import { DropdownSelect } from '@/components/ui/DropdownSelect';
import {
  DEFAULT_OVERDUE_REMINDER_SETTINGS,
  buildHalfHourTimeOptions,
  cancelOverdueReminderNotifications,
  formatTimeFromMinutes,
  loadOverdueReminderSettings,
  persistOverdueReminderSettings,
  rescheduleOverdueReminderNotifications,
  type OverdueReminderSettings,
} from '@/utils/overdueReminderScheduler';

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
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  player_positions: string[];
  club_name: string | null;
  playing_level: string | null;
}

interface AdminInfo {
  admin_id: string;
  full_name: string;
  phone_number: string;
  email: string;
  link_status: 'pending' | 'accepted';
  request_id: string | null;
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

const DELETE_ACCOUNT_CONFIRMATION_PHRASE = 'DELETE';
const ACCOUNT_DELETION_REVIEW_PATH = 'Profile -> Settings -> Account -> Delete Account';
const PROFILE_EDIT_COLLAPSE_MESSAGE = 'Press Cancel or Save before you can close the section.';

const getFunctionErrorMessage = async (error: any, fallback: string) => {
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
      if (typeof payload?.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
    } catch {
      // Fall back to the Supabase error message below.
    }
  }

  return error?.message ?? fallback;
};

const authRedirectUrl = 'footballcoach://auth/callback';
const OVERDUE_TIME_OPTIONS = buildHalfHourTimeOptions();
const OVERDUE_INTERVAL_OPTIONS = Array.from({ length: 24 }, (_, index) => {
  const hour = index + 1;
  return {
    label: `${hour}h`,
    value: hour * 60,
  };
});
const OVERDUE_INTERVAL_HOURS = Array.from({ length: 24 }, (_, index) => index + 1);
const OVERDUE_INTERVAL_WHEEL_ITEM_HEIGHT = 44;

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
  avatar: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
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
  sectionHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  sectionHeaderActions: { marginRight: 12 },
  chevronContainer: { width: 28, alignItems: 'center', justifyContent: 'center' },
  headerIconButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  editForm: { gap: 12 },
  profileImageEditor: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileImagePreview: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  profileImagePreviewImage: { width: '100%', height: '100%' },
  profileImageActions: { flex: 1, gap: 8 },
  profileImageButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  profileImageButtonText: { fontSize: 14, fontWeight: '700' },
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16 },
  editButtons: { flexDirection: 'row', gap: 12 },
  button: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
  profileInfo: { gap: 12, marginTop: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  infoRowTop: { alignItems: 'flex-start' },
  infoText: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  selectionChip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  selectionChipText: { fontSize: 13, fontWeight: '700' },
  infoChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  infoChipText: { fontSize: 12, fontWeight: '700' },
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
  overdueSettingsSection: { marginTop: 8, gap: 10 },
  deniedBanner: { borderRadius: 12, padding: 12, gap: 8 },
  deniedBannerTitle: { fontSize: 14, fontWeight: '700' },
  deniedBannerText: { fontSize: 13, lineHeight: 18 },
  deniedBannerButton: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  deniedBannerButtonText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  pickerButton: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  pickerButtonText: { fontSize: 15, fontWeight: '600' },
  iosPickerContainer: { borderRadius: 12, marginBottom: 12, overflow: 'hidden', alignItems: 'center' },
  iosPicker: { height: 200, width: 320, alignSelf: 'center' },
  intervalWheelContainer: { borderRadius: 12, overflow: 'hidden' },
  intervalWheel: { height: OVERDUE_INTERVAL_WHEEL_ITEM_HEIGHT * 5 },
  intervalWheelContent: { paddingVertical: OVERDUE_INTERVAL_WHEEL_ITEM_HEIGHT * 2 },
  intervalWheelItem: { height: OVERDUE_INTERVAL_WHEEL_ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  intervalWheelItemText: { fontSize: 24, lineHeight: 28, fontWeight: '400', letterSpacing: -0.2 },
  intervalWheelItemTextSelected: { fontWeight: '400' },
  doneButton: { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  doneButtonText: { color: '#fff', fontWeight: '700' },
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
  subscriptionBlockerSignOutButton: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: Platform.OS === 'ios' ? 116 : 32,
    minHeight: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  subscriptionBlockerSignOutButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  authCard: { borderRadius: 24, padding: 24, marginHorizontal: 16, marginTop: 24 },
  loginNoticeBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  loginNoticeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
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
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'trainer' | 'player' | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showLoginNotice, setShowLoginNotice] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [, setPaywallProcessing] = useState(false);
  const [purchaseProcessing, setPurchaseProcessing] = useState(false);
  const [focusNonce, setFocusNonce] = useState(0);
  const lastUserIdRef = useRef<string | null>(null);
  const profileSchemaWarningShownRef = useRef(false);

  // New onboarding flow states

  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editPositions, setEditPositions] = useState<string[]>([]);
  const [editClubName, setEditClubName] = useState('');
  const [editPlayingLevel, setEditPlayingLevel] = useState('');
  const [originalName, setOriginalName] = useState('');
  const [originalPhone, setOriginalPhone] = useState('');
  const [originalAvatarUrl, setOriginalAvatarUrl] = useState('');
  const [originalPositions, setOriginalPositions] = useState<string[]>([]);
  const [originalClubName, setOriginalClubName] = useState('');
  const [originalPlayingLevel, setOriginalPlayingLevel] = useState('');
  const [isUploadingProfileImage, setIsUploadingProfileImage] = useState(false);

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
  const {
    refreshAll,
    refreshCategories,
    categories = [],
    activities,
    hasActivitiesLoaded,
    ensureActivitiesLoaded,
  } = useFootball();
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
  const [overdueReminderSettings, setOverdueReminderSettings] = useState<OverdueReminderSettings>(
    DEFAULT_OVERDUE_REMINDER_SETTINGS
  );
  const [showOverdueStartTimePicker, setShowOverdueStartTimePicker] = useState(false);
  const [showOverdueIntervalPicker, setShowOverdueIntervalPicker] = useState(false);
  const overdueIntervalListRef = useRef<ScrollView | null>(null);
  const overdueScheduledIdsRef = useRef<string[]>(DEFAULT_OVERDUE_REMINDER_SETTINGS.scheduledNotificationIds);
  const [overdueSettingsLoaded, setOverdueSettingsLoaded] = useState(false);
  const [overduePermissionDenied, setOverduePermissionDenied] = useState(false);
  const [showCategoryManagementModal, setShowCategoryManagementModal] = useState(false);
  const [isAcceptingTrainerRequest, setIsAcceptingTrainerRequest] = useState(false);
  const loginNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openSubscriptionScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggleProfileInfoSection = useCallback(() => {
    if (isEditingProfile && isProfileInfoExpanded) {
      Alert.alert('Afslut redigering', PROFILE_EDIT_COLLAPSE_MESSAGE);
      return;
    }
    setIsProfileInfoExpanded(prev => !prev);
  }, [isEditingProfile, isProfileInfoExpanded]);

  const clearOpenSubscriptionScrollTimeout = useCallback(() => {
    if (openSubscriptionScrollTimeoutRef.current) {
      clearTimeout(openSubscriptionScrollTimeoutRef.current);
      openSubscriptionScrollTimeoutRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearOpenSubscriptionScrollTimeout();
    },
    [clearOpenSubscriptionScrollTimeout]
  );

  useFocusEffect(
    useCallback(() => {
      const frame = requestAnimationFrame(() => {
        setFocusNonce(prev => prev + 1);
      });
      return () => cancelAnimationFrame(frame);
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      void ensureActivitiesLoaded().catch((error) => {
        console.error('[Profile] Failed to load activities on focus:', error);
      });
    }, [ensureActivitiesLoaded, user])
  );

  useEffect(() => {
    return () => {
      if (loginNoticeTimerRef.current) {
        clearTimeout(loginNoticeTimerRef.current);
      }
    };
  }, []);

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
      router.push('/(tabs)/player-crm' as any);
    }
  }, [routeOpenTeamPlayers, router]);

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

  useEffect(() => {
    let cancelled = false;

    const loadSettings = async () => {
      const persisted = await loadOverdueReminderSettings();
      if (cancelled) return;
      overdueScheduledIdsRef.current = persisted.scheduledNotificationIds;
      setOverdueReminderSettings(persisted);
      setOverdueSettingsLoaded(true);
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!overdueSettingsLoaded) return;
    void persistOverdueReminderSettings(overdueReminderSettings);
  }, [overdueReminderSettings, overdueSettingsLoaded]);

  useEffect(() => {
    overdueScheduledIdsRef.current = overdueReminderSettings.scheduledNotificationIds;
  }, [overdueReminderSettings.scheduledNotificationIds]);

  useEffect(() => {
    if (!overdueSettingsLoaded) return;
    if (!hasActivitiesLoaded && overdueReminderSettings.enabled) return;
    let cancelled = false;

    const run = async () => {
      const previousIds = overdueScheduledIdsRef.current;
      const settingsForSchedule: OverdueReminderSettings = {
        enabled: overdueReminderSettings.enabled,
        startTimeMinutes: overdueReminderSettings.startTimeMinutes,
        intervalMinutes: overdueReminderSettings.intervalMinutes,
        scheduledNotificationIds: previousIds,
      };

      if (!settingsForSchedule.enabled) {
        await cancelOverdueReminderNotifications(previousIds);
        if (cancelled) return;
        if (previousIds.length > 0) {
          overdueScheduledIdsRef.current = [];
          setOverdueReminderSettings(prev => ({ ...prev, scheduledNotificationIds: [] }));
        }
        return;
      }

      const currentPermission = await checkNotificationPermissions();
      const granted = currentPermission ? true : await requestNotificationPermissions();

      if (!granted) {
        await cancelOverdueReminderNotifications(previousIds);
        if (cancelled) return;
        setOverduePermissionDenied(true);
        overdueScheduledIdsRef.current = [];
        setOverdueReminderSettings(prev => ({
          ...prev,
          enabled: false,
          scheduledNotificationIds: [],
        }));
        return;
      }

      if (cancelled) return;
      setOverduePermissionDenied(false);

      const scheduledIds = await rescheduleOverdueReminderNotifications({
        previousNotificationIds: previousIds,
        settings: settingsForSchedule,
        activities: Array.isArray(activities) ? activities : [],
      });

      if (cancelled) return;

      const hasChanged =
        scheduledIds.length !== previousIds.length ||
        scheduledIds.some((id, index) => id !== previousIds[index]);

      if (hasChanged) {
        overdueScheduledIdsRef.current = scheduledIds;
        setOverdueReminderSettings(prev => ({
          ...prev,
          scheduledNotificationIds: scheduledIds,
        }));
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [
    overdueReminderSettings.enabled,
    overdueReminderSettings.startTimeMinutes,
    overdueReminderSettings.intervalMinutes,
    overdueSettingsLoaded,
    hasActivitiesLoaded,
    activities,
  ]);

  const handleNotificationsToggle = useCallback(
    async (nextValue: boolean) => {
      if (notificationsUpdating) return;
      setNotificationsUpdating(true);
      try {
        if (nextValue) {
          await requestNotificationPermissions();
        } else {
          Alert.alert(
            'Notifications',
            'To turn off notifications, use system settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Open settings',
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

  const handleOverdueReminderToggle = useCallback((nextValue: boolean) => {
    setOverduePermissionDenied(false);
    setOverdueReminderSettings(prev => ({
      ...prev,
      enabled: nextValue,
    }));
  }, []);

  const handleOverdueStartTimeChange = useCallback((startTimeMinutes: number) => {
    setOverdueReminderSettings(prev => ({
      ...prev,
      startTimeMinutes,
    }));
  }, []);

  const handleOverdueIntervalChange = useCallback((intervalMinutes: number) => {
    setOverdueReminderSettings(prev => ({
      ...prev,
      intervalMinutes,
    }));
  }, []);

  const selectedOverdueIntervalHours = Math.max(1, Math.min(24, Math.round(overdueReminderSettings.intervalMinutes / 60)));

  const getOverdueStartTimeAsDate = useCallback(() => {
    const date = new Date();
    const hours = Math.floor(overdueReminderSettings.startTimeMinutes / 60);
    const minutes = overdueReminderSettings.startTimeMinutes % 60;
    date.setHours(hours, minutes, 0, 0);
    return date;
  }, [overdueReminderSettings.startTimeMinutes]);

  const handleOverdueStartTimePickerChange = useCallback(
    (_event: any, selectedDate?: Date) => {
      if (Platform.OS !== 'ios') {
        setShowOverdueStartTimePicker(false);
      }
      if (!selectedDate) return;

      const nextMinutes = selectedDate.getHours() * 60 + selectedDate.getMinutes();
      handleOverdueStartTimeChange(nextMinutes);
    },
    [handleOverdueStartTimeChange]
  );

  useEffect(() => {
    if (!showOverdueIntervalPicker || Platform.OS !== 'ios') return;

    const targetIndex = selectedOverdueIntervalHours - 1;
    const hours = setTimeout(() => {
      overdueIntervalListRef.current?.scrollTo({
        y: targetIndex * OVERDUE_INTERVAL_WHEEL_ITEM_HEIGHT,
        animated: false,
      });
    }, 0);

    return () => clearTimeout(hours);
  }, [showOverdueIntervalPicker, selectedOverdueIntervalHours]);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Get subscription status
  const {
    subscriptionStatus,
    subscriptionMeta,
    refreshSubscription,
    createSubscription,
    loading: subscriptionLoading,
  } = useSubscription();
  const {
    entitlementSnapshot,
    refreshSubscriptionStatus,
    loading: iapLoading,
    iapReady,
    iapUnavailableReason,
    isRestoring,
  } = useAppleIAP();
  const { featureAccess, isLoading: subscriptionFeaturesLoading } = useSubscriptionFeatures();
  const subscriptionGate = getSubscriptionGateState({
    user,
    subscriptionStatus,
    entitlementSnapshot,
  });
  const subscriptionAccess = resolveSubscriptionAccessState({
    user,
    subscriptionStatus,
    subscriptionMeta,
    entitlementSnapshot,
  });
  const shouldShowChooseSubscription = subscriptionAccess.accessState === 'denied_authoritative';

  const subscriptionPlansLoading =
    Platform.OS === 'ios'
      ? (iapLoading || isRestoring || (!iapReady && !iapUnavailableReason))
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
      clearOpenSubscriptionScrollTimeout();
      openSubscriptionScrollTimeoutRef.current = setTimeout(() => {
        scrollToSubscription();
        openSubscriptionScrollTimeoutRef.current = null;
      }, 200);
    },
    [clearOpenSubscriptionScrollTimeout, scrollToSubscription]
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

  const handleRefreshCategories = useCallback(async () => {
    if (refreshCategories) {
      await refreshCategories();
      return;
    }

    await refreshAll();
  }, [refreshAll, refreshCategories]);

  const handleOpenCategoryManagement = useCallback(() => {
    setShowCategoryManagementModal(true);
    void handleRefreshCategories().catch((error) => {
      console.error('[Profile] Failed refreshing categories before opening manager:', error);
    });
  }, [handleRefreshCategories]);

  const resetProfileEditor = useCallback((nextProfile: UserProfile | null) => {
    const positions = normalizePlayerProfilePositions(nextProfile?.player_positions);
    setEditName(nextProfile?.full_name || '');
    setEditPhone(nextProfile?.phone_number || '');
    setEditAvatarUrl(nextProfile?.avatar_url || '');
    setEditPositions(positions);
    setEditClubName(nextProfile?.club_name || '');
    setEditPlayingLevel(nextProfile?.playing_level || '');
    setOriginalName(nextProfile?.full_name || '');
    setOriginalPhone(nextProfile?.phone_number || '');
    setOriginalAvatarUrl(nextProfile?.avatar_url || '');
    setOriginalPositions(positions);
    setOriginalClubName(nextProfile?.club_name || '');
    setOriginalPlayingLevel(nextProfile?.playing_level || '');
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
      Alert.alert('Error', error?.message || 'Failed to save profile picture');
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
        Alert.alert('Maks fem positioner', 'You can select up to five positions.');
        return current;
      }

      return [...current, position];
    });
  };

  const warnProfileSchemaFallback = useCallback(() => {
    if (!__DEV__ || profileSchemaWarningShownRef.current) return;
    profileSchemaWarningShownRef.current = true;
    console.warn('[PROFILE] New player profile fields are missing from the database. Temporarily running with legacy profile fields.');
  }, []);

  const fetchUserProfile = useCallback(async (userId: string) => {
    try {
      if (__DEV__) {
        console.log('[PROFILE] Fetching profile for user:', userId);
      }

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
        console.error('[PROFILE] Error fetching profile:', error);
        return;
      }

      if (data) {
        if (__DEV__) {
          console.log('[PROFILE] Profile data fetched:', data.full_name, data.phone_number);
        }
        const normalizedProfile = withProfilePlayerFieldDefaults(data);
        setProfile(normalizedProfile);
        resetProfileEditor(normalizedProfile);
      } else {
        if (__DEV__) {
          console.log('[PROFILE] No profile data found for user');
        }
        setProfile(null);
        resetProfileEditor(null);
      }
    } catch (error) {
      console.error('[PROFILE] Error in fetchUserProfile:', error);
    }
  }, [resetProfileEditor, warnProfileSchemaFallback]);

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
        full_name: adminProfile?.full_name || 'Your coach',
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
        const message = data?.error || error?.message || 'Could not accept the request';
        Alert.alert('Error', message);
        return;
      }

      Alert.alert('Success', 'The request has been accepted.');
      await fetchAdminInfo(user.id);
    } catch (acceptError: any) {
      Alert.alert('Error', acceptError?.message || 'Could not accept the request');
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
    [fetchUserProfile, refreshSubscription]
  );

  useEffect(() => {
    if (!user?.id) return;

    if (userRole === 'player') {
      void fetchAdminInfo(user.id);
      return;
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
        if (user?.id) {
          await checkUserOnboarding(user.id);
        }
        forceUserRoleRefresh('ios-purchase');
        const settled = await waitForPurchaseSettled();
        if (!settled) {
          Alert.alert(
            'Subscription is still updating',
            'Status may be delayed. If it doesn\'t update right away, open the profile again in a moment.'
          );
        }
      } finally {
        setPurchaseProcessing(false);
      }
    },
    [checkUserOnboarding, refreshSubscriptionStatus, user?.id, waitForPurchaseSettled]
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
        await checkUserOnboarding(session.user.id);
      } else {
        lastUserIdRef.current = null;
        setUserRole(null);
        setProfile(null);
        setAdminInfo(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [checkUserOnboarding]);

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

    const normalizedPositions = normalizePlayerProfilePositions(editPositions);
    const hasChanges =
      editName !== originalName ||
      editPhone !== originalPhone ||
      editAvatarUrl !== originalAvatarUrl ||
      editClubName !== originalClubName ||
      editPlayingLevel !== originalPlayingLevel ||
      !arePlayerProfilePositionsEqual(normalizedPositions, originalPositions);

    if (!hasChanges) {
      console.log('[PROFILE] No changes detected, skipping API call');
      setIsEditingProfile(false);
      return;
    }

    setLoading(true);

    try {
      let savedLegacyOnly = false;
      let { error } = await supabase
        .from('profiles')
        .upsert(
          {
            user_id: user.id,
            full_name: editName,
            phone_number: editPhone,
            avatar_url: editAvatarUrl || null,
            player_positions: normalizedPositions,
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
      Alert.alert(
        'Success',
        savedLegacyOnly
          ? 'Name and phone are updated. The new player profile fields require the database migration to be run.'
          : 'Your profile has been updated'
      );
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Udfyld venligst baade email og adgangskode');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'The password must be at least 6 characters long');
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
        Alert.alert('Could not create account', error.message || 'An error occurred. Please try again.');
        return;
      }

      const identities = Array.isArray((data.user as any)?.identities) ? (data.user as any).identities : null;
      const isExistingUserResponse = Boolean(data.user && identities && identities.length === 0);
      if (isExistingUserResponse) {
        Alert.alert(
          'Account already exists',
          'This email probably already has an account. Therefore, a new confirmation email is not always sent. Try logging in instead.'
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
        Alert.alert('Error', 'Could not create user. Please try again.');
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
      Alert.alert('Error', error.message || 'An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Udfyld venligst baade email og adgangskode');
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
            'Login failed',
            'Email or password is incorrect.\n\nRemember:\n- Have you confirmed your email?\n- Are you sure you have created an account?\n- Try to reset your password if you have forgotten it.'
          );
        } else {
          Alert.alert('Login failed', error.message || 'An error occurred. Please try again.');
        }
        return;
      }

      if (data.session) {
        setShowLoginNotice(true);
        if (loginNoticeTimerRef.current) {
          clearTimeout(loginNoticeTimerRef.current);
        }
        loginNoticeTimerRef.current = setTimeout(() => {
          setShowLoginNotice(false);
        }, 2500);
        setEmail('');
        setPassword('');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Error', error.message || 'An unexpected error occurred. Please try again.');
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
      Alert.alert('Error', 'Failed to open password reset.');
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
          'Your subscription is activated with a 14-day free trial period. You can now create players and teams!',
          [{ text: 'OK' }]
        );
        return;
      }

      if (result.alreadyHasSubscription) {
        Alert.alert(
          'Du har allerede et abonnement',
          result.error || 'Your current subscription is active.',
          [{ text: 'OK' }]
        );
        return;
      }

      Alert.alert('Error', result.error || 'Could not create subscription. Please try again.');
    } catch (error: any) {
      if (__DEV__) {
        console.log(`[PROFILE] Unexpected error: ${error.message}`);
      }
      Alert.alert('Error', error.message || 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
      setPurchaseProcessing(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      Alert.alert('Signed out', 'You are now signed out');
    } catch (error: any) {
      console.error('Sign out error:', error);
      Alert.alert('Error', error.message || 'An error occurred');
    }
  };

  const handleSubscriptionBlockerSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setUser(null);
      setUserRole(null);
      setProfile(null);
      setAdminInfo(null);
      setManualUpgradeTarget(null);
      setIsEditingProfile(false);
      router.replace({
        pathname: '/(tabs)/profile',
        params: { authMode: 'login' },
      } as any);
    } catch (error: any) {
      console.error('Subscription blocker sign out error:', error);
      Alert.alert('Sign out failed', error.message || 'Could not sign out. Restart the app and try again.');
    }
  };

  const handleDeleteAllExternalActivities = async () => {
    if (!canUseCalendarSync) {
      Alert.alert(
        'Premium required',
        'Calendar sync requires a Premium subscription. Upgrade to continue.'
      );
      return;
    }

    Alert.alert(
      'Delete all external activities',
      'Are you sure you want to delete ALL your external activities?\n\nThis will delete all activities imported from external calendars. The activities will be imported again at the next sync unless you remove the calendars from your profile.\n\nNote: This action cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingExternalActivities(true);
            try {
              const result = await deleteAllExternalActivities();

              if (!result.success) {
                throw new Error(result.error || 'Could not delete activities');
              }

              if (result.count === 0) {
                Alert.alert('No activities', 'You have no external activities to delete');
              } else {
                Alert.alert(
                  'Deleted',
                  `${result.count} external activit${result.count === 1 ? 'y' : 'ies'} have been deleted from your app`
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
              Alert.alert('Error', error.message || 'Could not delete external activities');
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
      setDeleteAccountError('No user is logged in.');
      return;
    }
    const normalizedInput = deleteConfirmationInput.trim().toUpperCase();
    if (normalizedInput !== DELETE_ACCOUNT_CONFIRMATION_PHRASE) {
      setDeleteAccountError(`Type ${DELETE_ACCOUNT_CONFIRMATION_PHRASE} to confirm deletion.`);
      return;
    }

    setIsDeletingAccount(true);
    setDeleteAccountError(null);

    try {
      const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
      if (error) {
        throw new Error(await getFunctionErrorMessage(error, 'Could not delete account.'));
      }
      if (!data?.success) {
        throw new Error(data?.error ?? 'Could not delete account.');
      }

      let signOutMessageSuffix = ' You are now logged out.';
      try {
        const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
        if (signOutError) {
          console.warn('[PROFILE] Sign-out after deletion failed, continuing anyway:', signOutError);
          signOutMessageSuffix = 'Your account has been deleted, but we couldn\'t log you out automatically. Restart the app to confirm.';
        }
      } catch (signOutUnexpected) {
        console.warn('[PROFILE] Unexpected sign-out failure after deletion, continuing anyway:', signOutUnexpected);
        signOutMessageSuffix = 'Your account has been deleted, but we couldn\'t log you out automatically. Restart the app to confirm.';
      }

      setUser(null);
      setUserRole(null);
      setProfile(null);
      setAdminInfo(null);
      setManualUpgradeTarget(null);
      setIsEditingProfile(false);
      closeDeleteAccountDialog();

      Alert.alert('Account deleted', `Your account and all your data have been deleted.${signOutMessageSuffix}`);
    } catch (error: any) {
      console.error('[PROFILE] Account deletion failed:', error);
      setDeleteAccountError(error?.message ?? 'An error occurred during deletion. Try again.');
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
  const isPlayerProfile = userRole === 'player';
  const displayAvatarUrl = isEditingProfile ? editAvatarUrl : profile?.avatar_url || '';
  const displayPlayerPositions = normalizePlayerProfilePositions(profile?.player_positions);
  const hasProfileInfo =
    Boolean(profile?.full_name) ||
    Boolean(profile?.phone_number) ||
    (isPlayerProfile &&
      (Boolean(profile?.club_name) || Boolean(profile?.playing_level) || displayPlayerPositions.length > 0));

  // Platform-specific wrapper component
  const CardWrapper = Platform.OS === 'ios' ? GlassView : View;
  const cardWrapperProps = Platform.OS === 'ios' ? { glassEffectStyle: 'regular' as const } : {};
  // Use a non-blurred wrapper for subscription card to avoid flicker while keeping a frame
  const SubscriptionCardWrapper = Platform.OS === 'ios' ? View : CardWrapper;
  const subscriptionCardProps = Platform.OS === 'ios' ? {} : cardWrapperProps;
  const AuthCardWrapper = Platform.OS === 'ios' ? View : CardWrapper;
  const authCardProps = Platform.OS === 'ios' ? {} : cardWrapperProps;
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
                <Text style={[styles.title, { color: textColor }]}>Choose your subscription</Text>
                <Text style={[styles.subtitle, { color: textSecondaryColor }]}>
                  As a coach, you must choose a subscription to manage players
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
        <TouchableOpacity
          style={[
            styles.subscriptionBlockerSignOutButton,
            { backgroundColor: cardBgColor, borderColor: isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)' },
          ]}
          onPress={handleSubscriptionBlockerSignOut}
          activeOpacity={0.78}
          testID="subscriptionBlocker.signOutButton"
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={[styles.subscriptionBlockerSignOutButtonText, { color: colors.primary }]}>Sign out</Text>
        </TouchableOpacity>
        {purchaseProcessingModal}
      </ContainerWrapper>
    );
  }

  // Logged-in main view now rendered via ScrollView (see return)
  const renderProfileContent = () => (
    <View>
      {showLoginNotice && (
        <View style={[styles.loginNoticeBanner, { backgroundColor: colors.primary }]} testID="auth.login.successNotice">
          <Text style={styles.loginNoticeText}>Du er nu logget ind!</Text>
        </View>
      )}
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
                {displayAvatarUrl ? (
                  <Image
                    source={{ uri: displayAvatarUrl }}
                    style={styles.avatarImage}
                    resizeMode="cover"
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <IconSymbol ios_icon_name="person.circle.fill" android_material_icon_name="person" size={Platform.OS === 'ios' ? 80 : 48} color="#fff" />
                )}
              </View>
              {subscriptionStatus?.hasSubscription && (
                <View style={[styles.subscriptionBadge, { backgroundColor: getPlanColor(subscriptionStatus.planName) }]}>
                  <IconSymbol ios_icon_name="star.fill" android_material_icon_name="star" size={16} color="#fff" />
                </View>
              )}
            </View>
            <Text style={[styles.name, { color: textColor }]}>{profile?.full_name || user.email?.split('@')[0] || 'User'}</Text>
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
                    <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.primary} />
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
	                        style={[
	                          styles.profileImageButton,
	                          { backgroundColor: Platform.OS === 'ios' ? (isDark ? '#3a3a3c' : '#e5e5e5') : colors.highlight },
	                        ]}
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
	                        style={[
	                          styles.input,
	                          {
	                            backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : bgColor,
	                            color: textColor,
	                          },
	                        ]}
	                        value={editClubName}
	                        onChangeText={setEditClubName}
	                        placeholder="Klubnavn"
	                        placeholderTextColor={textSecondaryColor}
	                      />

	                      <Text style={[styles.label, { color: textColor }]}>Niveau</Text>
	                      <TextInput
	                        style={[
	                          styles.input,
	                          {
	                            backgroundColor: Platform.OS === 'ios' ? (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)') : bgColor,
	                            color: textColor,
	                          },
	                        ]}
	                        value={editPlayingLevel}
	                        onChangeText={setEditPlayingLevel}
	                        placeholder="League 1, League 2, Champions League..."
	                        placeholderTextColor={textSecondaryColor}
	                      />
	                    </>
	                  )}

	                  <View style={styles.editButtons}>
                    <TouchableOpacity
                      style={[
                        styles.button,
                        { backgroundColor: Platform.OS === 'ios' ? (isDark ? '#3a3a3c' : '#e5e5e5') : colors.highlight },
                      ]}
	                      onPress={() => {
	                        setIsEditingProfile(false);
	                        resetProfileEditor(profile);
	                      }}
	                    >
                      <Text style={[styles.buttonText, { color: textColor }]}>Cancel</Text>
                    </TouchableOpacity>
	                    <TouchableOpacity style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleSaveProfile} disabled={loading || isUploadingProfileImage}>
                      {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.buttonText, { color: '#fff' }]}>Save</Text>}
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
	                  {isPlayerProfile && displayPlayerPositions.length > 0 && (
	                    <View style={[styles.infoRow, styles.infoRowTop]}>
	                      <IconSymbol ios_icon_name="figure.soccer" android_material_icon_name="sports_soccer" size={20} color={colors.primary} />
	                      <View style={styles.chipGroup}>
	                        {displayPlayerPositions.map((position) => (
	                          <View key={position} style={[styles.infoChip, { backgroundColor: nestedCardBgColor }]}>
	                            <Text style={[styles.infoChipText, { color: textColor }]}>{position}</Text>
	                          </View>
	                        ))}
	                      </View>
	                    </View>
	                  )}
	                  {isPlayerProfile && profile?.club_name && (
	                    <View style={styles.infoRow}>
	                      <IconSymbol ios_icon_name="building.2.fill" android_material_icon_name="groups" size={20} color={colors.primary} />
	                      <Text style={[styles.infoText, { color: textColor }]}>{profile.club_name}</Text>
	                    </View>
	                  )}
	                  {isPlayerProfile && profile?.playing_level && (
	                    <View style={styles.infoRow}>
	                      <IconSymbol ios_icon_name="chart.bar.fill" android_material_icon_name="leaderboard" size={20} color={colors.primary} />
	                      <Text style={[styles.infoText, { color: textColor }]}>{profile.playing_level}</Text>
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
          </CardWrapper>

          {/* Admin Info for Players */}
          {userRole === 'player' &&
            (subscriptionFeaturesLoading ? (
              <CardWrapper
                style={[styles.section, sectionCardStyle]}
                {...cardWrapperProps}
              >
                <CollapsibleSection
                  title="Your Coach"
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
                  title="Your Coach"
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
                        {adminInfo.link_status === 'pending' ? 'Awaiting acceptance' : 'Accepted'}
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
                          <Text style={styles.acceptButtonText}>Accept request</Text>
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
                  title="Your Coach"
                  expanded={isAdminInfoExpanded}
                  onToggle={() => setIsAdminInfoExpanded(prev => !prev)}
                  titleColor={textColor}
                  chevronColor={textSecondaryColor}
                  icon={<IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={24} color={colors.primary} />}
                >
                  <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
                    You have no active trainer requests yet.
                  </Text>
                </CollapsibleSection>
              </CardWrapper>
            ) : (
              <CardWrapper
                style={[styles.section, sectionCardStyle]}
                {...cardWrapperProps}
              >
                <CollapsibleSection
                  title="Your Coach"
                  expanded={isAdminInfoExpanded}
                  onToggle={() => setIsAdminInfoExpanded(prev => !prev)}
                  titleColor={textColor}
                  chevronColor={textSecondaryColor}
                  icon={<IconSymbol ios_icon_name="person.2.fill" android_material_icon_name="groups" size={24} color={colors.primary} />}
                >
                  <PremiumFeatureGate
                    title="Connect your trainer with Premium"
                    description="Upgrade to give your trainer access to your activities and tasks."
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
                title="Teams & players"
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
                <TouchableOpacity
                  style={[styles.addPlayerButton, { backgroundColor: colors.primary }]}
                  onPress={() => router.push('/(tabs)/player-crm' as any)}
                  activeOpacity={0.7}
                  testID="profile.openPlayerCrmButton"
                >
                  <IconSymbol
                    ios_icon_name="person.2.fill"
                    android_material_icon_name="groups"
                    size={20}
                    color="#fff"
                  />
                  <Text style={styles.addPlayerButtonText}>Open Spiller CRM</Text>
                </TouchableOpacity>
              </CollapsibleSection>
            </CardWrapper>
          )}

          {/* Calendar Sync Section - Collapsible - Available for all users */}
          <CardWrapper
            style={[styles.section, sectionCardStyle]}
            {...cardWrapperProps}
          >
            <CollapsibleSection
              title="Calendar Sync"
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
                    Associate external calendars (iCal/webcal) to automatically import activities
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
                          Delete all external activities
                        </Text>
                      </React.Fragment>
                    )}
                  </TouchableOpacity>
                </>
              ) : (
                <PremiumFeatureGate
                  title="Calendar sync is a Premium benefit"
                  description="Automatically import your activities from external calendars by upgrading."
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
                title="Subscription"
                expanded={isSubscriptionExpanded}
                onToggle={() => setIsSubscriptionExpanded(prev => !prev)}
                titleColor={textColor}
                chevronColor={textSecondaryColor}
                icon={<IconSymbol ios_icon_name="creditcard.fill" android_material_icon_name="payment" size={28} color={colors.primary} />}
              >
                <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>Manage your subscription</Text>
                {subscriptionPlansLoading ? (
                  <View style={[styles.loadingContainer, { paddingVertical: 24 }]}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={[styles.loadingText, { color: textSecondaryColor }]}>
                      Fetching subscriptions...
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
                  <SubscriptionManager transparentBackground={false} />
                )}
              </CollapsibleSection>
            </SubscriptionCardWrapper>
          </View>

          <CardWrapper
            style={[styles.section, styles.settingsCard, sectionCardStyle]}
            {...cardWrapperProps}
          >
            <CollapsibleSection
              title="Settings"
              expanded={isSettingsExpanded}
              onToggle={() => setIsSettingsExpanded(prev => !prev)}
              titleColor={textColor}
              chevronColor={textSecondaryColor}
              testID="profile.settingsSection.toggle"
              icon={<IconSymbol ios_icon_name="gearshape.fill" android_material_icon_name="settings" size={24} color={colors.primary} />}
            >
              <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>Manage your account and security.</Text>
              <View style={styles.settingsGroup}>
                <Text style={[styles.settingsGroupTitle, { color: textSecondaryColor }]}>Account</Text>
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
                    <Text style={[styles.settingsRowTitle, { color: textColor }]}>Notifications</Text>
                    <Text style={[styles.settingsRowSubtitle, { color: textSecondaryColor }]}>
                      {notificationsEnabled ? 'Enabled' : 'Disabled'}
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
                <TouchableOpacity
                  style={[styles.settingsRow, { backgroundColor: nestedCardBgColor }]}
                  onPress={handleOpenCategoryManagement}
                  activeOpacity={0.7}
                  testID="profile.categories.manageButton"
                >
                  <IconSymbol
                    ios_icon_name="tag.fill"
                    android_material_icon_name="category"
                    size={22}
                    color={colors.primary}
                  />
                  <View style={styles.settingsRowContent}>
                    <Text style={[styles.settingsRowTitle, { color: textColor }]}>Activity categories</Text>
                    <Text style={[styles.settingsRowSubtitle, { color: textSecondaryColor }]}>
                      {categories.length > 0
                        ? `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'} on your profile`
                        : 'Create and manage categories'}
                    </Text>
                  </View>
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="chevron_right"
                    size={18}
                    color={textSecondaryColor}
                  />
                </TouchableOpacity>
                <View
                  style={[styles.settingsRow, { backgroundColor: nestedCardBgColor, alignItems: 'flex-start' }]}
                  testID="profile.overdueReminders.section"
                >
                  <IconSymbol
                    ios_icon_name="clock.badge.exclamationmark.fill"
                    android_material_icon_name="schedule"
                    size={22}
                    color={colors.primary}
                  />
                  <View style={styles.settingsRowContent}>
                    <Text style={[styles.settingsRowTitle, { color: textColor }]}>Reminders about overdue tasks</Text>
                    <Text style={[styles.settingsRowSubtitle, { color: textSecondaryColor }]}>
                      Receive reminders about overdue tasks after the selected start time and interval.
                    </Text>
                    <View style={styles.overdueSettingsSection}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <Text style={[styles.settingsRowSubtitle, { color: textSecondaryColor, flex: 1 }]}>
                          Enable reminders
                        </Text>
                        <Switch
                          testID="profile.overdueReminders.toggle"
                          value={overdueReminderSettings.enabled}
                          onValueChange={handleOverdueReminderToggle}
                          trackColor={{ false: '#c7c7cc', true: colors.primary }}
                        />
                      </View>
                      {overdueReminderSettings.enabled && (
                        <View style={{ gap: 10 }}>
                          <View testID="profile.overdueReminders.timeRow">
                            {Platform.OS === 'ios' ? (
                              <View style={{ gap: 8 }}>
                                <TouchableOpacity
                                  style={[styles.pickerButton, { backgroundColor: nestedCardBgColor }]}
                                  onPress={() => setShowOverdueStartTimePicker(true)}
                                  activeOpacity={0.7}
                                  testID="profile.overdueReminders.timeButton"
                                >
                                  <Text style={[styles.settingsRowSubtitle, { color: textSecondaryColor, marginBottom: 2 }]}>
                                    Start time
                                  </Text>
                                  <Text style={[styles.pickerButtonText, { color: textColor }]}>
                                    {formatTimeFromMinutes(overdueReminderSettings.startTimeMinutes)}
                                  </Text>
                                </TouchableOpacity>

                                {showOverdueStartTimePicker ? (
                                  <View
                                    style={[
                                      styles.iosPickerContainer,
                                      { backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF' },
                                    ]}
                                  >
                                    <DateTimePicker
                                      value={getOverdueStartTimeAsDate()}
                                      mode="time"
                                      display="spinner"
                                      onChange={handleOverdueStartTimePickerChange}
                                      is24Hour={true}
                                      themeVariant={isDark ? 'dark' : 'light'}
                                      textColor={isDark ? '#FFFFFF' : '#000000'}
                                      style={styles.iosPicker}
                                    />
                                  </View>
                                ) : null}

                                {showOverdueStartTimePicker ? (
                                  <TouchableOpacity
                                    style={[styles.doneButton, { backgroundColor: colors.primary }]}
                                    onPress={() => setShowOverdueStartTimePicker(false)}
                                    activeOpacity={0.7}
                                    testID="profile.overdueReminders.timeDone"
                                  >
                                    <Text style={styles.doneButtonText}>Done</Text>
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            ) : (
                              <DropdownSelect
                                testIDPrefix="profile.overdueReminders.time"
                                options={OVERDUE_TIME_OPTIONS}
                                selectedValue={overdueReminderSettings.startTimeMinutes}
                                onSelect={(value) => {
                                  handleOverdueStartTimeChange(Number(value));
                                }}
                                label="Start time"
                              />
                            )}
                          </View>
                          <View testID="profile.overdueReminders.intervalRow">
                            {Platform.OS === 'ios' ? (
                              <View style={{ gap: 8 }}>
                                <TouchableOpacity
                                  style={[styles.pickerButton, { backgroundColor: nestedCardBgColor }]}
                                  onPress={() => setShowOverdueIntervalPicker(true)}
                                  activeOpacity={0.7}
                                  testID="profile.overdueReminders.intervalButton"
                                >
                                  <Text style={[styles.settingsRowSubtitle, { color: textSecondaryColor, marginBottom: 2 }]}>
                                    Interval
                                  </Text>
                                  <Text style={[styles.pickerButtonText, { color: textColor }]}>
                                    {selectedOverdueIntervalHours}h
                                  </Text>
                                </TouchableOpacity>

                                {showOverdueIntervalPicker ? (
                                  <View
                                    style={[
                                      styles.intervalWheelContainer,
                                      { backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF' },
                                    ]}
                                  >
                                    <ScrollView
                                      ref={overdueIntervalListRef}
                                      style={styles.intervalWheel}
                                      contentContainerStyle={styles.intervalWheelContent}
                                      showsVerticalScrollIndicator={false}
                                      snapToInterval={OVERDUE_INTERVAL_WHEEL_ITEM_HEIGHT}
                                      decelerationRate="fast"
                                      onMomentumScrollEnd={(event) => {
                                        const offsetY = event.nativeEvent.contentOffset.y;
                                        const index = Math.round(offsetY / OVERDUE_INTERVAL_WHEEL_ITEM_HEIGHT);
                                        const clampedIndex = Math.max(0, Math.min(OVERDUE_INTERVAL_HOURS.length - 1, index));
                                        const intervalHours = OVERDUE_INTERVAL_HOURS[clampedIndex];
                                        handleOverdueIntervalChange(intervalHours * 60);
                                      }}
                                    >
                                      {OVERDUE_INTERVAL_HOURS.map((item) => {
                                        const isSelected = item === selectedOverdueIntervalHours;
                                        return (
                                          <View key={`interval-hour-${item}`} style={styles.intervalWheelItem}>
                                            <Text
                                              allowFontScaling={false}
                                              style={[
                                                styles.intervalWheelItemText,
                                                { color: isSelected ? textColor : textSecondaryColor },
                                                isSelected ? styles.intervalWheelItemTextSelected : null,
                                              ]}
                                            >
                                              {item}
                                            </Text>
                                          </View>
                                        );
                                      })}
                                    </ScrollView>
                                  </View>
                                ) : null}

                                {showOverdueIntervalPicker ? (
                                  <TouchableOpacity
                                    style={[styles.doneButton, { backgroundColor: colors.primary }]}
                                    onPress={() => setShowOverdueIntervalPicker(false)}
                                    activeOpacity={0.7}
                                    testID="profile.overdueReminders.intervalDone"
                                  >
                                    <Text style={styles.doneButtonText}>Done</Text>
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            ) : (
                              <DropdownSelect
                                testIDPrefix="profile.overdueReminders.interval"
                                options={OVERDUE_INTERVAL_OPTIONS}
                                selectedValue={overdueReminderSettings.intervalMinutes}
                                onSelect={(value) => {
                                  handleOverdueIntervalChange(Number(value));
                                }}
                                label="Interval"
                              />
                            )}
                          </View>
                        </View>
                      )}
                      {overduePermissionDenied && (
                        <View
                          style={[styles.deniedBanner, { backgroundColor: isDark ? '#3b2626' : '#fdecec' }]}
                          testID="profile.overdueReminders.deniedBanner"
                        >
                          <Text style={[styles.deniedBannerTitle, { color: isDark ? '#ffb3b3' : '#a12020' }]}>
                            Notification permission missing
                          </Text>
                          <Text style={[styles.deniedBannerText, { color: textSecondaryColor }]}>
                            To use reminders for overdue tasks, enable notifications in system settings.
                          </Text>
                          <TouchableOpacity
                            style={[styles.deniedBannerButton, { backgroundColor: colors.primary }]}
                            onPress={() => {
                              void openNotificationSettings();
                            }}
                            testID="profile.overdueReminders.openSettingsCta"
                          >
                            <Text style={styles.deniedBannerButtonText}>Open settings</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
                {/* Review note (App Store): Settings -> Account -> Delete account */}
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
                    <Text style={[styles.settingsRowTitle, { color: destructiveColor }]}>Delete account</Text>
                    <Text style={[styles.settingsRowSubtitle, { color: textSecondaryColor }]}>
                      Deletes your account and all data permanently
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
            <Text style={styles.signOutButtonText}>Sign out</Text>
          </TouchableOpacity>
        </>
      ) : (
        // Login/Sign up view
        <AuthCardWrapper style={[styles.authCard, { backgroundColor: cardBgColor }]} {...authCardProps}>
          {showSuccessMessage && (
            <View style={[styles.successMessage, { backgroundColor: colors.primary }]}>
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={Platform.OS === 'ios' ? 64 : 48} color="#fff" />
              <Text style={styles.successTitle}>Account created!</Text>
              <Text style={styles.successText}>
                Your account has been created successfully.{'\n'}
                Check your email to verify your account, then log in.
              </Text>
            </View>
          )}

          {!showSuccessMessage && (
            <>
              {Platform.OS === 'ios' && <Text style={[styles.title, { color: textColor }]}>{isSignUp ? 'Create account' : 'Log ind'}</Text>}

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
                    Create account
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
                  autoComplete="email"
                  textContentType="username"
                  editable={!loading}
                  autoCorrect={false}
                  contextMenuHidden={false}
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
                  autoComplete="password"
                  textContentType="password"
                  contextMenuHidden={false}
                  testID="auth.login.passwordInput"
                  accessibilityLabel="Adgangskode"
                />

                <TouchableOpacity
                  style={[styles.authButton, { backgroundColor: colors.primary }, loading && { opacity: 0.6 }]}
                  onPress={isSignUp ? handleSignup : handleLogin}
                  disabled={loading}
                  activeOpacity={0.7}
                  testID="auth.login.submitButton"
                  accessibilityLabel={isSignUp ? 'Create account' : 'Log ind'}
                >
                  {loading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color="#fff" size="small" />
                      <Text style={[styles.authButtonText, { marginLeft: 12 }]}>{isSignUp ? 'Creating account...' : 'Logging in...'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.authButtonText}>{isSignUp ? 'Create account' : 'Log ind'}</Text>
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
                      ? 'Confirm your email and log in.\nThen choose subscription as player or coach.'
                      : 'Log ind for at bruge appen.'}
                  </Text>
                </View>
              </View>
            </>
          )}
        </AuthCardWrapper>
      )}
    </View>
  );

  return (
    <ContainerWrapper style={[styles.safeArea, { backgroundColor: bgColor }]} edges={containerEdges}>
      <ScrollView
        ref={scrollViewRef}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.contentContainer, Platform.OS !== 'ios' && { paddingTop: 60 }]}
        showsVerticalScrollIndicator={false}
      >
        {renderProfileContent()}
        <View style={{ height: 120 }} />
      </ScrollView>
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
            <Text style={[styles.deleteModalTitle, { color: textColor }]}>Do you want to delete your account?</Text>
            <Text style={[styles.deleteModalDescription, { color: textSecondaryColor }]}>
              This action cannot be undone. Write {DELETE_ACCOUNT_CONFIRMATION_PHRASE} to confirm that you want to delete all your data permanently.
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
                <Text style={[styles.buttonText, { color: textColor }]}>Cancel</Text>
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
                  <Text style={[styles.buttonText, { color: '#fff' }]}>Delete</Text>
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
                accessibilityLabel="Close the paywall"
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
              Access this feature by upgrading your subscription.
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
                <SubscriptionManager forceShowPlans={!subscriptionGate.hasActiveSubscription} />
              )}
            </View>
          </View>
        </PaywallWrapper>
      </Modal>

      {purchaseProcessingModal}
      <CategoryManagementModal
        visible={showCategoryManagementModal}
        onClose={() => setShowCategoryManagementModal(false)}
        categories={categories}
        onRefresh={handleRefreshCategories}
      />
    </ContainerWrapper>
  );
}
