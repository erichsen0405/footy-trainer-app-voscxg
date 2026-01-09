import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';

import { useFootball } from '@/contexts/FootballContext';

// ✅ Robust import: avoid runtime crash if named export "colors" changes
import * as CommonStyles from '@/styles/commonStyles';

import { IconSymbol } from '@/components/IconSymbol';
import { Activity, ActivityCategory, Task, TaskTemplateSelfFeedback } from '@/types';
import EditSeriesDialog from '@/components/EditSeriesDialog';
import DeleteActivityDialog from '@/components/DeleteActivityDialog';
import { useUserRole } from '@/hooks/useUserRole';
import { CreateActivityTaskModal } from '@/components/CreateActivityTaskModal';
import { deleteSingleExternalActivity } from '@/utils/deleteExternalActivities';
import { TaskDescriptionRenderer } from '@/components/TaskDescriptionRenderer';
import { supabase } from '@/app/integrations/supabase/client';
import { TaskScoreNoteModal, TaskScoreNoteModalPayload } from '@/components/TaskScoreNoteModal';
import { fetchSelfFeedbackForTemplates, upsertSelfFeedback } from '@/services/feedbackService';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { resolveActivityIntensityEnabled } from '@/utils/activityIntensity';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import TaskDetailsModal from '@/components/TaskDetailsModal';

const FALLBACK_COLORS = {
  primary: '#3B82F6',
  secondary: '#2563EB',
  accent: '#F59E0B',
  background: '#F2F4F7',
  card: '#FFFFFF',
  text: '#0F172A',
  textSecondary: '#64748B',
  highlight: '#E2E8F0',
  success: '#16A34A',
  error: '#DC2626',
};

const colors =
  ((CommonStyles as any)?.colors as typeof FALLBACK_COLORS | undefined) ?? FALLBACK_COLORS;

type FeedbackTask = Task & {
  feedbackTemplateId?: string | null;
  isFeedbackTask?: boolean;
  taskTemplateId?: string | null;
};

const DAYS_OF_WEEK = [
  { label: 'Søn', value: 0 },
  { label: 'Man', value: 1 },
  { label: 'Tir', value: 2 },
  { label: 'Ons', value: 3 },
  { label: 'Tor', value: 4 },
  { label: 'Fre', value: 5 },
  { label: 'Lør', value: 6 },
];

const RECURRENCE_OPTIONS: {
  label: string;
  value: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
}[] = [
  { label: 'Dagligt', value: 'daily' },
  { label: 'Hver uge', value: 'weekly' },
  { label: 'Hver anden uge', value: 'biweekly' },
  { label: 'Hver tredje uge', value: 'triweekly' },
  { label: 'Månedligt', value: 'monthly' },
];

const normalizeOptionalTime = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

const timeToMinutes = (value?: string | null): number | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [hoursStr, minutesStr] = trimmed.split(':');
  if (hoursStr === undefined || minutesStr === undefined) return null;
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const getTaskVideoUrl = (task: any): string | null => {
  if (!task) return null;
  const camel = typeof task.videoUrl === 'string' ? task.videoUrl.trim() : '';
  if (camel) return camel;
  const snake = typeof task.video_url === 'string' ? task.video_url.trim() : '';
  return snake || null;
};

// --- Supabase select strings (with/without optional video_url) ---
const INTERNAL_SELECT_WITH_VIDEO = `
  id,
  title,
  activity_date,
  activity_time,
  activity_end_time,
  location,
  category_id,
  intensity,
  intensity_enabled,
  is_external,
  external_calendar_id,
  external_event_id,
  series_id,
  series_instance_date,
  activity_categories (
    id,
    name,
    color,
    emoji
  ),
  activity_tasks (
    id,
    title,
    description,
    completed,
    reminder_minutes,
    task_template_id,
    video_url
  )
`;

const INTERNAL_SELECT_NO_VIDEO = `
  id,
  title,
  activity_date,
  activity_time,
  activity_end_time,
  location,
  category_id,
  intensity,
  intensity_enabled,
  is_external,
  external_calendar_id,
  external_event_id,
  series_id,
  series_instance_date,
  activity_categories (
    id,
    name,
    color,
    emoji
  ),
  activity_tasks (
    id,
    title,
    description,
    completed,
    reminder_minutes,
    task_template_id
  )
`;

const EXTERNAL_META_SELECT_WITH_VIDEO = `
  id,
  external_event_id,
  category_id,
  local_title_override,
  activity_categories (
    id,
    name,
    color,
    emoji
  ),
  events_external (
    id,
    title,
    location,
    start_date,
    start_time,
    end_time,
    provider_calendar_id,
    raw_payload
  ),
  external_event_tasks (
    id,
    task_template_id,
    title,
    description,
    completed,
    reminder_minutes,
    video_url
  )
`;

const EXTERNAL_META_SELECT_NO_VIDEO = `
  id,
  external_event_id,
  category_id,
  local_title_override,
  activity_categories (
    id,
    name,
    color,
    emoji
  ),
  events_external (
    id,
    title,
    location,
    start_date,
    start_time,
    end_time,
    provider_calendar_id,
    raw_payload
  ),
  external_event_tasks (
    id,
    task_template_id,
    title,
    description,
    completed,
    reminder_minutes
  )
`;

function isMissingColumn(err: any, colName: string): boolean {
  const needle = String(colName ?? '').toLowerCase();
  if (!needle) return false;
  const hay = [
    err?.message,
    err?.details,
    err?.hint,
    err?.code,
  ]
    .filter(Boolean)
    .map((v) => String(v).toLowerCase())
    .join(' | ');
  return hay.includes(needle);
}

async function selectSingleWithOptionalColumn<T>(opts: {
  table: string;
  selectWith: string;
  selectWithout: string;
  eqColumn: string;
  eqValue: string;
  optionalColumnName: string; // e.g. 'video_url'
  context: string; // for dev logs
}): Promise<{ data: T | null; error: any | null; usedFallback: boolean }> {
  const { table, selectWith, selectWithout, eqColumn, eqValue, optionalColumnName, context } = opts;

  const first = await supabase.from(table).select(selectWith).eq(eqColumn, eqValue).single();
  if (!first.error) return { data: (first.data as T) ?? null, error: null, usedFallback: false };

  if (__DEV__) {
    console.log(`[ActivityDetails][${context}] select(with optional) failed`, {
      table,
      eqColumn,
      eqValue,
      message: first.error?.message,
      details: first.error?.details,
      hint: first.error?.hint,
      code: first.error?.code,
    });
  }

  if (!isMissingColumn(first.error, optionalColumnName)) {
    return { data: null, error: first.error, usedFallback: false };
  }

  const second = await supabase.from(table).select(selectWithout).eq(eqColumn, eqValue).single();

  if (__DEV__) {
    console.log(`[ActivityDetails][${context}] retry(select without "${optionalColumnName}")`, {
      ok: !second.error,
      table,
      eqColumn,
      eqValue,
      message: second.error?.message,
      details: second.error?.details,
      hint: second.error?.hint,
      code: second.error?.code,
    });
  }

  return { data: (second.data as T) ?? null, error: second.error ?? null, usedFallback: true };
}

// Helper function to fetch activity directly from database
async function fetchActivityFromDatabase(activityId: string): Promise<Activity | null> {
  try {
    const { data: internalActivity, error: internalError } = await selectSingleWithOptionalColumn<any>({
      table: 'activities',
      selectWith: INTERNAL_SELECT_WITH_VIDEO,
      selectWithout: INTERNAL_SELECT_NO_VIDEO,
      eqColumn: 'id',
      eqValue: activityId,
      optionalColumnName: 'video_url',
      context: `activities.id=${activityId}`,
    });

    if (!internalError && internalActivity) {
      const internalActivityAny = internalActivity as any;
      const category: ActivityCategory = {
        id: internalActivityAny.activity_categories?.id || internalActivityAny.category_id || '',
        name: internalActivityAny.activity_categories?.name || 'Ukendt kategori',
        color: internalActivityAny.activity_categories?.color || '#999999',
        emoji: internalActivityAny.activity_categories?.emoji || '❓',
      };

      const tasks: FeedbackTask[] = (internalActivityAny.activity_tasks ?? []).map((task: any) => {
        const markerTemplateId = parseTemplateIdFromMarker(task.description || '');
        const isFeedbackTask = !task.task_template_id && !!markerTemplateId;
        const resolvedVideo = getTaskVideoUrl(task);
        const mapped: any = {
          id: task.id,
          title: task.title,
          description: task.description || '',
          completed: task.completed,
          isTemplate: false,
          categoryIds: [],
          reminder_minutes: task.reminder_minutes ?? null,
          reminder: task.reminder_minutes ?? null,
          subtasks: [],
          videoUrl: resolvedVideo ?? undefined,
          video_url: resolvedVideo,
          taskTemplateId: task.task_template_id,
          feedbackTemplateId: markerTemplateId,
          isFeedbackTask,
        };
        return mapped as FeedbackTask;
      });

      return {
        id: internalActivityAny.id,
        title: internalActivityAny.title,
        date: new Date(internalActivityAny.activity_date),
        time: internalActivityAny.activity_time,
        endTime: internalActivityAny.activity_end_time ?? undefined,
        location: internalActivityAny.location || '',
        category,
        tasks,
        isExternal: false,
        externalCalendarId: internalActivityAny.external_calendar_id ?? undefined,
        externalEventId: internalActivityAny.external_event_id ?? undefined,
        seriesId: internalActivityAny.series_id ?? undefined,
        seriesInstanceDate: internalActivityAny.series_instance_date
          ? new Date(internalActivityAny.series_instance_date)
          : undefined,
        intensity: typeof internalActivityAny.intensity === 'number' ? internalActivityAny.intensity : null,
        intensityEnabled: Boolean(internalActivityAny.intensity_enabled),
      };
    }

    const selectExternalMetaBy = async (column: 'id' | 'external_event_id') =>
      selectSingleWithOptionalColumn<any>({
        table: 'events_local_meta',
        selectWith: EXTERNAL_META_SELECT_WITH_VIDEO,
        selectWithout: EXTERNAL_META_SELECT_NO_VIDEO,
        eqColumn: column,
        eqValue: activityId,
        optionalColumnName: 'video_url',
        context: `events_local_meta.${column}=${activityId}`,
      });

    let { data: localMeta, error: metaError } = await selectExternalMetaBy('id');
    if (metaError || !localMeta) {
      const fallback = await selectExternalMetaBy('external_event_id');
      localMeta = fallback.data ?? null;
      metaError = fallback.error ?? metaError;
    }

    if (!metaError && localMeta && (localMeta as any).events_external) {
      const localMetaAny = localMeta as any;
      const externalEvent = localMetaAny.events_external;
      const eventTitle = localMetaAny.local_title_override || externalEvent.title;

      let resolvedCategory: ActivityCategory | null = null;
      if (localMetaAny.activity_categories) {
        resolvedCategory = {
          id: localMetaAny.activity_categories.id,
          name: localMetaAny.activity_categories.name,
          color: localMetaAny.activity_categories.color,
          emoji: localMetaAny.activity_categories.emoji,
        };
      }

      return {
        id: localMetaAny.id,
        title: eventTitle,
        date: new Date(externalEvent.start_date),
        time: externalEvent.start_time,
        endTime: externalEvent.end_time,
        location: externalEvent.location || '',
        category:
          resolvedCategory ?? {
            id: '',
            name: 'Unknown',
            color: '#999999',
            emoji: '❓',
          },
        tasks: (localMetaAny.external_event_tasks || []).map((task: any) => {
          const markerTemplateId = parseTemplateIdFromMarker(task.description || '');
          const isFeedbackTask = !task.task_template_id && !!markerTemplateId;
          const resolvedVideo = getTaskVideoUrl(task);
          const mapped: any = {
            id: task.id,
            title: task.title,
            description: task.description || '',
            completed: task.completed,
            isTemplate: false,
            categoryIds: [],
            reminder_minutes: task.reminder_minutes ?? null,
            reminder: task.reminder_minutes ?? null,
            subtasks: [],
            videoUrl: resolvedVideo ?? undefined,
            video_url: resolvedVideo,
            taskTemplateId: task.task_template_id,
            feedbackTemplateId: markerTemplateId,
            isFeedbackTask,
          };
          return mapped as FeedbackTask;
        }),
        isExternal: true,
        externalCalendarId: externalEvent.provider_calendar_id,
        externalEventId: localMetaAny.external_event_id,
        intensity: null,
        intensityEnabled: false,
      };
    }

    // --- Extra fallback: events_external direct (prevents hard failure on iOS deep links) ---
    if (__DEV__ && metaError) {
      console.log('[ActivityDetails] events_local_meta lookup failed; falling back to events_external', {
        activityId,
        message: metaError?.message,
        details: metaError?.details,
        hint: metaError?.hint,
        code: metaError?.code,
      });
    }

    const { data: externalOnly, error: externalOnlyError } = await supabase
      .from('events_external')
      .select('id,title,location,start_date,start_time,end_time,provider_calendar_id')
      .eq('id', activityId)
      .single();

    if (!externalOnlyError && externalOnly) {
      return {
        id: String(externalOnly.id),
        title: externalOnly.title ?? 'Ekstern aktivitet',
        date: new Date(externalOnly.start_date),
        time: externalOnly.start_time,
        endTime: externalOnly.end_time ?? undefined,
        location: externalOnly.location ?? '',
        category: {
          id: '',
          name: 'Unknown',
          color: '#999999',
          emoji: '❓',
        },
        tasks: [],
        isExternal: true,
        externalCalendarId: externalOnly.provider_calendar_id ?? undefined,
        externalEventId: String(externalOnly.id),
        intensity: null,
        intensityEnabled: false,
      };
    }

    if (__DEV__) {
      console.log('[ActivityDetails] Activity not found after fallbacks', {
        activityId,
        externalOnlyError: externalOnlyError
          ? {
              message: externalOnlyError.message,
              details: externalOnlyError.details,
              hint: externalOnlyError.hint,
              code: externalOnlyError.code,
            }
          : null,
      });
    }

    return null;
  } catch (error) {
    console.error('❌ Error fetching activity from database:', error);
    return null;
  }
}

