
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
    setSelectedDays([]);
    setHasEndDate(false);
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
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Titel *"
                placeholderTextColor={textSecondaryColor}
              />

              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={location}
                onChangeText={setLocation}
                placeholder="Lokation"
                placeholderTextColor={textSecondaryColor}
              />

              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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

              {needsDaySelection && (
                <View key="days-container" style={styles.daysContainer}>
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
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
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
  daysContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
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
