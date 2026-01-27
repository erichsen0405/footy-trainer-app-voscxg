import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, useColorScheme } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { IconSymbol } from '@/components/IconSymbol';
import { useFootball } from '@/contexts/FootballContext';
import TaskDetailsModal from '@/components/TaskDetailsModal';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { resolveActivityIntensityEnabled } from '@/utils/activityIntensity';

interface ActivityCardProps {
  activity: any;
  resolvedDate: Date;
  onPress?: () => void;
  onPressIntensity?: () => void;
  showTasks?: boolean;
}

type TaskListItem =
  | { type: 'intensity'; key: string }
  | { type: 'task'; key: string; task: any };

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
const getCategoryGradientFromColor = (color?: string): readonly [string, string] => {
  const baseColor = String(color ?? '').trim();
  if (!baseColor) {
    // Warn only when we truly have no usable color
    console.warn('ActivityCard: No category color found, using fallback gradient');
    return ['#6B7280', '#4B5563'] as const;
  }
  const lighterColor = lightenColor(baseColor, 0.15);
  const darkerColor = darkenColor(baseColor, 0.2);
  return [lighterColor, darkerColor] as const;
};

// Get emoji for category
const getCategoryEmoji = (emoji?: string): string => {
  if (!emoji) return '⚽';
  return emoji;
};

