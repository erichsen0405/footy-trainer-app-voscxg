
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Platform, TouchableOpacity, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import { useFootball } from '@/contexts/FootballContext';
import ActivityCard from '@/components/ActivityCard';
import CreateActivityModal from '@/components/CreateActivityModal';
import { colors } from '@/styles/commonStyles';
import { format, startOfWeek, endOfWeek, getWeek } from 'date-fns';
import { da } from 'date-fns/locale';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';

function resolveActivityDateTime(activity: any): Date | null {
  // Internal DB activities
  if (activity.activity_date) {
    const date = activity.activity_date;
    const time = activity.activity_time ?? '12:00';
    const iso = `${date}T${time}`;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  // External calendar events
  if (activity.start_time) {
    const d = new Date(activity.start_time);
    return isNaN(d.getTime()) ? null : d;
  }

  return null;
}

function getWeekLabel(date: Date): string {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return `${format(start, 'd/M', { locale: da })} - ${format(end, 'd/M', { locale: da })}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { activities, loading } = useHomeActivities();
  const { categories, createActivity, refreshData, toggleTaskCompletion } = useFootball();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activityTasks, setActivityTasks] = useState<{ [activityId: string]: any[] }>({});
  const [selectedTaskVideo, setSelectedTaskVideo] = useState<string | null>(null);
  const [showVideoModal, setShowVideoModal] = useState(false);

  // Fetch tasks for today's activities
  React.useEffect(() => {
    async function fetchTasksForActivities() {
      if (!Array.isArray(activities) || activities.length === 0) return;

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);

      const resolved = activities
        .map(activity => {
          const dateTime = resolveActivityDateTime(activity);
          if (!dateTime) return null;
          return {
            ...activity,
            __resolvedDateTime: dateTime,
          };
        })
        .filter(Boolean) as any[];

      const todayActivities = resolved.filter(
        a =>
          a.__resolvedDateTime >= todayStart &&
          a.__resolvedDateTime <= todayEnd
      );

      const tasksMap: { [activityId: string]: any[] } = {};

      for (const activity of todayActivities) {
        try {
          if (activity.is_external) {
            // Fetch tasks for external activities
            const { data: externalTasks, error } = await supabase
              .from('external_event_tasks')
              .select('*')
              .eq('external_event_id', activity.external_event_id)
              .order('created_at', { ascending: true });

            if (!error && externalTasks) {
              tasksMap[activity.id] = externalTasks.map((task: any) => ({
                id: task.id,
                title: task.title,
                description: task.description || '',
                completed: task.completed,
                reminder_minutes: task.reminder_minutes,
                video_url: task.video_url,
                isExternal: true,
              }));
            }
          } else {
            // Fetch tasks for internal activities
            const { data: internalTasks, error } = await supabase
              .from('activity_tasks')
              .select('*')
              .eq('activity_id', activity.id)
              .order('created_at', { ascending: true });

            if (!error && internalTasks) {
              tasksMap[activity.id] = internalTasks.map((task: any) => ({
                id: task.id,
                title: task.title,
                description: task.description || '',
                completed: task.completed,
                reminder_minutes: task.reminder_minutes,
                video_url: task.video_url,
                isExternal: false,
              }));
            }
          }
        } catch (error) {
          console.error('Error fetching tasks for activity:', activity.id, error);
        }
      }

      setActivityTasks(tasksMap);
    }

    fetchTasksForActivities();
  }, [activities]);

  const { todayActivities, upcomingByWeek } = useMemo(() => {
    if (!Array.isArray(activities)) {
      return { todayActivities: [], upcomingByWeek: [] };
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const resolved = activities
      .map(activity => {
        const dateTime = resolveActivityDateTime(activity);
        if (!dateTime) return null;

        return {
          ...activity,
          __resolvedDateTime: dateTime,
        };
      })
      .filter(Boolean) as any[];

    const todayActivities = resolved
      .filter(
        a =>
          a.__resolvedDateTime >= todayStart &&
          a.__resolvedDateTime <= todayEnd
      )
      .sort(
        (a, b) =>
          a.__resolvedDateTime.getTime() -
          b.__resolvedDateTime.getTime()
      );

    const upcomingActivities = resolved
      .filter(a => a.__resolvedDateTime > todayEnd)
      .sort(
        (a, b) =>
          a.__resolvedDateTime.getTime() -
          b.__resolvedDateTime.getTime()
      );

    // Group upcoming activities by week
    const weekGroups: { [key: string]: any[] } = {};
    upcomingActivities.forEach(activity => {
      const weekStart = startOfWeek(activity.__resolvedDateTime, { weekStartsOn: 1 });
      const weekKey = weekStart.toISOString();
      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = [];
      }
      weekGroups[weekKey].push(activity);
    });

    const upcomingByWeek = Object.entries(weekGroups)
      .map(([weekKey, activities]) => ({
        weekStart: new Date(weekKey),
        activities,
      }))
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

    return { todayActivities, upcomingByWeek };
  }, [activities]);

  const handleCreateActivity = async (activityData: any) => {
    await createActivity(activityData);
    refreshData();
  };

  const handleToggleTask = async (activityId: string, taskId: string) => {
    try {
      await toggleTaskCompletion(activityId, taskId);
      
      // Refresh tasks for this activity
      const activity = todayActivities.find(a => a.id === activityId);
      if (!activity) return;

      if (activity.is_external) {
        const { data: externalTasks, error } = await supabase
          .from('external_event_tasks')
          .select('*')
          .eq('external_event_id', activity.external_event_id)
          .order('created_at', { ascending: true });

        if (!error && externalTasks) {
          setActivityTasks(prev => ({
            ...prev,
            [activityId]: externalTasks.map((task: any) => ({
              id: task.id,
              title: task.title,
              description: task.description || '',
              completed: task.completed,
              reminder_minutes: task.reminder_minutes,
              video_url: task.video_url,
              isExternal: true,
            })),
          }));
        }
      } else {
        const { data: internalTasks, error } = await supabase
          .from('activity_tasks')
          .select('*')
          .eq('activity_id', activityId)
          .order('created_at', { ascending: true });

        if (!error && internalTasks) {
          setActivityTasks(prev => ({
            ...prev,
            [activityId]: internalTasks.map((task: any) => ({
              id: task.id,
              title: task.title,
              description: task.description || '',
              completed: task.completed,
              reminder_minutes: task.reminder_minutes,
              video_url: task.video_url,
              isExternal: false,
            })),
          }));
        }
      }
    } catch (error) {
      console.error('Error toggling task:', error);
    }
  };

  const handleTaskPress = (task: any) => {
    if (task.video_url) {
      setSelectedTaskVideo(task.video_url);
      setShowVideoModal(true);
    }
  };

  const closeVideoModal = () => {
    setShowVideoModal(false);
    setTimeout(() => {
      setSelectedTaskVideo(null);
    }, 300);
  };

  const formatReminderTime = (reminderMinutes: number, activityTime: string) => {
    if (!reminderMinutes) return null;
    
    // Parse activity time
    const [hours, minutes] = activityTime.split(':').map(Number);
    const activityDate = new Date();
    activityDate.setHours(hours, minutes, 0, 0);
    
    // Subtract reminder minutes
    const reminderDate = new Date(activityDate.getTime() - reminderMinutes * 60000);
    
    return `${reminderMinutes} min før`;
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Indlæser…</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <View style={styles.logo}>
              <Text style={styles.logoIcon}>⚽</Text>
            </View>
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Football Coach</Text>
            <Text style={styles.headerSubtitle}>Træn som en Pro</Text>
          </View>
        </View>

        {/* Weekly Progress Card with Red Gradient */}
        <LinearGradient
          colors={['#EF4444', '#DC2626', '#991B1B']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.progressCard}
        >
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>DENNE UGE</Text>
            <View style={styles.medalBadge}>
              <Text style={styles.medalIcon}>🥉</Text>
            </View>
          </View>
          
          <Text style={styles.progressPercentage}>0%</Text>
          
          <View style={styles.progressBar}>
            <View style={[styles.progressBarFill, { width: '0%' }]} />
          </View>

          <Text style={styles.progressDetail}>Opgaver indtil i dag: 0 / 3</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressBarFill, { width: '0%' }]} />
          </View>

          <Text style={styles.progressDetail}>Hele ugen: 0 / 22 opgaver</Text>

          <Text style={styles.motivationText}>
            Hver træning tæller! 3 opgaver tilbage indtil i dag.{'\n'}
            22 opgaver tilbage for ugen. ⚽
          </Text>

          <Pressable 
            style={styles.performanceButton}
            onPress={() => router.push('/(tabs)/performance')}
          >
            <Text style={styles.performanceButtonText}>📊  Se Performance  →</Text>
          </Pressable>
        </LinearGradient>

        {/* Create Activity Button */}
        <Pressable 
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>+  Opret Aktivitet</Text>
        </Pressable>

        {/* I DAG Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <View style={styles.greenMarker} />
            <Text style={styles.sectionTitle}>I DAG</Text>
          </View>

          {todayActivities.length === 0 && (
            <Text style={styles.emptyText}>Ingen aktiviteter i dag</Text>
          )}

          {todayActivities.map((activity, index) => (
            <View key={index} style={styles.activityWrapper}>
              <ActivityCard
                activity={activity}
                resolvedDate={activity.__resolvedDateTime}
              />
              
              {/* Tasks for this activity */}
              {activityTasks[activity.id] && activityTasks[activity.id].length > 0 && (
                <View style={styles.tasksContainer}>
                  {activityTasks[activity.id].map((task, taskIndex) => (
                    <View key={taskIndex} style={styles.taskRow}>
                      <TouchableOpacity
                        style={styles.taskCheckboxArea}
                        onPress={() => handleToggleTask(activity.id, task.id)}
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
                              color="#fff"
                            />
                          )}
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.taskContent}
                        onPress={() => handleTaskPress(task)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.taskTitle,
                            task.completed && styles.taskTitleCompleted,
                          ]}
                        >
                          {task.title}
                        </Text>
                        
                        {task.reminder_minutes && (
                          <View style={styles.reminderBadge}>
                            <IconSymbol
                              ios_icon_name="bell.fill"
                              android_material_icon_name="notifications"
                              size={12}
                              color={colors.accent}
                            />
                            <Text style={styles.reminderText}>
                              {formatReminderTime(task.reminder_minutes, activity.activity_time || activity.start_time)}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>

                      {task.video_url && (
                        <TouchableOpacity
                          style={styles.videoIndicator}
                          onPress={() => handleTaskPress(task)}
                          activeOpacity={0.7}
                        >
                          <IconSymbol
                            ios_icon_name="play.circle.fill"
                            android_material_icon_name="play_circle"
                            size={24}
                            color={colors.primary}
                          />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        {/* KOMMENDE Section */}
        {upcomingByWeek.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>KOMMENDE</Text>
              <Pressable>
                <Text style={styles.expandButton}>▲ Tidligere</Text>
              </Pressable>
            </View>

            {upcomingByWeek.map((weekGroup, weekIndex) => (
              <View key={weekIndex} style={styles.weekGroup}>
                <Text style={styles.weekLabel}>
                  Uge {getWeek(weekGroup.weekStart, { weekStartsOn: 1, locale: da })}
                </Text>
                <Text style={styles.weekDateRange}>{getWeekLabel(weekGroup.weekStart)}</Text>

                {weekGroup.activities.map((activity, activityIndex) => (
                  <View key={activityIndex} style={styles.activityWrapper}>
                    <ActivityCard
                      activity={activity}
                      resolvedDate={activity.__resolvedDateTime}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Bottom spacing for tab bar */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Create Activity Modal */}
      <CreateActivityModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreateActivity={handleCreateActivity}
        categories={categories}
        onRefreshCategories={refreshData}
      />

      {/* Video Modal */}
      <Modal
        visible={showVideoModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeVideoModal}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            paddingTop: Platform.OS === 'android' ? 48 : 60,
            paddingBottom: 16,
            paddingHorizontal: 20,
            backgroundColor: 'rgba(0,0,0,0.9)'
          }}>
            <TouchableOpacity 
              onPress={closeVideoModal}
              style={{ padding: 4 }}
            >
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="close"
                size={32}
                color="#fff"
              />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>
              Opgave video
            </Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
            <SmartVideoPlayer url={selectedTaskVideo || undefined} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingTop: Platform.OS === 'android' ? 48 : 0,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },

  // Header
  header: {
    backgroundColor: '#2C3E50',
    paddingHorizontal: 20,
    paddingVertical: 32,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    marginRight: 16,
  },
  logo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  logoIcon: {
    fontSize: 32,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Progress Card
  progressCard: {
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 16,
    borderRadius: 24,
    padding: 24,
    boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.25)',
    elevation: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  medalBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalIcon: {
    fontSize: 28,
  },
  progressPercentage: {
    fontSize: 72,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  progressBar: {
    height: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 5,
    marginVertical: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
  },
  progressDetail: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 8,
  },
  motivationText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: 20,
    lineHeight: 22,
  },
  performanceButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginTop: 20,
    alignItems: 'center',
  },
  performanceButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Create Button
  createButton: {
    backgroundColor: '#4CAF50',
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    boxShadow: '0px 3px 10px rgba(76, 175, 80, 0.35)',
    elevation: 4,
  },
  createButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  greenMarker: {
    width: 4,
    height: 28,
    backgroundColor: '#4CAF50',
    borderRadius: 2,
    marginRight: 12,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.5,
  },
  expandButton: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 16,
  },

  // Week Groups
  weekGroup: {
    marginBottom: 24,
  },
  weekLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
  },
  weekDateRange: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 16,
  },

  // Activity Wrapper
  activityWrapper: {
    marginBottom: 14,
  },

  // Tasks Container
  tasksContainer: {
    marginTop: 8,
    paddingLeft: 8,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    marginBottom: 8,
  },
  taskCheckboxArea: {
    marginRight: 12,
  },
  taskCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  taskCheckboxCompleted: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  reminderText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent,
  },
  videoIndicator: {
    marginLeft: 8,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 120,
  },
});
