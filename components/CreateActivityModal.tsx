import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import { useFootball } from '@/contexts/FootballContext';
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
  endTime?: string;
  intensity?: number | null;
  intensityEnabled?: boolean;
  isRecurring: boolean;
  recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
  recurrenceDays?: number[];
  endDate?: Date;
  intensityApplyScope?: 'single' | 'category';
}

type IntensityScopeModalState = {
  visible: boolean;
  nextEnabled: boolean;
  previousEnabled: boolean;
  previousScope: 'single' | 'category';
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

const RECURRENCE_TYPES = [
  { label: 'Daglig', value: 'daily' as const },
  { label: 'Ugentlig', value: 'weekly' as const },
  { label: 'Hver 2. uge', value: 'biweekly' as const },
  { label: 'Hver 3. uge', value: 'triweekly' as const },
  { label: 'Månedlig', value: 'monthly' as const },
];

const timeToMinutes = (timeStr: string | null | undefined): number | null => {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  if (parts.length < 2) return null;

  const [hoursStr, minutesStr] = parts;
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
};

const formatTimeHHMM = (date: Date): string => {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const getDefaultStartEndTimes = (): { startTime: string; endTime: string } => {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const safeEndMinutes = Math.min(startMinutes + 60, 23 * 60 + 59);
  const end = new Date(start);
  end.setHours(Math.floor(safeEndMinutes / 60), safeEndMinutes % 60, 0, 0);
  return {
    startTime: formatTimeHHMM(start),
    endTime: formatTimeHHMM(end),
  };
};

export default function CreateActivityModal({
  visible,
  onClose,
  onCreateActivity,
  categories,
  onRefreshCategories,
}: CreateActivityModalProps) {
  const colorScheme = useColorScheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const defaultTimesRef = useRef(getDefaultStartEndTimes());

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState(defaultTimesRef.current.startTime);
  const [endTime, setEndTime] = useState(defaultTimesRef.current.endTime);
  const [endTimeError, setEndTimeError] = useState<string | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly'>('weekly');
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [hasEndDate, setHasEndDate] = useState(false);
  const [endDate, setEndDate] = useState(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showCategoryManagement, setShowCategoryManagement] = useState(false);
  const [intensityEnabled, setIntensityEnabled] = useState(false);
  const [intensityValue, setIntensityValue] = useState<number | null>(null);
  const [intensityApplyScope, setIntensityApplyScope] = useState<'single' | 'category'>('single');
  const [intensityScopeModal, setIntensityScopeModal] = useState<IntensityScopeModalState>({
    visible: false,
    nextEnabled: false,
    previousEnabled: false,
    previousScope: 'single',
  });

  // validate end time whenever time / endTime changes
  useEffect(() => {
    if (!endTime) {
      setEndTimeError(null);
      return;
    }

    const startMinutes = timeToMinutes(time);
    const endMinutes = timeToMinutes(endTime);

    if (startMinutes == null || endMinutes == null) {
      setEndTimeError(null);
      return;
    }

    if (endMinutes <= startMinutes) {
      setEndTimeError('Sluttidspunkt skal være efter starttidspunktet');
    } else {
      setEndTimeError(null);
    }
  }, [time, endTime]);

  // (1) ✅ add ref + effect close to state hooks
  const showCategoryManagementRef = useRef(false);

  useEffect(() => {
    showCategoryManagementRef.current = showCategoryManagement;
  }, [showCategoryManagement]);

  const { refreshCategories } = useFootball();

  const isDark = colorScheme === 'dark';

  // Track interaction so auto-select doesn’t re-select after user toggles off
  const userTouchedCategoryRef = useRef(false);

  useEffect(() => {
    if (visible) userTouchedCategoryRef.current = false;
  }, [visible]);

  const safeCategories: ActivityCategory[] = useMemo(() => {
    return Array.isArray(categories) ? categories : [];
  }, [categories]);

  const bgColor = useMemo(() => {
    if (isDark) return '#1a1a1a';
    if (typeof colors.background === 'string') return colors.background;
    return '#ffffff';
  }, [isDark]);

  const cardBgColor = useMemo(() => (isDark ? '#2a2a2a' : colors.card), [isDark]);
  const textColor = useMemo(() => (isDark ? '#e3e3e3' : colors.text), [isDark]);
  const textSecondaryColor = useMemo(() => (isDark ? '#999' : colors.textSecondary), [isDark]);

  // Auto-select first category only if user hasn’t interacted
  useEffect(() => {
    if (safeCategories.length > 0 && !selectedCategory && !userTouchedCategoryRef.current) {
      setSelectedCategory(safeCategories[0].id);
    }
  }, [safeCategories, selectedCategory]);

  const handleClose = useCallback(() => {
    const safeOnClose = typeof onClose === 'function' ? onClose : () => {};

    setTitle('');
    setLocation('');
    setSelectedCategory(safeCategories[0]?.id || '');
    setDate(new Date());
    const nextDefaults = getDefaultStartEndTimes();
    setTime(nextDefaults.startTime);
    setEndTime(nextDefaults.endTime);
    setEndTimeError(null);
    setIsRecurring(false);
    setRecurrenceType('weekly');
    setSelectedDays([]);
    setHasEndDate(false);
    setEndDate(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));
    setShowCategoryManagement(false);
    setIntensityEnabled(false);
    setIntensityValue(null);
    setIntensityApplyScope('single');
    setIntensityScopeModal({
      visible: false,
      nextEnabled: false,
      previousEnabled: false,
      previousScope: 'single',
    });
    userTouchedCategoryRef.current = false;

    safeOnClose();
  }, [safeCategories, onClose]);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Indtast venligst en titel');
      return;
    }

    if (safeCategories.length === 0) {
      Alert.alert('Ingen kategorier', 'Opret en kategori først', [{ text: 'OK', style: 'default' }]);
      return;
    }

    const effectiveCategoryId = selectedCategory || safeCategories[0]?.id || '';

    if (!effectiveCategoryId) {
      Alert.alert('Fejl', 'Vælg venligst en kategori');
      return;
    }

    if (endTimeError) {
      Alert.alert('Fejl', endTimeError);
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

    const normalizedIntensity = intensityEnabled ? intensityValue ?? null : null;

    setIsCreating(true);

    try {
      await onCreateActivity({
        title: title.trim(),
        location: location.trim() || 'Ingen lokation',
        categoryId: effectiveCategoryId,
        date,
        time,
        // gør sluttid valgfri – hvis tom/whitespace, send undefined
        endTime: endTime?.trim() ? endTime.trim() : undefined,
        intensity: normalizedIntensity,
        intensityEnabled,
        isRecurring,
        recurrenceType: isRecurring ? recurrenceType : undefined,
        recurrenceDays:
          isRecurring && ['weekly', 'biweekly', 'triweekly'].includes(recurrenceType)
            ? selectedDays
            : undefined,
        endDate: isRecurring && hasEndDate ? endDate : undefined,
        intensityApplyScope,
      });

      handleClose();
      Alert.alert('Succes', 'Aktivitet oprettet');
    } catch (error) {
      console.error('Error creating activity:', error);
      Alert.alert('Fejl', 'Kunne ikke oprette aktivitet');
    } finally {
      setIsCreating(false);
    }
  }, [
    title,
    selectedCategory,
    isRecurring,
    recurrenceType,
    selectedDays,
    location,
    date,
    time,
    endTime,
    endTimeError,
    intensityEnabled,
    intensityValue,
    intensityApplyScope,
    hasEndDate,
    endDate,
    onCreateActivity,
    handleClose,
    safeCategories,
  ]);

  const toggleDay = useCallback((day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  }, []);

  const needsDaySelection = useMemo(
    () => recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly',
    [recurrenceType]
  );

  const formatDate = useCallback((d: Date) => {
    return d.toLocaleDateString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }, []);

  const handleDateChange = useCallback((event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (selectedDate) setDate(selectedDate);
  }, []);

  const handleTimeChange = useCallback((event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      const newTime = `${hours}:${minutes}`;
      setTime(newTime);

      // Auto-adjust end time only if endTime is set
      if (endTime && endTime <= newTime) {
        const startMinutes = parseInt(hours, 10) * 60 + parseInt(minutes, 10);
        const endMinutes = Math.min(startMinutes + 60, 23 * 60 + 59);
        const endHours = Math.floor(endMinutes / 60).toString().padStart(2, '0');
        const endMins = (endMinutes % 60).toString().padStart(2, '0');
        setEndTime(`${endHours}:${endMins}`);
      }
    }
  }, [endTime]);

  const handleEndTimeChange = useCallback((event: any, selectedTime?: Date) => {
    if (Platform.OS === 'android') setShowEndTimePicker(false);
    if (selectedTime) {
      const hours = selectedTime.getHours().toString().padStart(2, '0');
      const minutes = selectedTime.getMinutes().toString().padStart(2, '0');
      setEndTime(`${hours}:${minutes}`);
    }
  }, []);

  const handleEndDateChange = useCallback((event: any, selectedDate?: Date) => {
    if (Platform.OS === 'android') setShowEndDatePicker(false);
    if (selectedDate) setEndDate(selectedDate);
  }, []);

  const getTimeAsDate = useCallback(() => {
    const [hours, minutes] = time.split(':').map(Number);
    const timeDate = new Date();
    timeDate.setHours(hours);
    timeDate.setMinutes(minutes);
    return timeDate;
  }, [time]);

  const getEndTimeAsDate = useCallback(() => {
    if (!endTime) return new Date();
    const [hours, minutes] = endTime.split(':').map(Number);
    const timeDate = new Date();
    timeDate.setHours(hours);
    timeDate.setMinutes(minutes);
    return timeDate;
  }, [endTime]);

  // (2) ✅ openCategoryManagement (no fetch, only state) — removed logs
  const openCategoryManagement = useCallback(() => {
    const wasOpen = showCategoryManagementRef.current;

    if (wasOpen) {
      setShowCategoryManagement(false);
      requestAnimationFrame(() => {
        setShowCategoryManagement(true);
      });
      return;
    }

    setShowCategoryManagement(true);
  }, []);

  // (3) ✅ closeCategoryManagement — removed log
  const closeCategoryManagement = useCallback(() => {
    setShowCategoryManagement(false);
  }, []);

  const handleRefreshCategories = useCallback(async () => {
    if (typeof refreshCategories === 'function') {
      await refreshCategories();
    } else if (typeof onRefreshCategories === 'function') {
      await onRefreshCategories();
    }
  }, [refreshCategories, onRefreshCategories]);

  const handleCategoryToggle = useCallback((categoryId: string) => {
    userTouchedCategoryRef.current = true;
    setSelectedCategory(prev => (prev === categoryId ? '' : categoryId));
  }, []);

  const handleIntensityToggle = useCallback((enabled: boolean) => {
    if (enabled === intensityEnabled) return;
    if (intensityScopeModal.visible) return;

    setIntensityEnabled(enabled);
    if (!enabled) {
      setIntensityValue(null);
    }

    setIntensityScopeModal({
      visible: true,
      nextEnabled: enabled,
      previousEnabled: intensityEnabled,
      previousScope: intensityApplyScope,
    });
  }, [intensityApplyScope, intensityEnabled, intensityScopeModal.visible]);

  const closeIntensityScopeModal = useCallback(() => {
    setIntensityScopeModal(prev => ({ ...prev, visible: false }));
  }, []);

  const handleIntensityApplyAll = useCallback(() => {
    setIntensityApplyScope('category');
    closeIntensityScopeModal();
  }, [closeIntensityScopeModal]);

  const handleIntensityApplySingle = useCallback(() => {
    setIntensityApplyScope('single');
    closeIntensityScopeModal();
  }, [closeIntensityScopeModal]);

  const handleIntensityCancel = useCallback(() => {
    setIntensityEnabled(intensityScopeModal.previousEnabled);
    if (!intensityScopeModal.previousEnabled) {
      setIntensityValue(null);
    }
    setIntensityApplyScope(intensityScopeModal.previousScope);
    closeIntensityScopeModal();
  }, [
    closeIntensityScopeModal,
    intensityScopeModal.previousEnabled,
    intensityScopeModal.previousScope,
  ]);

  // Avoid inline lambdas in render
  const categoryPressHandlers = useMemo(() => {
    const map: Record<string, () => void> = {};
    for (const c of safeCategories) {
      map[c.id] = () => handleCategoryToggle(c.id);
    }
    return map;
  }, [safeCategories, handleCategoryToggle]);

  if (!visible) return null;

  return (
    <>
      <Modal
        visible
        animationType="slide"
        transparent
        presentationStyle="overFullScreen"
        onRequestClose={handleClose}
      >
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
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Titel *"
                placeholderTextColor={textSecondaryColor}
                testID="activity.create.titleInput"
              />

              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={location}
                onChangeText={setLocation}
                placeholder="Lokation"
                placeholderTextColor={textSecondaryColor}
                testID="activity.create.locationInput"
              />

              {/* Category */}
              <View>
                <View style={styles.categoryHeaderRow}>
                  <Text style={[styles.categoryHeaderText, { color: textColor }]}>Kategori</Text>

                  {/* ✅ P14: replace top-right button block 1:1 */}
                  <TouchableOpacity
                    onPress={openCategoryManagement}
                    activeOpacity={0.7}
                    style={styles.createCategoryTopRight}
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    testID="activity.create.openCategoryButton"
                  >
                    <Text style={styles.createCategoryTopRightText}>+ Opret kategori</Text>
                  </TouchableOpacity>
                </View>

                {safeCategories.length === 0 ? (
                  <TouchableOpacity onPress={openCategoryManagement} activeOpacity={0.7}>
                    <View style={[styles.emptyCategoryContainer, { backgroundColor: bgColor }]}>
                      <IconSymbol
                        ios_icon_name="folder.badge.plus"
                        android_material_icon_name="create_new_folder"
                        size={32}
                        color={textSecondaryColor}
                      />
                      <Text style={[styles.emptyCategoryText, { color: textColor }]}>
                        Opret en kategori først
                      </Text>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.categoryWrapContainer}>
                    {safeCategories.map((cat, index) => {
                      const isSelected = selectedCategory === cat.id;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          style={[
                            styles.categoryChip,
                            {
                              backgroundColor: isSelected ? cat.color : bgColor,
                              borderColor: cat.color,
                            },
                          ]}
                          onPress={categoryPressHandlers[cat.id]}
                          activeOpacity={0.7}
                          testID={`activity.create.categoryChip.${index}`}
                        >
                          <Text style={styles.categoryChipEmoji}>{cat.emoji}</Text>
                          <Text
                            style={[
                              styles.categoryChipText,
                              { color: isSelected ? '#fff' : textColor },
                            ]}
                          >
                            {cat.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* Date Picker */}
              <TouchableOpacity
                style={[styles.pickerButton, { backgroundColor: bgColor }]}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="calendar_today"
                  size={20}
                  color={textColor}
                />
                <Text style={[styles.pickerButtonText, { color: textColor }]}>{formatDate(date)}</Text>
              </TouchableOpacity>

              {showDatePicker ? (
                <View
                  style={[
                    Platform.OS === 'ios' ? styles.iosPickerContainer : undefined,
                    { backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF' },
                  ]}
                >
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
              ) : null}

              {Platform.OS === 'ios' && showDatePicker ? (
                <TouchableOpacity
                  style={[styles.doneButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowDatePicker(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.doneButtonText}>Færdig</Text>
                </TouchableOpacity>
              ) : null}

              {/* Time Picker */}
              <TouchableOpacity
                style={[styles.pickerButton, { backgroundColor: bgColor }]}
                onPress={() => setShowTimePicker(true)}
                activeOpacity={0.7}
                testID="activity.create.startTimeButton"
              >
                <IconSymbol
                  ios_icon_name="clock"
                  android_material_icon_name="schedule"
                  size={20}
                  color={textColor}
                />
                <Text style={[styles.pickerButtonText, { color: textColor }]}>{time}</Text>
              </TouchableOpacity>

              {showTimePicker ? (
                <View
                  style={[
                    Platform.OS === 'ios' ? styles.iosPickerContainer : undefined,
                    { backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF' },
                  ]}
                >
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
              ) : null}

              {Platform.OS === 'ios' && showTimePicker ? (
                <TouchableOpacity
                  style={[styles.doneButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowTimePicker(false)}
                  activeOpacity={0.7}
                  testID="activity.create.startTimeDone"
                >
                  <Text style={styles.doneButtonText}>Færdig</Text>
                </TouchableOpacity>
              ) : null}

              {/* End Time Picker */}
              <TouchableOpacity
                style={[styles.pickerButton, { backgroundColor: bgColor }]}
                onPress={() => setShowEndTimePicker(true)}
                activeOpacity={0.7}
                testID="activity.create.endTimeButton"
              >
                <IconSymbol
                  ios_icon_name="clock.fill"
                  android_material_icon_name="schedule"
                  size={20}
                  color={textColor}
                />
                <Text style={[styles.pickerButtonText, { color: textColor }]}>
                  {endTime || 'Vælg sluttidspunkt'}
                </Text>
              </TouchableOpacity>

              {showEndTimePicker ? (
                <View
                  style={[
                    Platform.OS === 'ios' ? styles.iosPickerContainer : undefined,
                    { backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF' },
                  ]}
                >
                  <DateTimePicker
                    value={getEndTimeAsDate()}
                    mode="time"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={handleEndTimeChange}
                    is24Hour={true}
                    themeVariant={isDark ? 'dark' : 'light'}
                    textColor={Platform.OS === 'ios' ? (isDark ? '#FFFFFF' : '#000000') : undefined}
                    style={Platform.OS === 'ios' ? styles.iosPicker : undefined}
                  />
                </View>
              ) : null}

              {Platform.OS === 'ios' && showEndTimePicker ? (
                <TouchableOpacity
                  style={[styles.doneButton, { backgroundColor: colors.primary }]}
                  onPress={() => setShowEndTimePicker(false)}
                  activeOpacity={0.7}
                  testID="activity.create.endTimeDone"
                >
                  <Text style={styles.doneButtonText}>Færdig</Text>
                </TouchableOpacity>
              ) : null}

              {/* Validation Error for End Time */}
              {endTimeError ? (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorText}>{endTimeError}</Text>
                </View>
              ) : null}

              {/* Intensity */}
              <View style={[styles.switchContainer, { backgroundColor: bgColor }]}>
                <View style={styles.switchLabelContainer}>
                  <IconSymbol
                    ios_icon_name="flame"
                    android_material_icon_name="local_fire_department"
                    size={20}
                    color={textColor}
                  />
                  <Text style={[styles.switchLabel, { color: textColor }]}>Tilføj intensitet</Text>
                </View>
                <Switch
                  value={intensityEnabled}
                  onValueChange={handleIntensityToggle}
                  trackColor={{ false: '#767577', true: colors.primary }}
                  thumbColor={intensityEnabled ? '#fff' : '#f4f3f4'}
                  testID="activity.create.intensityToggle"
                />
              </View>

              {/* Series Toggle */}
              <View style={[styles.switchContainer, { backgroundColor: bgColor }]}>
                <View style={styles.switchLabelContainer}>
                  <IconSymbol
                    ios_icon_name="repeat"
                    android_material_icon_name="repeat"
                    size={20}
                    color={textColor}
                  />
                  <Text style={[styles.switchLabel, { color: textColor }]}>Opret som serie</Text>
                </View>
                <Switch
                  value={isRecurring}
                  onValueChange={setIsRecurring}
                  trackColor={{ false: '#767577', true: colors.primary }}
                  thumbColor={isRecurring ? '#fff' : '#f4f3f4'}
                />
              </View>

              {isRecurring ? (
                <>
                  <View style={styles.recurrenceTypeContainer}>
                    {RECURRENCE_TYPES.map((type) => (
                      <TouchableOpacity
                        key={type.value}
                        style={[
                          styles.recurrenceTypeButton,
                          { backgroundColor: recurrenceType === type.value ? colors.primary : bgColor },
                        ]}
                        onPress={() => setRecurrenceType(type.value)}
                        activeOpacity={0.7}
                      >
                        <Text style={{ color: recurrenceType === type.value ? '#fff' : textColor, fontSize: 14 }}>
                          {type.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {needsDaySelection ? (
                    <View style={styles.daysContainer}>
                      {DAYS_OF_WEEK.map(day => (
                        <TouchableOpacity
                          key={day.value}
                          style={[
                            styles.dayButton,
                            { backgroundColor: selectedDays.includes(day.value) ? colors.primary : bgColor },
                          ]}
                          onPress={() => toggleDay(day.value)}
                          activeOpacity={0.7}
                        >
                          <Text style={{ color: selectedDays.includes(day.value) ? '#fff' : textColor }}>
                            {day.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}

                  <View style={[styles.switchContainer, { backgroundColor: bgColor }]}>
                    <Text style={[styles.switchLabel, { color: textColor }]}>Slutdato</Text>
                    <Switch
                      value={hasEndDate}
                      onValueChange={setHasEndDate}
                      trackColor={{ false: '#767577', true: colors.primary }}
                      thumbColor={hasEndDate ? '#fff' : '#f4f3f4'}
                    />
                  </View>

                  {hasEndDate ? (
                    <>
                      <TouchableOpacity
                        style={[styles.pickerButton, { backgroundColor: bgColor }]}
                        onPress={() => setShowEndDatePicker(true)}
                        activeOpacity={0.7}
                      >
                        <IconSymbol
                          ios_icon_name="calendar.badge.clock"
                          android_material_icon_name="event"
                          size={20}
                          color={textColor}
                        />
                        <Text style={[styles.pickerButtonText, { color: textColor }]}>{formatDate(endDate)}</Text>
                      </TouchableOpacity>

                      {showEndDatePicker ? (
                        <View
                          style={[
                            Platform.OS === 'ios' ? styles.iosPickerContainer : undefined,
                            { backgroundColor: isDark ? '#2a2a2a' : '#FFFFFF' },
                          ]}
                        >
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
                      ) : null}

                      {Platform.OS === 'ios' && showEndDatePicker ? (
                        <TouchableOpacity
                          style={[styles.doneButton, { backgroundColor: colors.primary }]}
                          onPress={() => setShowEndDatePicker(false)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.doneButtonText}>Færdig</Text>
                        </TouchableOpacity>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleClose}
                disabled={isCreating}
                activeOpacity={0.7}
              >
                <Text>Annuller</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.saveButton,
                  (safeCategories.length === 0 || !!endTimeError) && styles.disabledButton,
                ]}
                onPress={handleCreate}
                disabled={isCreating || safeCategories.length === 0 || !!endTimeError}
                activeOpacity={0.7}
                testID="activity.create.submitButton"
              >
                {isCreating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={{ color: '#fff' }}>Opret</Text>
                )}
              </TouchableOpacity>
            </View>

            {/* ✅ moved INSIDE Modal tree as the last child */}
            <CategoryManagementModal
              visible={showCategoryManagement}
              onClose={closeCategoryManagement}
              categories={safeCategories}
              onRefresh={handleRefreshCategories}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={intensityScopeModal.visible}
        transparent
        animationType="fade"
        onRequestClose={handleIntensityCancel}
      >
        <View style={styles.intensityScopeModalBackdrop}>
          <View
            style={[styles.intensityScopeModalCard, { backgroundColor: cardBgColor }]}
            testID="activity.create.intensityScopeModal"
          >
            <Text style={[styles.intensityScopeModalTitle, { color: textColor }]}>
              {intensityScopeModal.nextEnabled
                ? 'Vil du tilføje intensitet til alle aktiviteter med samme kategori?'
                : 'Vil du fjerne intensitet fra alle aktiviteter med samme kategori?'}
            </Text>

            <TouchableOpacity
              style={[styles.intensityScopeModalButton, { backgroundColor: colors.primary }]}
              onPress={handleIntensityApplyAll}
              activeOpacity={0.85}
              testID="activity.create.intensityScopeModal.all"
            >
              <Text style={styles.intensityScopeModalPrimaryText}>
                {intensityScopeModal.nextEnabled ? 'Ja, tilføj til alle' : 'Ja, fjern fra alle'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.intensityScopeModalButton, styles.intensityScopeModalSecondaryButton]}
              onPress={handleIntensityApplySingle}
              activeOpacity={0.85}
              testID="activity.create.intensityScopeModal.single"
            >
              <Text style={[styles.intensityScopeModalSecondaryText, { color: textColor }]}>Nej, kun denne</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.intensityScopeModalCancelButton}
              onPress={handleIntensityCancel}
              activeOpacity={0.85}
              testID="activity.create.intensityScopeModal.cancel"
            >
              <Text style={[styles.intensityScopeModalCancelText, { color: textSecondaryColor }]}>Annuller</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    zIndex: 10, // ✅ P14
  },
  categoryHeaderText: {
    fontSize: 17,
    fontWeight: '500',
  },
  createCategoryTopRight: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    position: 'relative', // ✅ P14
    zIndex: 10, // ✅ P14
  },
  createCategoryTopRightText: {
    color: colors.primary,
    fontSize: 14,
  },

  // ✅ Key fix: row + wrap so chips don’t stretch full width
  categoryWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 2,
    marginRight: 10,
    marginBottom: 10,
    alignSelf: 'flex-start',
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '100%',
  },
  categoryChipEmoji: {
    marginRight: 8,
  },
  categoryChipText: {
    fontSize: 15,
    fontWeight: '500',
  },

  emptyCategoryContainer: {
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  emptyCategoryText: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },

  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  pickerButtonText: {
    fontSize: 17,
    marginLeft: 12,
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
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 17,
    marginLeft: 12,
  },
  intensityScopeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  intensityScopeModalCard: {
    width: '100%',
    borderRadius: 16,
    padding: 16,
  },
  intensityScopeModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 22,
    marginBottom: 14,
  },
  intensityScopeModalButton: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  intensityScopeModalPrimaryText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  intensityScopeModalSecondaryButton: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    backgroundColor: 'transparent',
  },
  intensityScopeModalSecondaryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  intensityScopeModalCancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 10,
  },
  intensityScopeModalCancelText: {
    fontSize: 14,
    fontWeight: '600',
  },
  recurrenceTypeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  recurrenceTypeButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 8,
    marginBottom: 8,
  },
  daysContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  dayButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginRight: 8,
  },
  modalFooter: {
    flexDirection: 'row',
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
    marginRight: 12,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  disabledButton: {
    opacity: 0.5,
  },
  errorContainer: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 14,
    fontWeight: '500',
  },
});
