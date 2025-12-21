
import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useTheme } from '@react-navigation/native';
import { router } from 'expo-router';

import { useHomeActivities } from '@/hooks/useHomeActivities';
import CreateActivityModal from '@/components/CreateActivityModal';

// Date resolver function
const resolveActivityDate = (activity: any): Date | null => {
  // Internal activities (DB)
  if (activity.activity_date) {
    const time = activity.activity_time ?? '00:00:00';
    return new Date(`${activity.activity_date}T${time}`);
  }

  // External activities (calendar)
  if (activity.start_time) {
    return new Date(activity.start_time);
  }

  if (activity.start_date) {
    return new Date(activity.start_date);
  }

  // Fallbacks
  if (activity.date) {
    return new Date(activity.date);
  }

  if (activity.created_at) {
    return new Date(activity.created_at);
  }

  return null;
};

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

  // Define day boundary
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // TODAY ACTIVITIES - sorted chronologically
  const todayActivities = activitiesSafe
    .filter((activity) => {
      const date = resolveActivityDate(activity);
      if (!date) return false;

      const d = new Date(date);
      d.setHours(0, 0, 0, 0);

      return d.getTime() === today.getTime();
    })
    .sort((a, b) => {
      return (
        resolveActivityDate(a)!.getTime() -
        resolveActivityDate(b)!.getTime()
      );
    });

  // UPCOMING ACTIVITIES - sorted chronologically (nearest first)
  const upcomingActivities = activitiesSafe
    .filter((activity) => {
      const date = resolveActivityDate(activity);
      if (!date) return false;

      const d = new Date(date);
      d.setHours(0, 0, 0, 0);

      return d.getTime() > today.getTime();
    })
    .sort((a, b) => {
      return (
        resolveActivityDate(a)!.getTime() -
        resolveActivityDate(b)!.getTime()
      );
    });

  // VERIFICATION LOG (OBLIGATORISK)
  console.log('[HomeScreen FINAL]', {
    today: todayActivities.length,
    upcoming: upcomingActivities.length,
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
            todayActivities.map((activity) => (
              <TouchableOpacity
                key={activity.id}
                onPress={() => handleActivityPress(activity.id)}
                style={[
                  styles.activityCard,
                  { backgroundColor: theme.colors.card },
                ]}
              >
                <View style={styles.activityCardContent}>
                  <Text style={[styles.activityTitle, { color: theme.colors.text }]}>
                    {activity.title || activity.name || 'Uden titel'}
                  </Text>

                  {(activity.activity_time || activity.start_time) && (
                    <Text style={[styles.activityTime, { color: theme.colors.text }]}>
                      {activity.activity_time || 
                       (activity.start_time ? new Date(activity.start_time).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) : '')}
                    </Text>
                  )}

                  {activity.category_name && (
                    <View
                      style={[
                        styles.categoryBadge,
                        { backgroundColor: activity.category_color || theme.colors.primary },
                      ]}
                    >
                      <Text style={styles.categoryText}>
                        {activity.category_name}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
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
            upcomingActivities.map((activity) => (
              <TouchableOpacity
                key={activity.id}
                onPress={() => handleActivityPress(activity.id)}
                style={[
                  styles.activityCard,
                  { backgroundColor: theme.colors.card },
                ]}
              >
                <View style={styles.activityCardContent}>
                  <Text style={[styles.activityTitle, { color: theme.colors.text }]}>
                    {activity.title || activity.name || 'Uden titel'}
                  </Text>

                  {(activity.activity_date || activity.start_date || activity.start_time) && (
                    <Text style={[styles.activityDate, { color: theme.colors.text }]}>
                      {activity.activity_date || 
                       (activity.start_date ? new Date(activity.start_date).toLocaleDateString('da-DK') : '') ||
                       (activity.start_time ? new Date(activity.start_time).toLocaleDateString('da-DK') : '')}
                      {(activity.activity_time || activity.start_time) && 
                        ` • ${activity.activity_time || new Date(activity.start_time).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}`}
                    </Text>
                  )}

                  {activity.category_name && (
                    <View
                      style={[
                        styles.categoryBadge,
                        { backgroundColor: activity.category_color || theme.colors.primary },
                      ]}
                    >
                      <Text style={styles.categoryText}>
                        {activity.category_name}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
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

  activityCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  activityCardContent: {
    gap: 6,
  },

  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
  },

  activityTime: {
    fontSize: 14,
    opacity: 0.7,
  },

  activityDate: {
    fontSize: 14,
    opacity: 0.7,
  },

  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },

  categoryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
