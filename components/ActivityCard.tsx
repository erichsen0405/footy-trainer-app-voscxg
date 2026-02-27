import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { IconSymbol } from '@/components/IconSymbol';
import { useFootball } from '@/contexts/FootballContext';
import TaskDetailsModal from '@/components/TaskDetailsModal';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { resolveActivityIntensityEnabled } from '@/utils/activityIntensity';

interface ActivityCardProps {
  activity: any;
  resolvedDate: Date;
  onPress?: () => void;
  onPressIntensity?: () => void;
  showTasks?: boolean;
  feedbackActivityId?: string | null;
  feedbackCompletionByTaskId?: Record<string, boolean>;
  feedbackCompletionByTemplateId?: Record<string, boolean>;
  feedbackDone?: boolean;
}

type TaskListItem =
  | { type: 'intensity'; key: string }
  | { type: 'task'; key: string; task: any };

// Helper function to lighten a hex color
function lightenColor(hex: string, percent: number): string {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const newR = Math.min(255, Math.floor(r + (255 - r) * percent));
  const newG = Math.min(255, Math.floor(g + (255 - g) * percent));
  const newB = Math.min(255, Math.floor(b + (255 - b) * percent));
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB
    .toString(16)
    .padStart(2, '0')}`;
}

// Helper function to darken a hex color
function darkenColor(hex: string, percent: number): string {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const newR = Math.floor(r * (1 - percent));
  const newG = Math.floor(g * (1 - percent));
  const newB = Math.floor(b * (1 - percent));
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB
    .toString(16)
    .padStart(2, '0')}`;
}

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

type CategoryMeta = {
  color?: string;
  emoji?: string;
};

// Category gradient mapping (color-based, supports new resolved fields)
const getCategoryGradientFromColor = (color?: string): readonly [string, string] => {
  const baseColor = String(color ?? '').trim();
  if (!baseColor) {
    // Warn only when we truly have no usable color
    console.warn('ActivityCard: No category color found, using fallback gradient');
    return ['#6B7280', '#4B5563'] as const;
  }
  const lighterColor = lightenColor(baseColor, 0.15);
  const darkerColor = darkenColor(baseColor, 0.2);
  return [lighterColor, darkerColor] as const;
};

// Get emoji for category
const getCategoryEmoji = (emoji?: string): string => {
  if (!emoji) return '⚽';
  return emoji;
};

const looksLikeFeedbackTask = (task: any): boolean => {
  if (!task) return false;
  if (task.isFeedbackTask || task.is_feedback_task) return true;
  const direct = task.feedbackTemplateId ?? task.feedback_template_id;
  if (direct !== null && direct !== undefined && String(direct).trim().length > 0) return true;
  if (typeof task.title === 'string' && isFeedbackTitle(task.title)) return true;
  return !!getMarkerTemplateId(task);
};

// Resolve reminder minutes robustly; only inherit after_training_delay for feedback tasks
const resolveReminderMinutes = (task: any): number | null => {
  if (!task) return null;
  let candidate =
    task.reminder_minutes ??
    task.reminderMinutes ??
    task.reminder_minute ??
    task.reminderMinute;

  if (candidate === null || candidate === undefined) {
    if (!looksLikeFeedbackTask(task)) return null;
    candidate =
      task.after_training_delay_minutes ??
      task.afterTrainingDelayMinutes ??
      task.after_training_delay_minutes_value ??
      task.afterTrainingDelayMinutesValue;
  }

  if (candidate === null || candidate === undefined) return null;

  const asString = typeof candidate === 'string' ? candidate.trim().toLowerCase() : null;
  if (asString === 'null' || asString === 'undefined' || asString === '') return null;

  const val =
    typeof candidate === 'string'
      ? parseFloat(candidate)
      : typeof candidate === 'number'
        ? candidate
        : null;

  if (val === null || !Number.isFinite(val)) return null;

  // Keep it numeric; minutes are expected to be whole numbers
  return Math.round(val);
};

const siblingReminderMinutes = (task: any): number | null => {
  if (!task) return null;
  return resolveReminderMinutes(task);
};

