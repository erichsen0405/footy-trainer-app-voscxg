import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
const SCORE_WHEEL_ITEM_HEIGHT = 42;
const SCORE_WHEEL_VISIBLE_ITEMS = 5;

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
  clearLabel?: string;
  primaryButtonLabel?: string;
  secondaryButtonLabel?: string;
  missingScoreTitle?: string;
  missingScoreMessage?: string;
  isSaving?: boolean;
  readonly?: boolean;
  error?: string | null;
  onSave: (payload: TaskScoreNoteModalPayload) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
  onClose: () => void;
  showLabels?: boolean; // default true
  infoModalTitle?: string;
  infoModalLines?: string[];
  infoButtonAccessibilityLabel?: string;
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
  clearLabel = 'Markér som ikke udført',
  primaryButtonLabel = 'Markér som udført',
  missingScoreTitle = 'Mangler score',
  missingScoreMessage = 'Vælg en score først.',
  isSaving = false,
  readonly = false,
  error,
  onSave,
  onClear,
  onClose,
  infoModalTitle,
  infoModalLines,
  infoButtonAccessibilityLabel = 'Vis info',
}: TaskScoreNoteModalProps) {
  const [score, setScore] = useState<number | null>(initialScore ?? null);
  const [note, setNote] = useState(initialNote ?? '');
  const [isScoreDropdownOpen, setIsScoreDropdownOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const scoreWheelRef = useRef<FlatList<number> | null>(null);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setScore(initialScore ?? null);
      setNote(initialNote ?? '');
      setIsScoreDropdownOpen(false);
      setIsInfoModalOpen(false);
      hasMountedRef.current = true;
    }
  }, [initialNote, initialScore, visible]);

  const disableInteractions = isSaving || readonly;
  const hasInfoContent = typeof infoModalTitle === 'string' && infoModalTitle.trim().length > 0 && Array.isArray(infoModalLines) && infoModalLines.length > 0;
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

  const scrollWheelToValue = useCallback((value: number, animated: boolean) => {
    const valueIndex = SCORE_VALUES.indexOf(value);
    if (valueIndex < 0) return;
    scoreWheelRef.current?.scrollToIndex?.({
      index: valueIndex,
      animated,
      viewPosition: 0.5,
    });
  }, []);

  const handleSelectScore = useCallback(
    (value: number, centerWheel: boolean = false) => {
      if (disableInteractions || !enableScore) return;
      setScore(value);
      if (centerWheel) {
        scrollWheelToValue(value, true);
      }
    },
    [disableInteractions, enableScore, scrollWheelToValue]
  );

  const toggleScoreDropdown = useCallback(() => {
    if (disableInteractions || !enableScore) return;
    setIsScoreDropdownOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          scrollWheelToValue(typeof score === 'number' ? score : 5, false);
        }, 0);
      }
      return next;
    });
  }, [disableInteractions, enableScore, score, scrollWheelToValue]);

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

  const renderScoreDropdown = () => {
    if (!enableScore) return null;
    const selectedLabel = typeof score === 'number' ? String(score) : 'Vælg score';

    return (
      <View style={styles.scoreDropdownWrap}>
        <Pressable
          style={[styles.scoreDropdownButton, disableInteractions && styles.scoreDropdownButtonDisabled]}
          accessibilityRole="button"
          testID="feedback.scoreInput"
          accessibilityLabel="Vælg score"
          onPress={toggleScoreDropdown}
          disabled={disableInteractions}
        >
          <Text style={styles.scoreDropdownValue}>{selectedLabel}</Text>
          <Text style={styles.scoreDropdownChevron}>{isScoreDropdownOpen ? '▲' : '▼'}</Text>
        </Pressable>

        {isScoreDropdownOpen ? (
          <View style={styles.scoreDropdownList} testID="feedback.scoreDropdown.list">
            <View pointerEvents="none" style={styles.scoreWheelSelectionBand} />
            <FlatList
              ref={scoreWheelRef}
              data={SCORE_VALUES}
              keyExtractor={(item) => String(item)}
              showsVerticalScrollIndicator={false}
              snapToInterval={SCORE_WHEEL_ITEM_HEIGHT}
              decelerationRate="fast"
              getItemLayout={(_, index) => ({
                length: SCORE_WHEEL_ITEM_HEIGHT,
                offset: SCORE_WHEEL_ITEM_HEIGHT * index,
                index,
              })}
              contentContainerStyle={styles.scoreWheelContent}
              style={styles.scoreWheel}
              renderItem={({ item: value }) => {
                const isSelected = score === value;
                return (
                  <Pressable
                    style={styles.scoreOption}
                    accessibilityRole="button"
                    testID={`feedback.scoreOption.${value}`}
                    accessibilityLabel={`Score ${value}`}
                    onPress={() => handleSelectScore(value, true)}
                    disabled={disableInteractions}
                  >
                    <Text style={[styles.scoreOptionText, isSelected && styles.scoreOptionTextSelected]}>
                      {value}
                    </Text>
                  </Pressable>
                );
              }}
              onMomentumScrollEnd={(event) => {
                const offsetY = event.nativeEvent.contentOffset.y;
                const index = Math.round(offsetY / SCORE_WHEEL_ITEM_HEIGHT);
                const clampedIndex = Math.max(0, Math.min(SCORE_VALUES.length - 1, index));
                const picked = SCORE_VALUES[clampedIndex];
                handleSelectScore(picked);
              }}
              onScrollToIndexFailed={({ index }) => {
                scoreWheelRef.current?.scrollToOffset?.({
                  offset: Math.max(0, index) * SCORE_WHEEL_ITEM_HEIGHT,
                  animated: false,
                });
              }}
            />
            <Pressable
              style={[styles.scoreDoneButton, disableInteractions && styles.scoreDoneButtonDisabled]}
              testID="feedback.scoreDoneButton"
              accessibilityRole="button"
              accessibilityLabel="Færdig"
              onPress={() => setIsScoreDropdownOpen(false)}
              disabled={disableInteractions}
            >
              <Text style={styles.scoreDoneButtonText}>Færdig</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  if (!visible && !hasMountedRef.current) {
    return null;
  }

  return (
    <>
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
                  <View style={styles.titleWrap}>
                    <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                      {title}
                    </Text>
                  </View>
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
                  <View style={styles.introRow}>
                    <Text style={styles.intro}>{introText}</Text>
                    {hasInfoContent ? (
                      <Pressable
                        onPress={() => setIsInfoModalOpen(true)}
                        hitSlop={14}
                        accessibilityRole="button"
                        accessibilityLabel={infoButtonAccessibilityLabel}
                        testID="feedback.infoButton"
                        style={styles.infoButton}
                      >
                        <Text style={styles.infoButtonText}>ⓘ</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
                </View>

                {renderScoreDropdown()}
                {enableScore ? (
                  <View testID={score === null ? 'feedback.selectedScore.none' : `feedback.selectedScore.${score}`} style={styles.testProbe} />
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
                {isInitiallyCompleted && !hasChanges ? (
                  <View testID="feedback.persistedState.loaded" style={styles.testProbe} />
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
            {hasInfoContent && isInfoModalOpen ? (
              <View style={styles.infoModalBackdrop}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsInfoModalOpen(false)} />
                <View style={styles.infoModalSheet}>
                  <View style={styles.infoModalHeader}>
                    <Text style={styles.infoModalTitle} testID="feedback.infoModal.title">
                      {infoModalTitle}
                    </Text>
                    <Pressable
                      onPress={() => setIsInfoModalOpen(false)}
                      style={styles.infoModalCloseButton}
                      accessibilityRole="button"
                      accessibilityLabel="Luk info"
                    >
                      <Text style={styles.infoModalCloseButtonText}>X</Text>
                    </Pressable>
                  </View>
                  <ScrollView style={styles.infoModalScroll}>
                    {infoModalLines.map((line, idx) => (
                      <Text key={`${line}-${idx}`} style={styles.infoModalLine}>
                        {line}
                      </Text>
                    ))}
                  </ScrollView>
                  <Pressable
                    onPress={() => setIsInfoModalOpen(false)}
                    style={styles.infoModalFooterButton}
                    accessibilityRole="button"
                    accessibilityLabel="Luk"
                  >
                    <Text style={styles.infoModalFooterButtonText}>Luk</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
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
  titleWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
    flexShrink: 1,
  },
  infoButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B7B5A',
    borderWidth: 1,
    borderColor: '#0B7B5A',
    marginLeft: 0,
  },
  infoButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
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
  introRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  intro: {
    fontSize: 17,
    fontWeight: '600',
    color: '#20283E',
    flex: 1,
  },
  helper: {
    fontSize: 14,
    color: 'rgba(32, 40, 62, 0.6)',
    marginTop: 4,
  },
  scoreDropdownWrap: {
    marginTop: 8,
  },
  scoreDropdownButton: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(11, 15, 25, 0.12)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scoreDropdownButtonDisabled: {
    opacity: 0.4,
  },
  scoreDropdownValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#20283E',
  },
  scoreDropdownChevron: {
    fontSize: 12,
    color: '#3B4256',
  },
  scoreDropdownList: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(11, 15, 25, 0.12)',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    position: 'relative',
  },
  scoreWheel: {
    height: SCORE_WHEEL_ITEM_HEIGHT * SCORE_WHEEL_VISIBLE_ITEMS,
  },
  scoreWheelContent: {
    paddingVertical: SCORE_WHEEL_ITEM_HEIGHT * 2,
  },
  scoreWheelSelectionBand: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: SCORE_WHEEL_ITEM_HEIGHT * 2,
    height: SCORE_WHEEL_ITEM_HEIGHT,
    backgroundColor: 'rgba(11, 123, 90, 0.08)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(11, 123, 90, 0.2)',
    zIndex: 1,
  },
  scoreOption: {
    height: SCORE_WHEEL_ITEM_HEIGHT,
    paddingHorizontal: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreOptionText: {
    fontSize: 16,
    color: '#20283E',
  },
  scoreOptionTextSelected: {
    fontWeight: '700',
    color: colors.primary,
  },
  scoreDoneButton: {
    borderTopWidth: 1,
    borderColor: 'rgba(11, 15, 25, 0.12)',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  scoreDoneButtonDisabled: {
    opacity: 0.4,
  },
  scoreDoneButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
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
  testProbe: {
    width: 2,
    height: 2,
  },
  infoModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(7, 16, 35, 0.5)',
    justifyContent: 'flex-end',
  },
  infoModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '72%',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  infoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  infoModalTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#20283E',
    marginRight: 12,
  },
  infoModalCloseButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 241, 245, 0.9)',
  },
  infoModalCloseButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3B4256',
  },
  infoModalScroll: {
    marginBottom: 12,
  },
  infoModalLine: {
    fontSize: 15,
    color: '#20283E',
    lineHeight: 22,
    marginBottom: 8,
  },
  infoModalFooterButton: {
    alignSelf: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(11, 123, 90, 0.12)',
  },
  infoModalFooterButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
});
