
import React from 'react';
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

export default function HomeScreen() {
  const theme = useTheme();
  const [isCreateModalOpen, setIsCreateModalOpen] = React.useState(false);

  // ✅ TRIN 1 – KORREKT HOOK-BRUG (VIGTIG)
  const {
    activities,
    loading,
  } = useHomeActivities();

  // ✅ TRIN 2 – SAFE DEFAULTS (STOPPER CRASHES)
  const activitiesSafe = Array.isArray(activities) ? activities : [];

  // ✅ TRIN 3 – "I dag" FILTRERING (LOKALT)
  const todayActivities = activitiesSafe.filter((a) => {
    if (!a.start_date) return false;
    const d = new Date(a.start_date);
    const today = new Date();
    return (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    );
  });

  // ✅ TRIN 4 – "Kommende" FILTRERING (LOKALT)
  const upcomingActivities = activitiesSafe.filter((a) => {
    if (!a.start_date) return false;
    return new Date(a.start_date) > new Date();
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

        {/* ✅ TRIN 5 – RENDERING (ENKEL OG STABIL) - "I dag" */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            I dag
          </Text>

          {todayActivities.length === 0 ? (
            <Text style={styles.emptyText}>
              Ingen aktiviteter i dag
            </Text>
          ) : (
            todayActivities.map((item) => (
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

        {/* ✅ TRIN 5 – RENDERING (ENKEL OG STABIL) - "Kommende aktiviteter" */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
            Kommende aktiviteter
          </Text>

          {upcomingActivities.length === 0 ? (
            <Text style={styles.emptyText}>
              Ingen kommende aktiviteter
            </Text>
          ) : (
            upcomingActivities.map((item) => (
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
