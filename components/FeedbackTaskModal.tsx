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
const CHIP_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };

interface FeedbackFieldsConfig {
  enableScore: boolean;
  scoreExplanation?: string | null;
  enableIntensity?: boolean;
  enableNote: boolean;
}

interface FeedbackTaskModalProps {
  visible: boolean;
  taskTitle: string;
  defaultRating?: number | null;
  defaultNote?: string | null;
  defaultIntensity?: number | null;
  feedbackConfig?: FeedbackFieldsConfig;
  showIntensityField?: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSave: (payload: { rating: number | null; note: string; intensity?: number | null }) => void;
}

export function FeedbackTaskModal({
  visible,
  taskTitle,
  defaultRating = null,
  defaultNote = '',
  defaultIntensity = null,
  feedbackConfig,
  showIntensityField = false,
  isSaving = false,
  onClose,
  onSave,
}: FeedbackTaskModalProps) {
  const [rating, setRating] = useState<number | null>(defaultRating);
  const [intensity, setIntensity] = useState<number | null>(defaultIntensity ?? null);
  const [note, setNote] = useState(defaultNote ?? '');

  const resolvedConfig = useMemo<FeedbackFieldsConfig>(() => {
    const explanation = typeof feedbackConfig?.scoreExplanation === 'string'
      ? feedbackConfig.scoreExplanation.trim()
      : feedbackConfig?.scoreExplanation ?? null;

    return {
      enableScore: feedbackConfig?.enableScore !== false,
      scoreExplanation: explanation && explanation.length ? explanation : null,
      enableIntensity: !!feedbackConfig?.enableIntensity,
      enableNote: feedbackConfig?.enableNote !== false,
    };
  }, [feedbackConfig]);

  // Always respect the parent-provided flag; ignore template intensity toggle entirely
  const showIntensity = showIntensityField;

  useEffect(() => {
    if (visible) {
      setRating(defaultRating ?? null);
      setNote(defaultNote ?? '');
      setIntensity(typeof defaultIntensity === 'number' ? defaultIntensity : null);
    }
  }, [defaultIntensity, defaultNote, defaultRating, visible]);

  const disabled = useMemo(() => isSaving, [isSaving]);

  const handleSave = () => {
    if (disabled) return;
    onSave({
      rating: resolvedConfig.enableScore ? rating : null,
      note: resolvedConfig.enableNote ? note : '',
      intensity: showIntensity ? intensity ?? null : undefined,
    });
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
            {resolvedConfig.enableScore && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Hvordan gik det?</Text>
                {resolvedConfig.scoreExplanation ? (
                  <Text style={styles.scoreExplanation}>{resolvedConfig.scoreExplanation}</Text>
                ) : null}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {RATING_VALUES.map(value => {
                    const selected = rating === value;
                    return (
                      <TouchableOpacity
                        key={`score-${value}`}
                        hitSlop={CHIP_HIT_SLOP}
                        style={[
                          styles.ratingChip,
                          selected && styles.ratingChipSelected,
                        ]}
                        onPress={() => setRating(value)}
                        activeOpacity={0.85}
                        disabled={disabled}
                      >
                        <Text
                          style={[
                            styles.ratingText,
                            selected && styles.ratingTextSelected,
                          ]}
                        >
                          {value}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  style={styles.clearRatingButton}
                  onPress={() => setRating(null)}
                  disabled={disabled || rating === null}
                >
                  <Text style={styles.clearRatingText}>Nulstil score</Text>
                </TouchableOpacity>
              </View>
            )}

            {showIntensity && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Intensitet (1-10)</Text>
                <Text style={styles.scoreExplanation}>Gælder for hele aktiviteten</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipRow}
                >
                  {RATING_VALUES.map(value => {
                    const selected = intensity === value;
                    return (
                      <TouchableOpacity
                        key={`intensity-${value}`}
                        hitSlop={CHIP_HIT_SLOP}
                        style={[
                          styles.ratingChip,
                          selected && styles.intensityChipSelected,
                        ]}
                        onPress={() => setIntensity(value)}
                        activeOpacity={0.85}
                        disabled={disabled}
                      >
                        <Text
                          style={[
                            styles.ratingText,
                            selected && styles.ratingTextSelected,
                          ]}
                        >
                          {value}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  style={styles.clearRatingButton}
                  onPress={() => setIntensity(null)}
                  disabled={disabled || intensity === null}
                >
                  <Text style={styles.clearRatingText}>Nulstil intensitet</Text>
                </TouchableOpacity>
              </View>
            )}

            {resolvedConfig.enableNote && (
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
            )}

            {!resolvedConfig.enableScore && !resolvedConfig.enableNote && !showIntensity && (
              <View style={styles.inputGroup}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>
                  Ingen feedbackfelter er aktiveret for denne opgave.
                </Text>
              </View>
            )}
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
  scoreExplanation: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: 2,
  },
  ratingChip: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f4f5f7',
  },
  ratingChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  intensityChipSelected: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
    shadowColor: 'rgba(0,0,0,0.12)',
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  ratingText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  ratingTextSelected: {
    color: '#fff',
    fontWeight: '700',
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
