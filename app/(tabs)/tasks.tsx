import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  Image,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Switch,
  InteractionManager,
} from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { useFootball } from '@/contexts/FootballContext';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Task } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import SwipeVideoPlayer from '@/components/SwipeVideoPlayer';
import ContextConfirmationDialog from '@/components/ContextConfirmationDialog';
import { AdminContextWrapper } from '@/components/AdminContextWrapper';
import { TaskMediaListEditor } from '@/components/TaskMediaListEditor';
import { TrainerScopeFilter } from '@/components/TrainerScopeFilter';
import { taskService } from '@/services/taskService';
import { forceRefreshNotificationQueue } from '@/utils/notificationScheduler';
import { emitActivitiesRefreshRequested } from '@/utils/activityEvents';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { LinearGradient } from 'expo-linear-gradient';
import { getTaskModalVideoUrls } from '@/utils/taskModalContent';
import { pickAndUploadTaskMedia } from '@/utils/taskVideoUpload';
import {
  buildTaskMediaNamePayload,
  buildTaskVideoPayload,
  getTaskMediaType,
  getTaskMediaNameFromFileName,
  isTaskMediaUrl,
  mergeTaskMedia,
  normalizeTaskVideoUrls,
  normalizeTaskMediaNames,
  removeTaskMediaAt,
  replaceTaskMediaName,
} from '@/utils/taskVideos';
import { isDirectVideoUrl } from '@/utils/videoUrlParser';

// ✅ Robust import: undgå Hermes-crash hvis named export "colors" ikke findes
import * as CommonStyles from '@/styles/commonStyles';

const FALLBACK_COLORS = {
  primary: '#3B82F6',
  secondary: '#2563EB',
  accent: '#F59E0B',
  error: '#EF4444',
  highlight: '#E5E7EB',
  card: '#FFFFFF',
  background: '#F9FAFB',
  text: '#111827',
  textSecondary: '#6B7280',
};

const colors: any =
  (CommonStyles as any).colors ??
  (CommonStyles as any).default?.colors ??
  (CommonStyles as any).default ??
  FALLBACK_COLORS;

const normalizeReminderValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

function isValidVideoUrl(url?: string | null): boolean {
  return isTaskMediaUrl(String(url ?? ''));
}

function getVideoSourceLabel(url?: string | null): string {
  const normalizedUrl = String(url ?? '').toLowerCase();
  const mediaType = getTaskMediaType(url);
  if (mediaType === 'image') return normalizedUrl.endsWith('.png') ? 'PNG image' : 'Image';
  if (mediaType === 'pdf') return 'PDF';
  if (normalizedUrl.includes('instagram.com')) return 'Instagram';
  if (normalizedUrl.includes('vimeo.com')) return 'Vimeo';
  if (normalizedUrl.includes('youtu')) return 'YouTube';
  if (normalizedUrl.includes('/storage/v1/object/public/') || isDirectVideoUrl(normalizedUrl)) return 'Uploaded video';
  return 'Video';
}

function getYouTubeThumbnail(url: string): string | null {
  try {
    if (url.includes('youtu.be/')) {
      return `https://img.youtube.com/vi/${url.split('youtu.be/')[1].split('?')[0]}/hqdefault.jpg`;
    }

    if (url.includes('watch?v=')) {
      return `https://img.youtube.com/vi/${url.split('watch?v=')[1].split('&')[0]}/hqdefault.jpg`;
    }

    if (url.includes('/shorts/')) {
      return `https://img.youtube.com/vi/${url.split('/shorts/')[1].split('?')[0]}/hqdefault.jpg`;
    }

    if (url.includes('/embed/')) {
      return `https://img.youtube.com/vi/${url.split('/embed/')[1].split('?')[0]}/hqdefault.jpg`;
    }

    return null;
  } catch {
    return null;
  }
}

const FOOTBALLCOACH_INSPIRATION = 'FootballCoach Inspiration';

