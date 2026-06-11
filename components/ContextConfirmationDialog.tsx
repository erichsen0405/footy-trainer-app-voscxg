
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';

interface ContextConfirmationDialogProps {
  visible: boolean;
  contextType: 'player' | 'team' | null;
  contextName: string | null;
  actionType: 'create' | 'edit' | 'complete' | 'delete';
  itemType: 'activity' | 'task';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ContextConfirmationDialog({
  visible,
  contextType,
  contextName,
  actionType,
  itemType,
  onConfirm,
  onCancel,
}: ContextConfirmationDialogProps) {
  const getActionText = () => {
    switch (actionType) {
      case 'create':
        return 'create';
      case 'edit':
        return 'edit';
      case 'complete':
        return 'complete';
      case 'delete':
        return 'delete';
      default:
        return 'change';
    }
  };

  const getItemText = () => {
    switch (itemType) {
      case 'activity':
        return 'the activity';
      case 'task':
        return 'the task';
      default:
        return 'the item';
    }
  };

  const getContextText = () => {
    if (!contextType || !contextName) return '';
    
    if (contextType === 'player') {
      return `player "${contextName}"`;
    } else {
      return `team "${contextName}"`;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.iconContainer}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={48}
              color={colors.warning}
            />
          </View>

          <Text style={styles.title}>Confirm action</Text>
          
          <Text style={styles.message}>
            You are about to {getActionText()} {getItemText()} for {getContextText()}.
          </Text>

          <Text style={styles.subMessage}>
            Are you sure you want to continue?
          </Text>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={onConfirm}
              activeOpacity={0.7}
            >
              <Text style={styles.confirmButtonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  subMessage: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: colors.highlight,
  },
  confirmButton: {
    backgroundColor: colors.primary,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
