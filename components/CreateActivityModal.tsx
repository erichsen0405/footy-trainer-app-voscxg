
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  Switch,
} from 'react-native';

import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ActivityCategory } from '@/types';
import DateTimePicker from '@react-native-community/datetimepicker';
import CategoryManagementModal from '@/components/CategoryManagementModal';

interface CreateActivityModalProps {
  visible: boolean;
  onClose?: () => void;
  onCreateActivity: (activityData: ActivityCreationData) => Promise<void>;
  categories?: ActivityCategory[];
  onRefreshCategories: () => void;
}

export interface ActivityCreationData {
  title: string;
  location: string;
  categoryId: string;
  date: Date;
  time: string;
  isRecurring: boolean;
  recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
  recurrenceDays?: number[];
  endDate?: Date;
}

const DAYS_OF_WEEK = [
  { label: 'Søn', value: 0 },
  { label: 'Man', value: 1 },
  { label: 'Tir', value: 2 },
  { label: 'Ons', value: 3 },
  { label: 'Tor', value: 4 },
  { label: 'Fre', value: 5 },
  { label: 'Lør', value: 6 },
];

const RECURRENCE_TYPES = [
  { label: 'Daglig', value: 'daily' as const },
  { label: 'Ugentlig', value: 'weekly' as const },
  { label: 'Hver 2. uge', value: 'biweekly' as const },
  { label: 'Hver 3. uge', value: 'triweekly' as const },
  { label: 'Månedlig', value: 'monthly' as const },
];