// Decode common UTF-8 garbling (e.g., "pÃ¥" -> "på") without altering clean text
const decodeUtf8Garble = (value: unknown): string => {
  const asString = typeof value === 'string' ? value : String(value ?? '');
  const fixScandi = (s: string) =>
    s
      .replace(/Ã¥|Ã…/g, 'å')
      .replace(/Ã¦|Ã†/g, 'æ')
      .replace(/Ã¸|Ã˜/g, 'ø')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ã¶/g, 'ö')
      .replace(/Ã¤/g, 'ä')
      .replace(/Â·/g, '·')
      .replace(/Â°/g, '°')
      .replace(/Â©/g, '©')
      .replace(/Â®/g, '®');

  const looksGarbled = /Ã.|Â./.test(asString);
  const decodeOnce = (s: string) => {
    try {
      return decodeURIComponent(escape(s));
    } catch {
      return s;
    }
  };

  if (!looksGarbled) return fixScandi(asString);

  const first = decodeOnce(asString);
  if (/Ã.|Â./.test(first)) {
    const second = decodeOnce(first);
    return fixScandi(second);
  }
  return fixScandi(first);
};

const coerceMinutes = (val: any): number | null => {
  if (val === null || val === undefined) return null;
  const str = typeof val === 'string' ? val.trim().toLowerCase() : null;
  if (str === 'null' || str === 'undefined' || str === '') return null;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (!Number.isFinite(num)) return null;
  return Math.round(num as number);
};

const normalizeFeedbackTitle = (value?: string | null): string => {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
};

const isFeedbackTitle = (title?: string | null): boolean => {
  if (typeof title !== 'string') return false;
  const normalized = normalizeFeedbackTitle(title);
  return normalized.startsWith('feedback pa');
};

const feedbackTitlePrefixRegex = /^\s*feedback\s+p(?:å|a\u030a|a)\s*[:\s-]*/i;

const splitFeedbackLabelAndName = (title?: string | null): { label: string; name: string } => {
  const decodedTitle = decodeUtf8Garble(title ?? '');
  const trimmedTitle = decodedTitle.trim();
  if (!trimmedTitle) {
    return { label: 'Feedback på:', name: '' };
  }

  const remainder = trimmedTitle.replace(feedbackTitlePrefixRegex, '').trim();
  if (remainder === trimmedTitle) {
    return { label: 'Feedback på:', name: trimmedTitle };
  }
  if (!remainder) {
    return { label: 'Feedback på:', name: '' };
  }

  return { label: 'Feedback på:', name: remainder };
};

const getMarkerTemplateId = (task: any): string | null => {
  if (!task) return null;
  const fromMarker =
    typeof task.description === 'string' ? parseTemplateIdFromMarker(task.description) : null;
  if (fromMarker) return fromMarker;
  if (typeof task.title === 'string') {
    const fromTitle = parseTemplateIdFromMarker(task.title);
    if (fromTitle) return fromTitle;
  }
  return null;
};

