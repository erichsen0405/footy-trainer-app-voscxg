
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

export default function ActivityDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { activities, externalActivities, categories, updateActivity } = useFootball();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [activity, setActivity] = useState<Activity | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
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

  const handleSave = async () => {
    if (!activity) return;

    setIsSaving(true);

    try {
      // Format date and time for database
      const dateStr = editDate.toISOString().split('T')[0];
      
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

        Alert.alert('Gemt', 'Kategorien er blevet opdateret');
      } else {
        // For internal activities, allow full edit
        const { error } = await supabase
          .from('activities')
          .update({
            title: editTitle,
            activity_date: dateStr,
            activity_time: editTime,
            location: editLocation,
            category_id: editCategory?.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', activity.id);

        if (error) {
          console.error('Error updating activity:', error);
          Alert.alert('Fejl', 'Kunne ikke opdatere aktiviteten');
          return;
        }

        // Update local state
        updateActivity(activity.id, {
          title: editTitle,
          date: editDate,
          time: editTime,
          location: editLocation,
          category: editCategory!,
        });

        Alert.alert('Gemt', 'Aktiviteten er blevet opdateret');
      }

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
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setEditDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(Platform.OS === 'ios');
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setEditTime(`${hours}:${minutes}`);
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
    return `${formatDate(date)} kl. ${time}`;
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
        </View>

        {!activity.isExternal && !isEditing && (
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => setIsEditing(true)}
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
                android_material_icon_name="title"
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
          {isEditing && !activity.isExternal ? (
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
              </View>

              <View style={styles.fieldContainer}>
                <Text style={[styles.fieldLabel, { color: textColor }]}>Tidspunkt</Text>
                <TouchableOpacity
                  style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                  onPress={() => setShowTimePicker(true)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.dateTimeText, { color: textColor }]}>{editTime}</Text>
                  <IconSymbol
                    ios_icon_name="clock"
                    android_material_icon_name="access_time"
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={editDate}
                  mode="date"
                  display="default"
                  onChange={handleDateChange}
                />
              )}

              {showTimePicker && (
                <DateTimePicker
                  value={new Date(`2000-01-01T${editTime}`)}
                  mode="time"
                  display="default"
                  onChange={handleTimeChange}
                />
              )}
            </React.Fragment>
          ) : (
            <View style={styles.detailRow}>
              <IconSymbol
                ios_icon_name="calendar.badge.clock"
                android_material_icon_name="schedule"
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
            {isEditing || activity.isExternal ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
              >
                {categories.map((cat, index) => (
                  <TouchableOpacity
                    key={index}
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
        {activity.tasks && activity.tasks.length > 0 && (
          <View style={[styles.section, { backgroundColor: cardBgColor }]}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Opgaver</Text>
            {activity.tasks.map((task, index) => (
              <View key={index} style={styles.taskRow}>
                <View
                  style={[
                    styles.taskCheckbox,
                    task.completed && { backgroundColor: colors.success },
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
              </View>
            ))}
          </View>
        )}

        {/* Action Buttons */}
        {isEditing && (
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

        {/* Bottom Padding */}
        <View style={{ height: 100 }} />
      </ScrollView>
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
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
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