export default function CreateActivityModal({
  visible,
  onClose,
  onCreateActivity,
  categories,
  onRefreshCategories,
}: CreateActivityModalProps) {
  // All hooks must be called unconditionally at the top level
  const colorScheme = useColorScheme();
  const scrollViewRef = useRef<ScrollView>(null);
  
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState('18:00');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);

  const isDark = colorScheme === 'dark';
  const safeOnClose = typeof onClose === 'function' ? onClose : () => {};
  const safeCategories: ActivityCategory[] = useMemo(() => 
    Array.isArray(categories) ? categories : [], 
    [categories]
  );

  const bgColor = useMemo(() => {
    if (isDark) return '#1a1a1a';
    if (typeof colors.background === 'string') return colors.background;
    return '#ffffff';
  }, [isDark]);

  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  useEffect(() => {
    if (safeCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(safeCategories[0].id);
    }
  }, [safeCategories, selectedCategory]);

  const handleClose = () => {
    setTitle('');
    setLocation('');
    setSelectedCategory(safeCategories[0]?.id || '');
    setDate(new Date());
    setTime('18:00');
    setIsRecurring(false);
    setRecurrenceType('weekly');
    setSelectedDays([]);
    setHasEndDate(false);
    setEndDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
    safeOnClose();
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Indtast venligst en titel');
      return;
    }

    if (!selectedCategory) {
      Alert.alert('Fejl', 'Vælg venligst en kategori');
      return;
    }

    if (
      isRecurring &&
      ['weekly', 'biweekly', 'triweekly'].includes(recurrenceType) &&
      selectedDays.length === 0
    ) {
      Alert.alert('Fejl', 'Vælg mindst én dag');
      return;
    }

    setIsCreating(true);

    try {
      await onCreateActivity({
        title: title.trim(),
        location: location.trim() || 'Ingen lokation',
        categoryId: selectedCategory,
        date,
        time,
        isRecurring,
        recurrenceType: isRecurring ? recurrenceType : undefined,
        recurrenceDays:
          isRecurring &&
          ['weekly', 'biweekly', 'triweekly'].includes(recurrenceType)
            ? selectedDays
            : undefined,
        endDate: isRecurring && hasEndDate ? endDate : undefined,
      });

      handleClose();
      Alert.alert('Succes', 'Aktivitet oprettet');
    } catch {
      Alert.alert('Fejl', 'Kunne ikke oprette aktivitet');
    } finally {
      setIsCreating(false);
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day)
        ? prev.filter(d => d !== day)
        : [...prev, day].sort()
    );
  };

  const needsDaySelection =
    recurrenceType === 'weekly' ||
    recurrenceType === 'biweekly' ||
    recurrenceType === 'triweekly';

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      setDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') {
      setShowTimePicker(false);
    }
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setTime(`${hours}:${minutes}`);
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

  const getTimeAsDate = () => {
    const [hours, minutes] = time.split(':').map(Number);
    const timeDate = new Date();
    timeDate.setHours(hours);
    timeDate.setMinutes(minutes);
    return timeDate;
  };

  // Early return after all hooks have been called
  if (!visible) return null;

  return (
    <>
      <Modal visible animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                Opret aktivitet
              </Text>
              <TouchableOpacity onPress={handleClose}>
                <IconSymbol
                  ios_icon_name="xmark.circle.fill"
                  android_material_icon_name="close"
                  size={32}
                  color={textSecondaryColor}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollViewRef}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              {/* Title Input */}
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Titel *"
                placeholderTextColor={textSecondaryColor}
              />

              {/* Location Input */}
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={location}
                onChangeText={setLocation}
                placeholder="Lokation"
                placeholderTextColor={textSecondaryColor}
              />

              {/* Category Selection */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScrollContainer}>
                {safeCategories.map((cat, index) => (
                  <TouchableOpacity
                    key={cat.id ?? `category-${index}`}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor:
                          selectedCategory === cat.id ? cat.color : bgColor,
                        borderColor: cat.color,
                      },
                    ]}
                    onPress={() => setSelectedCategory(cat.id)}
                  >
                    <Text>{cat.emoji}</Text>
                    <Text
                      style={{
                        color:
                          selectedCategory === cat.id ? '#fff' : textColor,
                      }}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Date Picker */}
              <TouchableOpacity
                style={[styles.pickerButton, { backgroundColor: bgColor }]}
                onPress={() => setShowDatePicker(true)}
              >
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="calendar_today"
                  size={20}
                  color={textColor}
                />
                <Text style={[styles.pickerButtonText, { color: textColor }]}>
                  {formatDate(date)}
                </Text>
              </TouchableOpacity>

              {showDatePicker && (
                <View style={[
                  Platform.OS === 'ios' ? styles.iosPickerContainer : undefined,
                  { backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF' }
                ]}>
                  <DateTimePicker
                    value={date}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleDateChange}
                    minimumDate={new Date()}
                    themeVariant={isDark ? 'dark' : 'light'}
                    textColor={Platform.OS === 'ios' ? (isDark ? '#FFFFFF' : '#000000') : undefined}
                    style={Platform.OS === 'ios' ? styles.iosPicker : undefined}
                  />
                </View>
              )}

              {Platform.OS === 'ios' && showDatePicker && (
                <TouchableOpacity
                  style={[styles.doneButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowDatePicker(false)}
                >
                  <Text style={styles.doneButtonText}>Færdig</Text>
                </TouchableOpacity>
              )}

              {/* Time Picker */}
              <TouchableOpacity
                style={[styles.pickerButton, { backgroundColor: bgColor }]}
                onPress={() => setShowTimePicker(true)}
              >
                <IconSymbol
                  ios_icon_name="clock"
                  android_material_icon_name="schedule"
                  size={20}
                  color={textColor}
                />
                <Text style={[styles.pickerButtonText, { color: textColor }]}>
                  {time}
                </Text>
              </TouchableOpacity>

              {showTimePicker && (
                <View style={[
                  Platform.OS === 'ios' ? styles.iosPickerContainer : undefined,
                  { backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF' }
                ]}>
                  <DateTimePicker
                    value={getTimeAsDate()}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleTimeChange}
                    is24Hour={true}
                    themeVariant={isDark ? 'dark' : 'light'}
                    textColor={Platform.OS === 'ios' ? (isDark ? '#FFFFFF' : '#000000') : undefined}
                    style={Platform.OS === 'ios' ? styles.iosPicker : undefined}
                  />
                </View>
              )}

              {Platform.OS === 'ios' && showTimePicker && (
                <TouchableOpacity
                  style={[styles.doneButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowTimePicker(false)}
                >
                  <Text style={styles.doneButtonText}>Færdig</Text>
                </TouchableOpacity>
              )}

              {/* Series Toggle */}
              <View style={[styles.switchContainer, { backgroundColor: bgColor }]}>
                <View style={styles.switchLabelContainer}>
                  <IconSymbol
                    ios_icon_name="repeat"
                    android_material_icon_name="repeat"
                    size={20}
                    color={textColor}
                  />
                  <Text style={[styles.switchLabel, { color: textColor }]}>
                    Opret som serie
                  </Text>
                </View>
                <Switch
                  value={isRecurring}
                  onValueChange={setIsRecurring}
                  trackColor={{ false: '#767577', true: colors.primary }}
                  thumbColor={isRecurring ? '#fff' : '#f4f3f4'}
                />
              </View>

              {/* Recurrence Options */}
              {isRecurring && (
                <>
                  <View style={styles.recurrenceTypeContainer}>
                    {RECURRENCE_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.value}
                        style={[
                          styles.recurrenceTypeButton,
                          {
                            backgroundColor:
                              recurrenceType === type.value
                                ? colors.primary
                                : bgColor,
                          },
                        ]}
                        onPress={() => setRecurrenceType(type.value)}
                      >
                        <Text
                          style={{
                            color:
                              recurrenceType === type.value
                                ? '#fff'
                                : textColor,
                            fontSize: 14,
                          }}
                        >
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {needsDaySelection && (
                    <View style={styles.daysContainer}>
                      {DAYS_OF_WEEK.map(day => (
                        <TouchableOpacity
                          key={`day-${day.value}`}
                          style={[
                            styles.dayButton,
                            {
                              backgroundColor: selectedDays.includes(day.value)
                                ? colors.primary
                                : bgColor,
                            },
                          ]}
                          onPress={() => toggleDay(day.value)}
                        >
                          <Text
                            style={{
                              color: selectedDays.includes(day.value)
                                ? '#fff'
                                : textColor,
                            }}
                          >
                            {day.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* End Date Toggle */}
                  <View style={[styles.switchContainer, { backgroundColor: bgColor }]}>
                    <Text style={[styles.switchLabel, { color: textColor }]}>
                      Slutdato
                    </Text>
                    <Switch
                      value={hasEndDate}
                      onValueChange={setHasEndDate}
                      trackColor={{ false: '#767577', true: colors.primary }}
                      thumbColor={hasEndDate ? '#fff' : '#f4f3f4'}
                    />
                  </View>

                  {/* End Date Picker */}
                  {hasEndDate && (
                    <>
                      <TouchableOpacity
                        style={[styles.pickerButton, { backgroundColor: bgColor }]}
                        onPress={() => setShowEndDatePicker(true)}
                      >
                        <IconSymbol
                          ios_icon_name="calendar.badge.clock"
                          android_material_icon_name="event"
                          size={20}
                          color={textColor}
                        />
                        <Text style={[styles.pickerButtonText, { color: textColor }]}>
                          {formatDate(endDate)}
                        </Text>
                      </TouchableOpacity>

                      {showEndDatePicker && (
                        <View style={[
                          Platform.OS === 'ios' ? styles.iosPickerContainer : undefined,
                          { backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF' }
                        ]}>
                          <DateTimePicker
                            value={endDate}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={handleEndDateChange}
                            minimumDate={date}
                            themeVariant={isDark ? 'dark' : 'light'}
                            textColor={Platform.OS === 'ios' ? (isDark ? '#FFFFFF' : '#000000') : undefined}
                            style={Platform.OS === 'ios' ? styles.iosPicker : undefined}
                          />
                        </View>
                      )}

                      {Platform.OS === 'ios' && showEndDatePicker && (
                        <TouchableOpacity
                          style={[styles.doneButton, { backgroundColor: colors.primary }]}
                          onPress={() => setShowEndDatePicker(false)}
                        >
                          <Text style={styles.doneButtonText}>Færdig</Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleClose}
                disabled={isCreating}
              >
                <Text>Annuller</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton]}
                onPress={handleCreate}
                disabled={isCreating}
              >
                {isCreating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff' }}>Opret</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <CategoryManagementModal
        visible={showCategoryManagement}
        onClose={() => setShowCategoryManagement(false)}
        categories={safeCategories}
        onRefresh={onRefreshCategories}
      />
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    padding: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 0,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
    marginBottom: 16,
  },
  categoryScrollContainer: {
    marginBottom: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 12,
    alignItems: 'center',
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  pickerButtonText: {
    fontSize: 17,
  },
  iosPickerContainer: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  iosPicker: {
    height: 200,
  },
  doneButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  doneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  switchLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchLabel: {
    fontSize: 17,
  },
  recurrenceTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  recurrenceTypeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  daysContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  dayButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#ddd',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
});