export default function ActivityCard({
  activity,
  resolvedDate,
  onPress: _deprecatedOnPress,
  onPressIntensity: _deprecatedOnPressIntensity,
  showTasks = false,
  feedbackActivityId,
  feedbackCompletionByTaskId,
  feedbackCompletionByTemplateId,
  feedbackDone,
}: ActivityCardProps) {
  const router = useRouter();
  const { toggleTaskCompletion, refreshData } = useFootball();
  const suppressCardPressRef = useRef(false);
  const isDark = useColorScheme() === 'dark';

  const activityId = useMemo(() => {
    const raw = activity?.id ?? activity?.activity_id ?? activity?.activityId;
    if (raw === null || raw === undefined) return null;
    const trimmed = String(raw).trim();
    const lowered = trimmed.toLowerCase();
    if (!trimmed.length || lowered === 'undefined' || lowered === 'null') return null;
    return trimmed;
  }, [activity?.activityId, activity?.activity_id, activity?.id]);

  const extractTasksFromActivity = useCallback((source: any): any[] => {
    if (!source) return [];
    const primaryTasks = Array.isArray(source?.tasks) ? source.tasks : [];
    if (primaryTasks.length) return primaryTasks;
    const fallbackTasks =
      Array.isArray(source?.external_tasks) ? source.external_tasks :
      Array.isArray(source?.calendar_tasks) ? source.calendar_tasks :
      [];
    return Array.isArray(fallbackTasks) ? fallbackTasks : [];
  }, []);

  const areTaskListsEqual = useCallback((a: any[], b: any[]) => {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      const aId = a[i]?.id !== undefined && a[i]?.id !== null ? String(a[i].id) : null;
      const bId = b[i]?.id !== undefined && b[i]?.id !== null ? String(b[i].id) : null;
      if (aId !== bId) return false;
      if (!!a[i]?.completed !== !!b[i]?.completed) return false;
    }
    return true;
  }, []);

  // Local optimistic state for tasks
  const [optimisticTasks, setOptimisticTasks] = useState<any[]>(
    () => extractTasksFromActivity(activity)
  );

  // Task modal state (data-driven; no fetch on open)
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isTaskModalSaving, setIsTaskModalSaving] = useState(false);

  // Initialize and update optimistic tasks from activity (incl. external sources)
  useEffect(() => {
    const nextTasks = extractTasksFromActivity(activity);
    setOptimisticTasks(prev => (areTaskListsEqual(prev, nextTasks) ? prev : nextTasks));
  }, [
    activity,
    activity?.id,
    activity?.activity_id,
    activity?.activityId,
    activity?.tasks,
    activity?.external_tasks,
    activity?.calendar_tasks,
    areTaskListsEqual,
    extractTasksFromActivity,
  ]);

  const resolveFeedbackTemplateId = useCallback((task: any): string | null => {
    if (!task) return null;

    const directTemplateId = task.feedbackTemplateId ?? task.feedback_template_id;
    if (directTemplateId !== null && directTemplateId !== undefined) {
      const trimmed = String(directTemplateId).trim();
      if (trimmed.length) return trimmed;
    }

    const markerTemplateId = getMarkerTemplateId(task);
    if (markerTemplateId) return markerTemplateId;

    if (isFeedbackTitle(task.title)) {
      const fallbackTemplateId = task.taskTemplateId ?? task.task_template_id;
      if (fallbackTemplateId !== null && fallbackTemplateId !== undefined) {
        const trimmed = String(fallbackTemplateId).trim();
        if (trimmed.length) return trimmed;
      }
    }

    return null;
  }, []);

  const isFeedbackTask = useCallback(
    (task: any): boolean => {
      if (!task) return false;
      if (task.isFeedbackTask || task.is_feedback_task) {
        return true;
      }

      const direct = task.feedbackTemplateId ?? task.feedback_template_id;
      if (direct !== null && direct !== undefined && String(direct).trim().length > 0) {
        return true;
      }
      return !!getMarkerTemplateId(task) || isFeedbackTitle(task.title);
    },
    []
  );

  const isFeedbackRenderTask = useCallback(
    (task: any): boolean => {
      if (!task) return false;
      if (isFeedbackTask(task)) return true;
      return isFeedbackTitle(task?.title);
    },
    [isFeedbackTask]
  );

  const feedbackTemplateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of Array.isArray(optimisticTasks) ? optimisticTasks : []) {
      if (!isFeedbackTask(task)) continue;
      const templateId = resolveFeedbackTemplateId(task);
      if (!templateId) continue;
      counts[String(templateId)] = (counts[String(templateId)] ?? 0) + 1;
    }
    return counts;
  }, [isFeedbackTask, optimisticTasks, resolveFeedbackTemplateId]);

  const isTaskDone = useCallback(
    (task: any): boolean => {
      if (!task) return false;
      const templateId = resolveFeedbackTemplateId(task);
      if (isFeedbackTask(task)) {
        const rawTaskInstanceId = task?.id ?? task?.task_id;
        const taskInstanceId = normalizeId(rawTaskInstanceId);
        const instanceDone =
          !!taskInstanceId && feedbackCompletionByTaskId?.[taskInstanceId] === true;
        if (instanceDone) return true;

        if (templateId) {
          const templateKey = String(templateId);
          const hasDuplicateTemplate = (feedbackTemplateCounts[templateKey] ?? 0) > 1;
          if (!hasDuplicateTemplate) {
            return (
              feedbackCompletionByTemplateId?.[templateKey] === true ||
              task.completed === true
            );
          }
          return task.completed === true;
        }

        return feedbackDone === true || task.completed === true;
      }
      return task.completed === true;
    },
    [
      feedbackCompletionByTaskId,
      feedbackCompletionByTemplateId,
      feedbackDone,
      feedbackTemplateCounts,
      isFeedbackTask,
      resolveFeedbackTemplateId,
    ]
  );

  const hasTemplateOrFeedback = useCallback((task: any): boolean => {
    if (!task) return false;
    const templateId = task?.task_template_id ?? task?.taskTemplateId;
    const feedbackId = task?.feedback_template_id ?? task?.feedbackTemplateId;
    const markerTemplateId = resolveFeedbackTemplateId(task);

    const templatePresent =
      typeof templateId === 'number' ||
      (typeof templateId === 'string' && templateId.trim().length > 0);
    const feedbackPresent =
      typeof feedbackId === 'number' ||
      (typeof feedbackId === 'string' && feedbackId.trim().length > 0) ||
      (typeof markerTemplateId === 'string' && markerTemplateId.trim().length > 0);

    return templatePresent || feedbackPresent;
  }, [resolveFeedbackTemplateId]);

  const handleCardPress = useCallback(() => {
    if (suppressCardPressRef.current) {
      suppressCardPressRef.current = false;
      return;
    }
    if (!activityId) {
      console.warn('[ActivityCard] Missing activity id for navigation');
      return;
    }
    const encodedId = encodeURIComponent(activityId);
    router.push(`/activity-details?id=${encodedId}&activityId=${encodedId}`);
  }, [activityId, router]);

  const handleIntensityRowPress = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      if (!activityId) return;
      suppressCardPressRef.current = true;
      router.push({
        pathname: '/(modals)/task-score-note',
        params: {
          activityId: String(activity.id ?? activityId),
          initialScore:
            activity?.intensity !== null && activity?.intensity !== undefined
              ? String(activity.intensity)
              : '',
        },
      });
      setTimeout(() => {
        suppressCardPressRef.current = false;
      }, 0);
    },
    [activity?.intensity, activity.id, activityId, router]
  );

  const handleTaskPress = useCallback(
    (task: any, event?: any) => {
      event?.stopPropagation?.();
      const templateId = resolveFeedbackTemplateId(task);
      const rawTaskInstanceId = task?.id ?? task?.task_id;
      const taskInstanceId = normalizeId(rawTaskInstanceId);
      const routeActivityId =
        feedbackActivityId ??
        (activity?.activity_id ?? activity?.activityId) ??
        activity?.id ??
        activityId;
      if (isFeedbackTask(task)) {
        if (templateId && routeActivityId) {
          router.push({
            pathname: '/(modals)/task-feedback-note',
            params: {
              activityId: String(routeActivityId),
              templateId: String(templateId),
              title: String(task.title ?? 'opgave'),
              taskInstanceId: taskInstanceId ?? undefined,
            },
          });
          return;
        }
        handleCardPress();
        return;
      }
      setSelectedTask(task);
      setIsTaskModalOpen(true);
    },
    [
      activity?.activityId,
      activity?.activity_id,
      activity?.id,
      activityId,
      feedbackActivityId,
      handleCardPress,
      isFeedbackTask,
      resolveFeedbackTemplateId,
      router,
    ]
  );

  const handleModalClose = useCallback(() => {
    setIsTaskModalOpen(false);
    setSelectedTask(null);
    Promise.resolve(refreshData()).catch(() => {});
  }, [refreshData]);

  const handleModalComplete = useCallback(async () => {
    if (!selectedTask || isTaskModalSaving) return;
    if (!activityId) {
      console.warn('[ActivityCard] Missing activity id for completion');
      return;
    }

    const taskIdRaw = selectedTask?.id ?? selectedTask?.task_id;
    if (!taskIdRaw) return;
    const taskId = String(taskIdRaw);

    // optimistic set completed = true
    const idx = optimisticTasks.findIndex((candidate) => {
      const candidateId = candidate?.id ?? candidate?.task_id;
      return candidateId !== null && candidateId !== undefined && String(candidateId) === taskId;
    });
    if (idx === -1) return;

    const previous = !!optimisticTasks[idx].completed;
    const nextCompleted = !previous;

    const nextTasks = [...optimisticTasks];
    nextTasks[idx] = { ...optimisticTasks[idx], completed: nextCompleted };
    setOptimisticTasks(nextTasks);

    setIsTaskModalSaving(true);
    try {
      await toggleTaskCompletion(activityId, taskId, nextCompleted);
      Promise.resolve(refreshData()).catch(() => {});
      handleModalClose();
    } catch (error) {
      console.error('❌ Error completing task, rolling back:', error);
      const rollback = [...optimisticTasks];
      rollback[idx] = { ...optimisticTasks[idx], completed: previous };
      setOptimisticTasks(rollback);
    } finally {
      setIsTaskModalSaving(false);
    }
  }, [
    activityId,
    handleModalClose,
    isTaskModalSaving,
    optimisticTasks,
    refreshData,
    selectedTask,
    toggleTaskCompletion,
  ]);

  const formatReminderTime = (reminderMinutes: number | null | undefined) => {
    if (reminderMinutes === null || reminderMinutes === undefined) return null;
    if (reminderMinutes < 60) {
      return `${reminderMinutes}m`;
    }
    const hours = Math.floor(reminderMinutes / 60);
    const remainingMinutes = reminderMinutes % 60;
    if (remainingMinutes === 0) {
      return `${hours}t`;
    }
    return `${hours}t ${remainingMinutes}m`;
  };

  // Resolve category meta (color + emoji) without relying on legacy activity.category
  const resolvedCategoryMeta: CategoryMeta = useMemo(() => {
    const joinedCategory = activity?.activity_categories ?? activity?.activity_category ?? null;
    const legacyCategory = activity?.category ?? null;

    const color =
      activity?.categoryColor ??
      activity?.category_color ??
      joinedCategory?.color ??
      legacyCategory?.color ??
      undefined;

    const emoji = joinedCategory?.emoji ?? legacyCategory?.emoji ?? undefined;

    return { color, emoji };
  }, [activity]);

  const gradientColors = useMemo(
    () => getCategoryGradientFromColor(resolvedCategoryMeta?.color),
    [resolvedCategoryMeta?.color]
  );

  const categoryEmoji = useMemo(
    () => getCategoryEmoji(resolvedCategoryMeta?.emoji),
    [resolvedCategoryMeta?.emoji]
  );

  const dayLabel = format(resolvedDate, 'EEE. d. MMM.', { locale: da });
  const timeLabel = format(resolvedDate, 'HH:mm');
  const location = activity.location || activity.category_location || '';

  const intensityValue = useMemo(() => {
    const raw = activity?.intensity ?? activity?.activity_intensity;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, [activity]);

  const intensityEnabled = useMemo(() => resolveActivityIntensityEnabled(activity), [activity]);
  const hasIntensityValue = typeof intensityValue === 'number';
  const showIntensityRow = intensityEnabled || hasIntensityValue;
  const intensityMissing = !hasIntensityValue;
  const intensityBadgeLabel = intensityMissing ? '–/10' : `${intensityValue}/10`;

  // Card-level reminder badge (min reminder across tasks or activity-level fields)
  const reminderMinutesValue = useMemo(() => {
    const activityLevel =
      coerceMinutes(activity?.minReminderMinutes) ??
      coerceMinutes(activity?.min_reminder_minutes) ??
      coerceMinutes(activity?.min_reminder_minutes_value);

    if (activityLevel !== null) return activityLevel;
    if (!Array.isArray(optimisticTasks) || optimisticTasks.length === 0) return null;

    let min: number | null = null;
    for (const t of optimisticTasks) {
      const v = coerceMinutes(resolveReminderMinutes(t));
      if (v === null) continue;
      if (min === null || v < min) min = v;
    }
    return min;
  }, [activity?.minReminderMinutes, activity?.min_reminder_minutes, activity?.min_reminder_minutes_value, optimisticTasks]);

  useEffect(() => {
    if (!__DEV__) return;
    if (!activity?.is_external) return;

    const firstTask = Array.isArray(optimisticTasks) && optimisticTasks.length > 0 ? optimisticTasks[0] : null;
    console.log('[ActivityCard][external]', {
      title: activity?.title,
      id: activity?.id,
      isExternal: activity?.is_external,
      allTasks: optimisticTasks?.length ?? 0,
      showTasks,
      firstTask: firstTask
        ? {
            id: firstTask.id,
            task_template_id: firstTask.task_template_id,
            feedback_template_id: firstTask.feedback_template_id,
            reminder_minutes: firstTask.reminder_minutes,
            video_url: firstTask.video_url ?? null,
            descriptionSnippet: typeof firstTask.description === 'string' ? firstTask.description.slice(0, 80) : null,
            keys: Object.keys(firstTask).slice(0, 20),
          }
        : null,
    });
  }, [activity?.id, activity?.is_external, activity?.title, optimisticTasks, showTasks]);

  const taskListItems = useMemo<TaskListItem[]>(() => {
    if (showTasks === false) return [];
    const allTasks = Array.isArray(optimisticTasks) ? optimisticTasks : [];
    const visibleTasks = allTasks.filter(task => {
      if (activity?.is_external) {
        return (
          hasTemplateOrFeedback(task) ||
          resolveReminderMinutes(task) !== null ||
          (typeof task.video_url === 'string' && task.video_url.trim().length > 0)
        );
      }
      return showTasks || hasTemplateOrFeedback(task);
    });

    const normalTasks: any[] = [];
    const feedbackTasks: any[] = [];
    visibleTasks.forEach(task => {
      (isFeedbackRenderTask(task) ? feedbackTasks : normalTasks).push(task);
    });
    const orderedTasks = normalTasks.concat(feedbackTasks);

    const items: TaskListItem[] = [];

    const idCounts = new Map<string, number>();
    orderedTasks.forEach((task) => {
      const rawId = task?.id ?? task?.task_id;
      const trimmedId =
        typeof rawId === 'number' || typeof rawId === 'string'
          ? String(rawId).trim()
          : '';
      if (!trimmedId) return;
      idCounts.set(trimmedId, (idCounts.get(trimmedId) ?? 0) + 1);
    });

    if (showIntensityRow) {
      const fallbackId = activityId ?? String(activity?.id ?? 'activity');
      items.push({ type: 'intensity', key: `intensity-${fallbackId}` });
    }

    orderedTasks.forEach((task, index) => {
      const rawId = task?.id ?? task?.task_id;
      const trimmedId =
        typeof rawId === 'number' || typeof rawId === 'string'
          ? String(rawId).trim()
          : '';
      const hasDuplicateId = trimmedId ? (idCounts.get(trimmedId) ?? 0) > 1 : false;
      const templateKeyRaw =
        task?.task_template_id ??
        task?.taskTemplateId ??
        task?.feedback_template_id ??
        task?.feedbackTemplateId ??
        getMarkerTemplateId(task) ??
        '';
      const templateKey = typeof templateKeyRaw === 'number' || typeof templateKeyRaw === 'string'
        ? String(templateKeyRaw).trim()
        : '';
      const taskType = isFeedbackRenderTask(task) ? 'feedback' : 'task';
      const baseKey = trimmedId || `${activityId ?? 'activity'}:${templateKey || 'no-template'}:${taskType}`;
      const fallbackKey = trimmedId
        ? hasDuplicateId
          ? `${baseKey}:${index}`
          : baseKey
        : `${baseKey}:${index}`;
      items.push({ type: 'task', key: `task-${fallbackKey}`, task });
    });

    return items;
  }, [
    activity?.id,
    activity?.is_external,
    activityId,
    hasTemplateOrFeedback,
    isFeedbackRenderTask,
    optimisticTasks,
    showIntensityRow,
    showTasks,
  ]);

  const shouldRenderTasksSection = taskListItems.length > 0;

  return (
    <>
      <Pressable
        onPress={handleCardPress}
        style={({ pressed }) => [pressed && styles.cardPressed]}
        testID="home.activityCardButton"
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.cardContent}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconEmoji}>{categoryEmoji}</Text>
              </View>
            </View>

            {/* Content */}
            <View style={styles.textContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {activity.title || activity.name || 'Uden titel'}
              </Text>

              <View style={styles.detailRow}>
                <Text style={styles.detailIcon}>🕐</Text>
                <Text style={styles.detailText}>
                  {dayLabel} • {timeLabel}
                </Text>
              </View>

              {reminderMinutesValue !== null && (
                <View style={styles.detailRow}>
                  <View style={styles.cardReminderBadge}>
                    <IconSymbol
                      ios_icon_name="bell.fill"
                      android_material_icon_name="notifications"
                      size={10}
                      color="rgba(255, 255, 255, 0.85)"
                    />
                    <Text style={[styles.reminderText, styles.cardReminderText]}>
                      {formatReminderTime(reminderMinutesValue as number)}
                    </Text>
                  </View>
                </View>
              )}

              {location && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>📍</Text>
                  <Text style={styles.detailText} numberOfLines={1}>
                    {location}
                  </Text>
                </View>
              )}

              {activity.is_external && (
                <View style={styles.externalBadge}>
                  <Text style={styles.externalText}>📅 Ekstern kalender</Text>
                </View>
              )}
            </View>

            {/* Chevron Arrow */}
            <View style={styles.arrowContainer}>
              <Text style={styles.arrow}>›</Text>
            </View>
          </View>

          {/* Tasks Section */}
          {shouldRenderTasksSection && (
            <View style={styles.tasksSection}>
              <View style={styles.tasksDivider} />
              {taskListItems.map((item) => {
                if (item.type === 'intensity') {
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={styles.taskRow}
                      onPress={handleIntensityRowPress}
                      activeOpacity={0.7}
                      testID={intensityMissing ? 'home.intensityTaskButton.incomplete' : 'home.intensityTaskButton.completed'}
                    >
                      <View style={styles.intensityRowInner}>
                        <View style={styles.taskCheckboxArea}>
                          <View
                            style={[
                              styles.taskCheckbox,
                              !intensityMissing && styles.taskCheckboxCompleted,
                            ]}
                          >
                            {!intensityMissing && (
                              <IconSymbol
                                ios_icon_name="checkmark"
                                android_material_icon_name="check"
                                size={14}
                                color="#4CAF50"
                              />
                            )}
                          </View>
                        </View>

                        <View style={styles.taskContent}>
                          <View style={styles.taskTitleRow}>
                            <Text style={styles.taskTitle} numberOfLines={1}>
                              Intensitet
                            </Text>

                            <View
                              style={[
                                styles.intensityBadge,
                                intensityMissing
                                  ? styles.intensityBadgeNeutral
                                  : styles.intensityBadgeFilled,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.intensityBadgeText,
                                  intensityMissing
                                    ? styles.intensityBadgeTextNeutral
                                    : styles.intensityBadgeTextFilled,
                                ]}
                              >
                                {intensityBadgeLabel}
                              </Text>
                            </View>
                          </View>

                          {/* Helper text ONLY when enabled AND missing */}
                          {intensityEnabled && intensityMissing && (
                            <Text style={styles.intensityTaskHelper}>Tryk for at angive intensitet</Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }

                const task = (item as any).task;
                const taskCompleted = isTaskDone(task);
                const feedbackTask = isFeedbackTask(task);
                const taskReminder = resolveReminderMinutes(task);
                const templateIdForTask = resolveFeedbackTemplateId(task);
                const siblingReminder =
                  templateIdForTask && feedbackTask
                    ? (() => {
                        const sibling = optimisticTasks.find((candidate) => {
                          if (!candidate || candidate === task) return false;
                          const siblingTemplateId =
                            candidate.task_template_id ?? candidate.taskTemplateId;
                          return (
                            siblingTemplateId !== null &&
                            siblingTemplateId !== undefined &&
                            String(siblingTemplateId).trim() === String(templateIdForTask)
                          );
                        });
                        return siblingReminderMinutes(sibling);
                      })()
                    : null;
                const effectiveReminder =
                  taskReminder !== null
                    ? taskReminder
                    : siblingReminder !== null
                      ? siblingReminder
                      : feedbackTask
                        ? reminderMinutesValue
                        : null;

                return (
                  <React.Fragment key={item.key}>
                    <View style={styles.taskRow}>
                      {/* Checkbox is no longer a toggle; it opens modal (or feedback flow) */}
                      <TouchableOpacity
                        style={styles.taskCheckboxArea}
                        onPress={(e) => handleTaskPress(task, e)}
                        activeOpacity={0.7}
                        testID={
                          feedbackTask
                            ? (taskCompleted ? 'home.feedbackTaskCheckbox.completed' : 'home.feedbackTaskCheckbox.incomplete')
                            : (taskCompleted ? 'home.activityTaskCheckbox.completed' : 'home.activityTaskCheckbox.incomplete')
                        }
                      >
                        <View style={[styles.taskCheckbox, taskCompleted && styles.taskCheckboxCompleted]}>
                          {taskCompleted && (
                            <>
                              <View testID={feedbackTask ? 'home.feedbackTaskCompletedIndicator' : 'home.activityTaskCompletedIndicator'} style={styles.testProbe} />
                              <IconSymbol
                                ios_icon_name="checkmark"
                                android_material_icon_name="check"
                                size={14}
                                color={taskCompleted ? '#4CAF50' : '#fff'}
                              />
                            </>
                          )}
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.taskContent}
                        onPress={(e) => handleTaskPress(task, e)}
                        activeOpacity={0.7}
                        testID={
                          feedbackTask
                            ? (taskCompleted ? 'home.feedbackTaskButton.completed' : 'home.feedbackTaskButton.incomplete')
                            : (taskCompleted ? 'home.activityTaskButton.completed' : 'home.activityTaskButton.incomplete')
                        }
                      >
                        {feedbackTask
                          ? (() => {
                              const { label, name } = splitFeedbackLabelAndName(task.title);
                              return (
                                <View style={styles.taskTitleRow}>
                                  <Text style={[styles.taskTitle, taskCompleted && styles.taskTitleCompleted]}>
                                    <Text style={styles.feedbackTaskLabel}>{label}</Text>
                                    {name ? ` ${name}` : ''}
                                  </Text>
                                </View>
                              );
                            })()
                          : (
                        <View style={styles.taskTitleRow}>
                          <Text
                            style={[styles.taskTitle, taskCompleted && styles.taskTitleCompleted]}
                          >
                            {decodeUtf8Garble(task.title)}
                          </Text>
                        </View>
                            )}

                        {effectiveReminder !== null && (
                          <View style={styles.reminderBadge}>
                            <IconSymbol
                              ios_icon_name="bell.fill"
                              android_material_icon_name="notifications"
                              size={10}
                              color="rgba(255, 255, 255, 0.8)"
                            />
                            <Text style={styles.reminderText}>
                              {formatReminderTime(effectiveReminder!)}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {task.video_url && (
                        <View style={styles.videoIndicator}>
                          <IconSymbol
                            ios_icon_name="play.circle.fill"
                            android_material_icon_name="play_circle"
                            size={20}
                            color="rgba(255, 255, 255, 0.9)"
                          />
                        </View>
                      )}
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          )}
        </LinearGradient>
      </Pressable>

      {/* Normal Task Details Modal (new glass/soft) */}
      {isTaskModalOpen && selectedTask && (
        <TaskDetailsModal
          visible={isTaskModalOpen}
          title={String(selectedTask?.title ?? 'Uden titel')}
          categoryColor={String(resolvedCategoryMeta?.color ?? '#3B82F6')}
          isDark={isDark}
          description={typeof selectedTask?.description === 'string' ? selectedTask.description : undefined}
          reminderMinutes={resolveReminderMinutes(selectedTask)}
          videoUrl={typeof selectedTask?.video_url === 'string' ? selectedTask.video_url : null}
          completed={!!selectedTask?.completed}
          isSaving={isTaskModalSaving}
          onClose={handleModalClose}
          onComplete={handleModalComplete}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    minHeight: 100,
    boxShadow: '0px 4px 14px rgba(0, 0, 0, 0.18)',
    elevation: 5,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Icon
  iconContainer: {
    marginRight: 14,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 30,
  },

  // Text Content
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detailIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.95)',
    flex: 1,
  },
  externalBadge: {
    marginTop: 6,
  },
  externalText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },

  // Chevron Arrow
  arrowContainer: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 40,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 40,
  },

  // Tasks Section
  tasksSection: {
    marginTop: 16,
  },
  tasksDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 12,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  taskCheckboxArea: {
    marginRight: 12,
    padding: 4,
  },
  taskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  taskCheckboxCompleted: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  taskContent: {
    flex: 1,
  },
  taskTitleRow: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.95)',
    flexShrink: 1,
  },
  feedbackTaskLabel: {
    fontWeight: '700',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  intensityBadge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  intensityBadgeFilled: {
    backgroundColor: 'rgba(6, 17, 31, 0.5)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  intensityBadgeNeutral: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(15, 23, 42, 0.2)',
  },
  intensityBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  intensityBadgeTextFilled: {
    color: '#FFFFFF',
  },
  intensityBadgeTextNeutral: {
    color: '#0F172A',
  },
  intensityRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  intensityTaskHelper: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },

  // Reminder Badge
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginLeft: 0,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  reminderText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginLeft: 4,
  },

  // Card-level reminder pill (no left margin)
  cardReminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginLeft: 0,
  },
  cardReminderText: {
    marginLeft: 6,
  },

  // Video Indicator
  videoIndicator: {
    marginLeft: 'auto',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  testProbe: {
    width: 2,
    height: 2,
  },

  // Task Details Modal
  modalContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  modalText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
});
