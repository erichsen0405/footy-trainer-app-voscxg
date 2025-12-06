
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useFootball } from '@/contexts/FootballContext';
import { colors } from '@/styles/commonStyles';
import { Activity } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import { getWeek, startOfWeek, endOfWeek } from 'date-fns';
import { requestNotificationPermissions } from '@/utils/notificationService';

export default function HomeScreen() {
  const { currentWeekStats, todayActivities, activities, toggleTaskCompletion, externalCalendars, fetchExternalCalendarEvents } = useFootball();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  // Request notification permissions on mount
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

  const getActivitiesByWeek = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    // Get current week start (Monday)
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    
    // Filter activities from current week onwards
    const relevantActivities = activities.filter(activity => {
      const activityDate = new Date(activity.date);
      activityDate.setHours(0, 0, 0, 0);
      return activityDate >= currentWeekStart;
    });
    
    const grouped: { [key: string]: { activities: Activity[], dateRange: string } } = {};
    
    relevantActivities.forEach(activity => {
      const activityDate = new Date(activity.date);
      const weekNumber = getWeek(activityDate, { weekStartsOn: 1 }); // Start week on Monday
      const year = activityDate.getFullYear();
      const key = `Uge ${weekNumber}`;
      
      if (!grouped[key]) {
        grouped[key] = { activities: [], dateRange: '' };
      }
      grouped[key].activities.push(activity);
    });

    // Calculate date ranges for each week and sort activities
    Object.keys(grouped).forEach(key => {
      const weekActivities = grouped[key].activities;
      if (weekActivities.length > 0) {
        // Sort activities by date
        weekActivities.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const firstDate = new Date(weekActivities[0].date);
        const lastDate = new Date(weekActivities[weekActivities.length - 1].date);
        grouped[key].dateRange = `${firstDate.getDate()}/${firstDate.getMonth() + 1} - ${lastDate.getDate()}/${lastDate.getMonth() + 1}`;
      }
    });

    return grouped;
  };

  const handleActivityPress = (activityId: string) => {
    console.log('Opening activity details for:', activityId);
    router.push(`/activity-details?id=${activityId}`);
  };

  const handleHistoryPress = () => {
    console.log('Navigating to performance page');
    router.push('/(tabs)/performance');
  };

  const activitiesByWeek = getActivitiesByWeek();

  return (
    <ScrollView 
      style={styles.container} 
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
        <Text style={styles.sectionTitle}>I dag</Text>
        
        {todayActivities.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Ingen aktiviteter i dag</Text>
          </View>
        ) : (
          <React.Fragment>
            {todayActivities.map((activity) => (
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
                        onPress={(e) => {
                          e.stopPropagation();
                          toggleTaskCompletion(activity.id, task.id);
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
            ))}
          </React.Fragment>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Kommende aktiviteter</Text>
        
        {Object.keys(activitiesByWeek).length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Ingen kommende aktiviteter</Text>
          </View>
        ) : (
          <React.Fragment>
            {Object.entries(activitiesByWeek).map(([week, data]) => (
              <View key={week} style={styles.weekSection}>
                <Text style={styles.weekTitle}>
                  {week}
                </Text>
                <Text style={styles.weekDates}>
                  {data.dateRange}
                </Text>
                
                {data.activities.map((activity) => (
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
                ))}
              </View>
            ))}
          </React.Fragment>
        )}
      </View>

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    color: colors.text,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
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
    color: colors.text,
  },
  weekDates: {
    fontSize: 14,
    marginBottom: 12,
    color: colors.textSecondary,
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
});
