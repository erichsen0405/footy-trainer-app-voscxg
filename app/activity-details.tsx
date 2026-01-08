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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFootball } from '@/contexts/FootballContext';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { Activity, ActivityCategory, Task, TaskTemplateSelfFeedback } from '@/types';
import DateTimePicker from '@react-native-community/datetimepicker';
import EditSeriesDialog from '@/components/EditSeriesDialog';
import DeleteActivityDialog from '@/components/DeleteActivityDialog';
import { useUserRole } from '@/hooks/useUserRole';
import { CreateActivityTaskModal } from '@/components/CreateActivityTaskModal';
import { deleteSingleExternalActivity } from '@/utils/deleteExternalActivities';
import { TaskDescriptionRenderer } from '@/components/TaskDescriptionRenderer';
import { supabase } from '@/app/integrations/supabase/client';
import { FeedbackTaskModal } from '@/components/FeedbackTaskModal';
import { fetchSelfFeedbackForTemplates, upsertSelfFeedback } from '@/services/feedbackService';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { IntensityPickerModal } from '@/components/IntensityPickerModal';
import { resolveActivityIntensityEnabled } from '@/utils/activityIntensity';

const DAYS_OF_WEEK = [
  { label: 'Søn', value: 0 },
  { label: 'Man', value: 1 },
  { label: 'Tir', value: 2 },
  { label: 'Ons', value: 3 },
  { label: 'Tor', value: 4 },
  { label: 'Fre', value: 5 },
  { label: 'Lør', value: 6 },
];

