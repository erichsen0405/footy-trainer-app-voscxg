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
import TaskScoreNoteModal from '@/components/TaskScoreNoteModal';
import { fetchSelfFeedbackForTemplates, upsertSelfFeedback } from '@/services/feedbackService';
import { updateActivityIntensity } from '@/services/activityIntensityService';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { getCategories } from '@/services/activities';
import { resolveActivityIntensityEnabled } from '@/utils/activityIntensity';
import { resolveActivityCategory, type CategoryMappingRecord } from '@/shared/activityCategoryResolver';

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

// Helper function to fetch activity directly from database
async function fetchActivityFromDatabase(activityId: string): Promise<Activity | null> {
  try {
    console.log('🔍 Fetching activity from database:', activityId);

    const resolveCategoryWithFallback = async (
      activityTitle: string,
      providerCategories?: string[]
    ): Promise<ActivityCategory | null> => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          return null;
        }

        const [categories, mappingsResponse] = await Promise.all([
          getCategories(user.id),
          supabase
            .from('category_mappings')
            .select('external_category, internal_category_id')
            .eq('user_id', user.id),
        ]);

        const mappings = (mappingsResponse?.data || []) as CategoryMappingRecord[];

        const resolution = resolveActivityCategory({
          title: activityTitle,
          categories,
          externalCategories: providerCategories,
          categoryMappings: mappings,
        });

        if (!resolution) {
          return null;
        }

        return {
          id: resolution.category.id,
          name: resolution.category.name,
          color: resolution.category.color || '#9E9E9E',
          emoji: resolution.category.emoji || '❓',
        };
      } catch (fallbackError) {
        console.error('❌ Error resolving fallback category:', fallbackError);
        return null;
      }
    };

    // First, try to fetch from internal activities table
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
        is_external,
        external_calendar_id,
        external_event_id,
        series_id,
        series_instance_date,
        activity_intensity,
        activity_intensity_enabled,
        activity_categories (
          id,
          name,
          color,
          emoji
        ),
        activity_tasks (
          id,
          task_template_id,
          title,
          description,
          completed,
          reminder_minutes,
          video_url,
          task_templates!activity_tasks_task_template_id_fkey (
            video_url
          )
        )
      `)
      .eq('id', activityId)
      .single();

    if (!internalError && internalActivity) {
      console.log('✅ Found internal activity:', internalActivity.title);
      
      // Map to Activity type
      return {
        id: internalActivity.id,
        title: internalActivity.title,
        date: new Date(internalActivity.activity_date),
        time: internalActivity.activity_time,
        endTime: internalActivity.activity_end_time,
        location: internalActivity.location || '',
        category: internalActivity.activity_categories ? {
          id: internalActivity.activity_categories.id,
          name: internalActivity.activity_categories.name,
          color: internalActivity.activity_categories.color,
          emoji: internalActivity.activity_categories.emoji,
        } : {
          id: '',
          name: 'Unknown',
          color: '#999999',
          emoji: '❓',
        },
        activity_intensity: internalActivity.activity_intensity ?? null,
        activity_intensity_enabled: internalActivity.activity_intensity_enabled ?? null,
        tasks: (internalActivity.activity_tasks || []).map((task: any) => {
          const markerTemplateId = parseTemplateIdFromMarker(task.description || '');
          const isFeedbackTask = !task.task_template_id && !!markerTemplateId;

          const fallbackVideo =
            typeof task.video_url === 'string'
              ? task.video_url
              : typeof task.task_templates?.video_url === 'string'
                ? task.task_templates.video_url
                : undefined;

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
            videoUrl: fallbackVideo,
            video_url: fallbackVideo,
          } as Task;
        }),
        isExternal: internalActivity.is_external,
        externalCalendarId: internalActivity.external_calendar_id,
        externalEventId: internalActivity.external_event_id,
        seriesId: internalActivity.series_id,
        seriesInstanceDate: internalActivity.series_instance_date ? new Date(internalActivity.series_instance_date) : undefined,
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
        activity_intensity,
        activity_intensity_enabled,
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
          video_url,
          task_templates!external_event_tasks_task_template_id_fkey (
            video_url
          )
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
        resolvedCategory = await resolveCategoryWithFallback(eventTitle, providerCategories);
      }

      const fallbackCategory: ActivityCategory = resolvedCategory ?? {
        id: '',
        name: 'Unknown',
        color: '#999999',
        emoji: '❓',
      };
      
      const fallbackVideo = (task: any) =>
        typeof task.video_url === 'string'
          ? task.video_url
          : typeof task.task_templates?.video_url === 'string'
            ? task.task_templates.video_url
            : undefined;

      return {
        id: localMeta.id,
        title: eventTitle,
        date: new Date(externalEvent.start_date),
        time: externalEvent.start_time,
        endTime: externalEvent.end_time,
        location: externalEvent.location || '',
        category: fallbackCategory,
        activity_intensity: localMeta.activity_intensity ?? null,
        activity_intensity_enabled: localMeta.activity_intensity_enabled ?? null,
        tasks: (localMeta.external_event_tasks || []).map((task: any) => {
          const markerTemplateId = parseTemplateIdFromMarker(task.description || '');
          const isFeedbackTask = !task.task_template_id && !!markerTemplateId;
          const video =
            typeof task.video_url === 'string'
              ? task.video_url
              : typeof task.task_templates?.video_url === 'string'
                ? task.task_templates.video_url
                : undefined;
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
            videoUrl: video,
            video_url: video,
          } as Task;
        }),
        isExternal: true,
        externalCalendarId: externalEvent.provider_calendar_id,
        externalEventId: localMeta.external_event_id,
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

const firstParam = <T,>(value: T | T[] | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : value;
const normalizeId = (value: unknown): string | null => {
  const trimmed = String(value ?? '').trim();
  return trimmed && trimmed !== 'undefined' && trimmed !== 'null' ? trimmed : null;
};
const parseActivityIntensityValue = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  const num = typeof value === 'string' ? Number(value.trim()) : Number(value);
  return Number.isFinite(num) ? num : null;
};

// Content component - only mounts after first paint
interface ActivityDetailsContentProps {
  activity: Activity;
  categories: ActivityCategory[];
  isAdmin: boolean;
  isDark: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onActivityUpdated: (activity: Activity) => void;
  // NEW: route-driven auto-open
  openFeedbackTaskId?: string | null;
  openIntensity?: boolean;
  resolvedActivityId: string;
}

interface TemplateFeedbackSummary {
  current?: TaskTemplateSelfFeedback;
  previous?: TaskTemplateSelfFeedback;
}

interface FeedbackModalTaskState {
  task: Task;
  templateId: string;
}

function ActivityDetailsScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { isAdmin } = useUserRole();
  const resolvedActivityId =
    normalizeId(firstParam(params.id)) ??
    normalizeId(firstParam((params as any).activityId)) ??
    normalizeId(firstParam((params as any).activity_id));
  const openFeedbackTaskId = normalizeId(firstParam(params.openFeedbackTaskId));
  const openIntensityRaw = String(firstParam(params.openIntensity) ?? '').toLowerCase();
  const openIntensity = openIntensityRaw === '1' || openIntensityRaw === 'true';

  useEffect(() => {
    if (!resolvedActivityId) {
      router.replace('/(tabs)/(home)');
    }
  }, [resolvedActivityId, router]);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ActivityCategory[]>([]);

  const handleRefresh = useCallback(async () => {
    if (!resolvedActivityId) return;
    setLoading(true);
    try {
      const fetched = await fetchActivityFromDatabase(resolvedActivityId);
      setActivity(fetched);
    } finally {
      setLoading(false);
    }
  }, [resolvedActivityId]);

  useEffect(() => {
    handleRefresh();
  }, [handleRefresh]);

  useEffect(() => {
    let cancelled = false;

    const loadCategories = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const rows = await getCategories(user.id);
        if (cancelled) return;

        const mapped: ActivityCategory[] = (rows || []).map((row) => ({
          id: row.id,
          name: row.name,
          color: row.color,
          emoji: row.emoji,
        }));
        setCategories(mapped);
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    };

    loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!resolvedActivityId || loading || !activity) {
    return <ActivityDetailsSkeleton isDark={useColorScheme() === 'dark'} />;
  }

  return (
    <ActivityDetailsContent
      activity={activity}
      categories={categories}
      isAdmin={!!isAdmin}
      isDark={isDark}
      onBack={() => router.back()}
      onRefresh={handleRefresh}
      onActivityUpdated={(next) => setActivity(next)}
      resolvedActivityId={resolvedActivityId}
      openFeedbackTaskId={openFeedbackTaskId}
      openIntensity={openIntensity}
    />
  );
}

function ActivityDetailsContent({
  activity,
  categories,
  isAdmin,
  isDark,
  onBack,
  onRefresh,
  onActivityUpdated,
  openFeedbackTaskId,
  openIntensity,
  resolvedActivityId,
}: ActivityDetailsContentProps) {
  const didAutoOpenFeedbackRef = useRef(false);
  const didAutoOpenIntensityRef = useRef(false);

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const normalizeOptionalTime = (value: string | undefined | null): string | undefined => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed ? trimmed : undefined;
  };

  const toMinutes = (value: string): number | null => {
    if (typeof value !== 'string') return null;
    const segments = value.split(':');
    if (segments.length < 2) return null;

    const hours = Number(segments[0]);
    const minutes = Number(segments[1]);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    if (hours < 0 || hours > 23) return null;
    if (minutes < 0 || minutes > 59) return null;

    return hours * 60 + minutes;
  };

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
  const [scoreModalMode, setScoreModalMode] = useState<'feedback' | 'intensity' | null>(null);
  const [scoreModalTask, setScoreModalTask] = useState<FeedbackModalTaskState | null>(null);
  const [scoreModalScore, setScoreModalScore] = useState<number | null>(null);
  const [scoreModalNote, setScoreModalNote] = useState<string>('');
  const [isScoreSaving, setIsScoreSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  const [activityIntensityValue, setActivityIntensityValue] = useState<number | null>(
    parseActivityIntensityValue((activity as any)?.activity_intensity ?? (activity as any)?.intensity)
  );
  const [activityIntensityEnabled, setActivityIntensityEnabled] = useState<boolean>(
    resolveActivityIntensityEnabled(activity as any)
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
    setEditTitle(activity.title);
    setEditLocation(activity.location);
    setEditDate(activity.date);
    setEditTime(activity.time);
    setEditEndTime(activity.endTime);
    setEditCategory(activity.category);
  }, [activity]);

  useEffect(() => {
    setEditScope('single');
  }, [activity.id]);

  useEffect(() => {
    setTasksState(activity.tasks || []);
  }, [activity.tasks]);

  useEffect(() => {
    setActivityIntensityValue(
      parseActivityIntensityValue((activity as any)?.activity_intensity ?? (activity as any)?.intensity)
    );
    setActivityIntensityEnabled(resolveActivityIntensityEnabled(activity as any));
  }, [activity]);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!mounted) return;
        setCurrentUserId(data.user?.id ?? null);
      })
      .catch((error) => {
        console.error('Error fetching current user for feedback:', error);
        if (mounted) {
          setCurrentUserId(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!openIntensity || didAutoOpenIntensityRef.current) {
      return;
    }
    didAutoOpenIntensityRef.current = true;
    setScoreModalMode('intensity');
    setScoreModalTask(null);
    setScoreModalScore(activityIntensityValue);
    setScoreModalNote('');
  }, [activityIntensityValue, openIntensity]);

  useEffect(() => {
    if (!openFeedbackTaskId || didAutoOpenFeedbackRef.current) {
      return;
    }

    const matchingTask = tasksState.find((task) => String(task.id) === openFeedbackTaskId);
    if (!matchingTask) {
      return;
    }

    didAutoOpenFeedbackRef.current = true;
    openFeedbackModalForTask(matchingTask);
  }, [openFeedbackModalForTask, openFeedbackTaskId, tasksState]);

  useEffect(() => {
    let cancelled = false;

    const loadFeedback = async () => {
      const templateIds = tasksState
        .map((task) => task.feedbackTemplateId ?? parseTemplateIdFromMarker(task.description || ''))
        .filter((id): id is string => Boolean(id));

      if (!currentUserId || templateIds.length === 0) {
        return;
      }

      const uniqueTemplateIds = Array.from(new Set(templateIds));
      setIsFeedbackLoading(true);
      try {
        const feedbackRows = await fetchSelfFeedbackForTemplates(currentUserId, uniqueTemplateIds);
        if (cancelled) return;

        const nextSummary: Record<string, TemplateFeedbackSummary> = {};
        uniqueTemplateIds.forEach((id) => {
          const matches = feedbackRows.filter((row) => row.taskTemplateId === id);
          if (matches.length > 0) {
            nextSummary[id] = {
              current: matches[0],
              previous: matches[1],
            };
          }
        });
        setSelfFeedbackByTemplate(nextSummary);
      } catch (error) {
        console.error('Error loading feedback history:', error);
      } finally {
        if (!cancelled) {
          setIsFeedbackLoading(false);
        }
      }
    };

    loadFeedback();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, tasksState]);

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
              Alert.alert('Fejl', error?.message || 'Kunne ikke duplikerte aktiviteten');
            } finally {
              setIsDuplicating(false);
            }
          }
        }
      ]
    );
  };

  const handleSave = async () => {
    if (!activity) return;

    const endTimePayload = activity.isExternal
      ? undefined
      : normalizeOptionalTime(editEndTime);

    if (endTimePayload) {
      const startMinutes = toMinutes(editTime);
      const endMinutes = toMinutes(endTimePayload);

      if (startMinutes == null || endMinutes == null) {
        Alert.alert('Fejl', 'Ugyldigt tidspunkt. Benyt formatet HH:MM.');
        return;
      }

      if (endMinutes <= startMinutes) {
        Alert.alert('Fejl', 'Sluttidspunkt skal være efter starttidspunkt');
        return;
      }
    }

    setIsSaving(true);

    try {
      if (convertToRecurring && !activity.seriesId && !activity.isExternal) {
        if ((recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') && selectedDays.length === 0) {
          Alert.alert('Fejl', 'Vælg venligst mindst én dag for gentagelse');
          return;
        }

        await createActivity({
          title: editTitle,
          location: editLocation,
          categoryId: editCategory?.id || activity.category.id,
          date: editDate,
          time: editTime,
          endTime: endTimePayload,
          isRecurring: true,
          recurrenceType,
          recurrenceDays: (recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') ? selectedDays : undefined,
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
        console.log('🔄 Updating external activity category');
        
        await updateActivitySingle(activity.id, {
          categoryId: editCategory?.id,
        });

        console.log('✅ External activity category updated');

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
          time: editTime,
          endTime: endTimePayload,
        });

        applyActivityUpdates({
          title: editTitle,
          location: editLocation,
          category: editCategory || activity.category,
          time: editTime,
          endTime: endTimePayload,
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
        time: editTime,
        endTime: endTimePayload,
      });

      applyActivityUpdates({
        title: editTitle,
        location: editLocation,
        category: editCategory || activity.category,
        date: editDate,
        time: editTime,
        endTime: endTimePayload,
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
    
    setEditTitle(activity.title);
    setEditLocation(activity.location);
    setEditDate(new Date(activity.date));
    setEditTime(activity.time);
    setEditEndTime(activity.endTime);
    setEditCategory(activity.category);
    setConvertToRecurring(false);
    setIsEditing(false);
    setEditScope('single');
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

  const handleToggleTask = useCallback(
    async (taskId: string) => {
      let snapshot: Task[] = [];
      setTasksState(prev => {
        snapshot = prev.map(task => ({ ...task }));
        return prev.map(task =>
          task.id === taskId ? { ...task, completed: !task.completed } : task
        );
      });

      try {
        await toggleTaskCompletion(resolvedActivityId, taskId);
      } catch (error) {
        console.error('Error toggling task:', error);
        setTasksState(snapshot);
        Alert.alert('Fejl', 'Kunne ikke opdatere opgaven');
      }
    },
    [resolvedActivityId, toggleTaskCompletion]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      if (!isAdmin) return;

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
                console.log('🗑️ Attempting to delete task:', taskId, 'from activity:', resolvedActivityId);
                await deleteActivityTask(resolvedActivityId, taskId);
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
            },
          },
        ]
      );
    },
    [deleteActivityTask, isAdmin, refreshData, resolvedActivityId]
  );

  const openFeedbackModalForTask = useCallback(
    (task: Task) => {
      const templateId =
        task.feedbackTemplateId ?? parseTemplateIdFromMarker(task.description || '');
      if (!templateId) {
        Alert.alert('Fejl', 'Feedback-skabelon mangler');
        return;
      }
      const summary = selfFeedbackByTemplate[templateId];
      setScoreModalMode('feedback');
      setScoreModalTask({ task, templateId });
      setScoreModalScore(summary?.current?.rating ?? null);
      setScoreModalNote(summary?.current?.note ?? '');
    },
    [selfFeedbackByTemplate]
  );

  const closeScoreModal = useCallback(() => {
    setScoreModalMode(null);
    setScoreModalTask(null);
    setScoreModalScore(null);
    setScoreModalNote('');
  }, []);

  const handleFeedbackSubmit = useCallback(
    async ({ score, note }: { score: number | null; note: string }) => {
      if (!scoreModalTask || !currentUserId) {
        closeScoreModal();
        return;
      }

      setIsScoreSaving(true);
      try {
        const saved = await upsertSelfFeedback({
          userId: currentUserId,
          templateId: scoreModalTask.templateId,
          activityId: resolvedActivityId,
          rating: typeof score === 'number' ? score : null,
          note,
        });

        setSelfFeedbackByTemplate((prev) => ({
          ...prev,
          [scoreModalTask.templateId]: {
            current: saved,
            previous: prev[scoreModalTask.templateId]?.current,
          },
        }));

        closeScoreModal();
      } catch (error) {
        console.error('Error saving feedback:', error);
        Alert.alert('Fejl', 'Kunne ikke gemme feedback');
      } finally {
        setIsScoreSaving(false);
      }
    },
    [closeScoreModal, currentUserId, resolvedActivityId, scoreModalTask]
  );

  const handleIntensitySubmit = useCallback(
    async ({ score }: { score: number | null; note: string }) => {
      setIsScoreSaving(true);
      try {
        await updateActivityIntensity({
          activityId: resolvedActivityId,
          intensity: typeof score === 'number' ? score : null,
          enableIntensity: true,
          isExternal: !!activity.isExternal,
        });

        setActivityIntensityValue(typeof score === 'number' ? score : null);
        setActivityIntensityEnabled(true);
        closeScoreModal();
        await refreshData();
      } catch (error) {
        console.error('Error saving intensity:', error);
        Alert.alert('Fejl', 'Kunne ikke gemme intensitet');
      } finally {
        setIsScoreSaving(false);
      }
    },
    [activity.isExternal, closeScoreModal, refreshData, resolvedActivityId]
  );

  const renderTaskRow = useCallback(
    ({ item }: { item: Task }) => {
      const isFeedback =
        item.isFeedbackTask ||
        !!item.feedbackTemplateId ||
        !!parseTemplateIdFromMarker(item.description || '');
      const reminderLabel =
        typeof item.reminder === 'number' && Number.isFinite(item.reminder)
          ? `${item.reminder} min før`
          : null;

      const handlePress = () => {
        if (isFeedback) {
          openFeedbackModalForTask(item);
        } else {
          handleToggleTask(String(item.id));
        }
      };

      const handleLongPress = () => {
        if (isAdmin) {
          handleDeleteTask(String(item.id));
        }
      };

      return (
        <TouchableOpacity
          style={[styles.taskRowCard, { backgroundColor: cardBgColor }]}
          onPress={handlePress}
          onLongPress={handleLongPress}
        >
          <View style={styles.taskRowHeader}>
            <Text style={[styles.taskRowTitle, { color: textColor }]}>
              {item.title || 'Uden titel'}
            </Text>
            {isFeedback ? (
              <Text style={styles.taskRowBadge}>Feedback</Text>
            ) : null}
          </View>
          {item.description ? (
            <Text style={[styles.taskRowDescription, { color: textSecondaryColor }]} numberOfLines={2}>
              {item.description}
            </Text>
          ) : null}
          <View style={styles.taskRowFooter}>
            <Text style={[styles.taskRowStatus, { color: textSecondaryColor }]}>
              {item.completed ? 'Fuldført' : 'Ikke fuldført'}
            </Text>
            {reminderLabel ? <Text style={styles.taskRowReminder}>{reminderLabel}</Text> : null}
            {isAdmin ? (
              <TouchableOpacity
                onPress={(e) => {
                  e?.stopPropagation?.();
                  handleDeleteTask(String(item.id));
                }}
              >
                <IconSymbol
                  ios_icon_name="trash"
                  android_material_icon_name="delete"
                  size={16}
                  color="#ff7676"
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [
      cardBgColor,
      textColor,
      textSecondaryColor,
      isAdmin,
      handleDeleteTask,
      handleToggleTask,
      openFeedbackModalForTask,
    ]
  );

  return (
    <>
      <FlatList
        data={tasksState}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTaskRow}
        // ...existing props...
      />
      <TaskScoreNoteModal
        visible={scoreModalMode === 'feedback'}
        mode="feedback"
        title={scoreModalTask?.task.title ?? 'Feedback'}
        subtitle="Giv en vurdering (1-10)"
        initialScore={scoreModalScore}
        initialNote={scoreModalNote}
        isSaving={isScoreSaving}
        isLoading={isFeedbackLoading}
        onClose={closeScoreModal}
        onSubmit={handleFeedbackSubmit}
      />
      <TaskScoreNoteModal
        visible={scoreModalMode === 'intensity'}
        mode="intensity"
        title="Aktivitetens intensitet"
        subtitle="Vælg en værdi mellem 1 og 10"
        initialScore={activityIntensityValue}
        allowNote={false}
        isSaving={isScoreSaving}
        onClose={closeScoreModal}
        onSubmit={handleIntensitySubmit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 44,
    paddingBottom: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButtonHeader: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  headerContent: {
    flex: 1,
    justifyContent: 'center',
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
  taskRowCard: {
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  taskRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskRowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  taskRowBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  taskRowDescription: {
    marginTop: 6,
    fontSize: 14,
  },
  taskRowFooter: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  taskRowStatus: {
    fontSize: 13,
    fontWeight: '500',
  },
  taskRowReminder: {
    fontSize: 13,
    fontWeight: '500',
    color: '#F97316',
  },
});

export default ActivityDetailsScreen;