
import React, { useMemo, useState, useEffect } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, StatusBar, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import { useFootball } from '@/contexts/FootballContext';
import ActivityCard from '@/components/ActivityCard';
import CreateActivityModal from '@/components/CreateActivityModal';
import { IconSymbol } from '@/components/IconSymbol';
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

// Helper function to get gradient colors based on performance percentage
// Matches the trophy thresholds from performance screen: ≥80% gold, ≥60% silver, <60% bronze
function getPerformanceGradient(percentage: number): string[] {
  if (percentage >= 80) {
    // Gold gradient
    return ['#FFD700', '#FFA500', '#FF8C00'];
  } else if (percentage >= 60) {
    // Silver gradient
    return ['#E8E8E8', '#C0C0C0', '#A8A8A8'];
  } else {
    // Bronze gradient
    return ['#CD7F32', '#B8722E', '#A0642A'];
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const { activities, loading, refresh: refreshActivities } = useHomeActivities();
  const { categories, createActivity, refreshData, currentWeekStats } = useFootball();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviousWeeks, setShowPreviousWeeks] = useState(0);
  const [isPreviousExpanded, setIsPreviousExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const currentWeekNumber = getWeek(new Date(), { weekStartsOn: 1, locale: da });
  const currentWeekLabel = getWeekLabel(new Date());

  // Reset "TIDLIGERE" section when loading starts (pull-to-refresh or navigation back)
  useEffect(() => {
    if (loading) {
      setIsPreviousExpanded(false);
      setShowPreviousWeeks(0);
    }
  }, [loading]);

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

  // Calculate how many previous weeks to display
  const visiblePreviousWeeks = useMemo(() => {
    if (showPreviousWeeks === 0) return [];
    return previousByWeek.slice(0, showPreviousWeeks);
  }, [previousByWeek, showPreviousWeeks]);

  // CRITICAL FIX: Use individual properties as dependencies instead of the object
  // This ensures re-render when the actual values change, not just the object reference
  const performanceMetrics = useMemo(() => {
    const percentageUpToToday = currentWeekStats.percentage;
    const weekPercentage = currentWeekStats.totalTasksForWeek > 0 
      ? Math.round((currentWeekStats.completedTasksForWeek / currentWeekStats.totalTasksForWeek) * 100) 
      : 0;

    // Determine trophy emoji based on percentage up to today (same thresholds as performance screen)
    let trophyEmoji = '🥉'; // Bronze
    if (percentageUpToToday >= 80) {
      trophyEmoji = '🥇'; // Gold
    } else if (percentageUpToToday >= 60) {
      trophyEmoji = '🥈'; // Silver
    }

    // Calculate remaining tasks
    const remainingTasksToday = currentWeekStats.totalTasks - currentWeekStats.completedTasks;
    const remainingTasksWeek = currentWeekStats.totalTasksForWeek - currentWeekStats.completedTasksForWeek;

    // Generate motivation text
    let motivationText = '';
    if (percentageUpToToday >= 80) {
      motivationText = `Fantastisk! Du er helt på toppen! ${remainingTasksToday > 0 ? `${remainingTasksToday} opgaver tilbage indtil i dag.` : 'Alle opgaver indtil i dag er fuldført! 🌟'}\n${remainingTasksWeek > 0 ? `${remainingTasksWeek} opgaver tilbage for ugen.` : 'Hele ugen er fuldført! 🎉'} ⚽`;
    } else if (percentageUpToToday >= 60) {
      motivationText = `Rigtig godt! Du klarer dig godt! ${remainingTasksToday > 0 ? `${remainingTasksToday} opgaver tilbage indtil i dag.` : 'Alle opgaver indtil i dag er fuldført! 💪'}\n${remainingTasksWeek > 0 ? `${remainingTasksWeek} opgaver tilbage for ugen.` : 'Hele ugen er fuldført! 🎉'} ⚽`;
    } else if (percentageUpToToday >= 40) {
      motivationText = `Du er på vej! ${remainingTasksToday > 0 ? `${remainingTasksToday} opgaver tilbage indtil i dag.` : 'Alle opgaver indtil i dag er fuldført!'}\n${remainingTasksWeek > 0 ? `${remainingTasksWeek} opgaver tilbage for ugen.` : 'Hele ugen er fuldført!'} 🔥`;
    } else {
      motivationText = `Hver træning tæller! ${remainingTasksToday > 0 ? `${remainingTasksToday} opgaver tilbage indtil i dag.` : 'Alle opgaver indtil i dag er fuldført!'}\n${remainingTasksWeek > 0 ? `${remainingTasksWeek} opgaver tilbage for ugen.` : 'Hele ugen er fuldført!'} ⚽`;
    }

    // Get gradient colors based on performance (same thresholds as performance screen)
    const gradientColors = getPerformanceGradient(percentageUpToToday);

    return {
      percentageUpToToday,
      weekPercentage,
      trophyEmoji,
      motivationText,
      completedTasksToday: currentWeekStats.completedTasks,
      totalTasksToday: currentWeekStats.totalTasks,
      completedTasksWeek: currentWeekStats.completedTasksForWeek,
      totalTasksWeek: currentWeekStats.totalTasksForWeek,
      gradientColors,
    };
  }, [
    currentWeekStats.percentage,
    currentWeekStats.completedTasks,
    currentWeekStats.totalTasks,
    currentWeekStats.completedTasksForWeek,
    currentWeekStats.totalTasksForWeek,
  ]);

  const handleCreateActivity = async (activityData: any) => {
    await createActivity(activityData);
    refreshData();
  };

  const handleLoadMorePrevious = () => {
    setShowPreviousWeeks(prev => prev + 1);
  };

  const togglePreviousExpanded = () => {
    setIsPreviousExpanded(prev => !prev);
  };

  // Pull-to-refresh handler - binds exclusively to refetchActivities()
  const onRefresh = async () => {
    console.log('[Home iOS] Pull-to-refresh triggered');
    setRefreshing(true);
    try {
      await refreshActivities();
      console.log('[Home iOS] Pull-to-refresh completed');
    } catch (error) {
      console.error('[Home iOS] Pull-to-refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading} edges={['top']}>
        <Text style={styles.loadingText}>Indlæser…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']} pointerEvents="box-none">
      <StatusBar barStyle="dark-content" />
      
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.text}
          />
        }
      >
        {/* Header */}
        <View style={styles.header} pointerEvents="box-none">
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
        <View style={styles.weekHeaderContainer} pointerEvents="box-none">
          <Text style={styles.weekHeaderTitle}>UGE {currentWeekNumber}</Text>
          <Text style={styles.weekHeaderSubtitle}>{currentWeekLabel}</Text>
        </View>

        {/* Weekly Progress Card with Dynamic Gradient */}
        <View style={styles.progressCardContainer} pointerEvents="box-none">
          <Pressable 
            onPress={() => {
              console.log('[Home iOS] Performance button pressed');
              router.push('/(tabs)/performance');
            }}
            style={styles.pressableWrapper}
          >
            <LinearGradient
              colors={performanceMetrics.gradientColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.progressCard}
              pointerEvents="box-none"
            >
              <View style={styles.progressHeader} pointerEvents="none">
                <Text style={styles.progressLabel}>DENNE UGE</Text>
                <View style={styles.medalBadge}>
                  <Text style={styles.medalIcon}>{performanceMetrics.trophyEmoji}</Text>
                </View>
              </View>
              
              <Text style={styles.progressPercentage}>{performanceMetrics.percentageUpToToday}%</Text>
              
              <View style={styles.progressBar} pointerEvents="none">
                <View style={[styles.progressBarFill, { width: `${performanceMetrics.percentageUpToToday}%` }]} />
              </View>

              <Text style={styles.progressDetail}>
                Opgaver indtil i dag: {performanceMetrics.completedTasksToday} / {performanceMetrics.totalTasksToday}
              </Text>
              <View style={styles.progressBar} pointerEvents="none">
                <View style={[styles.progressBarFill, { width: `${performanceMetrics.percentageUpToToday}%` }]} />
              </View>

              <Text style={styles.progressDetail}>
                Hele ugen: {performanceMetrics.completedTasksWeek} / {performanceMetrics.totalTasksWeek} opgaver
              </Text>

              <Text style={styles.motivationText}>
                {performanceMetrics.motivationText}
              </Text>

              <View style={styles.performanceButton} pointerEvents="none">
                <Text style={styles.performanceButtonText}>📊  Se Performance  →</Text>
              </View>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Create Activity Button */}
        <Pressable 
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <Text style={styles.createButtonText}>+  Opret Aktivitet</Text>
        </Pressable>

        {/* TIDLIGERE Section - Collapsible */}
        {previousByWeek.length > 0 && (
          <View style={styles.section}>
            <Pressable onPress={togglePreviousExpanded}>
              <View style={styles.sectionTitleContainer}>
                <View style={styles.greenMarker} />
                <Text style={styles.sectionTitle}>TIDLIGERE</Text>
                <IconSymbol
                  ios_icon_name={isPreviousExpanded ? "chevron.up" : "chevron.down"}
                  android_material_icon_name={isPreviousExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                  size={18}
                  color={colors.text}
                  style={styles.chevronIcon}
                />
              </View>
            </Pressable>

            {isPreviousExpanded && (
              <>
                {visiblePreviousWeeks.map((weekGroup, weekIndex) => (
                  <View key={`previous-week-${weekGroup.weekStart.toISOString()}`} style={styles.weekGroup}>
                    <Text style={styles.weekLabel}>
                      Uge {getWeek(weekGroup.weekStart, { weekStartsOn: 1, locale: da })}
                    </Text>
                    <Text style={styles.weekDateRange}>{getWeekLabel(weekGroup.weekStart)}</Text>

                    {weekGroup.activities.map((activity) => (
                      <View key={activity.id} style={styles.activityWrapper}>
                        <ActivityCard
                          activity={activity}
                          resolvedDate={activity.__resolvedDateTime}
                          showTasks={true}
                        />
                      </View>
                    ))}
                  </View>
                ))}

                {/* Load More Button - Show if there are more weeks to load */}
                {showPreviousWeeks < previousByWeek.length && (
                  <Pressable 
                    style={styles.loadMoreButton}
                    onPress={handleLoadMorePrevious}
                  >
                    <Text style={styles.loadMoreButtonText}>
                      {showPreviousWeeks === 0 ? 'Hent tidligere uger' : 'Hent en uge mere'}
                    </Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        )}

        {/* I DAG Section */}
        <View style={styles.section}>
          <View style={styles.sectionTitleContainer}>
            <View style={styles.greenMarker} />
            <Text style={styles.sectionTitle}>I DAG</Text>
          </View>

          {todayActivities.length === 0 && (
            <Text style={styles.emptyText}>Ingen aktiviteter i dag</Text>
          )}

          {todayActivities.map((activity) => (
            <View key={activity.id} style={styles.activityWrapper}>
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
              <Text style={styles.sectionTitle}>KOMMENDE</Text>
            </View>

            {upcomingByWeek.map((weekGroup, weekIndex) => (
              <View key={`upcoming-week-${weekGroup.weekStart.toISOString()}`} style={styles.weekGroup}>
                <Text style={styles.weekLabel}>
                  Uge {getWeek(weekGroup.weekStart, { weekStartsOn: 1, locale: da })}
                </Text>
                <Text style={styles.weekDateRange}>{getWeekLabel(weekGroup.weekStart)}</Text>

                {weekGroup.activities.map((activity) => (
                  <View key={activity.id} style={styles.activityWrapper}>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingTop: 0,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },

  // Header
  header: {
    backgroundColor: '#2C3E50',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
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
  pressableWrapper: {
    borderRadius: 24,
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
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.8,
  },
  chevronIcon: {
    marginLeft: 8,
  },
  loadMoreButton: {
    backgroundColor: colors.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    marginTop: 12,
  },
  loadMoreButtonText: {
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
