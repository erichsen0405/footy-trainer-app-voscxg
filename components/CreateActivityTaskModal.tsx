import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import * as CommonStyles from '@/styles/commonStyles';
import { Task } from '@/types';
import { supabase } from '@/app/integrations/supabase/client';
import { scheduleTaskReminderImmediate } from '@/utils/notificationScheduler';

/*
 * ========================================
 * PERFORMANCE CHECKLIST (STEP F)
 * ========================================
 * ✅ First render & loading:
 *    - No blocking before paint
 *    - Activity verification deferred to useEffect
 * 
 * ✅ Navigation:
 *    - No fetch in onPress/onOpen
 *    - Modal opens immediately
 * 
 * ✅ Render control:
 *    - useCallback for handlers (stable deps)
 *    - No inline handlers in render
 * 
 * ✅ Platform parity:
 *    - Same behavior iOS/Android/Web
 *    - Platform-specific delay handled correctly
 * ========================================
 */

const FALLBACK_COLORS = {
  primary: '#3B82F6',
  background: '#FFFFFF',
  cardBackground: '#F5F5F5',
  border: '#E2E8F0',
  text: '#111827',
  textSecondary: '#6B7280',
};

const colors =
  ((CommonStyles as any)?.colors as typeof FALLBACK_COLORS | undefined) ?? FALLBACK_COLORS;

interface CreateActivityTaskModalProps {
  visible: boolean;
  onClose: () => void;
  onSave?: (task: Omit<Task, 'id'>) => Promise<void>;
  onTaskCreated?: () => void | Promise<void>;
  activityId: string;
  activityTitle: string;
  activityDate?: Date | string | null;
  activityTime: string;
}

