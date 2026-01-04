
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
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

// Skeleton component - renders immediately
const TaskDetailsSkeleton = React.memo(() => {
  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
      {/* Title skeleton */}
      <View style={styles.section}>
        <View style={[styles.skeleton, styles.skeletonTitle]} />
      </View>

      {/* Description skeleton */}
      <View style={styles.section}>
        <View style={[styles.skeleton, styles.skeletonLabel]} />
        <View style={[styles.skeleton, styles.skeletonDescription]} />
        <View style={[styles.skeleton, styles.skeletonDescription, { width: '80%' }]} />
      </View>

      {/* Button skeleton */}
      <View style={styles.section}>
        <View style={[styles.skeleton, styles.skeletonButton]} />
      </View>
    </ScrollView>
  );
});

// Content component - only renders when data is ready
const TaskDetailsContent = React.memo(({ 
  task, 
  completing, 
  onToggleCompletion 
}: { 
  task: TaskData; 
  completing: boolean;
  onToggleCompletion: () => void;
}) => {
  const formatReminderTime = useCallback((minutes: number) => {
    if (minutes < 60) {
      return `${minutes} min før`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} time${hours > 1 ? 'r' : ''} før`;
    }
    return `${hours} time${hours > 1 ? 'r' : ''} og ${remainingMinutes} min før`;
  }, []);

  const videoUrl = useMemo(() => task.video_url || null, [task.video_url]);

  return (
    <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
      {/* Task Title */}
      <View style={styles.section}>
        <Text style={styles.taskTitle}>{task.title || 'Uden titel'}</Text>
      </View>

      {/* Video - only render if valid URL exists */}
      {videoUrl && (
        <View style={styles.videoSection}>
          <View style={styles.videoContainer}>
            <SmartVideoPlayer url={videoUrl} />
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

      {/* Reminder - read-only, hidden if missing */}
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
          onPress={onToggleCompletion}
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
                  color={colors.primary}
                />
              )}
            </View>
            <Text
              style={[
                styles.completionButtonText,
                task.completed && styles.completionButtonTextCompleted,
              ]}
            >
              {task.completed ? 'Fuldført ✓' : 'Markér som fuldført'}
            </Text>
          </View>
        </Pressable>
      </View>
    </ScrollView>
  );
});

export default function TaskDetailsModal({ taskId, onClose }: TaskDetailsModalProps) {
  const [task, setTask] = useState<TaskData | null>(null);
  const [completing, setCompleting] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch task data - PARALLELIZED with Promise.allSettled
  useEffect(() => {
    let isMounted = true;

    const fetchTask = async () => {
      setLoading(true);
      
      try {
        // Parallelize both fetches - no sequential blocking
        const [activityTaskResult, externalTaskResult] = await Promise.allSettled([
          supabase
            .from('activity_tasks')
            .select(`
              *,
              task_templates!activity_tasks_task_template_id_fkey (
                video_url
              )
            `)
            .eq('id', taskId)
            .maybeSingle(),
          supabase
            .from('external_event_tasks')
            .select(`
              *,
              task_templates!external_event_tasks_task_template_id_fkey (
                video_url
              )
            `)
            .eq('id', taskId)
            .maybeSingle()
        ]);

        // Only update state if component is still mounted
        if (!isMounted) return;

        // Process activity_tasks result
        if (activityTaskResult.status === 'fulfilled' && activityTaskResult.value.data) {
          const activityTask = activityTaskResult.value.data;
          const videoUrl = activityTask.task_templates?.video_url || null;
          
          setTask({
            ...activityTask,
            video_url: videoUrl,
            is_external: false,
          });
          return;
        }

        // Process external_event_tasks result
        if (externalTaskResult.status === 'fulfilled' && externalTaskResult.value.data) {
          const externalTask = externalTaskResult.value.data;
          const videoUrl = externalTask.task_templates?.video_url || null;
          
          setTask({
            ...externalTask,
            video_url: videoUrl,
            is_external: true,
          });
          return;
        }

        // Task not found in either table
        setTask(null);
      } catch (err) {
        console.error('TaskDetailsModal: Error fetching task:', err);
        if (isMounted) {
          setTask(null);
        }
      } finally {
        // Deterministic loading stop - always called
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchTask();

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false;
    };
  }, [taskId]);

  const handleToggleCompletion = useCallback(async () => {
    if (!task || completing) return;

    const previousCompleted = task.completed;
    const newCompleted = !previousCompleted;

    // Optimistic update
    setTask({ ...task, completed: newCompleted });
    
    // Disable further clicks
    setCompleting(true);

    try {
      await taskService.toggleTaskCompletion(taskId);
    } catch (err) {
      console.error('TaskDetailsModal: Error toggling completion:', err);
      // Rollback on error
      setTask({ ...task, completed: previousCompleted });
    } finally {
      setCompleting(false);
    }
  }, [task, completing, taskId]);

  return (
    <Modal
      visible={true}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header - always visible */}
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

        {/* Skeleton - shown while loading */}
        {loading && <TaskDetailsSkeleton />}

        {/* Content - only mounted when data is ready */}
        {!loading && task && (
          <TaskDetailsContent 
            task={task} 
            completing={completing}
            onToggleCompletion={handleToggleCompletion}
          />
        )}

        {/* Error state - only shown when task is not found */}
        {!loading && !task && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>Opgave ikke fundet</Text>
          </View>
        )}
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
  videoSection: {
    marginBottom: 24,
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
    backgroundColor: colors.cardBackground || colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border || colors.highlight,
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
    opacity: 0.85,
  },
  completionButtonDisabled: {
    opacity: 0.6,
  },
  completionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 28,
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
  skeleton: {
    backgroundColor: colors.border || '#E0E0E0',
    borderRadius: 8,
    opacity: 0.3,
  },
  skeletonTitle: {
    height: 32,
    width: '70%',
    marginBottom: 8,
  },
  skeletonLabel: {
    height: 14,
    width: '30%',
    marginBottom: 8,
  },
  skeletonDescription: {
    height: 16,
    width: '100%',
    marginBottom: 8,
  },
  skeletonButton: {
    height: 60,
    width: '100%',
    borderRadius: 12,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
