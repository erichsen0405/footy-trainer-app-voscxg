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
import { FeedbackTaskModal } from '@/components/FeedbackTaskModal';
import { fetchSelfFeedbackForTemplates, upsertSelfFeedback } from '@/services/feedbackService';
import { taskService } from '@/services/taskService';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { getCategories } from '@/services/activities';
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
          reminder_minutes
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
        tasks: (internalActivity.activity_tasks || []).map((task: any) => {
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
        resolvedCategory = await resolveCategoryWithFallback(eventTitle, providerCategories);
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
}

interface TemplateFeedbackSummary {
  current?: TaskTemplateSelfFeedback;
  previous?: TaskTemplateSelfFeedback;
}

interface FeedbackModalTaskState {
  task: Task;
  templateId: string;
}

function ActivityDetailsContent({
  activity,
  categories,
  isAdmin,
  isDark,
  onBack,
  onRefresh: _onRefresh,
  onActivityUpdated,
}: ActivityDetailsContentProps) {
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
  const [feedbackModalTask, setFeedbackModalTask] = useState<FeedbackModalTaskState | null>(null);
  const [isFeedbackSaving, setIsFeedbackSaving] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isFeedbackLoading, setIsFeedbackLoading] = useState(false);
  
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
    setTasksState(activity.tasks || []);
  }, [activity.tasks]);

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

  const handleToggleTask = useCallback(async (taskId: string) => {
    if (!activity) return;

    let snapshot: Task[] = [];
    setTasksState(prev => {
      snapshot = prev.map(task => ({ ...task }));
      return prev.map(task =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      );
    });

    try {
      await toggleTaskCompletion(activity.id, taskId);
    } catch (error) {
      console.error('Error toggling task:', error);
      setTasksState(snapshot);
      Alert.alert('Fejl', 'Kunne ikke opdatere opgaven');
    }
  }, [activity?.id, toggleTaskCompletion]);

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
      };
      onActivityUpdated(nextActivity);
    },
    [activity, onActivityUpdated]
  );

  const taskListData = useMemo(() => (tasksState || []).filter(Boolean) as Task[], [tasksState]);

  const templateIds = useMemo(() => {
    const ids = new Set<string>();
    (taskListData || []).forEach(task => {
      if (task.taskTemplateId) {
        ids.add(task.taskTemplateId);
      }
      if (task.feedbackTemplateId) {
        ids.add(task.feedbackTemplateId);
      }
    });
    return Array.from(ids);
  }, [taskListData]);

  useEffect(() => {
    let isMounted = true;

    async function loadFeedbackHistory() {
      if (!activity?.id || !templateIds.length) {
        if (isMounted) {
          setSelfFeedbackByTemplate({});
        }
        return;
      }

      setIsFeedbackLoading(true);

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!isMounted) {
          return;
        }

        if (userError) {
          throw userError;
        }

        if (!user?.id) {
          setCurrentUserId(null);
          setSelfFeedbackByTemplate({});
          return;
        }

        setCurrentUserId(user.id);

        const rows = await fetchSelfFeedbackForTemplates(user.id, templateIds);

        if (!isMounted) {
          return;
        }

        const grouped: Record<string, TemplateFeedbackSummary> = {};

        templateIds.forEach(id => {
          grouped[id] = {};
        });

        rows.forEach(row => {
          const entry = grouped[row.taskTemplateId] || {};

          if (row.activityId === activity.id) {
            if (!entry.current) {
              entry.current = row;
            }
          } else if (!entry.previous) {
            entry.previous = row;
          }

          grouped[row.taskTemplateId] = entry;
        });

        setSelfFeedbackByTemplate(grouped);
      } catch (error) {
        if (isMounted) {
          console.error('❌ Error loading self feedback history:', error);
        }
      } finally {
        if (isMounted) {
          setIsFeedbackLoading(false);
        }
      }
    }

    loadFeedbackHistory();

    return () => {
      isMounted = false;
    };
  }, [activity.id, templateIds]);

  const previousFeedbackEntries = useMemo(() => {
    const entries: Array<{
      templateId: string;
      taskTitle: string;
      feedback: TaskTemplateSelfFeedback;
    }> = [];

    const used = new Set<string>();

    (taskListData || []).forEach(task => {
      if (!task.taskTemplateId || used.has(task.taskTemplateId)) {
        return;
      }

      const summary = selfFeedbackByTemplate[task.taskTemplateId];

      if (summary?.previous) {
        entries.push({
          templateId: task.taskTemplateId,
          taskTitle: task.title,
          feedback: summary.previous,
        });
        used.add(task.taskTemplateId);
      }
    });

    return entries;
  }, [selfFeedbackByTemplate, taskListData]);

  const activeFeedbackDefaults = feedbackModalTask?.templateId
    ? selfFeedbackByTemplate[feedbackModalTask.templateId]?.current
    : undefined;

  const handleFeedbackTaskPress = useCallback((task: Task) => {
    if (!task.feedbackTemplateId) {
      return;
    }

    setFeedbackModalTask({ task, templateId: task.feedbackTemplateId });
  }, []);

  const handleFeedbackModalClose = useCallback(() => {
    setFeedbackModalTask(null);
  }, []);

  const handleFeedbackSave = useCallback(
    async ({ rating, note }: { rating: number | null; note: string }) => {
      if (!feedbackModalTask?.templateId) {
        return;
      }

      if (!currentUserId) {
        Alert.alert('Ikke logget ind', 'Log ind for at gemme din feedback.');
        return;
      }

      setIsFeedbackSaving(true);

      try {
        const saved = await upsertSelfFeedback({
          userId: currentUserId,
          templateId: feedbackModalTask.templateId,
          activityId: activity.id,
          rating,
          note,
        });

        setSelfFeedbackByTemplate(prev => ({
          ...prev,
          [feedbackModalTask.templateId]: {
            ...(prev[feedbackModalTask.templateId] || {}),
            current: saved,
          },
        }));

        if (feedbackModalTask?.task?.id) {
          const feedbackTaskId = feedbackModalTask.task.id;

          try {
            await taskService.setTaskCompletion(feedbackTaskId, true);
            setTasksState(prev =>
              prev.map(task =>
                task.id === feedbackTaskId ? { ...task, completed: true } : task
              )
            );
          } catch (completeError) {
            console.warn('[Feedback] Failed to mark task completed', completeError);
          }
        }

        setFeedbackModalTask(null);
      } catch (error: any) {
        console.error('❌ Error saving self feedback:', error);
        Alert.alert('Fejl', error?.message || 'Kunne ikke gemme feedback.');
      } finally {
        setIsFeedbackSaving(false);
      }
    },
    [activity.id, currentUserId, feedbackModalTask]
  );

  const handleTaskRowPress = useCallback(
    (task: Task) => {
      if (task.isFeedbackTask && task.feedbackTemplateId) {
        handleFeedbackTaskPress(task);
        return;
      }

      handleToggleTask(task.id);
    },
    [handleFeedbackTaskPress, handleToggleTask]
  );

  const renderTaskItem = useCallback(
    ({ item }: { item: Task }) => {
      const isFeedbackTask = item.isFeedbackTask && !!item.feedbackTemplateId;
      const isFeedbackCompleted = isFeedbackTask && !!item.completed;
      const templateKey = item.feedbackTemplateId || item.taskTemplateId || null;
      const templateSummary = templateKey ? selfFeedbackByTemplate[templateKey] : undefined;
      const currentFeedback = templateSummary?.current;
      const helperText = currentFeedback
        ? `Seneste svar: ${currentFeedback.rating ? `${currentFeedback.rating}/10` : 'Ingen rating'}${currentFeedback.note ? ` – ${currentFeedback.note}` : ''}`
        : 'Tryk for at give feedback';

      return (
        <TouchableOpacity
          style={[
            styles.taskRow,
            { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' },
            isFeedbackTask && styles.feedbackTaskRow,
          ]}
          onPress={() => handleTaskRowPress(item)}
          activeOpacity={isFeedbackTask ? 0.85 : 0.7}
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
                <Text style={[styles.feedbackHelperText, { color: textSecondaryColor }]}>
                  {helperText}
                </Text>
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
    [deletingTaskId, handleDeleteTask, handleTaskRowPress, isAdmin, isDark, selfFeedbackByTemplate, textColor, textSecondaryColor]
  );

  const taskKeyExtractor = useCallback((item: Task) => String(item.id), []);

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
            {previousFeedbackEntries.map(entry => (
              <View key={entry.templateId} style={styles.feedbackInfoRow}>
                <Text style={[styles.feedbackInfoTaskTitle, { color: textColor }]}>
                  {entry.taskTitle}
                </Text>
                <Text style={[styles.feedbackInfoRating, { color: colors.primary }]}>
                  {entry.feedback.rating ? `${entry.feedback.rating}/10` : 'Ingen rating'}
                </Text>
                {entry.feedback.note ? (
                  <Text style={[styles.feedbackInfoNote, { color: textSecondaryColor }]}>
                    {entry.feedback.note}
                  </Text>
                ) : null}
              </View>
            ))}
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
            data={taskListData}
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

        {/* Action Buttons */}
        {isEditing && (
          <React.Fragment>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, styles.cancelButton, { borderColor: colors.error }]}
                onPress={handleCancel}
                activeOpacity={0.7}
                disabled={isSaving}
              >
                <Text style={[styles.actionButtonText, { color: colors.error }]}>Annuller</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  styles.saveButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={handleSave}
                activeOpacity={0.7}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.actionButtonText, { color: '#fff' }]}>Gem</Text>
                )}
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.deleteButton, { backgroundColor: isDark ? '#3a1a1a' : '#ffe5e5' }]}
              onPress={handleDeleteClick}
              activeOpacity={0.7}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <React.Fragment>
                  <IconSymbol
                    ios_icon_name="trash"
                    android_material_icon_name="delete"
                    size={24}
                    color={colors.error}
                  />
                  <Text style={[styles.deleteButtonText, { color: colors.error }]}>
                    Slet aktivitet
                  </Text>
                </React.Fragment>
              )}
            </TouchableOpacity>
          </React.Fragment>
        )}

        {activity.isExternal && !isEditing && (
          <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
            <IconSymbol
              ios_icon_name="info.circle"
              android_material_icon_name="info"
              size={24}
              color={colors.secondary}
            />
            <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
              Dette er en ekstern aktivitet. Du kan kun ændre kategorien. For at redigere andre
              detaljer skal du opdatere den i den eksterne kalender. Manuelt tildelte kategorier bevares ved synkronisering.
            </Text>
          </View>
        )}

        {activity.seriesId && !isEditing && (
          <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
            <IconSymbol
              ios_icon_name="info.circle"
              android_material_icon_name="info"
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
              Denne aktivitet er en del af en gentagende serie. Når du redigerer, kan du vælge at opdatere kun denne aktivitet eller hele serien.
            </Text>
          </View>
        )}

        {isAdmin && tasksState && tasksState.length > 0 && (
          <View style={[styles.infoBox, { backgroundColor: isDark ? '#3a2a2a' : '#fff3cd' }]}>
            <IconSymbol
              ios_icon_name="shield.checkered"
              android_material_icon_name="admin_panel_settings"
              size={24}
              color={colors.accent}
            />
            <Text style={[styles.infoText, { color: isDark ? '#ffc107' : '#856404' }]}>
              Som admin kan du slette opgaver direkte fra denne aktivitet ved at trykke på den røde slet-knap ved siden af hver opgave. Dette sletter kun opgaven fra denne aktivitet, ikke opgaveskabelonen.
            </Text>
          </View>
        )}

        <View style={{ height: 200 }} />
      </ScrollView>

      <EditSeriesDialog
        visible={showSeriesDialog}
        onClose={() => setShowSeriesDialog(false)}
        onEditSingle={handleEditSingle}
        onEditAll={handleEditAll}
      />

      <DeleteActivityDialog
        visible={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onDeleteSingle={handleDeleteSingle}
        onDeleteAll={handleDeleteSeries}
        isSeries={!!activity.seriesId}
      />

      {activity && (
        <CreateActivityTaskModal
          visible={showCreateTaskModal}
          onClose={() => setShowCreateTaskModal(false)}
          onSave={handleTaskCreated}
          activityId={activity.id}
          activityTitle={activity.title}
          activityDate={new Date(activity.date)}
          activityTime={activity.time}
        />
      )}

      <FeedbackTaskModal
        visible={!!feedbackModalTask}
        taskTitle={feedbackModalTask?.task.title || ''}
        defaultRating={activeFeedbackDefaults?.rating ?? null}
        defaultNote={activeFeedbackDefaults?.note ?? ''}
        isSaving={isFeedbackSaving}
        onClose={handleFeedbackModalClose}
        onSave={handleFeedbackSave}
      />
    </KeyboardAvoidingView>
  );
}