export function CreateActivityTaskModal({
  visible,
  onClose,
  onSave,
  onTaskCreated,
  activityId,
  activityTitle,
  activityDate,
  activityTime,
}: CreateActivityTaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [hasReminder, setHasReminder] = useState(false);
  const [reminderMinutes, setReminderMinutes] = useState('10');
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [activityExists, setActivityExists] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const safeActivityDate = useMemo(() => {
    if (!activityDate) return null;
    const candidate = activityDate instanceof Date ? activityDate : new Date(activityDate);
    return Number.isNaN(candidate.getTime()) ? null : candidate;
  }, [activityDate]);

  const activityDateLabel = useMemo(
    () => (safeActivityDate ? safeActivityDate.toLocaleDateString('da-DK') : 'Ukendt dato'),
    [safeActivityDate],
  );

  useEffect(() => {
    const getCurrentUser = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setUserId(null);
        return;
      }
      setUserId(data.session?.user?.id ?? null);
    };
    getCurrentUser();
  }, []);

  // Verify activity exists before allowing task creation
  useEffect(() => {
    const verifyActivity = async () => {
      if (!activityId || !visible) {
        setActivityExists(false);
        return;
      }

      console.log('🔍 Verifying activity exists:', activityId);
      
      try {
        const { data, error } = await supabase
          .from('activities')
          .select('id')
          .eq('id', activityId)
          .single();

        if (error) {
          console.error('❌ Error verifying activity:', error);
          setActivityExists(false);
          return;
        }

        if (data) {
          console.log('✅ Activity verified:', data.id);
          setActivityExists(true);
        } else {
          console.log('⚠️ Activity not found');
          setActivityExists(false);
        }
      } catch (error) {
        console.error('❌ Exception verifying activity:', error);
        setActivityExists(false);
      }
    };

    // Add a small delay on iOS to ensure the activity is fully committed
    if (Platform.OS === 'ios' && visible) {
      const timer = setTimeout(() => {
        verifyActivity();
      }, 500);
      return () => clearTimeout(timer);
    } else {
      verifyActivity();
    }
  }, [activityId, visible]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Opgavetitel er påkrævet');
      return;
    }

    if (!userId) {
      Alert.alert('Fejl', 'Bruger ikke autentificeret');
      return;
    }

    if (!activityExists) {
      Alert.alert(
        'Vent venligst',
        'Aktiviteten er ved at blive oprettet. Prøv igen om et øjeblik.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsLoading(true);

    try {
      console.log('🆕 ========== CREATING NEW ACTIVITY TASK ==========');
      console.log('  Activity ID:', activityId);
      console.log('  Activity Title:', activityTitle);
      console.log('  Activity Date:', safeActivityDate ?? 'n/a');
      console.log('  Activity Time:', activityTime);
      console.log('  Task Title:', title);
      console.log('  Has Reminder:', hasReminder);
      console.log('  Reminder Minutes:', reminderMinutes);
      console.log('  User ID:', userId);
      console.log('  Platform:', Platform.OS);
      console.log('  Timestamp:', new Date().toISOString());

      // Double-check activity exists right before inserting
      console.log('🔍 Final activity verification before insert...');
      const { data: activityCheck, error: activityCheckError } = await supabase
        .from('activities')
        .select('id')
        .eq('id', activityId)
        .single();

      if (activityCheckError || !activityCheck) {
        console.error('❌ Activity verification failed:', activityCheckError);
        throw new Error('Aktiviteten kunne ikke findes. Prøv at lukke og åbne aktiviteten igen.');
      }

      console.log('✅ Activity verified, proceeding with task creation');

      // Insert the task into the database with explicit error handling
      const taskPayload = {
        activity_id: activityId,
        title: title.trim(),
        description: description.trim(),
        completed: false,
        reminder_minutes: hasReminder ? parseInt(reminderMinutes, 10) : null,
      };

      console.log('📤 Sending task payload:', JSON.stringify(taskPayload, null, 2));

      const { data: taskData, error: taskError } = await supabase
        .from('activity_tasks')
        .insert(taskPayload)
        .select()
        .single();

      if (taskError) {
        console.error('❌ Error creating task:', taskError);
        console.error('  Error code:', taskError.code);
        console.error('  Error message:', taskError.message);
        console.error('  Error details:', taskError.details);
        console.error('  Error hint:', taskError.hint);
        throw new Error(`Database fejl: ${taskError.message}`);
      }

      if (!taskData) {
        console.error('❌ No task data returned from insert');
        throw new Error('Ingen data returneret fra databasen');
      }

      console.log('✅ Task created in database:', taskData.id);

      // If reminder is set, schedule notification using the smart scheduler
      if (hasReminder && taskData && safeActivityDate) {
        console.log('📅 Scheduling notification for new task...');
        console.log('  Task ID:', taskData.id);
        console.log('  Reminder Minutes:', parseInt(reminderMinutes, 10));
        
        const activityDateStr = safeActivityDate.toISOString().split('T')[0];
        
        const success = await scheduleTaskReminderImmediate(
          taskData.id,
          title.trim(),
          activityId,
          activityTitle,
          activityDateStr,
          activityTime,
          parseInt(reminderMinutes, 10)
        );

        if (success) {
          console.log('✅ Notification scheduled successfully');
          Alert.alert(
            'Opgave oprettet',
            `Opgaven "${title}" er oprettet med påmindelse ${reminderMinutes} minutter før aktiviteten.`,
            [{ text: 'OK' }]
          );
        } else {
          console.log('⚠️ Notification scheduling failed or deferred');
          Alert.alert(
            'Opgave oprettet',
            `Opgaven "${title}" er oprettet. Påmindelsen vil blive planlagt automatisk.`,
            [{ text: 'OK' }]
          );
        }
      } else if (hasReminder && !safeActivityDate) {
        console.warn('⚠️ Skipping reminder scheduling – activity date missing');
        Alert.alert(
          'Opgave oprettet',
          `Opgaven "${title}" er oprettet, men der kunne ikke planlægges påmindelse uden gyldig dato.`,
          [{ text: 'OK' }],
        );
      } else {
        console.log('ℹ️ No reminder set for this task');
        Alert.alert('Opgave oprettet', `Opgaven "${title}" er oprettet.`, [{ text: 'OK' }]);
      }

      console.log('========== TASK CREATION COMPLETE ==========');

      if (onTaskCreated) {
        await onTaskCreated();
      }

      if (onSave) {
        await onSave({
          title: title.trim(),
          description: description.trim(),
          completed: false,
          isTemplate: false,
          categoryIds: [],
          reminder: hasReminder ? parseInt(reminderMinutes, 10) : undefined,
          subtasks: [],
        });
      }

      // Reset form and close
      setTitle('');
      setDescription('');
      setHasReminder(false);
      setReminderMinutes('10');
      onClose();
    } catch (error: any) {
      console.error('❌ Error in handleSave:', error);
      console.error('  Error type:', typeof error);
      console.error('  Error name:', error?.name);
      console.error('  Error message:', error?.message);
      console.error('  Error stack:', error?.stack);
      
      Alert.alert(
        'Fejl',
        error?.message || 'Kunne ikke oprette opgave. Prøv venligst igen.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    title,
    userId,
    activityExists,
    activityId,
    activityTitle,
    safeActivityDate,
    activityTime,
    hasReminder,
    reminderMinutes,
    description,
    onSave,
    onTaskCreated,
    onClose,
  ]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ny opgave</Text>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.activityInfo}>
            For: {activityTitle}
          </Text>
          <Text style={styles.activityInfo}>
            Dato: {activityDateLabel}
            {safeActivityDate ? ` kl. ${activityTime}` : ''}
          </Text>

          {!activityExists && (
            <View style={styles.warningBanner}>
              <Text style={styles.warningText}>
                ⏳ Venter på at aktiviteten bliver oprettet...
              </Text>
            </View>
          )}

          <ScrollView 
            ref={scrollViewRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.label}>Titel *</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Opgavetitel"
              placeholderTextColor={colors.textSecondary}
              editable={activityExists}
              returnKeyType="next"
            />

            <Text style={styles.label}>Beskrivelse</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder="Beskrivelse (valgfri)"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              editable={activityExists}
              textAlignVertical="top"
            />

            <View style={styles.reminderContainer}>
              <View style={styles.reminderHeader}>
                <Text style={styles.label}>Påmindelse</Text>
                <Switch
                  value={hasReminder}
                  onValueChange={setHasReminder}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={hasReminder ? colors.primary : colors.textSecondary}
                  disabled={!activityExists}
                />
              </View>

              {hasReminder && (
                <View style={styles.reminderInputContainer}>
                  <Text style={styles.reminderLabel}>Minutter før aktivitet:</Text>
                  <TextInput
                    style={styles.reminderInput}
                    value={reminderMinutes}
                    onChangeText={setReminderMinutes}
                    keyboardType="number-pad"
                    placeholder="10"
                    placeholderTextColor={colors.textSecondary}
                    editable={activityExists}
                    returnKeyType="done"
                  />
                </View>
              )}
            </View>

            {/* Extra padding to ensure content is visible above keyboard */}
            <View style={{ height: 100 }} />
          </ScrollView>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
              disabled={isLoading}
            >
              <Text style={styles.cancelButtonText}>Annuller</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                (isLoading || !activityExists) && styles.disabledButton
              ]}
              onPress={handleSave}
              disabled={isLoading || !activityExists}
            >
              <Text style={styles.saveButtonText}>
                {isLoading ? 'Gemmer...' : !activityExists ? 'Vent...' : 'Gem'}
              </Text>
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.cardBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '600',
  },
  activityInfo: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 5,
  },
  warningBanner: {
    backgroundColor: '#fff3cd',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    marginBottom: 10,
  },
  warningText: {
    fontSize: 14,
    color: '#856404',
    textAlign: 'center',
  },
  scrollView: {
    marginTop: 20,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  reminderContainer: {
    marginTop: 20,
  },
  reminderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reminderInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  reminderLabel: {
    fontSize: 14,
    color: colors.text,
    marginRight: 10,
  },
  reminderInput: {
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    width: 80,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: colors.cardBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.5,
  },
});