const RECURRENCE_OPTIONS: Array<{
  label: string;
  value: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
}> = [
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

// Helper function to fetch activity directly from database
async function fetchActivityFromDatabase(activityId: string): Promise<Activity | null> {
  try {
    const { data: internalActivity, error: internalError } = await supabase
      .from('activities')
      .select(`
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
      `)
      .eq('id', activityId)
      .single();

    if (!internalError && internalActivity) {
      const category: ActivityCategory = {
        id: internalActivity.activity_categories?.id || internalActivity.category_id || '',
        name: internalActivity.activity_categories?.name || 'Ukendt kategori',
        color: internalActivity.activity_categories?.color || '#999999',
        emoji: internalActivity.activity_categories?.emoji || '❓',
      };

      const tasks: Task[] = (internalActivity.activity_tasks ?? []).map((task: any) => {
        const markerTemplateId = parseTemplateIdFromMarker(task.description || '');
        const isFeedbackTask = !task.task_template_id && !!markerTemplateId;

        return {
          id: task.id,
          title: task.title,
          description: task.description || '',
          completed: task.completed,
          isTemplate: false,
          categoryIds: [],
          reminder: task.reminder_minutes,
          subtasks: [],
          taskTemplateId: task.task_template_id,
          feedbackTemplateId: markerTemplateId,
          isFeedbackTask,
        };
      });

      return {
        id: internalActivity.id,
        title: internalActivity.title,
        date: new Date(internalActivity.activity_date),
        time: internalActivity.activity_time,
        endTime: internalActivity.activity_end_time ?? undefined,
        location: internalActivity.location || '',
        category,
        tasks,
        isExternal: false,
        externalCalendarId: internalActivity.external_calendar_id ?? undefined,
        externalEventId: internalActivity.external_event_id ?? undefined,
        seriesId: internalActivity.series_id ?? undefined,
        seriesInstanceDate: internalActivity.series_instance_date
          ? new Date(internalActivity.series_instance_date)
          : undefined,
        intensity: typeof internalActivity.intensity === 'number' ? internalActivity.intensity : null,
        intensityEnabled: Boolean(internalActivity.intensity_enabled),
      };
    }

    // If not found in activities, try events_local_meta + events_external
    console.log('🔍 Trying events_local_meta...');
    const { data: localMeta, error: metaError } = await supabase
      .from('events_local_meta')
      .select(`
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
      `)
      .eq('id', activityId)
      .single();

    if (!metaError && localMeta && localMeta.events_external) {
      console.log('✅ Found external activity:', localMeta.events_external.title);

      const externalEvent = localMeta.events_external;
      const eventTitle = localMeta.local_title_override || externalEvent.title;
      const providerCategories = Array.isArray(externalEvent.raw_payload?.categories)
        ? (externalEvent.raw_payload.categories as string[]).filter((cat) => typeof cat === 'string' && cat.trim().length > 0)
        : undefined;

      let resolvedCategory: ActivityCategory | null = null;

      if (localMeta.activity_categories) {
        resolvedCategory = {
          id: localMeta.activity_categories.id,
          name: localMeta.activity_categories.name,
          color: localMeta.activity_categories.color,
          emoji: localMeta.activity_categories.emoji,
        };
      } else {
        resolvedCategory = null;
      }

      const fallbackCategory: ActivityCategory = resolvedCategory ?? {
        id: '',
        name: 'Unknown',
        color: '#999999',
        emoji: '❓',
      };

      return {
        id: localMeta.id,
        title: eventTitle,
        date: new Date(externalEvent.start_date),
        time: externalEvent.start_time,
        endTime: externalEvent.end_time,
        location: externalEvent.location || '',
        category: fallbackCategory,
        tasks: (localMeta.external_event_tasks || []).map((task: any) => {
          const markerTemplateId = parseTemplateIdFromMarker(task.description || '');
          const isFeedbackTask = !task.task_template_id && !!markerTemplateId;

          return {
            id: task.id,
            title: task.title,
            description: task.description || '',
            completed: task.completed,
            isTemplate: false,
            categoryIds: [],
            reminder: task.reminder_minutes,
            subtasks: [],
            taskTemplateId: task.task_template_id,
            feedbackTemplateId: markerTemplateId,
            isFeedbackTask,
          } as Task;
        }),
        isExternal: true,
        externalCalendarId: externalEvent.provider_calendar_id,
        externalEventId: localMeta.external_event_id,
        intensity: null,
      };
    }

    console.log('❌ Activity not found in database');
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
  onRefresh: () => void;
  onActivityUpdated: (activity: Activity) => void;
  initialFeedbackTaskId?: string | null;
}

interface TemplateFeedbackSummary {
  current?: TaskTemplateSelfFeedback;
  previous?: TaskTemplateSelfFeedback;
}

interface FeedbackModalTaskState {
  task: Task;
  templateId: string;
}

interface AfterTrainingFeedbackConfig {
  enableScore: boolean;
  scoreExplanation?: string | null;
  enableNote: boolean;
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

function ActivityDetailsContent({
  activity,
  categories,
  isAdmin,
  isDark,
  onBack,
  onRefresh: _onRefresh,
  onActivityUpdated,
  initialFeedbackTaskId,
}: ActivityDetailsContentProps) {
  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#9aa0a6' : colors.textSecondary;

  const router = useRouter();
  const {
    updateActivitySingle,
    updateActivitySeries,
    toggleTaskCompletion,
    setTaskCompletion,
    deleteActivityTask,
    deleteActivitySingle,
    deleteActivitySeries,
    refreshData,
    createActivity,
    duplicateActivity
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
  const [tasksState, setTasksState] = useState<Task[]>(activity.tasks || []);
  const [selfFeedbackByTemplate, setSelfFeedbackByTemplate] = useState<Record<string, TemplateFeedbackSummary>>({});
  const [feedbackConfigByTemplate, setFeedbackConfigByTemplate] = useState<Record<string, AfterTrainingFeedbackConfig>>({});
  const [feedbackModalTask, setFeedbackModalTask] = useState<FeedbackModalTaskState | null>(null);
  const [isFeedbackSaving, setIsFeedbackSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [pendingFeedbackTaskId, setPendingFeedbackTaskId] = useState<string | null>(initialFeedbackTaskId ?? null);
  const [isIntensityModalVisible, setIsIntensityModalVisible] = useState(false);
  const [intensityModalDraft, setIntensityModalDraft] = useState<number | null>(
    typeof activity.intensity === 'number' ? activity.intensity : null
  );
  const [isIntensityModalSaving, setIsIntensityModalSaving] = useState(false);

  const resolveFeedbackTemplateId = useCallback(
    (task: Task | null | undefined): string | null =>
      task ? task.feedbackTemplateId ?? parseTemplateIdFromMarker(task.description || '') ?? null : null,
    []
  );

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
  const [isInlineIntensitySaving, setIsInlineIntensitySaving] = useState(false);
  const activityIntensityEnabled = useMemo(() => resolveActivityIntensityEnabled(activity), [activity]);
  const inlineIntensityValue = useMemo(
    () => (typeof activity.intensity === 'number' ? activity.intensity : null),
    [activity]
  );
  const isInternalActivity = !activity.isExternal;
  const currentActivityIntensity = typeof activity.intensity === 'number' ? activity.intensity : null;
  const shouldShowActivityIntensityField = isInternalActivity && !!activityIntensityEnabled;
  const showIntensityTaskRow = isInternalActivity && activityIntensityEnabled;
  const intensityTaskCompleted = showIntensityTaskRow && typeof activity.intensity === 'number';

  useEffect(() => {
    setIntensityModalDraft(currentActivityIntensity);
  }, [currentActivityIntensity]);

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

  useEffect(() => {
    setTasksState(activity.tasks || []);
  }, [activity.tasks]);

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
      `Er du sikker på at du vil duplikere "${activity.title}"? En kopi vil blive oprettet med samme dato, tid, lokation og opgaver.`,
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
              Alert.alert('Fejl', error?.message || 'Kunne ikke duplikere aktiviteten');
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
    if (value) {
      setEditEndTime(value);
    }
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

  const handleToggleTask = useCallback(async (taskId: string) => {
    if (!activity) return;

    let snapshot: Task[] = [];
    let previousCompleted: boolean | null = null;

    setTasksState(prev => {
      snapshot = prev.map(task => ({ ...task }));
      return prev.map(task => {
        if (task.id !== taskId) {
          return task;
        }
        previousCompleted = task.completed;
        return { ...task, completed: !task.completed };
      });
    });

    const desiredState = previousCompleted === null ? undefined : !previousCompleted;

    try {
      await toggleTaskCompletion(activity.id, taskId, desiredState);
      Promise.resolve(refreshData()).catch(() => { });
    } catch (error) {
      console.error('Error toggling task:', error);
      setTasksState(snapshot);
      Alert.alert('Fejl', 'Kunne ikke opdatere opgaven');
    }
  }, [activity?.id, refreshData, toggleTaskCompletion]);

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
              setTasksState(prev => prev.filter(task => task.id !== taskId));
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
  }, [activity?.id, deleteActivityTask, isAdmin, refreshData]);

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
        setTasksState(refreshedActivity.tasks);
      }
    } catch (error) {
      console.error('Error refreshing tasks after creation:', error);
    }
    refreshData();
  }, [activity.id, refreshData]);

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

  const closeIntensityModal = useCallback(() => {
    if (isIntensityModalSaving) return;
    setIsIntensityModalVisible(false);
  }, [isIntensityModalSaving]);

  const persistActivityIntensity = useCallback(
    async (value: number | null) => {
      if (!showIntensityTaskRow) return;
      setIntensityModalDraft(value);
      setIsIntensityModalSaving(true);
      const previousIntensity = typeof activity.intensity === 'number' ? activity.intensity : null;

      applyActivityUpdates({
        intensity: value,
      });

      try {
        await updateActivitySingle(activity.id, {
          intensity: value,
          intensity_enabled: true,
        });
        setIsIntensityModalSaving(false);
        setIsIntensityModalVisible(false);
        refreshData();
      } catch (error) {
        console.error('[Details] Error saving intensity:', error);
        applyActivityUpdates({
          intensity: previousIntensity,
        });
        setIsIntensityModalSaving(false);
        Alert.alert('Fejl', 'Kunne ikke gemme intensitet. Prøv igen.');
      }
    },
    [activity.id, activity.intensity, applyActivityUpdates, refreshData, showIntensityTaskRow, updateActivitySingle]
  );

  const handleIntensityModalSelect = useCallback(
    (value: number) => {
      persistActivityIntensity(value);
    },
    [persistActivityIntensity]
  );

  const handleIntensityModalRemove = useCallback(() => {
    persistActivityIntensity(null);
  }, [persistActivityIntensity]);

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
                      intensityTaskCompleted && styles.taskCompleted,
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
                item.completed && !isFeedbackTask && { backgroundColor: colors.success, borderColor: colors.success },
                isFeedbackTask && styles.feedbackTaskCheckbox,
                isFeedbackCompleted && { backgroundColor: colors.success, borderColor: colors.success },
              ]}
            >
              {!isFeedbackTask && item.completed && (
                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
              )}
              {isFeedbackTask &&
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
                  item.completed && styles.taskCompleted,
                ]}
              >
                {item.title}
              </Text>

              {!isFeedbackTask && item.description && (
                <TaskDescriptionRenderer description={item.description} textColor={textSecondaryColor} />
              )}

              {isFeedbackTask && (
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

          {isAdmin && !isFeedbackTask && (
            <TouchableOpacity
              style={[styles.taskDeleteButton, { backgroundColor: isDark ? '#3a1a1a' : '#ffe5e5' }]}
              onPress={() => handleDeleteTask(item.id)}
              activeOpacity={0.7}
              disabled={deletingTaskId === item.id}
            >
              {deletingTaskId === item.id ? (
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
      deletingTaskId,
      feedbackConfigByTemplate,
      handleDeleteTask,
      handleTaskRowPress,
      isAdmin,
      isDark,
      isIntensityModalSaving,
      resolveFeedbackTemplateId,
      selfFeedbackByTemplate,
      textColor,
      textSecondaryColor,
    ]
  );

  const taskKeyExtractor = useCallback((item: Task) => ('__type' in item ? item.key : String(item.id)), []);

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

      console.log('✅ External activity deleted successfully, navigating to home screen');
      
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
      console.log('✅ Activity deleted successfully, navigating to home screen');
      
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
      console.log('✅ Activity series deleted successfully, navigating to home screen');
      
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

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: bgColor }]}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: activity.category.color }]}>
        <TouchableOpacity
          style={styles.backButtonHeader}
          onPress={onBack}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
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

        {!isEditing && (
          <View style={styles.headerButtons}>
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
          </View>
        )}
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
            <React.Fragment>
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
                      textColor={textColor}
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
                  <input
                    type="time"
                    value={editTime.substring(0, 5)}
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
                  <React.Fragment>
                    <TouchableOpacity
                      style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                      onPress={() => setShowTimePicker(true)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.dateTimeText, { color: textColor }]}>{editTime.substring(0, 5)}</Text>
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
                          textColor={textColor}
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
                  </React.Fragment>
                )}
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Sluttidspunkt</Text>
                {Platform.OS === 'web' ? (
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
                  <React.Fragment>
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
                          textColor={textColor}
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
                  </React.Fragment>
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
              )}

              {Platform.OS === 'android' && showEndTimePicker && (
                <DateTimePicker
                  value={editEndTime ? new Date(`2000-01-01T${editEndTime}`) : new Date()}
                  mode="time"
                  display="default"
                  onChange={handleEndTimeChange}
                />
              )}
            </React.Fragment>
          ) : isEditing && activity.seriesId ? (
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Tidspunkt</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="time"
                  value={editTime.substring(0, 5)}
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
                <React.Fragment>
                  <TouchableOpacity
                    style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                    onPress={() => setShowTimePicker(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dateTimeText, { color: textColor }]}>{editTime.substring(0, 5)}</Text>
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
                        textColor={textColor}
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
                </React.Fragment>
              )}

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Sluttidspunkt</Text>
                {Platform.OS === 'web' ? (
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
                  <React.Fragment>
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
                          textColor={textColor}
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
                  </React.Fragment>
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
                    ios_icon_name="flame.fill"
                    android_material_icon_name="local_fire_department"
                    size={24}
                    color={activity.category.color}
                  />
                  <View style={styles.detailContent}>
                    <Text style={[styles.detailLabel, { color: textSecondaryColor }]}>Intensitet</Text>
                    {shouldShowActivityIntensityField && typeof activity.intensity === 'number' ? (
                      <Text style={[styles.detailValue, { color: textColor }]}>
                        Level {activity.intensity}/10
                      </Text>
                    ) : (
                      <Text style={[styles.detailValue, { color: textSecondaryColor }]}>Ikke angivet</Text>
                    )}
                  </View>
                </View>
              ) : null}
            </View>
          )}

          {/* Convert to Recurring Option */}
          {isEditing && !activity.seriesId && !activity.isExternal && (
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
                            textColor={textColor}
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
            {isFeedbackLoading && (
              <ActivityIndicator size="small" color={colors.primary} style={styles.feedbackInfoSpinner} />
            )}
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
        onTaskCreated={handleTaskCreated}
      />

      <FeedbackTaskModal
        visible={!!pendingFeedbackTaskId}
        onClose={() => setPendingFeedbackTaskId(null)}
        taskId={pendingFeedbackTaskId}
        onFeedbackSaved={handleTaskCreated}
      />

      <IntensityPickerModal
        visible={isIntensityModalVisible}
        subtitle={activity.title}
        currentValue={intensityModalDraft}
        isSaving={isIntensityModalSaving}
        onSelect={handleIntensityModalSelect}
        onRemove={handleIntensityModalRemove}
        onClose={closeIntensityModal}
      />
    </KeyboardAvoidingView>
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
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 12,
  },
  dateTimeText: {
    fontSize: 16,
    color: '#fff',
  },
  pickerContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 8,
  },
  iosPicker: {
    width: '100%',
    backgroundColor: colors.card,
  },
  pickerDoneButton: {
    backgroundColor: colors.primary,
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
    color: '#fff',
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
    color: '#fff',
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
  },
  intensityPickerChip: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
  },
  intensityPickerChipSelected: {
    backgroundColor: colors.primary,
  },
  intensityPickerText: {
    fontSize: 16,
    color: '#fff',
  },
  intensityPickerTextSelected: {
    color: '#fff',
    fontWeight: '500',
  },
  recurringToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
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
    color: '#fff',
  },
  toggle: {
    width: 40,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
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
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  dayButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 8,
    marginBottom: 8,
  },
  dayButtonText: {
    fontSize: 16,
    color: '#fff',
  },
  infoBox: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  feedbackInfoBox: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  feedbackInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  feedbackInfoTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  feedbackInfoSpinner: {
    marginTop: 8,
  },
  feedbackInfoRow: {
    marginBottom: 12,
  },
  feedbackInfoTaskTitle: {
    fontSize: 14,
    color: '#fff',
  },
  feedbackInfoRating: {
    fontSize: 14,
    color: colors.primary,
    marginTop: 4,
  },
  feedbackInfoNote: {
    fontSize: 14,
    color: '#fff',
    marginTop: 4,
  },
  taskRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskCheckboxArea: {
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#fff',
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  intensityTaskValue: {
    fontSize: 14,
    color: colors.primary,
    marginLeft: 8,
  },
  intensityTaskHelper: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  emptyTasksContainer: {
    alignItems: 'center',
    padding: 32,
  },
  emptyTasksText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  emptyTasksHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 4,
    textAlign: 'center',
  },
});
