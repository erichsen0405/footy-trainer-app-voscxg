
import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import { useFootball } from '@/contexts/FootballContext';
import ActivityCard from '@/components/ActivityCard';
import CreateActivityModal from '@/components/CreateActivityModal';
import { colors } from '@/styles/commonStyles';
import { format, startOfWeek, endOfWeek, getWeek } from 'date-fns';
import { da } from 'date-fns/locale';

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
  return `${format(start, 'd. MMM', { locale: da })} – ${format(end, 'd. MMM', { locale: da })}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { activities, loading } = useHomeActivities();
  const { categories, createActivity, refreshData } = useFootball();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviousWeeks, setShowPreviousWeeks] = useState(false);

  const currentWeekNumber = getWeek(new Date(), { weekStartsOn: 1, locale: da });
  const currentWeekLabel = getWeekLabel(new Date());

  const { todayActivities, upcomingByWeek, previousByWeek } = useMemo(() => {
    if (!Array.isArray(activities)) {
      return { todayActivities: [], upcomingByWeek: [], previousByWeek: [] };
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

    const previousActivities = resolved
      .filter(a => a.__resolvedDateTime < todayStart)
      .sort(
        (a, b) =>
          b.__resolvedDateTime.getTime() -
          a.__resolvedDateTime.getTime()
      );

    // Group upcoming activities by week
    const upcomingWeekGroups: { [key: string]: any[] } = {};
    upcomingActivities.forEach(activity => {
      const weekStart = startOfWeek(activity.__resolvedDateTime, { weekStartsOn: 1 });
      const weekKey = weekStart.toISOString();
      if (!upcomingWeekGroups[weekKey]) {
        upcomingWeekGroups[weekKey] = [];
      }
      upcomingWeekGroups[weekKey].push(activity);
    });

    const upcomingByWeek = Object.entries(upcomingWeekGroups)
      .map(([weekKey, activities]) => ({
        weekStart: new Date(weekKey),
        activities,
      }))
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

    // Group previous activities by week
    const previousWeekGroups: { [key: string]: any[] } = {};
    previousActivities.forEach(activity => {
      const weekStart = startOfWeek(activity.__resolvedDateTime, { weekStartsOn: 1 });
      const weekKey = weekStart.toISOString();
      if (!previousWeekGroups[weekKey]) {
        previousWeekGroups[weekKey] = [];
      }
      previousWeekGroups[weekKey].push(activity);
    });

    const previousByWeek = Object.entries(previousWeekGroups)
      .map(([weekKey, activities]) => ({
        weekStart: new Date(weekKey),
        activities,
      }))
      .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());

    return { todayActivities, upcomingByWeek, previousByWeek };
  }, [activities]);

  const handleCreateActivity = async (activityData: any) => {
    await createActivity(activityData);
    refreshData();
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

        {/* Week Header */}
        <View style={styles.weekHeaderContainer}>
          <Text style={styles.weekHeaderTitle}>UGE {currentWeekNumber}</Text>
          <Text style={styles.weekHeaderSubtitle}>{currentWeekLabel}</Text>
        </View>

        {/* Weekly Progress Card with Red Gradient */}
        <View style={styles.progressCardContainer}>
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
          </LinearGradient>

          <Pressable 
            style={styles.performanceButton}
            onPress={() => router.push('/(tabs)/performance')}
          >
            <Text style={styles.performanceButtonText}>📊  Se Performance  →</Text>
          </Pressable>
        </View>

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
                showTasks={true}
              />
            </View>
          ))}
        </View>

        {/* KOMMENDE Section */}
        {upcomingByWeek.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.greenMarker} />
              <View style={styles.sectionHeaderContent}>
                <Text style={styles.sectionTitle}>KOMMENDE</Text>
                {!showPreviousWeeks && previousByWeek.length > 0 && (
                  <Pressable 
                    style={styles.previousButton}
                    onPress={() => setShowPreviousWeeks(true)}
                  >
                    <Text style={styles.previousButtonText}>▲ Tidligere</Text>
                  </Pressable>
                )}
              </View>
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
                      showTasks={false}
                    />
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* TIDLIGERE Section */}
        {showPreviousWeeks && previousByWeek.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.greenMarker} />
              <Text style={styles.sectionTitle}>TIDLIGERE</Text>
            </View>

            {previousByWeek.map((weekGroup, weekIndex) => (
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
                      showTasks={false}
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

  // Week Header
  weekHeaderContainer: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  weekHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  weekHeaderSubtitle: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },

  // Progress Card Container
  progressCardContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  progressCard: {
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
    marginTop: -44,
    marginHorizontal: 24,
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
    marginTop: 28,
    marginBottom: 8,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  greenMarker: {
    width: 5,
    height: 32,
    backgroundColor: '#4CAF50',
    borderRadius: 2.5,
    marginRight: 14,
  },
  sectionHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.8,
  },
  previousButton: {
    backgroundColor: colors.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  previousButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 16,
    lineHeight: 22,
  },

  // Week Groups
  weekGroup: {
    marginBottom: 28,
  },
  weekLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  weekDateRange: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 18,
    letterSpacing: 0.2,
  },

  // Activity Wrapper
  activityWrapper: {
    marginBottom: 16,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 120,
  },
});
