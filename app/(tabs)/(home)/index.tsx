
import React, { useEffect } from 'react';
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
import ActivityCard from '@/components/ActivityCard';

// Helper function to resolve activity local date
function resolveActivityLocalDate(activity: any): string | null {
  if (!activity) return null;

  // Internal activities
  if (activity.activity_date) {
    return activity.activity_date; // already YYYY-MM-DD
  }

  // External activities (ISO / start_time)
  const raw =
    activity.start_time ||
    activity.start_date ||
    activity.scheduled_at ||
    activity.date;

  if (!raw) return null;

  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;

  // Normalize to LOCAL date string
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

export default function HomeScreen() {
  const theme = useTheme();
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  const {
    activities,
    loading,
    refetchActivities,
  } = useHomeActivities();

  // Force fetch on mount
  useEffect(() => {
    refetchActivities();
  }, [refetchActivities]);

  // Ensure we have a safe array
  const activitiesSafe = Array.isArray(activities) ? activities : [];

  // Define today string ONCE
  const todayStr = new Date().toISOString().slice(0, 10);

  // Filter TODAY activities
  const todayActivities = activitiesSafe.filter(a => {
    const d = resolveActivityLocalDate(a);
    return d === todayStr;
  });

  // Filter UPCOMING activities
  const upcomingActivities = activitiesSafe
    .filter(a => {
      const d = resolveActivityLocalDate(a);
      return d && d > todayStr;
    })
    .sort((a, b) => {
      const da = resolveActivityLocalDate(a);
      const db = resolveActivityLocalDate(b);
      return da!.localeCompare(db!);
    });

  // Calculate week progress (placeholder logic)
  const weekProgress = {
    current: 0,
    goal: 17,
  };

  const progressPercent = Math.min(
    100,
    Math.round((weekProgress.current / weekProgress.goal) * 100)
  );

  const openCreateModal = () => setIsCreateModalOpen(true);
  const closeCreateModal = () => setIsCreateModalOpen(false);

  const handleCreateActivity = async () => {
    closeCreateModal();
    // Refetch will happen automatically via hook
  };

  const handleActivityPress = (activityId: string) => {
    router.push({
      pathname: '/activity-details',
      params: { id: activityId },
    });
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

        {/* ===== I DAG ===== */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            I dag
          </Text>

          {todayActivities.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>
              Ingen aktiviteter i dag
            </Text>
          ) : (
            todayActivities.map((activity, index) => (
              <ActivityCard
                key={activity.id || index}
                activity={activity}
                onPress={() => handleActivityPress(activity.id)}
              />
            ))
          )}
        </View>

        {/* ===== KOMMENDE AKTIVITETER ===== */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Kommende aktiviteter
          </Text>

          {upcomingActivities.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.colors.text }]}>
              Ingen kommende aktiviteter
            </Text>
          ) : (
            upcomingActivities.map((activity, index) => (
              <ActivityCard
                key={activity.id || index}
                activity={activity}
                onPress={() => handleActivityPress(activity.id)}
              />
            ))
          )}
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
    fontStyle: 'italic',
  },
});
