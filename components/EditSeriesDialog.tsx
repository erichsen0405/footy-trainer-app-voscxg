
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

interface EditSeriesDialogProps {
  visible: boolean;
  onClose: () => void;
  onEditSingle: () => void;
  onEditAll: () => void;
}

export default function EditSeriesDialog({
  visible,
  onClose,
  onEditSingle,
  onEditAll,
}: EditSeriesDialogProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <View style={styles.modalOverlay}>
        <View style={[styles.dialogContent, { backgroundColor: cardBgColor }]}>
          <View style={styles.dialogHeader}>
            <IconSymbol
              ios_icon_name="repeat.circle.fill"
              android_material_icon_name="repeat"
              size={48}
              color={colors.primary}
            />
            <Text style={[styles.dialogTitle, { color: textColor }]}>
              Rediger gentagende aktivitet
            </Text>
            <Text style={[styles.dialogMessage, { color: textSecondaryColor }]}>
              Denne aktivitet er en del af en serie. Vil du redigere kun denne aktivitet eller hele serien?
            </Text>
          </View>

          <View style={styles.dialogButtons}>
            <TouchableOpacity
              style={[styles.dialogButton, { backgroundColor: colors.secondary }]}
              onPress={() => {
                onEditSingle();
                onClose();
              }}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="doc.text"
                android_material_icon_name="description"
                size={24}
                color="#fff"
              />
              <Text style={styles.dialogButtonText}>Kun denne aktivitet</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.dialogButton, { backgroundColor: colors.primary }]}
              onPress={() => {
                onEditAll();
                onClose();
              }}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="doc.on.doc"
                android_material_icon_name="content_copy"
                size={24}
                color="#fff"
              />
              <Text style={styles.dialogButtonText}>Hele serien</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.dialogButton,
                styles.cancelButton,
                { borderColor: colors.highlight },
              ]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelButtonText, { color: textColor }]}>Annuller</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogContent: {
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  dialogHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  dialogTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
  dialogMessage: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
  dialogButtons: {
    gap: 12,
  },
  dialogButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 14,
  },
  dialogButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  cancelButtonText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
