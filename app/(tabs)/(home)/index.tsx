
import React, { useMemo, useState, useEffect } from 'react';
import { FlatList, View, Text, StyleSheet, Pressable, StatusBar, RefreshControl, Platform, useColorScheme, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import { useFootball } from '@/contexts/FootballContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useAdmin } from '@/contexts/AdminContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import ActivityCard from '@/components/ActivityCard';
import CreateActivityModal from '@/components/CreateActivityModal';
import HomeSkeleton from '@/components/HomeSkeleton';
import { IconSymbol } from '@/components/IconSymbol';
import { AdminContextWrapper } from '@/components/AdminContextWrapper';
import { colors, getColors } from '@/styles/commonStyles';
import { format, startOfWeek, endOfWeek, getWeek } from 'date-fns';
import { da } from 'date-fns/locale';
import { supabase } from '@/app/integrations/supabase/client';
import { canTrainerManageActivity } from '@/utils/permissions';

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
  const { userRole } = useUserRole();
  const { activities, loading, refresh: refreshActivities } = useHomeActivities();
  const { categories, createActivity, refreshData, currentWeekStats, toggleTaskCompletion } = useFootball();
  const { adminMode, adminTargetId, adminTargetType } = useAdmin();
  const { selectedContext } = useTeamPlayer();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviousWeeks, setShowPreviousWeeks] = useState(0);
  const [isPreviousExpanded, setIsPreviousExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentTrainerId, setCurrentTrainerId] = useState<string | null>(null);
  const colorScheme = useColorScheme();
  const themeColors = getColors(colorScheme);
  const isDark = colorScheme === 'dark';

  const currentWeekNumber = getWeek(new Date(), { weekStartsOn: 1, locale: da });
  const currentWeekLabel = getWeekLabel(new Date());

  // CRITICAL FIX: Check for both player AND team admin mode
  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetType === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  // Fetch current trainer ID (the logged-in user who is administering)
  useEffect(() => {
    async function fetchCurrentTrainerId() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentTrainerId(user.id);
          console.log('[Home] Current trainer ID:', user.id);
        }
      } catch (error) {
        console.error('[Home] Error fetching current trainer ID:', error);
      }
    }

    fetchCurrentTrainerId();
  }, []);

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
    console.log('[Home] Pull-to-refresh triggered');
    setRefreshing(true);
    try {
      await refreshActivities();
      console.log('[Home] Pull-to-refresh completed');
    } catch (error) {
      console.error('[Home] Pull-to-refresh error:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Flatten all data into a single list for FlatList
  // Each item has a type to determine how to render it
  const flattenedData = useMemo(() => {
    const data: any[] = [];

    // Add TIDLIGERE section
    if (previousByWeek.length > 0) {
      data.push({ type: 'previousHeader' });
      
      if (isPreviousExpanded) {
        visiblePreviousWeeks.forEach((weekGroup, weekIndex) => {
          data.push({ type: 'weekHeader', weekGroup, section: 'previous' });
          weekGroup.activities.forEach((activity: any) => {
            data.push({ type: 'activity', activity, section: 'previous' });
          });
        });

        if (showPreviousWeeks < previousByWeek.length) {
          data.push({ type: 'loadMore' });
        }
      }
    }

    // Add I DAG section
    data.push({ type: 'todayHeader' });
    if (todayActivities.length === 0) {
      data.push({ type: 'emptyToday' });
    } else {
      todayActivities.forEach((activity) => {
        data.push({ type: 'activity', activity, section: 'today' });
      });
    }

    // Add KOMMENDE section
    if (upcomingByWeek.length > 0) {
      data.push({ type: 'upcomingHeader' });
      upcomingByWeek.forEach((weekGroup, weekIndex) => {
        data.push({ type: 'weekHeader', weekGroup, section: 'upcoming' });
        weekGroup.activities.forEach((activity: any) => {
          data.push({ type: 'activity', activity, section: 'upcoming' });
        });
      });
    }

    return data;
  }, [previousByWeek, isPreviousExpanded, visiblePreviousWeeks, showPreviousWeeks, todayActivities, upcomingByWeek]);

  // Render item based on type
  const renderItem = ({ item }: { item: any }) => {
    switch (item.type) {
      case 'previousHeader':
        return (
          <View style={styles.section}>
            <Pressable onPress={togglePreviousExpanded}>
              <View style={styles.sectionTitleContainer}>
                <View style={styles.greenMarker} />
                <Text style={[styles.sectionTitle, { color: isDark ? '#e3e3e3' : colors.text }]}>TIDLIGERE</Text>
                <IconSymbol
                  ios_icon_name={isPreviousExpanded ? "chevron.up" : "chevron.down"}
                  android_material_icon_name={isPreviousExpanded ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                  size={18}
                  color={isDark ? '#e3e3e3' : colors.text}
                  style={styles.chevronIcon}
                />
              </View>
            </Pressable>
          </View>
        );

      case 'todayHeader':
        return (
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.greenMarker} />
              <Text style={[styles.sectionTitle, { color: isDark ? '#e3e3e3' : colors.text }]}>I DAG</Text>
            </View>
          </View>
        );

      case 'upcomingHeader':
        return (
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.greenMarker} />
              <Text style={[styles.sectionTitle, { color: isDark ? '#e3e3e3' : colors.text }]}>KOMMENDE</Text>
            </View>
          </View>
        );

      case 'weekHeader':
        return (
          <View style={styles.weekGroup}>
            <Text style={[styles.weekLabel, { color: isDark ? '#e3e3e3' : colors.text }]}>
              Uge {getWeek(item.weekGroup.weekStart, { weekStartsOn: 1, locale: da })}
            </Text>
            <Text style={[styles.weekDateRange, { color: isDark ? '#999' : colors.textSecondary }]}>{getWeekLabel(item.weekGroup.weekStart)}</Text>
          </View>
        );

      case 'activity':
        const activity = item.activity;
        
        // 1️⃣ Permission calculation (only via helper)
        const canManageActivity = canTrainerManageActivity({
          activity,
          trainerId: currentTrainerId || undefined,
          adminMode,
        });

        // 2️⃣ Determine if should dim
        const shouldDim = isAdminMode && !canManageActivity;

        // 3️⃣ Activity press handler with early return + feedback
        const handleActivityPress = () => {
          if (isAdminMode && !canManageActivity) {
            Alert.alert('Låst indhold', 'Du kan kun redigere indhold, du selv har oprettet.');
            return;
          }
          
          router.push({
            pathname: '/activity-details',
            params: { id: activity.id },
          });
        };

        return (
          <View style={[styles.activityWrapper, shouldDim && styles.activityWrapperDimmed]}>
            <ActivityCard
              activity={activity}
              resolvedDate={activity.__resolvedDateTime}
              showTasks={item.section === 'today' || item.section === 'previous'}
              onPress={handleActivityPress}
            />
          </View>
        );

      case 'emptyToday':
        return (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: isDark ? '#999' : colors.textSecondary }]}>Ingen aktiviteter i dag</Text>
          </View>
        );

      case 'loadMore':
        return (
          <View style={styles.loadMoreContainer}>
            <Pressable 
              style={[styles.loadMoreButton, { backgroundColor: isDark ? '#2a2a2a' : colors.card, borderColor: isDark ? '#444' : colors.highlight }]}
              onPress={handleLoadMorePrevious}
            >
              <Text style={[styles.loadMoreButtonText, { color: isDark ? '#e3e3e3' : colors.text }]}>
                {showPreviousWeeks === 0 ? 'Hent tidligere uger' : 'Hent en uge mere'}
              </Text>
            </Pressable>
          </View>
        );

      default:
        return null;
    }
  };

  // Key extractor for FlatList
  const keyExtractor = (item: any, index: number) => {
    if (item.type === 'activity') {
      return `activity-${item.activity.id}`;
    }
    if (item.type === 'weekHeader') {
      return `week-${item.section}-${item.weekGroup.weekStart.toISOString()}`;
    }
    return `${item.type}-${index}`;
  };

  // List header component
  const ListHeaderComponent = () => (
    <>
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
      <View style={[styles.weekHeaderContainer, { backgroundColor: isDark ? '#1a1a1a' : colors.background }]}>
        <Text style={[styles.weekHeaderTitle, { color: isDark ? '#e3e3e3' : colors.text }]}>UGE {currentWeekNumber}</Text>
        <Text style={[styles.weekHeaderSubtitle, { color: isDark ? '#999' : colors.textSecondary }]}>{currentWeekLabel}</Text>
      </View>

      {/* Performance card */}
      <LinearGradient
        colors={performanceMetrics.gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.performanceCard}
      >
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>DENNE UGE</Text>
          <View style={styles.medalBadge}>
            <Text style={styles.medalIcon}>{performanceMetrics.trophyEmoji}</Text>
          </View>
        </View>
        
        <Text style={styles.progressPercentage}>{performanceMetrics.percentageUpToToday}%</Text>
        
        <View style={styles.progressBar}>
          <View style={[styles.progressBarFill, { width: `${performanceMetrics.percentageUpToToday}%` }]} />
        </View>

        <Text style={styles.progressDetail}>
          Opgaver indtil i dag: {performanceMetrics.completedTasksToday} / {performanceMetrics.totalTasksToday}
        </Text>
        <View style={styles.progressBar}>
          <View style={[styles.progressBarFill, { width: `${performanceMetrics.percentageUpToToday}%` }]} />
        </View>

        <Text style={styles.progressDetail}>
          Hele ugen: {performanceMetrics.completedTasksWeek} / {performanceMetrics.totalTasksWeek} opgaver
        </Text>

        <Text style={styles.motivationText}>
          {performanceMetrics.motivationText}
        </Text>

        {/* Se Performance Button - Inside Performance Card */}
        <Pressable 
          style={styles.performanceButton}
          onPress={() => router.push('/(tabs)/performance')}
        >
          <Text style={styles.performanceButtonText}>Se performance</Text>
        </Pressable>
      </LinearGradient>

      {/* Create Activity Button */}
      <Pressable 
        style={styles.createButton}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.createButtonText}>+  Opret Aktivitet</Text>
      </Pressable>
    </>
  );

  // List footer component
  const ListFooterComponent = () => (
    <View style={styles.bottomSpacer} />
  );

  return (
    <AdminContextWrapper
      isAdmin={isAdminMode}
      contextName={selectedContext?.name}
      contextType={adminTargetType || 'player'}
    >
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />
      
      {loading ? (
        <HomeSkeleton />
      ) : (
        <FlatList
          data={flattenedData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooterComponent}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={Platform.OS !== 'web'}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
            />
          }
        />
      )}

      {/* Create Activity Modal */}
      {showCreateModal ? (
        <CreateActivityModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreateActivity={handleCreateActivity}
          categories={categories}
          onRefreshCategories={refreshData}
        />
      ) : null}
    </AdminContextWrapper>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingTop: 0,
  },

  // Header
  header: {
    backgroundColor: '#2C3E50',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 16,
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
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  weekHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  weekHeaderSubtitle: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Performance card
  performanceCard: {
    marginHorizontal: 16,
    marginTop: 8,
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
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  performanceButtonText: {
    fontSize: 16,
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
    letterSpacing: 0.8,
  },
  chevronIcon: {
    marginLeft: 8,
  },
  loadMoreContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
  },
  loadMoreButton: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  loadMoreButtonText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyContainer: {
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 15,
    marginBottom: 16,
    lineHeight: 22,
  },

  // Week Groups
  weekGroup: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  weekLabel: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  weekDateRange: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 18,
    letterSpacing: 0.2,
  },

  // Activity Wrapper
  activityWrapper: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  activityWrapperDimmed: {
    opacity: 0.4,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 120,
  },
});