// Main component with hard gate
export default function ActivityDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { categories } = useFootball();
  const { isAdmin } = useUserRole();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Hard gate: prevent content mount before first paint
  const [hasPainted, setHasPainted] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [activity, setActivity] = useState<Activity | null>(null);

  // First paint gate
  useEffect(() => {
    requestAnimationFrame(() => {
      setHasPainted(true);
    });
  }, []);

 
  // Fetch activity after mount
  useEffect(() => {
    if (!hasPainted) return;

    let isMounted = true;


    async function loadActivity() {
      if (!id) {
        console.error('❌ No activity ID provided');
        setIsReady(true);
        return;
      }

      console.log('🔍 Loading activity with ID:', id);
      
      const fetchedActivity = await fetchActivityFromDatabase(id);
      
      if (!isMounted) return;

      if (fetchedActivity) {
        console.log('✅ Activity loaded successfully:', fetchedActivity.title);
        setActivity(fetchedActivity);
      } else {
        console.log('❌ Activity not found');
           }
      
      setIsReady(true);
    }

    loadActivity();

    return () => {
      isMounted = false;
    };
  }, [id, hasPainted]);

  const handleBack = () => {
    router.back();
  };

  const handleRefresh = () => {
    // Trigger re-fetch
    setIsReady(false);
    setHasPainted(false);
    requestAnimationFrame(() => {
      setHasPainted(true);
    });
  };

  // Show skeleton before first paint
  if (!hasPainted) {
    return <ActivityDetailsSkeleton isDark={isDark} />;
  }

  // Show loading after first paint but before data ready
  if (!isReady) {
    return <ActivityDetailsSkeleton isDark={isDark} />;
  }

  // Show error state if no activity found
  if (!activity) {
    const bgColor = isDark ? '#1a1a1a' : colors.background;
    const textColor = isDark ? '#e3e3e3' : colors.text;

    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: textColor }]}>
            Aktivitet ikke fundet
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.primary }]}
            onPress={handleBack}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>Gå tilbage</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Render full content
  return (
    <ActivityDetailsContent
      activity={activity}
      categories={categories}
      isAdmin={isAdmin}
      isDark={isDark}
      onBack={handleBack}
      onRefresh={handleRefresh}
      onActivityUpdated={(updatedActivity) => setActivity(updatedActivity)}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 60 : 70,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  backButtonHeader: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerContent: {
    alignItems: 'center',
    gap: 12,
  },
  headerEmoji: {
    fontSize: 64,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  seriesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
  },
  seriesBadgeText: {
    fontSize: 14,
       fontWeight: '600',
    color: '#fff',
  },
  headerButtons: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 60 : 70,
    right: 20,
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  externalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom:  20,
    alignSelf: 'flex-start',
  },
  externalBadgeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  tasksSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  addTaskHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addTaskHeaderButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyTasksContainer: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyTasksText: {
    fontSize: 16,
    marginBottom: 8,
  },
  emptyTasksHint: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 14,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 17,
    fontWeight: '500',
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
  },
  dateTimeButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    padding: 16,
  },
  dateTimeText: {
    fontSize: 17,
  },
  pickerContainer: {
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    overflow: 'hidden',
  },
  iosPicker: {
    height: 200,
  },
  pickerDoneButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  pickerDoneText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  infoNote: {
    fontSize: 14,
    marginTop: 8,
    fontStyle: 'italic',
  },
  categoryScroll: {
    marginTop: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    marginRight: 12,
  },
  categoryEmoji: {
    fontSize: 20,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
  },
  categoryIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  recurringToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  recurringToggleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recurringToggleText: {
    fontSize: 17,
    fontWeight: '500',
  },
  toggle: {
    width: 56,
    height: 32,
    borderRadius: 16,
    padding: 2,
  },
  toggleThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    transform: [{ translateX: 24 }],
  },
  recurrenceOptions: {
    gap: 12,
  },
  recurrenceOption: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  recurrenceOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  daysContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  dayButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
  },
  feedbackTaskRow: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  taskCheckboxArea: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  taskCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.highlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedbackTaskCheckbox: {
    borderColor: colors.primary,
    backgroundColor: 'rgba(98, 0, 238, 0.12)',
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  taskCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  feedbackHelperText: {
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },
  taskDeleteButton: {
    padding: 10,
    borderRadius: 8,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 2,
  },
  saveButton: {},
  actionButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 20,
  },
  deleteButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  feedbackInfoBox: {
    flexDirection: 'column',
    gap: 12,
  },
  feedbackInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  feedbackInfoTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  feedbackInfoSpinner: {
    marginTop: 4,
  },
  feedbackInfoRow: {
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
  },
  feedbackInfoTaskTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  feedbackInfoRating: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  feedbackInfoNote: {
    fontSize: 13,
    lineHeight: 18,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
});
