
import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFootball } from '@/contexts/FootballContext';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { Activity, ActivityCategory } from '@/types';
import { supabase } from '@/app/integrations/supabase/client';
import DateTimePicker from '@react-native-community/datetimepicker';
import EditSeriesDialog from '@/components/EditSeriesDialog';
import DeleteActivityDialog from '@/components/DeleteActivityDialog';
import { useUserRole } from '@/hooks/useUserRole';
import { CreateActivityTaskModal } from '@/components/CreateActivityTaskModal';

export default function ActivityDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { activities, externalActivities, categories, updateActivity, updateActivitySingle, updateActivitySeries, toggleTaskCompletion, deleteActivityTask, deleteActivitySingle, deleteActivitySeries, refreshData } = useFootball();
  const { isAdmin } = useUserRole();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [activity, setActivity] = useState<Activity | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSeriesDialog, setShowSeriesDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Edit state
  const [editTitle, setEditTitle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editDate, setEditDate] = useState(new Date());
  const [editTime, setEditTime] = useState('');
  const [editCategory, setEditCategory] = useState<ActivityCategory | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    // Find the activity in either internal or external activities
    const foundActivity = [...activities, ...externalActivities].find(a => a.id === id);
    
    if (foundActivity) {
      setActivity(foundActivity);
      setEditTitle(foundActivity.title);
      setEditLocation(foundActivity.location);
      setEditDate(new Date(foundActivity.date));
      setEditTime(foundActivity.time);
      setEditCategory(foundActivity.category);
    }
  }, [id, activities, externalActivities]);

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

  const handleSave = async () => {
    if (!activity) return;

    setIsSaving(true);

    try {
      if (activity.isExternal) {
        // For external activities, only allow category change
        const { error } = await supabase
          .from('activities')
          .update({
            category_id: editCategory?.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', activity.id);

        if (error) {
          console.error('Error updating external activity:', error);
          Alert.alert('Fejl', 'Kunne ikke opdatere aktiviteten');
          return;
        }

        console.log('✅ External activity category updated in database');

        // CRITICAL FIX: Update local state immediately
        const updatedActivity = {
          ...activity,
          category: editCategory!,
        };
        setActivity(updatedActivity);

        // Also trigger a full refresh to ensure consistency
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

        // Update local state
        updateActivity(activity.id, {
          title: editTitle,
          date: editDate,
          time: editTime,
          location: editLocation,
          category: editCategory!,
        });

        Alert.alert('Gemt', 'Aktiviteten er blevet opdateret');
        setIsEditing(false);
        
        // Refresh the activity data
        const updatedActivity = {
          ...activity,
          title: editTitle,
          date: editDate,
          time: editTime,
          location: editLocation,
          category: editCategory!,
        };
        setActivity(updatedActivity);
        
        // Also trigger a full refresh to ensure consistency
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

  const handleToggleTask = async (taskId: string) => {
    if (!activity) return;
    
    try {
      await toggleTaskCompletion(activity.id, taskId);
      
      // Update local activity state
      setActivity({
        ...activity,
        tasks: activity.tasks.map(task =>
          task.id === taskId ? { ...task, completed: !task.completed } : task
        ),
      });
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
              
              console.log('✅ Task deleted successfully, updating local state');
              // Update local activity state
              setActivity({
                ...activity,
                tasks: activity.tasks.filter(task => task.id !== taskId),
              });
              
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
      Alert.alert(
        'Kan ikke slette',
        'Denne aktivitet er fra en ekstern kalender og kan ikke slettes fra appen. Slet den i den eksterne kalender i stedet.'
      );
      return;
    }
    setShowDeleteDialog(true);
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

  if (!activity) {
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

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: activity.category.color }]}>
        <TouchableOpacity
          style={styles.backButton}
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
          <TouchableOpacity
            style={styles.editButton}
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
        )}
      </View>

      <ScrollView
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
                        <Text style={[styles.taskDescription, { color: textSecondaryColor }]}>
                          {task.description}
                        </Text>
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

            {/* Delete Button */}
            {!activity.isExternal && (
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
            )}
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
              detaljer skal du opdatere den i den eksterne kalender.
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
        <View style={{ height: 100 }} />
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
    </View>
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
  header: {
    paddingTop: Platform.OS === 'android' ? 60 : 70,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  backButton: {
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
  editButton: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 60 : 70,
    right: 20,
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
  taskDescription: {
    fontSize: 14,
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
