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
  title: string;
  introText?: string;
  helperText?: string | null;
  initialScore: number | null;
  initialNote?: string;
  enableScore?: boolean;
  enableNote?: boolean;
  noteLabel?: string;
  notePlaceholder?: string;
  resetLabel?: string;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  isSaving?: boolean;
  readonly?: boolean;
  error?: string | null;
  onSave: (payload: TaskScoreNoteModalPayload) => void | Promise<void>;
  onClose: () => void;
}

function TaskScoreNoteModalComponent({
  visible,
  title,
  introText = 'Hvordan gik det?',
  helperText = 'Hvor god var du til dine fokuspunkter',
  initialScore,
  initialNote = '',
  enableScore = true,
  enableNote = true,
  noteLabel = 'Noter (valgfrit)',
  notePlaceholder = 'Skriv hvad der gik godt eller skidt...',
  resetLabel = 'Nulstil score',
  primaryButtonLabel = 'Gem',
  secondaryButtonLabel = 'Luk',
  isSaving = false,
  readonly = false,
  error,
  onSave,
  onClose,
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

  const hasChanges = useMemo(() => {
    const normalizedInitialNote = (initialNote ?? '').trim();
    const normalizedNote = note.trim();
    const noteChanged = enableNote ? normalizedInitialNote !== normalizedNote : false;
    const scoreChanged = enableScore ? (initialScore ?? null) !== (score ?? null) : false;
    return noteChanged || scoreChanged;
  }, [enableNote, enableScore, initialNote, initialScore, note, score]);

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

  const handleSave = useCallback(() => {
    if (disableInteractions) return;
    onSave({
      score: enableScore ? score : null,
      note: enableNote ? note.trim() : '',
    });
  }, [disableInteractions, enableNote, enableScore, note, onSave, score]);

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
      >
        {SCORE_VALUES.map(value => {
          const selected = score === value;
          return (
            <Pressable
              key={`score-${value}`}
              style={[styles.chip, selected && styles.chipSelected, disableInteractions && styles.chipDisabled]}
              hitSlop={CHIP_HIT_SLOP}
              onPress={() => handleSelectScore(value)}
              disabled={disableInteractions}
            >
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{value}</Text>
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
                  />
                </View>
              ) : null}

              <View style={styles.footer}>
                <Pressable
                  style={[styles.secondaryButton, disableInteractions && styles.secondaryButtonDisabled]}
                  onPress={confirmClose}
                  disabled={disableInteractions}
                >
                  <Text style={styles.secondaryButtonText}>{secondaryButtonLabel}</Text>
                </Pressable>
                <Pressable
                  style={styles.primaryButtonShadow}
                  onPress={handleSave}
                  disabled={disableInteractions}
                >
                  <LinearGradient
                    colors={[colors.primary, '#6DDC5F']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.primaryButton, disableInteractions && styles.primaryButtonDisabled]}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    justifyContent: 'space-between',
  },
  secondaryButton: {
    flex: 1,
    height: 52,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#DEE1E7',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    marginRight: 12, // replaces footer.gap
  },
  secondaryButtonDisabled: {
    opacity: 0.5,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B4256',
  },
  primaryButtonShadow: {
    flex
