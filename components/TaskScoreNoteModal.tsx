import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '@/styles/commonStyles';

const SCORE_VALUES = Array.from({ length: 10 }, (_, idx) => idx + 1);
const CHIP_HIT_SLOP = { top: 8, right: 8, bottom: 8, left: 8 };

export interface TaskScoreNoteModalPayload {
  score: number | null;
  note: string;
}

interface TaskScoreNoteModalProps {
  visible: boolean;
  title?: string;              // was required
  introText?: string;
  helperText?: string | null;
  initialScore?: number | null; // was required
  initialNote?: string;
  enableScore?: boolean;
  enableNote?: boolean;
  noteLabel?: string;
  notePlaceholder?: string;
  resetLabel?: string;
  clearLabel?: string;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  missingScoreTitle?: string;
  missingScoreMessage?: string;
  isSaving?: boolean;
  readonly?: boolean;
  error?: string | null;
  onSave?: (payload: TaskScoreNoteModalPayload) => void | Promise<void>; // was required
  onClear?: () => void | Promise<void>;
  onClose: () => void;
  showLabels?: boolean; // default true
}

function TaskScoreNoteModalComponent({
  visible,
  title = 'Feedback',
  introText = 'Hvordan gik det?',
  helperText = 'Hvor god var du til dine fokuspunkter',
  initialScore = null,
  initialNote = '',
  enableScore = true,
  enableNote = true,
  noteLabel = 'Noter (valgfrit)',
  notePlaceholder = 'Skriv hvad der gik godt eller skidt...',
  resetLabel = 'Nulstil score',
  clearLabel = 'Markér som ikke udført',
  primaryButtonLabel = 'Markér som udført',
  missingScoreTitle = 'Mangler score',
  missingScoreMessage = 'Vælg en score først.',
  isSaving = false,
  readonly = false,
  error,
  onSave = () => {},
  onClear,
  onClose,
  showLabels = true,
}: TaskScoreNoteModalProps) {
  const [score, setScore] = useState<number | null>(initialScore ?? null);
  const [note, setNote] = useState(initialNote ?? '');
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setScore(initialScore ?? null);
      setNote(initialNote ?? '');
      hasMountedRef.current = true;
    }
  }, [initialNote, initialScore, visible]);

  const disableInteractions = isSaving || readonly;
  const hasClearAction = typeof onClear === 'function';
  const normalizedInitialNote = useMemo(() => (initialNote ?? '').trim(), [initialNote]);
  const normalizedNote = note.trim();
  const normalizedInitialScore = enableScore ? (initialScore ?? null) : null;
  const scoreWasSetInitially = enableScore && normalizedInitialScore !== null;
  const isInitiallyCompleted =
    (enableScore && normalizedInitialScore !== null) ||
    (enableNote && normalizedInitialNote.length > 0);
  const canMarkNotDone = isInitiallyCompleted && hasClearAction;

  const noteChanged = useMemo(
    () => (enableNote ? normalizedInitialNote !== normalizedNote : false),
    [enableNote, normalizedInitialNote, normalizedNote],
  );
  const scoreChanged = useMemo(
    () => (enableScore ? normalizedInitialScore !== (score ?? null) : false),
    [enableScore, normalizedInitialScore, score],
  );
  const hasChanges = noteChanged || scoreChanged;
  const shouldShowUpdate = scoreWasSetInitially && hasChanges;
  const shouldShowClear = !shouldShowUpdate && canMarkNotDone && !hasChanges;
  const scoreRequired = enableScore && score === null && !shouldShowClear;

  const handleSelectScore = useCallback(
    (value: number) => {
      if (disableInteractions || !enableScore) return;
      setScore(value);
    },
    [disableInteractions, enableScore]
  );

  const handleResetScore = useCallback(() => {
    if (disableInteractions || !enableScore) return;
    setScore(null);
  }, [disableInteractions, enableScore]);

  const handleClear = useCallback(() => {
    if (disableInteractions || !hasClearAction) return;
    setScore(null);
    setNote('');
    void Promise.resolve(onClear?.());
  }, [disableInteractions, hasClearAction, onClear]);

  const handleSave = useCallback(() => {
    if (disableInteractions) return;
    onSave({
      score: enableScore ? score : null,
      note: enableNote ? note.trim() : '',
    });
  }, [disableInteractions, enableNote, enableScore, note, onSave, score]);

  const primaryButtonLabelResolved = hasChanges
    ? shouldShowUpdate
      ? 'Opdater score'
      : primaryButtonLabel
    : shouldShowClear
      ? clearLabel
      : primaryButtonLabel;

  const handlePrimaryAction = useCallback(() => {
    if (disableInteractions) return;
    if (scoreRequired) {
      Alert.alert(missingScoreTitle, missingScoreMessage);
      return;
    }
    if (shouldShowUpdate) {
      handleSave();
      return;
    }
    if (shouldShowClear) {
      handleClear();
      return;
    }
    handleSave();
  }, [
    disableInteractions,
    handleClear,
    handleSave,
    missingScoreMessage,
    missingScoreTitle,
    scoreRequired,
    shouldShowClear,
    shouldShowUpdate,
  ]);

  const confirmClose = useCallback(() => {
    if (!visible) return;
    if (disableInteractions) return;
    if (!hasChanges) {
      onClose();
      return;
    }

    Alert.alert('forlad uden at gemme?', 'Dine ændringer bliver ikke gemt.', [
      { text: 'Bliv', style: 'cancel' },
      {
        text: 'Forlad',
        style: 'destructive',
        onPress: () => {
          onClose();
        },
      },
    ]);
  }, [disableInteractions, hasChanges, onClose, visible]);

  const renderScoreChips = () => {
    if (!enableScore) return null;

    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scoringRow}
        testID="feedback.scoreInput"
        accessibilityLabel="Vælg score"
      >
        {SCORE_VALUES.map(value => {
          const isSelected = score === value;
          return (
            <Pressable
              key={`score-${value}`}
              style={[styles.chip, isSelected && styles.chipSelected, disableInteractions && styles.chipDisabled]}
              accessibilityRole="button"
              testID={`feedback.scoreOption.${value}`}
              accessibilityLabel={`Score ${value}`}
              hitSlop={CHIP_HIT_SLOP}
              onPress={() => handleSelectScore(value)}
              disabled={disableInteractions}
            >
              <Text
                style={[
                  styles.chipText,
                  isSelected && styles.chipTextSelected,
                  !showLabels && styles.chipTextHidden,
                ]}
                accessible={false}
              >
                {value}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  };

  if (!visible && !hasMountedRef.current) {
    return null;
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={confirmClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalRoot}
      >
        <View style={styles.backdropContainer}>
          <BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
          <Pressable style={StyleSheet.absoluteFill} onPress={confirmClose} disabled={disableInteractions} />
          <View style={styles.cardWrapper}>
            <View style={styles.card}>
              <View style={styles.header}>
                <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                  {title}
                </Text>
                <Pressable
                  onPress={confirmClose}
                  hitSlop={12}
                  disabled={disableInteractions}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeText}>X</Text>
                </Pressable>
              </View>

              <View style={styles.section}>
                <Text style={styles.intro}>{introText}</Text>
                {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
              </View>

              {renderScoreChips()}

              {enableScore ? (
                <Pressable
                  onPress={handleResetScore}
                  disabled={disableInteractions || score === null}
                >
                  <Text
                    style={[
                      styles.resetText,
                      (disableInteractions || score === null) && styles.resetDisabled,
                    ]}
                  >
                    {resetLabel}
                  </Text>
                </Pressable>
              ) : null}

              {enableNote ? (
                <View style={styles.noteSection}>
                  <Text style={styles.noteLabel}>{noteLabel}</Text>
                  <TextInput
                    multiline
                    editable={!disableInteractions}
                    value={note}
                    onChangeText={setNote}
                    placeholder={notePlaceholder}
                    placeholderTextColor="rgba(53, 65, 98, 0.5)"
                    style={[styles.noteInput, disableInteractions && styles.noteInputDisabled]}
                    textAlignVertical="top"
                    testID="feedback.noteInput"
                    accessibilityLabel={noteLabel}
                  />
                </View>
              ) : null}

              <View style={styles.footer}>
                <Pressable
                  onPress={handlePrimaryAction}
                  disabled={disableInteractions}
                  style={[
                    styles.primaryButtonShadow,
                    (disableInteractions || scoreRequired) && styles.primaryButtonDisabled,
                  ]}
                  testID="feedback.saveButton"
                  accessibilityLabel={primaryButtonLabelResolved}
                >
                  <LinearGradient
                    colors={[colors.primary, '#6DDC5F']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.primaryButton, (disableInteractions || scoreRequired) && styles.primaryButtonDisabled]}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>{primaryButtonLabelResolved}</Text>
                    )}
                  </LinearGradient>
                </Pressable>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export const TaskScoreNoteModal = memo(TaskScoreNoteModalComponent);
export default TaskScoreNoteModal;

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(7, 16, 35, 0.45)',
  },
  cardWrapper: {
    width: '100%',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 32,
    padding: 28,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
    marginRight: 16,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(239, 241, 245, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3B4256',
  },
  section: {
    marginBottom: 12,
  },
  intro: {
    fontSize: 17,
    fontWeight: '600',
    color: '#20283E',
  },
  helper: {
    fontSize: 14,
    color: 'rgba(32, 40, 62, 0.6)',
    marginTop: 4,
  },
  scoringRow: {
    paddingVertical: 16,
    paddingHorizontal: 6,
  },
  chip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D4D7E3',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: 10, // replaces scoringRow.gap
  },
  chipSelected: {
    borderColor: colors.primary,
  },
  chipDisabled: {
    opacity: 0.5,
  },
  chipText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B4256',
  },
  chipTextSelected: {
    color: colors.primary,
  },
  chipTextHidden: {
    opacity: 0,
  },
  resetText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 8,
  },
  resetDisabled: {
    opacity: 0.4,
  },
  noteSection: {
    marginTop: 8,
  },
  noteLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#20283E',
    marginBottom: 8,
  },
  noteInput: {
    minHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(11, 15, 25, 0.08)',
    backgroundColor: 'rgba(240, 242, 247, 0.8)',
    padding: 16,
    fontSize: 15,
    color: '#101828',
  },
  noteInputDisabled: {
    opacity: 0.5,
  },
  footer: { marginTop: 18 },
  primaryButtonShadow: {
    borderRadius: 999,
    shadowColor: colors.primary,
    shadowRadius: 18,
    shadowOpacity: 0.35,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  primaryButton: {
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
  },
});
