
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useColorScheme, Modal, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFootball } from '@/contexts/FootballContext';
import { colors, getColors } from '@/styles/commonStyles';
import { Activity, Task } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import { getWeek, subWeeks, startOfWeek } from 'date-fns';
import CreateActivityModal, { ActivityCreationData } from '@/components/CreateActivityModal';
import { supabase } from '@/app/integrations/supabase/client';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import ContextConfirmationDialog from '@/components/ContextConfirmationDialog';

export default function HomeScreen() {
  const router = useRouter();
  const { currentWeekStats, todayActivities, activities, categories, toggleTaskCompletion, createActivity, externalCalendars, fetchExternalCalendarEvents } = useFootball();
  const { selectedContext } = useTeamPlayer();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getColors(colorScheme);

  const [selectedTask, setSelectedTask] = useState<{ task: Task; activityId: string; activityTitle: string } | null>(null);
  const [isTaskModalVisible, setIsTaskModalVisible] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [weeksToLoad, setWeeksToLoad] = useState(0);
  
  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'create' | 'complete';
    data?: any;
  } | null>(null);

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
          setIsAdmin(data.role === 'admin' || data.role === 'trainer');
        }
      }
    };
    checkAdminStatus();
  }, []);

  const onRefresh = async () => {
    console.log('');
    console.log('🔄 ========== PULL TO REFRESH STARTED ==========');
    console.log('⏰ Timestamp:', new Date().toISOString());
    console.log('📱 Platform: iOS');
    setRefreshing(true);
    
    setWeeksToLoad(0);
    
    try {
      console.log('⏳ Waiting 2 seconds for pending database writes to complete...');
      console.log('   This ensures manual category changes are fully persisted');
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('✅ Wait complete - proceeding with sync');
      
      const enabledCalendars = externalCalendars.filter(cal => cal.enabled);
      console.log(`📅 Found ${enabledCalendars.length} enabled calendars to sync`);
      
      for (const calendar of enabledCalendars) {
        try {
          console.log(`🔄 Syncing calendar: "${calendar.name}"`);
          await fetchExternalCalendarEvents(calendar);
          console.log(`✅ Successfully synced calendar: "${calendar.name}"`);
        } catch (error) {
          console.error(`❌ Failed to sync calendar "${calendar.name}":`, error);
        }
      }
      
      console.log('✅ ========== PULL TO REFRESH COMPLETED ==========');
      console.log('');
    } catch (error) {
      console.error('❌ Error during refresh:', error);
      console.log('');
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
    return time.substring(0, 5);
  };

  const formatDateTime = (date: Date, time: string) => {
    return `${formatDate(date)} kl. ${formatTime(time)}`;
  };

  const isActivityCompleted = (activity: Activity) => {
    const now = new Date();
    const activityDate = new Date(activity.date);
    
    const [hours, minutes] = activity.time.split(':').map(Number);
    activityDate.setHours(hours, minutes, 0, 0);
    
    return activityDate < now;
  };

  const handleActivityPress = (activityId: string) => {
    console.log('Opening activity details for:', activityId);
    router.push(`/activity-details?id=${activityId}`);
  };

  // PERFORMANCE FIX: Use useCallback to prevent re-creating this function on every render
  const handleTaskPress = useCallback((task: Task, activityId: string, activityTitle: string) => {
    console.log('⚡ FAST: Opening task modal for:', task.title);
    setSelectedTask({ task, activityId, activityTitle });
    setIsTaskModalVisible(true);
  }, []);

  // PERFORMANCE FIX: Use useCallback and optimistic update for instant UI feedback
  const handleToggleTaskCompletion = useCallback(async () => {
    if (!selectedTask) return;
    
    console.log('⚡ FAST: Toggling task completion with optimistic update');
    
    // Check if we need confirmation (trainer/admin managing player/team data)
    if (isAdmin && selectedContext.type) {
      setIsTaskModalVisible(false);
      setPendingAction({
        type: 'complete',
        data: { activityId: selectedTask.activityId, taskId: selectedTask.task.id },
      });
      setShowConfirmDialog(true);
      setTimeout(() => {
        setSelectedTask(null);
      }, 300);
      return;
    }
    
    // Close modal immediately for instant feedback
    setIsTaskModalVisible(false);
    
    // Update task in background
    try {
      await toggleTaskCompletion(selectedTask.activityId, selectedTask.task.id);
      console.log('✅ Task completion toggled successfully');
    } catch (error) {
      console.error('❌ Error toggling task completion:', error);
    } finally {
      // Clear selected task after a short delay to allow modal animation to complete
      setTimeout(() => {
        setSelectedTask(null);
      }, 300);
    }
  }, [selectedTask, toggleTaskCompletion, isAdmin, selectedContext]);

  const handleConfirmAction = async () => {
    setShowConfirmDialog(false);
    
    if (!pendingAction) return;
    
    try {
      if (pendingAction.type === 'create') {
        await createActivity(pendingAction.data);
        setIsCreateModalVisible(false);
      } else if (pendingAction.type === 'complete') {
        const { activityId, taskId } = pendingAction.data;
        await toggleTaskCompletion(activityId, taskId);
      }
    } catch (error) {
      console.error('Error executing action:', error);
    } finally {
      setPendingAction(null);
    }
  };

  const handleCancelAction = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  const handleCreateActivity = async (activityData: ActivityCreationData) => {
    // Check if we need confirmation (trainer/admin managing player/team data)
    if (isAdmin && selectedContext.type) {
      setPendingAction({
        type: 'create',
        data: activityData,
      });
      setShowConfirmDialog(true);
      return;
    }
    
    try {
      await createActivity(activityData);
      setIsCreateModalVisible(false);
    } catch (error) {
      console.error('Error creating activity:', error);
      throw error;
    }
  };

  const handleLoadPreviousWeek = () => {
    console.log('Loading previous week, current weeksToLoad:', weeksToLoad);
    setWeeksToLoad(prev => prev + 1);
  };

  const getUpcomingActivitiesByWeek = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const loadFromWeekStart = subWeeks(currentWeekStart, weeksToLoad);
    
    const upcoming = activities.filter(activity => {
      const activityDate = new Date(activity.date);
      activityDate.setHours(0, 0, 0, 0);
      return activityDate >= loadFromWeekStart;
    });
    
    const grouped: { [key: string]: { activities: Activity[], dateRange: string, sortDate: Date } } = {};
    
    upcoming.forEach(activity => {
      const activityDate = new Date(activity.date);
      const weekNumber = getWeek(activityDate, { weekStartsOn: 1 });
      const year = activityDate.getFullYear();
      const key = `${year}-W${weekNumber}`;
      
      if (!grouped[key]) {
        grouped[key] = { activities: [], dateRange: '', sortDate: activityDate };
      }
      grouped[key].activities.push(activity);
      
      if (activityDate < grouped[key].sortDate) {
        grouped[key].sortDate = activityDate;
      }
    });

    Object.keys(grouped).forEach(key => {
      const weekActivities = grouped[key].activities;
      if (weekActivities.length > 0) {
        // Sort by date AND time
        weekActivities.sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          
          // Parse time strings (format: "HH:MM" or "HH:MM:SS")
          const [hoursA, minutesA] = a.time.split(':').map(Number);
          const [hoursB, minutesB] = b.time.split(':').map(Number);
          
          // Set the time on the date objects
          dateA.setHours(hoursA, minutesA, 0, 0);
          dateB.setHours(hoursB, minutesB, 0, 0);
          
          // Compare the full date+time
          return dateA.getTime() - dateB.getTime();
        });
        
        const firstDate = new Date(weekActivities[0].date);
        const lastDate = new Date(weekActivities[weekActivities.length - 1].date);
        grouped[key].dateRange = `${firstDate.getDate()}/${firstDate.getMonth() + 1} - ${lastDate.getDate()}/${lastDate.getMonth() + 1}`;
      }
    });

    return grouped;
  };

  const upcomingByWeek = getUpcomingActivitiesByWeek();
  
  const sortedWeeks = Object.entries(upcomingByWeek).sort((a, b) => {
    return a[1].sortDate.getTime() - b[1].sortDate.getTime();
  });

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const currentWeek = getWeek(new Date());
  const currentYear = new Date().getFullYear();

  // Determine if we're in context management mode
  const isManagingContext = isAdmin && selectedContext.type;
  const containerBgColor = isManagingContext ? themeColors.contextWarning : bgColor;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView 
        style={[styles.container, { backgroundColor: containerBgColor }]} 
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

        {/* Enhanced Context Banner for Trainers/Admins */}
        {isManagingContext && (
          <View style={[styles.contextBanner, { backgroundColor: '#D4A574' }]}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={28}
              color="#fff"
            />
            <View style={styles.contextBannerText}>
              <Text style={styles.contextBannerTitle}>
                ⚠️ DU ADMINISTRERER DATA FOR {selectedContext.type === 'player' ? 'SPILLER' : 'TEAM'}
              </Text>
              <Text style={styles.contextBannerSubtitle}>
                {selectedContext.name}
              </Text>
              <Text style={styles.contextBannerInfo}>
                Alle ændringer påvirker denne {selectedContext.type === 'player' ? 'spillers' : 'teams'} data
              </Text>
            </View>
          </View>
        )}

        {/* Create Activity Button - Now available for ALL users */}
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.secondary }]}
          onPress={() => setIsCreateModalVisible(true)}
          activeOpacity={0.7}
        >
          <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add_circle" size={24} color="#fff" />
          <Text style={styles.createButtonText}>Opret aktivitet</Text>
        </TouchableOpacity>

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
            todayActivities.map((activity) => (
              <TouchableOpacity
                key={activity.id}
                style={[styles.activityCard, { backgroundColor: activity.category.color }]}
                onPress={() => handleActivityPress(activity.id)}
                activeOpacity={0.7}
              >
                <View style={styles.activityHeader}>
                  <Text style={styles.activityEmoji}>{activity.category.emoji}</Text>
                  <View style={styles.activityInfo}>
                    <View style={styles.activityTitleRow}>
                      <Text style={styles.activityTitle}>{activity.title}</Text>
                      {activity.isExternal && (
                        <View style={styles.externalBadge}>
                          <IconSymbol 
                            ios_icon_name="calendar.badge.clock" 
                            android_material_icon_name="event" 
                            size={14} 
                            color="#fff" 
                          />
                        </View>
                      )}
                    </View>
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
                    {activity.tasks.map((task) => (
                      <TouchableOpacity
                        key={task.id}
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
                        <View style={styles.taskContent}>
                          <Text style={[styles.taskText, task.completed && styles.taskTextCompleted]}>
                            {task.title}
                          </Text>
                          {task.reminder && (
                            <View style={styles.reminderBadgeSmall}>
                              <IconSymbol ios_icon_name="bell.fill" android_material_icon_name="notifications" size={12} color="#fff" />
                              <Text style={styles.reminderTextSmall}>{task.reminder} min</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.upcomingHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Kommende aktiviteter</Text>
            <TouchableOpacity
              style={styles.loadPreviousButton}
              onPress={handleLoadPreviousWeek}
              activeOpacity={0.6}
            >
              <IconSymbol 
                ios_icon_name="chevron.up" 
                android_material_icon_name="expand_less" 
                size={16} 
                color={textSecondaryColor} 
              />
              <Text style={[styles.loadPreviousText, { color: textSecondaryColor }]}>
                Tidligere
              </Text>
            </TouchableOpacity>
          </View>
          
          {sortedWeeks.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
              <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen kommende aktiviteter</Text>
            </View>
          ) : (
            <React.Fragment>
              {sortedWeeks.map(([weekKey, data]) => {
                const weekNumber = weekKey.split('-W')[1];
                return (
                  <View key={weekKey} style={styles.weekSection}>
                    <Text style={[styles.weekTitle, { color: textColor }]}>
                      Uge {weekNumber}
                    </Text>
                    <Text style={[styles.weekDates, { color: textSecondaryColor }]}>
                      {data.dateRange}
                    </Text>
                    
                    {data.activities.map((activity) => {
                      const isCompleted = isActivityCompleted(activity);
                      
                      return (
                        <TouchableOpacity
                          key={activity.id}
                          style={[styles.upcomingActivityCard, { backgroundColor: activity.category.color }]}
                          onPress={() => handleActivityPress(activity.id)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.upcomingActivityHeader}>
                            <Text style={styles.upcomingActivityEmoji}>{activity.category.emoji}</Text>
                            <View style={styles.upcomingActivityInfo}>
                              <View style={styles.activityTitleRow}>
                                <Text style={styles.upcomingActivityTitle}>{activity.title}</Text>
                                {activity.isExternal && (
                                  <View style={styles.externalBadgeSmall}>
                                    <IconSymbol 
                                      ios_icon_name="calendar.badge.clock" 
                                      android_material_icon_name="event" 
                                      size={12} 
                                      color="#fff" 
                                    />
                                  </View>
                                )}
                                {isCompleted && (
                                  <View style={styles.completedBadge}>
                                    <IconSymbol 
                                      ios_icon_name="checkmark.circle.fill" 
                                      android_material_icon_name="check_circle" 
                                      size={16} 
                                      color="#fff" 
                                    />
                                  </View>
                                )}
                              </View>
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
                      );
                    })}
                  </View>
                );
              })}
            </React.Fragment>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* PERFORMANCE FIX: Simplified modal with minimal re-renders */}
      {isTaskModalVisible && selectedTask && (
        <Modal
          visible={true}
          animationType="slide"
          transparent={true}
          onRequestClose={() => {
            setIsTaskModalVisible(false);
            setTimeout(() => setSelectedTask(null), 300);
          }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: textColor }]}>Opgave</Text>
                <TouchableOpacity 
                  onPress={() => {
                    setIsTaskModalVisible(false);
                    setTimeout(() => setSelectedTask(null), 300);
                  }} 
                  activeOpacity={0.7}
                >
                  <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={32} color={textSecondaryColor} />
                </TouchableOpacity>
              </View>

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
            </View>
          </View>
        </Modal>
      )}

      <CreateActivityModal
        visible={isCreateModalVisible}
        onClose={() => setIsCreateModalVisible(false)}
        onCreateActivity={handleCreateActivity}
        categories={categories}
      />

      <ContextConfirmationDialog
        visible={showConfirmDialog}
        contextType={selectedContext.type}
        contextName={selectedContext.name}
        actionType={pendingAction?.type === 'create' ? 'create' : 'complete'}
        itemType={pendingAction?.type === 'create' ? 'activity' : 'task'}
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
      />
    </View>
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
  upcomingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  loadPreviousButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  loadPreviousText: {
    fontSize: 14,
    fontWeight: '500',
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
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  activityTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
  },
  externalBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    padding: 4,
  },
  externalBadgeSmall: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 10,
    padding: 3,
  },
  completedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 12,
    padding: 2,
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
  taskContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  reminderBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reminderTextSmall: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '600',
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
    flex: 1,
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
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 20,
    marginBottom: 20,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#B8860B',
  },
  contextBannerText: {
    flex: 1,
  },
  contextBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  contextBannerSubtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  contextBannerInfo: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.95,
    fontStyle: 'italic',
  },
});
