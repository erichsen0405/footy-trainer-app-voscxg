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
} from 'react-native';

import { useFootball } from '@/contexts/FootballContext';
import { useAdmin } from '@/contexts/AdminContext';
import { Task } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import ContextConfirmationDialog from '@/components/ContextConfirmationDialog';
import { AdminContextWrapper } from '@/components/AdminContextWrapper';
import { supabase } from '@/integrations/supabase/client';
import { taskService } from '@/services/taskService';
import { forceRefreshNotificationQueue } from '@/utils/notificationScheduler';
import { emitActivitiesRefreshRequested } from '@/utils/activityEvents';

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

  return (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("vimeo.com")
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

type FolderType = 'personal' | 'trainer' | 'footballcoach' | 'source';

interface FolderItem {
  id: string;
  name: string;
  type: FolderType;
  icon: string;
  androidIcon: string;
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
    return { icon: 'star.circle.fill', androidIcon: 'stars' };
  }
  if (n.startsWith('fra træner:')) {
    return { icon: 'person.2.fill', androidIcon: 'groups' };
  }
  if (n.includes('personligt') || n.includes('personlige')) {
    return { icon: 'person.crop.circle.fill', androidIcon: 'account_circle' };
  }
  return { icon: 'folder.fill', androidIcon: 'folder' };
}

