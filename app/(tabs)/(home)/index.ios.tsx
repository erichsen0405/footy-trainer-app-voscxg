
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useColorScheme, Modal, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFootball } from '@/contexts/FootballContext';
import { colors } from '@/styles/commonStyles';
import { Activity, Task } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import { getWeek } from 'date-fns';
import CreateActivityModal, { ActivityCreationData } from '@/components/CreateActivityModal';
import { supabase } from '@/app/integrations/supabase/client';

export default function HomeScreen() {
  const router = useRouter();
  const { currentWeekStats, todayActivities, activities, categories, toggleTaskCompletion, createActivity, externalCalendars, fetchExternalCalendarEvents } = useFootball();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selectedTask, setSelectedTask] = useState<{ task: Task; activityId: string; activityTitle: string } | null>(null);
  const [isTaskModalVisible, setIsTaskModalVisible] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Check if user is admin
  useEffect(() => {
    const checkAdminStatus = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .single();

        if (!error && data) {
          setIsAdmin(data.role === 'admin');
        }
      }
    };
    checkAdminStatus();
  }, []);

  const onRefresh = async () => {
    console.log('Pull to refresh triggered on iOS home screen');
    setRefreshing(true);
    
    try {
      // Sync all enabled external calendars
      const enabledCalendars = externalCalendars.filter(cal => cal.enabled);
      console.log(`Syncing ${enabledCalendars.length} enabled calendars`);
      
      for (const calendar of enabledCalendars) {
        try {
          await fetchExternalCalendarEvents(calendar);
          console.log(`Successfully synced calendar: ${calendar.name}`);
        } catch (error) {
          console.error(`Failed to sync calendar ${calendar.name}:`, error);
        }
      }
      
      console.log('Refresh completed');
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getMotivationalMessage = (percentage: number, completedTasks: number, totalTasks: number, totalTasksForWeek: number) => {
    const remaining = totalTasks - completedTasks;
    const remainingForWeek = totalTasksForWeek - completedTasks;
    
    if (percentage >= 80) {
      return `Perfekt! Du har klaret alle opgaver indtil nu! 🚀\n${remainingForWeek} opgaver tilbage for ugen.`;
    } else if (percentage >= 60) {
      return `Godt gået! ${remaining} opgaver tilbage indtil i dag.\n${remainingForWeek} opgaver tilbage for ugen. 💪`;
    } else if (percentage >= 40) {
      return `Kom igen! ${remaining} opgaver tilbage indtil i dag.\n${remainingForWeek} opgaver tilbage for ugen. 🔥`;
    } else {
      return `Husk at holde fokus! ${remaining} opgaver tilbage indtil i dag.\n${remainingForWeek} opgaver tilbage for ugen. ⚽`;
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return colors.success;
    if (percentage >= 60) return '#FFC107';
    if (percentage >= 40) return '#FF9800';
    return '#F44336';
  };

  const getTrophyEmoji = (percentage: number) => {
    if (percentage >= 80) return '🥇';
    if (percentage >= 60) return '🥈';
    return '🥉';
  };

  const formatDate = (date: Date) => {
    const days = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
    const months = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
    
    return `${days[date.getDay()]} ${date.getDate()}. ${months[date.getMonth()]}`;
  };

  const formatTime = (time: string) => {
    // Extract just HH:MM from the time string (removing seconds if present)
    return time.substring(0, 5);
  };

  const formatDateTime = (date: Date, time: string) => {
    return `${formatDate(date)} kl. ${formatTime(time)}`;
  };

  const handleActivityPress = (activityId: string) => {
    console.log('Opening activity details for:', activityId);
    router.push(`/activity-details?id=${activityId}`);
  };

  const handleTaskPress = (task: Task, activityId: string, activityTitle: string) => {
    console.log('Opening task modal for:', task.title);
    setSelectedTask({ task, activityId, activityTitle });
    setIsTaskModalVisible(true);
  };

  const handleToggleTaskCompletion = async () => {
    if (!selectedTask) return;
    
    try {
      await toggleTaskCompletion(selectedTask.activityId, selectedTask.task.id);
      setIsTaskModalVisible(false);
      setSelectedTask(null);
    } catch (error) {
      console.error('Error toggling task completion:', error);
    }
  };

  const handleCreateActivity = async (activityData: ActivityCreationData) => {
    try {
      await createActivity(activityData);
    } catch (error) {
      console.error('Error creating activity:', error);
      throw error;
    }
  };

  const getUpcomingActivitiesByWeek = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const upcoming = activities.filter(activity => {
      const activityDate = new Date(activity.date);
      activityDate.setHours(0, 0, 0, 0);
      return activityDate >= now;
    });
    
    const grouped: { [key: string]: { activities: Activity[], dateRange: string } } = {};
    
    upcoming.forEach(activity => {
      const activityDate = new Date(activity.date);
      const weekNumber = getWeek(activityDate);
      const year = activityDate.getFullYear();
      const key = `${year}-W${weekNumber}`;
      
      if (!grouped[key]) {
        grouped[key] = { activities: [], dateRange: '' };
      }
      grouped[key].activities.push(activity);
    });

    Object.keys(grouped).forEach(key => {
      const weekActivities = grouped[key].activities;
      if (weekActivities.length > 0) {
        const firstDate = new Date(weekActivities[0].date);
        const lastDate = new Date(weekActivities[weekActivities.length - 1].date);
        grouped[key].dateRange = `${firstDate.getDate()}/${firstDate.getMonth() + 1} - ${lastDate.getDate()}/${lastDate.getMonth() + 1}`;
      }
    });

    return grouped;
  };

  const upcomingByWeek = getUpcomingActivitiesByWeek();

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const currentWeek = getWeek(new Date());
  const currentYear = new Date().getFullYear();

  return (
    <React.Fragment>
      <ScrollView 
        style={[styles.container, { backgroundColor: bgColor }]} 
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View style={[styles.headerCard, { backgroundColor: colors.primary }]}>
            <Text style={styles.headerTitle}>Min fodboldapp ⚽</Text>
            <Text style={styles.headerSubtitle}>Hold styr på alt!</Text>
          </View>
        </View>

        {/* Create Activity Button for Admins */}
        {isAdmin && (
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: colors.secondary }]}
            onPress={() => setIsCreateModalVisible(true)}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add_circle" size={24} color="#fff" />
            <Text style={styles.createButtonText}>Opret aktivitet</Text>
          </TouchableOpacity>
        )}

        <View style={[styles.statsCard, { backgroundColor: getProgressColor(currentWeekStats.percentage) }]}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsTitle}>🏆 Denne uge</Text>
            <Text style={styles.trophyEmoji}>{getTrophyEmoji(currentWeekStats.percentage)}</Text>
          </View>
          
          <Text style={styles.percentage}>{currentWeekStats.percentage}%</Text>
          <Text style={styles.taskCount}>
            Opgaver indtil i dag: {currentWeekStats.completedTasks} / {currentWeekStats.totalTasks}
          </Text>
          
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${currentWeekStats.percentage}%` }]} />
          </View>
          
          <Text style={styles.weekStats}>
            Hele ugen: {currentWeekStats.completedTasksForWeek} / {currentWeekStats.totalTasksForWeek} opgaver
          </Text>
          
          <View style={styles.progressBarContainer}>
            <View style={[
              styles.progressBar, 
              { 
                width: `${currentWeekStats.totalTasksForWeek > 0 
                  ? Math.round((currentWeekStats.completedTasksForWeek / currentWeekStats.totalTasksForWeek) * 100) 
                  : 0}%`,
                opacity: 0.6
              }
            ]} />
          </View>
          
          <Text style={styles.motivationText}>
            {getMotivationalMessage(
              currentWeekStats.percentage, 
              currentWeekStats.completedTasks, 
              currentWeekStats.totalTasks,
              currentWeekStats.totalTasksForWeek
            )}
          </Text>
          
          <TouchableOpacity style={styles.historyButton}>
            <Text style={styles.historyButtonText}>Se din historik</Text>
            <IconSymbol ios_icon_name="chart.line.uptrend.xyaxis" android_material_icon_name="assessment" size={20} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>I dag</Text>
          
          {todayActivities.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
              <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen aktiviteter i dag</Text>
            </View>
          ) : (
            <React.Fragment>
              {todayActivities.map((activity, index) => (
                <TouchableOpacity
                  key={index}
                  style={[styles.activityCard, { backgroundColor: activity.category.color }]}
                  onPress={() => handleActivityPress(activity.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.activityHeader}>
                    <Text style={styles.activityEmoji}>{activity.category.emoji}</Text>
                    <View style={styles.activityInfo}>
                      <Text style={styles.activityTitle}>{activity.title}</Text>
                      <Text style={styles.activityTime}>
                        {formatDateTime(new Date(activity.date), activity.time)}
                      </Text>
                      <View style={styles.locationRow}>
                        <IconSymbol ios_icon_name="mappin.circle.fill" android_material_icon_name="location_on" size={16} color="#fff" />
                        <Text style={styles.activityLocation}>{activity.location}</Text>
                      </View>
                    </View>
                  </View>

                  {activity.tasks.length > 0 && (
                    <View style={styles.tasksSection}>
                      <Text style={styles.tasksTitle}>Opgaver:</Text>
                      {activity.tasks.map((task, taskIndex) => (
                        <TouchableOpacity
                          key={taskIndex}
                          style={styles.taskItem}
                          onPress={(e) => {
                            e.stopPropagation();
                            handleTaskPress(task, activity.id, activity.title);
                          }}
                        >
                          <View style={[styles.checkbox, task.completed && styles.checkboxChecked]}>
                            {task.completed && (
                              <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
                            )}
                          </View>
                          <Text style={[styles.taskText, task.completed && styles.taskTextCompleted]}>
                            {task.title}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </React.Fragment>
          )}
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Kommende aktiviteter</Text>
          
          {Object.keys(upcomingByWeek).length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
              <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen kommende aktiviteter</Text>
            </View>
          ) : (
            <React.Fragment>
              {Object.entries(upcomingByWeek).map(([weekKey, data], weekIndex) => {
                const weekNumber = weekKey.split('-W')[1];
                return (
                  <View key={weekIndex} style={styles.weekSection}>
                    <Text style={[styles.weekTitle, { color: textColor }]}>
                      Uge {weekNumber}
                    </Text>
                    <Text style={[styles.weekDates, { color: textSecondaryColor }]}>
                      {data.dateRange}
                    </Text>
                    
                    {data.activities.map((activity, activityIndex) => (
                      <TouchableOpacity
                        key={activityIndex}
                        style={[styles.upcomingActivityCard, { backgroundColor: activity.category.color }]}
                        onPress={() => handleActivityPress(activity.id)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.upcomingActivityHeader}>
                          <Text style={styles.upcomingActivityEmoji}>{activity.category.emoji}</Text>
                          <View style={styles.upcomingActivityInfo}>
                            <Text style={styles.upcomingActivityTitle}>{activity.title}</Text>
                            <Text style={styles.upcomingActivityTime}>
                              {new Date(activity.date).toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' })} kl. {formatTime(activity.time)}
                            </Text>
                            <View style={styles.locationRow}>
                              <IconSymbol ios_icon_name="mappin.circle.fill" android_material_icon_name="location_on" size={14} color="#fff" />
                              <Text style={styles.upcomingActivityLocation}>{activity.location}</Text>
                            </View>
                          </View>
                        </View>
                        
                        {activity.tasks.length > 0 && (
                          <View style={styles.upcomingTasksPreview}>
                            <Text style={styles.upcomingTasksText}>
                              {activity.tasks.filter(t => t.completed).length} / {activity.tasks.length} opgaver udført
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })}
            </React.Fragment>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Task Modal */}
      <Modal
        visible={isTaskModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsTaskModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Opgave</Text>
              <TouchableOpacity onPress={() => setIsTaskModalVisible(false)} activeOpacity={0.7}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={32} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            {selectedTask && (
              <View style={styles.modalBody}>
                <Text style={[styles.taskModalActivity, { color: textSecondaryColor }]}>
                  {selectedTask.activityTitle}
                </Text>
                
                <Text style={[styles.taskModalTitle, { color: textColor }]}>
                  {selectedTask.task.title}
                </Text>
                
                {selectedTask.task.description && (
                  <Text style={[styles.taskModalDescription, { color: textSecondaryColor }]}>
                    {selectedTask.task.description}
                  </Text>
                )}

                <TouchableOpacity
                  style={[
                    styles.completeButton,
                    { backgroundColor: selectedTask.task.completed ? colors.highlight : colors.success }
                  ]}
                  onPress={handleToggleTaskCompletion}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name={selectedTask.task.completed ? "arrow.uturn.backward" : "checkmark.circle.fill"}
                    android_material_icon_name={selectedTask.task.completed ? "undo" : "check_circle"}
                    size={24}
                    color="#fff"
                  />
                  <Text style={styles.completeButtonText}>
                    {selectedTask.task.completed ? 'Marker som ikke udført' : 'Marker som udført'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Create Activity Modal */}
      <CreateActivityModal
        visible={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        onCreateActivity={handleCreateActivity}
        categories={categories}
      />
    </React.Fragment>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 20,
  },
  headerCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 16,
    marginBottom: 20,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  statsCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  trophyEmoji: {
    fontSize: 32,
  },
  percentage: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  taskCount: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 16,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  weekStats: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 8,
  },
  motivationText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 16,
    lineHeight: 22,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  historyButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  activityCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  activityHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  activityEmoji: {
    fontSize: 40,
    marginRight: 16,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  activityTime: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 4,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityLocation: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  tasksSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
    paddingTop: 16,
  },
  tasksTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#fff',
  },
  taskText: {
    fontSize: 15,
    color: '#fff',
    flex: 1,
  },
  taskTextCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
  weekSection: {
    marginBottom: 20,
  },
  weekTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  weekDates: {
    fontSize: 14,
    marginBottom: 12,
  },
  upcomingActivityCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  upcomingActivityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  upcomingActivityEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  upcomingActivityInfo: {
    flex: 1,
  },
  upcomingActivityTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  upcomingActivityTime: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 2,
  },
  upcomingActivityLocation: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.9,
  },
  upcomingTasksPreview: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
  },
  upcomingTasksText: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 24,
  },
  taskModalActivity: {
    fontSize: 14,
    marginBottom: 8,
  },
  taskModalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  taskModalDescription: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 24,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 14,
  },
  completeButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
});