const withAlpha = (color: string, alpha: number): string => {
  const clamped = Math.max(0, Math.min(1, alpha));
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${clamped})`;
  }
  return color;
};

const sanitizeTestIdSegment = (value: unknown): string =>
  String(value ?? 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';

const isFootballCoachSource = (sourceFolder: string) =>
  sourceFolder.toLowerCase() === FOOTBALLCOACH_INSPIRATION.toLowerCase();

const parseTrainerNameFromSource = (sourceFolder: string): string | null => {
  const normalized = sourceFolder.trim();
  const lower = normalized.toLowerCase();
  if (!lower.startsWith('from coach') && !lower.startsWith('fra træner')) return null;
  const [, rawName] = normalized.split(':');
  const trainerName = String(rawName ?? '').trim();
  return trainerName || null;
};

const getTaskOwnerId = (task: any): string | null => {
  const value = task?.userId ?? task?.user_id ?? task?.ownerId ?? null;
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const getTaskTrainerName = (task: any): string => {
  const fromTask = String(task?.trainerName ?? task?.trainer_name ?? '').trim();
  if (fromTask) return fromTask;
  const fromSource = parseTrainerNameFromSource(getTaskSourceFolder(task));
  return fromSource || 'Unknown coach';
};

type FolderType = 'personal' | 'trainer' | 'footballcoach' | 'source';

interface FolderItem {
  id: string;
  name: string;
  type: FolderType;
  icon: string;
  androidIcon: string;
  testID: string;
  tasks: Task[];
}

type PendingAction =
  | { type: 'create' | 'edit'; data: { task: Task; videoUrls: string[]; isCreating: boolean } }
  | { type: 'delete'; data: { taskId: string } };

const DELETE_TEMPLATE_CONFIRM_TEXT = 'DELETE';
const DELETE_TEMPLATE_WARNING_TEXT =
  'Deleting this task template will delete all previous and future tasks on related activities. If you want to keep history, select Archive instead.';

// ✅ læs source-folder robust (snake_case eller camelCase)
function getTaskSourceFolder(task: any): string {
  return String(task?.source_folder ?? task?.sourceFolder ?? '').trim();
}

// ✅ simple icon mapping for source folders
function getIconsForFolderName(name: string): { icon: string; androidIcon: string } {
  const n = name.toLowerCase();

  if (n.startsWith('footballcoach inspiration')) {
    return { icon: 'star.fill', androidIcon: 'stars' };
  }
  if (n.startsWith('from coach:') || n.startsWith('fra træner:')) {
    return { icon: 'folder.fill', androidIcon: 'folder' };
  }
  if (n.includes('personligt') || n.includes('personlige')) {
    return { icon: 'folder.fill', androidIcon: 'folder' };
  }
  return { icon: 'folder.fill', androidIcon: 'folder' };
}

// Pure function to organize tasks into folders
function organizeFolders(
  allTasks: Task[],
  options: { adminMode: string; userRole: string | null; currentUserId: string | null },
): FolderItem[] {
  const personalTasks: Task[] = [];
  const trainerFolders = new Map<string, FolderItem>();
  const footballCoachTasks: Task[] = [];
  const isAdminContext = options.adminMode !== 'self';
  const isPlayerSelf = options.adminMode === 'self' && options.userRole === 'player';

  allTasks.forEach((task: any) => {
    const sfRaw = getTaskSourceFolder(task);
    const sf = sfRaw.toLowerCase();
    const ownerId = getTaskOwnerId(task);

    if (isFootballCoachSource(sfRaw)) {
      footballCoachTasks.push(task);
      return;
    }

    if (isAdminContext) {
      personalTasks.push(task);
      return;
    }

    if (isPlayerSelf) {
      const isTrainerTask =
        sf === 'trainer' ||
        sf === 'from coach' ||
        sf.startsWith('from coach:') ||
        sf === 'fra træner' ||
        sf.startsWith('fra træner:') ||
        (!!ownerId && !!options.currentUserId && ownerId !== options.currentUserId);

      if (isTrainerTask) {
        const trainerName = getTaskTrainerName(task);
        const stableId = ownerId || trainerName;
        const folderId = `trainer.${sanitizeTestIdSegment(stableId)}`;
        if (!trainerFolders.has(folderId)) {
          const icons = getIconsForFolderName(`From coach: ${trainerName}`);
          trainerFolders.set(folderId, {
            id: folderId,
            name: `From coach: ${trainerName}`,
            type: 'trainer',
            icon: icons.icon,
            androidIcon: icons.androidIcon,
            testID: `tasks.folder.trainer.${sanitizeTestIdSegment(stableId)}`,
            tasks: [],
          });
        }
        trainerFolders.get(folderId)!.tasks.push(task);
        return;
      }

      personalTasks.push(task);
      return;
    }

    personalTasks.push(task);
  });

  const folders: FolderItem[] = [];

  if (personalTasks.length) {
    const icons = getIconsForFolderName('Personal tasks');
    folders.push({
      id: 'personal',
      name: 'Personal tasks',
      type: 'personal',
      icon: icons.icon,
      androidIcon: icons.androidIcon,
      testID: 'tasks.folder.personal',
      tasks: personalTasks,
    });
  }

  folders.push(...Array.from(trainerFolders.values()).sort((a, b) => a.name.localeCompare(b.name)));

  if (footballCoachTasks.length) {
    const icons = getIconsForFolderName(FOOTBALLCOACH_INSPIRATION);
    folders.push({
      id: 'inspiration',
      name: FOOTBALLCOACH_INSPIRATION,
      type: 'footballcoach',
      icon: icons.icon,
      androidIcon: icons.androidIcon,
      testID: 'tasks.folder.inspiration',
      tasks: footballCoachTasks,
    });
  }

  return folders;
}

function taskMatchesAdminScope(
  task: any,
  adminMode: string,
  adminTargetType: string | null,
  adminTargetId: string | null,
): boolean {
  if (adminMode === 'self' || !adminTargetId) return true;
  if (adminTargetType === 'player') {
    return String(task?.playerId ?? task?.player_id ?? '').trim() === adminTargetId;
  }
  if (adminTargetType === 'team') {
    return String(task?.teamId ?? task?.team_id ?? '').trim() === adminTargetId;
  }
  return true;
}

// Memoized TaskCard component to prevent unnecessary re-renders
export const TaskCard = React.memo(
  ({
    task,
    isDark,
    onPress,
    onDuplicate,
    onArchive = () => {},
    onDelete,
    onVideoPress,
    getCategoryItems,
    isArchived = false,
  }: {
    task: Task;
    isDark: boolean;
    onPress: () => void;
    onDuplicate: () => void;
    onArchive?: () => void;
    onDelete: () => void;
    onVideoPress: (urls: string[], initialIndex?: number) => void;
    getCategoryItems: (categoryIds: string[]) => any[];
    isArchived?: boolean;
  }) => {
    const videoUrls = getTaskModalVideoUrls(task);
    const videoUrl = videoUrls[0] ?? null;
    const ytThumb = typeof videoUrl === 'string' && videoUrl.includes('youtu') ? getYouTubeThumbnail(videoUrl) : null;
    const primaryMediaType = getTaskMediaType(videoUrl);
    const taskId = String((task as any)?.id ?? '');
    const categoryItems = getCategoryItems((((task as any)?.categoryIds ?? []) as string[]).filter(Boolean));
    const description = String((task as any)?.description ?? '').trim();
    const hasMultipleVideos = videoUrls.length > 1;
    const autoAddEnabled = !!((task as any)?.autoAddToActivities ?? (task as any)?.auto_add_to_activities);

    return (
      <TouchableOpacity
        style={[
          styles.taskCard,
          styles.taskCardShadow,
          { backgroundColor: isDark ? '#2a2a2a' : colors.card },
        ]}
        onPress={onPress}
        testID={`tasks.taskCard.${taskId}`}
        activeOpacity={0.9}
      >
        <View style={styles.taskHeader}>
          <View style={styles.taskHeaderLeft}>
            <View style={styles.taskIconWrap}>
              <IconSymbol ios_icon_name="checklist" android_material_icon_name="checklist" size={18} color={colors.primary} />
            </View>
            <Text style={[styles.taskTitle, { color: isDark ? '#e3e3e3' : colors.text }]} numberOfLines={2}>
              {String((task as any)?.title ?? '')}
            </Text>
          </View>

          <View style={styles.taskActions}>
            <TouchableOpacity onPress={onDuplicate} style={styles.actionButton} testID={`tasks.task.duplicate.${taskId}`}>
              <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content_copy" size={20} color={colors.secondary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onPress} style={styles.actionButton}>
              <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onArchive}
              style={styles.actionButton}
              testID={`tasks.template.archiveButton.${taskId}`}
            >
              <IconSymbol
                ios_icon_name={isArchived ? 'arrow.uturn.backward.circle' : 'archivebox'}
                android_material_icon_name={isArchived ? 'unarchive' : 'archive'}
                size={20}
                color={colors.primary}
              />
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={styles.actionButton} testID={`tasks.task.delete.${taskId}`}>
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        {description ? (
          <Text
            style={[styles.taskDescription, styles.taskDescriptionIndented, { color: isDark ? '#b8b8b8' : colors.textSecondary }]}
            numberOfLines={2}
          >
            {description}
          </Text>
        ) : null}

        {videoUrl && isValidVideoUrl(videoUrl) && (
          <TouchableOpacity style={styles.videoThumbnailWrapper} onPress={() => onVideoPress(videoUrls, 0)} activeOpacity={0.85}>
            {ytThumb ? (
              <Image source={{ uri: ytThumb }} style={styles.videoThumbnail} resizeMode="cover" />
            ) : primaryMediaType === 'image' ? (
              <Image source={{ uri: videoUrl }} style={styles.videoThumbnail} resizeMode="cover" />
            ) : (
              <View style={styles.videoThumbnailFallback}>
                {primaryMediaType === 'pdf' ? (
                  <IconSymbol ios_icon_name="doc.fill" android_material_icon_name="picture_as_pdf" size={36} color="#fff" />
                ) : null}
                <Text style={styles.videoThumbnailFallbackLabel}>{getVideoSourceLabel(videoUrl)}</Text>
              </View>
            )}
            <View style={styles.videoOverlay}>
              <IconSymbol
                ios_icon_name={primaryMediaType === 'video' ? 'play.circle.fill' : primaryMediaType === 'image' ? 'photo.fill' : 'doc.fill'}
                android_material_icon_name={primaryMediaType === 'video' ? 'play_circle' : primaryMediaType === 'image' ? 'image' : 'picture_as_pdf'}
                size={56}
                color="#fff"
              />
            </View>
            {hasMultipleVideos ? (
              <View style={styles.videoSwipeBadge}>
                <Text style={styles.videoSwipeBadgeText}>{videoUrls.length} files - swipe</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        )}

        {(task as any)?.reminder != null && String((task as any).reminder).length > 0 && (
          <View style={styles.reminderBadge}>
            <IconSymbol ios_icon_name="bell.fill" android_material_icon_name="notifications" size={14} color={colors.accent} />
            <Text style={[styles.reminderText, { color: colors.accent }]}>{String((task as any).reminder)} min before</Text>
          </View>
        )}

        <View
          style={[
            styles.autoAddBadge,
            {
              backgroundColor: autoAddEnabled
                ? withAlpha(colors.primary, 0.12)
                : withAlpha(colors.textSecondary ?? '#6B7280', 0.12),
              borderColor: autoAddEnabled ? colors.primary : colors.textSecondary ?? '#6B7280',
            },
          ]}
          testID={`tasks.template.autoAddBadge.${sanitizeTestIdSegment(taskId)}`}
        >
          <IconSymbol
            ios_icon_name={autoAddEnabled ? 'checkmark.circle.fill' : 'minus.circle'}
            android_material_icon_name={autoAddEnabled ? 'check_circle' : 'remove_circle_outline'}
            size={15}
            color={autoAddEnabled ? colors.primary : colors.textSecondary ?? '#6B7280'}
          />
          <Text
            style={[
              styles.autoAddBadgeText,
              { color: autoAddEnabled ? colors.primary : colors.textSecondary ?? '#6B7280' },
            ]}
          >
            Auto-add to activities: {autoAddEnabled ? 'On' : 'Off'}
          </Text>
        </View>

        {categoryItems.length ? (
          <View style={styles.categoriesBlock}>
            <View style={styles.categoriesLabelRow}>
              <IconSymbol ios_icon_name="tag.fill" android_material_icon_name="label" size={14} color={isDark ? '#999' : colors.textSecondary} />
              <Text style={[styles.categoriesLabelText, { color: isDark ? '#999' : colors.textSecondary }]}>Categories</Text>
            </View>
            <View style={styles.taskCategoryBadges}>
              {categoryItems.map((category: any) => {
                const catId = String(category.id);
                const catColor = category.color || colors.primary;
                return (
                  <View
                    key={catId}
                    style={[
                      styles.taskCategoryBadge,
                      {
                        backgroundColor: withAlpha(catColor, 0.14),
                        borderColor: catColor,
                      },
                    ]}
                    testID={`tasks.taskCategoryBadge.${sanitizeTestIdSegment(taskId)}.${sanitizeTestIdSegment(catId)}`}
                  >
                    {String(category.emoji ?? '').trim() ? (
                      <Text style={styles.taskCategoryBadgeEmoji}>{String(category.emoji ?? '').trim()}</Text>
                    ) : null}
                    <Text style={[styles.taskCategoryBadgeText, { color: catColor }]} numberOfLines={1}>
                      {String(category.name ?? '')}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </TouchableOpacity>
    );
  },
);

// Memoized FolderItem component
const FolderItemComponent = React.memo(
  ({
    folder,
    isExpanded,
    onToggle,
    renderTaskCard,
    textColor,
    textSecondaryColor,
    cardBgColor,
  }: {
    folder: FolderItem;
    isExpanded: boolean;
    onToggle: () => void;
    renderTaskCard: (task: Task) => React.ReactElement | null;
    textColor: string;
    textSecondaryColor: string;
    cardBgColor: string;
  }) => {
    return (
      <View style={styles.folderWrap}>
        <TouchableOpacity
          style={[styles.folderHeader, { backgroundColor: cardBgColor }]}
          onPress={onToggle}
          testID={folder.testID}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityState={{ selected: isExpanded }}
        >
          <View style={styles.folderHeaderLeft}>
            <View style={[styles.folderIconWrap, { backgroundColor: withAlpha(colors.primary, 0.12) }]}>
              <IconSymbol ios_icon_name={folder.icon} android_material_icon_name={folder.androidIcon} size={18} color={colors.primary} />
            </View>
            <View style={styles.folderTextWrap}>
              <Text style={[styles.folderName, { color: textColor }]} numberOfLines={1}>{folder.name}</Text>
              <Text style={[styles.folderSubtitle, { color: textSecondaryColor }]} numberOfLines={1}>
                {folder.tasks.length} assignments
              </Text>
            </View>
            <View style={[styles.countBadge, { backgroundColor: isExpanded ? colors.primary : withAlpha(colors.primary, 0.12) }]}>
              <Text style={[styles.countBadgeText, { color: isExpanded ? '#fff' : colors.primary }]}>{folder.tasks.length}</Text>
            </View>
          </View>
          <IconSymbol
            ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
            android_material_icon_name={isExpanded ? 'expand_more' : 'chevron_right'}
            size={20}
            color={textSecondaryColor}
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={styles.folderContent}>
            <FlatList
              data={folder.tasks}
              renderItem={({ item }) => renderTaskCard(item)}
              keyExtractor={(item) => String((item as any).id)}
              scrollEnabled={false}
              removeClippedSubviews={Platform.OS !== 'web'}
              initialNumToRender={5}
              maxToRenderPerBatch={5}
              windowSize={5}
            />
          </View>
        )}
      </View>
    );
  },
);

type TaskLibrarySectionProps = {
  embedded?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

export function TaskLibrarySection({ embedded = false, contentContainerStyle }: TaskLibrarySectionProps = {}) {
  const footballData = useFootball() as any;
  const adminData = useAdmin() as any;
  const { user } = useAuthSession();
  const roleInfo = useUserRole() as any;
  const userRole = typeof roleInfo?.userRole === 'string' ? roleInfo.userRole : null;
  const teamPlayerData = useTeamPlayer() as any;

  const contextTasks = footballData?.tasks;
  const tasks = useMemo(() => (contextTasks ?? []) as Task[], [contextTasks]);

  const contextCategories = footballData?.categories;
  const categories = useMemo(() => (contextCategories ?? []) as any[], [contextCategories]);

  const duplicateTask = footballData?.duplicateTask as ((taskId: string) => any) | undefined;
  const deleteTask = footballData?.deleteTask as ((taskId: string) => any) | undefined;
  const refreshAll = footballData?.refreshAll as (() => Promise<any>) | undefined;
  const refreshData = footballData?.refreshData as (() => Promise<any>) | undefined;
  const ensureTemplateDataLoaded = footballData?.ensureTemplateDataLoaded as
    | ((force?: boolean) => Promise<void>)
    | undefined;
  const updateTask = footballData?.updateTask as ((taskId: string, data: any) => Promise<any>) | undefined;
  const isLoading = !!footballData?.isLoading;

  const adminMode = adminData?.adminMode ?? 'self';
  const adminTargetType = adminData?.adminTargetType ?? adminData?.adminTarget?.type ?? null;
  const adminTargetId = adminData?.adminTargetId ?? adminData?.adminTarget?.id ?? null;

  const rawSelectedContext = teamPlayerData?.selectedContext ?? adminData?.selectedContext;
  const contextName = adminData?.contextName;
  const selectedContext = useMemo(
    () =>
      rawSelectedContext ??
      {
        type: adminTargetType ?? 'player',
        id: adminTargetId,
        name: contextName ?? '',
      },
    [rawSelectedContext, adminTargetId, adminTargetType, contextName],
  );

  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const REMINDER_DELAY_OPTIONS: { label: string; value: number }[] = [
    { label: '0', value: 0 },
    { label: '15', value: 15 },
    { label: '30', value: 30 },
    { label: '60', value: 60 },
    { label: '120', value: 120 },
  ];

  const listRef = useRef<FlatList<FolderItem> | null>(null);

  // ✅ VIGTIGT: alle state hooks før callbacks/memos der bruger dem
  const [refreshing, setRefreshing] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilterOpen, setCategoryFilterOpen] = useState(false);
  const [selectedCategoryFilterId, setSelectedCategoryFilterId] = useState<string | null>(null);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<{ title?: string; videoUrl?: string }>({});
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [isMediaDragging, setIsMediaDragging] = useState(false);

  const [videoUrls, setVideoUrls] = useState<string[]>([]);
  const [videoUrlInput, setVideoUrlInput] = useState('');
  const [mediaNames, setMediaNames] = useState<string[]>([]);
  const [mediaNameInput, setMediaNameInput] = useState('');

  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedVideoUrls, setSelectedVideoUrls] = useState<string[]>([]);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [templateView, setTemplateView] = useState<'active' | 'archived'>('active');
  const [deleteCandidate, setDeleteCandidate] = useState<{ taskId: string; title: string } | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

  const safeTasks = useMemo(() => (tasks || []).filter(Boolean) as Task[], [tasks]);
  const scopedTasks = useMemo(
    () => safeTasks.filter((task: any) => taskMatchesAdminScope(task, adminMode, adminTargetType, adminTargetId)),
    [adminMode, adminTargetId, adminTargetType, safeTasks],
  );

  const uniqueCategories = useMemo(() => {
    const map = new Map<string, any>();
    (categories ?? []).forEach((c: any) => {
      if (c?.id) map.set(String(c.id), c);
    });
    return Array.from(map.values());
  }, [categories]);

  const selectedCategoryFilter = useMemo(() => {
    if (!selectedCategoryFilterId) return null;
    return uniqueCategories.find((c: any) => String(c.id) === selectedCategoryFilterId) ?? null;
  }, [selectedCategoryFilterId, uniqueCategories]);

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedTasks.filter((t: any) => {
      const title = String(t?.title ?? '').toLowerCase();
      const desc = String(t?.description ?? '').toLowerCase();
      const categoryIds = (((t as any)?.categoryIds ?? []) as string[]).map(String);
      const matchesSearch = !q || title.includes(q) || desc.includes(q);
      const matchesCategory = !selectedCategoryFilterId || categoryIds.includes(selectedCategoryFilterId);
      return matchesSearch && matchesCategory;
    });
  }, [scopedTasks, searchQuery, selectedCategoryFilterId]);

  const templateTasks = useMemo(
    () =>
      filteredTasks.filter((t: any) => {
        if (!t?.isTemplate) return false;
        const sourceFolder = getTaskSourceFolder(t).toLowerCase();
        if (sourceFolder === 'activity_local_task') return false;
        const isArchived = typeof t?.archivedAt === 'string' && t.archivedAt.trim().length > 0;
        return templateView === 'active' ? !isArchived : isArchived;
      }),
    [filteredTasks, templateView],
  );
  const folders = useMemo(
    () => organizeFolders(templateTasks, { adminMode, userRole, currentUserId: user?.id ?? null }),
    [templateTasks, adminMode, userRole, user?.id],
  );

  useFocusEffect(
    useCallback(() => {
      const interaction = InteractionManager.runAfterInteractions(() => {
        void ensureTemplateDataLoaded?.().catch((error: unknown) => {
          console.error('[Tasks] Failed to load template data:', error);
        });
      });
      return () => {
        interaction.cancel();
      };
    }, [ensureTemplateDataLoaded])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData?.();
    } catch (error) {
      console.error('Error refreshing tasks data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const toggleCategoryFilterOpen = useCallback(() => {
    setCategoryFilterOpen(prev => !prev);
  }, []);

  const selectCategoryFilter = useCallback((categoryId: string | null) => {
    setSelectedCategoryFilterId(categoryId);
    setCategoryFilterOpen(false);
  }, []);

  const openTaskModal = useCallback((task: Task | null, creating: boolean = false) => {
    const normalizedTask = task
      ? ({
          ...(task as any),
          reminder: normalizeReminderValue((task as any).reminder),
          autoAddToActivities: !!((task as any).autoAddToActivities ?? (task as any).auto_add_to_activities),
        } as Task)
      : task;

    setSelectedTask(normalizedTask);
    setIsCreating(creating);
    setIsSaving(false);
    setFormErrors({});
    const taskMediaUrls = getTaskModalVideoUrls(task);
    setVideoUrls(taskMediaUrls);
    setMediaNames(normalizeTaskMediaNames((task as any)?.mediaNames ?? (task as any)?.media_names, taskMediaUrls));
    setVideoUrlInput('');
    setMediaNameInput('');
    setIsModalVisible(true);
  }, []);

  const closeTaskModal = useCallback(() => {
    setSelectedTask(null);
    setIsCreating(false);
    setIsModalVisible(false);
    setFormErrors({});
    setVideoUrls([]);
    setVideoUrlInput('');
    setMediaNames([]);
    setMediaNameInput('');
    setIsSaving(false);
    setIsUploadingVideo(false);
    setIsMediaDragging(false);
  }, []);

  const validateTaskForm = useCallback(() => {
    const nextErrors: { title?: string; videoUrl?: string } = {};
    if (!String((selectedTask as any)?.title ?? '').trim()) {
      nextErrors.title = 'Title is required.';
    }
    if (videoUrlInput.trim() && !isValidVideoUrl(videoUrlInput)) {
      nextErrors.videoUrl = 'Invalid media. Use a video, image, or PDF link.';
    }
    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [selectedTask, videoUrlInput]);

  const updateTaskTitle = useCallback((text: string) => {
    setFormErrors(prev => ({ ...prev, title: undefined }));
    setSelectedTask(prev => (prev ? ({ ...(prev as any), title: text } as Task) : prev));
  }, []);

  const updateTaskDescription = useCallback((text: string) => {
    setSelectedTask(prev => (prev ? ({ ...(prev as any), description: text } as Task) : prev));
  }, []);

  const updateVideoUrlInput = useCallback((text: string) => {
    setFormErrors(prev => ({ ...prev, videoUrl: undefined }));
    setVideoUrlInput(text);
  }, []);

  const executeSaveTask = useCallback(async () => {
    if (!selectedTask) return;

    if (isUploadingVideo) {
      Alert.alert('Please wait', 'The file is still uploading. Please try again in a moment.');
      return;
    }

    if (videoUrlInput.trim() && !isValidVideoUrl(videoUrlInput)) {
      Alert.alert('Error', 'Invalid media. Use a video, image, or PDF link.');
      return;
    }

    const normalizedReminder = normalizeReminderValue((selectedTask as any).reminder);
    const successMessage = isCreating ? 'Task template created' : 'Task template updated';
    const mediaForSave = videoUrlInput.trim()
      ? mergeTaskMedia(videoUrls, mediaNames, videoUrlInput, mediaNameInput)
      : { urls: videoUrls, names: normalizeTaskMediaNames(mediaNames, videoUrls) };
    const videoPayload = buildTaskVideoPayload(mediaForSave.urls);
    const mediaNamePayload = buildTaskMediaNamePayload(mediaForSave.names, videoPayload.videoUrls);
    setIsSaving(true);

    try {
      const categoryIds = Array.from(new Set((((selectedTask as any)?.categoryIds ?? []) as string[]).filter(Boolean)));
      const taskToSave = {
        ...selectedTask,
        title: String((selectedTask as any).title ?? '').trim(),
        reminder: normalizedReminder,
        subtasks: [],
        videoUrl: videoPayload.videoUrl,
        videoUrls: videoPayload.videoUrls,
        video_url: videoPayload.video_url,
        video_urls: videoPayload.video_urls,
        mediaNames: mediaNamePayload.mediaNames,
        media_names: mediaNamePayload.media_names,
        categoryIds,
        afterTrainingEnabled: selectedTask.afterTrainingEnabled ?? false,
        afterTrainingDelayMinutes: selectedTask.afterTrainingEnabled ? (selectedTask.afterTrainingDelayMinutes ?? 0) : null,
        afterTrainingFeedbackEnableScore: selectedTask.afterTrainingFeedbackEnableScore ?? true,
        afterTrainingFeedbackScoreExplanation: selectedTask.afterTrainingFeedbackScoreExplanation ?? null,
        afterTrainingFeedbackEnableNote: selectedTask.afterTrainingFeedbackEnableNote ?? true,
        taskDurationEnabled: false,
        taskDurationMinutes: null,
        afterTrainingFeedbackEnableIntensity: !!selectedTask.afterTrainingEnabled,
        autoAddToActivities: !!(selectedTask as any).autoAddToActivities,
        auto_add_to_activities: !!(selectedTask as any).autoAddToActivities,
      } as Task;

      if (isCreating) {
        await taskService.createTask({
          task: taskToSave,
          subtasks: [],
          adminMode,
          adminTargetType,
          adminTargetId,
        });
      } else {
        if (!updateTask) throw new Error('updateTask is not available in FootballContext');

        const taskToSave = {
          ...selectedTask,
          title: String((selectedTask as any).title ?? '').trim(),
          reminder: normalizedReminder,
          subtasks: [],
          videoUrl: videoPayload.videoUrl,
          videoUrls: videoPayload.videoUrls,
          video_url: videoPayload.video_url,
          video_urls: videoPayload.video_urls,
          mediaNames: mediaNamePayload.mediaNames,
          media_names: mediaNamePayload.media_names,
          categoryIds,
          afterTrainingEnabled: selectedTask.afterTrainingEnabled ?? false,
          afterTrainingDelayMinutes: selectedTask.afterTrainingEnabled ? (selectedTask.afterTrainingDelayMinutes ?? 0) : null,
          taskDurationEnabled: false,
          taskDurationMinutes: null,
          afterTrainingFeedbackEnableIntensity: !!selectedTask.afterTrainingEnabled,
          autoAddToActivities: !!(selectedTask as any).autoAddToActivities,
          auto_add_to_activities: !!(selectedTask as any).autoAddToActivities,
        };

        await updateTask(String((selectedTask as any).id), taskToSave);
      }
      closeTaskModal();

      if (!refreshAll) {
        throw new Error('refreshAll is not available');
      }

      await refreshAll();
      emitActivitiesRefreshRequested({ reason: 'task_template_saved_from_tasks_screen' });
      Alert.alert('Success', successMessage);
    } catch (error: any) {
      Alert.alert('Error', 'Failed to save task: ' + (error?.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  }, [selectedTask, isCreating, adminMode, adminTargetId, adminTargetType, videoUrls, videoUrlInput, mediaNames, mediaNameInput, isUploadingVideo, updateTask, refreshAll, closeTaskModal]);

  const handleSaveTask = useCallback(async () => {
    if (!selectedTask) return;
    if (!validateTaskForm()) return;

    if (adminMode !== 'self' && selectedContext?.type) {
      setPendingAction({
        type: isCreating ? 'create' : 'edit',
        data: { task: selectedTask, videoUrls: buildTaskVideoPayload([...videoUrls, videoUrlInput]).videoUrls, isCreating },
      });
      setShowConfirmDialog(true);
      return;
    }

    await executeSaveTask();
  }, [selectedTask, adminMode, selectedContext, isCreating, videoUrls, videoUrlInput, executeSaveTask, validateTaskForm]);

  const handleArchiveTask = useCallback(
    async (task: Task) => {
      const taskId = String((task as any)?.id ?? '').trim();
      if (!taskId) return;

      const isArchived = typeof (task as any)?.archivedAt === 'string' && String((task as any).archivedAt).trim().length > 0;
      const authenticatedUserId = user?.id ?? null;

      try {
        if (!authenticatedUserId) {
          throw new Error('No authenticated user');
        }

        await taskService.setTaskTemplateArchived(taskId, authenticatedUserId, !isArchived);
        await refreshAll?.();
        if (!refreshAll) {
          await forceRefreshNotificationQueue();
        }
      } catch (error: any) {
        Alert.alert('Error', error?.message || 'Failed to update archive status');
      }
    },
    [refreshAll, user?.id],
  );

  const handleDeleteTask = useCallback((task: Task) => {
    const taskId = String((task as any)?.id ?? '').trim();
    if (!taskId) return;
    setDeleteCandidate({
      taskId,
      title: String((task as any)?.title ?? '').trim(),
    });
    setDeleteConfirmationText('');
  }, []);

  const closeDeleteTemplateModal = useCallback(() => {
    setDeleteCandidate(null);
    setDeleteConfirmationText('');
    setIsDeleteConfirming(false);
  }, []);

  const runDeleteTask = useCallback(
    async (taskId: string) => {
      if (adminMode !== 'self' && selectedContext?.type) {
        setPendingAction({ type: 'delete', data: { taskId } });
        setShowConfirmDialog(true);
        return;
      }

      await deleteTask?.(taskId);
      closeTaskModal();
    },
    [adminMode, selectedContext, deleteTask, closeTaskModal],
  );

  const confirmDeleteTemplate = useCallback(async () => {
    if (!deleteCandidate) return;
    if (deleteConfirmationText !== DELETE_TEMPLATE_CONFIRM_TEXT) return;

    setIsDeleteConfirming(true);
    try {
      await runDeleteTask(deleteCandidate.taskId);
      closeDeleteTemplateModal();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Could not delete task template');
      setIsDeleteConfirming(false);
    }
  }, [deleteCandidate, deleteConfirmationText, runDeleteTask, closeDeleteTemplateModal]);

  const handleConfirmAction = useCallback(async () => {
    setShowConfirmDialog(false);
    if (!pendingAction) return;

    try {
      if (pendingAction.type === 'create' || pendingAction.type === 'edit') {
        await executeSaveTask();
      } else if (pendingAction.type === 'delete') {
        await deleteTask?.(pendingAction.data.taskId);
        closeTaskModal();
      }
    } catch (error) {
      console.error('Error executing action:', error);
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, executeSaveTask, deleteTask, closeTaskModal]);

  const handleCancelAction = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  }, []);

  const handleDuplicateTask = useCallback((taskId: string) => duplicateTask?.(taskId), [duplicateTask]);

  const toggleCategory = useCallback(
    (categoryId: string) => {
      setSelectedTask((prev) => {
        if (!prev) return prev;
        const current = new Set((((prev as any)?.categoryIds ?? []) as string[]).filter(Boolean));
        if (current.has(categoryId)) current.delete(categoryId);
        else current.add(categoryId);
        return { ...(prev as any), categoryIds: Array.from(current) } as Task;
      });
    },
    [],
  );

  const getCategoryItems = useCallback(
    (categoryIds: string[]) => {
      const uniqueIds = Array.from(new Set((categoryIds ?? []).filter(Boolean)));
      return uniqueIds
        .map((id) => categories.find((c: any) => String(c.id) === String(id)))
        .filter(Boolean)
        .map((category: any) => ({
          id: String(category.id),
          name: String(category.name ?? ''),
          color: category.color || colors.primary,
          emoji: category.emoji ?? '',
        }));
    },
    [categories],
  );

  const openVideoModal = useCallback((urls: string[] | string, initialIndex = 0) => {
    const nextUrls = normalizeTaskVideoUrls(urls);
    if (!nextUrls.length) {
      Alert.alert('Error', 'Invalid media. Use a video, image, or PDF link.');
      return;
    }
    setSelectedVideoUrls(nextUrls);
    setSelectedVideoIndex(Math.min(Math.max(0, initialIndex), nextUrls.length - 1));
    setShowVideoModal(true);
  }, []);

  const closeVideoModal = useCallback(() => {
    setShowVideoModal(false);
    setTimeout(() => {
      setSelectedVideoUrls([]);
      setSelectedVideoIndex(0);
    }, 300);
  }, []);

  const handleAddVideoUrl = useCallback(() => {
    const trimmed = videoUrlInput.trim();
    if (!trimmed) return;
    if (!isValidVideoUrl(trimmed)) {
      Alert.alert('Error', 'Invalid media. Use a video, image, or PDF link.');
      return;
    }
    setFormErrors(prev => ({ ...prev, videoUrl: undefined }));
    setVideoUrls((prevUrls) => {
      const nextMedia = mergeTaskMedia(prevUrls, mediaNames, trimmed, mediaNameInput);
      setMediaNames(nextMedia.names);
      return nextMedia.urls;
    });
    setVideoUrlInput('');
    setMediaNameInput('');
  }, [mediaNameInput, mediaNames, videoUrlInput]);

  const handlePickVideo = useCallback(async () => {
    if (!user?.id) {
      Alert.alert('Error', 'You must be logged in to upload files.');
      return;
    }

    setIsUploadingVideo(true);
    try {
      const uploadedMedia = await pickAndUploadTaskMedia(user.id);
      if (!uploadedMedia) return;
      setFormErrors(prev => ({ ...prev, videoUrl: undefined }));
      setVideoUrls((prevUrls) => {
        const nextMedia = mergeTaskMedia(
          prevUrls,
          mediaNames,
          uploadedMedia.publicUrl,
          mediaNameInput || getTaskMediaNameFromFileName(uploadedMedia.fileName),
        );
        setMediaNames(nextMedia.names);
        return nextMedia.urls;
      });
      setMediaNameInput('');
      Alert.alert('File uploaded', 'The file has been added to the task template.');
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Failed to upload file.');
    } finally {
      setIsUploadingVideo(false);
    }
  }, [mediaNameInput, mediaNames, user?.id]);

  const handleDeleteVideo = useCallback((index: number) => {
    Alert.alert('Remove file', 'Are you sure you want to remove the file from this task?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setVideoUrls((prevUrls) => {
            const nextMedia = removeTaskMediaAt(prevUrls, mediaNames, index);
            setMediaNames(nextMedia.names);
            return nextMedia.urls;
          });
          Alert.alert('File removed', 'Remember to save the task to confirm the change.');
        },
      },
    ]);
  }, [mediaNames]);

  const handleAfterTrainingToggle = useCallback((value: boolean) => {
    setSelectedTask(prev => {
      if (!prev) return prev;
      if (!value) {
        return {
          ...prev,
          afterTrainingEnabled: false,
          afterTrainingDelayMinutes: null,
        };
      }

      const existingDelay = prev.afterTrainingDelayMinutes;
      return {
        ...prev,
        afterTrainingEnabled: true,
        afterTrainingDelayMinutes: existingDelay ?? 0,
        afterTrainingFeedbackEnableScore: prev.afterTrainingFeedbackEnableScore ?? true,
        afterTrainingFeedbackEnableNote: prev.afterTrainingFeedbackEnableNote ?? true,
        // Always enable intensity when turning on after-training feedback
        afterTrainingFeedbackEnableIntensity: true,
      };
    });
  }, []);

  const handleReminderToggle = useCallback((value: boolean) => {
    setSelectedTask(prev => {
      if (!prev) return prev;
      const current = normalizeReminderValue((prev as any).reminder);
      return { ...(prev as any), reminder: value ? (current ?? 0) : null } as Task;
    });
  }, []);

  const handleAutoAddToggle = useCallback((value: boolean) => {
    setSelectedTask(prev =>
      prev
        ? ({
            ...(prev as any),
            autoAddToActivities: value,
            auto_add_to_activities: value,
          } as Task)
        : prev
    );
  }, []);

  const openNewTaskModal = useCallback(() => {
    openTaskModal(
      {
        id: '',
        title: '',
        description: '',
        completed: false,
        isTemplate: true,
        categoryIds: [],
        subtasks: [],
        videoUrl: undefined,
        videoUrls: [],
        afterTrainingEnabled: false,
        afterTrainingDelayMinutes: 0,
        afterTrainingFeedbackEnableScore: true,
        afterTrainingFeedbackScoreExplanation: '',
        afterTrainingFeedbackEnableIntensity: false,
        afterTrainingFeedbackEnableNote: true,
        taskDurationEnabled: false,
        taskDurationMinutes: null,
        autoAddToActivities: false,
        auto_add_to_activities: false,
      } as any,
      true,
    );
  }, [openTaskModal]);

  const reminderEnabled =
    !!selectedTask && (selectedTask as any).reminder !== null && (selectedTask as any).reminder !== undefined;

  const afterTrainingScoreEnabled = selectedTask?.afterTrainingFeedbackEnableScore ?? true;
  const afterTrainingScoreExplanation = selectedTask?.afterTrainingFeedbackScoreExplanation ?? '';

  // Memoized render functions for FlatList
  const renderTaskCard = useCallback(
    (task: Task) => (
      <TaskCard
        task={task}
        isDark={isDark}
        onPress={() => openTaskModal(task)}
        onDuplicate={() => handleDuplicateTask(String((task as any).id))}
        onArchive={() => void handleArchiveTask(task)}
        onDelete={() => handleDeleteTask(task)}
        onVideoPress={openVideoModal}
        getCategoryItems={getCategoryItems}
        isArchived={typeof (task as any)?.archivedAt === 'string' && String((task as any).archivedAt).trim().length > 0}
      />
    ),
    [isDark, openTaskModal, handleDuplicateTask, handleArchiveTask, handleDeleteTask, openVideoModal, getCategoryItems],
  );

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;
  const isTrainerProfile = userRole === 'trainer';

  const renderFolder = useCallback(
    ({ item }: { item: FolderItem }) => {
      const isExpanded = expandedFolders.has(item.id);
      return (
        <FolderItemComponent
          folder={item}
          isExpanded={isExpanded}
          onToggle={() => toggleFolder(item.id)}
          renderTaskCard={renderTaskCard}
          textColor={textColor}
          textSecondaryColor={textSecondaryColor}
          cardBgColor={cardBgColor}
        />
      );
    },
    [expandedFolders, toggleFolder, renderTaskCard, textColor, textSecondaryColor, cardBgColor],
  );

  const ListHeaderComponent = useMemo(() => {
    return (
      <>
        {adminMode === 'self' && userRole === 'player' && (
          <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
            <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info" size={20} color={colors.secondary} />
            <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
              Here you see your own task templates as well as tasks assigned to you by your trainer
            </Text>
          </View>
        )}

        {isTrainerProfile ? (
          <TrainerScopeFilter
            testIDPrefix="tasks.scopeFilter"
            modalTitle="Tasks"
            allLabel="All tasks"
            allDetail="Your task overview"
            playerDetail="Player tasks"
            teamDetail="Team tasks"
            colors={{
              primary: colors.primary,
              card: cardBgColor,
              highlight: colors.highlight,
              text: textColor,
              textSecondary: textSecondaryColor,
            }}
            isDark={isDark}
            containerStyle={styles.scopeFilterContainer}
          />
        ) : null}

        <View style={[styles.searchBarWrap, { backgroundColor: cardBgColor, borderColor: isDark ? '#333' : colors.highlight }]}>
          <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={textSecondaryColor} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder="Search for tasks..."
            placeholderTextColor={textSecondaryColor}
            value={searchQuery}
            onChangeText={setSearchQuery}
            testID="tasks.searchInput"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {searchQuery.trim().length ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.iconButton} activeOpacity={0.8}>
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={20} color={textSecondaryColor} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.categoryFilterHeader}>
          <TouchableOpacity
            style={[
              styles.categoryFilterButton,
              {
                backgroundColor: selectedCategoryFilter ? colors.primary : cardBgColor,
                borderColor: selectedCategoryFilter ? colors.primary : isDark ? '#333' : colors.highlight,
                opacity: uniqueCategories.length ? 1 : 0.55,
              },
            ]}
            onPress={toggleCategoryFilterOpen}
            disabled={!uniqueCategories.length}
            activeOpacity={0.85}
            testID="tasks.categoryFilter.button"
          >
            <IconSymbol
              ios_icon_name="line.3.horizontal.decrease.circle"
              android_material_icon_name="filter_list"
              size={18}
              color={selectedCategoryFilter ? '#fff' : textSecondaryColor}
            />
            <Text
              style={[
                styles.categoryFilterButtonText,
                { color: selectedCategoryFilter ? '#fff' : textColor },
              ]}
              numberOfLines={1}
            >
              {selectedCategoryFilter
                ? `${String((selectedCategoryFilter as any).emoji ?? '').trim()} ${String((selectedCategoryFilter as any).name ?? '')}`.trim()
                : 'Filter'}
            </Text>
            <IconSymbol
              ios_icon_name={categoryFilterOpen ? 'chevron.up' : 'chevron.down'}
              android_material_icon_name={categoryFilterOpen ? 'expand_less' : 'expand_more'}
              size={16}
              color={selectedCategoryFilter ? '#fff' : textSecondaryColor}
            />
          </TouchableOpacity>

          {selectedCategoryFilter ? (
            <TouchableOpacity
              style={[styles.categoryFilterClearButton, { backgroundColor: cardBgColor, borderColor: isDark ? '#333' : colors.highlight }]}
              onPress={() => selectCategoryFilter(null)}
              activeOpacity={0.85}
              testID="tasks.categoryFilter.clearButton"
            >
              <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={16} color={textSecondaryColor} />
            </TouchableOpacity>
          ) : null}
        </View>

        {categoryFilterOpen ? (
          <View style={[styles.categoryFilterPanel, { backgroundColor: cardBgColor, borderColor: isDark ? '#333' : colors.highlight }]}>
            <TouchableOpacity
              style={[
                styles.categoryFilterChip,
                {
                  backgroundColor: !selectedCategoryFilterId ? colors.primary : 'transparent',
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => selectCategoryFilter(null)}
              activeOpacity={0.85}
              testID="tasks.categoryFilter.option.all"
            >
              <Text style={[styles.categoryFilterChipText, { color: !selectedCategoryFilterId ? '#fff' : colors.primary }]}>
                All
              </Text>
            </TouchableOpacity>

            {uniqueCategories.map((category: any) => {
              const catId = String(category.id);
              const catColor = category.color || colors.primary;
              const isSelected = selectedCategoryFilterId === catId;
              const label = `${String(category.emoji ?? '').trim()} ${String(category.name ?? '')}`.trim();
              return (
                <TouchableOpacity
                  key={catId}
                  style={[
                    styles.categoryFilterChip,
                    {
                      backgroundColor: isSelected ? withAlpha(catColor, 0.18) : 'transparent',
                      borderColor: catColor,
                    },
                  ]}
                  onPress={() => selectCategoryFilter(isSelected ? null : catId)}
                  activeOpacity={0.85}
                  testID={`tasks.categoryFilter.option.${sanitizeTestIdSegment(catId)}`}
                >
                  <Text style={[styles.categoryFilterChipText, { color: isSelected ? catColor : textColor }]} numberOfLines={1}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <View style={styles.sectionDivider}>
          <Text style={[styles.sectionDividerText, { color: textSecondaryColor }]}>Folders</Text>
          <LinearGradient
            colors={[withAlpha(colors.highlight, 0), withAlpha(colors.highlight, 0.92), withAlpha(colors.primary, 0.35)]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sectionDividerLine}
          />
        </View>

        {adminMode !== 'self' && selectedContext?.type ? (
          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            Task templates for {String(selectedContext?.name ?? '')}.
          </Text>
        ) : null}

        <View style={[styles.templateViewToggle, { backgroundColor: cardBgColor }]}>
          <TouchableOpacity
            style={[
              styles.templateViewToggleButton,
              templateView === 'active' && { backgroundColor: colors.primary },
            ]}
            onPress={() => setTemplateView('active')}
            testID="tasks.template.filter.activeButton"
          >
            <Text style={[styles.templateViewToggleText, { color: templateView === 'active' ? '#fff' : textColor }]}>
              Active
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.templateViewToggleButton,
              templateView === 'archived' && { backgroundColor: colors.primary },
            ]}
            onPress={() => setTemplateView('archived')}
            testID="tasks.template.filter.archivedButton"
          >
            <Text style={[styles.templateViewToggleText, { color: templateView === 'archived' ? '#fff' : textColor }]}>
              Archived
            </Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }, [
    adminMode,
    selectedContext,
    userRole,
    isDark,
    textColor,
    textSecondaryColor,
    searchQuery,
    cardBgColor,
    isTrainerProfile,
    templateView,
    categoryFilterOpen,
    selectedCategoryFilter,
    selectedCategoryFilterId,
    uniqueCategories,
    toggleCategoryFilterOpen,
    selectCategoryFilter,
  ]);

  const ListEmptyComponent = useMemo(() => {
    return (
      <View style={[styles.emptyState, { backgroundColor: cardBgColor }]}>
        <IconSymbol ios_icon_name="folder" android_material_icon_name="folder_open" size={48} color={textSecondaryColor} />
        <Text style={[styles.emptyStateText, { color: textSecondaryColor }]}>
          {searchQuery || selectedCategoryFilterId
            ? 'No tasks match your filter'
            : templateView === 'active'
              ? 'No active task templates'
              : 'No archived assignment templates'}
        </Text>
      </View>
    );
  }, [searchQuery, selectedCategoryFilterId, cardBgColor, textSecondaryColor, templateView]);

  const ListFooterComponent = useMemo(() => <View style={{ height: embedded ? 132 : 100 }} />, [embedded]);

  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetType === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  // Show loading spinner when data is being fetched
  if (isLoading) {
    return (
      <AdminContextWrapper
        isAdmin={isAdminMode}
        contextName={selectedContext?.name}
        contextType={adminTargetType || 'player'}
        presentation="none"
      >
        <View style={[styles.screen, { backgroundColor: bgColor }]}>
          <View style={[styles.topBar, embedded ? styles.embeddedTopBar : null]}>
            <Text style={[styles.screenTitle, embedded ? styles.embeddedScreenTitle : null, { color: textColor }]} testID="tasks.header.title">
              {embedded ? 'Opgaver' : 'Tasks'}
            </Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </View>
      </AdminContextWrapper>
    );
  }

  return (
    <AdminContextWrapper
      isAdmin={isAdminMode}
      contextName={selectedContext?.name}
      contextType={adminTargetType || 'player'}
      presentation="none"
    >
      <View style={[styles.screen, { backgroundColor: bgColor }]} testID="tasks.screen">
        <View style={[styles.topBar, embedded ? styles.embeddedTopBar : null]}>
          <View style={styles.topBarTitleWrap}>
            <Text
              style={[styles.screenTitle, embedded ? styles.embeddedScreenTitle : null, { color: textColor }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              testID="tasks.header.title"
            >
              {embedded ? 'Opgaver' : 'Tasks'}
            </Text>
            <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]} numberOfLines={1}>
              {embedded ? `${templateTasks.length} opgaveskabeloner` : `${templateTasks.length} templates`}
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.createButton, { backgroundColor: colors.primary }]}
            onPress={openNewTaskModal}
            testID="tasks.header.newTaskButton"
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color="#fff" />
            <Text style={styles.createButtonText}>{embedded ? 'Ny opgave' : 'New task'}</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={folders}
          keyExtractor={(f) => f.id}
          renderItem={renderFolder}
          contentContainerStyle={[styles.contentContainer, embedded ? styles.embeddedContentContainer : null, contentContainerStyle]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          removeClippedSubviews={Platform.OS !== 'web'}
          initialNumToRender={8}
          maxToRenderPerBatch={6}
          windowSize={10}
          ListHeaderComponent={ListHeaderComponent}
          ListEmptyComponent={ListEmptyComponent}
          ListFooterComponent={ListFooterComponent}
        />
      </View>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (!isSaving && !isUploadingVideo) closeTaskModal();
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>{isCreating ? 'New task' : 'Edit task'}</Text>
              <TouchableOpacity onPress={closeTaskModal} disabled={isSaving || isUploadingVideo}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={28} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[{ key: 'form' }]}
              keyExtractor={(item) => item.key}
              scrollEnabled={!isMediaDragging}
              renderItem={() => (
                <View style={styles.modalBody} testID="tasks.modal.formBody">
                  <Text style={[styles.label, { color: textColor }]}>Title</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                    value={String((selectedTask as any)?.title ?? '')}
                    onChangeText={updateTaskTitle}
                    placeholder="Task title"
                    placeholderTextColor={textSecondaryColor}
                    editable={!isSaving}
                    testID="tasks.modal.titleInput"
                  />
                  {formErrors.title ? (
                    <Text style={[styles.errorText, { color: colors.error }]}>{formErrors.title}</Text>
                  ) : null}

                  <Text style={[styles.label, { color: textColor }]}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, { backgroundColor: bgColor, color: textColor }]}
                    value={String((selectedTask as any)?.description ?? '')}
                    onChangeText={updateTaskDescription}
                    placeholder="Description of the task"
                    placeholderTextColor={textSecondaryColor}
                    multiline
                    numberOfLines={4}
                    editable={!isSaving}
                    testID="tasks.modal.descriptionInput"
                  />

                  <View style={styles.videoSection}>
                    <View style={styles.videoLabelRow}>
                      <Text style={[styles.label, { color: textColor }]}>Media</Text>
                      <Text style={[styles.videoCountText, { color: textSecondaryColor }]}>
                        {videoUrls.length ? `${videoUrls.length} added` : 'None added'}
                      </Text>
                    </View>

                    <TextInput
                      style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                      value={videoUrlInput}
                      onChangeText={updateVideoUrlInput}
                      placeholder="Paste a video, image, or PDF link"
                      placeholderTextColor={textSecondaryColor}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      editable={!isSaving && !isUploadingVideo}
                      testID="tasks.modal.videoUrlInput"
                    />

                    <TextInput
                      style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                      value={mediaNameInput}
                      onChangeText={setMediaNameInput}
                      placeholder="Media name"
                      placeholderTextColor={textSecondaryColor}
                      editable={!isSaving && !isUploadingVideo}
                      testID="tasks.modal.mediaNameInput"
                    />

                    <TouchableOpacity
                      style={[
                        styles.addVideoUrlButton,
                        {
                          borderColor: colors.secondary,
                          opacity: isSaving || isUploadingVideo || !videoUrlInput.trim() ? 0.6 : 1,
                        },
                      ]}
                      onPress={handleAddVideoUrl}
                      disabled={isSaving || isUploadingVideo || !videoUrlInput.trim()}
                      activeOpacity={0.85}
                      testID="tasks.template.addVideoUrlButton"
                    >
                      <Text style={[styles.addVideoUrlButtonText, { color: colors.secondary }]}>Add media link</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.uploadVideoButton,
                        {
                          borderColor: colors.primary,
                          opacity: isSaving || isUploadingVideo ? 0.6 : 1,
                        },
                      ]}
                      onPress={handlePickVideo}
                      disabled={isSaving || isUploadingVideo}
                      activeOpacity={0.85}
                    >
                      <IconSymbol
                        ios_icon_name="video.badge.plus"
                        android_material_icon_name="video_library"
                        size={20}
                        color={colors.primary}
                      />
                      <Text style={[styles.uploadVideoButtonText, { color: colors.primary }]}>
                        {isUploadingVideo ? 'Uploading file...' : 'Choose image, video, or PDF'}
                      </Text>
                    </TouchableOpacity>

                    {videoUrls.length > 0 ? (
                      <>
                        <TaskMediaListEditor
                          urls={videoUrls}
                          names={mediaNames}
                          onChange={(nextUrls, nextNames) => {
                            setVideoUrls(nextUrls);
                            setMediaNames(nextNames);
                          }}
                          getLabel={getVideoSourceLabel}
                          onRemove={handleDeleteVideo}
                          onRename={(index, name) => setMediaNames((prevNames) => replaceTaskMediaName(prevNames, videoUrls, index, name))}
                          onPreview={(index) => openVideoModal(videoUrls, index)}
                          disabled={isSaving || isUploadingVideo}
                          backgroundColor={bgColor}
                          borderColor={isDark ? '#2f3642' : '#E2E8F0'}
                          textColor={textColor}
                          secondaryTextColor={textSecondaryColor}
                          accentColor={colors.primary}
                          dangerColor={colors.error}
                          testIDPrefix="tasks.template.media"
                          onDragStateChange={setIsMediaDragging}
                        />
                        {videoUrls.length > 1 ? (
                          <Text style={[styles.videoSwipeHelperText, { color: colors.secondary }]}>
                            Drag a media row to change the display order.
                          </Text>
                        ) : null}
                      </>
                    ) : null}

                    {(formErrors.videoUrl || (videoUrlInput.trim() && !isValidVideoUrl(videoUrlInput))) && (
                      <Text style={[styles.errorText, { color: colors.error }]}>
                        {formErrors.videoUrl || 'Invalid media. Use a video, image, or PDF link.'}
                      </Text>
                    )}
                  </View>

                  <View
                    style={[
                      styles.reminderSectionCard,
                      {
                        backgroundColor: bgColor,
                        borderColor: isDark ? '#333' : '#dfe5f2',
                      },
                    ]}
                  >
                    <View style={styles.reminderSectionHeader}>
                      <View style={styles.toggleTextWrapper}>
                        <Text style={[styles.toggleLabel, { color: textColor }]}>Reminder before start</Text>
                        <Text style={[styles.toggleHelperText, { color: textSecondaryColor }]}>
                          Turn on to show a reminder before the activity starts.
                        </Text>
                      </View>
                      <Switch
                        value={reminderEnabled}
                        onValueChange={handleReminderToggle}
                        trackColor={{ false: isDark ? '#555' : '#d0d7e3', true: colors.primary }}
                        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                        ios_backgroundColor={isDark ? '#555' : '#d0d7e3'}
                        disabled={isSaving}
                        testID="tasks.modal.reminderToggle"
                      />
                    </View>

                    {reminderEnabled && (
                      <View style={styles.reminderSectionBody}>
                        <Text style={[styles.label, { color: textColor }]}>Minutes before start</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                          {REMINDER_DELAY_OPTIONS.map(option => {
                            const current = normalizeReminderValue((selectedTask as any)?.reminder);
                            const selected = current === option.value;

                            return (
                              <TouchableOpacity
                                key={`before-delay-${option.value}`}
                                style={{
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  borderRadius: 10,
                                  backgroundColor: selected ? colors.primary : bgColor,
                                  borderWidth: 1,
                                  borderColor: selected ? colors.primary : (isDark ? '#444' : '#d0d7e3'),
                                  opacity: isSaving ? 0.6 : 1,
                                }}
                                onPress={() =>
                                  setSelectedTask(prev =>
                                    prev ? ({ ...(prev as any), reminder: option.value } as Task) : prev
                                  )
                                }
                                disabled={isSaving}
                                testID={`tasks.modal.reminderOption.${option.value}`}
                              >
                                <Text style={{ color: selected ? '#fff' : textColor, fontWeight: selected ? '700' : '600' }}>
                                  {option.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <Text style={[styles.helperText, { color: colors.secondary, marginTop: 6 }]}>
                          0 = at start time. The reminder is displayed before the activity's start time.
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.reminderSectionSpacing} />

                  <View
                    style={[
                      styles.reminderSectionCard,
                      {
                        backgroundColor: bgColor,
                        borderColor: isDark ? '#333' : '#dfe5f2',
                      },
                    ]}
                  >
                    <View style={styles.reminderSectionHeader}>
                      <View style={styles.toggleTextWrapper}>
                        <Text style={[styles.toggleLabel, { color: textColor }]}>Create post-training feedback</Text>
                        <Text style={[styles.toggleHelperText, { color: textSecondaryColor }]}
                        >
                          When this template is used on an activity, a post-training feedback task is automatically created for the activity.
                        </Text>
                      </View>
                      <Switch
                        value={!!(selectedTask as any)?.afterTrainingEnabled}
                        onValueChange={handleAfterTrainingToggle}
                        trackColor={{ false: isDark ? '#555' : '#d0d7e3', true: colors.primary }}
                        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                        ios_backgroundColor={isDark ? '#555' : '#d0d7e3'}
                        disabled={isSaving}
                        testID="tasks.modal.feedbackToggle"
                      />
                    </View>

                    {!!selectedTask?.afterTrainingEnabled && (
                      <View style={styles.reminderSectionBody}>
                        <Text style={[styles.label, { color: textColor }]}>Reminder after end (minutes)</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                          {REMINDER_DELAY_OPTIONS.map(option => {
                            const current = selectedTask.afterTrainingDelayMinutes ?? 0;
                            const selected = current === option.value;

                            return (
                              <TouchableOpacity
                                key={`after-delay-${option.value}`}
                                style={{
                                  paddingVertical: 8,
                                  paddingHorizontal: 12,
                                  borderRadius: 10,
                                  backgroundColor: selected ? colors.primary : bgColor,
                                  borderWidth: 1,
                                  borderColor: selected ? colors.primary : (isDark ? '#444' : '#d0d7e3'),
                                  opacity: isSaving ? 0.6 : 1,
                                }}
                                onPress={() =>
                                  setSelectedTask(prev => (prev ? ({ ...prev, afterTrainingDelayMinutes: option.value } as Task) : prev))
                                }
                                disabled={isSaving}
                                testID={`tasks.modal.feedbackDelayOption.${option.value}`}
                              >
                                <Text style={{ color: selected ? '#fff' : textColor, fontWeight: selected ? '700' : '600' }}>
                                  {option.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <Text style={[styles.helperText, { color: textSecondaryColor, marginTop: 6 }]}>
                          Shown after the activity's end time + selected delay.
                        </Text>
                        {afterTrainingScoreEnabled ? (
                          <>
                            <Text style={[styles.label, { color: textColor, marginTop: 14 }]}>Score explanation</Text>
                            <TextInput
                              style={[
                                styles.feedbackExplanationInput,
                                {
                                  backgroundColor: bgColor,
                                  color: textColor,
                                  borderColor: isDark ? '#444' : '#d0d7e3',
                                },
                              ]}
                              value={afterTrainingScoreExplanation}
                              onChangeText={(text) =>
                                setSelectedTask(prev =>
                                  prev
                                    ? ({
                                        ...prev,
                                        afterTrainingFeedbackScoreExplanation: text,
                                      } as Task)
                                    : prev
                                )
                              }
                              placeholder="Explanation for score feedback"
                              placeholderTextColor={textSecondaryColor}
                              multiline
                              editable={!isSaving}
                              testID="tasks.modal.feedbackScoreExplanationInput"
                            />
                          </>
                        ) : null}
                      </View>
                    )}
                  </View>

                  <View style={styles.reminderSectionSpacing} />

                  <View
                    style={[
                      styles.reminderSectionCard,
                      {
                        backgroundColor: bgColor,
                        borderColor: isDark ? '#333' : '#dfe5f2',
                      },
                    ]}
                  >
                    <View style={styles.reminderSectionHeader}>
                      <View style={styles.toggleTextWrapper}>
                        <Text style={[styles.toggleLabel, { color: textColor }]}>Auto-add to matching activities</Text>
                        <Text style={[styles.toggleHelperText, { color: textSecondaryColor }]}>
                          Adds this template to future activities with one of the selected categories.
                        </Text>
                      </View>
                      <Switch
                        value={!!(selectedTask as any)?.autoAddToActivities}
                        onValueChange={handleAutoAddToggle}
                        trackColor={{ false: isDark ? '#555' : '#d0d7e3', true: colors.primary }}
                        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                        ios_backgroundColor={isDark ? '#555' : '#d0d7e3'}
                        disabled={isSaving}
                        testID="tasks.template.autoAddToggle"
                      />
                    </View>
                  </View>

                  <Text style={[styles.label, { color: textColor }]}>Activity categories</Text>
                  <View style={styles.categoriesGrid} testID="tasks.modal.categoryDropdownToggle">
                    {uniqueCategories.map((item: any, index: number) => {
                      const catId = String(item.id);
                      const catColor = item.color || colors.primary;
                      const isSelected = !!selectedTask?.categoryIds?.includes?.(catId);
                      return (
                        <TouchableOpacity
                          key={catId}
                          style={[
                            styles.categoryChip,
                            {
                              backgroundColor: isSelected ? catColor : bgColor,
                              borderColor: catColor,
                              opacity: isSaving ? 0.6 : 1,
                            },
                          ]}
                          onPress={() => toggleCategory(catId)}
                          disabled={isSaving}
                          testID={`tasks.modal.categoryOption.${index}`}
                        >
                          <Text style={styles.categoryEmoji}>{String(item.emoji ?? '')}</Text>
                          <Text style={[styles.categoryName, { color: isSelected ? '#fff' : textColor }]}>
                            {String(item.name ?? '')}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: bgColor }]}
                onPress={closeTaskModal}
                disabled={isSaving || isUploadingVideo}
                testID="tasks.modal.cancelButton"
              >
                <Text style={[styles.modalButtonText, { color: textColor }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.saveButton,
                  { backgroundColor: colors.primary, opacity: isSaving || isUploadingVideo ? 0.6 : 1 },
                ]}
                onPress={handleSaveTask}
                disabled={isSaving || isUploadingVideo}
                testID="tasks.modal.saveButton"
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                  {isSaving ? 'Saving...' : isUploadingVideo ? 'Uploading...' : 'Save'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showVideoModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeVideoModal}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: Platform.OS === 'android' ? 48 : 60,
              paddingBottom: 16,
              paddingHorizontal: 20,
              backgroundColor: 'rgba(0,0,0,0.9)',
            }}
          >
            <TouchableOpacity onPress={closeVideoModal} style={{ padding: 4 }}>
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={32} color="#fff" />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>Task media</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
            <SwipeVideoPlayer
              urls={selectedVideoUrls}
              initialIndex={selectedVideoIndex}
              minHeight={420}
              testID="tasks.template.videoCarousel"
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!deleteCandidate}
        animationType="fade"
        transparent
        onRequestClose={closeDeleteTemplateModal}
      >
        <View style={styles.deleteConfirmOverlay}>
          <View style={[styles.deleteConfirmCard, { backgroundColor: cardBgColor }]}>
            <Text style={[styles.deleteConfirmTitle, { color: textColor }]}>Delete task template</Text>
            <Text style={[styles.deleteConfirmWarning, { color: textColor }]}>
              {DELETE_TEMPLATE_WARNING_TEXT}
            </Text>
            <Text style={[styles.deleteConfirmHelper, { color: textSecondaryColor }]}>
              Type {DELETE_TEMPLATE_CONFIRM_TEXT} to enable deletion.
            </Text>
            <TextInput
              style={[styles.deleteConfirmInput, { backgroundColor: bgColor, color: textColor, borderColor: isDark ? '#3a3a3a' : '#d0d7e3' }]}
              value={deleteConfirmationText}
              onChangeText={setDeleteConfirmationText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={DELETE_TEMPLATE_CONFIRM_TEXT}
              placeholderTextColor={textSecondaryColor}
              testID="tasks.template.deleteModal.input"
            />

            <View style={styles.deleteConfirmActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: bgColor }]}
                onPress={closeDeleteTemplateModal}
              >
                <Text style={[styles.modalButtonText, { color: textColor }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.deleteConfirmButton,
                  {
                    backgroundColor: colors.error,
                    opacity:
                      deleteConfirmationText === DELETE_TEMPLATE_CONFIRM_TEXT && !isDeleteConfirming
                        ? 1
                        : 0.45,
                  },
                ]}
                disabled={deleteConfirmationText !== DELETE_TEMPLATE_CONFIRM_TEXT || isDeleteConfirming}
                onPress={() => {
                  void confirmDeleteTemplate();
                }}
                testID="tasks.template.deleteModal.confirmButton"
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                  {isDeleteConfirming ? 'Deleting...' : 'Delete'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ContextConfirmationDialog
        visible={showConfirmDialog}
        contextType={
          selectedContext?.type === 'player' || selectedContext?.type === 'team'
            ? selectedContext.type
            : null
        }
        contextName={String(selectedContext?.name ?? '')}
        actionType={(pendingAction?.type as any) || 'edit'}
        itemType="task"
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
      />
    </AdminContextWrapper>
  );
}

export default function TasksScreen() {
  return <TaskLibrarySection />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contentContainer: { paddingHorizontal: 18, paddingBottom: 24 },
  embeddedContentContainer: { paddingHorizontal: 16, paddingBottom: 132 },
  scopeFilterContainer: {
    marginBottom: 12,
  },
  topBar: {
    paddingTop: Platform.OS === 'android' ? 54 : 56,
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  embeddedTopBar: {
    paddingTop: 2,
    paddingHorizontal: 16,
  },
  topBarTitleWrap: { flex: 1, minWidth: 0 },
  screenTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
  },
  embeddedScreenTitle: {
    fontSize: 23,
    lineHeight: 29,
  },
  topBarRight: { flexDirection: 'row', gap: 10, alignItems: 'center', flexShrink: 0 },
  headerSubtitle: { fontSize: 13, fontWeight: '800', marginTop: 2 },
  iconButton: { padding: 6 },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    flexShrink: 0,
  },
  createButtonText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  infoBox: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, borderRadius: 16 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  searchBarWrap: {
    marginBottom: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '600' },
  categoryFilterHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, marginBottom: 14 },
  categoryFilterButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryFilterButtonText: { flex: 1, fontSize: 14, fontWeight: '800' },
  categoryFilterClearButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryFilterPanel: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 10,
    marginTop: -8,
    marginBottom: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryFilterChip: {
    minHeight: 36,
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  categoryFilterChipText: { fontSize: 13, fontWeight: '800' },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold' },
  sectionDescription: { fontSize: 13, marginBottom: 12, lineHeight: 18, fontWeight: '600' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addButtonText: { fontSize: 16, fontWeight: '600' },
  sectionDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 2,
    marginBottom: 10,
  },
  sectionDividerText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionDividerLine: {
    flex: 1,
    height: 2,
    borderRadius: 999,
  },
  templateViewToggle: { flexDirection: 'row', padding: 4, borderRadius: 16, gap: 6, marginBottom: 14 },
  templateViewToggleButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  templateViewToggleText: { fontSize: 14, fontWeight: '600' },
  folderWrap: { marginBottom: 10 },
  folderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 14, borderRadius: 16 },
  folderHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  folderIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderTextWrap: { flex: 1, gap: 2 },
  folderName: { fontSize: 16, fontWeight: '700', flex: 1 },
  folderSubtitle: { fontSize: 13, fontWeight: '500' },
  countBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  countBadgeText: { fontSize: 12, fontWeight: '800' },
  folderContent: { marginTop: 10, marginBottom: 4 },

  emptyState: { padding: 48, borderRadius: 16, alignItems: 'center', gap: 16 },
  emptyStateText: { fontSize: 16, textAlign: 'center' },

  taskCard: { borderRadius: 24, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(148,163,184,0.28)' },
  taskCardShadow: {
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 6,
  },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10 },
  taskHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12, minWidth: 0 },
  taskIconWrap: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(59,130,246,0.12)' },
  taskTitleWrap: { flex: 1, minWidth: 0, gap: 5 },
  taskTitleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  taskTitle: { fontSize: 16, fontWeight: '800', flex: 1, lineHeight: 21 },
  taskDescription: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  taskDescriptionIndented: { marginLeft: 46, marginTop: -4, marginBottom: 10 },
  taskActions: { flexDirection: 'row', gap: 8, flexShrink: 0 },
  actionButton: { padding: 4 },

  videoThumbnailWrapper: { height: 180, borderRadius: 12, overflow: 'hidden', marginBottom: 12, backgroundColor: '#000' },
  videoThumbnail: { width: '100%', height: '100%' },
  videoThumbnailFallback: { width: '100%', height: '100%', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  videoThumbnailFallbackLabel: { color: '#fff', fontSize: 18, fontWeight: '700' },
  videoOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
  videoSwipeBadge: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  videoSwipeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  videoSection: { marginBottom: 16 },
  videoLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  videoCountText: { fontSize: 13, fontWeight: '700' },
  deleteVideoButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  deleteVideoText: { fontSize: 14, fontWeight: '600' },
  addVideoUrlButton: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
    marginBottom: 10,
  },
  addVideoUrlButtonText: { fontSize: 14, fontWeight: '700' },
  uploadVideoButton: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: -4,
    marginBottom: 12,
  },
  uploadVideoButtonText: { fontSize: 15, fontWeight: '600' },
  videoPreviewSmall: { marginTop: 8, marginBottom: 12 },
  videoPreviewButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: colors.highlight, borderRadius: 12 },
  videoPreviewText: { fontSize: 16, fontWeight: '600' },
  videoList: { gap: 8, marginBottom: 12 },
  videoListItem: {
    minHeight: 54,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  videoListPreviewButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  videoListTextWrap: { flex: 1, minWidth: 0 },
  videoListTitle: { fontSize: 14, fontWeight: '800' },
  videoListSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  videoSwipeHelperText: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  helperText: { fontSize: 14, marginTop: 4 },
  toggleCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 16, marginBottom: 20, gap: 12 },
  toggleTextWrapper: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 16, fontWeight: '600' },
  toggleHelperText: { fontSize: 14, lineHeight: 20, marginTop: 6 },

  reminderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  reminderText: { fontSize: 12, fontWeight: '600' },
  autoAddBadge: {
    alignSelf: 'flex-start',
    minHeight: 30,
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  autoAddBadgeText: { fontSize: 12, fontWeight: '800' },

  categoriesBlock: { marginTop: 6, gap: 8 },
  categoriesLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  categoriesLabelText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  taskCategoryBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  taskCategoryBadge: {
    minHeight: 30,
    maxWidth: '100%',
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  taskCategoryBadgeEmoji: { fontSize: 13 },
  taskCategoryBadgeText: { fontSize: 12, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%', overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: colors.highlight },
  modalTitle: { fontSize: 20, fontWeight: '900' },
  modalBody: { padding: 18 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  errorText: { fontSize: 13, fontWeight: '600', marginTop: -10, marginBottom: 12 },


  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5 },
  categoryEmoji: { fontSize: 16 },
  categoryName: { fontSize: 14, fontWeight: '600' },
  categoryDropdownToggle: {
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryDropdownToggleText: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    marginRight: 10,
  },
  categoryDropdownList: {
    marginTop: 4,
    marginBottom: 6,
  },
  categorySelectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 2,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
  },

  modalFooter: { flexDirection: 'row', gap: 12, padding: 20, borderTopWidth: 1, borderTopColor: colors.highlight },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cancelButton: { borderWidth: 1, borderColor: colors.highlight },
  saveButton: {},
  modalButtonText: { fontSize: 16, fontWeight: '600' },
  deleteConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  deleteConfirmCard: {
    borderRadius: 16,
    padding: 16,
  },
  deleteConfirmTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  deleteConfirmWarning: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 10,
  },
  deleteConfirmHelper: {
    fontSize: 13,
    marginBottom: 8,
  },
  deleteConfirmInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  deleteConfirmButton: {},

  reminderSectionCard: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  reminderSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  reminderSectionBody: {
    marginTop: 16,
  },
  feedbackConfigGroup: {
    marginTop: 20,
    gap: 18,
  },
  feedbackToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  feedbackExplanationInput: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  reminderSectionSpacing: {
    height: 12,
  },
});
