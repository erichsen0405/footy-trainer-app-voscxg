
import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from 'react-native';
import { useTheme } from '@react-navigation/native';
import { router } from 'expo-router';
import { format, isToday, startOfWeek, endOfWeek, addWeeks, isWithinInterval } from 'date-fns';
import { da } from 'date-fns/locale';

import { useHomeActivities } from '@/hooks/useHomeActivities';
import CreateActivityModal from '@/components/CreateActivityModal';
import { DatabaseActivity } from '@/services/activities';

export default function HomeScreen() {
  const theme = useTheme();
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  const {
    activities,
    loading,
    refetchActivities,
  } = useHomeActivities();

  // ✅ TRIN 1 – Sikr SAFE ARRAYS (KRITISK)
  const activitiesSafe = Array.isArray(activities) ? activities : [];

  // Process activities into today and upcoming
  const { todayActivitiesSafe, upcomingActivitiesSafe } = useMemo(() => {
    const today: DatabaseActivity[] = [];
    const upcoming: Array<{ weekKey: string; label: string; items: DatabaseActivity[] }> = [];

    const now = new Date();
    const todayStr = format(now, 'yyyy-MM-dd');

    // Group activities
    const weekGroups: Record<string, DatabaseActivity[]> = {};

    activitiesSafe.forEach((activity) => {
      if (!activity.date) return;

      const activityDate = new Date(activity.date);
      
      // Check if today
      if (activity.date === todayStr || isToday(activityDate)) {
        today.push(activity);
      } else if (activityDate > now) {
        // Group by week
        const weekStart = startOfWeek(activityDate, { locale: da });
        const weekKey = format(weekStart, 'yyyy-MM-dd');
        
        if (!weekGroups[weekKey]) {
          weekGroups[weekKey] = [];
        }
        weekGroups[weekKey].push(activity);
      }
    });

    // Sort today activities by time
    today.sort((a, b) => {
      if (!a.start_time || !b.start_time) return 0;
      return a.start_time.localeCompare(b.start_time);
    });

    // Convert week groups to array and sort
    const weekKeys = Object.keys(weekGroups).sort();
    weekKeys.forEach((weekKey) => {
      const weekStart = new Date(weekKey);
      const weekEnd = endOfWeek(weekStart, { locale: da });
      
      const label = `${format(weekStart, 'd. MMM', { locale: da })} - ${format(weekEnd, 'd. MMM', { locale: da })}`;
      
      const items = weekGroups[weekKey].sort((a, b) => {
        if (!a.date || !b.date) return 0;
        const dateCompare = a.date.localeCompare(b.date);
        if (dateCompare !== 0) return dateCompare;
        if (!a.start_time || !b.start_time) return 0;
        return a.start_time.localeCompare(b.start_time);
      });

      upcoming.push({
        weekKey,
        label,
        items,
      });
    });

    return {
      todayActivitiesSafe: today,
      upcomingActivitiesSafe: upcoming,
    };
  }, [activitiesSafe]);

  // Calculate week progress
  const weekProgress = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { locale: da });
    const weekEnd = endOfWeek(now, { locale: da });

    const weekActivities = activitiesSafe.filter((activity) => {
      if (!activity.date) return false;
      const activityDate = new Date(activity.date);
      return isWithinInterval(activityDate, { start: weekStart, end: weekEnd });
    });

    // For now, just count activities as progress
    // In the future, this could be based on completed tasks
    return {
      current: weekActivities.length,
      goal: Math.max(weekActivities.length, 17), // Default goal of 17
    };
  }, [activitiesSafe]);

  const progressPercent = useMemo(() => {
    if (!weekProgress.goal) return 0;
    return Math.min(
      100,
      Math.round((weekProgress.current / weekProgress.goal) * 100)
    );
  }, [weekProgress]);

  const openCreateModal = () => setIsCreateModalOpen(true);
  const closeCreateModal = () => setIsCreateModalOpen(false);

  const handleCreateActivity = async () => {
    closeCreateModal();
    await refetchActivities();
  };

  return (
    <>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.container}
      >
        {/* ===== HEADER ===== */}
        <View style={[styles.headerCard, { backgroundColor: theme.colors.card }]}>
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: theme.colors.text }]}>
              Ugens fremskridt
            </Text>

            <View
              style={[
                styles.badge,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text style={styles.badgeText}>
                {weekProgress.current}/{weekProgress.goal}
              </Text>
            </View>
          </View>

          <View style={styles.progressBarTrack}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${progressPercent}%`,
                  backgroundColor: theme.colors.primary,
                },
              ]}
            />
          </View>

          <Text style={[styles.helperText, { color: theme.colors.text }]}>
            Lad os komme i gang! 💪 En ny uge er en ny mulighed for at nå dine mål
          </Text>
        </View>

        {/* ===== CTA ===== */}
        <Pressable
          onPress={openCreateModal}
          style={[
            styles.primaryCTA,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <Text style={styles.primaryCTAText}>Opret aktivitet</Text>
        </Pressable>

        {/* ===== TODAY ===== */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            I dag
          </Text>

          {todayActivitiesSafe.length === 0 ? (
            <Text style={styles.emptyText}>
              Ingen aktiviteter i dag
            </Text>
          ) : (
            todayActivitiesSafe.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => router.push(`/activity-details?id=${item.id}`)}
                style={{ marginBottom: 12 }}
              >
                <View style={styles.activityCard}>
                  <View style={styles.activityLeft}>
                    <Text style={styles.activityTitle}>{item.title}</Text>

                    {item.category?.name ? (
                      <Text style={styles.activitySubtitle}>
                        {item.category.name}
                      </Text>
                    ) : null}
                  </View>

                  {item.start_time ? (
                    <Text style={styles.activityTime}>
                      {item.start_time}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            ))
          )}
        </View>

        {/* ===== UPCOMING ===== */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Kommende aktiviteter
          </Text>

          {upcomingActivitiesSafe.map((week) => (
            <View key={week.weekKey}>
              <Text style={styles.weekLabel}>
                {week.label}
              </Text>

              {week.items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => router.push(`/activity-details?id=${item.id}`)}
                  style={{ marginBottom: 12 }}
                >
                  <View style={styles.activityCard}>
                    <View style={styles.activityLeft}>
                      <Text style={styles.activityTitle}>{item.title}</Text>

                      {item.category?.name ? (
                        <Text style={styles.activitySubtitle}>
                          {item.category.name}
                        </Text>
                      ) : null}
                    </View>

                    {item.start_time ? (
                      <Text style={styles.activityTime}>
                        {item.start_time}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* ===== MODAL ===== */}
      <CreateActivityModal
        visible={isCreateModalOpen}
        onClose={closeCreateModal}
        onCreate={handleCreateActivity}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 32,
  },

  headerCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },

  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },

  badgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },

  progressBarTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e5e5e5',
    overflow: 'hidden',
    marginBottom: 12,
  },

  progressBarFill: {
    height: '100%',
    borderRadius: 999,
  },

  helperText: {
    fontSize: 13,
    opacity: 0.8,
  },

  primaryCTA: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 24,
  },

  primaryCTAText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  section: {
    marginBottom: 24,
  },

  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },

  emptyText: {
    fontSize: 14,
    opacity: 0.6,
  },

  weekLabel: {
    fontSize: 12,
    opacity: 0.6,
    marginBottom: 8,
    textTransform: 'uppercase',
  },

  activityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',

    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },

  activityLeft: {
    flex: 1,
  },

  activityTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
  },

  activitySubtitle: {
    fontSize: 12,
    color: '#777',
    marginTop: 4,
  },

  activityTime: {
    fontSize: 12,
    color: '#999',
    marginLeft: 12,
  },
});
