
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useColorScheme, Modal, RefreshControl, Dimensions, ActivityIndicator } from 'react-native';
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
import { LinearGradient } from 'expo-linear-gradient';
import { TaskDescriptionRenderer } from '@/components/TaskDescriptionRenderer';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Wrapper component to handle context errors gracefully
function HomeScreenContent() {
  const router = useRouter();
  const footballContext = useFootball();
  const { currentWeekStats, todayActivities, activities, categories, toggleTaskCompletion, createActivity, externalCalendars, fetchExternalCalendarEvents } = footballContext;
  const { selectedContext } = useTeamPlayer();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getColors(colorScheme);
  const insets = useSafeAreaInsets();

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

  // Check admin status only once on mount
  useEffect(() => {
    let mounted = true;

    const checkAdminStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && mounted) {
          const { data, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .single();

          if (!error && data && mounted) {
            setIsAdmin(data.role === 'admin' || data.role === 'trainer');
          }
        }
      } catch (error) {
        console.error('Error checking admin status:', error);
      }
    };
    
    checkAdminStatus();

    return () => {
      mounted = false;
    };
  }, []); // Empty dependency array - only run once

  const onRefresh = useCallback(async () => {
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
  }, [externalCalendars, fetchExternalCalendarEvents]);

  const getMotivationalMessage = useCallback((percentage: number, completedTasks: number, totalTasks: number, totalTasksForWeek: number) => {
    const remaining = totalTasks - completedTasks;
    const remainingForWeek = totalTasksForWeek - completedTasks;
    
    if (percentage >= 80) {
      return `Fremragende! Du har klaret alle opgaver indtil nu! 🚀\n${remainingForWeek} opgaver tilbage for ugen.`;
    } else if (percentage >= 60) {
      return `Stærk indsats! ${remaining} opgaver tilbage indtil i dag.\n${remainingForWeek} opgaver tilbage for ugen. 💪`;
    } else if (percentage >= 40) {
      return `Fortsæt! ${remaining} opgaver tilbage indtil i dag.\n${remainingForWeek} opgaver tilbage for ugen. 🔥`;
    } else {
      return `Hver træning tæller! ${remaining} opgaver tilbage indtil i dag.\n${remainingForWeek} opgaver tilbage for ugen. ⚽`;
    }
  }, []);

  const getProgressColor = useCallback((percentage: number) => {
    if (percentage >= 80) return colors.success;
    if (percentage >= 60) return '#FFC107';
    if (percentage >= 40) return '#FF9800';
    return '#F44336';
  }, []);

  const getTrophyEmoji = useCallback((percentage: number) => {
    if (percentage >= 80) return '🥇';
    if (percentage >= 60) return '🥈';
    return '🥉';
  }, []);

  const formatDate = useCallback((date: Date) => {
    const days = ['søndag', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag'];
    const months = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
    
    return `${days[date.getDay()]} ${date.getDate()}. ${months[date.getMonth()]}`;
  }, []);

  const formatTime = useCallback((time: string) => {
    return time.substring(0, 5);
  }, []);

  const formatDateTime = useCallback((date: Date, time: string) => {
    return `${formatDate(date)} kl. ${formatTime(time)}`;
  }, [formatDate, formatTime]);

  const isActivityCompleted = useCallback((activity: Activity) => {
    const now = new Date();
    const activityDate = new Date(activity.date);
    
    const [hours, minutes] = activity.time.split(':').map(Number);
    activityDate.setHours(hours, minutes, 0, 0);
    
    return activityDate < now;
  }, []);

  const handleActivityPress = useCallback((activityId: string) => {
    console.log('Opening activity details for:', activityId);
    router.push(`/activity-details?id=${activityId}`);
  }, [router]);

  const handleTaskPress = useCallback((task: Task, activityId: string, activityTitle: string) => {
    console.log('⚡ Task clicked:', task.title);
    console.log('⚡ Opening task modal for:', task.title);
    
    if (task.videoUrl) {
      console.log('📹 Task has video URL:', task.videoUrl);
    }
    if (task.description) {
      console.log('📝 Task has description:', task.description.substring(0, 100));
    }
    
    setSelectedTask({ task, activityId, activityTitle });
    setIsTaskModalVisible(true);
  }, []);

  const handleToggleTaskCompletion = useCallback(async () => {
    if (!selectedTask) return;
    
    console.log('⚡ INSTANT: Toggling task completion with optimistic update');
    
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
    
    console.log('⚡ INSTANT: Closing modal immediately');
    setIsTaskModalVisible(false);
    
    setTimeout(() => {
      setSelectedTask(null);
    }, 300);
    
    try {
      console.log('🔄 BACKGROUND: Updating task completion in database');
      await toggleTaskCompletion(selectedTask.activityId, selectedTask.task.id);
      console.log('✅ BACKGROUND: Task completion toggled successfully');
    } catch (error) {
      console.error('❌ BACKGROUND: Error toggling task completion:', error);
    }
  }, [selectedTask, toggleTaskCompletion, isAdmin, selectedContext]);

  const handleConfirmAction = useCallback(async () => {
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
  }, [pendingAction, createActivity, toggleTaskCompletion]);

  const handleCancelAction = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  }, []);

  const handleCreateActivity = useCallback(async (activityData: ActivityCreationData) => {
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
  }, [isAdmin, selectedContext, createActivity]);

  const handleLoadPreviousWeek = useCallback(() => {
    console.log('Loading previous week, current weeksToLoad:', weeksToLoad);
    setWeeksToLoad(prev => prev + 1);
  }, [weeksToLoad]);

  const getUpcomingActivitiesByWeek = useMemo(() => {
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
        weekActivities.sort((a, b) => {
          const dateA = new Date(a.date);
          const dateB = new Date(b.date);
          
          const [hoursA, minutesA] = a.time.split(':').map(Number);
          const [hoursB, minutesB] = b.time.split(':').map(Number);
          
          dateA.setHours(hoursA, minutesA, 0, 0);
          dateB.setHours(hoursB, minutesB, 0, 0);
          
          return dateA.getTime() - dateB.getTime();
        });
        
        const firstDate = new Date(weekActivities[0].date);
        const lastDate = new Date(weekActivities[weekActivities.length - 1].date);
        grouped[key].dateRange = `${firstDate.getDate()}/${firstDate.getMonth() + 1} - ${lastDate.getDate()}/${lastDate.getMonth() + 1}`;
      }
    });

    return grouped;
  }, [activities, weeksToLoad]);

  const sortedWeeks = useMemo(() => {
    return Object.entries(getUpcomingActivitiesByWeek).sort((a, b) => {
      return a[1].sortDate.getTime() - b[1].sortDate.getTime();
    });
  }, [getUpcomingActivitiesByWeek]);

  const bgColor = isDark ? '#000' : '#f8f9fa';
  const cardBgColor = isDark ? '#1a1a1a' : '#fff';
  const textColor = isDark ? '#fff' : '#1a1a1a';
  const textSecondaryColor = isDark ? '#999' : '#666';

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
        <View style={styles.headerContainer}>
          <LinearGradient
            colors={['#1a1a2e', '#16213e', '#0f3460']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.headerGradient, { paddingTop: insets.top + 20 }]}
          >
            <View style={styles.headerContent}>
              <View style={styles.headerTop}>
                <View style={styles.brandContainer}>
                  <View style={styles.logoCircle}>
                    <Text style={styles.logoEmoji}>⚽</Text>
                  </View>
                  <View style={styles.brandText}>
                    <Text style={styles.appName}>FOOTBALL COACH</Text>
                    <Text style={styles.appTagline}>Styrk din fodboldtræning</Text>
                  </View>
                </View>
              </View>
            </View>
          </LinearGradient>
        </View>

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

        <View style={styles.statsContainer}>
          <LinearGradient
            colors={[getProgressColor(currentWeekStats.percentage), '#000']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statsGradient}
          >
            <View style={styles.statsContent}>
              <View style={styles.statsHeaderRow}>
                <View style={styles.statsHeaderLeft}>
                  <Text style={styles.statsLabel}>DENNE UGE</Text>
                  <Text style={styles.statsPercentage}>{currentWeekStats.percentage}%</Text>
                </View>
                <View style={styles.trophyContainer}>
                  <Text style={styles.trophyLarge}>{getTrophyEmoji(currentWeekStats.percentage)}</Text>
                </View>
              </View>
              
              <View style={styles.progressSection}>
                <View style={styles.progressBarOuter}>
                  <View style={[styles.progressBarInner, { width: `${currentWeekStats.percentage}%` }]} />
                </View>
                <Text style={styles.taskCountText}>
                  Opgaver indtil i dag: {currentWeekStats.completedTasks} / {currentWeekStats.totalTasks}
                </Text>
              </View>
              
              <View style={styles.weekStatsSection}>
                <Text style={styles.weekStatsText}>
                  Hele ugen: {currentWeekStats.completedTasksForWeek} / {currentWeekStats.totalTasksForWeek} opgaver
                </Text>
                <View style={styles.progressBarOuter}>
                  <View style={[
                    styles.progressBarInner, 
                    { 
                      width: `${currentWeekStats.totalTasksForWeek > 0 
                        ? Math.round((currentWeekStats.completedTasksForWeek / currentWeekStats.totalTasksForWeek) * 100) 
                        : 0}%`,
                      opacity: 0.7
                    }
                  ]} />
                </View>
              </View>
              
              <Text style={styles.motivationTextPremium}>
                {getMotivationalMessage(
                  currentWeekStats.percentage, 
                  currentWeekStats.completedTasks, 
                  currentWeekStats.totalTasks,
                  currentWeekStats.totalTasksForWeek
                )}
              </Text>
              
              <TouchableOpacity 
                style={styles.historyButtonPremium}
                onPress={() => router.push('/(tabs)/performance')}
                activeOpacity={0.8}
              >
                <IconSymbol ios_icon_name="chart.line.uptrend.xyaxis" android_material_icon_name="assessment" size={20} color="#fff" />
                <Text style={styles.historyButtonTextPremium}>Se Performance</Text>
                <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        <TouchableOpacity
          style={styles.createButtonPremium}
          onPress={() => setIsCreateModalVisible(true)}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#4CAF50', '#2E7D32']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.createButtonGradient}
          >
            <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add_circle" size={24} color="#fff" />
            <Text style={styles.createButtonTextPremium}>Opret Aktivitet</Text>
          </LinearGradient>
        </TouchableOpacity>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.sectionIndicator} />
              <Text style={[styles.sectionTitle, { color: textColor }]}>I DAG</Text>
            </View>
          </View>
          
          {todayActivities.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
              <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={48} color={textSecondaryColor} />
              <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen aktiviteter i dag</Text>
              <Text style={[styles.emptySubtext, { color: textSecondaryColor }]}>Nyd din fridag eller opret en ny aktivitet</Text>
            </View>
          ) : (
            todayActivities.map((activity) => (
              <TouchableOpacity
                key={activity.id}
                style={styles.activityCardPremium}
                onPress={() => handleActivityPress(activity.id)}
                activeOpacity={0.9}
              >
                <LinearGradient
                  colors={[activity.category.color, '#000']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.activityCardGradient}
                >
                  <View style={styles.activityCardContent}>
                    <View style={styles.activityHeaderPremium}>
                      <View style={styles.activityEmojiContainer}>
                        <Text style={styles.activityEmojiPremium}>{activity.category.emoji}</Text>
                      </View>
                      <View style={styles.activityInfoPremium}>
                        <View style={styles.activityTitleRow}>
                          <Text style={styles.activityTitlePremium}>{activity.title}</Text>
                          {activity.isExternal && (
                            <View style={styles.externalBadgePremium}>
                              <IconSymbol 
                                ios_icon_name="calendar.badge.clock" 
                                android_material_icon_name="event" 
                                size={14} 
                                color="#fff" 
                              />
                            </View>
                          )}
                        </View>
                        <View style={styles.activityMetaRow}>
                          <IconSymbol ios_icon_name="clock.fill" android_material_icon_name="schedule" size={14} color="rgba(255,255,255,0.9)" />
                          <Text style={styles.activityTimePremium}>{formatTime(activity.time)}</Text>
                          <View style={styles.metaDivider} />
                          <IconSymbol ios_icon_name="mappin.circle.fill" android_material_icon_name="location_on" size={14} color="rgba(255,255,255,0.9)" />
                          <Text style={styles.activityLocationPremium}>{activity.location}</Text>
                        </View>
                      </View>
                    </View>

                    {activity.tasks.length > 0 && (
                      <View style={styles.tasksSectionPremium}>
                        <View style={styles.tasksDivider} />
                        <Text style={styles.tasksTitlePremium}>OPGAVER</Text>
                        {activity.tasks.map((task) => (
                          <TouchableOpacity
                            key={task.id}
                            style={styles.taskItemPremium}
                            onPress={(e) => {
                              e.stopPropagation();
                              handleTaskPress(task, activity.id, activity.title);
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.checkboxPremium, task.completed && styles.checkboxCheckedPremium]}>
                              {task.completed && (
                                <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color="#000" />
                              )}
                            </View>
                            <View style={styles.taskContentPremium}>
                              <Text style={[styles.taskTextPremium, task.completed && styles.taskTextCompletedPremium]}>
                                {task.title}
                              </Text>
                              {task.reminder && (
                                <View style={styles.reminderBadgePremium}>
                                  <IconSymbol ios_icon_name="bell.fill" android_material_icon_name="notifications" size={10} color="#fff" />
                                  <Text style={styles.reminderTextPremium}>{task.reminder}m</Text>
                                </View>
                              )}
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.sectionIndicator} />
              <Text style={[styles.sectionTitle, { color: textColor }]}>KOMMENDE</Text>
            </View>
            <TouchableOpacity
              style={styles.loadPreviousButtonPremium}
              onPress={handleLoadPreviousWeek}
              activeOpacity={0.7}
            >
              <IconSymbol 
                ios_icon_name="chevron.up" 
                android_material_icon_name="expand_less" 
                size={16} 
                color={textSecondaryColor} 
              />
              <Text style={[styles.loadPreviousTextPremium, { color: textSecondaryColor }]}>
                Tidligere
              </Text>
            </TouchableOpacity>
          </View>
          
          {sortedWeeks.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
              <IconSymbol ios_icon_name="calendar.badge.plus" android_material_icon_name="event_available" size={48} color={textSecondaryColor} />
              <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen kommende aktiviteter</Text>
              <Text style={[styles.emptySubtext, { color: textSecondaryColor }]}>Opret din første aktivitet for at komme i gang</Text>
            </View>
          ) : (
            <React.Fragment>
              {sortedWeeks.map(([weekKey, data]) => {
                const weekNumber = weekKey.split('-W')[1];
                return (
                  <View key={weekKey} style={styles.weekSectionPremium}>
                    <View style={styles.weekHeaderPremium}>
                      <Text style={[styles.weekTitlePremium, { color: textColor }]}>
                        Uge {weekNumber}
                      </Text>
                      <Text style={[styles.weekDatesPremium, { color: textSecondaryColor }]}>
                        {data.dateRange}
                      </Text>
                    </View>
                    
                    {data.activities.map((activity) => {
                      const isCompleted = isActivityCompleted(activity);
                      
                      return (
                        <TouchableOpacity
                          key={activity.id}
                          style={styles.upcomingActivityCardPremium}
                          onPress={() => handleActivityPress(activity.id)}
                          activeOpacity={0.9}
                        >
                          <View style={[styles.upcomingCardInner, { backgroundColor: activity.category.color }]}>
                            <View style={styles.upcomingActivityHeaderPremium}>
                              <View style={styles.upcomingEmojiContainer}>
                                <Text style={styles.upcomingActivityEmojiPremium}>{activity.category.emoji}</Text>
                              </View>
                              <View style={styles.upcomingActivityInfoPremium}>
                                <View style={styles.activityTitleRow}>
                                  <Text style={styles.upcomingActivityTitlePremium}>{activity.title}</Text>
                                  {activity.isExternal && (
                                    <View style={styles.externalBadgeSmallPremium}>
                                      <IconSymbol 
                                        ios_icon_name="calendar.badge.clock" 
                                        android_material_icon_name="event" 
                                        size={10} 
                                        color="#fff" 
                                      />
                                    </View>
                                  )}
                                  {isCompleted && (
                                    <View style={styles.completedBadgePremium}>
                                      <IconSymbol 
                                        ios_icon_name="checkmark.circle.fill" 
                                        android_material_icon_name="check_circle" 
                                        size={14} 
                                        color="#fff" 
                                      />
                                    </View>
                                  )}
                                </View>
                                <View style={styles.upcomingMetaRow}>
                                  <IconSymbol ios_icon_name="clock.fill" android_material_icon_name="schedule" size={12} color="rgba(255,255,255,0.9)" />
                                  <Text style={styles.upcomingActivityTimePremium}>
                                    {new Date(activity.date).toLocaleDateString('da-DK', { weekday: 'short', day: 'numeric', month: 'short' })} • {formatTime(activity.time)}
                                  </Text>
                                </View>
                                <View style={styles.upcomingMetaRow}>
                                  <IconSymbol ios_icon_name="mappin.circle.fill" android_material_icon_name="location_on" size={12} color="rgba(255,255,255,0.9)" />
                                  <Text style={styles.upcomingActivityLocationPremium}>{activity.location}</Text>
                                </View>
                              </View>
                              <IconSymbol 
                                ios_icon_name="chevron.right" 
                                android_material_icon_name="chevron_right" 
                                size={20} 
                                color="rgba(255,255,255,0.5)" 
                              />
                            </View>
                          </View>
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

              <ScrollView 
                style={styles.modalBody}
                contentContainerStyle={styles.modalBodyContent}
                showsVerticalScrollIndicator={true}
                bounces={true}
              >
                <Text style={[styles.taskModalActivity, { color: textSecondaryColor }]}>
                  {selectedTask.activityTitle}
                </Text>
                
                <Text style={[styles.taskModalTitle, { color: textColor }]}>
                  {selectedTask.task.title}
                </Text>
                
                {selectedTask.task.description && (
                  <View style={styles.taskDescriptionContainer}>
                    <TaskDescriptionRenderer 
                      description={selectedTask.task.description}
                      textColor={textSecondaryColor}
                    />
                  </View>
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
              </ScrollView>
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

// Main export with error boundary
export default function HomeScreen() {
  try {
    return <HomeScreenContent />;
  } catch (error) {
    console.error('Error rendering HomeScreen:', error);
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: '#f8f9fa' }}>
        <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#1a1a1a' }}>
          Indlæser...
        </Text>
        <Text style={{ textAlign: 'center', color: '#666', marginBottom: 20 }}>
          Appen initialiserer. Vent venligst.
        </Text>
        <ActivityIndicator size="large" color="#FF6347" />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  
  headerContainer: {
    marginHorizontal: -16,
    marginTop: 0,
    marginBottom: 24,
  },
  headerGradient: {
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  headerContent: {
    gap: 16,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logoCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoEmoji: {
    fontSize: 28,
  },
  brandText: {
    gap: 4,
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 1,
  },
  appTagline: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  
  statsContainer: {
    marginBottom: 20,
    borderRadius: 24,
    overflow: 'hidden',
    boxShadow: '0px 8px 24px rgba(0, 0, 0, 0.15)',
    elevation: 8,
  },
  statsGradient: {
    padding: 24,
  },
  statsContent: {
    gap: 16,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statsHeaderLeft: {
    gap: 8,
  },
  statsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 1.5,
  },
  statsPercentage: {
    fontSize: 56,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 56,
  },
  trophyContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trophyLarge: {
    fontSize: 40,
  },
  progressSection: {
    gap: 12,
  },
  progressBarOuter: {
    height: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 6,
  },
  taskCountText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
  },
  weekStatsSection: {
    gap: 8,
  },
  weekStatsText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  motivationTextPremium: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
    lineHeight: 24,
  },
  historyButtonPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  historyButtonTextPremium: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '700',
  },
  
  createButtonPremium: {
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0px 4px 16px rgba(76, 175, 80, 0.3)',
    elevation: 6,
  },
  createButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
  },
  createButtonTextPremium: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
  },
  
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionIndicator: {
    width: 4,
    height: 24,
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1,
  },
  loadPreviousButtonPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 8,
  },
  loadPreviousTextPremium: {
    fontSize: 13,
    fontWeight: '600',
  },
  
  emptyCard: {
    borderRadius: 20,
    padding: 48,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
  },
  
  activityCardPremium: {
    marginBottom: 16,
    borderRadius: 20,
    overflow: 'hidden',
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.1)',
    elevation: 4,
  },
  activityCardGradient: {
    padding: 20,
  },
  activityCardContent: {
    gap: 16,
  },
  activityHeaderPremium: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  activityEmojiContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityEmojiPremium: {
    fontSize: 32,
  },
  activityInfoPremium: {
    flex: 1,
    gap: 8,
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityTitlePremium: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  externalBadgePremium: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 12,
    padding: 6,
  },
  activityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activityTimePremium: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
  },
  metaDivider: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    marginHorizontal: 4,
  },
  activityLocationPremium: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '500',
    flex: 1,
  },
  
  tasksSectionPremium: {
    gap: 12,
  },
  tasksDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 4,
  },
  tasksTitlePremium: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.8)',
    letterSpacing: 1,
  },
  taskItemPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    padding: 14,
  },
  checkboxPremium: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCheckedPremium: {
    backgroundColor: '#fff',
  },
  taskContentPremium: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskTextPremium: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '500',
    flex: 1,
  },
  taskTextCompletedPremium: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  reminderBadgePremium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  reminderTextPremium: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  
  weekSectionPremium: {
    marginBottom: 24,
  },
  weekHeaderPremium: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  weekTitlePremium: {
    fontSize: 18,
    fontWeight: '700',
  },
  weekDatesPremium: {
    fontSize: 14,
    fontWeight: '600',
  },
  
  upcomingActivityCardPremium: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    boxShadow: '0px 2px 12px rgba(0, 0, 0, 0.08)',
    elevation: 3,
  },
  upcomingCardInner: {
    padding: 16,
  },
  upcomingActivityHeaderPremium: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  upcomingEmojiContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingActivityEmojiPremium: {
    fontSize: 24,
  },
  upcomingActivityInfoPremium: {
    flex: 1,
    gap: 4,
  },
  upcomingActivityTitlePremium: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    flex: 1,
  },
  externalBadgeSmallPremium: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 10,
    padding: 4,
  },
  completedBadgePremium: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 10,
    padding: 3,
  },
  upcomingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  upcomingActivityTimePremium: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '600',
  },
  upcomingActivityLocationPremium: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.95)',
    fontWeight: '500',
    flex: 1,
  },
  
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    height: '90%',
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
    flex: 1,
  },
  modalBodyContent: {
    padding: 24,
    paddingBottom: 40,
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
  taskDescriptionContainer: {
    marginBottom: 24,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 8,
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
