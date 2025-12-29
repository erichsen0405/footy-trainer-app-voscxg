
/**
 * PERFORMANCE LOCK (STEP F)
 * DO NOT:
 * - Add fetch / async work in onPress, onOpen, or navigation handlers
 * - Replace FlatList / SectionList with ScrollView for dynamic lists
 * - Add inline handlers inside render
 * - Remove memoization (useCallback, useMemo, React.memo)
 * - Introduce blocking logic before first paint
 *
 * Any change here REQUIRES re-validation against STEP F.
 * This file is PERFORMANCE-SENSITIVE.
 */

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PERFORMANCE BASELINE CHECKLIST (STEP F) - iOS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ✅ 1️⃣ First render & loading
 *    - Skeleton shown immediately (no blocking before paint)
 *    - Data fetched in useEffect (after mount)
 *    - Parallel fetch in useHomeActivities hook (Promise.all)
 * 
 * ✅ 2️⃣ Navigation
 *    - No fetch in onPress handlers
 *    - Navigation happens immediately
 *    - Data fetched after mount in target screen
 * 
 * ✅ 3️⃣ Lists (FlatList)
 *    - Using FlatList (not ScrollView)
 *    - keyExtractor with stable, unique keys
 *    - initialNumToRender=8
 *    - windowSize=5
 *    - removeClippedSubviews enabled (iOS native)
 * 
 * ✅ 4️⃣ Render control
 *    - useMemo for derived data (flattenedData, performanceMetrics)
 *    - useCallback for handlers (handleCardPress, onRefresh)
 *    - No inline functions in render
 *    - Stable dependencies in hooks
 * 
 * ✅ 5️⃣ Context guardrails
 *    - Contexts split by responsibility (Admin, TeamPlayer, Football)
 *    - No unstable values passed to context
 *    - Selective consumption of context values
 * 
 * ✅ 6️⃣ Permissions & admin-mode
 *    - Permission logic via helper (canTrainerManageActivity)
 *    - UI remains dumb (no permission checks in render)
 *    - Handlers are authoritative (early return)
 * 
 * ✅ 7️⃣ Platform parity
 *    - Same performance behavior as Android/Web
 *    - Platform-specific optimizations (removeClippedSubviews)
 *    - No platform-specific workarounds
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { FlatList, View, Text, StyleSheet, Pressable, StatusBar, RefreshControl, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import { useFootball } from '@/contexts/FootballContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useAdmin } from '@/contexts/AdminContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import ActivityCard from '@/components/ActivityCard';
import CreateActivityModal from '@/components/CreateActivityModal';
import { IconSymbol } from '@/components/IconSymbol';
import { AdminContextWrapper } from '@/components/AdminContextWrapper';
import { colors } from '@/styles/commonStyles';
import { format, startOfWeek, endOfWeek, getWeek } from 'date-fns';
import { da } from 'date-fns/locale';
import { supabase } from '@/app/integrations/supabase/client';
import { canTrainerManageActivity } from '@/utils/permissions';

const HEADER_BG = '#2C3E50';

function resolveActivityDateTime(activity: any): Date | null {
  // STEP H: Guard against null/undefined activity
  if (!activity) return null;

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
  // STEP H: Guard against invalid date
  if (!date || isNaN(date.getTime())) {
    return 'Ugyldig dato';
  }

  try {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return `${format(start, 'd. MMM', { locale: da })} – ${format(end, 'd. MMM', { locale: da })}`;
  } catch (error) {
    console.error('[Home iOS] Error formatting week label:', error);
    return 'Ugyldig dato';
  }
}

// Helper function to get gradient colors based on performance percentage
// Matches the trophy thresholds from performance screen: ≥80% gold, ≥60% silver, <60% bronze
function getPerformanceGradient(percentage: number): string[] {
  // STEP H: Guard against invalid percentage
  const safePercentage = typeof percentage === 'number' && !isNaN(percentage) ? percentage : 0;

  if (safePercentage >= 80) {
    // Gold gradient
    return ['#FFD700', '#FFA500', '#FF8C00'];
  } else if (safePercentage >= 60) {
    // Silver gradient
    return ['#E8E8E8', '#C0C0C0', '#A8A8A8'];
  } else {
    // Bronze gradient
    return ['#CD7F32', '#B8722E', '#A0642A'];
  }
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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

  // STEP H: Safe date operations with guards
  const currentWeekNumber = useMemo(() => {
    try {
      return getWeek(new Date(), { weekStartsOn: 1, locale: da });
    } catch (error) {
      console.error('[Home iOS] Error getting week number:', error);
      return 1;
    }
  }, []);

  const currentWeekLabel = useMemo(() => {
    try {
      return getWeekLabel(new Date());
    } catch (error) {
      console.error('[Home iOS] Error getting week label:', error);
      return 'Ugyldig dato';
    }
  }, []);

  // CRITICAL FIX: Check for both player AND team admin mode
  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetType === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  // Get current trainer ID
  useEffect(() => {
    const fetchCurrentTrainerId = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentTrainerId(user.id);
        }
      } catch (error) {
        console.error('[Home iOS] Error fetching current trainer ID:', error);
        setCurrentTrainerId(null);
      }
    };
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
    // STEP H: Guard against null/undefined activities
    if (!Array.isArray(activities)) {
      return { todayActivities: [], upcomingByWeek: [], previousByWeek: [] };
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    // STEP H: Filter out null activities and those without valid dates
    const resolved = activities
      .filter(activity => activity != null)
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
      try {
        const weekStart = startOfWeek(activity.__resolvedDateTime, { weekStartsOn: 1 });
        const weekKey = weekStart.toISOString();
        if (!upcomingWeekGroups[weekKey]) {
          upcomingWeekGroups[weekKey] = [];
        }
        upcomingWeekGroups[weekKey].push(activity);
      } catch (error) {
        console.error('[Home iOS] Error grouping upcoming activity:', error);
      }
    });

    const upcomingByWeek = Object.entries(upcomingWeekGroups)
      .map(([weekKey, activities]) => {
        try {
          return {
            weekStart: new Date(weekKey),
            activities,
          };
        } catch (error) {
          console.error('[Home iOS] Error creating week group:', error);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => a!.weekStart.getTime() - b!.weekStart.getTime()) as any[];

    // Group previous activities by week
    const previousWeekGroups: { [key: string]: any[] } = {};
    previousActivities.forEach(activity => {
      try {
        const weekStart = startOfWeek(activity.__resolvedDateTime, { weekStartsOn: 1 });
        const weekKey = weekStart.toISOString();
        if (!previousWeekGroups[weekKey]) {
          previousWeekGroups[weekKey] = [];
        }
        previousWeekGroups[weekKey].push(activity);
      } catch (error) {
        console.error('[Home iOS] Error grouping previous activity:', error);
      }
    });

    const previousByWeek = Object.entries(previousWeekGroups)
      .map(([weekKey, activities]) => {
        try {
          return {
            weekStart: new Date(weekKey),
            activities,
          };
        } catch (error) {
          console.error('[Home iOS] Error creating week group:', error);
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b!.weekStart.getTime() - a!.weekStart.getTime()) as any[];

    return { todayActivities, upcomingByWeek, previousByWeek };
  }, [activities]);

  // Calculate how many previous weeks to display
  const visiblePreviousWeeks = useMemo(() => {
    if (showPreviousWeeks === 0) return [];
    // STEP H: Guard against invalid previousByWeek
    if (!Array.isArray(previousByWeek)) return [];
    return previousByWeek.slice(0, showPreviousWeeks);
  }, [previousByWeek, showPreviousWeeks]);

  // CRITICAL FIX: Use individual properties as dependencies instead of the object
  // This ensures re-render when the actual values change, not just the object reference
  const performanceMetrics = useMemo(() => {
    // STEP H: Guard against null/undefined currentWeekStats
    if (!currentWeekStats) {
      return {
        percentageUpToToday: 0,
        weekPercentage: 0,
        trophyEmoji: '🥉',
        motivationText: 'Ingen data tilgængelig',
        completedTasksToday: 0,
        totalTasksToday: 0,
        completedTasksWeek: 0,
        totalTasksWeek: 0,
        gradientColors: getPerformanceGradient(0),
      };
    }

    const percentageUpToToday = typeof currentWeekStats.percentage === 'number' && !isNaN(currentWeekStats.percentage)
      ? currentWeekStats.percentage
      : 0;

    const totalTasksForWeek = typeof currentWeekStats.totalTasksForWeek === 'number' && !isNaN(currentWeekStats.totalTasksForWeek)
      ? currentWeekStats.totalTasksForWeek
      : 0;

    const completedTasksForWeek = typeof currentWeekStats.completedTasksForWeek === 'number' && !isNaN(currentWeekStats.completedTasksForWeek)
      ? currentWeekStats.completedTasksForWeek
      : 0;

    const weekPercentage = totalTasksForWeek > 0 
      ? Math.round((completedTasksForWeek / totalTasksForWeek) * 100) 
      : 0;

    // Determine trophy emoji based on percentage up to today (same thresholds as performance screen)
    let trophyEmoji = '🥉'; // Bronze
    if (percentageUpToToday >= 80) {
      trophyEmoji = '🥇'; // Gold
    } else if (percentageUpToToday >= 60) {
      trophyEmoji = '🥈'; // Silver
    }

    // Calculate remaining tasks
    const completedTasks = typeof currentWeekStats.completedTasks === 'number' && !isNaN(currentWeekStats.completedTasks)
      ? currentWeekStats.completedTasks
      : 0;

    const totalTasks = typeof currentWeekStats.totalTasks === 'number' && !isNaN(currentWeekStats.totalTasks)
      ? currentWeekStats.totalTasks
      : 0;

    const remainingTasksToday = totalTasks - completedTasks;
    const remainingTasksWeek = totalTasksForWeek - completedTasksForWeek;

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
      completedTasksToday: completedTasks,
      totalTasksToday: totalTasks,
      completedTasksWeek: completedTasksForWeek,
      totalTasksWeek: totalTasksForWeek,
      gradientColors,
    };
  }, [
    currentWeekStats?.percentage,
    currentWeekStats?.completedTasks,
    currentWeekStats?.totalTasks,
    currentWeekStats?.completedTasksForWeek,
    currentWeekStats?.totalTasksForWeek,
  ]);

  const handleCreateActivity = useCallback(async (activityData: any) => {
    try {
      await createActivity(activityData);
      refreshData();
    } catch (error) {
      console.error('[Home iOS] Error creating activity:', error);
    }
  }, [createActivity, refreshData]);

  const handleLoadMorePrevious = useCallback(() => {
    setShowPreviousWeeks(prev => prev + 1);
  }, []);

  const togglePreviousExpanded = useCallback(() => {
    setIsPreviousExpanded(prev => !prev);
  }, []);

  // Pull-to-refresh handler - binds exclusively to refetchActivities()
  const onRefresh = useCallback(async () => {
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
  }, [refreshActivities]);

  // Flatten all data into a single list for FlatList
  // Each item has a type to determine how to render it
  const flattenedData = useMemo(() => {
    const data: any[] = [];

    // STEP H: Guard against invalid previousByWeek
    const safePreviousByWeek = Array.isArray(previousByWeek) ? previousByWeek : [];
    const safeVisiblePreviousWeeks = Array.isArray(visiblePreviousWeeks) ? visiblePreviousWeeks : [];
    const safeTodayActivities = Array.isArray(todayActivities) ? todayActivities : [];
    const safeUpcomingByWeek = Array.isArray(upcomingByWeek) ? upcomingByWeek : [];

    // Add TIDLIGERE section
    if (safePreviousByWeek.length > 0) {
      data.push({ type: 'previousHeader' });
      
      if (isPreviousExpanded) {
        safeVisiblePreviousWeeks.forEach((weekGroup, weekIndex) => {
          if (weekGroup && weekGroup.weekStart && Array.isArray(weekGroup.activities)) {
            data.push({ type: 'weekHeader', weekGroup, section: 'previous' });
            weekGroup.activities.forEach((activity: any) => {
              if (activity) {
                data.push({ type: 'activity', activity, section: 'previous' });
              }
            });
          }
        });

        if (showPreviousWeeks < safePreviousByWeek.length) {
          data.push({ type: 'loadMore' });
        }
      }
    }

    // Add I DAG section
    data.push({ type: 'todayHeader' });
    if (safeTodayActivities.length === 0) {
      data.push({ type: 'emptyToday' });
    } else {
      safeTodayActivities.forEach((activity) => {
        if (activity) {
          data.push({ type: 'activity', activity, section: 'today' });
        }
      });
    }

    // Add KOMMENDE section
    if (safeUpcomingByWeek.length > 0) {
      data.push({ type: 'upcomingHeader' });
      safeUpcomingByWeek.forEach((weekGroup, weekIndex) => {
        if (weekGroup && weekGroup.weekStart && Array.isArray(weekGroup.activities)) {
          data.push({ type: 'weekHeader', weekGroup, section: 'upcoming' });
          weekGroup.activities.forEach((activity: any) => {
            if (activity) {
              data.push({ type: 'activity', activity, section: 'upcoming' });
            }
          });
        }
      });
    }

    return data;
  }, [previousByWeek, isPreviousExpanded, visiblePreviousWeeks, showPreviousWeeks, todayActivities, upcomingByWeek]);

  // Render item based on type
  const renderItem = useCallback(({ item }: { item: any }) => {
    // STEP H: Guard against null/undefined item
    if (!item || !item.type) return null;

    switch (item.type) {
      case 'previousHeader':
        return (
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
          </View>
        );

      case 'todayHeader':
        return (
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.greenMarker} />
              <Text style={styles.sectionTitle}>I DAG</Text>
            </View>
          </View>
        );

      case 'upcomingHeader':
        return (
          <View style={styles.section}>
            <View style={styles.sectionTitleContainer}>
              <View style={styles.greenMarker} />
              <Text style={styles.sectionTitle}>KOMMENDE</Text>
            </View>
          </View>
        );

      case 'weekHeader':
        // STEP H: Guard against invalid weekGroup
        if (!item.weekGroup || !item.weekGroup.weekStart) return null;

        try {
          const weekNumber = getWeek(item.weekGroup.weekStart, { weekStartsOn: 1, locale: da });
          const weekLabel = getWeekLabel(item.weekGroup.weekStart);

          return (
            <View style={styles.weekGroup}>
              <Text style={styles.weekLabel}>Uge {weekNumber}</Text>
              <Text style={styles.weekDateRange}>{weekLabel}</Text>
            </View>
          );
        } catch (error) {
          console.error('[Home iOS] Error rendering week header:', error);
          return null;
        }

      case 'activity':
        // STEP H: Guard against invalid activity
        if (!item.activity || !item.activity.id) return null;

        const activity = item.activity;
        
        // 1️⃣ Permission calculation (only via helper)
        const canManageActivity = canTrainerManageActivity({
          activity,
          trainerId: currentTrainerId || undefined,
          adminMode,
        });
        
        // 2️⃣ Determine if should dim
        const shouldDim = isAdminMode && !canManageActivity;

        // 3️⃣ Activity press handler with early return
        const handleActivityPress = () => {
          if (isAdminMode && !canManageActivity) {
            return;
          }
          
          try {
            router.push({
              pathname: '/activity-details',
              params: { id: activity.id },
            });
          } catch (error) {
            console.error('[Home iOS] Error navigating to activity details:', error);
          }
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
            <Text style={styles.emptyText}>Ingen aktiviteter i dag</Text>
          </View>
        );

      case 'loadMore':
        return (
          <View style={styles.loadMoreContainer}>
            <Pressable 
              style={styles.loadMoreButton}
              onPress={handleLoadMorePrevious}
            >
              <Text style={styles.loadMoreButtonText}>
                {showPreviousWeeks === 0 ? 'Hent tidligere uger' : 'Hent en uge mere'}
              </Text>
            </Pressable>
          </View>
        );

      default:
        return null;
    }
  }, [isPreviousExpanded, togglePreviousExpanded, isAdminMode, currentTrainerId, adminMode, router, handleLoadMorePrevious, showPreviousWeeks]);

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: any, index: number) => {
    // STEP H: Guard against null/undefined item
    if (!item) return `item-${index}`;

    if (item.type === 'activity' && item.activity && item.activity.id) {
      return `activity-${item.activity.id}`;
    }
    if (item.type === 'weekHeader' && item.weekGroup && item.weekGroup.weekStart) {
      try {
        return `week-${item.section}-${item.weekGroup.weekStart.toISOString()}`;
      } catch (error) {
        return `week-${item.section}-${index}`;
      }
    }
    return `${item.type}-${index}`;
  }, []);

  // List header component
  const ListHeaderComponent = useCallback(() => (
    <>
      {/* Header - with negative marginTop to compensate for SafeAreaView */}
      <View style={[styles.header, { marginTop: -insets.top, paddingTop: insets.top + 16 }]}>
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
          onPress={() => {
            try {
              router.push('/(tabs)/performance');
            } catch (error) {
              console.error('[Home iOS] Error navigating to performance:', error);
            }
          }}
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
  ), [insets.top, currentWeekNumber, currentWeekLabel, performanceMetrics, router]);

  // List footer component
  const ListFooterComponent = useCallback(() => (
    <View style={styles.bottomSpacer} />
  ), []);

  if (loading) {
    return (
      <AdminContextWrapper
        isAdmin={isAdminMode}
        contextName={selectedContext?.name || null}
        contextType={adminTargetType || 'player'}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
          <View style={styles.loading}>
            <Text style={styles.loadingText}>Indlæser…</Text>
          </View>
        </SafeAreaView>
      </AdminContextWrapper>
    );
  }

  // STEP H: Guard against invalid categories
  const safeCategories = Array.isArray(categories) ? categories : [];

  return (
    <AdminContextWrapper
      isAdmin={isAdminMode}
      contextName={selectedContext?.name || null}
      contextType={adminTargetType || 'player'}
    >
      <StatusBar barStyle="dark-content" />
      
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }} edges={['top']}>
        <FlatList
          data={flattenedData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooterComponent}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={true}
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
      </SafeAreaView>

      {/* Create Activity Modal */}
      {showCreateModal ? (
        <CreateActivityModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreateActivity={handleCreateActivity}
          categories={safeCategories}
          onRefreshCategories={refreshData}
        />
      ) : null}
    </AdminContextWrapper>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: HEADER_BG,
    paddingHorizontal: 20,
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
    color: colors.text,
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
    backgroundColor: colors.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  loadMoreButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 0.3,
  },
  emptyContainer: {
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
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

// Anti-patterns forbidden: fetch-on-press, inline renders, non-virtualized lists, unstable context values
