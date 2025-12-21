import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import CreateActivityModal from '@/components/CreateActivityModal';
import ContextConfirmationDialog from '@/components/ContextConfirmationDialog';
import { TaskDescriptionRenderer } from '@/components/TaskDescriptionRenderer';

import { useFootball } from '@/contexts/FootballContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';

/**
 * ⛔️ VIGTIGT
 * Al data-fetching, Supabase-kald, parsing og abort-logik
 * SKAL ligge i dette hook – ikke i denne route.
 */
import { useHomeActivities } from '@/hooks/useHomeActivities';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { selectedClub } = useFootball();
  const { selectedTeam, selectedPlayer } = useTeamPlayer();

  const {
    activities,
    isLoading,
    isRefreshing,
    refresh,
    createActivity,
    confirmContextChange,
    pendingContextChange,
    dismissContextChange,
  } = useHomeActivities({
    clubId: selectedClub?.id,
    teamId: selectedTeam?.id,
    playerId: selectedPlayer?.id,
  });

  const themeColors = useMemo(() => getColors(), []);

  const onCreateActivity = useCallback(
    async (data) => {
      await createActivity(data);
    },
    [createActivity]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={themeColors.background}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
        }
      >
        {activities.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Ingen aktiviteter</Text>
            <Text style={styles.emptyText}>
              Opret din første aktivitet for at komme i gang.
            </Text>
          </View>
        ) : (
          activities.map((activity) => (
            <TouchableOpacity
              key={activity.id}
              style={styles.activityCard}
              onPress={() =>
                router.push({
                  pathname: '/activity/[id]',
                  params: { id: activity.id },
                })
              }
            >
              <View style={styles.activityHeader}>
                <Text style={styles.activityTitle}>{activity.title}</Text>
                <IconSymbol name="chevron-right" size={16} color="#999" />
              </View>

              {activity.description ? (
                <TaskDescriptionRenderer
                  description={activity.description}
                />
              ) : null}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <CreateActivityModal onCreate={onCreateActivity} />

      <ContextConfirmationDialog
        visible={!!pendingContextChange}
        onConfirm={confirmContextChange}
        onCancel={dismissContextChange}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    marginTop: 80,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyText: {
    color: '#777',
    textAlign: 'center',
  },
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
});
