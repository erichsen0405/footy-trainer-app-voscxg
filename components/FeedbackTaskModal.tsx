import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { colors } from '@/styles/commonStyles';

const RATING_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

interface FeedbackTaskModalProps {
  visible: boolean;
  taskTitle: string;
  defaultRating?: number | null;
  defaultNote?: string | null;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (payload: { rating: number | null; note: string }) => void;
}

export function FeedbackTaskModal({
  visible,
  taskTitle,
  defaultRating = null,
  defaultNote = '',
  isSaving = false,
  onClose,
  onSave,
}: FeedbackTaskModalProps) {
  const [rating, setRating] = useState<number | null>(defaultRating);
  const [note, setNote] = useState(defaultNote ?? '');

  useEffect(() => {
    if (visible) {
      setRating(defaultRating ?? null);
      setNote(defaultNote ?? '');
    }
  }, [defaultRating, defaultNote, visible]);

  const disabled = useMemo(() => isSaving, [isSaving]);

  const handleSave = () => {
    if (disabled) return;
    onSave({ rating, note });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Feedback på {taskTitle}</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              activeOpacity={0.7}
              disabled={isSaving}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Hvordan gik det?</Text>
              <View style={styles.ratingRow}>
                {RATING_VALUES.map(value => {
                  const selected = rating === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      style={[
                        styles.ratingChip,
                        selected && { backgroundColor: colors.primary },
                      ]}
                      onPress={() => setRating(value)}
                      activeOpacity={0.8}
                      disabled={disabled}
                    >
                      <Text
                        style={[
                          styles.ratingText,
                          selected && { color: '#fff', fontWeight: '700' },
                        ]}
                      >
                        {value}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                style={styles.clearRatingButton}
                onPress={() => setRating(null)}
                disabled={disabled || rating === null}
              >
                <Text style={styles.clearRatingText}>Nulstil rating</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Noter (valgfrit)</Text>
              <TextInput
                style={styles.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="Skriv hvad der gik godt eller skidt..."
                placeholderTextColor={colors.textSecondary}
                multiline
                editable={!disabled}
              />
            </View>
          </ScrollView>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={disabled}
            >
              <Text style={styles.cancelText}>Luk</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
              disabled={disabled}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveText}>Gem</Text>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    paddingRight: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 18,
    color: colors.text,
  },
  content: {
    maxHeight: '65%',
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ratingChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBackground,
  },
  ratingText: {
    color: colors.text,
    fontSize: 15,
  },
  clearRatingButton: {
    marginTop: 12,
  },
  clearRatingText: {
    color: colors.textSecondary,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  noteInput: {
    minHeight: 100,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    textAlignVertical: 'top',
    color: colors.text,
    backgroundColor: colors.cardBackground,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.cardBackground,
  },
  cancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
