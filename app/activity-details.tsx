
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
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
import { Activity, ActivityCategory } from '@/types';
import DateTimePicker from '@react-native-community/datetimepicker';
import EditSeriesDialog from '@/components/EditSeriesDialog';
import DeleteActivityDialog from '@/components/DeleteActivityDialog';
import { useUserRole } from '@/hooks/useUserRole';
import { CreateActivityTaskModal } from '@/components/CreateActivityTaskModal';
import { deleteSingleExternalActivity } from '@/utils/deleteExternalActivities';
import { TaskDescriptionRenderer } from '@/components/TaskDescriptionRenderer';
import { supabase } from '@/app/integrations/supabase/client';

const DAYS_OF_WEEK = [
  { label: 'Søn', value: 0 },
  { label: 'Man', value: 1 },
  { label: 'Tir', value: 2 },
  { label: 'Ons', value: 3 },
  { label: 'Tor', value: 4 },
  { label: 'Fre', value: 5 },
  { label: 'Lør', value: 6 },
];

// Helper function to fetch activity directly from database
async function fetchActivityFromDatabase(activityId: string): Promise<Activity | null> {
  try {
    console.log('🔍 Fetching activity from database:', activityId);

    // First, try to fetch from internal activities table
    const { data: internalActivity, error: internalError } = await supabase
      .from('activities')
      .select(`
        id,
        title,
        activity_date,
        activity_time,
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
        tasks: (internalActivity.activity_tasks || []).map((task: any) => ({
          id: task.id,
          title: task.title,
          description: task.description || '',
          completed: task.completed,
          isTemplate: false,
          categoryIds: [],
          reminder: task.reminder_minutes,
          subtasks: [],
        })),
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
          provider_calendar_id
        ),
        external_event_tasks (
          id,
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
      
      return {
        id: localMeta.id,
        title: localMeta.local_title_override || externalEvent.title,
        date: new Date(externalEvent.start_date),
        time: externalEvent.start_time,
        location: externalEvent.location || '',
        category: localMeta.activity_categories ? {
          id: localMeta.activity_categories.id,
          name: localMeta.activity_categories.name,
          color: localMeta.activity_categories.color,
          emoji: localMeta.activity_categories.emoji,
        } : {
          id: '',
          name: 'Unknown',
          color: '#999999',
          emoji: '❓',
        },
        tasks: (localMeta.external_event_tasks || []).map((task: any) => ({
          id: task.id,
          title: task.title,
          description: task.description || '',
          completed: task.completed,
          isTemplate: false,
          categoryIds: [],
          reminder: task.reminder_minutes,
          subtasks: [],
        })),
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

export default function ActivityDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { 
    categories, 
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
  const { isAdmin } = useUserRole();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scrollViewRef = useRef<ScrollView>(null);

  const [activity, setActivity] = useState<Activity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  
  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDate, setEditDate] = useState(new Date());
  const [editTime, setEditTime] = useState('');
  const [editCategory, setEditCategory] = useState<ActivityCategory | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  
  // Recurring event conversion state
  const [convertToRecurring, setConvertToRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);

  // Fetch activity directly from database on mount
  useEffect(() => {
    let isMounted = true;

    async function loadActivity() {
      if (!id) {
        console.error('❌ No activity ID provided');
        setIsLoading(false);
        return;
      }

      console.log('🔍 Loading activity with ID:', id);
      
      const fetchedActivity = await fetchActivityFromDatabase(id);
      
      if (!isMounted) return;

      if (fetchedActivity) {
        console.log('✅ Activity loaded successfully:', fetchedActivity.title);
        setActivity(fetchedActivity);
        setEditTitle(fetchedActivity.title);
        setEditLocation(fetchedActivity.location);
        setEditDate(fetchedActivity.date);
        setEditTime(fetchedActivity.time);
        setEditCategory(fetchedActivity.category);
      } else {
        console.log('❌ Activity not found');
      }
      
      setIsLoading(false);
    }

    loadActivity();

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Scroll to bottom when picker is shown
  useEffect(() => {
    if (showDatePicker || showTimePicker || showEndDatePicker) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [showDatePicker, showTimePicker, showEndDatePicker]);

  const handleEditClick = () => {
    if (activity?.seriesId) {
      // Show dialog to choose between editing single or all
      setShowSeriesDialog(true);
    } else {
      // No series, just edit normally
      setIsEditing(true);
    }
  };

  const handleEditSingle = () => {
    setIsEditing(true);
  };

  const handleEditAll = () => {
    setIsEditing(true);
  };

  const handleDuplicate = async () => {
    if (!activity) return;

    // Check if it's an external activity
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
              // Navigate back to home to see the duplicated activity
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

    setIsSaving(true);

    try {
      // Check if converting to recurring
      if (convertToRecurring && !activity.seriesId && !activity.isExternal) {
        // Validate recurring settings
        if ((recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') && selectedDays.length === 0) {
          Alert.alert('Fejl', 'Vælg venligst mindst én dag for gentagelse');
          setIsSaving(false);
          return;
        }

        // Delete the current single activity
        await deleteActivitySingle(activity.id);

        // Create a new recurring series
        await createActivity({
          title: editTitle,
          location: editLocation,
          categoryId: editCategory?.id || activity.category.id,
          date: editDate,
          time: editTime,
          isRecurring: true,
          recurrenceType,
          recurrenceDays: (recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') ? selectedDays : undefined,
          endDate: hasEndDate ? endDate : undefined,
        });

        Alert.alert('Succes', 'Aktiviteten er blevet konverteret til en gentagende serie');
        router.replace('/(tabs)/(home)');
        return;
      }

      if (activity.isExternal) {
        // Use updateActivitySingle for external activities
        console.log('🔄 Updating external activity category');
        
        await updateActivitySingle(activity.id, {
          categoryId: editCategory?.id,
        });

        console.log('✅ External activity category updated');

        // Trigger refresh
        refreshData();

        Alert.alert('Gemt', 'Kategorien er blevet opdateret');
        setIsEditing(false);
      } else if (activity.seriesId && showSeriesDialog) {
        // User chose to edit the entire series
        await updateActivitySeries(activity.seriesId, {
          title: editTitle,
          location: editLocation,
          categoryId: editCategory?.id,
          time: editTime,
        });

        Alert.alert('Gemt', 'Hele serien er blevet opdateret');
        setIsEditing(false);
        
        // Refresh the activity data
        refreshData();
      } else {
        // Edit single activity (or activity not in a series)
        await updateActivitySingle(activity.id, {
          title: editTitle,
          location: editLocation,
          categoryId: editCategory?.id,
          date: editDate,
          time: editTime,
        });

        Alert.alert('Gemt', 'Aktiviteten er blevet opdateret');
        setIsEditing(false);
        
        // Refresh data
        refreshData();
      }
    } catch (error) {
      console.error('Error saving activity:', error);
      Alert.alert('Fejl', 'Der opstod en fejl ved gemning');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (!activity) return;
    
    // Reset to original values
    setEditTitle(activity.title);
    setEditLocation(activity.location);
    setEditDate(new Date(activity.date));
    setEditTime(activity.time);
    setEditCategory(activity.category);
    setConvertToRecurring(false);
    setIsEditing(false);
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

  const handleToggleTask = async (taskId: string) => {
    if (!activity) return;
    
    try {
      await toggleTaskCompletion(activity.id, taskId);
      
      // Refresh to get updated state
      refreshData();
    } catch (error) {
      console.error('Error toggling task:', error);
      Alert.alert('Fejl', 'Kunne ikke opdatere opgaven');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
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
              
              // Refresh data
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
  };

  const handleAddTask = () => {
    console.log('Opening create task modal for activity:', activity?.id);
    setShowCreateTaskModal(true);
  };

  const handleTaskCreated = async () => {
    console.log('Task created successfully, refreshing activity data');
    setShowCreateTaskModal(false);
    // Refresh data from context
    refreshData();
  };

  const handleDeleteClick = () => {
    if (activity?.isExternal) {
      // For external activities, show a confirmation dialog
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
      
      // Navigate to home screen immediately
      router.replace('/(tabs)/(home)');
      
      // Show success message after navigation
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
      
      // Navigate to home screen immediately
      router.replace('/(tabs)/(home)');
      
      // Show success message after navigation
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
      
      // Navigate to home screen immediately
      router.replace('/(tabs)/(home)');
      
      // Show success message after navigation
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
    // Extract just the HH:MM from the time string (removing seconds if present)
    const timeDisplay = time.substring(0, 5);
    return `${formatDate(date)} kl. ${timeDisplay}`;
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#1a1a1a' : colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: isDark ? '#e3e3e3' : colors.text }]}>
            Indlæser aktivitet...
          </Text>
        </View>
      </View>
    );
  }

  if (!activity) {
    return (
      <View style={[styles.container, { backgroundColor: isDark ? '#1a1a1a' : colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={[styles.loadingText, { color: isDark ? '#e3e3e3' : colors.text }]}>
            Aktivitet ikke fundet
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.primary }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <Text style={styles.backButtonText}>Gå tilbage</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const needsDaySelection = recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly';

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: bgColor }]}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: activity.category.color }]}>
        <TouchableOpacity
          style={styles.backButtonHeader}
          onPress={() => router.back()}
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
            {/* Duplicate button - only for manual activities */}
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
            
            {/* Edit button */}
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
        {/* External Activity Badge */}
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

              {/* Android Date/Time Pickers */}
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
              <Text style={[styles.infoNote, { color: textSecondaryColor }]}>
                Dato kan ikke ændres for aktiviteter i en serie
              </Text>
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
                {categories.map((cat, index) => (
                  <TouchableOpacity
                    key={`category-${cat.id}-${index}`}
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
            <React.Fragment>
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
                <React.Fragment>
                  <View style={styles.fieldContainer}>
                    <Text style={[styles.fieldLabel, { color: textColor }]}>Gentagelsesmønster</Text>
                    <View style={styles.recurrenceOptions}>
                      {[
                        { label: 'Dagligt', value: 'daily' as const },
                        { label: 'Hver uge', value: 'weekly' as const },
                        { label: 'Hver anden uge', value: 'biweekly' as const },
                        { label: 'Hver tredje uge', value: 'triweekly' as const },
                        { label: 'Månedligt', value: 'monthly' as const },
                      ].map((option, index) => (
                        <TouchableOpacity
                          key={index}
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
                            if (option.value !== 'weekly' && option.value !== 'biweekly' && option.value !== 'triweekly') {
                              setSelectedDays([]);
                            }
                          }}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.recurrenceOptionText,
                              {
                                color: recurrenceType === option.value ? '#fff' : textColor,
                              },
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
                        {DAYS_OF_WEEK.map((day, index) => (
                          <TouchableOpacity
                            key={index}
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
                </React.Fragment>
              )}
            </React.Fragment>
          )}
        </View>

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

          {activity.tasks && activity.tasks.length > 0 ? (
            <React.Fragment>
              {activity.tasks.map((task, index) => (
                <View key={`task-${task.id}-${index}`} style={[styles.taskRow, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' }]}>
                  <TouchableOpacity
                    style={styles.taskCheckboxArea}
                    onPress={() => handleToggleTask(task.id)}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.taskCheckbox,
                        task.completed && { backgroundColor: colors.success, borderColor: colors.success },
                      ]}
                    >
                      {task.completed && (
                        <IconSymbol
                          ios_icon_name="checkmark"
                          android_material_icon_name="check"
                          size={16}
                          color="#fff"
                        />
                      )}
                    </View>
                    <View style={styles.taskContent}>
                      <Text
                        style={[
                          styles.taskTitle,
                          { color: textColor },
                          task.completed && styles.taskCompleted,
                        ]}
                      >
                        {task.title}
                      </Text>
                      {task.description && (
                        <TaskDescriptionRenderer 
                          description={task.description}
                          textColor={textSecondaryColor}
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                  
                  {/* Admin delete button */}
                  {isAdmin && (
                    <TouchableOpacity
                      style={[
                        styles.taskDeleteButton,
                        { backgroundColor: isDark ? '#3a1a1a' : '#ffe5e5' }
                      ]}
                      onPress={() => handleDeleteTask(task.id)}
                      activeOpacity={0.7}
                      disabled={deletingTaskId === task.id}
                    >
                      {deletingTaskId === task.id ? (
                        <ActivityIndicator size="small" color={colors.error} />
                      ) : (
                        <IconSymbol
                          ios_icon_name="trash"
                          android_material_icon_name="delete"
                          size={22}
                          color={colors.error}
                        />
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </React.Fragment>
          ) : (
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

            {/* Delete Button - Available for all activities when editing */}
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

        {/* Info Box for External Activities */}
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

        {/* Info Box for Series Activities */}
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

        {/* Admin Info Box */}
        {isAdmin && activity.tasks && activity.tasks.length > 0 && (
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

        {/* Bottom Padding */}
        <View style={{ height: 200 }} />
      </ScrollView>

      {/* Edit Series Dialog */}
      <EditSeriesDialog
        visible={showSeriesDialog}
        onClose={() => setShowSeriesDialog(false)}
        onEditSingle={handleEditSingle}
        onEditAll={handleEditAll}
      />

      {/* Delete Activity Dialog */}
      <DeleteActivityDialog
        visible={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onDeleteSingle={handleDeleteSingle}
        onDeleteAll={handleDeleteSeries}
        isSeries={!!activity.seriesId}
      />

      {/* Create Task Modal */}
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
    </KeyboardAvoidingView>
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
    marginBottom: 20,
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
  infoText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
});
