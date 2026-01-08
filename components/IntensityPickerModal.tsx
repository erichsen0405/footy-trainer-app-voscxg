import React from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { colors } from '@/styles/commonStyles';

const INTENSITY_CHOICES = Array.from({ length: 10 }, (_, idx) => idx + 1);

interface IntensityPickerModalProps {
  visible: boolean;
  title?: string;
  subtitle?: string;
  helperText?: string;
  currentValue: number | null;
  isSaving?: boolean;
  disableInteractions?: boolean;
  onSelect: (value: number) => void;
  onRemove: () => void;
  onClose: () => void;
}

export function IntensityPickerModal({
  visible,
  title = 'Indstil intensitet',
  subtitle,
  helperText = '1 = let · 10 = maks',
  currentValue,
  isSaving = false,
  disableInteractions = false,
  onSelect,
  onRemove,
  onClose,
}: IntensityPickerModalProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <Text style={styles.helper}>{helperText}</Text>

          {isSaving && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#FFFFFF" />
              <Text style={styles.loadingText}>Gemmer...</Text>
            </View>
          )}

          <View style={styles.options}>
            {INTENSITY_CHOICES.map(choice => {
              const selected = currentValue === choice;
              return (
                <TouchableOpacity
                  key={choice}
                  style={[
                    styles.option,
                    selected && styles.optionSelected,
                    (isSaving || disableInteractions) && styles.optionDisabled,
                  ]}
                  onPress={() => onSelect(choice)}
                  disabled={isSaving || disableInteractions}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{choice}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Pressable
            style={[styles.button, styles.removeButton, (isSaving || disableInteractions) && styles.buttonDisabled]}
            onPress={onRemove}
            disabled={isSaving || disableInteractions}
          >
            <Text style={styles.buttonText}>Fjern intensitet</Text>
          </Pressable>

          <Pressable style={[styles.button, styles.closeButton]} onPress={onClose} disabled={isSaving}>
            <Text style={styles.buttonText}>Luk</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    backgroundColor: '#1F2933',
    borderRadius: 20,
    padding: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 6,
  },
  helper: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.8)',
    marginTop: 10,
    marginBottom: 16,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  loadingText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  option: {
    minWidth: 54,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  optionSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  optionDisabled: {
    opacity: 0.6,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  button: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  removeButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: '#F87171',
  },
  closeButton: {
    backgroundColor: '#4CAF50',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
