
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { useFootball } from '@/contexts/FootballContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { colors, getColors } from '@/styles/commonStyles';
import { Activity } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import { getWeek, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { requestNotificationPermissions } from '@/utils/notificationService';
import CreateActivityModal, { ActivityCreationData } from '@/components/CreateActivityModal';
import ContextConfirmationDialog from '@/components/ContextConfirmationDialog';
import { supabase } from '@/app/integrations/supabase/client';

export default function HomeScreen() {
  const { currentWeekStats, todayActivities, activities, categories, toggleTaskCompletion, createActivity, externalCalendars, fetchExternalCalendarEvents } = useFootball();
  const { selectedContext } = useTeamPlayer();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const themeColors = getColors(colorScheme);
  const [refreshing, setRefreshing] = useState(false);
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
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

  useEffect(() => {
    requestNotificationPermissions().then(granted => {
      if (granted) {
        console.log('Notification permissions granted');
      } else {
        console.log('Notification permissions denied');
      }
    });
  }, []);

  const onRefresh = async () => {
    console.log('Pull to refresh triggered on home screen');
    setRefreshing(true);
    
    setWeeksToLoad(0);
    
    try {
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

  const getMotivationalMessage = (percentage: number) => {
    if (percentage >= 80) {
      return 'Du er godt på vej! Fortsæt det gode arbejde! 🚀';
    } else if (percentage >= 60) {
      return 'Godt gået! Du er på rette spor! 💪';
    } else if (percentage >= 40) {
      return 'Kom igen! Du kan gøre det bedre! 🔥';
    } else {
      return 'Husk at holde fokus! Hver lille indsats tæller! ⚽';
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

  const getActivitiesByWeek = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const loadFromWeekStart = subWeeks(currentWeekStart, weeksToLoad);
    
    const relevantActivities = activities.filter(activity => {
      const activityDate = new Date(activity.date);
      activityDate.setHours(0, 0, 0, 0);
      return activityDate >= loadFromWeekStart;
    });
    
    const grouped: { [key: string]: { activities: Activity[], dateRange: string, sortDate: Date } } = {};
    
    relevantActivities.forEach(activity => {
      const activityDate = new Date(activity.date);
      const weekNumber = getWeek(activityDate, { weekStartsOn: 1 });
      const year = activityDate.getFullYear();
      const key = `Uge ${weekNumber}`;
      
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
        weekActivities.sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          
          const timePartsA = a.time.split(':');
          const timePartsB = b.time.split(':');
          
          const hoursA = parseInt(timePartsA[0], 10);
          const minutesA = parseInt(timePartsA[1], 10);
          const hoursB = parseInt(timePartsB[0], 10);
          const minutesB = parseInt(timePartsB[1], 10);
          
          const timestampA = new Date(dateA.getFullYear(), dateA.getMonth(), dateA.getDate(), hoursA, minutesA, 0, 0);
          const timestampB = new Date(dateB.getFullYear(), dateB.getMonth(), dateB.getDate(), hoursB, minutesB, 0, 0);
          
          return timestampA.getTime() - timestampB.getTime();
        });
        
        const firstDate = new Date(weekActivities[0].date);
        const lastDate = new Date(weekActivities[weekActivities.length - 1].date);
        grouped[key].dateRange = `${firstDate.getDate()}/${firstDate.getMonth() + 1} - ${lastDate.getDate()}/${lastDate.getMonth() + 1}`;
      }
    });

    return grouped;
  };

  const handleActivityPress = (activityId: string) => {
    console.log('⚡ FAST: Opening activity details for:', activityId);
    router.push(`/activity-details?id=${activityId}`);
  };

  const handleTaskToggle = async (activityId: string, taskId: string, e: any) => {
    // CRITICAL: Stop event propagation to prevent opening activity details
    e.stopPropagation();
    
    console.log('⚡ INSTANT: Toggling task completion');
    
    // Check if we need confirmation (trainer/admin managing player/team data)
    if (isAdmin && selectedContext.type) {
      setPendingAction({
        type: 'complete',
        data: { activityId, taskId },
      });
      setShowConfirmDialog(true);
      return;
    }
    
    // Call toggle immediately - optimistic update happens inside
    try {
      await toggleTaskCompletion(activityId, taskId);
    } catch (error) {
      console.error('Error toggling task:', error);
    }
  };

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

  const handleHistoryPress = () => {
    console.log('Navigating to performance page');
    router.push('/(tabs)/performance');
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

  const activitiesByWeek = getActivitiesByWeek();
  
  const sortedWeeks = Object.entries(activitiesByWeek).sort((a, b) => {
    return a[1].sortDate.getTime() - b[1].sortDate.getTime();
  });

  // Determine if we're in context management mode
  const isManagingContext = isAdmin && selectedContext.type;
  const containerBgColor = isManagingContext ? themeColors.contextWarning : themeColors.background;

  return (
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
          <Text style={styles.headerTitle}>Football coach ⚽</Text>
          <Text style={styles.headerSubtitle}>Nå dine mål med målrettet træning</Text>
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
          {currentWeekStats.completedTasks} / {currentWeekStats.totalTasks} opgaver
        </Text>
        
        <View style={styles.progressBarContainer}>
          <View style={[styles.progressBar, { width: `${currentWeekStats.percentage}%` }]} />
        </View>
        
        <Text style={styles.motivationText}>{getMotivationalMessage(currentWeekStats.percentage)}</Text>
        
        <TouchableOpacity 
          style={styles.historyButton}
          onPress={handleHistoryPress}
          activeOpacity={0.7}
        >
          <Text style={styles.historyButtonText}>Se din historik</Text>
          <IconSymbol ios_icon_name="chart.bar.fill" android_material_icon_name="assessment" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: themeColors.text }]}>I dag</Text>
        
        {todayActivities.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: themeColors.card }]}>
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>Ingen aktiviteter i dag</Text>
          </View>
        ) : (
          todayActivities.map((activity) => (
            <TouchableOpacity
              key={activity.id}
              style={[styles.activityCard, { backgroundColor: activity.category.color }]}
              onPress={() => handleActivityPress(activity.id)}
              activeOpacity={0.8}
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
                <IconSymbol 
                  ios_icon_name="chevron.right" 
                  android_material_icon_name="chevron_right" 
                  size={24} 
                  color="rgba(255,255,255,0.7)" 
                />
              </View>

              {activity.tasks.length > 0 && (
                <View style={styles.tasksSection}>
                  <Text style={styles.tasksTitle}>Opgaver:</Text>
                  {activity.tasks.map((task) => (
                    <TouchableOpacity
                      key={task.id}
                      style={styles.taskItem}
                      onPress={(e) => handleTaskToggle(activity.id, task.id, e)}
                      activeOpacity={0.6}
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
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>Kommende aktiviteter</Text>
          <TouchableOpacity
            style={styles.loadPreviousButton}
            onPress={handleLoadPreviousWeek}
            activeOpacity={0.6}
          >
            <IconSymbol 
              ios_icon_name="chevron.up" 
              android_material_icon_name="expand_less" 
              size={16} 
              color={themeColors.textSecondary} 
            />
            <Text style={[styles.loadPreviousText, { color: themeColors.textSecondary }]}>
              Tidligere
            </Text>
          </TouchableOpacity>
        </View>
        
        {sortedWeeks.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: themeColors.card }]}>
            <Text style={[styles.emptyText, { color: themeColors.textSecondary }]}>Ingen kommende aktiviteter</Text>
          </View>
        ) : (
          <React.Fragment>
            {sortedWeeks.map(([week, data], weekIndex) => (
              <View key={`week-${week}-${weekIndex}`} style={styles.weekSection}>
                <Text style={[styles.weekTitle, { color: themeColors.text }]}>
                  {week}
                </Text>
                <Text style={[styles.weekDates, { color: themeColors.textSecondary }]}>
                  {data.dateRange}
                </Text>
                
                {data.activities.map((activity) => {
                  const isCompleted = isActivityCompleted(activity);
                  
                  return (
                    <TouchableOpacity
                      key={activity.id}
                      style={[styles.upcomingActivityCard, { backgroundColor: activity.category.color }]}
                      onPress={() => handleActivityPress(activity.id)}
                      activeOpacity={0.8}
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
                        <IconSymbol 
                          ios_icon_name="chevron.right" 
                          android_material_icon_name="chevron_right" 
                          size={20} 
                          color="rgba(255,255,255,0.7)" 
                        />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </React.Fragment>
        )}
      </View>

      <View style={{ height: 120 }} />

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
    </ScrollView>
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
    marginBottom: 16,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  motivationText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    marginBottom: 16,
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
