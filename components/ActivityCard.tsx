
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TouchableOpacity, Alert, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useFootball } from '@/contexts/FootballContext';
import TaskDetailsModal from '@/components/TaskDetailsModal';

interface ActivityCardProps {
  activity: any;
  resolvedDate: Date;
  onPress?: () => void;
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

// Category gradient mapping
const getCategoryGradient = (category: any): string[] => {
  if (!category || !category.color) {
    console.warn('ActivityCard: No category or category color found, using fallback gradient');
    return ['#6B7280', '#4B5563'];
  }
  const baseColor = category.color;
  const lighterColor = lightenColor(baseColor, 0.15);
  const darkerColor = darkenColor(baseColor, 0.2);
  return [lighterColor, darkerColor];
};

// Get emoji for category
const getCategoryEmoji = (category: any): string => {
  if (!category || !category.emoji) return '⚽';
  return category.emoji;
};

export default function ActivityCard({ activity, resolvedDate, onPress, showTasks = false }: ActivityCardProps) {
  const router = useRouter();
  const { toggleTaskCompletion, refreshData } = useFootball();
  
  // Local optimistic state for tasks
  const [optimisticTasks, setOptimisticTasks] = useState<any[]>([]);
  
  // Task modal state
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Loading state for each task (by task ID)
  const [loadingTasks, setLoadingTasks] = useState<Set<string>>(new Set());

  // Initialize and update optimistic tasks from activity
  useEffect(() => {
    if (activity.tasks) {
      setOptimisticTasks(activity.tasks);
    } else {
      setOptimisticTasks([]);
    }
  }, [activity.tasks, activity.id]); // Re-run when tasks or activity ID changes

  const handleCardPress = () => {
    if (onPress) {
      onPress();
    } else {
      console.log('ActivityCard: Navigating to activity details with id:', activity.id);
      router.push({
        pathname: '/activity-details',
        params: { id: activity.id },
      });
    }
  };

  const handleTaskPress = (task: any, event: any) => {
    // Stop propagation to prevent card press
    event.stopPropagation();
    
    console.log('ActivityCard: Task pressed, opening TaskDetailsModal');
    setActiveTaskId(task.id);
    setIsTaskModalOpen(true);
  };

  const handleToggleTask = async (taskId: string, event: any) => {
    // Stop propagation to prevent card press
    event.stopPropagation();
    
    console.log('ActivityCard: Toggling task:', taskId);
    
    // Find the task
    const taskIndex = optimisticTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      console.error('Task not found:', taskId);
      return;
    }
    
    const task = optimisticTasks[taskIndex];
    const previousCompleted = task.completed;
    
    // Set loading state
    setLoadingTasks(prev => new Set(prev).add(taskId));
    
    // Optimistic update
    const newTasks = [...optimisticTasks];
    newTasks[taskIndex] = { ...task, completed: !previousCompleted };
    setOptimisticTasks(newTasks);
    
    try {
      // Backend call
      await toggleTaskCompletion(activity.id, taskId);
      console.log('✅ Task toggled successfully');
      
      // Refresh data to sync with backend
      refreshData();
    } catch (error) {
      console.error('❌ Error toggling task, rolling back:', error);
      
      // Rollback on error
      const rollbackTasks = [...optimisticTasks];
      rollbackTasks[taskIndex] = { ...task, completed: previousCompleted };
      setOptimisticTasks(rollbackTasks);
      
      Alert.alert('Fejl', 'Kunne ikke opdatere opgaven. Prøv igen.');
    } finally {
      // Remove loading state
      setLoadingTasks(prev => {
        const newSet = new Set(prev);
        newSet.delete(taskId);
        return newSet;
      });
    }
  };

  const formatReminderTime = (reminderMinutes: number) => {
    if (!reminderMinutes) return null;
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

  const category = activity.category || null;
  const gradientColors = getCategoryGradient(category);
  const categoryEmoji = getCategoryEmoji(category);
  
  const dayLabel = format(resolvedDate, 'EEE. d. MMM.', { locale: da });
  const timeLabel = format(resolvedDate, 'HH:mm');
  const location = activity.location || activity.category_location || '';

  return (
    <>
      <Pressable
        onPress={handleCardPress}
        style={({ pressed }) => [
          pressed && styles.cardPressed,
        ]}
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
          {showTasks && optimisticTasks && optimisticTasks.length > 0 && (
            <View style={styles.tasksSection}>
              <View style={styles.tasksDivider} />
              {optimisticTasks.map((task, index) => {
                const isLoading = loadingTasks.has(task.id);
                
                return (
                  <View key={index} style={styles.taskRow}>
                    <TouchableOpacity
                      style={styles.taskCheckboxArea}
                      onPress={(e) => handleToggleTask(task.id, e)}
                      activeOpacity={0.7}
                    >
                      <Animated.View
                        style={[
                          styles.taskCheckbox,
                          task.completed && styles.taskCheckboxCompleted,
                          isLoading && styles.taskCheckboxLoading,
                        ]}
                      >
                        {isLoading ? (
                          <View style={styles.loadingSpinner}>
                            <View style={styles.spinnerDot} />
                          </View>
                        ) : task.completed ? (
                          <IconSymbol
                            ios_icon_name="checkmark"
                            android_material_icon_name="check"
                            size={14}
                            color={task.completed ? '#4CAF50' : '#fff'}
                          />
                        ) : null}
                      </Animated.View>
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
                        
                        {task.reminder_minutes && (
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
          onClose={() => {
            setIsTaskModalOpen(false);
            setActiveTaskId(null);
            // Refresh data when modal closes to sync any changes
            refreshData();
          }}
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
  taskCheckboxLoading: {
    opacity: 0.7,
  },
  loadingSpinner: {
    width: 14,
    height: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
  taskContent: {
    flex: 1,
  },
  taskTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: '#FFFFFF',
    flex: 1,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
  },
  reminderText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  videoIndicator: {
    marginLeft: 8,
  },
});
