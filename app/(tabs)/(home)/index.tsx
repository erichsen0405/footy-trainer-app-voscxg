
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

import { useHomeActivities } from '@/hooks/useHomeActivities';
import CreateActivityModal from '@/components/CreateActivityModal';
import { Activity } from '@/types';

export default function HomeScreen() {
  const theme = useTheme();

  const {
    todayActivities,
    upcomingActivitiesByWeek,
    weekProgress,
    isCreateModalOpen,
    openCreateModal,
    closeCreateModal,
    handleCreateActivity,
  } = useHomeActivities();

  // ✅ SAFETY NORMALIZATION (web + first render)
  const safeTodayActivities = todayActivities ?? [];
  const safeUpcomingActivitiesByWeek = upcomingActivitiesByWeek ?? [];
  const safeWeekProgress = weekProgress ?? { current: 0, goal: 0 };

  const progressPercent = useMemo(() => {
    if (!safeWeekProgress.goal) return 0;
    return Math.min(
      100,
      Math.round(
        (safeWeekProgress.current / safeWeekProgress.goal) * 100
      )
    );
  }, [safeWeekProgress]);

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
                {safeWeekProgress.current}/{safeWeekProgress.goal}
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

          {safeTodayActivities.length === 0 ? (
            <Text style={styles.emptyText}>Ingen aktiviteter i dag</Text>
          ) : (
            safeTodayActivities.map((activity: Activity) => (
              <Pressable
                key={activity.id}
                onPress={() =>
                  router.push(`/activity-details?id=${activity.id}`)
                }
              >
                <View style={styles.activityCard}>
                  <View style={styles.activityLeft}>
                    <Text style={styles.activityTitle}>{activity.title}</Text>

                    {activity.category?.name ? (
                      <Text style={styles.activitySubtitle}>
                        {activity.category.name}
                      </Text>
                    ) : null}
                  </View>

                  {activity.start_time ? (
                    <Text style={styles.activityTime}>
                      {activity.start_time}
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

          {safeUpcomingActivitiesByWeek.map((week) => (
            <View key={week.label} style={styles.weekGroup}>
              <Text style={styles.weekLabel}>{week.label}</Text>

              {week.activities.map((activity: Activity) => (
                <Pressable
                  key={activity.id}
                  onPress={() =>
                    router.push(`/activity-details?id=${activity.id}`)
                  }
                >
                  <View style={styles.activityCard}>
                    <View style={styles.activityLeft}>
                      <Text style={styles.activityTitle}>{activity.title}</Text>

                      {activity.category?.name ? (
                        <Text style={styles.activitySubtitle}>
                          {activity.category.name}
                        </Text>
                      ) : null}
                    </View>

                    {activity.start_time ? (
                      <Text style={styles.activityTime}>
                        {activity.start_time}
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

  weekGroup: {
    marginBottom: 16,
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
