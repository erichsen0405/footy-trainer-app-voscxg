import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Image,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { IconSymbol } from '@/components/IconSymbol';
import CreatePlayerModal from '@/components/CreatePlayerModal';
import TeamManagement from '@/components/TeamManagement';
import { useAdmin } from '@/contexts/AdminContext';
import { useUserRole } from '@/hooks/useUserRole';
import { getColors } from '@/styles/commonStyles';
import {
  OwnerCrmStatus,
  OwnerPlayerCrmContext,
  OwnerPlayerCrmDetail,
  OwnerPlayerCrmGuardianContact,
  OwnerPlayerCrmList,
  OwnerPlayerCrmPlayer,
  OwnerPlayerCrmTag,
  fetchOwnerPlayerCrmContext,
  fetchOwnerPlayerCrmDetail,
  fetchOwnerPlayerCrmList,
  updateOwnerPlayerCrmProfile,
  createOwnerPlayerCrmNote,
  deleteOwnerPlayerCrmNote,
  upsertOwnerPlayerCrmTag,
  deleteOwnerPlayerCrmTag,
  setOwnerPlayerCrmTags,
  saveOwnerPlayerGuardianContact,
  deleteOwnerPlayerGuardianContact,
  inviteOwnerPlayerGuardianContact,
  resendOwnerPlayerGuardianInvite,
  cancelOwnerPlayerGuardianInvite,
  revokeOwnerPlayerGuardianAccess,
} from '@/services/ownerPlayerCrmService';
import {
  OwnerBrandingInput,
  OwnerBrandingProfile,
  fetchOwnerBranding,
  saveOwnerBranding,
} from '@/services/ownerBrandingService';
import { OwnerBrandAssetKind, pickAndUploadOwnerBrandAsset } from '@/utils/ownerBrandAssetUpload';

type CrmTab = 'players' | 'teams' | 'tags' | 'brand';

function getRouteParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type ProfileDraft = {
  crmStatus: OwnerCrmStatus;
  positionsText: string;
  playingLevel: string;
  clubName: string;
  dateOfBirth: string;
  phoneNumber: string;
  email: string;
  emailVisibleToStaff: boolean;
  phoneVisibleToStaff: boolean;
};

type GuardianDraft = {
  fullName: string;
  email: string;
  phoneNumber: string;
  relation: 'parent' | 'guardian' | 'other';
  status: 'active' | 'pending' | 'inactive';
  notes: string;
};

type BrandDraft = {
  displayName: string;
  slug: string;
  bio: string;
  contactEmail: string;
  contactPhone: string;
  websiteUrl: string;
  socialLinksText: string;
  primaryColor: string;
  accentColor: string;
  logoPath: string | null;
  logoUrl: string;
  coverPath: string | null;
  coverUrl: string;
  isPublic: boolean;
};

const STATUS_OPTIONS: { value: OwnerCrmStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Active', color: '#16a34a' },
  { value: 'trial', label: 'Trial', color: '#2563eb' },
  { value: 'paused', label: 'Paused', color: '#f59e0b' },
  { value: 'former', label: 'Former', color: '#64748b' },
];

const TAG_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2'];
const DEFAULT_BRAND_COLORS = { primary: '#2563eb', accent: '#16a34a' };

function createProfileDraft(player: OwnerPlayerCrmPlayer | null): ProfileDraft {
  return {
    crmStatus: player?.crmStatus ?? 'active',
    positionsText: player?.positions?.join(', ') ?? '',
    playingLevel: player?.playingLevel ?? '',
    clubName: player?.clubName ?? '',
    dateOfBirth: player?.dateOfBirth ?? '',
    phoneNumber: player?.phoneNumber ?? '',
    email: player?.email ?? '',
    emailVisibleToStaff: player?.emailVisibleToStaff ?? true,
    phoneVisibleToStaff: player?.phoneVisibleToStaff ?? true,
  };
}

const emptyGuardianDraft: GuardianDraft = {
  fullName: '',
  email: '',
  phoneNumber: '',
  relation: 'parent',
  status: 'active',
  notes: '',
};

function createBrandDraft(profile: OwnerBrandingProfile | null, fallbackName = ''): BrandDraft {
  const socialLinks = profile?.socialLinks ?? {};
  const socialLinksText = Object.entries(socialLinks)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  return {
    displayName: profile?.displayName ?? fallbackName,
    slug: profile?.slug ?? '',
    bio: profile?.bio ?? '',
    contactEmail: profile?.contactEmail ?? '',
    contactPhone: profile?.contactPhone ?? '',
    websiteUrl: profile?.websiteUrl ?? '',
    socialLinksText,
    primaryColor: profile?.brandColors.primary ?? DEFAULT_BRAND_COLORS.primary,
    accentColor: profile?.brandColors.accent ?? DEFAULT_BRAND_COLORS.accent,
    logoPath: profile?.logoPath ?? null,
    logoUrl: profile?.logoUrl ?? '',
    coverPath: profile?.coverPath ?? null,
    coverUrl: profile?.coverUrl ?? '',
    isPublic: profile?.isPublic ?? false,
  };
}

function normalizeSlugDraft(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/g, '');
}

function parseSocialLinksDraft(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const equalsIndex = line.indexOf('=');
        if (equalsIndex > 0) {
          const key = line.slice(0, equalsIndex).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
          const url = line.slice(equalsIndex + 1).trim();
          return key && url ? [key, url] : null;
        }
        return [`link_${index + 1}`, line];
      })
      .filter((entry): entry is [string, string] => Boolean(entry))
  );
}

function compactDateLabel(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getStatusMeta(status: OwnerCrmStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status) ?? STATUS_OPTIONS[0];
}

function getGuardianInviteLabel(contact: OwnerPlayerCrmGuardianContact): string {
  if (contact.accessStatus === 'active') return 'Access active';
  if (contact.inviteStatus === 'pending') return 'Invite pending';
  if (contact.inviteStatus === 'accepted') return 'Accepted';
  if (contact.inviteStatus === 'cancelled') return 'Cancelled';
  if (contact.inviteStatus === 'expired') return 'Expired';
  if (contact.inviteStatus === 'revoked') return 'Revoked';
  return 'No access';
}