export default function ActivityCard({
  activity,
  resolvedDate,
  onPress: _deprecatedOnPress,
  onPressIntensity: _deprecatedOnPressIntensity,
  showTasks = false,
}: ActivityCardProps) {
  const router = useRouter();
  const { toggleTaskCompletion, refreshData } = useFootball();
  const suppressCardPressRef = useRef(false);
  const isDark = useColorScheme() === 'dark';

  const activityId = useMemo(() => {
    const raw = activity?.id ?? activity?.activity_id;
    if (raw === null || raw === undefined) return null;
    const trimmed = String(raw).trim();
    const lowered = trimmed.toLowerCase();
    if (!trimmed.length || lowered === 'undefined' || lowered === 'null') return null;
    return trimmed;
  }, [activity?.activity_id, activity?.id]);

  // Local optimistic state for tasks
  const [optimisticTasks, setOptimisticTasks] = useState<any[]>([]);

  // Task modal state (data-driven; no fetch on open)
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isTaskModalSaving, setIsTaskModalSaving] = useState(false);

  // Initialize and update optimistic tasks from activity
  useEffect(() => {
    if (Array.isArray(activity?.tasks)) {
      setOptimisticTasks(activity.tasks);
    } else {
      setOptimisticTasks([]);
    }
  }, [activity?.tasks, activityId]);

  const resolveFeedbackTemplateId = useCallback((task: any): string | null => {
    if (!task) return null;

    const directTemplateId = task.feedbackTemplateId ?? task.feedback_template_id;
    if (directTemplateId) {
      return String(directTemplateId);
    }

    const fromMarker =
      typeof task.description === 'string' ? parseTemplateIdFromMarker(task.description) : null;

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

  const handleCardPress = useCallback(() => {
    if (suppressCardPressRef.current) {
      suppressCardPressRef.current = false;
      return;
    }
    if (!activityId) {
      console.warn('[ActivityCard] Missing activity id for navigation');
      return;
    }
    const encodedId = encodeURIComponent(activityId);
    router.push(`/activity-details?id=${encodedId}&activityId=${encodedId}`);
  }, [activityId, router]);

  const handleIntensityRowPress = useCallback(
    (event?: any) => {
      event?.stopPropagation?.();
      if (!activityId) return;
      suppressCardPressRef.current = true;
      router.push({
        pathname: '/(modals)/task-score-note',
        params: {
          activityId: String(activity.id ?? activityId),
          initialScore:
            activity?.intensity !== null && activity?.intensity !== undefined
              ? String(activity.intensity)
              : '',
        },
      });
      setTimeout(() => {
        suppressCardPressRef.current = false;
      }, 0);
    },
    [activity?.intensity, activity.id, activityId, router]
  );

  const handleTaskPress = useCallback(
    (task: any, event?: any) => {
      event?.stopPropagation?.();
      const templateId =
        task?.feedbackTemplateId ??
        parseTemplateIdFromMarker(task?.description || '');
      if (isFeedbackTask(task)) {
        if (templateId && activityId) {
          router.push({
            pathname: '/(modals)/task-feedback-note',
            params: {
              activityId: String(activity.id ?? activityId),
              templateId: String(templateId),
              title: String(task.title ?? 'opgave'),
            },
          });
          return;
        }
        handleCardPress();
        return;
      }
      setSelectedTask(task);
      setIsTaskModalOpen(true);
    },
    [activity.id, activityId, handleCardPress, isFeedbackTask, router]
  );

  const handleModalClose = useCallback(() => {
    setIsTaskModalOpen(false);
    setSelectedTask(null);
    Promise.resolve(refreshData()).catch(() => {});
  }, [refreshData]);

  const handleModalComplete = useCallback(async () => {
    if (!selectedTask || isTaskModalSaving) return;
    if (!activityId) {
      console.warn('[ActivityCard] Missing activity id for completion');
      return;
    }

    const taskIdRaw = selectedTask?.id ?? selectedTask?.task_id;
    if (!taskIdRaw) return;
    const taskId = String(taskIdRaw);

    // optimistic set completed = true
    const idx = optimisticTasks.findIndex((candidate) => {
      const candidateId = candidate?.id ?? candidate?.task_id;
      return candidateId !== null && candidateId !== undefined && String(candidateId) === taskId;
    });
    if (idx === -1) return;

    const previous = !!optimisticTasks[idx].completed;
    if (previous) {
      handleModalClose();
      return;
    }

    const nextTasks = [...optimisticTasks];
    nextTasks[idx] = { ...optimisticTasks[idx], completed: true };
    setOptimisticTasks(nextTasks);

    setIsTaskModalSaving(true);
    try {
      await toggleTaskCompletion(activityId, taskId, true);
      Promise.resolve(refreshData()).catch(() => {});
      handleModalClose();
    } catch (error) {
      console.error('❌ Error completing task, rolling back:', error);
      const rollback = [...optimisticTasks];
      rollback[idx] = { ...optimisticTasks[idx], completed: previous };
      setOptimisticTasks(rollback);
    } finally {
      setIsTaskModalSaving(false);
    }
  }, [activityId, handleModalClose, isTaskModalSaving, optimisticTasks, refreshData, selectedTask, toggleTaskCompletion]);

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
  const resolvedCategoryMeta: CategoryMeta = useMemo(() => {
    const joinedCategory = activity?.activity_categories ?? activity?.activity_category ?? null;
    const legacyCategory = activity?.category ?? null;

    const color =
      activity?.categoryColor ??
      activity?.category_color ??
      joinedCategory?.color ??
      legacyCategory?.color ??
      undefined;

    const emoji = joinedCategory?.emoji ?? legacyCategory?.emoji ?? undefined;

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
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string') {
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }, [activity]);

  const intensityEnabled = useMemo(() => resolveActivityIntensityEnabled(activity), [activity]);
  const hasIntensityValue = typeof intensityValue === 'number';
  const showIntensityRow = intensityEnabled || hasIntensityValue;
  const intensityMissing = !hasIntensityValue;
  const intensityBadgeLabel = intensityMissing ? '–/10' : `${intensityValue}/10`;

  const taskListItems = useMemo<TaskListItem[]>(() => {
    const baseTasks = showTasks ? (Array.isArray(optimisticTasks) ? optimisticTasks : []) : [];
    const items: TaskListItem[] = [];

    if (showIntensityRow) {
      const fallbackId = activityId ?? String(activity?.id ?? 'activity');
      items.push({ type: 'intensity', key: `intensity-${fallbackId}` });
    }

    baseTasks.forEach((task, index) => {
      const rawId = task?.id ?? task?.task_id;
      const trimmedId =
        typeof rawId === 'number' || typeof rawId === 'string' ? String(rawId).trim() : '';
      const fallbackKey = trimmedId || `${activityId ?? 'activity'}-${index}`;
      items.push({ type: 'task', key: `task-${fallbackKey}`, task });
    });

    return items;
  }, [activity?.id, activityId, optimisticTasks, showIntensityRow, showTasks]);

  const shouldRenderTasksSection = taskListItems.length > 0;

  return (
    <>
      <Pressable onPress={handleCardPress} style={({ pressed }) => [pressed && styles.cardPressed]}>
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
                <Text style={styles.detailText}>
                  {dayLabel} • {timeLabel}
                </Text>
              </View>

              {location && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailIcon}>📍</Text>
                  <Text style={styles.detailText} numberOfLines={1}>
                    {location}
                  </Text>
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

          {/* Tasks Section */}
          {shouldRenderTasksSection && (
            <View style={styles.tasksSection}>
              <View style={styles.tasksDivider} />
              {taskListItems.map((item) => {
                if (item.type === 'intensity') {
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={styles.taskRow}
                      onPress={handleIntensityRowPress}
                      activeOpacity={0.7}
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
                            <Text style={styles.taskTitle} numberOfLines={1}>
                              Intensitet
                            </Text>

                            <View
                              style={[
                                styles.intensityBadge,
                                intensityMissing ? styles.intensityBadgeNeutral : styles.intensityBadgeFilled,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.intensityBadgeText,
                                  intensityMissing ? styles.intensityBadgeTextNeutral : styles.intensityBadgeTextFilled,
                                ]}
                              >
                                {intensityBadgeLabel}
                              </Text>
                            </View>
                          </View>

                          {/* Helper text ONLY when enabled AND missing */}
                          {intensityEnabled && intensityMissing && (
                            <Text style={styles.intensityTaskHelper}>
                              Tryk for at angive intensitet
                            </Text>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }

                const task = (item as any).task;

                return (
                  <React.Fragment key={item.key}>
                    <View style={styles.taskRow}>
                      {/* Checkbox is no longer a toggle; it opens modal (or feedback flow) */}
                      <TouchableOpacity
                        style={styles.taskCheckboxArea}
                        onPress={(e) => handleTaskPress(task, e)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.taskCheckbox, task.completed && styles.taskCheckboxCompleted]}>
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
                            style={[styles.taskTitle, task.completed && styles.taskTitleCompleted]}
                            numberOfLines={1}
                          >
                            {task.title}
                          </Text>

                          {task.reminder_minutes !== null &&
                            task.reminder_minutes !== undefined && (
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

      {/* Normal Task Details Modal (new glass/soft) */}
      {isTaskModalOpen && selectedTask && (
        <TaskDetailsModal
          visible={isTaskModalOpen}
          title={String(selectedTask?.title ?? 'Uden titel')}
          categoryColor={String(resolvedCategoryMeta?.color ?? '#3B82F6')}
          isDark={isDark}
          description={typeof selectedTask?.description === 'string' ? selectedTask.description : undefined}
          reminderMinutes={
            selectedTask?.reminder_minutes !== null && selectedTask?.reminder_minutes !== undefined
              ? Number(selectedTask.reminder_minutes)
              : null
          }
          videoUrl={typeof selectedTask?.video_url === 'string' ? selectedTask.video_url : null}
          completed={!!selectedTask?.completed}
          isSaving={isTaskModalSaving}
          onClose={handleModalClose}
          onComplete={handleModalComplete}
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
  intensityBadge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 12,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  intensityBadgeFilled: {
    backgroundColor: 'rgba(6, 17, 31, 0.5)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  intensityBadgeNeutral: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(15, 23, 42, 0.2)',
  },
  intensityBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  intensityBadgeTextFilled: {
    color: '#FFFFFF',
  },
  intensityBadgeTextNeutral: {
    color: '#0F172A',
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
