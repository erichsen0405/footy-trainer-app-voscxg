import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { IconSymbol } from '@/components/IconSymbol';
import { useFootball } from '@/contexts/FootballContext';
import TaskDetailsModal from '@/components/TaskDetailsModal';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { colors } from '@/styles/commonStyles';
import { resolveActivityIntensityEnabled } from '@/utils/activityIntensity';

interface ActivityCardProps {
  activity: any;
  resolvedDate: Date;
  onPress?: () => void;
  onPressIntensity?: () => void;
  showTasks?: boolean;
}

// Helper function to lighten a hex color
function lightenColor(hex: string, percent: number): string {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const newR = Math.min(255, Math.floor(r + (255 - r) * percent));
  const newG = Math.min(255, Math.floor(g + (255 - g) * percent));
  const newB = Math.min(255, Math.floor(b + (255 - b) * percent));
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Helper function to darken a hex color
function darkenColor(hex: string, percent: number): string {
  hex = hex.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const newR = Math.floor(r * (1 - percent));
  const newG = Math.floor(g * (1 - percent));
  const newB = Math.floor(b * (1 - percent));
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

type CategoryMeta = {
  color?: string;
  emoji?: string;
};

// Category gradient mapping (color-based, supports new resolved fields)
const getCategoryGradientFromColor = (color?: string): string[] => {
  const baseColor = String(color ?? '').trim();
  if (!baseColor) {
    // Warn only when we truly have no usable color
    console.warn('ActivityCard: No category color found, using fallback gradient');
    return ['#6B7280', '#4B5563'];
  }
  const lighterColor = lightenColor(baseColor, 0.15);
  const darkerColor = darkenColor(baseColor, 0.2);
  return [lighterColor, darkerColor];
};

// Get emoji for category
const getCategoryEmoji = (emoji?: string): string => {
  if (!emoji) return '⚽';
  return emoji;
};

export default function ActivityCard({
  activity,
  resolvedDate,
  onPress,
  onPressIntensity,
  showTasks = false,
}: ActivityCardProps) {
  const router = useRouter();
  const { toggleTaskCompletion, refreshData } = useFootball();
  
  // Local optimistic state for tasks
  const [optimisticTasks, setOptimisticTasks] = useState<any[]>([]);
  
  // Task modal state
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Initialize and update optimistic tasks from activity
  useEffect(() => {
    if (activity.tasks) {
      setOptimisticTasks(activity.tasks);
    } else {
      setOptimisticTasks([]);
    }
  }, [activity.tasks, activity.id]);

  const resolveFeedbackTemplateId = useCallback((task: any): string | null => {
    if (!task) return null;

    const directTemplateId = task.feedbackTemplateId ?? task.feedback_template_id;
    if (directTemplateId) {
      return String(directTemplateId);
    }

    const fromMarker = typeof task.description === 'string'
      ? parseTemplateIdFromMarker(task.description)
      : null;

    return fromMarker ?? null;
  }, []);

  const isFeedbackTask = useCallback(
    (task: any): boolean => {
      if (!task) return false;
      if (task.isFeedbackTask || task.is_feedback_task) {
        return true;
      }

      return !!resolveFeedbackTemplateId(task);
    },
    [resolveFeedbackTemplateId]
  );

  const navigateToFeedbackTask = useCallback(
    (task: any): boolean => {
      if (!isFeedbackTask(task)) {
        return false;
      }

      const taskId = task?.id ?? task?.task_id;

      router.push({
        pathname: '/activity-details',
        params: {
          id: activity.id,
          openFeedbackTaskId: taskId ? String(taskId) : undefined,
        },
      });

      return true;
    },
    [activity.id, isFeedbackTask, router]
  );

  // Memoized card press handler - only navigates, no async work
  const handleCardPress = useCallback(() => {
    if (onPress) {
      onPress();
    } else {
      router.push({
        pathname: '/activity-details',
        params: { id: activity.id },
      });
    }
  }, [onPress, router, activity.id]);

  // Task press handler
  const handleTaskPress = useCallback(
    (task: any, event: any) => {
      event.stopPropagation();

      if (navigateToFeedbackTask(task)) {
        return;
      }

      const taskId = task?.id ?? task?.task_id;
      if (!taskId) {
        return;
      }

      setActiveTaskId(String(taskId));
      setIsTaskModalOpen(true);
    },
    [navigateToFeedbackTask]
  );

  // Toggle task handler
  const handleToggleTask = useCallback(
    async (task: any, event: any) => {
      event.stopPropagation();

      if (navigateToFeedbackTask(task)) {
        return;
      }
      
      const taskId = task?.id ?? task?.task_id;
      const taskIndex = optimisticTasks.findIndex(
        t => t.id === taskId || t.task_id === taskId
      );
      if (taskIndex === -1) {
        console.error('Task not found:', taskId);
        return;
      }
      
      const previousCompleted = optimisticTasks[taskIndex].completed;
      
      // Optimistic update
      const newTasks = [...optimisticTasks];
      newTasks[taskIndex] = { ...optimisticTasks[taskIndex], completed: !previousCompleted };
      setOptimisticTasks(newTasks);
      
      try {
        await toggleTaskCompletion(activity.id, String(taskId), !previousCompleted);
        refreshData();
      } catch (error) {
        console.error('❌ Error toggling task, rolling back:', error);
        
        // Rollback on error
        const rollbackTasks = [...optimisticTasks];
        rollbackTasks[taskIndex] = { ...optimisticTasks[taskIndex], completed: previousCompleted };
        setOptimisticTasks(rollbackTasks);
      }
    },
    [activity.id, navigateToFeedbackTask, optimisticTasks, refreshData, toggleTaskCompletion]
  );

  // Memoized modal close handler
  const handleModalClose = useCallback(() => {
    setIsTaskModalOpen(false);
    setActiveTaskId(null);
    refreshData();
  }, [refreshData]);

  const formatReminderTime = (reminderMinutes: number | null | undefined) => {
    if (reminderMinutes === null || reminderMinutes === undefined) return null;
    if (reminderMinutes < 60) {
      return `${reminderMinutes}m`;
    }
    const hours = Math.floor(reminderMinutes / 60);
    const remainingMinutes = reminderMinutes % 60;
    if (remainingMinutes === 0) {
      return `${hours}t`;
    }
    return `${hours}t ${remainingMinutes}m`;
  };

  // Resolve category meta (color + emoji) without relying on legacy activity.category
  // Priority for color:
  // a) activity.categoryColor
  // b) activity.category_color
  // c) activity.activity_categories?.color
  // d) activity.activity_category?.color
  // e) activity.category?.color (legacy)
  const resolvedCategoryMeta: CategoryMeta = useMemo(() => {
    const joinedCategory = activity?.activity_categories ?? activity?.activity_category ?? null;
    const legacyCategory = activity?.category ?? null;

    const color =
      activity?.categoryColor ??
      activity?.category_color ??
      joinedCategory?.color ??
      legacyCategory?.color ??
      undefined;

    const emoji =
      joinedCategory?.emoji ??
      legacyCategory?.emoji ??
      undefined;

    return { color, emoji };
  }, [activity]);

  const gradientColors = useMemo(
    () => getCategoryGradientFromColor(resolvedCategoryMeta?.color),
    [resolvedCategoryMeta?.color]
  );

  const categoryEmoji = useMemo(
    () => getCategoryEmoji(resolvedCategoryMeta?.emoji),
    [resolvedCategoryMeta?.emoji]
  );

  const dayLabel = format(resolvedDate, 'EEE. d. MMM.', { locale: da });
  const timeLabel = format(resolvedDate, 'HH:mm');
  const location = activity.location || activity.category_location || '';
  const intensityValue = useMemo(() => {
    const raw = activity?.intensity ?? activity?.activity_intensity;
    return typeof raw === 'number' ? raw : null;
  }, [activity]);

  const intensityEnabled = useMemo(
    () => resolveActivityIntensityEnabled(activity),
    [activity]
  );
  const hasIntensityValue = typeof intensityValue === 'number';
  const allowQuickEdit = typeof onPressIntensity === 'function';
  const showIntensityRow = allowQuickEdit || intensityEnabled || hasIntensityValue;
  const intensityMissing = !hasIntensityValue || !intensityEnabled;

  const taskListItems = useMemo(() => {
    const baseTasks = Array.isArray(optimisticTasks) ? optimisticTasks : [];
    const rows = showIntensityRow ? [{ type: 'intensity' as const }] : [];
    return [...rows, ...baseTasks.map(task => ({ type: 'task' as const, task }))];
  }, [showIntensityRow, optimisticTasks]);
  const shouldRenderTasksSection = showTasks && taskListItems.length > 0;

  const handleIntensityRowPress = useCallback(
    (event: any) => {
      event.stopPropagation?.();
      if (!onPressIntensity) return;
      onPressIntensity();
    },
    [onPressIntensity]
  );

  return (
    <>
      <Pressable
        onPress={handleCardPress}
        style={({ pressed }) => [pressed && styles.cardPressed]}
      >
        <LinearGradient
          colors={gradientColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.cardContent}>
            {/* Icon */}
            <View style={styles.iconContainer}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconEmoji}>{categoryEmoji}</Text>
              </View>
            </View>

            {/* Content */}
            <View style={styles.textContainer}>
              <Text style={styles.title} numberOfLines={1}>
                {activity.title || activity.name || 'Uden titel'}
              </Text>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailIcon}>🕐</Text>
                <Text style={styles.detailText}>{dayLabel} • {timeLabel}</Text>
              </View>

              {location && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>📍</Text>
                  <Text style={styles.detailText} numberOfLines={1}>{location}</Text>
                </View>
              )}

              {activity.is_external && (
                <View style={styles.externalBadge}>
                  <Text style={styles.externalText}>📅 Ekstern kalender</Text>
                </View>
              )}
            </View>

            {/* Chevron Arrow */}
            <View style={styles.arrowContainer}>
              <Text style={styles.arrow}>›</Text>
            </View>
          </View>

          {/* Tasks Section - Only show if showTasks is true and tasks exist */}
          {shouldRenderTasksSection && (
            <View style={styles.tasksSection}>
              <View style={styles.tasksDivider} />
              {taskListItems.map(item => {
                if (item.type === 'intensity') {
                  return (
                    <TouchableOpacity
                      key={`intensity-${activity.id}`}
                      style={[
                        styles.taskRow,
                        !onPressIntensity && styles.intensityTaskRowDisabled,
                        intensityMissing && styles.intensityMissingBorder,
                      ]}
                      onPress={handleIntensityRowPress}
                      activeOpacity={onPressIntensity ? 0.7 : 1}
                      disabled={!onPressIntensity}
                    >
                      <View style={styles.intensityRowInner}>
                        <View style={styles.taskCheckboxArea}>
                          <View
                            style={[
                              styles.taskCheckbox,
                              !intensityMissing && styles.taskCheckboxCompleted,
                            ]}
                          >
                            {!intensityMissing && (
                              <IconSymbol
                                ios_icon_name="checkmark"
                                android_material_icon_name="check"
                                size={14}
                                color="#4CAF50"
                              />
                            )}
                          </View>
                        </View>
                        <View style={styles.taskContent}>
                          <View style={styles.taskTitleRow}>
                            <Text
                              style={[
                                styles.taskTitle,
                                !intensityMissing && styles.taskTitleCompleted,
                              ]}
                              numberOfLines={1}
                            >
                              Intensitet
                            </Text>
                            <Text
                              style={[
                                styles.intensityTaskValue,
                                intensityMissing && styles.intensityTaskValueMissing,
                              ]}
                            >
                              {intensityMissing ? 'Ikke angivet' : `${intensityValue}/10`}
                            </Text>
                          </View>
                          {allowQuickEdit && (
                            <Text style={styles.intensityTaskHelper}>
                              Tryk for at angive intensitet
                            </Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }

                const task = item.task;
                return (
                  <React.Fragment
                    key={
                      String(task?.id ?? '').trim() ||
                      String(task?.task_id ?? '').trim() ||
                      `${String(activity?.id ?? 'activity')}-${String(task?.title ?? 'task')}`
                    }
                  >
                    <View style={styles.taskRow}>
                      <TouchableOpacity
                        style={styles.taskCheckboxArea}
                        onPress={(e) => handleToggleTask(task, e)}
                        activeOpacity={0.7}
                      >
                        <View
                          style={[
                            styles.taskCheckbox,
                            task.completed && styles.taskCheckboxCompleted,
                          ]}
                        >
                          {task.completed && (
                            <IconSymbol
                              ios_icon_name="checkmark"
                              android_material_icon_name="check"
                              size={14}
                              color={task.completed ? '#4CAF50' : '#fff'}
                            />
                          )}
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.taskContent}
                        onPress={(e) => handleTaskPress(task, e)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.taskTitleRow}>
                          <Text
                            style={[
                              styles.taskTitle,
                              task.completed && styles.taskTitleCompleted,
                            ]}
                            numberOfLines={1}
                          >
                            {task.title}
                          </Text>
                          
                          {task.reminder_minutes !== null && task.reminder_minutes !== undefined && (
                            <View style={styles.reminderBadge}>
                              <IconSymbol
                                ios_icon_name="bell.fill"
                                android_material_icon_name="notifications"
                                size={10}
                                color="rgba(255, 255, 255, 0.8)"
                              />
                              <Text style={styles.reminderText}>
                                {formatReminderTime(task.reminder_minutes)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>

                      {task.video_url && (
                        <View style={styles.videoIndicator}>
                          <IconSymbol
                            ios_icon_name="play.circle.fill"
                            android_material_icon_name="play_circle"
                            size={20}
                            color="rgba(255, 255, 255, 0.9)"
                          />
                        </View>
                      )}
                    </View>
                  </React.Fragment>
                );
              })}
            </View>
          )}
        </LinearGradient>
      </Pressable>

      {/* Task Details Modal */}
      {isTaskModalOpen && activeTaskId && (
        <TaskDetailsModal
          taskId={activeTaskId}
          onClose={handleModalClose}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 18,
    minHeight: 100,
    boxShadow: '0px 4px 14px rgba(0, 0, 0, 0.18)',
    elevation: 5,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Icon
  iconContainer: {
    marginRight: 14,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 30,
  },

  // Text Content
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detailIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.95)',
    flex: 1,
  },
  externalBadge: {
    marginTop: 6,
  },
  externalText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },

  // Chevron Arrow
  arrowContainer: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 40,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 40,
  },

  // Tasks Section
  tasksSection: {
    marginTop: 16,
  },
  tasksDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 12,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  taskCheckboxArea: {
    marginRight: 12,
    padding: 4,
  },
  taskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  taskCheckboxCompleted: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  taskContent: {
    flex: 1,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.95)',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  intensityTaskValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
  },
  intensityTaskValueMissing: {
    color: 'rgba(255, 255, 255, 0.6)',
  },
  intensityRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  intensityTaskHelper: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
  },
  intensityTaskRowDisabled: {
    opacity: 0.5,
  },
  intensityMissingBorder: {
    borderWidth: 2,
    borderColor: '#EF4444',
    borderRadius: 12,
  },

  // Reminder Badge
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingVertical: 2,
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  reminderText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
    marginLeft: 4,
  },

  // Video Indicator
  videoIndicator: {
    marginLeft: 'auto',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Task Details Modal
  modalContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  modalText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
  },
});