function getGuardianInviteColor(contact: OwnerPlayerCrmGuardianContact, colors: ReturnType<typeof getColors>): string {
  if (contact.accessStatus === 'active' || contact.inviteStatus === 'accepted') return '#16a34a';
  if (contact.inviteStatus === 'pending') return '#f59e0b';
  if (contact.inviteStatus === 'revoked' || contact.inviteStatus === 'cancelled') return colors.error;
  return colors.textSecondary;
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function PlayerCrmScreen() {
  const colorScheme = useColorScheme();
  const colors = getColors(colorScheme);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{
    ownerAccountId?: string | string[];
    playerId?: string | string[];
    openAt?: string | string[];
  }>();
  const { startAdminPlayer } = useAdmin();
  const { userRole, loading: roleLoading } = useUserRole();
  const canManagePlayers = userRole === 'admin' || userRole === 'trainer';
  const routeOwnerAccountId = getRouteParam(params.ownerAccountId);
  const routePlayerId = getRouteParam(params.playerId);
  const routeOpenAt = getRouteParam(params.openAt);
  const lastRouteOpenKeyRef = useRef<string | null>(null);

  const [context, setContext] = useState<OwnerPlayerCrmContext | null>(null);
  const [activeOwnerAccountId, setActiveOwnerAccountId] = useState<string | null>(null);
  const [list, setList] = useState<OwnerPlayerCrmList | null>(null);
  const [activeTab, setActiveTab] = useState<CrmTab>('players');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<OwnerCrmStatus | 'all'>('all');
  const [tagFilterId, setTagFilterId] = useState<string | 'all'>('all');
  const [teamFilterId, setTeamFilterId] = useState<string | 'all'>('all');
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detail, setDetail] = useState<OwnerPlayerCrmDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>(() => createProfileDraft(null));
  const [noteDraft, setNoteDraft] = useState('');
  const [guardianDraft, setGuardianDraft] = useState<GuardianDraft>(emptyGuardianDraft);
  const [tagNameDraft, setTagNameDraft] = useState('');
  const [tagColorDraft, setTagColorDraft] = useState(TAG_COLORS[0]);
  const [tagSaving, setTagSaving] = useState(false);
  const [brandProfile, setBrandProfile] = useState<OwnerBrandingProfile | null>(null);
  const [brandDraft, setBrandDraft] = useState<BrandDraft>(() => createBrandDraft(null));
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandUploadingKind, setBrandUploadingKind] = useState<OwnerBrandAssetKind | null>(null);

  const loadContext = useCallback(async () => {
    if (!canManagePlayers) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const payload = await fetchOwnerPlayerCrmContext();
      setContext(payload);
      setActiveOwnerAccountId((current) => {
        if (routeOwnerAccountId && payload.workspaces.some((workspace) => workspace.ownerAccountId === routeOwnerAccountId)) {
          return routeOwnerAccountId;
        }

        if (current && payload.workspaces.some((workspace) => workspace.ownerAccountId === current)) {
          return current;
        }

        return payload.defaultOwnerAccountId;
      });
    } catch (error: any) {
      Alert.alert('CRM', error.message || 'Could not load CRM context.');
    } finally {
      setLoading(false);
    }
  }, [canManagePlayers, routeOwnerAccountId]);

  const loadList = useCallback(async (ownerAccountId: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const payload = await fetchOwnerPlayerCrmList(ownerAccountId);
      setList(payload);
      return payload;
    } catch (error: any) {
      Alert.alert('CRM', error.message || 'Could not load players.');
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadBrand = useCallback(async (ownerAccountId: string, silent = false) => {
    if (!silent) setBrandLoading(true);
    try {
      const payload = await fetchOwnerBranding(ownerAccountId);
      setBrandProfile(payload);
      setBrandDraft(createBrandDraft(payload, payload.ownerName));
      return payload;
    } catch (error: any) {
      Alert.alert('Brand', error.message || 'Could not load brand profile.');
      return null;
    } finally {
      if (!silent) setBrandLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!activeOwnerAccountId) {
      setList(null);
      setBrandProfile(null);
      setBrandDraft(createBrandDraft(null));
      return;
    }

    void loadList(activeOwnerAccountId);
    void loadBrand(activeOwnerAccountId);
  }, [activeOwnerAccountId, loadBrand, loadList]);

  useEffect(() => {
    if (!routeOwnerAccountId || !context?.workspaces.some((workspace) => workspace.ownerAccountId === routeOwnerAccountId)) {
      return;
    }

    setActiveOwnerAccountId(routeOwnerAccountId);
  }, [context?.workspaces, routeOwnerAccountId]);

  useEffect(() => {
    setProfileDraft(createProfileDraft(detail?.player ?? null));
  }, [detail?.player]);

  const activeWorkspace = useMemo(
    () => context?.workspaces.find((workspace) => workspace.ownerAccountId === activeOwnerAccountId) ?? null,
    [activeOwnerAccountId, context?.workspaces],
  );

  const filteredPlayers = useMemo(() => {
    const players = list?.players ?? [];
    const query = searchText.trim().toLowerCase();

    return players.filter((player) => {
      if (query) {
        const searchable = [
          player.displayName,
          player.email,
          player.phoneNumber,
          player.clubName,
          player.playingLevel,
          player.positions.join(' '),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!searchable.includes(query)) return false;
      }

      if (statusFilter !== 'all' && player.crmStatus !== statusFilter) return false;
      if (tagFilterId !== 'all' && !player.tags.some((tag) => tag.id === tagFilterId)) return false;
      if (teamFilterId !== 'all' && !player.teams.some((team) => team.id === teamFilterId)) return false;

      return true;
    });
  }, [list?.players, searchText, statusFilter, tagFilterId, teamFilterId]);

  const playerStats = useMemo(() => {
    const players = list?.players ?? [];
    return {
      total: players.length,
      active: players.filter((player) => player.crmStatus === 'active').length,
      trial: players.filter((player) => player.crmStatus === 'trial').length,
      paused: players.filter((player) => player.crmStatus === 'paused').length,
    };
  }, [list?.players]);

  const handleRefresh = useCallback(async () => {
    if (!activeOwnerAccountId) return;
    setRefreshing(true);
    try {
      await Promise.all([
        loadList(activeOwnerAccountId, true),
        loadBrand(activeOwnerAccountId, true),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [activeOwnerAccountId, loadBrand, loadList]);

  const buildBrandInput = useCallback((): OwnerBrandingInput => {
    const displayName = brandDraft.displayName.trim();
    const slug = normalizeSlugDraft(brandDraft.slug || displayName);

    return {
      displayName,
      slug,
      bio: normalizeOptionalText(brandDraft.bio),
      contactEmail: normalizeOptionalText(brandDraft.contactEmail),
      contactPhone: normalizeOptionalText(brandDraft.contactPhone),
      websiteUrl: normalizeOptionalText(brandDraft.websiteUrl),
      socialLinks: parseSocialLinksDraft(brandDraft.socialLinksText),
      brandColors: {
        primary: brandDraft.primaryColor.trim() || DEFAULT_BRAND_COLORS.primary,
        accent: brandDraft.accentColor.trim() || DEFAULT_BRAND_COLORS.accent,
      },
      logoPath: brandDraft.logoPath,
      logoUrl: normalizeOptionalText(brandDraft.logoUrl),
      coverPath: brandDraft.coverPath,
      coverUrl: normalizeOptionalText(brandDraft.coverUrl),
      isPublic: brandDraft.isPublic,
    };
  }, [brandDraft]);

  const handleSaveBrand = useCallback(async () => {
    if (!activeOwnerAccountId) return;
    if (!brandDraft.displayName.trim()) {
      Alert.alert('Brand', 'Display name is required.');
      return;
    }

    setBrandSaving(true);
    try {
      const payload = await saveOwnerBranding({
        ownerAccountId: activeOwnerAccountId,
        profile: buildBrandInput(),
      });
      setBrandProfile(payload);
      setBrandDraft(createBrandDraft(payload, payload.ownerName));
      Alert.alert('Brand', 'Brand profile saved.');
    } catch (error: any) {
      Alert.alert('Brand', error.message || 'Could not save brand profile.');
    } finally {
      setBrandSaving(false);
    }
  }, [activeOwnerAccountId, brandDraft.displayName, buildBrandInput]);

  const handleUploadBrandAsset = useCallback(
    async (kind: OwnerBrandAssetKind, source: 'camera' | 'library' = 'library') => {
      if (!activeOwnerAccountId || brandUploadingKind) return;

      setBrandUploadingKind(kind);
      try {
        const uploaded = await pickAndUploadOwnerBrandAsset(activeOwnerAccountId, kind, source);
        if (!uploaded) return;

        setBrandDraft((current) => ({
          ...current,
          ...(kind === 'logo'
            ? { logoPath: uploaded.path, logoUrl: uploaded.publicUrl }
            : { coverPath: uploaded.path, coverUrl: uploaded.publicUrl }),
        }));
      } catch (error: any) {
        Alert.alert('Brand', error.message || 'Could not upload brand image.');
      } finally {
        setBrandUploadingKind(null);
      }
    },
    [activeOwnerAccountId, brandUploadingKind],
  );

  const openPlayerDetail = useCallback(
    async (player: OwnerPlayerCrmPlayer) => {
      if (!activeOwnerAccountId) return;
      setSelectedPlayerId(player.playerId);
      setDetail(null);
      setShowDetailModal(true);
      setDetailLoading(true);
      try {
        const payload = await fetchOwnerPlayerCrmDetail({
          ownerAccountId: activeOwnerAccountId,
          playerId: player.playerId,
        });
        setDetail(payload);
        setList(payload);
      } catch (error: any) {
        Alert.alert('CRM', error.message || 'Could not load player details.');
        setShowDetailModal(false);
      } finally {
        setDetailLoading(false);
      }
    },
    [activeOwnerAccountId],
  );

  const openPlayerActivities = useCallback(
    (playerId: string) => {
      startAdminPlayer(playerId);
      router.push({
        pathname: '/(tabs)/(home)',
        params: {
          ...(activeOwnerAccountId ? { ownerAccountId: activeOwnerAccountId } : {}),
          playerId,
          openAt: String(Date.now()),
        },
      } as any);
    },
    [activeOwnerAccountId, router, startAdminPlayer],
  );

  const openPlayerTasks = useCallback(
    (playerId: string) => {
      startAdminPlayer(playerId);
      router.push('/(tabs)/tasks' as any);
    },
    [router, startAdminPlayer],
  );

  const openPlayerProgress = useCallback(
    (playerId: string) => {
      startAdminPlayer(playerId);
      router.push('/(tabs)/performance' as any);
    },
    [router, startAdminPlayer],
  );

  useEffect(() => {
    if (!routePlayerId || !activeOwnerAccountId || !list?.players.length) return;
    if (routeOwnerAccountId && routeOwnerAccountId !== activeOwnerAccountId) return;

    const player = list.players.find((candidate) => candidate.playerId === routePlayerId);
    if (!player) return;

    const routeOpenKey = `${activeOwnerAccountId}:${routePlayerId}:${routeOpenAt ?? 'initial'}`;
    if (lastRouteOpenKeyRef.current === routeOpenKey) return;

    lastRouteOpenKeyRef.current = routeOpenKey;
    setActiveTab('players');
    void openPlayerDetail(player);
  }, [activeOwnerAccountId, list?.players, openPlayerDetail, routeOpenAt, routeOwnerAccountId, routePlayerId]);

  const refreshSelectedDetail = useCallback(
    async (playerId = selectedPlayerId) => {
      if (!activeOwnerAccountId || !playerId) return null;
      const payload = await fetchOwnerPlayerCrmDetail({
        ownerAccountId: activeOwnerAccountId,
        playerId,
      });
      setDetail(payload);
      setList(payload);
      return payload;
    },
    [activeOwnerAccountId, selectedPlayerId],
  );

  const showGuardianInviteDeliveryAlert = useCallback((payload: OwnerPlayerCrmDetail, fallbackMessage: string) => {
    const delivery = payload.guardianInviteDelivery;
    if (!delivery) {
      Alert.alert('Guardian invite', fallbackMessage);
      return;
    }

    if (delivery.status === 'sent') {
      Alert.alert('Guardian invite', 'Invitation email sent.');
      return;
    }

    Alert.alert('Guardian invite', delivery.warning || 'Invitation was saved, but the email could not be sent.');
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!activeOwnerAccountId || !selectedPlayerId) return;
    setDetailSaving(true);
    try {
      const payload = await updateOwnerPlayerCrmProfile({
        ownerAccountId: activeOwnerAccountId,
        playerId: selectedPlayerId,
        profile: {
          crmStatus: profileDraft.crmStatus,
          positions: profileDraft.positionsText
            .split(',')
            .map((position) => position.trim())
            .filter(Boolean),
          playingLevel: normalizeOptionalText(profileDraft.playingLevel),
          clubName: normalizeOptionalText(profileDraft.clubName),
          dateOfBirth: normalizeOptionalText(profileDraft.dateOfBirth),
          phoneNumber: normalizeOptionalText(profileDraft.phoneNumber),
          email: normalizeOptionalText(profileDraft.email),
          emailVisibleToStaff: profileDraft.emailVisibleToStaff,
          phoneVisibleToStaff: profileDraft.phoneVisibleToStaff,
        },
      });
      setDetail(payload);
      setList(payload);
      Alert.alert('CRM', 'Player profile saved.');
    } catch (error: any) {
      Alert.alert('CRM', error.message || 'Could not save player profile.');
    } finally {
      setDetailSaving(false);
    }
  }, [activeOwnerAccountId, profileDraft, selectedPlayerId]);

  const handleCreateNote = useCallback(async () => {
    if (!activeOwnerAccountId || !selectedPlayerId || !noteDraft.trim()) return;
    setDetailSaving(true);
    try {
      const payload = await createOwnerPlayerCrmNote({
        ownerAccountId: activeOwnerAccountId,
        playerId: selectedPlayerId,
        body: noteDraft.trim(),
      });
      setDetail(payload);
      setList(payload);
      setNoteDraft('');
    } catch (error: any) {
      Alert.alert('CRM', error.message || 'Could not save note.');
    } finally {
      setDetailSaving(false);
    }
  }, [activeOwnerAccountId, noteDraft, selectedPlayerId]);

  const handleDeleteNote = useCallback(
    (noteId: string) => {
      if (!activeOwnerAccountId || !selectedPlayerId) return;
      Alert.alert('Delete note', 'Delete this private note?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDetailSaving(true);
            try {
              const payload = await deleteOwnerPlayerCrmNote({
                ownerAccountId: activeOwnerAccountId,
                playerId: selectedPlayerId,
                noteId,
              });
              setDetail(payload);
              setList(payload);
            } catch (error: any) {
              Alert.alert('CRM', error.message || 'Could not delete note.');
            } finally {
              setDetailSaving(false);
            }
          },
        },
      ]);
    },
    [activeOwnerAccountId, selectedPlayerId],
  );

  const handleTogglePlayerTag = useCallback(
    async (tag: OwnerPlayerCrmTag) => {
      if (!activeOwnerAccountId || !selectedPlayerId || !detail) return;
      const currentIds = new Set(detail.player.tags.map((currentTag) => currentTag.id));
      if (currentIds.has(tag.id)) {
        currentIds.delete(tag.id);
      } else {
        currentIds.add(tag.id);
      }

      setDetailSaving(true);
      try {
        const payload = await setOwnerPlayerCrmTags({
          ownerAccountId: activeOwnerAccountId,
          playerId: selectedPlayerId,
          tagIds: Array.from(currentIds),
        });
        setDetail(payload);
        setList(payload);
      } catch (error: any) {
        Alert.alert('CRM', error.message || 'Could not update tags.');
      } finally {
        setDetailSaving(false);
      }
    },
    [activeOwnerAccountId, detail, selectedPlayerId],
  );

  const handleSaveGuardian = useCallback(async () => {
    if (!activeOwnerAccountId || !selectedPlayerId || !guardianDraft.fullName.trim()) return;
    setDetailSaving(true);
    try {
      const payload = await saveOwnerPlayerGuardianContact({
        ownerAccountId: activeOwnerAccountId,
        playerId: selectedPlayerId,
        fullName: guardianDraft.fullName.trim(),
        email: normalizeOptionalText(guardianDraft.email),
        phoneNumber: normalizeOptionalText(guardianDraft.phoneNumber),
        relation: guardianDraft.relation,
        status: guardianDraft.status,
        notes: normalizeOptionalText(guardianDraft.notes),
      });
      setDetail(payload);
      setList(payload);
      setGuardianDraft(emptyGuardianDraft);
    } catch (error: any) {
      Alert.alert('CRM', error.message || 'Could not save guardian contact.');
    } finally {
      setDetailSaving(false);
    }
  }, [activeOwnerAccountId, guardianDraft, selectedPlayerId]);

  const handleDeleteGuardian = useCallback(
    (contact: OwnerPlayerCrmGuardianContact) => {
      if (!activeOwnerAccountId || !selectedPlayerId) return;
      Alert.alert('Remove guardian', `Remove ${contact.fullName}?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setDetailSaving(true);
            try {
              const payload = await deleteOwnerPlayerGuardianContact({
                ownerAccountId: activeOwnerAccountId,
                playerId: selectedPlayerId,
                contactId: contact.id,
              });
              setDetail(payload);
              setList(payload);
            } catch (error: any) {
              Alert.alert('CRM', error.message || 'Could not remove guardian contact.');
            } finally {
              setDetailSaving(false);
            }
          },
        },
      ]);
    },
    [activeOwnerAccountId, selectedPlayerId],
  );

  const handleInviteGuardian = useCallback(
    async (contact: OwnerPlayerCrmGuardianContact) => {
      if (!activeOwnerAccountId || !selectedPlayerId || !contact.email) return;
      setDetailSaving(true);
      try {
        const payload = await inviteOwnerPlayerGuardianContact({
          ownerAccountId: activeOwnerAccountId,
          playerId: selectedPlayerId,
          contactId: contact.id,
        });
        setDetail(payload);
        setList(payload);
        showGuardianInviteDeliveryAlert(payload, 'Invitation created.');
      } catch (error: any) {
        Alert.alert('Guardian invite', error.message || 'Could not invite guardian.');
      } finally {
        setDetailSaving(false);
      }
    },
    [activeOwnerAccountId, selectedPlayerId, showGuardianInviteDeliveryAlert],
  );

  const handleResendGuardianInvite = useCallback(
    async (contact: OwnerPlayerCrmGuardianContact) => {
      if (!activeOwnerAccountId || !selectedPlayerId || !contact.inviteId) return;
      setDetailSaving(true);
      try {
        const payload = await resendOwnerPlayerGuardianInvite({
          ownerAccountId: activeOwnerAccountId,
          playerId: selectedPlayerId,
          inviteId: contact.inviteId,
        });
        setDetail(payload);
        setList(payload);
        showGuardianInviteDeliveryAlert(payload, 'Invitation resent.');
      } catch (error: any) {
        Alert.alert('Guardian invite', error.message || 'Could not resend guardian invite.');
      } finally {
        setDetailSaving(false);
      }
    },
    [activeOwnerAccountId, selectedPlayerId, showGuardianInviteDeliveryAlert],
  );

  const handleCancelGuardianInvite = useCallback(
    (contact: OwnerPlayerCrmGuardianContact) => {
      if (!activeOwnerAccountId || !selectedPlayerId || !contact.inviteId) return;
      Alert.alert('Cancel invite', `Cancel invitation for ${contact.fullName}?`, [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel invite',
          style: 'destructive',
          onPress: async () => {
            setDetailSaving(true);
            try {
              const payload = await cancelOwnerPlayerGuardianInvite({
                ownerAccountId: activeOwnerAccountId,
                playerId: selectedPlayerId,
                inviteId: contact.inviteId!,
              });
              setDetail(payload);
              setList(payload);
            } catch (error: any) {
              Alert.alert('Guardian invite', error.message || 'Could not cancel guardian invite.');
            } finally {
              setDetailSaving(false);
            }
          },
        },
      ]);
    },
    [activeOwnerAccountId, selectedPlayerId],
  );

  const handleRevokeGuardianAccess = useCallback(
    (contact: OwnerPlayerCrmGuardianContact) => {
      if (!activeOwnerAccountId || !selectedPlayerId) return;
      Alert.alert('Revoke access', `Remove app access for ${contact.fullName}?`, [
        { text: 'Keep access', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setDetailSaving(true);
            try {
              const payload = await revokeOwnerPlayerGuardianAccess({
                ownerAccountId: activeOwnerAccountId,
                playerId: selectedPlayerId,
                contactId: contact.id,
              });
              setDetail(payload);
              setList(payload);
            } catch (error: any) {
              Alert.alert('Guardian invite', error.message || 'Could not revoke guardian access.');
            } finally {
              setDetailSaving(false);
            }
          },
        },
      ]);
    },
    [activeOwnerAccountId, selectedPlayerId],
  );

  const handleSaveTag = useCallback(async () => {
    if (!activeOwnerAccountId || !tagNameDraft.trim()) return;
    setTagSaving(true);
    try {
      const payload = await upsertOwnerPlayerCrmTag({
        ownerAccountId: activeOwnerAccountId,
        name: tagNameDraft.trim(),
        color: tagColorDraft,
      });
      setList(payload);
      setTagNameDraft('');
    } catch (error: any) {
      Alert.alert('CRM', error.message || 'Could not save tag.');
    } finally {
      setTagSaving(false);
    }
  }, [activeOwnerAccountId, tagColorDraft, tagNameDraft]);

  const handleDeleteTag = useCallback(
    (tag: OwnerPlayerCrmTag) => {
      if (!activeOwnerAccountId) return;
      Alert.alert('Delete tag', `Delete "${tag.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setTagSaving(true);
            try {
              const payload = await deleteOwnerPlayerCrmTag({
                ownerAccountId: activeOwnerAccountId,
                tagId: tag.id,
              });
              setList(payload);
              setTagFilterId('all');
            } catch (error: any) {
              Alert.alert('CRM', error.message || 'Could not delete tag.');
            } finally {
              setTagSaving(false);
            }
          },
        },
      ]);
    },
    [activeOwnerAccountId],
  );

  const handlePlayerCreated = useCallback(async () => {
    setShowCreatePlayerModal(false);
    if (activeOwnerAccountId) {
      await loadList(activeOwnerAccountId, true);
    }
  }, [activeOwnerAccountId, loadList]);

  const contentPaddingBottom = Math.max(insets.bottom + 120, 150);

  if (roleLoading || loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={[styles.centerText, { color: colors.textSecondary }]}>Loading CRM...</Text>
      </View>
    );
  }

  if (!canManagePlayers) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background, paddingHorizontal: 24 }]}>
        <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={38} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No CRM access</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: contentPaddingBottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <View style={styles.titleGroup}>
            <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>Owner CRM</Text>
            <Text style={[styles.title, { color: colors.text }]}>Player CRM</Text>
          </View>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: colors.primary }]}
            onPress={() => setShowCreatePlayerModal(true)}
            disabled={!activeOwnerAccountId}
            activeOpacity={0.75}
            testID="playerCrm.addPlayerButton"
          >
            <IconSymbol ios_icon_name="person.badge.plus" android_material_icon_name="person_add" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {(context?.workspaces.length ?? 0) > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
            {context?.workspaces.map((workspace) => {
              const active = workspace.ownerAccountId === activeOwnerAccountId;
              return (
                <TouchableOpacity
                  key={workspace.ownerAccountId}
                  style={[
                    styles.workspaceChip,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setActiveOwnerAccountId(workspace.ownerAccountId)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.workspaceChipText, { color: active ? '#fff' : colors.text }]} numberOfLines={1}>
                    {workspace.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {!activeOwnerAccountId || !activeWorkspace ? (
          <View style={[styles.emptyPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <IconSymbol ios_icon_name="person.2.slash" android_material_icon_name="group_off" size={36} color={colors.textSecondary} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No workspace</Text>
          </View>
        ) : (
          <>
            <View style={[styles.ownerBand, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.ownerBandTitle}>
                <Text style={[styles.ownerName, { color: colors.text }]} numberOfLines={1}>
                  {activeWorkspace.name}
                </Text>
                <Text style={[styles.ownerType, { color: colors.textSecondary }]}>
                  {activeWorkspace.ownerType === 'club' ? 'Club' : 'Private coach'}
                </Text>
              </View>
              <View style={styles.statsRow}>
                <StatPill label="Players" value={playerStats.total} color={colors.primary} />
                <StatPill label="Active" value={playerStats.active} color="#16a34a" />
                <StatPill label="Trial" value={playerStats.trial} color="#2563eb" />
                <StatPill label="Paused" value={playerStats.paused} color="#f59e0b" />
              </View>
            </View>

            <SegmentedTabs activeTab={activeTab} onChange={setActiveTab} colors={colors} />

            {activeTab === 'players' && (
              <View style={styles.tabContent}>
                <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={colors.textSecondary} />
                  <TextInput
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder="Search players"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.searchInput, { color: colors.text }]}
                    autoCapitalize="none"
                    testID="playerCrm.searchInput"
                  />
                </View>

                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: colors.text }]}>Players</Text>
                  <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{filteredPlayers.length}</Text>
                </View>

                <FilterChips
                  colors={colors}
                  statusFilter={statusFilter}
                  setStatusFilter={setStatusFilter}
                  tags={list?.tags ?? []}
                  tagFilterId={tagFilterId}
                  setTagFilterId={setTagFilterId}
                  teams={list?.teams ?? []}
                  teamFilterId={teamFilterId}
                  setTeamFilterId={setTeamFilterId}
                />

                {filteredPlayers.length === 0 ? (
                  <View style={[styles.emptyPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <IconSymbol ios_icon_name="person.crop.circle.badge.questionmark" android_material_icon_name="person_search" size={34} color={colors.textSecondary} />
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>No players</Text>
                  </View>
                ) : (
                  filteredPlayers.map((player) => (
                    <PlayerCard
                      key={player.playerId}
                      player={player}
                      colors={colors}
                      onPress={() => openPlayerDetail(player)}
                      onOpenActivities={() => openPlayerActivities(player.playerId)}
                      onOpenTasks={() => openPlayerTasks(player.playerId)}
                      onOpenProgress={() => openPlayerProgress(player.playerId)}
                    />
                  ))
                )}
              </View>
            )}

            {activeTab === 'teams' && (
              <View style={styles.tabContent} testID="playerCrm.teamsTab">
                <TeamManagement />
              </View>
            )}

            {activeTab === 'tags' && (
              <View style={styles.tabContent} testID="playerCrm.tagsTab">
                <View style={[styles.formPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.formTitle, { color: colors.text }]}>Tags</Text>
                  <TextInput
                    value={tagNameDraft}
                    onChangeText={setTagNameDraft}
                    placeholder="Tag name"
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                  />
                  <View style={styles.swatchRow}>
                    {TAG_COLORS.map((tagColor) => (
                      <TouchableOpacity
                        key={tagColor}
                        style={[
                          styles.swatch,
                          {
                            backgroundColor: tagColor,
                            borderColor: tagColorDraft === tagColor ? colors.text : tagColor,
                          },
                        ]}
                        onPress={() => setTagColorDraft(tagColor)}
                        activeOpacity={0.8}
                      />
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[styles.primaryButton, { backgroundColor: colors.primary }, (!tagNameDraft.trim() || tagSaving) && styles.disabledButton]}
                    onPress={handleSaveTag}
                    disabled={!tagNameDraft.trim() || tagSaving}
                  >
                    {tagSaving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <IconSymbol ios_icon_name="tag.fill" android_material_icon_name="sell" size={18} color="#fff" />
                        <Text style={styles.primaryButtonText}>Save tag</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {(list?.tags ?? []).map((tag) => (
                  <View key={tag.id} style={[styles.tagRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <View style={styles.rowStart}>
                      <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
                      <Text style={[styles.tagRowText, { color: colors.text }]}>{tag.name}</Text>
                    </View>
                    <TouchableOpacity onPress={() => handleDeleteTag(tag)} style={styles.smallIconButton}>
                      <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {activeTab === 'brand' && (
              <BrandSettingsPanel
                colors={colors}
                loading={brandLoading}
                saving={brandSaving}
                uploadingKind={brandUploadingKind}
                profile={brandProfile}
                draft={brandDraft}
                setDraft={setBrandDraft}
                onSave={handleSaveBrand}
                onUploadAsset={handleUploadBrandAsset}
              />
            )}
          </>
        )}
      </ScrollView>

      <PlayerDetailModal
        visible={showDetailModal}
        detail={detail}
        colors={colors}
        loading={detailLoading}
        saving={detailSaving}
        profileDraft={profileDraft}
        setProfileDraft={setProfileDraft}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        guardianDraft={guardianDraft}
        setGuardianDraft={setGuardianDraft}
        onClose={() => {
          setShowDetailModal(false);
          setDetail(null);
          setSelectedPlayerId(null);
          setNoteDraft('');
          setGuardianDraft(emptyGuardianDraft);
        }}
        onSaveProfile={handleSaveProfile}
        onCreateNote={handleCreateNote}
        onDeleteNote={handleDeleteNote}
        onToggleTag={handleTogglePlayerTag}
        onSaveGuardian={handleSaveGuardian}
        onDeleteGuardian={handleDeleteGuardian}
        onInviteGuardian={handleInviteGuardian}
        onResendGuardianInvite={handleResendGuardianInvite}
        onCancelGuardianInvite={handleCancelGuardianInvite}
        onRevokeGuardianAccess={handleRevokeGuardianAccess}
        onRefresh={() => void refreshSelectedDetail()}
      />

      <CreatePlayerModal
        visible={showCreatePlayerModal}
        ownerAccountId={activeOwnerAccountId}
        onClose={() => setShowCreatePlayerModal(false)}
        onPlayerCreated={handlePlayerCreated}
        successRedirectLabel="Returnerer til CRM..."
      />
    </View>
  );
}

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.statPill, { borderColor: `${color}55` }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SegmentedTabs({
  activeTab,
  onChange,
  colors,
}: {
  activeTab: CrmTab;
  onChange: (tab: CrmTab) => void;
  colors: ReturnType<typeof getColors>;
}) {
  const tabs: { value: CrmTab; label: string; icon: string; materialIcon: string }[] = [
    { value: 'players', label: 'Players', icon: 'person.2.fill', materialIcon: 'groups' },
    { value: 'teams', label: 'Teams', icon: 'person.3.fill', materialIcon: 'groups' },
    { value: 'tags', label: 'Tags', icon: 'tag.fill', materialIcon: 'sell' },
    { value: 'brand', label: 'Brand', icon: 'paintpalette.fill', materialIcon: 'palette' },
  ];

  return (
    <View style={[styles.segmented, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {tabs.map((tab) => {
        const active = activeTab === tab.value;
        return (
          <TouchableOpacity
            key={tab.value}
            style={[styles.segmentButton, active && { backgroundColor: colors.primary }]}
            onPress={() => onChange(tab.value)}
            activeOpacity={0.75}
            testID={`playerCrm.tab.${tab.value}`}
          >
            <IconSymbol
              ios_icon_name={tab.icon as any}
              android_material_icon_name={tab.materialIcon as any}
              size={18}
              color={active ? '#fff' : colors.textSecondary}
            />
            <Text style={[styles.segmentText, { color: active ? '#fff' : colors.text }]}>{tab.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function FilterChips({
  colors,
  statusFilter,
  setStatusFilter,
  tags,
  tagFilterId,
  setTagFilterId,
  teams,
  teamFilterId,
  setTeamFilterId,
}: {
  colors: ReturnType<typeof getColors>;
  statusFilter: OwnerCrmStatus | 'all';
  setStatusFilter: (value: OwnerCrmStatus | 'all') => void;
  tags: OwnerPlayerCrmTag[];
  tagFilterId: string | 'all';
  setTagFilterId: (value: string | 'all') => void;
  teams: OwnerPlayerCrmList['teams'];
  teamFilterId: string | 'all';
  setTeamFilterId: (value: string | 'all') => void;
}) {
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
        <Chip label="All" active={statusFilter === 'all'} onPress={() => setStatusFilter('all')} colors={colors} />
        {STATUS_OPTIONS.map((status) => (
          <Chip
            key={status.value}
            label={status.label}
            active={statusFilter === status.value}
            onPress={() => setStatusFilter(status.value)}
            colors={colors}
            accentColor={status.color}
          />
        ))}
      </ScrollView>

      {tags.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
          <Chip label="All tags" active={tagFilterId === 'all'} onPress={() => setTagFilterId('all')} colors={colors} />
          {tags.map((tag) => (
            <Chip
              key={tag.id}
              label={tag.name}
              active={tagFilterId === tag.id}
              onPress={() => setTagFilterId(tag.id)}
              colors={colors}
              accentColor={tag.color}
            />
          ))}
        </ScrollView>
      )}

      {teams.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.horizontalChips}>
          <Chip label="All teams" active={teamFilterId === 'all'} onPress={() => setTeamFilterId('all')} colors={colors} />
          {teams.map((team) => (
            <Chip
              key={team.id}
              label={team.name}
              active={teamFilterId === team.id}
              onPress={() => setTeamFilterId(team.id)}
              colors={colors}
              accentColor={colors.secondary}
            />
          ))}
        </ScrollView>
      )}
    </>
  );
}

function Chip({
  label,
  active,
  onPress,
  colors,
  accentColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
  accentColor?: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        {
          backgroundColor: active ? accentColor ?? colors.primary : colors.card,
          borderColor: active ? accentColor ?? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, { color: active ? '#fff' : colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function PlayerCard({
  player,
  colors,
  onPress,
  onOpenActivities,
  onOpenTasks,
  onOpenProgress,
}: {
  player: OwnerPlayerCrmPlayer;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
  onOpenActivities: () => void;
  onOpenTasks: () => void;
  onOpenProgress: () => void;
}) {
  const status = getStatusMeta(player.crmStatus);

  return (
    <TouchableOpacity
      style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.82}
      testID={`playerCrm.playerCard.${player.playerId}`}
    >
      <View style={styles.playerCardTop}>
        <View style={[styles.avatar, { backgroundColor: `${status.color}22` }]}>
          <Text style={[styles.avatarText, { color: status.color }]}>{player.displayName.trim().charAt(0).toUpperCase() || '?'}</Text>
        </View>
        <View style={styles.playerMain}>
          <Text style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
            {player.displayName}
          </Text>
          <Text style={[styles.playerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {[player.primaryPosition, player.playingLevel, player.clubName].filter(Boolean).join(' · ') || 'No CRM profile yet'}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: `${status.color}22` }]}>
          <Text style={[styles.statusBadgeText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.cardChips}>
        {player.tags.slice(0, 3).map((tag) => (
          <View key={tag.id} style={[styles.smallTag, { borderColor: `${tag.color}66` }]}>
            <View style={[styles.tagDot, { backgroundColor: tag.color }]} />
            <Text style={[styles.smallTagText, { color: colors.text }]} numberOfLines={1}>
              {tag.name}
            </Text>
          </View>
        ))}
        {player.teams.slice(0, 2).map((team) => (
          <View key={team.id} style={[styles.smallTag, { borderColor: colors.border }]}>
            <IconSymbol ios_icon_name="person.3.fill" android_material_icon_name="groups" size={13} color={colors.textSecondary} />
            <Text style={[styles.smallTagText, { color: colors.text }]} numberOfLines={1}>
              {team.name}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.playerSignals}>
        <Signal icon="note.text" materialIcon="sticky_note_2" label={`${player.notesCount}`} colors={colors} />
        <Signal icon="figure.2.and.child.holdinghands" materialIcon="family_restroom" label={`${player.guardianContactsCount}`} colors={colors} />
        {player.age != null && <Signal icon="birthday.cake.fill" materialIcon="cake" label={`${player.age}`} colors={colors} />}
      </View>

      {player.latestNotePreview ? (
        <Text style={[styles.latestNote, { color: colors.textSecondary }]} numberOfLines={2}>
          {player.latestNotePreview}
        </Text>
      ) : null}

      <View style={styles.playerCardActions}>
        <PlayerCardAction
          label="Activities"
          icon="calendar"
          materialIcon="event"
          colors={colors}
          onPress={onOpenActivities}
          testID={`playerCrm.playerCard.${player.playerId}.activities`}
        />
        <PlayerCardAction
          label="Tasks"
          icon="checklist"
          materialIcon="checklist"
          colors={colors}
          onPress={onOpenTasks}
          testID={`playerCrm.playerCard.${player.playerId}.tasks`}
        />
        <PlayerCardAction
          label="Progress"
          icon="chart.bar.fill"
          materialIcon="bar_chart"
          colors={colors}
          onPress={onOpenProgress}
          testID={`playerCrm.playerCard.${player.playerId}.progress`}
        />
      </View>
    </TouchableOpacity>
  );
}

function PlayerCardAction({
  label,
  icon,
  materialIcon,
  colors,
  onPress,
  testID,
}: {
  label: string;
  icon: string;
  materialIcon: string;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.playerCardAction, { borderColor: colors.border, backgroundColor: colors.background }]}
      onPress={onPress}
      activeOpacity={0.78}
      testID={testID}
    >
      <IconSymbol ios_icon_name={icon as any} android_material_icon_name={materialIcon as any} size={14} color={colors.primary} />
      <Text style={[styles.playerCardActionText, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function Signal({
  icon,
  materialIcon,
  label,
  colors,
}: {
  icon: string;
  materialIcon: string;
  label: string;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={styles.signal}>
      <IconSymbol ios_icon_name={icon as any} android_material_icon_name={materialIcon as any} size={15} color={colors.textSecondary} />
      <Text style={[styles.signalText, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function PlayerDetailModal({
  visible,
  detail,
  colors,
  loading,
  saving,
  profileDraft,
  setProfileDraft,
  noteDraft,
  setNoteDraft,
  guardianDraft,
  setGuardianDraft,
  onClose,
  onSaveProfile,
  onCreateNote,
  onDeleteNote,
  onToggleTag,
  onSaveGuardian,
  onDeleteGuardian,
  onInviteGuardian,
  onResendGuardianInvite,
  onCancelGuardianInvite,
  onRevokeGuardianAccess,
  onRefresh,
}: {
  visible: boolean;
  detail: OwnerPlayerCrmDetail | null;
  colors: ReturnType<typeof getColors>;
  loading: boolean;
  saving: boolean;
  profileDraft: ProfileDraft;
  setProfileDraft: React.Dispatch<React.SetStateAction<ProfileDraft>>;
  noteDraft: string;
  setNoteDraft: (value: string) => void;
  guardianDraft: GuardianDraft;
  setGuardianDraft: React.Dispatch<React.SetStateAction<GuardianDraft>>;
  onClose: () => void;
  onSaveProfile: () => void;
  onCreateNote: () => void;
  onDeleteNote: (noteId: string) => void;
  onToggleTag: (tag: OwnerPlayerCrmTag) => void;
  onSaveGuardian: () => void;
  onDeleteGuardian: (contact: OwnerPlayerCrmGuardianContact) => void;
  onInviteGuardian: (contact: OwnerPlayerCrmGuardianContact) => void;
  onResendGuardianInvite: (contact: OwnerPlayerCrmGuardianContact) => void;
  onCancelGuardianInvite: (contact: OwnerPlayerCrmGuardianContact) => void;
  onRevokeGuardianAccess: (contact: OwnerPlayerCrmGuardianContact) => void;
  onRefresh: () => void;
}) {
  const insets = useSafeAreaInsets();
  const selectedTagIds = new Set(detail?.player.tags.map((tag) => tag.id) ?? []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.modalScreen, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.modalHeader, { paddingTop: insets.top + 12, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={onClose} style={styles.modalIconButton}>
            <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.modalTitleGroup}>
            <Text style={[styles.modalTitle, { color: colors.text }]} numberOfLines={1}>
              {detail?.player.displayName ?? 'Player'}
            </Text>
            <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>CRM profile</Text>
          </View>
          <TouchableOpacity onPress={onRefresh} style={styles.modalIconButton} disabled={loading}>
            <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="refresh" size={21} color={colors.text} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.modalCentered}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : !detail ? (
          <View style={styles.modalCentered}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No player selected</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={[styles.modalContent, { paddingBottom: Math.max(insets.bottom + 34, 64) }]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.detailHero, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.playerCardTop}>
                <View style={[styles.avatar, { backgroundColor: `${getStatusMeta(detail.player.crmStatus).color}22` }]}>
                  <Text style={[styles.avatarText, { color: getStatusMeta(detail.player.crmStatus).color }]}>
                    {detail.player.displayName.trim().charAt(0).toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={styles.playerMain}>
                  <Text style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
                    {detail.player.displayName}
                  </Text>
                  <Text style={[styles.playerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                    {[detail.player.primaryPosition, detail.player.playingLevel, detail.player.clubName].filter(Boolean).join(' · ') || 'CRM'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={[styles.formPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Profile</Text>
              <View style={styles.statusGrid}>
                {STATUS_OPTIONS.map((status) => (
                  <Chip
                    key={status.value}
                    label={status.label}
                    active={profileDraft.crmStatus === status.value}
                    onPress={() => setProfileDraft((current) => ({ ...current, crmStatus: status.value }))}
                    colors={colors}
                    accentColor={status.color}
                  />
                ))}
              </View>
              <LabeledInput label="Positions" value={profileDraft.positionsText} onChangeText={(value) => setProfileDraft((current) => ({ ...current, positionsText: value }))} colors={colors} placeholder="Striker, winger" />
              <LabeledInput label="Level" value={profileDraft.playingLevel} onChangeText={(value) => setProfileDraft((current) => ({ ...current, playingLevel: value }))} colors={colors} placeholder="U15 elite" />
              <LabeledInput label="Club" value={profileDraft.clubName} onChangeText={(value) => setProfileDraft((current) => ({ ...current, clubName: value }))} colors={colors} placeholder="Current club" />
              <LabeledInput label="Date of birth" value={profileDraft.dateOfBirth} onChangeText={(value) => setProfileDraft((current) => ({ ...current, dateOfBirth: value }))} colors={colors} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
              <LabeledInput label="Phone" value={profileDraft.phoneNumber} onChangeText={(value) => setProfileDraft((current) => ({ ...current, phoneNumber: value }))} colors={colors} placeholder="+45 ..." keyboardType="phone-pad" />
              <LabeledInput label="Email" value={profileDraft.email} onChangeText={(value) => setProfileDraft((current) => ({ ...current, email: value }))} colors={colors} placeholder="player@example.com" keyboardType="email-address" autoCapitalize="none" />
              <ToggleRow label="Show email to staff" value={profileDraft.emailVisibleToStaff} onValueChange={(value) => setProfileDraft((current) => ({ ...current, emailVisibleToStaff: value }))} colors={colors} />
              <ToggleRow label="Show phone to staff" value={profileDraft.phoneVisibleToStaff} onValueChange={(value) => setProfileDraft((current) => ({ ...current, phoneVisibleToStaff: value }))} colors={colors} />
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.primary }, saving && styles.disabledButton]} onPress={onSaveProfile} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryButtonText}>Save profile</Text>}
              </TouchableOpacity>
            </View>

            <View style={[styles.formPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Tags</Text>
              <View style={styles.wrapRow}>
                {detail.tags.length === 0 ? (
                  <Text style={[styles.emptyInline, { color: colors.textSecondary }]}>No tags</Text>
                ) : (
                  detail.tags.map((tag) => (
                    <Chip
                      key={tag.id}
                      label={tag.name}
                      active={selectedTagIds.has(tag.id)}
                      onPress={() => onToggleTag(tag)}
                      colors={colors}
                      accentColor={tag.color}
                    />
                  ))
                )}
              </View>
            </View>

            <View style={[styles.formPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Private notes</Text>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Add a private coach note"
                placeholderTextColor={colors.textSecondary}
                style={[styles.textArea, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }]}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }, (!noteDraft.trim() || saving) && styles.disabledButton]}
                onPress={onCreateNote}
                disabled={!noteDraft.trim() || saving}
              >
                <Text style={styles.primaryButtonText}>Add note</Text>
              </TouchableOpacity>
              {detail.notes.map((note) => (
                <View key={note.id} style={[styles.noteCard, { borderColor: colors.border, backgroundColor: colors.background }]}>
                  <Text style={[styles.noteText, { color: colors.text }]}>{note.body}</Text>
                  <View style={styles.noteFooter}>
                    <Text style={[styles.noteDate, { color: colors.textSecondary }]}>{compactDateLabel(note.updatedAt)}</Text>
                    <TouchableOpacity onPress={() => onDeleteNote(note.id)}>
                      <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>

            <View style={[styles.formPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Guardians</Text>
              <LabeledInput label="Name" value={guardianDraft.fullName} onChangeText={(value) => setGuardianDraft((current) => ({ ...current, fullName: value }))} colors={colors} placeholder="Full name" />
              <LabeledInput label="Email" value={guardianDraft.email} onChangeText={(value) => setGuardianDraft((current) => ({ ...current, email: value }))} colors={colors} placeholder="guardian@example.com" keyboardType="email-address" autoCapitalize="none" />
              <LabeledInput label="Phone" value={guardianDraft.phoneNumber} onChangeText={(value) => setGuardianDraft((current) => ({ ...current, phoneNumber: value }))} colors={colors} placeholder="+45 ..." keyboardType="phone-pad" />
              <View style={styles.wrapRow}>
                {(['parent', 'guardian', 'other'] as const).map((relation) => (
                  <Chip
                    key={relation}
                    label={relation}
                    active={guardianDraft.relation === relation}
                    onPress={() => setGuardianDraft((current) => ({ ...current, relation }))}
                    colors={colors}
                    accentColor={colors.secondary}
                  />
                ))}
              </View>
              <LabeledInput label="Notes" value={guardianDraft.notes} onChangeText={(value) => setGuardianDraft((current) => ({ ...current, notes: value }))} colors={colors} placeholder="Contact notes" />
              <TouchableOpacity
                style={[styles.primaryButton, { backgroundColor: colors.primary }, (!guardianDraft.fullName.trim() || saving) && styles.disabledButton]}
                onPress={onSaveGuardian}
                disabled={!guardianDraft.fullName.trim() || saving}
              >
                <Text style={styles.primaryButtonText}>Save guardian</Text>
              </TouchableOpacity>
              {detail.guardianContacts.map((contact) => {
                const inviteColor = getGuardianInviteColor(contact, colors);
                const canInvite = Boolean(contact.email) && contact.accessStatus !== 'active' && contact.inviteStatus !== 'pending';
                const canResend = contact.inviteStatus === 'pending' && Boolean(contact.inviteId);
                const canCancel = contact.inviteStatus === 'pending' && Boolean(contact.inviteId);
                const canRevoke = contact.accessStatus === 'active';

                return (
                  <View key={contact.id} style={[styles.contactRow, { borderColor: colors.border, backgroundColor: colors.background }]}>
                    <View style={styles.contactHeader}>
                      <View style={styles.playerMain}>
                        <Text style={[styles.contactName, { color: colors.text }]}>{contact.fullName}</Text>
                        <Text style={[styles.playerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                          {[contact.relation, contact.email, contact.phoneNumber].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => onDeleteGuardian(contact)} style={styles.smallIconButton}>
                        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={colors.error} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.guardianStatusRow}>
                      <View style={[styles.guardianStatusDot, { backgroundColor: inviteColor }]} />
                      <Text style={[styles.guardianStatusText, { color: inviteColor }]}>{getGuardianInviteLabel(contact)}</Text>
                      {contact.inviteExpiresAt && contact.inviteStatus === 'pending' ? (
                        <Text style={[styles.guardianStatusMeta, { color: colors.textSecondary }]}>
                          Expires {compactDateLabel(contact.inviteExpiresAt)}
                        </Text>
                      ) : null}
                    </View>

                    {!contact.email ? (
                      <Text style={[styles.emptyInline, { color: colors.textSecondary }]}>Add an email before inviting.</Text>
                    ) : null}

                    <View style={styles.guardianActions}>
                      {canRevoke ? (
                        <TouchableOpacity
                          style={[styles.secondaryActionButton, { borderColor: colors.error }, saving && styles.disabledButton]}
                          onPress={() => onRevokeGuardianAccess(contact)}
                          disabled={saving}
                        >
                          <IconSymbol ios_icon_name="person.crop.circle.badge.xmark" android_material_icon_name="person_remove" size={17} color={colors.error} />
                          <Text style={[styles.secondaryActionText, { color: colors.error }]}>Revoke</Text>
                        </TouchableOpacity>
                      ) : canResend || canCancel ? (
                        <>
                          <TouchableOpacity
                            style={[styles.secondaryActionButton, { borderColor: colors.border }, saving && styles.disabledButton]}
                            onPress={() => onResendGuardianInvite(contact)}
                            disabled={saving}
                          >
                            <IconSymbol ios_icon_name="paperplane.fill" android_material_icon_name="send" size={16} color={colors.primary} />
                            <Text style={[styles.secondaryActionText, { color: colors.primary }]}>Resend</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.secondaryActionButton, { borderColor: colors.border }, saving && styles.disabledButton]}
                            onPress={() => onCancelGuardianInvite(contact)}
                            disabled={saving}
                          >
                            <IconSymbol ios_icon_name="xmark.circle" android_material_icon_name="cancel" size={17} color={colors.error} />
                            <Text style={[styles.secondaryActionText, { color: colors.error }]}>Cancel</Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.secondaryActionButton,
                            { borderColor: canInvite ? colors.primary : colors.border },
                            (!canInvite || saving) && styles.disabledButton,
                          ]}
                          onPress={() => onInviteGuardian(contact)}
                          disabled={!canInvite || saving}
                        >
                          <IconSymbol ios_icon_name="envelope.fill" android_material_icon_name="mail" size={16} color={canInvite ? colors.primary : colors.textSecondary} />
                          <Text style={[styles.secondaryActionText, { color: canInvite ? colors.primary : colors.textSecondary }]}>Invite</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={[styles.formPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.formTitle, { color: colors.text }]}>Timeline</Text>
              {detail.timeline.length === 0 ? (
                <Text style={[styles.emptyInline, { color: colors.textSecondary }]}>No recent activity</Text>
              ) : (
                detail.timeline.map((entry) => (
                  <View key={entry.id} style={styles.timelineRow}>
                    <View style={[styles.timelineDot, { backgroundColor: entry.type === 'activity' ? colors.primary : colors.secondary }]} />
                    <View style={styles.playerMain}>
                      <Text style={[styles.timelineTitle, { color: colors.text }]} numberOfLines={1}>
                        {entry.title}
                      </Text>
                      <Text style={[styles.playerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
                        {[compactDateLabel(entry.occurredAt), entry.subtitle].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function LabeledInput({
  label,
  colors,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        {...props}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.background }, props.style]}
      />
    </View>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  colors,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, { color: colors.text }]}>{label}</Text>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.primary, false: colors.border }} />
    </View>
  );
}

function BrandSettingsPanel({
  colors,
  loading,
  saving,
  uploadingKind,
  profile,
  draft,
  setDraft,
  onSave,
  onUploadAsset,
}: {
  colors: ReturnType<typeof getColors>;
  loading: boolean;
  saving: boolean;
  uploadingKind: OwnerBrandAssetKind | null;
  profile: OwnerBrandingProfile | null;
  draft: BrandDraft;
  setDraft: React.Dispatch<React.SetStateAction<BrandDraft>>;
  onSave: () => void;
  onUploadAsset: (kind: OwnerBrandAssetKind, source?: 'camera' | 'library') => void;
}) {
  const logoUrl = draft.logoUrl.trim();
  const coverUrl = draft.coverUrl.trim();
  const initials = (draft.displayName.trim() || profile?.ownerName || 'FC')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  const normalizedSlug = normalizeSlugDraft(draft.slug || draft.displayName);
  const publicPath = normalizedSlug ? `/coach/${normalizedSlug}` : profile?.publicUrlPath;
  const previewBio = draft.bio.trim() || (profile?.ownerType === 'club' ? 'Club player development' : 'Private coach programs');

  if (loading) {
    return (
      <View style={styles.tabContent} testID="playerCrm.brandTab">
        <View style={[styles.emptyPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.emptyInline, { color: colors.textSecondary }]}>Loading brand profile</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.tabContent} testID="playerCrm.brandTab">
      <View style={[styles.brandPreviewCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.brandPreviewCover, { backgroundColor: draft.primaryColor || colors.primary }]}>
          {coverUrl ? <Image source={{ uri: coverUrl }} style={styles.brandCoverImage} resizeMode="cover" /> : null}
        </View>
        <View style={styles.brandPreviewBody}>
          <View style={[styles.brandLogoFrame, { backgroundColor: colors.background, borderColor: colors.card }]}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.brandLogoImage} resizeMode="cover" />
            ) : (
              <Text style={[styles.brandLogoText, { color: draft.primaryColor || colors.primary }]}>{initials || 'FC'}</Text>
            )}
          </View>
          <Text style={[styles.brandPreviewTitle, { color: colors.text }]} numberOfLines={2}>
            {draft.displayName.trim() || profile?.ownerName || 'Coach brand'}
          </Text>
          <Text style={[styles.brandPreviewMeta, { color: colors.textSecondary }]} numberOfLines={3}>
            {previewBio}
          </Text>
          <View style={styles.brandColorRow}>
            <View style={[styles.brandColorChip, { backgroundColor: draft.primaryColor || DEFAULT_BRAND_COLORS.primary }]} />
            <View style={[styles.brandColorChip, { backgroundColor: draft.accentColor || DEFAULT_BRAND_COLORS.accent }]} />
            <Text style={[styles.brandPublicPath, { color: colors.textSecondary }]} numberOfLines={1}>
              {publicPath ?? '/coach/...'}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.formPanel, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.formHeaderRow}>
          <Text style={[styles.formTitle, { color: colors.text }]}>Brand</Text>
          <View style={[styles.statusBadge, { backgroundColor: draft.isPublic ? '#16a34a22' : `${colors.textSecondary}22` }]}>
            <Text style={[styles.statusBadgeText, { color: draft.isPublic ? '#16a34a' : colors.textSecondary }]}>
              {draft.isPublic ? 'Public' : 'Private'}
            </Text>
          </View>
        </View>

        <View style={styles.brandAssetActions}>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => onUploadAsset('logo')}
            disabled={Boolean(uploadingKind)}
            activeOpacity={0.75}
            testID="playerCrm.brand.uploadLogo"
          >
            {uploadingKind === 'logo' ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <>
                <IconSymbol ios_icon_name="photo.fill" android_material_icon_name="image" size={18} color={colors.primary} />
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Logo</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border, backgroundColor: colors.background }]}
            onPress={() => onUploadAsset('cover')}
            disabled={Boolean(uploadingKind)}
            activeOpacity={0.75}
            testID="playerCrm.brand.uploadCover"
          >
            {uploadingKind === 'cover' ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <>
                <IconSymbol ios_icon_name="rectangle.fill" android_material_icon_name="wallpaper" size={18} color={colors.primary} />
                <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Cover</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <LabeledInput
          label="Display name"
          colors={colors}
          value={draft.displayName}
          onChangeText={(value) => setDraft((current) => ({ ...current, displayName: value }))}
          autoCapitalize="words"
          testID="playerCrm.brand.displayName"
        />
        <LabeledInput
          label="Public slug"
          colors={colors}
          value={draft.slug}
          onChangeText={(value) => setDraft((current) => ({ ...current, slug: normalizeSlugDraft(value) }))}
          autoCapitalize="none"
          testID="playerCrm.brand.slug"
        />
        <LabeledInput
          label="Bio"
          colors={colors}
          value={draft.bio}
          onChangeText={(value) => setDraft((current) => ({ ...current, bio: value }))}
          multiline
          textAlignVertical="top"
          style={styles.textArea}
          testID="playerCrm.brand.bio"
        />
        <LabeledInput
          label="Primary color"
          colors={colors}
          value={draft.primaryColor}
          onChangeText={(value) => setDraft((current) => ({ ...current, primaryColor: value }))}
          autoCapitalize="none"
          style={styles.colorInput}
          testID="playerCrm.brand.primaryColor"
        />
        <LabeledInput
          label="Accent color"
          colors={colors}
          value={draft.accentColor}
          onChangeText={(value) => setDraft((current) => ({ ...current, accentColor: value }))}
          autoCapitalize="none"
          style={styles.colorInput}
          testID="playerCrm.brand.accentColor"
        />
        <LabeledInput
          label="Contact email"
          colors={colors}
          value={draft.contactEmail}
          onChangeText={(value) => setDraft((current) => ({ ...current, contactEmail: value }))}
          autoCapitalize="none"
          keyboardType="email-address"
          testID="playerCrm.brand.contactEmail"
        />
        <LabeledInput
          label="Contact phone"
          colors={colors}
          value={draft.contactPhone}
          onChangeText={(value) => setDraft((current) => ({ ...current, contactPhone: value }))}
          keyboardType="phone-pad"
          testID="playerCrm.brand.contactPhone"
        />
        <LabeledInput
          label="Website"
          colors={colors}
          value={draft.websiteUrl}
          onChangeText={(value) => setDraft((current) => ({ ...current, websiteUrl: value }))}
          autoCapitalize="none"
          keyboardType="url"
          testID="playerCrm.brand.website"
        />
        <LabeledInput
          label="Social links"
          colors={colors}
          value={draft.socialLinksText}
          onChangeText={(value) => setDraft((current) => ({ ...current, socialLinksText: value }))}
          multiline
          textAlignVertical="top"
          style={styles.textArea}
          testID="playerCrm.brand.socialLinks"
        />

        <ToggleRow
          label="Public landing"
          value={draft.isPublic}
          onValueChange={(value) => setDraft((current) => ({ ...current, isPublic: value }))}
          colors={colors}
        />

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.primary }, saving && styles.disabledButton]}
          onPress={onSave}
          disabled={saving}
          activeOpacity={0.8}
          testID="playerCrm.brand.save"
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={18} color="#fff" />
              <Text style={styles.primaryButtonText}>Save brand</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    gap: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  centerText: {
    fontSize: 15,
    fontWeight: '600',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  titleGroup: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
  },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizontalChips: {
    gap: 8,
    paddingRight: 18,
  },
  workspaceChip: {
    maxWidth: 220,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
  },
  workspaceChipText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ownerBand: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  ownerBandTitle: {
    gap: 2,
  },
  ownerName: {
    fontSize: 19,
    fontWeight: '800',
  },
  ownerType: {
    fontSize: 13,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8E8E93',
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '800',
  },
  tabContent: {
    gap: 12,
  },
  searchBox: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    minHeight: 48,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  sectionCount: {
    fontSize: 14,
    fontWeight: '700',
  },
  playerCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  playerCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '900',
  },
  playerMain: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '800',
  },
  playerMeta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  statusBadge: {
    borderRadius: 13,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  cardChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  smallTag: {
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '100%',
  },
  tagDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  smallTagText: {
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 120,
  },
  playerSignals: {
    flexDirection: 'row',
    gap: 14,
  },
  signal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  signalText: {
    fontSize: 12,
    fontWeight: '700',
  },
  latestNote: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  playerCardActions: {
    flexDirection: 'row',
    gap: 7,
  },
  playerCardAction: {
    flex: 1,
    minWidth: 0,
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  playerCardActionText: {
    minWidth: 0,
    fontSize: 11,
    fontWeight: '800',
  },
  emptyPanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  formPanel: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  formHeaderRow: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  brandPreviewCard: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  brandPreviewCover: {
    width: '100%',
    height: 132,
  },
  brandCoverImage: {
    width: '100%',
    height: '100%',
  },
  brandPreviewBody: {
    padding: 14,
    paddingTop: 0,
    gap: 8,
  },
  brandLogoFrame: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    marginTop: -36,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  brandLogoImage: {
    width: '100%',
    height: '100%',
  },
  brandLogoText: {
    fontSize: 22,
    fontWeight: '900',
  },
  brandPreviewTitle: {
    fontSize: 21,
    fontWeight: '900',
  },
  brandPreviewMeta: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  brandColorRow: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandColorChip: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  brandPublicPath: {
    flex: 1,
    fontSize: 12,
    fontWeight: '800',
  },
  brandAssetActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  textArea: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    fontWeight: '600',
  },
  colorInput: {
    fontWeight: '800',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.55,
  },
  swatchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  swatch: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
  },
  tagRow: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowStart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tagRowText: {
    fontSize: 15,
    fontWeight: '800',
  },
  smallIconButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScreen: {
    flex: 1,
  },
  modalHeader: {
    minHeight: 78,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalIconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    padding: 16,
    gap: 14,
  },
  detailHero: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  toggleRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyInline: {
    fontSize: 13,
    fontWeight: '700',
  },
  noteCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  noteText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
  noteFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteDate: {
    fontSize: 12,
    fontWeight: '700',
  },
  contactRow: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  contactName: {
    fontSize: 15,
    fontWeight: '800',
  },
  guardianStatusRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  guardianStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  guardianStatusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  guardianStatusMeta: {
    fontSize: 12,
    fontWeight: '700',
  },
  guardianActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryActionButton: {
    minHeight: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  timelineTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
});

export default PlayerCrmScreen;