// Skeleton component for first paint
function ActivityDetailsSkeleton({ isDark }: { isDark: boolean }) {
  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const skeletonColor = isDark ? '#3a3a3a' : '#e0e0e0';

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header Skeleton */}
      <View style={[styles.header, { backgroundColor: skeletonColor }]}>
        <View style={styles.backButtonHeader}>
          <View style={{ width: 28, height: 28, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 14 }} />
        </View>
        <View style={styles.headerContent}>
          <View style={{ width: 64, height: 64, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 32 }} />
          <View style={{ width: 200, height: 28, backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: 14, marginTop: 12 }} />
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Details Section Skeleton */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={{ width: 100, height: 24, backgroundColor: skeletonColor, borderRadius: 12, marginBottom: 20 }} />
          <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 12, marginBottom: 16 }} />
          <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 12, marginBottom: 16 }} />
          <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 12 }} />
        </View>

        {/* Tasks Section Skeleton */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={{ width: 100, height: 24, backgroundColor: skeletonColor, borderRadius: 12, marginBottom: 20 }} />
          <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 12, marginBottom: 12 }} />
          <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 12, marginBottom: 12 }} />
          <View style={{ width: '100%', height: 60, backgroundColor: skeletonColor, borderRadius: 12 }} />
        </View>
      </ScrollView>
    </View>
  );
}

// Content component - only mounts after first paint
interface ActivityDetailsContentProps {
  activity: Activity;
  categories: ActivityCategory[];
  isAdmin: boolean;
  isDark: boolean;
  onBack: () => void;
  onActivityUpdated: (activity: Activity) => void;
  initialFeedbackTaskId?: string | null;
  initialOpenIntensity?: boolean;
}

interface TemplateFeedbackSummary {
  current?: TaskTemplateSelfFeedback;
  previous?: TaskTemplateSelfFeedback;
}

interface FeedbackModalTaskState {
  task: FeedbackTask;
  templateId: string;
}

interface AfterTrainingFeedbackConfig {
  enableScore: boolean;
  scoreExplanation?: string | null;
  enableNote: boolean;
}

interface PreviousFeedbackEntry {
  templateId: string;
  taskTitle: string;
  feedback?: TaskTemplateSelfFeedback;
}