// Pure function to organize tasks into folders
function organizeFolders(allTasks: Task[]): FolderItem[] {
  const personalTasks: Task[] = [];
  const trainerTasks: Task[] = [];
  const footballCoachTasks: Task[] = [];
  const otherSourceFolders = new Map<string, FolderItem>();

  allTasks.forEach((task: any) => {
    const sfRaw = getTaskSourceFolder(task);
    const sf = sfRaw.toLowerCase();

    if (!sfRaw) {
      personalTasks.push(task);
      return;
    }

    if (sf === 'trainer' || sf === 'fra træner' || sf.startsWith('fra træner:')) {
      trainerTasks.push(task);
      return;
    }

    if (sf === 'footballcoach inspiration') {
      footballCoachTasks.push(task);
      return;
    }

    const sourceId = `source:${sfRaw}`;
    if (!otherSourceFolders.has(sourceId)) {
      const icons = getIconsForFolderName(sfRaw);
      otherSourceFolders.set(sourceId, {
        id: sourceId,
        name: sfRaw,
        type: 'source',
        icon: icons.icon,
        androidIcon: icons.androidIcon,
        tasks: [],
      });
    }
    otherSourceFolders.get(sourceId)!.tasks.push(task);
  });

  const folders: FolderItem[] = [];

  if (personalTasks.length) {
    const icons = getIconsForFolderName('Personligt');
    folders.push({
      id: 'personal',
      name: 'Personligt oprettet',
      type: 'personal',
      icon: icons.icon,
      androidIcon: icons.androidIcon,
      tasks: personalTasks,
    });
  }

  if (trainerTasks.length) {
    const icons = getIconsForFolderName('Fra træner:');
    folders.push({
      id: 'trainer_assigned',
      name: 'Opgaver fra træner',
      type: 'trainer',
      icon: icons.icon,
      androidIcon: icons.androidIcon,
      tasks: trainerTasks,
    });
  }

  if (footballCoachTasks.length) {
    const icons = getIconsForFolderName('FootballCoach Inspiration');
    folders.push({
      id: 'footballcoach',
      name: 'FootballCoach Inspiration',
      type: 'footballcoach',
      icon: icons.icon,
      androidIcon: icons.androidIcon,
      tasks: footballCoachTasks,
    });
  }

  folders.push(...Array.from(otherSourceFolders.values()).sort((a, b) => a.name.localeCompare(b.name)));

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
    getCategoryNames,
    isArchived = false,
  }: {
    task: Task;
    isDark: boolean;
    onPress: () => void;
    onDuplicate: () => void;
    onArchive?: () => void;
    onDelete: () => void;
    onVideoPress: (url: string) => void;
    getCategoryNames: (categoryIds: string[]) => string;
    isArchived?: boolean;
  }) => {
    const videoUrl = (task as any)?.videoUrl ?? null;
    const ytThumb = typeof videoUrl === 'string' && videoUrl.includes('youtu') ? getYouTubeThumbnail(videoUrl) : null;
    const taskId = String((task as any)?.id ?? '');

    return (
      <TouchableOpacity
        style={[styles.taskCard, { backgroundColor: isDark ? '#2a2a2a' : colors.card }]}
        onPress={onPress}
        testID={`tasks.template.card.${taskId}`}
      >
        <View style={styles.taskHeader}>
          <View style={styles.taskHeaderLeft}>
            <IconSymbol ios_icon_name="doc.text" android_material_icon_name="description" size={20} color={colors.secondary} />
            <View style={styles.checkbox} />
            <Text style={[styles.taskTitle, { color: isDark ? '#e3e3e3' : colors.text }]}>{String((task as any)?.title ?? '')}</Text>
          </View>

          <View style={styles.taskActions}>
            <TouchableOpacity onPress={onDuplicate} style={styles.actionButton}>
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
            <TouchableOpacity onPress={onDelete} style={styles.actionButton} testID={`tasks.template.deleteButton.${taskId}`}>
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>

        {videoUrl && isValidVideoUrl(videoUrl) && (
          <TouchableOpacity style={styles.videoThumbnailWrapper} onPress={() => onVideoPress(videoUrl)} activeOpacity={0.85}>
            {ytThumb ? (
              <Image source={{ uri: ytThumb }} style={styles.videoThumbnail} resizeMode="cover" />
            ) : (
              <View style={styles.videoThumbnailFallback} />
            )}
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

        <View style={styles.categoriesRow}>
          <IconSymbol ios_icon_name="tag.fill" android_material_icon_name="label" size={14} color={isDark ? '#999' : colors.textSecondary} />
          <Text style={[styles.categoriesText, { color: isDark ? '#999' : colors.textSecondary }]}>
            Vises automatisk på alle {getCategoryNames((((task as any)?.categoryIds ?? []) as string[]).filter(Boolean))} aktiviteter
          </Text>
        </View>
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
      <View>
        <TouchableOpacity
          style={[styles.folderHeader, { backgroundColor: cardBgColor }]}
          onPress={onToggle}
          testID={`tasks.folder.toggle.${folder.id}`}
        >
          <View style={styles.folderHeaderLeft}>
            <IconSymbol ios_icon_name={folder.icon} android_material_icon_name={folder.androidIcon} size={24} color={colors.primary} />
            <Text style={[styles.folderName, { color: textColor }]}>{folder.name}</Text>
            <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
              <Text style={styles.countBadgeText}>{folder.tasks.length}</Text>
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

  const contextTasks = footballData?.tasks;
  const tasks = useMemo(() => (contextTasks ?? []) as Task[], [contextTasks]);

  const contextCategories = footballData?.categories;
  const categories = useMemo(() => (contextCategories ?? []) as any[], [contextCategories]);

  const duplicateTask = footballData?.duplicateTask as ((taskId: string) => any) | undefined;
  const deleteTask = footballData?.deleteTask as ((taskId: string) => any) | undefined;
  const refreshAll = footballData?.refreshAll as (() => Promise<any>) | undefined;
  const refreshData = footballData?.refreshData as (() => Promise<any>) | undefined;
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
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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

  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return safeTasks;
    return safeTasks.filter((t: any) => {
      const title = String(t?.title ?? '').toLowerCase();
      const desc = String(t?.description ?? '').toLowerCase();
      return title.includes(q) || desc.includes(q);
    });
  }, [safeTasks, searchQuery]);

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
  const folders = useMemo(() => organizeFolders(templateTasks), [templateTasks]);

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
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  }, []);

  const openTaskModal = useCallback(async (task: Task | null, creating: boolean = false) => {
    const normalizedTask = task
      ? ({
          ...(task as any),
          reminder: normalizeReminderValue((task as any).reminder),
          taskDurationEnabled: !!(task as any).taskDurationEnabled,
          taskDurationMinutes: normalizeTaskDurationValue((task as any).taskDurationMinutes),
        } as Task)
      : task;

    setSelectedTask(normalizedTask);
    setIsCreating(creating);
    setIsSaving(false);
    setVideoUrl(String((task as any)?.videoUrl ?? ''));
    setIsModalVisible(true);
  }, []);

  const closeTaskModal = useCallback(() => {
    setSelectedTask(null);
    setIsCreating(false);
    setIsModalVisible(false);
    setVideoUrl('');
    setIsSaving(false);
  }, []);

  const executeSaveTask = useCallback(async () => {
    if (!selectedTask) return;

    const normalizedReminder = normalizeReminderValue((selectedTask as any).reminder);
    const successMessage = isCreating ? 'Opgaveskabelon oprettet' : 'Opgaveskabelon opdateret';
    setIsSaving(true);

    try {
      const categoryIds = Array.from(new Set((((selectedTask as any)?.categoryIds ?? []) as string[]).filter(Boolean)));
      const taskToSave = {
        ...selectedTask,
        reminder: normalizedReminder,
        videoUrl: videoUrl.trim() ? videoUrl.trim() : null,
        categoryIds,
        afterTrainingEnabled: selectedTask.afterTrainingEnabled ?? false,
        afterTrainingDelayMinutes: selectedTask.afterTrainingEnabled ? (selectedTask.afterTrainingDelayMinutes ?? 0) : null,
        afterTrainingFeedbackEnableScore: selectedTask.afterTrainingFeedbackEnableScore ?? true,
        afterTrainingFeedbackScoreExplanation: selectedTask.afterTrainingFeedbackScoreExplanation ?? null,
        afterTrainingFeedbackEnableNote: selectedTask.afterTrainingFeedbackEnableNote ?? true,
        taskDurationEnabled: selectedTask.taskDurationEnabled ?? false,
        taskDurationMinutes: selectedTask.taskDurationEnabled ? (selectedTask.taskDurationMinutes ?? 0) : null,
        // Always enable intensity when persisting feedback settings
        afterTrainingFeedbackEnableIntensity: true,
      } as Task;

      if (isCreating) {
        await taskService.createTask({
          task: taskToSave,
          adminMode,
          adminTargetType,
          adminTargetId,
        });
      } else {
        if (!updateTask) throw new Error('updateTask er ikke tilgængelig i FootballContext');

        const taskToSave = {
          ...selectedTask,
          reminder: normalizedReminder,
          videoUrl: videoUrl.trim() ? videoUrl.trim() : null,
          categoryIds,
          afterTrainingEnabled: selectedTask.afterTrainingEnabled ?? false,
          afterTrainingDelayMinutes: selectedTask.afterTrainingEnabled ? (selectedTask.afterTrainingDelayMinutes ?? 0) : null,
          taskDurationEnabled: selectedTask.taskDurationEnabled ?? false,
          taskDurationMinutes: selectedTask.taskDurationEnabled ? (selectedTask.taskDurationMinutes ?? 0) : null,
          // Force intensity to remain enabled on updates
          afterTrainingFeedbackEnableIntensity: true,
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

    if (adminMode !== 'self' && selectedContext?.type) {
      setPendingAction({
        type: isCreating ? 'create' : 'edit',
        data: { task: selectedTask, videoUrl, isCreating },
      });
      setShowConfirmDialog(true);
      return;
    }

    await executeSaveTask();
  }, [selectedTask, adminMode, selectedContext, isCreating, videoUrl, executeSaveTask]);

  const handleArchiveTask = useCallback(
    async (task: Task) => {
      const taskId = String((task as any)?.id ?? '').trim();
      if (!taskId) return;

      const isArchived = typeof (task as any)?.archivedAt === 'string' && String((task as any).archivedAt).trim().length > 0;

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session?.user?.id) {
          throw new Error('No authenticated user');
        }

        await taskService.setTaskTemplateArchived(taskId, session.user.id, !isArchived);
        await refreshAll?.();
        if (!refreshAll) {
          await forceRefreshNotificationQueue();
        }
      } catch (error: any) {
        Alert.alert('Fejl', error?.message || 'Kunne ikke opdatere arkivstatus');
      }
    },
    [refreshAll],
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
      if (!selectedTask) return;

      const current = new Set((((selectedTask as any)?.categoryIds ?? []) as string[]).filter(Boolean));
      if (current.has(categoryId)) current.delete(categoryId);
      else current.add(categoryId);

      setSelectedTask({ ...(selectedTask as any), categoryIds: Array.from(current) });
    },
    [selectedTask],
  );

  const getCategoryNames = useCallback(
    (categoryIds: string[]) => {
      const uniqueIds = Array.from(new Set((categoryIds ?? []).filter(Boolean)));
      return uniqueIds
        .map((id) => String(categories.find((c: any) => c.id === id)?.name ?? '').toLowerCase())
        .filter(Boolean)
        .join(', ');
    },
    [categories],
  );

  const openVideoModal = useCallback((url: string) => {
    if (!isValidVideoUrl(url)) {
      Alert.alert('Fejl', 'Ugyldig video URL. Kun YouTube og Vimeo understøttes.');
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

  const reminderEnabled =
    !!selectedTask && (selectedTask as any).reminder !== null && (selectedTask as any).reminder !== undefined;
  const taskDurationEnabled = !!selectedTask?.taskDurationEnabled;

  const afterTrainingScoreEnabled = selectedTask?.afterTrainingFeedbackEnableScore ?? true;
  const afterTrainingNoteEnabled = selectedTask?.afterTrainingFeedbackEnableNote ?? true;
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
        getCategoryNames={getCategoryNames}
        isArchived={typeof (task as any)?.archivedAt === 'string' && String((task as any).archivedAt).trim().length > 0}
      />
    ),
    [isDark, openTaskModal, handleDuplicateTask, handleArchiveTask, handleDeleteTask, openVideoModal, getCategoryNames],
  );

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const renderFolder = useCallback(
    ({ item }: { item: FolderItem }) => {
      const isExpanded = expanded.has(item.id);
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
    [expanded, toggleFolder, renderTaskCard, textColor, textSecondaryColor, cardBgColor],
  );

  const ListHeaderComponent = useMemo(() => {
    return (
      <>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Opgaver</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>{templateTasks.length} skabeloner</Text>
        </View>

        {adminMode === 'self' && (
          <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
            <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info" size={20} color={colors.secondary} />
            <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
              Her ser du dine egne opgaveskabeloner samt opgaver som din træner har tildelt dig
            </Text>
          </View>
        )}

        <View style={[styles.searchContainer, { backgroundColor: cardBgColor }]}>
          <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={textSecondaryColor} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder="Søg efter opgaver..."
            placeholderTextColor={textSecondaryColor}
            value={searchQuery}
            onChangeText={setSearchQuery}
            testID="tasks.searchInput"
          />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Skabeloner</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() =>
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
                    afterTrainingEnabled: false,
                    afterTrainingDelayMinutes: 0,
                    afterTrainingFeedbackEnableScore: true,
                    afterTrainingFeedbackScoreExplanation: '',
                    afterTrainingFeedbackEnableNote: true,
                    taskDurationEnabled: false,
                    taskDurationMinutes: null,
                  } as any,
                  true,
                )
              }
              testID="tasks.newTemplateButton"
            >
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add_circle" size={28} color={colors.primary} />
              <Text style={[styles.addButtonText, { color: colors.primary }]}>Ny skabelon</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            {adminMode !== 'self' && selectedContext?.type
              ? `Opgaveskabeloner for ${String(selectedContext?.name ?? '')}. Disse vil automatisk blive tilføjet til relevante aktiviteter.`
              : 'Opgaver organiseret i mapper efter oprindelse'}
          </Text>

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
        </View>
      </>
    );
  }, [
    templateTasks.length,
    adminMode,
    selectedContext,
    isDark,
    textColor,
    textSecondaryColor,
    searchQuery,
    openTaskModal,
    cardBgColor,
    templateView,
  ]);

  const ListEmptyComponent = useMemo(() => {
    return (
      <View style={[styles.emptyState, { backgroundColor: cardBgColor }]}>
        <IconSymbol ios_icon_name="folder" android_material_icon_name="folder_open" size={48} color={textSecondaryColor} />
        <Text style={[styles.emptyStateText, { color: textSecondaryColor }]}>
          {searchQuery
            ? 'Ingen opgaver matcher din søgning'
            : templateView === 'active'
              ? 'Ingen aktive opgaveskabeloner'
              : 'Ingen arkiverede opgaveskabeloner'}
        </Text>
      </View>
    );
  }, [searchQuery, cardBgColor, textSecondaryColor, templateView]);

  const ListFooterComponent = useMemo(() => <View style={{ height: 100 }} />, []);

  const uniqueCategories = useMemo(() => {
    const map = new Map<string, any>();
    (categories ?? []).forEach((c: any) => {
      if (c?.id) map.set(String(c.id), c);
    });
    return Array.from(map.values());
  }, [categories]);

  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetType === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  // Show loading spinner when data is being fetched
  if (isLoading) {
    return (
      <AdminContextWrapper isAdmin={isAdminMode} contextName={selectedContext?.name} contextType={adminTargetType || 'player'}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </AdminContextWrapper>
    );
  }

  return (
    <AdminContextWrapper isAdmin={isAdminMode} contextName={selectedContext?.name} contextType={adminTargetType || 'player'}>
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
                <View style={styles.modalBody} testID="tasks.template.formBody">
                  <Text style={[styles.label, { color: textColor }]}>Titel</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                    value={String((selectedTask as any)?.title ?? '')}
                    onChangeText={(text) => setSelectedTask(selectedTask ? ({ ...(selectedTask as any), title: text } as any) : null)}
                    placeholder="Opgavens titel"
                    placeholderTextColor={textSecondaryColor}
                    editable={!isSaving}
                    testID="tasks.template.titleInput"
                  />

                  <Text style={[styles.label, { color: textColor }]}>Beskrivelse</Text>
                  <TextInput
                    style={[styles.input, styles.textArea, { backgroundColor: bgColor, color: textColor }]}
                    value={String((selectedTask as any)?.description ?? '')}
                    onChangeText={(text) => setSelectedTask(selectedTask ? ({ ...(selectedTask as any), description: text } as any) : null)}
                    placeholder="Beskrivelse af opgaven"
                    placeholderTextColor={textSecondaryColor}
                    multiline
                    numberOfLines={4}
                    editable={!isSaving}
                    testID="tasks.template.descriptionInput"
                  />

                  <View style={styles.videoSection}>
                    <View style={styles.videoLabelRow}>
                      <Text style={[styles.label, { color: textColor }]}>Video URL (YouTube eller Vimeo)</Text>
                      {videoUrl.trim() ? (
                        <TouchableOpacity style={styles.deleteVideoButton} onPress={handleDeleteVideo} disabled={isSaving}>
                          <IconSymbol ios_icon_name="trash.fill" android_material_icon_name="delete" size={18} color={colors.error} />
                          <Text style={[styles.deleteVideoText, { color: colors.error }]}>Slet video</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>

                    <TextInput
                      style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                      value={videoUrl}
                      onChangeText={setVideoUrl}
                      placeholder="https://youtube.com/... eller https://vimeo.com/..."
                      placeholderTextColor={textSecondaryColor}
                      autoCapitalize="none"
                      editable={!isSaving}
                    />

                    {videoUrl.trim() && isValidVideoUrl(videoUrl) && (
                      <View style={styles.videoPreviewSmall}>
                        <TouchableOpacity style={styles.videoPreviewButton} onPress={() => openVideoModal(videoUrl)} activeOpacity={0.8}>
                          <IconSymbol ios_icon_name="play.circle.fill" android_material_icon_name="play_circle" size={32} color={colors.primary} />
                          <Text style={[styles.videoPreviewText, { color: colors.primary }]}>Forhåndsvisning</Text>
                        </TouchableOpacity>
                        <Text style={[styles.helperText, { color: colors.secondary }]}>✓ Video URL gemt</Text>
                      </View>
                    )}

                    {videoUrl.trim() && !isValidVideoUrl(videoUrl) && (
                      <Text style={[styles.helperText, { color: colors.error }]}>⚠ Ugyldig video URL. Kun YouTube og Vimeo understøttes.</Text>
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
                        testID="tasks.template.reminderToggle"
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
                                testID={`tasks.template.reminderOption.${option.value}`}
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
                        testID="tasks.template.feedbackToggle"
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
                                testID={`tasks.template.feedbackDelayOption.${option.value}`}
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
                  <View style={styles.categoriesGrid}>
                    {uniqueCategories.map((category: any, index: number) => {
                      const catId = String(category.id);
                      const catColor = category.color || colors.primary;
                      const selected = !!selectedTask?.categoryIds?.includes?.(catId);

                      return (
                        <TouchableOpacity
                          key={catId}
                          style={[
                            styles.categoryChip,
                            { backgroundColor: selected ? catColor : bgColor, borderColor: catColor, borderWidth: 2 },
                          ]}
                          onPress={() => toggleCategory(catId)}
                          disabled={isSaving}
                          testID={`tasks.template.categoryChip.${index}`}
                        >
                          <Text style={styles.categoryEmoji}>{String(category.emoji ?? '')}</Text>
                          <Text style={[styles.categoryName, { color: selected ? '#fff' : textColor }]}>{String(category.name ?? '')}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              showsVerticalScrollIndicator={false}
            />

            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.modalButton, styles.cancelButton, { backgroundColor: bgColor }]} onPress={closeTaskModal} disabled={isSaving}>
                <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
                onPress={handleSaveTask}
                disabled={isSaving}
                testID="tasks.template.saveButton"
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
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  contentContainer: { paddingHorizontal: 16, paddingBottom: 24 },
  header: { paddingTop: Platform.OS === 'android' ? 60 : 70, paddingBottom: 16 },
  headerTitle: { fontSize: 32, fontWeight: 'bold', marginBottom: 4 },
  headerSubtitle: { fontSize: 16 },
  infoBox: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, borderRadius: 12 },
  infoText: { flex: 1, fontSize: 14, lineHeight: 20 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  section: { marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold' },
  sectionDescription: { fontSize: 14, marginBottom: 12, lineHeight: 20 },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addButtonText: { fontSize: 16, fontWeight: '600' },
  templateViewToggle: { flexDirection: 'row', padding: 4, borderRadius: 12, gap: 6 },
  templateViewToggleButton: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  templateViewToggleText: { fontSize: 14, fontWeight: '600' },
  folderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderRadius: 12, marginBottom: 8 },
  folderHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  folderName: { fontSize: 18, fontWeight: '600', flex: 1 },
  countBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  countBadgeText: { fontSize: 12, fontWeight: 'bold', color: '#fff' },
  folderContent: { marginBottom: 8 },

  emptyState: { padding: 48, borderRadius: 12, alignItems: 'center', gap: 16 },
  emptyStateText: { fontSize: 16, textAlign: 'center' },

  taskCard: { borderRadius: 12, padding: 16, marginBottom: 8 },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  taskHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  checkbox: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  taskTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  taskActions: { flexDirection: 'row', gap: 8 },
  actionButton: { padding: 4 },

  videoThumbnailWrapper: { height: 180, borderRadius: 12, overflow: 'hidden', marginBottom: 12, backgroundColor: '#000' },
  videoThumbnail: { width: '100%', height: '100%' },
  videoThumbnailFallback: { width: '100%', height: '100%', backgroundColor: '#000' },
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

  categoriesRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  categoriesText: { fontSize: 12, flex: 1 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'flex-end' },
  modalContent: { borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: colors.highlight },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },
  modalBody: { padding: 20 },
  label: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  input: { borderRadius: 8, padding: 12, fontSize: 16, marginBottom: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },


  categoriesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  categoryEmoji: { fontSize: 16 },
  categoryName: { fontSize: 14, fontWeight: '600' },

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
