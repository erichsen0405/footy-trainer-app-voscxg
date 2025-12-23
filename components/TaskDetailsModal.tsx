
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/app/integrations/supabase/client';
import { taskService } from '@/services/taskService';

interface TaskDetailsModalProps {
  taskId: string;
  onClose: () => void;
}

interface TaskData {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  reminder_minutes?: number;
  video_url?: string;
  activity_id?: string;
  local_meta_id?: string;
  is_external: boolean;
}

export default function TaskDetailsModal({ taskId, onClose }: TaskDetailsModalProps) {
  const [task, setTask] = useState<TaskData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  // Fetch task data
  useEffect(() => {
    const fetchTask = async () => {
      console.log('TaskDetailsModal: Fetching task:', taskId);
      setLoading(true);
      setError(null);

      try {
        // Try fetching from activity_tasks first
        const { data: activityTask, error: activityError } = await supabase
          .from('activity_tasks')
          .select('*')
          .eq('id', taskId)
          .maybeSingle();

        if (activityTask) {
          console.log('TaskDetailsModal: Found in activity_tasks');
          setTask({
            ...activityTask,
            is_external: false,
          });
          setLoading(false);
          return;
        }

        // If not found, try external_event_tasks
        const { data: externalTask, error: externalError } = await supabase
          .from('external_event_tasks')
          .select('*')
          .eq('id', taskId)
          .maybeSingle();

        if (externalTask) {
          console.log('TaskDetailsModal: Found in external_event_tasks');
          setTask({
            ...externalTask,
            is_external: true,
          });
          setLoading(false);
          return;
        }

        // Task not found
        console.error('TaskDetailsModal: Task not found');
        setError('Opgaven blev ikke fundet');
        setLoading(false);
      } catch (err) {
        console.error('TaskDetailsModal: Error fetching task:', err);
        setError('Kunne ikke hente opgaven');
        setLoading(false);
      }
    };

    fetchTask();
  }, [taskId]);

  const handleToggleCompletion = async () => {
    if (!task || completing) return;

    console.log('TaskDetailsModal: Toggling completion');
    setCompleting(true);

    const newCompleted = !task.completed;

    // Optimistic update
    setTask({ ...task, completed: newCompleted });

    try {
      await taskService.toggleTaskCompletion(taskId, task.is_external, newCompleted);
      console.log('TaskDetailsModal: Task completion toggled successfully');
    } catch (err) {
      console.error('TaskDetailsModal: Error toggling completion:', err);
      // Rollback on error
      setTask({ ...task, completed: !newCompleted });
      setError('Kunne ikke opdatere opgaven');
    } finally {
      setCompleting(false);
    }
  };

  const formatReminderTime = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes} min før`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} time${hours > 1 ? 'r' : ''} før`;
    }
    return `${hours} time${hours > 1 ? 'r' : ''} og ${remainingMinutes} min før`;
  };

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Opgave</Text>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <IconSymbol
              ios_icon_name="xmark"
              android_material_icon_name="close"
              size={24}
              color={colors.text}
            />
          </Pressable>
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {loading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Henter opgave...</Text>
            </View>
          )}

          {error && (
            <View style={styles.errorContainer}>
              <IconSymbol
                ios_icon_name="exclamationmark.triangle"
                android_material_icon_name="error"
                size={48}
                color="#FF6B6B"
              />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {!loading && !error && task && (
            <>
              {/* Task Title */}
              <View style={styles.section}>
                <Text style={styles.taskTitle}>{task.title}</Text>
              </View>

              {/* Video - UNDER title, OVER description */}
              {task.video_url && (
                <View style={styles.section}>
                  <View style={styles.videoContainer}>
                    <SmartVideoPlayer url={task.video_url} />
                  </View>
                </View>
              )}

              {/* Task Description */}
              {task.description && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Beskrivelse</Text>
                  <Text style={styles.description}>{task.description}</Text>
                </View>
              )}

              {/* Reminder */}
              {task.reminder_minutes && (
                <View style={styles.section}>
                  <View style={styles.reminderContainer}>
                    <IconSymbol
                      ios_icon_name="bell.fill"
                      android_material_icon_name="notifications"
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={styles.reminderText}>
                      Påmindelse: {formatReminderTime(task.reminder_minutes)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Completion Button */}
              <View style={styles.section}>
                <Pressable
                  onPress={handleToggleCompletion}
                  disabled={completing}
                  style={({ pressed }) => [
                    styles.completionButton,
                    task.completed && styles.completionButtonCompleted,
                    pressed && styles.completionButtonPressed,
                    completing && styles.completionButtonDisabled,
                  ]}
                >
                  <View style={styles.completionButtonContent}>
                    <View
                      style={[
                        styles.checkbox,
                        task.completed && styles.checkboxCompleted,
                      ]}
                    >
                      {task.completed && (
                        <IconSymbol
                          ios_icon_name="checkmark"
                          android_material_icon_name="check"
                          size={20}
                          color="#fff"
                        />
                      )}
                    </View>
                    <Text
                      style={[
                        styles.completionButtonText,
                        task.completed && styles.completionButtonTextCompleted,
                      ]}
                    >
                      {task.completed ? 'Markér som ikke fuldført' : 'Markér som fuldført'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: '#FF6B6B',
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  taskTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.text,
  },
  videoContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000',
    aspectRatio: 16 / 9,
  },
  reminderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reminderText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  completionButton: {
    padding: 16,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
  },
  completionButtonCompleted: {
    backgroundColor: colors.success || '#4CAF50',
  },
  completionButtonPressed: {
    opacity: 0.8,
  },
  completionButtonDisabled: {
    opacity: 0.5,
  },
  completionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  checkboxCompleted: {
    backgroundColor: '#fff',
    borderColor: '#fff',
  },
  completionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  completionButtonTextCompleted: {
    color: '#fff',
  },
});
