
import React, { useState, useRef, useEffect } from 'react';
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
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { ActivityCategory } from '@/types';
import DateTimePicker from '@react-native-community/datetimepicker';

interface CreateActivityModalProps {
  visible: boolean;
  onClose: () => void;
  onCreateActivity: (activityData: ActivityCreationData) => Promise<void>;
  categories: ActivityCategory[];
}

export interface ActivityCreationData {
  title: string;
  location: string;
  categoryId: string;
  date: Date;
  time: string;
  isRecurring: boolean;
  recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
  recurrenceDays?: number[]; // 0=Sunday, 1=Monday, etc.
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

export default function CreateActivityModal({
  visible,
  onClose,
  onCreateActivity,
  categories,
}: CreateActivityModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const scrollViewRef = useRef<ScrollView>(null);

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.id || '');
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState('18:00');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)); // 90 days from now
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  // Scroll to bottom when picker is shown
  useEffect(() => {
    if (showDatePicker || showTimePicker || showEndDatePicker) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [showDatePicker, showTimePicker, showEndDatePicker]);

  const resetForm = () => {
    setTitle('');
    setLocation('');
    setSelectedCategory(categories[0]?.id || '');
    setDate(new Date());
    setTime('18:00');
    setIsRecurring(false);
    setRecurrenceType('weekly');
    setSelectedDays([]);
    setHasEndDate(false);
    setEndDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  };

  const handleClose = () => {
    resetForm();
    onClose();
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

    if (isRecurring && (recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') && selectedDays.length === 0) {
      Alert.alert('Fejl', 'Vælg venligst mindst én dag for gentagelse');
      return;
    }

    setIsCreating(true);

    try {
      const activityData: ActivityCreationData = {
        title: title.trim(),
        location: location.trim() || 'Ingen lokation',
        categoryId: selectedCategory,
        date,
        time,
        isRecurring,
        recurrenceType: isRecurring ? recurrenceType : undefined,
        recurrenceDays: isRecurring && (recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') ? selectedDays : undefined,
        endDate: isRecurring && hasEndDate ? endDate : undefined,
      };

      await onCreateActivity(activityData);
      handleClose();
      Alert.alert('Succes', isRecurring ? 'Aktivitetsserie oprettet!' : 'Aktivitet oprettet!');
    } catch (error) {
      console.error('Error creating activity:', error);
      Alert.alert('Fejl', 'Kunne ikke oprette aktivitet');
    } finally {
      setIsCreating(false);
    }
  };

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
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

  const handleWebTimeChange = (event: any) => {
    const value = event.target.value;
    if (value) {
      setTime(value);
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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('da-DK', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const needsDaySelection = recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly';

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: textColor }]}>Opret aktivitet</Text>
            <TouchableOpacity onPress={handleClose} activeOpacity={0.7}>
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
            style={styles.modalBody} 
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Title */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Titel *</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={title}
                onChangeText={setTitle}
                placeholder="F.eks. Fodboldtræning"
                placeholderTextColor={textSecondaryColor}
              />
            </View>

            {/* Location */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Lokation</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={location}
                onChangeText={setLocation}
                placeholder="F.eks. Stadion"
                placeholderTextColor={textSecondaryColor}
              />
            </View>

            {/* Category */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Kategori *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
                {categories.map((cat, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: selectedCategory === cat.id ? cat.color : bgColor,
                        borderColor: cat.color,
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => setSelectedCategory(cat.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
                    <Text
                      style={[
                        styles.categoryName,
                        { color: selectedCategory === cat.id ? '#fff' : textColor },
                      ]}
                    >
                      {cat.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Date */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>
                {isRecurring ? 'Startdato *' : 'Dato *'}
              </Text>
              <TouchableOpacity
                style={[styles.dateTimeButton, { backgroundColor: bgColor }]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dateTimeText, { color: textColor }]}>{formatDate(date)}</Text>
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
                    value={date}
                    mode="date"
                    display="spinner"
                    onChange={handleDateChange}
                    minimumDate={new Date()}
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

            {/* Time */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Tidspunkt *</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="time"
                  value={time}
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
                    <Text style={[styles.dateTimeText, { color: textColor }]}>{time}</Text>
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
                        value={new Date(`2000-01-01T${time}`)}
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

            {/* Recurring Toggle */}
            <View style={styles.fieldContainer}>
              <TouchableOpacity
                style={styles.recurringToggle}
                onPress={() => setIsRecurring(!isRecurring)}
                activeOpacity={0.7}
              >
                <View style={styles.recurringToggleLeft}>
                  <IconSymbol
                    ios_icon_name="repeat"
                    android_material_icon_name="repeat"
                    size={24}
                    color={isRecurring ? colors.primary : textSecondaryColor}
                  />
                  <Text style={[styles.recurringToggleText, { color: textColor }]}>
                    Gentag aktivitet
                  </Text>
                </View>
                <View
                  style={[
                    styles.toggle,
                    { backgroundColor: isRecurring ? colors.primary : colors.highlight },
                  ]}
                >
                  <View
                    style={[
                      styles.toggleThumb,
                      isRecurring && styles.toggleThumbActive,
                    ]}
                  />
                </View>
              </TouchableOpacity>
            </View>

            {/* Recurrence Options */}
            {isRecurring && (
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
                          // Clear selected days if switching away from weekly patterns
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

                {/* Day Selection for Weekly Patterns */}
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

                {/* End Date Toggle */}
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

                {/* End Date Picker */}
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
                          minimumDate={date}
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
              </React.Fragment>
            )}

            {/* Android Date/Time Pickers */}
            {Platform.OS === 'android' && showDatePicker && (
              <DateTimePicker
                value={date}
                mode="date"
                display="default"
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
            )}

            {Platform.OS === 'android' && showTimePicker && (
              <DateTimePicker
                value={new Date(`2000-01-01T${time}`)}
                mode="time"
                display="default"
                onChange={handleTimeChange}
              />
            )}

            {Platform.OS === 'android' && showEndDatePicker && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display="default"
                onChange={handleEndDateChange}
                minimumDate={date}
              />
            )}

            {/* Extra padding for scroll */}
            <View style={{ height: 200 }} />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.cancelButton,
                { backgroundColor: bgColor, borderColor: colors.highlight },
              ]}
              onPress={handleClose}
              activeOpacity={0.7}
              disabled={isCreating}
            >
              <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.saveButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={handleCreate}
              activeOpacity={0.7}
              disabled={isCreating}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Opret</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalBody: {
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingTop: 24,
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
  modalFooter: {
    flexDirection: 'row',
    gap: 14,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.highlight,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 2,
  },
  saveButton: {},
  modalButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
