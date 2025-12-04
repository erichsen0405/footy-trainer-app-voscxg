
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  useColorScheme,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useFootball } from '@/contexts/FootballContext';

interface CreateActivityTaskModalProps {
  visible: boolean;
  onClose: () => void;
  activityId: string;
  activityTitle: string;
  onTaskCreated?: () => void;
}

export default function CreateActivityTaskModal({
  visible,
  onClose,
  activityId,
  activityTitle,
  onTaskCreated,
}: CreateActivityTaskModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { refreshData } = useFootball();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const bgColor = isDark ? '#1a1a1a' : '#fff';
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;
  const inputBgColor = isDark ? '#2a2a2a' : '#f5f5f5';

  const handleCreate = async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Opgavetitel er påkrævet');
      return;
    }

    setIsCreating(true);

    try {
      console.log('Creating standalone task for activity:', activityId);

      // Parse reminder minutes
      const reminderValue = reminderMinutes.trim() ? parseInt(reminderMinutes, 10) : null;
      if (reminderMinutes.trim() && (isNaN(reminderValue!) || reminderValue! < 0)) {
        Alert.alert('Fejl', 'Påmindelse skal være et positivt tal');
        setIsCreating(false);
        return;
      }

      // Insert the task directly into activity_tasks without a template
      const { data, error } = await supabase
        .from('activity_tasks')
        .insert({
          activity_id: activityId,
          title: title.trim(),
          description: description.trim() || null,
          reminder_minutes: reminderValue,
          completed: false,
          task_template_id: null, // No template - standalone task
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating activity task:', error);
        throw error;
      }

      console.log('Activity task created successfully:', data.id);

      Alert.alert('Succes', 'Opgaven er blevet oprettet');

      // Reset form
      setTitle('');
      setDescription('');
      setReminderMinutes('');

      // Refresh data to show the new task
      refreshData();

      // Notify parent
      if (onTaskCreated) {
        onTaskCreated();
      }

      onClose();
    } catch (error: any) {
      console.error('Failed to create activity task:', error);
      Alert.alert('Fejl', `Kunne ikke oprette opgaven: ${error?.message || 'Ukendt fejl'}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancel = () => {
    setTitle('');
    setDescription('');
    setReminderMinutes('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: bgColor }]}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderLeft}>
              <IconSymbol
                ios_icon_name="plus.circle.fill"
                android_material_icon_name="add_circle"
                size={28}
                color={colors.primary}
              />
              <View>
                <Text style={[styles.modalTitle, { color: textColor }]}>
                  Opret opgave
                </Text>
                <Text style={[styles.modalSubtitle, { color: textSecondaryColor }]}>
                  {activityTitle}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleCancel}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={textSecondaryColor}
              />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Info Box */}
            <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
              <IconSymbol
                ios_icon_name="info.circle"
                android_material_icon_name="info"
                size={20}
                color={colors.secondary}
              />
              <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
                Denne opgave oprettes kun for denne aktivitet og er ikke en del af en skabelon.
              </Text>
            </View>

            {/* Title Input */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>
                Titel <Text style={{ color: colors.error }}>*</Text>
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBgColor, color: textColor }]}
                value={title}
                onChangeText={setTitle}
                placeholder="Hvad skal gøres?"
                placeholderTextColor={textSecondaryColor}
                maxLength={100}
              />
            </View>

            {/* Description Input */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>Beskrivelse</Text>
              <TextInput
                style={[
                  styles.input,
                  styles.textArea,
                  { backgroundColor: inputBgColor, color: textColor },
                ]}
                value={description}
                onChangeText={setDescription}
                placeholder="Tilføj detaljer om opgaven..."
                placeholderTextColor={textSecondaryColor}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </View>

            {/* Reminder Input */}
            <View style={styles.fieldContainer}>
              <Text style={[styles.fieldLabel, { color: textColor }]}>
                Påmindelse (minutter før aktivitet)
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: inputBgColor, color: textColor }]}
                value={reminderMinutes}
                onChangeText={setReminderMinutes}
                placeholder="f.eks. 30"
                placeholderTextColor={textSecondaryColor}
                keyboardType="number-pad"
                maxLength={4}
              />
              <Text style={[styles.fieldHint, { color: textSecondaryColor }]}>
                Lad feltet være tomt hvis du ikke ønsker en påmindelse
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, styles.cancelButton, { borderColor: colors.error }]}
              onPress={handleCancel}
              activeOpacity={0.7}
              disabled={isCreating}
            >
              <Text style={[styles.actionButtonText, { color: colors.error }]}>Annuller</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.createButton,
                { backgroundColor: colors.primary },
              ]}
              onPress={handleCreate}
              activeOpacity={0.7}
              disabled={isCreating || !title.trim()}
            >
              {isCreating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.actionButtonText, { color: '#fff' }]}>Opret</Text>
              )}
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    marginBottom: 24,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldContainer: {
    marginBottom: 24,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  fieldHint: {
    fontSize: 13,
    marginTop: 6,
    fontStyle: 'italic',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 2,
  },
  createButton: {},
  actionButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
