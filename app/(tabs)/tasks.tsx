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
import { useFocusEffect } from '@react-navigation/native';

import { useFootball } from '@/contexts/FootballContext';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Task } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import ContextConfirmationDialog from '@/components/ContextConfirmationDialog';
import { AdminContextWrapper } from '@/components/AdminContextWrapper';
import { taskService } from '@/services/taskService';
import { forceRefreshNotificationQueue } from '@/utils/notificationScheduler';
import { emitActivitiesRefreshRequested } from '@/utils/activityEvents';
import { getTaskModalVideoUrl } from '@/utils/taskModalContent';
import { LinearGradient } from 'expo-linear-gradient';

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

const normalizeTaskDurationValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  return rounded >= 0 ? rounded : null;
};

// Local helper function to validate video URLs
function isValidVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  const normalizedUrl = url.toLowerCase();

  return (
    normalizedUrl.includes('youtube') ||
    normalizedUrl.includes('youtu.be') ||
    normalizedUrl.includes('vimeo')
  );
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

const createLocalSubtaskId = () => `local-subtask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const isFootballCoachSource = (sourceFolder: string) =>
  sourceFolder.toLowerCase() === FOOTBALLCOACH_INSPIRATION.toLowerCase();

const parseTrainerNameFromSource = (sourceFolder: string): string | null => {
  const normalized = sourceFolder.trim();
  if (!normalized.toLowerCase().startsWith('fra træner')) return null;
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
  return fromSource || 'Ukendt træner';
};

const normalizeModalSubtasks = (subtasks: any[] | undefined | null) => {
  const normalized = (subtasks ?? [])
    .map((subtask) => ({
      id: String(subtask?.id ?? '').trim() || createLocalSubtaskId(),
      title: String(subtask?.title ?? ''),
      completed: !!subtask?.completed,
    }));
  return normalized.length ? normalized : [{ id: createLocalSubtaskId(), title: '', completed: false }];
};

const normalizeSubtasksForSave = (subtasks: any[] | undefined | null) =>
  (subtasks ?? [])
    .map((subtask) => ({
      id: String(subtask?.id ?? '').trim() || createLocalSubtaskId(),
      title: String(subtask?.title ?? '').trim(),
      completed: false,
    }))
    .filter((subtask) => subtask.title.length > 0);

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
  | { type: 'create' | 'edit'; data: { task: Task; videoUrl: string; isCreating: boolean } }
  | { type: 'delete'; data: { taskId: string } };

const DELETE_TEMPLATE_CONFIRM_TEXT = 'SLET';
const DELETE_TEMPLATE_WARNING_TEXT =
  'Hvis du sletter denne opgaveskabelon, slettes alle tidligere og fremtidige opgaver på relaterede aktiviteter. Hvis du vil beholde historik, vælg Arkiver i stedet.';

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
  if (n.startsWith('fra træner:')) {
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
        sf === 'fra træner' ||
        sf.startsWith('fra træner:') ||
        (!!ownerId && !!options.currentUserId && ownerId !== options.currentUserId);

      if (isTrainerTask) {
        const trainerName = getTaskTrainerName(task);
        const stableId = ownerId || trainerName;
        const folderId = `trainer.${sanitizeTestIdSegment(stableId)}`;
        if (!trainerFolders.has(folderId)) {
          const icons = getIconsForFolderName(`Fra træner: ${trainerName}`);
          trainerFolders.set(folderId, {
            id: folderId,
            name: `Fra træner: ${trainerName}`,
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
    const icons = getIconsForFolderName('Personlige opgaver');
    folders.push({
      id: 'personal',
      name: 'Personlige opgaver',
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
    onVideoPress: (url: string) => void;
    getCategoryItems: (categoryIds: string[]) => any[];
    isArchived?: boolean;
  }) => {
    const videoUrl = getTaskModalVideoUrl(task);
    const ytThumb = typeof videoUrl === 'string' && videoUrl.includes('youtu') ? getYouTubeThumbnail(videoUrl) : null;
    const taskId = String((task as any)?.id ?? '');
    const categoryItems = getCategoryItems((((task as any)?.categoryIds ?? []) as string[]).filter(Boolean));
    const description = String((task as any)?.description ?? '').trim();

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

        {videoUrl && isValidVideoUrl(videoUrl) && ytThumb && (
          <TouchableOpacity style={styles.videoThumbnailWrapper} onPress={() => onVideoPress(videoUrl)} activeOpacity={0.85}>
            <Image source={{ uri: ytThumb }} style={styles.videoThumbnail} resizeMode="cover" />
            <View style={styles.videoOverlay}>
              <IconSymbol ios_icon_name="play.circle.fill" android_material_icon_name="play_circle" size={56} color="#fff" />
            </View>
          </TouchableOpacity>
        )}

        {(task as any)?.reminder != null && String((task as any).reminder).length > 0 && (
          <View style={styles.reminderBadge}>
            <IconSymbol ios_icon_name="bell.fill" android_material_icon_name="notifications" size={14} color={colors.accent} />
            <Text style={[styles.reminderText, { color: colors.accent }]}>{String((task as any).reminder)} min før</Text>
          </View>
        )}

        {!!(task as any)?.taskDurationEnabled && (
          <View style={styles.reminderBadge}>
            <IconSymbol ios_icon_name="clock.fill" android_material_icon_name="schedule" size={14} color={colors.primary} />
            <Text style={[styles.reminderText, { color: colors.primary }]}>
              {String((task as any)?.taskDurationMinutes ?? 0)} min opgavetid
            </Text>
          </View>
        )}

        {categoryItems.length ? (
          <View style={styles.categoriesBlock}>
            <View style={styles.categoriesLabelRow}>
              <IconSymbol ios_icon_name="tag.fill" android_material_icon_name="label" size={14} color={isDark ? '#999' : colors.textSecondary} />
              <Text style={[styles.categoriesLabelText, { color: isDark ? '#999' : colors.textSecondary }]}>Kategorier</Text>
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
                {folder.tasks.length} opgaver
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

export default function TasksScreen() {
  const footballData = useFootball() as any;
  const adminData = useAdmin() as any;
  const { user } = useAuthSession();
  const roleInfo = useUserRole() as any;
  const userRole = typeof roleInfo?.userRole === 'string' ? roleInfo.userRole : null;

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

  const rawSelectedContext = adminData?.selectedContext;
  const contextName = adminData?.contextName;
  const selectedContext = useMemo(
    () =>
      rawSelectedContext ??
      {
        type: adminTargetType ?? 'player',
        name: contextName ?? '',
      },
    [rawSelectedContext, adminTargetType, contextName],
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

  const [videoUrl, setVideoUrl] = useState('');

  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [templateView, setTemplateView] = useState<'active' | 'archived'>('active');
  const [deleteCandidate, setDeleteCandidate] = useState<{ taskId: string; title: string } | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

  const safeTasks = useMemo(() => (tasks || []).filter(Boolean) as Task[], [tasks]);

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
    return safeTasks.filter((t: any) => {
      const title = String(t?.title ?? '').toLowerCase();
      const desc = String(t?.description ?? '').toLowerCase();
      const categoryIds = (((t as any)?.categoryIds ?? []) as string[]).map(String);
      const matchesSearch = !q || title.includes(q) || desc.includes(q);
      const matchesCategory = !selectedCategoryFilterId || categoryIds.includes(selectedCategoryFilterId);
      return matchesSearch && matchesCategory;
    });
  }, [safeTasks, searchQuery, selectedCategoryFilterId]);

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
          taskDurationEnabled: !!(task as any).taskDurationEnabled,
          taskDurationMinutes: normalizeTaskDurationValue((task as any).taskDurationMinutes),
          subtasks: normalizeModalSubtasks((task as any).subtasks),
        } as Task)
      : task;

    setSelectedTask(normalizedTask);
    setIsCreating(creating);
    setIsSaving(false);
    setFormErrors({});
    setVideoUrl(getTaskModalVideoUrl(task) ?? '');
    setIsModalVisible(true);
  }, []);

  const closeTaskModal = useCallback(() => {
    setSelectedTask(null);
    setIsCreating(false);
    setIsModalVisible(false);
    setVideoUrl('');
    setFormErrors({});
    setIsSaving(false);
  }, []);

  const validateTaskForm = useCallback(() => {
    const nextErrors: { title?: string; videoUrl?: string } = {};
    if (!String((selectedTask as any)?.title ?? '').trim()) {
      nextErrors.title = 'Titel er påkrævet.';
    }
    if (videoUrl.trim() && !isValidVideoUrl(videoUrl)) {
      nextErrors.videoUrl = 'Video URL skal være fra YouTube, youtu.be eller Vimeo.';
    }
    setFormErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [selectedTask, videoUrl]);

  const updateTaskTitle = useCallback((text: string) => {
    setFormErrors(prev => ({ ...prev, title: undefined }));
    setSelectedTask(prev => (prev ? ({ ...(prev as any), title: text } as Task) : prev));
  }, []);

  const updateTaskDescription = useCallback((text: string) => {
    setSelectedTask(prev => (prev ? ({ ...(prev as any), description: text } as Task) : prev));
  }, []);

  const updateVideoUrl = useCallback((text: string) => {
    setFormErrors(prev => ({ ...prev, videoUrl: undefined }));
    setVideoUrl(text);
  }, []);

  const addSubtask = useCallback(() => {
    setSelectedTask(prev => {
      if (!prev) return prev;
      const subtasks = normalizeModalSubtasks((prev as any).subtasks);
      return {
        ...(prev as any),
        subtasks: [...subtasks, { id: createLocalSubtaskId(), title: '', completed: false }],
      } as Task;
    });
  }, []);

  const updateSubtask = useCallback((subtaskId: string, title: string) => {
    setSelectedTask(prev => {
      if (!prev) return prev;
      return {
        ...(prev as any),
        subtasks: normalizeModalSubtasks((prev as any).subtasks).map((subtask) =>
          subtask.id === subtaskId ? { ...subtask, title } : subtask
        ),
      } as Task;
    });
  }, []);

  const removeSubtask = useCallback((subtaskId: string) => {
    setSelectedTask(prev => {
      if (!prev) return prev;
      const subtasks = normalizeModalSubtasks((prev as any).subtasks);
      const next = subtasks.filter((subtask) => subtask.id !== subtaskId);
      return { ...(prev as any), subtasks: next.length ? next : subtasks } as Task;
    });
  }, []);

  const executeSaveTask = useCallback(async () => {
    if (!selectedTask) return;

    const normalizedReminder = normalizeReminderValue((selectedTask as any).reminder);
    const normalizedSubtasks = normalizeSubtasksForSave((selectedTask as any).subtasks);
    const successMessage = isCreating ? 'Opgaveskabelon oprettet' : 'Opgaveskabelon opdateret';
    setIsSaving(true);

    try {
      const categoryIds = Array.from(new Set((((selectedTask as any)?.categoryIds ?? []) as string[]).filter(Boolean)));
      const taskToSave = {
        ...selectedTask,
        title: String((selectedTask as any).title ?? '').trim(),
        reminder: normalizedReminder,
        videoUrl: videoUrl.trim() ? videoUrl.trim() : null,
        subtasks: normalizedSubtasks,
        categoryIds,
        afterTrainingEnabled: selectedTask.afterTrainingEnabled ?? false,
        afterTrainingDelayMinutes: selectedTask.afterTrainingEnabled ? (selectedTask.afterTrainingDelayMinutes ?? 0) : null,
        afterTrainingFeedbackEnableScore: selectedTask.afterTrainingFeedbackEnableScore ?? true,
        afterTrainingFeedbackScoreExplanation: selectedTask.afterTrainingFeedbackScoreExplanation ?? null,
        afterTrainingFeedbackEnableNote: selectedTask.afterTrainingFeedbackEnableNote ?? true,
        taskDurationEnabled: selectedTask.taskDurationEnabled ?? false,
        taskDurationMinutes: selectedTask.taskDurationEnabled ? (selectedTask.taskDurationMinutes ?? 0) : null,
        afterTrainingFeedbackEnableIntensity: !!selectedTask.afterTrainingEnabled,
      } as Task;

      if (isCreating) {
        await taskService.createTask({
          task: taskToSave,
          subtasks: normalizedSubtasks,
          adminMode,
          adminTargetType,
          adminTargetId,
        });
      } else {
        if (!updateTask) throw new Error('updateTask er ikke tilgængelig i FootballContext');

        const taskToSave = {
          ...selectedTask,
          title: String((selectedTask as any).title ?? '').trim(),
          reminder: normalizedReminder,
          videoUrl: videoUrl.trim() ? videoUrl.trim() : null,
          subtasks: normalizedSubtasks,
          categoryIds,
          afterTrainingEnabled: selectedTask.afterTrainingEnabled ?? false,
          afterTrainingDelayMinutes: selectedTask.afterTrainingEnabled ? (selectedTask.afterTrainingDelayMinutes ?? 0) : null,
          taskDurationEnabled: selectedTask.taskDurationEnabled ?? false,
          taskDurationMinutes: selectedTask.taskDurationEnabled ? (selectedTask.taskDurationMinutes ?? 0) : null,
          afterTrainingFeedbackEnableIntensity: !!selectedTask.afterTrainingEnabled,
        };

        await updateTask(String((selectedTask as any).id), taskToSave);
      }
      closeTaskModal();

      if (!refreshAll) {
        throw new Error('refreshAll er ikke tilgængelig');
      }

      await refreshAll();
      emitActivitiesRefreshRequested({ reason: 'task_template_saved_from_tasks_screen' });
      Alert.alert('Succes', successMessage);
    } catch (error: any) {
      Alert.alert('Fejl', 'Kunne ikke gemme opgave: ' + (error?.message || 'Ukendt fejl'));
    } finally {
      setIsSaving(false);
    }
  }, [selectedTask, isCreating, adminMode, adminTargetId, adminTargetType, videoUrl, updateTask, refreshAll, closeTaskModal]);

  const handleSaveTask = useCallback(async () => {
    if (!selectedTask) return;
    if (!validateTaskForm()) return;

    if (adminMode !== 'self' && selectedContext?.type) {
      setPendingAction({
        type: isCreating ? 'create' : 'edit',
        data: { task: selectedTask, videoUrl, isCreating },
      });
      setShowConfirmDialog(true);
      return;
    }

    await executeSaveTask();
  }, [selectedTask, adminMode, selectedContext, isCreating, videoUrl, executeSaveTask, validateTaskForm]);

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
        Alert.alert('Fejl', error?.message || 'Kunne ikke opdatere arkivstatus');
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
      Alert.alert('Fejl', error?.message || 'Kunne ikke slette opgaveskabelonen');
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

  const openVideoModal = useCallback((url: string) => {
    if (!isValidVideoUrl(url)) {
      Alert.alert('Fejl', 'Ugyldig video URL. Kun YouTube, youtu.be og Vimeo understøttes.');
      return;
    }
    setSelectedVideoUrl(url);
    setShowVideoModal(true);
  }, []);

  const closeVideoModal = useCallback(() => {
    setShowVideoModal(false);
    setTimeout(() => setSelectedVideoUrl(null), 300);
  }, []);

  const handleDeleteVideo = useCallback(() => {
    Alert.alert('Slet video', 'Er du sikker på at du vil fjerne videoen fra denne opgave?', [
      { text: 'Annuller', style: 'cancel' },
      {
        text: 'Slet',
        style: 'destructive',
        onPress: () => {
          setVideoUrl('');
          Alert.alert('Video fjernet', 'Husk at gemme opgaven for at bekræfte ændringen');
        },
      },
    ]);
  }, []);

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

  const handleTaskDurationToggle = useCallback((value: boolean) => {
    setSelectedTask(prev => {
      if (!prev) return prev;
      const current = normalizeTaskDurationValue((prev as any).taskDurationMinutes);
      return {
        ...(prev as any),
        taskDurationEnabled: value,
        taskDurationMinutes: value ? (current ?? 0) : null,
      } as Task;
    });
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
        subtasks: [{ id: createLocalSubtaskId(), title: '', completed: false }],
        videoUrl: undefined,
        afterTrainingEnabled: false,
        afterTrainingDelayMinutes: 0,
        afterTrainingFeedbackEnableScore: true,
        afterTrainingFeedbackScoreExplanation: '',
        afterTrainingFeedbackEnableIntensity: false,
        afterTrainingFeedbackEnableNote: true,
        taskDurationEnabled: false,
        taskDurationMinutes: null,
      } as any,
      true,
    );
  }, [openTaskModal]);

  const reminderEnabled =
    !!selectedTask && (selectedTask as any).reminder !== null && (selectedTask as any).reminder !== undefined;
  const taskDurationEnabled = !!selectedTask?.taskDurationEnabled;

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
              Her ser du dine egne opgaveskabeloner samt opgaver som din træner har tildelt dig
            </Text>
          </View>
        )}

        <View style={[styles.searchBarWrap, { backgroundColor: cardBgColor, borderColor: isDark ? '#333' : colors.highlight }]}>
          <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={textSecondaryColor} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder="Søg efter opgaver..."
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
                Alle
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
          <Text style={[styles.sectionDividerText, { color: textSecondaryColor }]}>Mapper</Text>
          <LinearGradient
            colors={[withAlpha(colors.highlight, 0), withAlpha(colors.highlight, 0.92), withAlpha(colors.primary, 0.35)]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.sectionDividerLine}
          />
        </View>

        {adminMode !== 'self' && selectedContext?.type ? (
          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            Opgaveskabeloner for {String(selectedContext?.name ?? '')}.
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
              Aktive
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
              Arkiverede
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
            ? 'Ingen opgaver matcher dit filter'
            : templateView === 'active'
              ? 'Ingen aktive opgaveskabeloner'
              : 'Ingen arkiverede opgaveskabeloner'}
        </Text>
      </View>
    );
  }, [searchQuery, selectedCategoryFilterId, cardBgColor, textSecondaryColor, templateView]);

  const ListFooterComponent = useMemo(() => <View style={{ height: 100 }} />, []);

  const modalSubtasks = useMemo(
    () => normalizeModalSubtasks((selectedTask as any)?.subtasks),
    [selectedTask],
  );

  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetType === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  // Show loading spinner when data is being fetched
  if (isLoading) {
    return (
      <AdminContextWrapper isAdmin={isAdminMode} contextName={selectedContext?.name} contextType={adminTargetType || 'player'}>
        <View style={[styles.screen, { backgroundColor: bgColor }]}>
          <View style={styles.topBar}>
            <Text style={[styles.screenTitle, { color: textColor }]} testID="tasks.header.title">Opgaver</Text>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </View>
      </AdminContextWrapper>
    );
  }

  return (
    <AdminContextWrapper isAdmin={isAdminMode} contextName={selectedContext?.name} contextType={adminTargetType || 'player'}>
      <View style={[styles.screen, { backgroundColor: bgColor }]} testID="tasks.screen">
        <View style={styles.topBar}>
          <View style={styles.topBarTitleWrap}>
            <Text
              style={[styles.screenTitle, { color: textColor }]}
              numberOfLines={1}
              ellipsizeMode="tail"
              testID="tasks.header.title"
            >
              Opgaver
            </Text>
            <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]} numberOfLines={1}>
              {templateTasks.length} skabeloner
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.createButton, { backgroundColor: colors.primary }]}
            onPress={openNewTaskModal}
            testID="tasks.header.newTaskButton"
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color="#fff" />
            <Text style={styles.createButtonText}>Ny opgave</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ref={listRef}
          data={folders}
          keyExtractor={(f) => f.id}
          renderItem={renderFolder}
          contentContainerStyle={styles.contentContainer}
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

      <Modal visible={isModalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>{isCreating ? 'Ny opgave' : 'Rediger opgave'}</Text>
              <TouchableOpacity onPress={closeTaskModal} disabled={isSaving}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={28} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={[{ key: 'form' }]}
              keyExtractor={(item) => item.key}
              renderItem={() => (
                <View style={styles.modalBody} testID="tasks.modal.formBody">
                  <Text style={[styles.label, { color: textColor }]}>Titel</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                    value={String((selectedTask as any)?.title ?? '')}
                    onChangeText={updateTaskTitle}
                    placeholder="Opgavens titel"
                    placeholderTextColor={textSecondaryColor}
                    editable={!isSaving}
                    testID="tasks.modal.titleInput"
                  />
                  {formErrors.title ? (
                    <Text style={[styles.errorText, { color: colors.error }]}>{formErrors.title}</Text>
                  ) : null}

                  <Text style={[styles.label, { color: textColor }]}>Beskrivelse</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, { backgroundColor: bgColor, color: textColor }]}
                    value={String((selectedTask as any)?.description ?? '')}
                    onChangeText={updateTaskDescription}
                    placeholder="Beskrivelse af opgaven"
                    placeholderTextColor={textSecondaryColor}
                    multiline
                    numberOfLines={4}
                    editable={!isSaving}
                    testID="tasks.modal.descriptionInput"
                  />

                  <View style={styles.videoSection}>
                    <View style={styles.videoLabelRow}>
                      <Text style={[styles.label, { color: textColor }]}>Indsæt link til video</Text>
                      {videoUrl.trim() ? (
                        <TouchableOpacity
                          style={styles.deleteVideoButton}
                          onPress={handleDeleteVideo}
                          disabled={isSaving}
                          testID="tasks.modal.deleteVideoButton"
                        >
                          <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={18} color={colors.error} />
                          <Text style={[styles.deleteVideoText, { color: colors.error }]}>Slet video</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <TextInput
                      style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                      value={videoUrl}
                      onChangeText={updateVideoUrl}
                      placeholder="https://youtube.com/... eller https://vimeo.com/..."
                      placeholderTextColor={textSecondaryColor}
                      autoCapitalize="none"
                      editable={!isSaving}
                      testID="tasks.modal.videoUrlInput"
                    />

                    {videoUrl.trim() && isValidVideoUrl(videoUrl) && (
                      <View style={styles.videoPreviewSmall}>
                        <TouchableOpacity
                          style={styles.videoPreviewButton}
                          onPress={() => openVideoModal(videoUrl)}
                          activeOpacity={0.8}
                          testID="tasks.modal.videoPreview"
                        >
                          <IconSymbol ios_icon_name="play.circle.fill" android_material_icon_name="play_circle" size={32} color={colors.primary} />
                          <Text style={[styles.videoPreviewText, { color: colors.primary }]}>Forhåndsvisning</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {(formErrors.videoUrl || (videoUrl.trim() && !isValidVideoUrl(videoUrl))) && (
                      <Text style={[styles.errorText, { color: colors.error }]}>
                        {formErrors.videoUrl || 'Video URL skal være fra YouTube, youtu.be eller Vimeo.'}
                      </Text>
                    )}
                  </View>

                  <View style={styles.subtasksSection}>
                    <View style={styles.subtasksHeader}>
                      <Text style={[styles.label, { color: textColor, marginBottom: 0 }]}>Delopgaver</Text>
                      <TouchableOpacity
                        style={[styles.addSubtaskButton, { borderColor: colors.primary }]}
                        onPress={addSubtask}
                        disabled={isSaving}
                        testID="tasks.modal.addSubtaskButton"
                      >
                        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={16} color={colors.primary} />
                        <Text style={[styles.addSubtaskButtonText, { color: colors.primary }]}>Tilføj</Text>
                      </TouchableOpacity>
                    </View>
                    {modalSubtasks.map((subtask) => {
                      const canRemove = modalSubtasks.length > 1;
                      return (
                        <View key={subtask.id} style={styles.subtaskRow}>
                          <TextInput
                            style={[styles.input, styles.subtaskInput, { backgroundColor: bgColor, color: textColor }]}
                            value={subtask.title}
                            onChangeText={(value) => updateSubtask(subtask.id, value)}
                            placeholder="Delopgave"
                            placeholderTextColor={textSecondaryColor}
                            editable={!isSaving}
                            testID={`tasks.modal.subtaskInput.${sanitizeTestIdSegment(subtask.id)}`}
                          />
                          {canRemove ? (
                            <TouchableOpacity
                              style={styles.removeSubtaskButton}
                              onPress={() => removeSubtask(subtask.id)}
                              disabled={isSaving}
                              testID={`tasks.modal.removeSubtask.${sanitizeTestIdSegment(subtask.id)}`}
                            >
                              <IconSymbol ios_icon_name="minus.circle.fill" android_material_icon_name="remove_circle" size={24} color={colors.error} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      );
                    })}
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
                        <Text style={[styles.toggleLabel, { color: textColor }]}>Påmindelse før start</Text>
                        <Text style={[styles.toggleHelperText, { color: textSecondaryColor }]}>
                          Slå til for at vise en påmindelse inden aktiviteten starter.
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
                        <Text style={[styles.label, { color: textColor }]}>Minutter før start</Text>
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
                          0 = på starttidspunktet. Påmindelsen vises før aktivitetens starttid.
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
                        <Text style={[styles.toggleLabel, { color: textColor }]}>Opret efter-træning feedback</Text>
                        <Text style={[styles.toggleHelperText, { color: textSecondaryColor }]}
                        >
                          Når denne skabelon bruges på en aktivitet, oprettes automatisk en efter-træning feedback-opgave til aktiviteten.
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
                        <Text style={[styles.label, { color: textColor }]}>Påmindelse efter slut (minutter)</Text>
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
                          Vises efter aktivitetens sluttidspunkt + valgt delay.
                        </Text>
                        {afterTrainingScoreEnabled ? (
                          <>
                            <Text style={[styles.label, { color: textColor, marginTop: 14 }]}>Score-forklaring</Text>
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
                              placeholder="Forklaring til score-feedback"
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
                        <Text style={[styles.toggleLabel, { color: textColor }]}>Tid på opgave</Text>
                        <Text style={[styles.toggleHelperText, { color: textSecondaryColor }]}>
                          Når slået til tæller opgavetiden i performance-kortet i stedet for aktivitetstiden.
                        </Text>
                      </View>
                      <Switch
                        value={taskDurationEnabled}
                        onValueChange={handleTaskDurationToggle}
                        trackColor={{ false: isDark ? '#555' : '#d0d7e3', true: colors.primary }}
                        thumbColor={Platform.OS === 'android' ? '#fff' : undefined}
                        ios_backgroundColor={isDark ? '#555' : '#d0d7e3'}
                        disabled={isSaving}
                        testID="tasks.template.durationToggle"
                      />
                    </View>

                    {taskDurationEnabled && (
                      <View style={styles.reminderSectionBody}>
                        <Text style={[styles.label, { color: textColor }]}>Varighed (minutter)</Text>
                        <TextInput
                          style={[styles.input, { backgroundColor: bgColor, color: textColor, marginBottom: 0 }]}
                          value={String(selectedTask?.taskDurationMinutes ?? 0)}
                          onChangeText={(text) =>
                            setSelectedTask(prev =>
                              prev
                                ? ({
                                    ...prev,
                                    taskDurationMinutes: normalizeTaskDurationValue(text) ?? 0,
                                  } as Task)
                                : prev
                            )
                          }
                          keyboardType="number-pad"
                          editable={!isSaving}
                          testID="tasks.template.durationMinutesInput"
                        />
                      </View>
                    )}
                  </View>

                  <Text style={[styles.label, { color: textColor }]}>Aktivitetskategorier</Text>
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
                disabled={isSaving}
                testID="tasks.modal.cancelButton"
              >
                <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
                onPress={handleSaveTask}
                disabled={isSaving}
                testID="tasks.modal.saveButton"
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>{isSaving ? 'Gemmer...' : 'Gem'}</Text>
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
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>Opgave video</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
            <SmartVideoPlayer url={selectedVideoUrl || undefined} />
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
            <Text style={[styles.deleteConfirmTitle, { color: textColor }]}>Slet opgaveskabelon</Text>
            <Text style={[styles.deleteConfirmWarning, { color: textColor }]}>
              {DELETE_TEMPLATE_WARNING_TEXT}
            </Text>
            <Text style={[styles.deleteConfirmHelper, { color: textSecondaryColor }]}>
              Skriv {DELETE_TEMPLATE_CONFIRM_TEXT} for at aktivere sletning.
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
                <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
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
                  {isDeleteConfirming ? 'Sletter...' : 'Slet'}
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
        itemType="opgave"
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
      />
    </AdminContextWrapper>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contentContainer: { paddingHorizontal: 18, paddingBottom: 24 },
  topBar: {
    paddingTop: Platform.OS === 'android' ? 54 : 56,
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarTitleWrap: { flex: 1, minWidth: 0 },
  screenTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
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

  videoSection: { marginBottom: 16 },
  videoLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  deleteVideoButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  deleteVideoText: { fontSize: 14, fontWeight: '600' },
  videoPreviewSmall: { marginTop: 8, marginBottom: 12 },
  videoPreviewButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: colors.highlight, borderRadius: 12 },
  videoPreviewText: { fontSize: 16, fontWeight: '600' },
  helperText: { fontSize: 14, marginTop: 4 },
  toggleCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, padding: 16, marginBottom: 20, gap: 12 },
  toggleTextWrapper: { flex: 1, marginRight: 12 },
  toggleLabel: { fontSize: 16, fontWeight: '600' },
  toggleHelperText: { fontSize: 14, lineHeight: 20, marginTop: 6 },

  reminderBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  reminderText: { fontSize: 12, fontWeight: '600' },

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


  subtasksSection: { marginBottom: 18 },
  subtasksHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  addSubtaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addSubtaskButtonText: { fontSize: 13, fontWeight: '800' },
  subtaskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  subtaskInput: { flex: 1, marginBottom: 0 },
  removeSubtaskButton: { padding: 4 },

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