function normalizeScoreExplanation(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function buildFeedbackConfig(row?: any): AfterTrainingFeedbackConfig {
  if (!row) {
    return {
      enableScore: true,
      scoreExplanation: null,
      enableNote: true,
    };
  }

  return {
    enableScore: row.after_training_feedback_enable_score ?? true,
    scoreExplanation: normalizeScoreExplanation(row.after_training_feedback_score_explanation),
    enableNote: row.after_training_feedback_enable_note ?? true,
  };
}

function buildFeedbackSummary(
  feedback?: TaskTemplateSelfFeedback,
  config?: AfterTrainingFeedbackConfig,
): string | null {
  if (!feedback) {
    return null;
  }

  const parts: string[] = [];

  if (config?.enableScore !== false) {
    parts.push(
      typeof feedback.rating === 'number'
        ? `Score ${feedback.rating}/10`
        : 'Score mangler',
    );
  }

  return parts.length ? parts.join(' · ') : null;
}

function extractFeedbackNote(
  feedback?: TaskTemplateSelfFeedback,
  config?: AfterTrainingFeedbackConfig,
): string | null {
  if (!feedback || config?.enableNote === false) {
    return null;
  }

  const trimmed = feedback.note?.trim() ?? '';
  return trimmed.length ? trimmed : null;
}

function isFeedbackAnswered(
  feedback?: TaskTemplateSelfFeedback,
  config?: AfterTrainingFeedbackConfig,
): boolean {
  if (!feedback) return false;

  const enableScore = config?.enableScore !== false;
  const enableNote = config?.enableNote !== false;

  const hasScore = typeof feedback.rating === 'number';
  const hasNote = (feedback.note?.trim() ?? '').length > 0;

  if (enableScore && hasScore) return true;
  if (enableNote && hasNote) return true;

  return false;
}

type TaskListItem =
  | FeedbackTask
  | {
      __type: 'intensity';
      key: string;
    };

function ActivityDetailsContent(props: ActivityDetailsContentProps) {
  const {
    activity,
    categories,
    isAdmin,
    isDark,
    onBack,
    onActivityUpdated,
    initialFeedbackTaskId,
    initialOpenIntensity,
  } = props;
  const router = useRouter();
  const {
    updateActivitySingle,
    updateActivitySeries,
    toggleTaskCompletion,
    deleteActivityTask,
    deleteActivitySingle,
    deleteActivitySeries,
    refreshData,
    createActivity,
    duplicateActivity,
  } = useFootball();
  const scrollViewRef = useRef<ScrollView>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [tasksState, setTasksState] = useState<FeedbackTask[]>((activity.tasks as FeedbackTask[]) || []);

  // --- Feedback template configs + cached self feedback ---
  const [feedbackConfigByTemplate, setFeedbackConfigByTemplate] = useState<
    Record<string, AfterTrainingFeedbackConfig>
  >({});

  const [selfFeedbackByTemplate, setSelfFeedbackByTemplate] = useState<
    Record<string, TemplateFeedbackSummary>
  >({});

  // --- Currently opened feedback modal task ---
  const [feedbackModalTask, setFeedbackModalTask] = useState<FeedbackModalTaskState | null>(null);

  const [selectedNormalTask, setSelectedNormalTask] = useState<FeedbackTask | null>(null);
  const [isNormalTaskModalVisible, setIsNormalTaskModalVisible] = useState(false);
  const [isNormalTaskCompleting, setIsNormalTaskCompleting] = useState(false);
  const normalTaskVideoUrl = useMemo(
    () => (selectedNormalTask ? getTaskVideoUrl(selectedNormalTask) : null),
    [selectedNormalTask]
  );

  const handleNormalTaskComplete = useCallback(async () => {
    if (!selectedNormalTask || selectedNormalTask.completed) return;
    setIsNormalTaskCompleting(true);
    setTasksState(prev =>
      prev.map(t => (t.id === selectedNormalTask.id ? { ...t, completed: true } : t)),
    );
    try {
      await toggleTaskCompletion(activity.id, selectedNormalTask.id, true);
      Promise.resolve(refreshData()).catch(() => {});
      setIsNormalTaskModalVisible(false);
      setSelectedNormalTask(null);
    } catch (err) {
      setTasksState(prev =>
        prev.map(t => (t.id === selectedNormalTask.id ? { ...t, completed: false } : t)),
      );
      Alert.alert('Fejl', 'Kunne ikke markere opgaven som udført. Prøv igen.');
    } finally {
      setIsNormalTaskCompleting(false);
    }
  }, [selectedNormalTask, activity.id, toggleTaskCompletion, refreshData]);
  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#9aa0a6' : colors.textSecondary;

  const [isFeedbackSaving, setIsFeedbackSaving] = useState(false);
  const [feedbackModalError, setFeedbackModalError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [pendingFeedbackTaskId, setPendingFeedbackTaskId] = useState<string | null>(initialFeedbackTaskId ?? null);

  const [isIntensityModalVisible, setIsIntensityModalVisible] = useState(false);
  const [intensityModalDraft, setIntensityModalDraft] = useState<number | null>(
    typeof activity.intensity === 'number' ? activity.intensity : null
  );
  const [isIntensityModalSaving, setIsIntensityModalSaving] = useState(false);
  const [intensityModalError, setIntensityModalError] = useState<string | null>(null);

  const [pendingOpenIntensity, setPendingOpenIntensity] = useState<boolean>(initialOpenIntensity ?? false);

  const resolveFeedbackTemplateId = useCallback(
    (task: FeedbackTask | null | undefined): string | null =>
      task ? task.feedbackTemplateId ?? parseTemplateIdFromMarker(task.description || '') ?? null : null,
    []
  );

  const getFeedbackConfigForTemplate = useCallback(
    (templateId: string | null): AfterTrainingFeedbackConfig => {
      if (!templateId) return buildFeedbackConfig(undefined);
      return feedbackConfigByTemplate[templateId] ?? buildFeedbackConfig(undefined);
    },
    [feedbackConfigByTemplate]
  );

  // --- fetch current user id (used for feedback calls) ---
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setCurrentUserId(null);
          return;
        }
        setCurrentUserId(data.session?.user?.id ?? null);
      } catch {
        if (!cancelled) setCurrentUserId(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- keep tasksState in sync ---
  useEffect(() => {
    setTasksState((activity.tasks as FeedbackTask[]) || []);
  }, [activity.tasks]);

  // --- best-effort: fetch feedback configs + self feedback for templates (non-blocking) ---
  const feedbackTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    for (const t of tasksState) {
      const templateId = resolveFeedbackTemplateId(t);
      if (templateId) ids.add(String(templateId));
    }
    return Array.from(ids);
  }, [resolveFeedbackTemplateId, tasksState]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!feedbackTemplateIds.length) return;

      // configs (best-effort)
      try {
        const { data } = await supabase
          .from('task_templates')
          .select('id, after_training_feedback_enable_score, after_training_feedback_score_explanation, after_training_feedback_enable_note')
          .in('id', feedbackTemplateIds);

        if (!cancelled && Array.isArray(data)) {
          const next: Record<string, AfterTrainingFeedbackConfig> = {};
          for (const row of data as any[]) {
            if (!row?.id) continue;
            next[String(row.id)] = buildFeedbackConfig(row);
          }
          setFeedbackConfigByTemplate(prev => ({ ...prev, ...next }));
        }
      } catch (e) {
        if (__DEV__) console.log('[ActivityDetails] feedback config fetch skipped/failed', e);
      }

      // self feedback (best-effort)
      try {
        if (!currentUserId) return;
        const result = await (fetchSelfFeedbackForTemplates as any)(feedbackTemplateIds, currentUserId);
        if (cancelled) return;

        if (result && typeof result === 'object' && !Array.isArray(result)) {
          setSelfFeedbackByTemplate(result as Record<string, TemplateFeedbackSummary>);
        }
      } catch (e) {
        if (__DEV__) console.log('[ActivityDetails] self feedback fetch skipped/failed', e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, feedbackTemplateIds]);

  // --- deep-link open feedback by task id ---
  useEffect(() => {
    if (!pendingFeedbackTaskId) return;

    const task = tasksState.find(t => String(t.id) === String(pendingFeedbackTaskId));
    if (!task) return;

    const templateId = resolveFeedbackTemplateId(task);
    if (!templateId) return;

    setFeedbackModalTask({ task, templateId });
    setFeedbackModalError(null);
  }, [pendingFeedbackTaskId, resolveFeedbackTemplateId, tasksState]);

  // Edit state
  const [editTitle, setEditTitle] = useState(activity.title);
  const [editLocation, setEditLocation] = useState(activity.location);
  const [editDate, setEditDate] = useState(activity.date);
  const [editTime, setEditTime] = useState(activity.time);
  const [editEndTime, setEditEndTime] = useState(activity.endTime);
  const [editCategory, setEditCategory] = useState<ActivityCategory | null>(activity.category);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [editScope, setEditScope] = useState<'single' | 'series'>('single');
  const [editIntensityEnabled, setEditIntensityEnabled] = useState(resolveActivityIntensityEnabled(activity));
  const [editIntensity, setEditIntensity] = useState<number | null>(
    typeof activity.intensity === 'number' ? activity.intensity : null
  );
  const intensityOptions = useMemo(() => Array.from({ length: 10 }, (_, idx) => idx + 1), []);
  const activityIntensityEnabled = useMemo(() => resolveActivityIntensityEnabled(activity), [activity]);
  const isInternalActivity = !activity.isExternal;
  const currentActivityIntensity = typeof activity.intensity === 'number' ? activity.intensity : null;
  const shouldShowActivityIntensityField = isInternalActivity && !!activityIntensityEnabled;
  const showIntensityTaskRow = isInternalActivity && activityIntensityEnabled;
  const intensityTaskCompleted = showIntensityTaskRow && typeof activity.intensity === 'number';

  useEffect(() => {
    if (isIntensityModalVisible) return;
    setIntensityModalDraft(currentActivityIntensity);
  }, [currentActivityIntensity, isIntensityModalVisible]);

  useEffect(() => {
    setPendingOpenIntensity(initialOpenIntensity ?? false);
  }, [activity.id, initialOpenIntensity]);

  useEffect(() => {
    if (!pendingOpenIntensity) {
      return;
    }

    setPendingOpenIntensity(false);

    if (!showIntensityTaskRow) {
      const message = activity.isExternal
        ? 'Denne aktivitet kommer fra en ekstern kalender og understøtter ikke intensitet.'
        : 'Intensitet er ikke aktiveret for denne aktivitet.';
      Alert.alert('Intensitet ikke tilgængelig', message);
      return;
    }

    setIntensityModalDraft(currentActivityIntensity);
    setIntensityModalError(null);
    setIsIntensityModalVisible(true);
  }, [activity.isExternal, currentActivityIntensity, pendingOpenIntensity, showIntensityTaskRow]);

  // Recurring event conversion state
  const [convertToRecurring, setConvertToRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Scroll to bottom when picker is shown
  useEffect(() => {
    if (showDatePicker || showTimePicker || showEndTimePicker || showEndDatePicker) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [showDatePicker, showTimePicker, showEndTimePicker, showEndDatePicker]);

  // --- sync edit state when activity changes ---
  useEffect(() => {
    setEditTitle(activity.title);
    setEditLocation(activity.location);
    setEditDate(activity.date);
    setEditTime(activity.time);
    setEditEndTime(activity.endTime);
    setEditCategory(activity.category);
    const resolvedFlag = resolveActivityIntensityEnabled(activity);
    setEditIntensityEnabled(resolvedFlag);
    setEditIntensity(typeof activity.intensity === 'number' ? activity.intensity : null);
  }, [activity]);

  useEffect(() => {
    setEditScope('single');
  }, [activity.id]);

  useEffect(() => {
    setPendingFeedbackTaskId(initialFeedbackTaskId ?? null);
  }, [activity.id, initialFeedbackTaskId]);

  const applyActivityUpdates = useCallback(
    (updates: Partial<Activity>) => {
      const nextActivity: Activity = {
        ...activity,
        ...updates,
        category: updates.category ?? activity.category,
        tasks: updates.tasks ?? activity.tasks,
        intensity: updates.intensity !== undefined ? updates.intensity : activity.intensity,
        intensityEnabled:
          updates.intensityEnabled !== undefined
            ? updates.intensityEnabled
            : activity.intensityEnabled,
      };
      onActivityUpdated(nextActivity);
    },
    [activity, onActivityUpdated]
  );

  const handleEditClick = () => {
    if (activity?.seriesId) {
      setEditScope('single');
      setShowSeriesDialog(true);
    } else {
      setEditScope('single');
      setIsEditing(true);
    }
  };

  const handleEditSingle = () => {
    setEditScope('single');
    setShowSeriesDialog(false);
    setIsEditing(true);
  };

  const handleEditAll = () => {
    setEditScope('series');
    setShowSeriesDialog(false);
    setIsEditing(true);
  };

  const handleDuplicate = async () => {
    if (!activity) return;

    if (activity.isExternal) {
      Alert.alert(
        'Kan ikke duplikere',
        'Denne aktivitet er fra en ekstern kalender og kan ikke duplikeres. Kun manuelle aktiviteter kan duplikeres.'
      );
      return;
    }

    Alert.alert(
      'Duplikér aktivitet',
      `Er du sikker på at du vil duplikerte "${activity.title}"? En kopi vil blive oprettet med samme dato, tid, lokation og opgaver.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Duplikér',
          onPress: async () => {
            setIsDuplicating(true);
            try {
              await duplicateActivity(activity.id);
              Alert.alert('Succes', 'Aktiviteten er blevet duplikeret');
              router.replace('/(tabs)/(home)');
            } catch (error: any) {
              console.error('Error duplicating activity:', error);
              Alert.alert('Fejl', error?.message || 'Kunne ikke duplikerte aktiviteten');
            } finally {
              setIsDuplicating(false);
            }
          }
        }
      ]
    );
  };

  const handleIntensityToggle = useCallback((value: boolean) => {
    setEditIntensityEnabled(value);
    if (!value) {
      setEditIntensity(null);
    }
  }, []);

  const handleIntensitySelect = useCallback(
    (value: number) => {
      if (!editIntensityEnabled) return;
      setEditIntensity(value);
    },
    [editIntensityEnabled]
  );

  const closeIntensityModal = useCallback(() => {
    if (isIntensityModalSaving) return;
    setIsIntensityModalVisible(false);
    setIntensityModalError(null);
  }, [isIntensityModalSaving]);

  const persistActivityIntensity = useCallback(
    async (value: number | null) => {
      if (!showIntensityTaskRow) return;
      setIsIntensityModalSaving(true);
      const previousIntensity = typeof activity.intensity === 'number' ? activity.intensity : null;

      setIntensityModalError(null);
      applyActivityUpdates({ intensity: value });

      try {
        await updateActivitySingle(activity.id, { intensity: value });
        setIsIntensityModalSaving(false);
        setIsIntensityModalVisible(false);
        setIntensityModalError(null);
        refreshData();
      } catch (error) {
        console.error('[Details] Error saving intensity:', error);
        applyActivityUpdates({ intensity: previousIntensity });
        setIsIntensityModalSaving(false);
        setIntensityModalError('Kunne ikke gemme intensitet. Prøv igen.');
      }
    },
    [activity.id, activity.intensity, applyActivityUpdates, refreshData, showIntensityTaskRow, updateActivitySingle]
  );

  const handleIntensityModalSave = useCallback(
    ({ score }: TaskScoreNoteModalPayload) => {
      persistActivityIntensity(typeof score === 'number' ? score : null);
    },
    [persistActivityIntensity]
  );

  const handleIntensityRowPress = useCallback(() => {
    if (!showIntensityTaskRow) return;
    if (isIntensityModalSaving) return;
    setIntensityModalDraft(typeof activity.intensity === 'number' ? activity.intensity : null);
    setIntensityModalError(null);
    setIsIntensityModalVisible(true);
  }, [activity.intensity, isIntensityModalSaving, showIntensityTaskRow]);

  const handleSave = async () => {
    if (!activity) return;

    const endTimePayload = isInternalActivity ? normalizeOptionalTime(editEndTime) : undefined;
    const intensityPayload = editIntensityEnabled ? editIntensity ?? null : null;
    const trimmedTime = (editTime ?? '').trim();
    let safeTime: string | null = null;

    if (isInternalActivity) {
      if (!trimmedTime) {
        Alert.alert('Fejl', 'Starttidspunkt er påkrævet.');
        return;
      }

      const startMinutes = timeToMinutes(trimmedTime);
      if (startMinutes === null) {
        Alert.alert('Fejl', 'Ugyldigt starttidspunkt. Benyt formatet HH:MM.');
        return;
      }

      if (endTimePayload) {
        const endMinutes = timeToMinutes(endTimePayload);
        if (endMinutes === null) {
          Alert.alert('Fejl', 'Ugyldigt sluttidspunkt. Benyt formatet HH:MM.');
          return;
        }
        if (endMinutes <= startMinutes) {
          Alert.alert('Fejl', 'Sluttidspunkt skal være efter starttidspunkt.');
          return;
        }
      }

      safeTime = trimmedTime;
    }

    const effectiveTime = safeTime ?? activity.time;

    setIsSaving(true);

    try {
      if (convertToRecurring && isInternalActivity && !activity.seriesId) {
        if ((recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') && selectedDays.length === 0) {
          Alert.alert('Fejl', 'Vælg venligst mindst én dag for gentagelse');
          return;
        }

        await createActivity({
          title: editTitle,
          location: editLocation,
          categoryId: editCategory?.id || activity.category.id,
          date: editDate,
          time: effectiveTime,
          endTime: endTimePayload,
          intensity: intensityPayload,
          intensityEnabled: editIntensityEnabled,
          isRecurring: true,
          recurrenceType,
          recurrenceDays:
            recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly'
              ? selectedDays
              : undefined,
          endDate: hasEndDate ? endDate : undefined,
        });

        await deleteActivitySingle(activity.id);
        await refreshData();

        Alert.alert('Succes', 'Aktiviteten er blevet konverteret til en gentagende serie');
        setIsEditing(false);
        setEditScope('single');
        router.replace('/(tabs)/(home)');
        return;
      }

      if (activity.isExternal) {
        await updateActivitySingle(activity.id, {
          categoryId: editCategory?.id,
        });

        applyActivityUpdates({
          category: editCategory || activity.category,
        });

        await refreshData();

        Alert.alert('Gemt', 'Kategorien er blevet opdateret');
        setIsEditing(false);
        setEditScope('single');
        return;
      }

      if (activity.seriesId && editScope === 'series') {
        await updateActivitySeries(activity.seriesId, {
          title: editTitle,
          location: editLocation,
          categoryId: editCategory?.id,
          time: effectiveTime,
          endTime: endTimePayload,
          intensityEnabled: editIntensityEnabled,
          intensity: intensityPayload,
        });

        applyActivityUpdates({
          title: editTitle,
          location: editLocation,
          category: editCategory || activity.category,
          time: effectiveTime,
          endTime: endTimePayload,
          intensityEnabled: editIntensityEnabled,
          intensity: intensityPayload,
        });

        Alert.alert('Gemt', 'Hele serien er blevet opdateret');
        setIsEditing(false);
        setEditScope('single');
        await refreshData();
        return;
      }

      await updateActivitySingle(activity.id, {
        title: editTitle,
        location: editLocation,
        categoryId: editCategory?.id,
        date: editDate,
        time: effectiveTime,
        endTime: endTimePayload,
        intensityEnabled: editIntensityEnabled,
        intensity: intensityPayload,
      });

      applyActivityUpdates({
        title: editTitle,
        location: editLocation,
        category: editCategory || activity.category,
        date: editDate,
        time: effectiveTime,
        endTime: endTimePayload,
        intensityEnabled: editIntensityEnabled,
        intensity: intensityPayload,
      });

      Alert.alert('Gemt', 'Aktiviteten er blevet opdateret');
      setIsEditing(false);
      setEditScope('single');
      await refreshData();
    } catch (error) {
      console.error('Error saving activity:', error);
      Alert.alert('Fejl', 'Der opstod en fejl ved gemning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (!activity) return;

    const resolvedFlag = resolveActivityIntensityEnabled(activity);
    const resolvedValue = typeof activity.intensity === 'number' ? activity.intensity : null;

    setEditTitle(activity.title);
    setEditLocation(activity.location);
    setEditDate(new Date(activity.date));
    setEditTime(activity.time);
    setEditEndTime(activity.endTime);
    setEditCategory(activity.category);
    setConvertToRecurring(false);
    setIsEditing(false);
    setEditScope('single');
    setEditIntensityEnabled(resolvedFlag);
    setEditIntensity(resolvedValue);
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setEditDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setEditTime(`${hours}:${minutes}`);
    }
  };

  const handleWebTimeChange = (event: any) => {
    const value = event.target.value;
    if (value) {
      setEditTime(value);
    }
  };

  const handleEndTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndTimePicker(false);
    }
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setEditEndTime(`${hours}:${minutes}`);
    }
  };

  const handleWebEndTimeChange = (event: any) => {
    const value = event.target.value;
    setEditEndTime(value);
  };

  const handleEndDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowEndDatePicker(false);
    }
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleTaskRowPress = useCallback((task: FeedbackTask) => {
    const templateId = resolveFeedbackTemplateId(task);
    const isFeedbackTaskLocal =
      task.isFeedbackTask === true ||
      (!!templateId && !task.taskTemplateId);

    if (isFeedbackTaskLocal && templateId) {
      setFeedbackModalTask({ task, templateId });
      setPendingFeedbackTaskId(String(task.id));
      return;
    }

    // --- C) Normal task: open shared modal, do not toggle directly ---
    setSelectedNormalTask(task);
    setIsNormalTaskModalVisible(true);
  }, [resolveFeedbackTemplateId]);

  const handleDeleteTask = useCallback((taskId: string) => {
    if (!activity || !isAdmin) return;

    Alert.alert(
      'Slet opgave',
      'Er du sikker på at du vil slette denne opgave? Dette sletter kun opgaven fra denne aktivitet, ikke opgaveskabelonen.',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            setDeletingTaskId(taskId);
            try {
              console.log('🗑️ Attempting to delete task:', taskId, 'from activity:', activity.id);
              await deleteActivityTask(activity.id, taskId);
              console.log('✅ Task deleted successfully');
              setTasksState(prev => prev.filter(task => String(task.id) !== String(taskId)));
              refreshData();
              Alert.alert('Slettet', 'Opgaven er blevet slettet fra denne aktivitet');
            } catch (error: any) {
              console.error('❌ Error deleting task:', error);
              Alert.alert('Fejl', `Kunne ikke slette opgaven: ${error?.message || 'Ukendt fejl'}`);
            } finally {
              setDeletingTaskId(null);
            }
          }
        }
      ]
    );
  }, [activity, deleteActivityTask, isAdmin, refreshData]);

  const handleAddTask = () => {
    console.log('Opening create task modal for activity:', activity?.id);
    setShowCreateTaskModal(true);
  };

  const handleTaskCreated = useCallback(async () => {
    console.log('Task created successfully, refreshing activity data');
    setShowCreateTaskModal(false);
    try {
      const refreshedActivity = await fetchActivityFromDatabase(activity.id);
      if (refreshedActivity?.tasks) {
        setTasksState((refreshedActivity.tasks as FeedbackTask[]) || []);
      }
    } catch (error) {
      console.error('Error refreshing tasks after creation:', error);
    }
    refreshData();
  }, [activity.id, refreshData]);

  const previousFeedbackEntries = useMemo<PreviousFeedbackEntry[]>(() => {
    const seen = new Set<string>();
    const entries: PreviousFeedbackEntry[] = [];

    for (const t of tasksState) {
      const templateId = resolveFeedbackTemplateId(t);
      if (!templateId || seen.has(templateId)) continue;
      seen.add(templateId);

      const prev = selfFeedbackByTemplate[templateId]?.previous;
      if (!prev) continue;

      entries.push({
        templateId,
        taskTitle: t.title,
        feedback: prev,
      });
    }

    return entries;
  }, [resolveFeedbackTemplateId, selfFeedbackByTemplate, tasksState]);

  const taskListItems = useMemo<TaskListItem[]>(() => {
    const items: TaskListItem[] = [];
    if (showIntensityTaskRow) {
      items.push({ __type: 'intensity', key: `intensity-${String(activity.id)}` });
    }
    items.push(...(tasksState || []));
    return items;
  }, [activity.id, showIntensityTaskRow, tasksState]);

  const renderTaskItem = useCallback(
    ({ item }: { item: TaskListItem }) => {
      if ('__type' in item) {
        return (
          <TouchableOpacity
            style={[
              styles.taskRow,
              { backgroundColor: isDark ? '#1f1f1f' : '#f8f9fb' },
            ]}
            onPress={(event) => {
              event.stopPropagation();
              handleIntensityRowPress();
            }}
            activeOpacity={0.7}
            disabled={isIntensityModalSaving}
          >
            <View style={styles.taskCheckboxArea}>
              <View
                style={[
                  styles.taskCheckbox,
                  intensityTaskCompleted && { backgroundColor: colors.success, borderColor: colors.success },
                ]}
              >
                {intensityTaskCompleted && (
                  <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
                )}
              </View>
              <View style={styles.taskContent}>
                <View style={styles.taskTitleRow}>
                  <Text
                    style={[
                      styles.taskTitle,
                      { color: textColor },
                    ]}
                  >
                    Intensitet
                  </Text>
                  {intensityTaskCompleted && (
                    <Text style={[styles.intensityTaskValue, { color: textSecondaryColor }]}>
                      {`${activity.intensity}/10`}
                    </Text>
                  )}
                </View>
                {!intensityTaskCompleted && (
                  <Text style={[styles.intensityTaskHelper, { color: textSecondaryColor }]}>
                    Tryk for at angive intensitet
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        );
      }

      const task = item;

      const templateId = resolveFeedbackTemplateId(task);
      const config = getFeedbackConfigForTemplate(templateId);
      const feedback = templateId ? selfFeedbackByTemplate[templateId]?.current : undefined;

      const isFeedbackTaskLocal =
        task.isFeedbackTask === true ||
        (!!templateId && !task.taskTemplateId);

      const isFeedbackCompleted = isFeedbackTaskLocal
        ? isFeedbackAnswered(feedback, config)
        : false;

      const scoreExplanation =
        isFeedbackTaskLocal && config.enableScore !== false
          ? (config.scoreExplanation ?? null)
          : null;

      const summary = isFeedbackTaskLocal ? buildFeedbackSummary(feedback, config) : null;

      let helperText = 'Tryk for at åbne';
      if (isFeedbackTaskLocal) {
        if (isFeedbackCompleted) {
          const parts = [summary].filter(Boolean) as string[];
          helperText = parts.length ? parts.join(' · ') : 'Feedback udfyldt';
        } else {
          if (config.enableScore !== false) {
            helperText = 'Tryk for at give feedback';
          } else if (config.enableNote !== false) {
            helperText = 'Tryk for at skrive note';
          } else {
            helperText = 'Tryk for at give feedback';
          }
        }
      }

      return (
        <TouchableOpacity
          style={[styles.taskRow, { backgroundColor: isDark ? '#1f1f1f' : '#f8f9fb' }]}
          onPress={() => handleTaskRowPress(task)}
          activeOpacity={0.7}
        >
          <View style={styles.taskCheckboxArea}>
            <View
              style={[
                styles.taskCheckbox,
                task.completed && !isFeedbackTaskLocal && { backgroundColor: colors.success, borderColor: colors.success },
                isFeedbackTaskLocal && styles.feedbackTaskCheckbox,
                isFeedbackCompleted && { backgroundColor: colors.success, borderColor: colors.success },
              ]}
            >
              {!isFeedbackTaskLocal && task.completed && (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
              )}
              {isFeedbackTaskLocal &&
                (isFeedbackCompleted ? (
                  <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
                ) : (
                  <IconSymbol ios_icon_name="bubble.left" android_material_icon_name="chat" size={16} color={colors.primary} />
                ))}
            </View>

            <View style={styles.taskContent}>
              <Text
                style={[
                  styles.taskTitle,
                  { color: textColor },
                  task.completed && !isFeedbackTaskLocal && styles.taskCompleted,
                ]}
              >
                {task.title}
              </Text>

              {!isFeedbackTaskLocal && task.description ? (
                <TaskDescriptionRenderer description={task.description} textColor={textSecondaryColor} />
              ) : null}

              {isFeedbackTaskLocal && (
                <>
                  {scoreExplanation ? (
                    <Text style={[styles.feedbackExplanationText, { color: textSecondaryColor }]}>
                      {scoreExplanation}
                    </Text>
                  ) : null}
                  <Text style={[styles.feedbackHelperText, { color: textSecondaryColor }]}>
                    {helperText}
                  </Text>
                </>
              )}
            </View>
          </View>

          {isAdmin && !isFeedbackTaskLocal && (
            <TouchableOpacity
              style={[styles.taskDeleteButton, { backgroundColor: isDark ? '#3a1a1a' : '#ffe5e5' }]}
              onPress={() => handleDeleteTask(String(task.id))}
              activeOpacity={0.7}
              disabled={deletingTaskId === String(task.id)}
            >
              {deletingTaskId === String(task.id) ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={22} color={colors.error} />
              )}
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      );
    },
    [
      activity.intensity,
      deletingTaskId,
      getFeedbackConfigForTemplate,
      handleDeleteTask,
      handleIntensityRowPress,
      handleTaskRowPress,
      isAdmin,
      isDark,
      isIntensityModalSaving,
      intensityTaskCompleted,
      resolveFeedbackTemplateId,
      selfFeedbackByTemplate,
      textColor,
      textSecondaryColor,
    ]
  );

  const taskKeyExtractor = useCallback((item: TaskListItem) => ('__type' in item ? item.key : String(item.id)), []);

  const handleDeleteClick = () => {
    if (activity?.isExternal) {
      Alert.alert(
        'Slet ekstern aktivitet',
        `Er du sikker på at du vil slette "${activity.title}"?\n\nDenne aktivitet er fra en ekstern kalender. Hvis du sletter den her, vil den blive importeret igen ved næste synkronisering, medmindre du sletter den i den eksterne kalender eller fjerner kalenderen fra din profil.`,
        [
          { text: 'Annuller', style: 'cancel' },
          {
            text: 'Slet',
            style: 'destructive',
            onPress: handleDeleteExternalActivity,
          }
        ]
      );
      return;
    }
    setShowDeleteDialog(true);
  };

  const handleDeleteExternalActivity = async () => {
    if (!activity) return;

    setIsDeleting(true);
    try {
      const result = await deleteSingleExternalActivity(activity.id);

      if (!result.success) {
        throw new Error(result.error || 'Kunne ikke slette aktiviteten');
      }

      router.replace('/(tabs)/(home)');

      setTimeout(() => {
        Alert.alert('Slettet', 'Den eksterne aktivitet er blevet slettet fra din app');
      }, 300);
    } catch (error: any) {
      console.error('❌ Error deleting external activity:', error);
      Alert.alert('Fejl', `Kunne ikke slette aktiviteten: ${error?.message || 'Ukendt fejl'}`);
      setIsDeleting(false);
    }
  };

  const handleDeleteSingle = async () => {
    if (!activity) return;

    setIsDeleting(true);
    try {
      await deleteActivitySingle(activity.id);
      router.replace('/(tabs)/(home)');

      setTimeout(() => {
        Alert.alert('Slettet', 'Aktiviteten er blevet slettet');
      }, 300);
    } catch (error: any) {
      console.error('❌ Error deleting activity:', error);
      Alert.alert('Fejl', `Kunne ikke slette aktiviteten: ${error?.message || 'Ukendt fejl'}`);
      setIsDeleting(false);
    }
  };

  const handleDeleteSeries = async () => {
    if (!activity || !activity.seriesId) return;

    setIsDeleting(true);
    try {
      await deleteActivitySeries(activity.seriesId);
      router.replace('/(tabs)/(home)');

      setTimeout(() => {
        Alert.alert('Slettet', 'Hele serien er blevet slettet');
      }, 300);
    } catch (error: any) {
      console.error('❌ Error deleting series:', error);
      Alert.alert('Fejl', `Kunne ikke slette serien: ${error?.message || 'Ukendt fejl'}`);
      setIsDeleting(false);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatDateTime = (date: Date, time: string) => {
    const timeDisplay = time.substring(0, 5);
    return `${formatDate(date)} kl. ${timeDisplay}`;
  };

  const needsDaySelection =
    recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly';

  const handleFeedbackClose = useCallback(() => {
    setFeedbackModalTask(null);
    setPendingFeedbackTaskId(null);
    setFeedbackModalError(null);
  }, []);

  const handleFeedbackSave = useCallback(
    async ({ score, note }: TaskScoreNoteModalPayload) => {
      if (!feedbackModalTask) return;

      setFeedbackModalError(null);
      setIsFeedbackSaving(true);

      // --- A) Robust resolvedActivityId logic ---
      // Only try: a) activity?.id, b) feedbackModalTask.task.activity_id
      let resolvedActivityId: string | null = null;
      let triedActivityId: any = null;
      let triedFeedbackTaskActivityId: any = null;

      try {
        // a) Current activity.id (from ActivityDetails state)
        triedActivityId = activity?.id;
        if (typeof triedActivityId === 'string' && String(triedActivityId).trim().length > 0) {
          resolvedActivityId = String(triedActivityId).trim();
        }
        // b) feedbackModalTask.task.activity_id (if present)
        if (!resolvedActivityId) {
          triedFeedbackTaskActivityId = (feedbackModalTask.task as any)?.activity_id;
          if (typeof triedFeedbackTaskActivityId === 'string' && String(triedFeedbackTaskActivityId).trim().length > 0) {
            resolvedActivityId = String(triedFeedbackTaskActivityId).trim();
          }
        }
      } catch (err) {
        // Defensive: should never throw
        resolvedActivityId = null;
      }

      if (!resolvedActivityId) {
        console.error(
          '[ActivityDetails] Feedback save failed: missing activity_id',
          {
            triedActivityId,
            triedFeedbackTaskActivityId,
            feedbackModalTask,
            activity,
          }
        );
        Alert.alert(
          'Kunne ikke gemme',
          'Aktiviteten mangler et ID. Prøv at lukke og åbne aktiviteten igen.'
        );
        setIsFeedbackSaving(false);
        return;
      }

      if (!currentUserId) {
        console.error('[ActivityDetails] Feedback save failed: missing currentUserId', {
          currentUserId,
          feedbackModalTask,
          activity,
        });
        Alert.alert('Kunne ikke gemme', 'Bruger-ID mangler. Prøv at logge ind igen.');
        setIsFeedbackSaving(false);
        return;
      }

      try {
        await (upsertSelfFeedback as any)({
          templateId: feedbackModalTask.templateId,
          userId: currentUserId,
          rating: score,
          note,
          activity_id: String(resolvedActivityId).trim(),
          activityId: String(resolvedActivityId).trim(), // <-- back-compat: always send both
        });
        Promise.resolve(refreshData()).catch(() => {});
        handleFeedbackClose();
      } catch (e) {
        console.error('[ActivityDetails] feedback save failed:', e);
        setFeedbackModalError('Kunne ikke gemme feedback lige nu. Prøv igen.');
      } finally {
        setIsFeedbackSaving(false);
      }
    },
    [currentUserId, feedbackModalTask, handleFeedbackClose, refreshData, activity]
  );

  const feedbackModalConfig = useMemo(() => {
    if (!feedbackModalTask) return undefined;
    return getFeedbackConfigForTemplate(feedbackModalTask.templateId);
  }, [feedbackModalTask, getFeedbackConfigForTemplate]);

  const feedbackModalDefaults = useMemo(() => {
    if (!feedbackModalTask) return { rating: null as number | null, note: '' };
    const cur = selfFeedbackByTemplate[feedbackModalTask.templateId]?.current;
    return {
      rating: typeof cur?.rating === 'number' ? cur.rating : null,
      note: cur?.note ?? '',
    };
  }, [feedbackModalTask, selfFeedbackByTemplate]);

  // --- Helper: Strip leading "Feedback på" from a title (case-insensitive, trims) ---
  function stripLeadingFeedbackPrefix(title: string): string {
    if (typeof title !== 'string') return title;
    let t = title.trim();
    // Remove leading "Feedback på" (case-insensitive), plus any following whitespace
    t = t.replace(/^feedback på\s*/i, '');
    // Fallback: if empty, return original
    return t.length ? t : title;
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: bgColor }]}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: activity.category.color }]}>
        <TouchableOpacity
          style={styles.backButtonHeader}
          onPress={isEditing ? handleCancel : onBack}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name={isEditing ? 'xmark' : 'chevron.left'}
            android_material_icon_name={isEditing ? 'close' : 'arrow_back'}
            size={28}
            color="#fff"
          />
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.headerEmoji}>{activity.category.emoji}</Text>
          <Text style={styles.headerTitle} numberOfLines={2}>
            {activity.title}
          </Text>
          {activity.seriesId && (
            <View style={styles.seriesBadge}>
              <IconSymbol
                ios_icon_name="repeat"
                android_material_icon_name="repeat"
                size={16}
                color="#fff"
              />
              <Text style={styles.seriesBadgeText}>Serie</Text>
            </View>
          )}
        </View>

        <View style={styles.headerButtons}>
          {isEditing ? (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={handleSave}
              activeOpacity={0.7}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <IconSymbol
                  ios_icon_name="checkmark"
                  android_material_icon_name="check"
                  size={26}
                  color="#fff"
                />
              )}
            </TouchableOpacity>
          ) : (
            <>
              {!activity.isExternal && (
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleDuplicate}
                  activeOpacity={0.7}
                  disabled={isDuplicating}
                >
                  {isDuplicating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <IconSymbol
                      ios_icon_name="doc.on.doc"
                      android_material_icon_name="content_copy"
                      size={24}
                      color="#fff"
                    />
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleEditClick}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="pencil"
                  android_material_icon_name="edit"
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.headerButton}
                onPress={handleDeleteClick}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="trash"
                  android_material_icon_name="delete"
                  size={24}
                  color="#fff"
                />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activity.isExternal && (
          <View style={[styles.externalBadge, { backgroundColor: colors.secondary }]}>
            <IconSymbol
              ios_icon_name="calendar.badge.clock"
              android_material_icon_name="event"
              size={20}
              color="#fff"
            />
            <Text style={styles.externalBadgeText}>Ekstern aktivitet</Text>
          </View>
        )}

        {/* Activity Details */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Detaljer</Text>

          {/* Title */}
          {isEditing && !activity.isExternal ? (
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Titel</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="Aktivitetens titel"
                placeholderTextColor={textSecondaryColor}
              />
            </View>
          ) : (
            <View style={styles.detailRow}>
              <IconSymbol
                ios_icon_name="text.alignleft"
                android_material_icon_name="subject"
                size={24}
                color={activity.category.color}
              />
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: textSecondaryColor }]}>Titel</Text>
                <Text style={[styles.detailValue, { color: textColor }]}>{activity.title}</Text>
              </View>
            </View>
          )}

          {/* Date & Time */}
          {isEditing && !activity.isExternal && !activity.seriesId ? (
            <>
              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Dato</Text>
                <TouchableOpacity
                  style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                  onPress={() => setShowDatePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dateTimeText, { color: textColor }]}>
                    {formatDate(editDate)}
                  </Text>
                  <IconSymbol
                    ios_icon_name="calendar"
                    android_material_icon_name="calendar_today"
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                {Platform.OS === 'ios' && showDatePicker && (
                  <View style={[styles.pickerContainer, { backgroundColor: bgColor }]}>
                    <DateTimePicker
                      value={editDate}
                      mode="date"
                      display="spinner"
                      onChange={handleDateChange}
                      textColor={textColor as any}
                      style={styles.iosPicker}
                    />
                    <TouchableOpacity
                      style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]}
                      onPress={() => setShowDatePicker(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.pickerDoneText}>Færdig</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Tidspunkt</Text>
                {Platform.OS === 'web' ? (
                  // @ts-expect-error Raw HTML time input is only available in the web build
                  <input
                    type="time"
                    value={(editTime || '').substring(0, 5)}
                    onChange={handleWebTimeChange}
                    style={{
                      backgroundColor: bgColor,
                      color: textColor,
                      borderRadius: 12,
                      padding: 16,
                      fontSize: 17,
                      border: 'none',
                      width: '100%',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                      onPress={() => setShowTimePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateTimeText, { color: textColor }]}>{(editTime || '').substring(0, 5)}</Text>
                      <IconSymbol
                        ios_icon_name="clock"
                        android_material_icon_name="access_time"
                        size={20}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                    {Platform.OS === 'ios' && showTimePicker && (
                      <View style={[styles.pickerContainer, { backgroundColor: bgColor }]}>
                        <DateTimePicker
                          value={new Date(`2000-01-01T${editTime}`)}
                          mode="time"
                          display="spinner"
                          onChange={handleTimeChange}
                          textColor={textColor as any}
                          style={styles.iosPicker}
                        />
                        <TouchableOpacity
                          style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]}
                          onPress={() => setShowTimePicker(false)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.pickerDoneText}>Færdig</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Sluttidspunkt</Text>
                {Platform.OS === 'web' ? (
                  // @ts-expect-error Raw HTML time input is only available in the web build
                  <input
                    type="time"
                    value={editEndTime ? editEndTime.substring(0, 5) : ''}
                    onChange={handleWebEndTimeChange}
                    style={{
                      backgroundColor: bgColor,
                      color: textColor,
                      borderRadius: 12,
                      padding: 16,
                      fontSize: 17,
                      border: 'none',
                      width: '100%',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                      onPress={() => setShowEndTimePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateTimeText, { color: textColor }]}>
                        {editEndTime ? editEndTime.substring(0, 5) : 'Vælg sluttidspunkt'}
                      </Text>
                      <IconSymbol
                        ios_icon_name="clock.fill"
                        android_material_icon_name="schedule"
                        size={20}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                    {Platform.OS === 'ios' && showEndTimePicker && (
                      <View style={[styles.pickerContainer, { backgroundColor: bgColor }]}>
                        <DateTimePicker
                          value={editEndTime ? new Date(`2000-01-01T${editEndTime}`) : new Date()}
                          mode="time"
                          display="spinner"
                          onChange={handleEndTimeChange}
                          textColor={textColor as any}
                          style={styles.iosPicker}
                        />
                        <TouchableOpacity
                          style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]}
                          onPress={() => setShowEndTimePicker(false)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.pickerDoneText}>Færdig</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>

              {Platform.OS === 'android' && showDatePicker && (
                <DateTimePicker
                  value={editDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                />
              )}

              {Platform.OS === 'android' && showTimePicker && (
                <DateTimePicker
                  value={new Date(`2000-01-01T${editTime}`)}
                  mode="time"
                  display="default"
                  onChange={handleTimeChange}
                />
              ) }

              {Platform.OS === 'android' && showEndTimePicker && (
                <DateTimePicker
                  value={editEndTime ? new Date(`2000-01-01T${editEndTime}`) : new Date()}
                  mode="time"
                  display="default"
                  onChange={handleEndTimeChange}
                />
              )}
            </>
          ) : isEditing && activity.seriesId ? (
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Tidspunkt</Text>
              {Platform.OS === 'web' ? (
                // @ts-expect-error Raw HTML time input is only available in the web build
                <input
                  type="time"
                  value={(editTime || '').substring(0, 5)}
                  onChange={handleWebTimeChange}
                  style={{
                    backgroundColor: bgColor,
                    color: textColor,
                    borderRadius: 12,
                    padding: 16,
                    fontSize: 17,
                    border: 'none',
                    width: '100%',
                    fontFamily: 'inherit',
                  }}
                />
              ) : (
                <>
                  <TouchableOpacity
                    style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                    onPress={() => setShowTimePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateTimeText, { color: textColor }]}>{(editTime || '').substring(0, 5)}</Text>
                    <IconSymbol
                      ios_icon_name="clock"
                      android_material_icon_name="access_time"
                      size={20}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                  {Platform.OS === 'ios' && showTimePicker && (
                    <View style={[styles.pickerContainer, { backgroundColor: bgColor }]}>
                      <DateTimePicker
                        value={new Date(`2000-01-01T${editTime}`)}
                        mode="time"
                        display="spinner"
                        onChange={handleTimeChange}
                        textColor={textColor as any}
                        style={styles.iosPicker}
                      />
                      <TouchableOpacity
                        style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]}
                        onPress={() => setShowTimePicker(false)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.pickerDoneText}>Færdig</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  {Platform.OS === 'android' && showTimePicker && (
                    <DateTimePicker
                      value={new Date(`2000-01-01T${editTime}`)}
                      mode="time"
                      display="default"
                      onChange={handleTimeChange}
                    />
                  )}
                </>
              )}

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Sluttidspunkt</Text>
                {Platform.OS === 'web' ? (
                  // @ts-expect-error Raw HTML time input is only available in the web build
                  <input
                    type="time"
                    value={editEndTime ? editEndTime.substring(0, 5) : ''}
                    onChange={handleWebEndTimeChange}
                    style={{
                      backgroundColor: bgColor,
                      color: textColor,
                      borderRadius: 12,
                      padding: 16,
                      fontSize: 17,
                      border: 'none',
                      width: '100%',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                      onPress={() => setShowEndTimePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateTimeText, { color: textColor }]}>
                        {editEndTime ? editEndTime.substring(0, 5) : 'Vælg sluttidspunkt'}
                      </Text>
                      <IconSymbol
                        ios_icon_name="clock.fill"
                        android_material_icon_name="schedule"
                        size={20}
                        color={colors.primary}
                      />
                    </TouchableOpacity>
                    {Platform.OS === 'ios' && showEndTimePicker && (
                      <View style={[styles.pickerContainer, { backgroundColor: bgColor }]}>
                        <DateTimePicker
                          value={editEndTime ? new Date(`2000-01-01T${editEndTime}`) : new Date()}
                          mode="time"
                          display="spinner"
                          onChange={handleEndTimeChange}
                          textColor={textColor as any}
                          style={styles.iosPicker}
                        />
                        <TouchableOpacity
                          style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]}
                          onPress={() => setShowEndTimePicker(false)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.pickerDoneText}>Færdig</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>

              {Platform.OS === 'android' && showEndTimePicker && (
                <DateTimePicker
                  value={editEndTime ? new Date(`2000-01-01T${editEndTime}`) : new Date()}
                  mode="time"
                  display="default"
                  onChange={handleEndTimeChange}
                />
              )}
            </View>
          ) : (
            <View style={styles.detailRow}>
              <IconSymbol
                ios_icon_name="calendar.badge.clock"
                android_material_icon_name="event"
                size={24}
                color={activity.category.color}
              />
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: textSecondaryColor }]}>
                  Dato & Tidspunkt
                </Text>
                <Text style={[styles.detailValue, { color: textColor }]}>
                  {formatDateTime(activity.date, activity.time)}
                  {activity.endTime && ` - ${activity.endTime.substring(0, 5)}`}
                </Text>
              </View>
            </View>
          )}

          {/* Location */}
          {isEditing && !activity.isExternal ? (
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Lokation</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={editLocation}
                onChangeText={setEditLocation}
                placeholder="Hvor finder aktiviteten sted?"
                placeholderTextColor={textSecondaryColor}
              />
            </View>
          ) : (
            <View style={styles.detailRow}>
              <IconSymbol
                ios_icon_name="mappin.circle"
                android_material_icon_name="location_on"
                size={24}
                color={activity.category.color}
              />
              <View style={styles.detailContent}>
                <Text style={[styles.detailLabel, { color: textSecondaryColor }]}>Lokation</Text>
                <Text style={[styles.detailValue, { color: textColor }]}>
                  {activity.location}
                </Text>
              </View>
            </View>
          )}

          {/* Category */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, { color: textColor }]}>Kategori</Text>
            {isEditing ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
              >
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={`category-${cat.id}`}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor:
                          editCategory?.id === cat.id ? cat.color : bgColor,
                        borderColor: cat.color,
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => setEditCategory(cat)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                    <Text
                      style={[
                        styles.categoryName,
                        {
                          color: editCategory?.id === cat.id ? '#fff' : textColor,
                        },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.detailRow}>
                <View
                  style={[
                    styles.categoryIndicator,
                    { backgroundColor: activity.category.color },
                  ]}
                />
                <View style={styles.detailContent}>
                  <Text style={[styles.detailValue, { color: textColor }]}>
                    {activity.category.emoji} {activity.category.name}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Intensity */}
          {!activity.isExternal && (
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Intensitet</Text>
              {isEditing ? (
                <>
                  <View style={[styles.intensityToggleRow, { backgroundColor: bgColor }]}>
                    <View style={styles.intensityToggleLabel}>
                      <IconSymbol
                        ios_icon_name="flame"
                        android_material_icon_name="local_fire_department"
                        size={20}
                        color={textColor}
                      />
                      <Text style={[styles.switchLabel, { color: textColor }]}>Tilføj intensitet</Text>
                    </View>
                    <Switch
                      value={editIntensityEnabled}
                      onValueChange={handleIntensityToggle}
                      trackColor={{ false: '#767577', true: colors.primary }}
                      thumbColor={editIntensityEnabled ? '#fff' : '#f4f3f4'}
                    />
                  </View>

                  {editIntensityEnabled && (
                    <>
                      <Text style={[styles.intensityHint, { color: textSecondaryColor }]}>1 = let · 10 = maks</Text>
                      <View style={styles.intensityPickerRow}>
                        {intensityOptions.map(option => {
                          const isSelected = editIntensity === option;
                          return (
                            <TouchableOpacity
                              key={`intensity-${option}`}
                              style={[styles.intensityPickerChip, isSelected && styles.intensityPickerChipSelected]}
                              onPress={() => handleIntensitySelect(option)}
                              activeOpacity={0.7}
                            >
                              <Text style={[styles.intensityPickerText, isSelected && styles.intensityPickerTextSelected]}>
                                {option}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}
                </>
              ) : shouldShowActivityIntensityField ? (
                <View style={styles.detailRow}>
                  <IconSymbol
                    ios_icon_name="flame"
                    android_material_icon_name="local_fire_department"
                    size={24}
                    color={activity.category.color}
                  />
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: textSecondaryColor }]}>
                      Intensitet
                    </Text>
                    <Text style={[styles.detailValue, { color: textColor }]}>
                      {typeof activity.intensity === 'number' ? `${activity.intensity}/10` : 'Ikke angivet'}
                    </Text>
                  </View>
                </View>
              ) : (
                <View style={styles.detailRow}>
                  <IconSymbol
                    ios_icon_name="flame"
                    android_material_icon_name="local_fire_department"
                    size={24}
                    color={activity.category.color}
                  />
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: textSecondaryColor }]}>
                      Intensitet
                    </Text>
                    <Text style={[styles.detailValue, { color: textColor }]}>
                      Ikke aktiveret
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Convert to recurring (only while editing, internal, not already series) */}
          {isEditing && isInternalActivity && !activity.seriesId && (
            <>
              <View style={styles.fieldContainer}>
                <TouchableOpacity
                  style={styles.recurringToggle}
                  onPress={() => setConvertToRecurring(!convertToRecurring)}
                  activeOpacity={0.7}
                >
                  <View style={styles.recurringToggleLeft}>
                    <IconSymbol
                      ios_icon_name="repeat"
                      android_material_icon_name="repeat"
                      size={24}
                      color={convertToRecurring ? colors.primary : textSecondaryColor}
                    />
                    <Text style={[styles.recurringToggleText, { color: textColor }]}>
                      Konverter til gentagende event
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.toggle,
                      { backgroundColor: convertToRecurring ? colors.primary : colors.highlight },
                    ]}
                  >
                    <View
                      style={[
                        styles.toggleThumb,
                        convertToRecurring && styles.toggleThumbActive,
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              {convertToRecurring && (
                <>
                  <View style={styles.fieldContainer}>
                    <Text style={[styles.fieldLabel, { color: textColor }]}>Gentagelsesmønster</Text>
                    <View style={styles.recurrenceOptions}>
                      {RECURRENCE_OPTIONS.map((option) => (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.recurrenceOption,
                            {
                              backgroundColor:
                                recurrenceType === option.value ? colors.primary : bgColor,
                              borderColor: colors.primary,
                              borderWidth: 2,
                            },
                          ]}
                          onPress={() => {
                            setRecurrenceType(option.value);
                            if (
                              option.value !== 'weekly' &&
                              option.value !== 'biweekly' &&
                              option.value !== 'triweekly'
                            ) {
                              setSelectedDays([]);
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.recurrenceOptionText,
                              { color: recurrenceType === option.value ? '#fff' : textColor },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {needsDaySelection && (
                    <View style={styles.fieldContainer}>
                      <Text style={[styles.fieldLabel, { color: textColor }]}>
                        Vælg dage *
                      </Text>
                      <View style={styles.daysContainer}>
                        {DAYS_OF_WEEK.map((day) => (
                          <TouchableOpacity
                            key={day.value}
                            style={[
                              styles.dayButton,
                              {
                                backgroundColor: selectedDays.includes(day.value)
                                  ? colors.primary
                                  : bgColor,
                                borderColor: colors.primary,
                                borderWidth: 2,
                              },
                            ]}
                            onPress={() => toggleDay(day.value)}
                            activeOpacity={0.7}
                          >
                            <Text
                              style={[
                                styles.dayButtonText,
                                {
                                  color: selectedDays.includes(day.value) ? '#fff' : textColor,
                                },
                              ]}
                            >
                              {day.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  <View style={styles.fieldContainer}>
                    <TouchableOpacity
                      style={styles.recurringToggle}
                      onPress={() => setHasEndDate(!hasEndDate)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.recurringToggleLeft}>
                        <IconSymbol
                          ios_icon_name="calendar.badge.clock"
                          android_material_icon_name="event_available"
                          size={24}
                          color={hasEndDate ? colors.primary : textSecondaryColor}
                        />
                        <Text style={[styles.recurringToggleText, { color: textColor }]}>
                          Sæt slutdato
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.toggle,
                          { backgroundColor: hasEndDate ? colors.primary : colors.highlight },
                        ]}
                      >
                        <View
                          style={[
                            styles.toggleThumb,
                            hasEndDate && styles.toggleThumbActive,
                          ]}
                        />
                      </View>
                    </TouchableOpacity>
                  </View>

                  {hasEndDate && (
                    <View style={styles.fieldContainer}>
                      <Text style={[styles.fieldLabel, { color: textColor }]}>Slutdato</Text>
                      <TouchableOpacity
                        style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                        onPress={() => setShowEndDatePicker(true)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.dateTimeText, { color: textColor }]}>
                          {formatDate(endDate)}
                        </Text>
                        <IconSymbol
                          ios_icon_name="calendar"
                          android_material_icon_name="calendar_today"
                          size={20}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                      {Platform.OS === 'ios' && showEndDatePicker && (
                        <View style={[styles.pickerContainer, { backgroundColor: bgColor }]}>
                          <DateTimePicker
                            value={endDate}
                            mode="date"
                            display="spinner"
                            onChange={handleEndDateChange}
                            minimumDate={editDate}
                            textColor={textColor as any}
                            style={styles.iosPicker}
                          />
                          <TouchableOpacity
                            style={[styles.pickerDoneButton, { backgroundColor: colors.primary }]}
                            onPress={() => setShowEndDatePicker(false)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.pickerDoneText}>Færdig</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}

                  {Platform.OS === 'android' && showEndDatePicker && (
                    <DateTimePicker
                      value={endDate}
                      mode="date"
                      display="default"
                      onChange={handleEndDateChange}
                      minimumDate={editDate}
                    />
                  )}
                </>
              )}
            </>
          )}
        </View>

        {previousFeedbackEntries.length > 0 && (
          <View
            style={[
              styles.infoBox,
              styles.feedbackInfoBox,
              { backgroundColor: isDark ? '#2a2a2a' : '#f8f9fb' },
            ]}
          >
            <View style={styles.feedbackInfoHeader}>
              <IconSymbol
                ios_icon_name="info.circle"
                android_material_icon_name="info"
                size={22}
                color={colors.primary}
              />
              <Text style={[styles.feedbackInfoTitle, { color: textColor }]}>Sidste feedback</Text>
            </View>
            {previousFeedbackEntries.map(entry => {
              const config = feedbackConfigByTemplate[entry.templateId];
              const summaryText = buildFeedbackSummary(entry.feedback, config) || 'Ingen svar registreret';
              const noteText = extractFeedbackNote(entry.feedback, config);

              return (
                <View key={entry.templateId} style={styles.feedbackInfoRow}>
                  <Text style={[styles.feedbackInfoTaskTitle, { color: textColor }]}>
                    {entry.taskTitle}
                  </Text>
                  <Text style={[styles.feedbackInfoRating, { color: colors.primary }]}>
                    {summaryText}
                  </Text>
                  {noteText ? (
                    <Text style={[styles.feedbackInfoNote, { color: textSecondaryColor }]}>
                      {noteText}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        {/* Tasks Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.tasksSectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Opgaver</Text>
            {isAdmin && !activity.isExternal && (
              <TouchableOpacity
                style={[styles.addTaskHeaderButton, { backgroundColor: colors.primary }]}
                onPress={handleAddTask}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="plus"
                  android_material_icon_name="add"
                  size={20}
                  color="#fff"
                />
                <Text style={styles.addTaskHeaderButtonText}>Tilføj opgave</Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={taskListItems}
            keyExtractor={taskKeyExtractor}
            renderItem={renderTaskItem}
            scrollEnabled={false}
            ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
            ListEmptyComponent={() => (
              <View style={styles.emptyTasksContainer}>
                <Text style={[styles.emptyTasksText, { color: textSecondaryColor }]}>
                  Ingen opgaver endnu
                </Text>
                {isAdmin && !activity.isExternal && (
                  <Text style={[styles.emptyTasksHint, { color: textSecondaryColor }]}>
                    Tryk på &quot;Tilføj opgave&quot; for at oprette en opgave
                  </Text>
                )}
              </View>
            )}
          />
        </View>
      </ScrollView>

      {/* Modals */}
      <EditSeriesDialog
        visible={showSeriesDialog}
        onClose={() => setShowSeriesDialog(false)}
        activity={activity}
        onActivityUpdated={onActivityUpdated}
        isAdmin={isAdmin}
        onEditSingle={handleEditSingle}
        onEditAll={handleEditAll}
      />

      <DeleteActivityDialog
        visible={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onDeleteSingle={handleDeleteSingle}
        onDeleteSeries={handleDeleteSeries}
        isDeleting={isDeleting}
      />

      <CreateActivityTaskModal
        visible={showCreateTaskModal}
        onClose={() => setShowCreateTaskModal(false)}
        activityId={activity.id}
        activityTitle={activity.title}
        activityDate={activity.date}
        activityTime={activity.time}
        onTaskCreated={handleTaskCreated}
      />

      <TaskScoreNoteModal
        visible={!!feedbackModalTask}
        // --- B) Strip "Feedback på" from task.title for feedback modal only ---
        title={
          feedbackModalTask
            ? `Feedback på ${stripLeadingFeedbackPrefix(feedbackModalTask.task.title ?? 'opgave')}`
            : 'Feedback på opgave'
        }
        introText="Hvordan gik det?"
        helperText={
          feedbackModalConfig?.scoreExplanation ?? 'Hvor god var du til dine fokuspunkter'
        }
        initialScore={feedbackModalDefaults.rating}
        initialNote={feedbackModalDefaults.note}
        enableScore={feedbackModalConfig?.enableScore !== false}
        enableNote={feedbackModalConfig?.enableNote !== false}
        isSaving={isFeedbackSaving}
        error={feedbackModalError}
        onSave={handleFeedbackSave}
        onClose={handleFeedbackClose}
      />

      <TaskScoreNoteModal
        visible={isIntensityModalVisible}
        title="Feedback på Intensitet"
        introText="Hvordan gik det?"
        helperText="1 = let · 10 = maks"
        initialScore={intensityModalDraft}
        initialNote=""
        enableScore
        enableNote={false}
        isSaving={isIntensityModalSaving}
        error={intensityModalError}
        onSave={handleIntensityModalSave}
        onClose={closeIntensityModal}
      />

      {/* Normal task modal (shared, glass/soft) */}
      <TaskDetailsModal
        visible={isNormalTaskModalVisible && !!selectedNormalTask}
        title={selectedNormalTask?.title ?? ''}
        categoryColor={activity.category.color}
        isDark={isDark}
        description={selectedNormalTask?.description || undefined}
        reminderMinutes={
          selectedNormalTask?.reminder_minutes !== null && selectedNormalTask?.reminder_minutes !== undefined
            ? selectedNormalTask.reminder_minutes
            : null
        }
        videoUrl={normalTaskVideoUrl}
        completed={!!selectedNormalTask?.completed}
        isSaving={isNormalTaskCompleting}
        onClose={() => {
          if (isNormalTaskCompleting) return;
          setIsNormalTaskModalVisible(false);
          setSelectedNormalTask(null);
        }}
        onComplete={handleNormalTaskComplete}
      />
    </KeyboardAvoidingView>
  );
}

export default function ActivityDetailsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const params = useLocalSearchParams<{
    id?: string | string[];
    activityId?: string | string[];
    activity_id?: string | string[];
    openFeedbackTaskId?: string | string[];
    openIntensity?: string | string[];
  }>();
  const { categories } = useFootball();
  const { userRole } = useUserRole();
  const isAdmin = userRole === 'admin' || userRole === 'trainer';

  const normalizeParam = useCallback((value?: string | string[] | null) => {
    const first = Array.isArray(value) ? value[0] : value;
    if (first === undefined || first === null) return null;
    let decoded = String(first);
    try {
      decoded = decodeURIComponent(decoded);
    } catch (_err) {
      decoded = String(first);
    }
    const trimmed = decoded.trim();
    const lowered = trimmed.toLowerCase();
    if (!trimmed.length || lowered === 'undefined' || lowered === 'null') return null;
    return trimmed;
  }, []);

  const activityId = normalizeParam(params.id ?? params.activityId ?? params.activity_id);
  const initialFeedbackTaskId = normalizeParam(params.openFeedbackTaskId);
  const openIntensityParam = normalizeParam(params.openIntensity);
  const initialOpenIntensity = openIntensityParam === '1' || openIntensityParam === 'true';

  const [activity, setActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadActivity = useCallback(async () => {
    if (!activityId) {
      setActivity(null);
      setFetchError('missing-id');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const result = await fetchActivityFromDatabase(activityId);
      if (!result) {
        setActivity(null);
        setFetchError('not-found');
      } else {
        setActivity(result);
        setFetchError(null);
      }
    } catch (error) {
      console.error('[ActivityDetails] Failed to load activity:', error);
      setFetchError('fetch-failed');
    } finally {
      setIsLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    (async () => {
      await loadActivity();
    })();
  }, [loadActivity]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/(home)');
    }
  }, [router]);

  const handleActivityUpdated = useCallback((updated: Activity) => {
    setActivity(updated);
  }, []);

  const handleRefresh = useCallback(() => {
    return loadActivity();
  }, [loadActivity]);

  const renderErrorView = (normalizedId: string | null) => (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8 }}>
        Kunne ikke åbne aktiviteten
      </Text>
      {__DEV__ && (
        <Text
          style={{
            color: colors.textSecondary,
            fontSize: 12,
            marginBottom: 12,
            textAlign: 'center',
          }}
        >
          id: {JSON.stringify(normalizedId)}{'\n'}
          params: {JSON.stringify(params)}
        </Text>
      )}
      <TouchableOpacity
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.primary,
          borderRadius: 10,
        }}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/(home)');
          }
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Tilbage</Text>
      </TouchableOpacity>
    </View>
  );

  if (!activityId) {
    return renderErrorView(activityId);
  }

  if (isLoading) {
    return <ActivityDetailsSkeleton isDark={isDark} />;
  }

  if (fetchError || !activity) {
    return renderErrorView(activityId);
  }

  return (
    <ActivityDetailsContent
      activity={activity}
      categories={categories}
      isAdmin={isAdmin}
      isDark={isDark}
      onBack={handleBack}
      onActivityUpdated={handleActivityUpdated}
      initialFeedbackTaskId={initialFeedbackTaskId}
      initialOpenIntensity={initialOpenIntensity}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  backButtonHeader: {
    position: 'absolute',
    left: 16,
    top: Platform.OS === 'ios' ? 50 : 20,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 10 : 0,
  },
  headerEmoji: {
    fontSize: 24,
    lineHeight: 24,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
    color: '#fff',
  },
  seriesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  seriesBadgeText: {
    fontSize: 12,
    color: '#fff',
    marginLeft: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    position: 'absolute',
    right: 16,
    top: Platform.OS === 'ios' ? 50 : 20,
    alignItems: 'center',
  },
  headerButton: {
    marginLeft: 12,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  section: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  fieldContainer: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 12,
  },
  dateTimeText: {
    fontSize: 16,
  },
  pickerContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  iosPicker: {
    width: '100%',
  },
  pickerDoneButton: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  pickerDoneText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  detailContent: {
    marginLeft: 12,
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
  },
  categoryScroll: {
    paddingVertical: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  categoryEmoji: {
    fontSize: 18,
    marginRight: 8,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '500',
  },
  categoryIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  intensityToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  intensityToggleLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  switchLabel: {
    fontSize: 16,
    marginLeft: 8,
  },
  intensityHint: {
    fontSize: 14,
    marginTop: 4,
  },
  intensityPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    flexWrap: 'wrap',
  },
  intensityPickerChip: {
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8, // ✅ replaces rowGap when wrapping
  },
  intensityPickerChipSelected: {
    backgroundColor: colors.primary,
  },
  intensityPickerText: {
    fontSize: 16,
  },
  intensityPickerTextSelected: {
    color: '#fff',
    fontWeight: '500',
  },

  recurringToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 12,
  },
  recurringToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recurringToggleText: {
    fontSize: 16,
    marginLeft: 8,
  },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    position: 'absolute',
    top: 2,
    left: 2,
  },
  toggleThumbActive: {
    left: 18,
  },

  recurrenceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recurrenceOption: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  recurrenceOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },

  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  dayButton: {
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8, // ✅ replaces rowGap when wrapping
  },

  externalBadge: {
    alignSelf: 'flex-start',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  externalBadgeText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 8, // ✅ replaces rowGap
  },

  infoBox: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  feedbackInfoBox: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 16,
  },
  feedbackInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedbackInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8, // ✅ replaces rowGap
  },
  feedbackInfoRow: {
    marginBottom: 12,
  },
  feedbackInfoTaskTitle: {
    fontSize: 14,
  },
  feedbackInfoRating: {
    fontSize: 14,
    marginTop: 4,
  },
  feedbackInfoNote: {
    fontSize: 14,
    marginTop: 4,
  },

  tasksSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addTaskHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addTaskHeaderButtonText: {
    color: '#fff',
    fontWeight: '700',
    marginLeft: 8, // ✅ replaces rowGap between icon + text
  },

  taskRow: {
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskCheckboxArea: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  taskCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  feedbackTaskCheckbox: {
    borderColor: colors.primary,
    backgroundColor: 'transparent',
  },
  taskDeleteButton: {
    marginLeft: 12,
    padding: 8,
    borderRadius: 10,
  },
  taskContent: {
    flex: 1,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskTitle: {
    fontSize: 16,
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  intensityTaskValue: {
    fontSize: 14,
    marginLeft: 8,
  },
  intensityTaskHelper: {
    fontSize: 14,
  },

  feedbackExplanationText: {
    marginTop: 6,
    fontSize: 13,
  },
  feedbackHelperText: {
    fontSize: 13,
    marginTop: 4,
  },
  emptyTasksContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyTasksText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyTasksHint: {
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  videoSection: {
    marginTop: 12,
    marginBottom: 16,
  },
  videoContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  description: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
  },
  reminderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reminderText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginLeft: 8, // ✅ replaces gap
  },
  footer: {
    marginTop: 20,
  },
  primaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});