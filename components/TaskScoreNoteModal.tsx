import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '@/styles/commonStyles';

interface TaskScoreNoteModalProps {
  visible: boolean;
  mode: 'feedback' | 'intensity';
  title?: string;
  subtitle?: string;
  initialScore?: number | null;
  initialNote?: string;
  allowNote?: boolean;
  isSaving?: boolean;
  isLoading?: boolean;
  onClose: () => void;
  onSubmit: (payload: { score: number | null; note: string }) => void;
}

const scoreOptions = Array.from({ length: 10 }, (_, idx) => idx + 1);

export default function TaskScoreNoteModal({
  visible,
  mode,
  title,
  subtitle,
  initialScore = null,
  initialNote = '',
  allowNote,
  isSaving = false,
  isLoading = false,
  onClose,
  onSubmit,
}: TaskScoreNoteModalProps) {
  const [localScore, setLocalScore] = useState<number | null>(initialScore);
  const [localNote, setLocalNote] = useState(initialNote);
  const [hasUserEdited, setHasUserEdited] = useState(false);

  const shouldShowNote = allowNote ?? mode === 'feedback';
  const modalTitle = title || (mode === 'feedback' ? 'Feedback' : 'Intensitet');
  const actionLabel = mode === 'feedback' ? 'Gem feedback' : 'Gem intensitet';

  useEffect(() => {
    if (!visible) return;
    setLocalScore(initialScore ?? null);
    setLocalNote(initialNote ?? '');
    setHasUserEdited(false);
  }, [visible]);

  useEffect(() => {
    if (!visible || hasUserEdited) return;
    setLocalScore(initialScore ?? null);
  }, [initialScore, visible, hasUserEdited]);

  useEffect(() => {
    if (!visible || hasUserEdited) return;
    setLocalNote(initialNote ?? '');
  }, [initialNote, visible, hasUserEdited]);

  const handleSelectScore = (value: number) => {
    setLocalScore(value);
    setHasUserEdited(true);
  };

  const handleResetScore = () => {
    setLocalScore(null);
    setHasUserEdited(true);
  };

  const handleSubmit = () => {
    onSubmit({ score: localScore, note: localNote.trim() });
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <Pressable style={styles.backdropPressable} onPress={onClose} />
          <View style={styles.modalCard}>
            <Text style={styles.title}>{modalTitle}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            <View style={styles.chipGrid}>
              {scoreOptions.map((option) => {
                const isActive = option === localScore;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.chip, isActive && styles.chipActive]}
                    onPress={() => handleSelectScore(option)}
                    activeOpacity={0.7}
                    disabled={isLoading || isSaving}
                  >
                    <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>
                      {option}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.resetButton}
              onPress={handleResetScore}
              disabled={isLoading || isSaving}
              activeOpacity={0.7}
            >
              <Text style={styles.resetButtonText}>Nulstil score</Text>
            </TouchableOpacity>

            {shouldShowNote ? (
              <View style={styles.noteContainer}>
                <Text style={styles.noteLabel}>Noter</Text>
                <TextInput
                  style={styles.noteInput}
                  multiline
                  placeholder="Skriv en note"
                  placeholderTextColor="rgba(0,0,0,0.4)"
                  value={localNote}
                  onChangeText={(text) => {
                    setLocalNote(text);
                    setHasUserEdited(true);
                  }}
                  editable={!isSaving && !isLoading}
                />
              </View>
            ) : null}

            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.secondaryButton} onPress={onClose} disabled={isSaving}>
                <Text style={styles.secondaryButtonText}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, (isSaving || isLoading) && styles.primaryButtonDisabled]}
                onPress={handleSubmit}
                disabled={isSaving || isLoading}
                activeOpacity={0.8}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>{actionLabel}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  keyboardContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdropPressable: {
    flex: 1,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 30,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: colors.textSecondary,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  chip: {
    width: '18%',
    paddingVertical: 10,
    marginBottom: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: colors.highlight,
    borderColor: colors.highlight,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  chipLabelActive: {
    color: '#fff',
  },
  resetButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    marginTop: 4,
    marginBottom: 12,
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  noteContainer: {
    marginTop: 4,
  },
  noteLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 6,
    color: colors.text,
  },
  noteInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    backgroundColor: '#f8f8f8',
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    gap: 12,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.highlight,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
