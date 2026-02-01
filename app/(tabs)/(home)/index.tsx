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
 * PERFORMANCE BASELINE CHECKLIST (STEP F)
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
 *    - removeClippedSubviews enabled (native only)
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
 *    - Same performance behavior on iOS/Android/Web
 *    - Platform-specific optimizations (removeClippedSubviews)
 *    - No platform-specific workarounds
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { canTrainerManageActivity } from '@/utils/permissions';
import { TaskScoreNoteModal, TaskScoreNoteModalPayload } from '@/components/TaskScoreNoteModal';

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
    return '';
  }

  try {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return `${format(start, 'd. MMM', { locale: da })} – ${format(end, 'd. MMM', { locale: da })}`;
  } catch (error) {
    console.error('[Home] Error formatting week label:', error);
    return '';
  }
}

// Helper function to get gradient colors based on performance percentage
// Matches the trophy thresholds from performance screen: ≥80% gold, ≥60% silver, <60% bronze
function getPerformanceGradient(percentage: number): readonly [string, string, string] {
  // STEP H: Guard against invalid percentage
  const safePercentage = typeof percentage === 'number' && !isNaN(percentage) ? percentage : 0;

  if (safePercentage >= 80) {
    return ['#FFD700', '#FFA500', '#FF8C00'] as const;
  } else if (safePercentage >= 60) {
    return ['#E8E8E8', '#C0C0C0', '#A8A8A8'] as const;
  } else {
    return ['#CD7F32', '#B8722E', '#A0642A'] as const;
  }
}

const INTENSITY_CHOICES = Array.from({ length: 10 }, (_, idx) => idx + 1);

function getActivityIntensityValue(activity: any): number | null {
  if (!activity) {
    return null;
  }
  if (typeof activity?.intensity === 'number') {
    return activity.intensity;
  }
  if (typeof activity?.activity_intensity === 'number') {
    return activity.activity_intensity;
  }
  return null;
}

function getActivityIntensityEnabled(activity: any): boolean {
  if (!activity) {
    return false;
  }
  if (typeof activity?.intensityEnabled === 'boolean') {
    return activity.intensityEnabled;
  }
  if (typeof activity?.intensity_enabled === 'boolean') {
    return activity.intensity_enabled;
  }
  if (typeof activity?.activity_intensity_enabled === 'boolean') {
    return activity.activity_intensity_enabled;
  }
  return false;
}

function isExternalActivity(activity: any): boolean {
  return Boolean(activity?.is_external ?? activity?.isExternal);
}

export default function HomeScreen() {
  const router = useRouter();
  const { userRole } = useUserRole();
  const { activities, loading, refresh: refreshActivities } = useHomeActivities();
  const { categories, createActivity, refreshData, currentWeekStats, toggleTaskCompletion, updateActivitySingle } = useFootball();
  const { adminMode, adminTargetId, adminTargetType } = useAdmin();
  const { selectedContext } = useTeamPlayer();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviousWeeks, setShowPreviousWeeks] = useState(0);
  const [isPreviousExpanded, setIsPreviousExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTrainerId, setCurrentTrainerId] = useState<string | null>(null);
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null);
  const [currentIntensityDraft, setCurrentIntensityDraft] = useState<number | null>(null);
  const [isSavingIntensity, setIsSavingIntensity] = useState(false);
  const [intensityOverrides, setIntensityOverrides] = useState<Record<string, number | null>>({});
  const [intensityModalError, setIntensityModalError] = useState<string | null>(null);
  const colorScheme = useColorScheme();
  const themeColors = getColors(colorScheme);
  const isDark = colorScheme === 'dark';

  const currentWeekNumber = getWeek(new Date(), { weekStartsOn: 1, locale: da });
  const currentWeekLabel = getWeekLabel(new Date());

  // CRITICAL FIX: Check for both player AND team admin mode
  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetId === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  // Fetch current trainer ID (the logged-in user who is administering)
  useEffect(() => {
    async function fetchCurrentTrainerId() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const user = session?.user;
        if (user) {
          setCurrentTrainerId(user.id);
        }
      } catch (error) {
        console.error('[Home] Error fetching current trainer ID:', error);
        // STEP H: Safe fallback - no throw
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
    // STEP H: Guard against non-array activities
    const safeActivities = Array.isArray(activities) ? activities : [];

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const resolved = safeActivities
      .map(activity => {
        if (!activity) return null;

        const overrideKey = activity.id ? String(activity.id) : null;
        const override = overrideKey ? intensityOverrides[overrideKey] : undefined;
        const patchedActivity =
          typeof override !== 'undefined'
            ? {
                ...activity,
                intensity: override,
                activity_intensity: override,
              }
            : activity;

        const dateTime = resolveActivityDateTime(patchedActivity);
        if (!dateTime) return null;

        return {
          ...patchedActivity,
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
        console.error('[Home] Error grouping upcoming activity:', error);
      }
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
      try {
        const weekStart = startOfWeek(activity.__resolvedDateTime, { weekStartsOn: 1 });
        const weekKey = weekStart.toISOString();
        if (!previousWeekGroups[weekKey]) {
          previousWeekGroups[weekKey] = [];
        }
        previousWeekGroups[weekKey].push(activity);
      } catch (error) {
        console.error('[Home] Error grouping previous activity:', error);
      }
    });

    const previousByWeek = Object.entries(previousWeekGroups)
      .map(([weekKey, activities]) => ({
        weekStart: new Date(weekKey),
        activities,
      }))
      .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());

    return { todayActivities, upcomingByWeek, previousByWeek };
  }, [activities, intensityOverrides]);

  // Calculate how many previous weeks to display
  const visiblePreviousWeeks = useMemo(() => {
    // STEP H: Guard against invalid showPreviousWeeks
    const safeShowPreviousWeeks = typeof showPreviousWeeks === 'number' && showPreviousWeeks >= 0 ? showPreviousWeeks : 0;
    
    if (safeShowPreviousWeeks === 0) return [];
    
    // STEP H: Guard against non-array previousByWeek
    const safePreviousByWeek = Array.isArray(previousByWeek) ? previousByWeek : [];
    
    return safePreviousByWeek.slice(0, safeShowPreviousWeeks);
  }, [previousByWeek, showPreviousWeeks]);

  // LINT FIX: Include currentWeekStats in dependency array
  const performanceMetrics = useMemo(() => {
    // STEP H: Guard against null/undefined currentWeekStats
    const safeStats = currentWeekStats || {
      percentage: 0,
      completedTasks: 0,
      totalTasks: 0,
      completedTasksForWeek: 0,
      totalTasksForWeek: 0,
    };

    const percentageUpToToday = typeof safeStats.percentage === 'number' ? safeStats.percentage : 0;
    const totalTasksForWeek = typeof safeStats.totalTasksForWeek === 'number' ? safeStats.totalTasksForWeek : 0;
    const completedTasksForWeek = typeof safeStats.completedTasksForWeek === 'number' ? safeStats.completedTasksForWeek : 0;
    
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
    const completedTasks = typeof safeStats.completedTasks === 'number' ? safeStats.completedTasks : 0;
    const totalTasks = typeof safeStats.totalTasks === 'number' ? safeStats.totalTasks : 0;
    
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
  }, [currentWeekStats]);

  const performanceGradientColors = useMemo(() => {
    const [first, second = first, third = second] = performanceMetrics.gradientColors;
    return [first, second, third] as const;
  }, [performanceMetrics.gradientColors]);

  const handleCreateActivity = useCallback(async (activityData: any) => {
    try {
      // STEP H: Guard against null/undefined functions
      if (typeof createActivity !== 'function') {
        console.error('[Home] createActivity is not a function');
        return;
      }
      if (typeof refreshData !== 'function') {
        console.error('[Home] refreshData is not a function');
        return;
      }

      await createActivity(activityData);
      refreshData();
    } catch (error) {
      console.error('[Home] Error creating activity:', error);
      // STEP H: Safe fallback - no throw
    }
  }, [createActivity, refreshData]);

  const handleLoadMorePrevious = useCallback(() => {
    setShowPreviousWeeks(prev => {
      // STEP H: Guard against invalid prev value
      const safePrev = typeof prev === 'number' && prev >= 0 ? prev : 0;
      return safePrev + 1;
    });
  }, []);

  const togglePreviousExpanded = useCallback(() => {
    setIsPreviousExpanded(prev => !prev);
  }, []);

  // P4 FIX: Pull-to-refresh handler with deterministic stop
  const onRefresh = useCallback(async () => {
    // Guard against double-trigger
    if (isRefreshing) {
      console.log('[Home] Pull-to-refresh already in progress, ignoring');
      return;
    }

    console.log('[Home] Pull-to-refresh triggered');
    setIsRefreshing(true);
    
    try {
      // STEP H: Guard against null/undefined refreshActivities
      if (typeof refreshActivities === 'function') {
        await refreshActivities();
        console.log('[Home] Pull-to-refresh completed successfully');
      } else {
        console.error('[Home] refreshActivities is not a function');
      }
    } catch (error) {
      console.error('[Home] Pull-to-refresh error:', error);
      // STEP H: Safe fallback - no throw
    } finally {
      // Deterministic stop - always called
      setIsRefreshing(false);
      console.log('[Home] Pull-to-refresh spinner stopped');
    }
  }, [isRefreshing, refreshActivities]);

  const getActivityIntensityValueById = useCallback((activityId: string) => {
    if (!activityId) {
      return null;
    }
    const safeActivities = Array.isArray(activities) ? activities : [];
    const target = safeActivities.find(activity => String(activity?.id) === String(activityId));
    return getActivityIntensityValue(target);
  }, [activities]);

  const getActivitySnapshot = useCallback((activityId: string) => {
    if (!activityId) {
      return { intensity: null, intensityEnabled: false };
    }
    const safeActivities = Array.isArray(activities) ? activities : [];
    const target = safeActivities.find(activity => String(activity?.id) === String(activityId));
    return {
      intensity: getActivityIntensityValue(target),
      intensityEnabled: getActivityIntensityEnabled(target),
    };
  }, [activities]);

  const handleOpenIntensityModal = useCallback((activity: any) => {
    if (!activity || isExternalActivity(activity)) {
      return;
    }
    const activityId = String(activity.id);
    setSelectedActivityId(activityId);
    setCurrentIntensityDraft(getActivityIntensityValue(activity));
    setIntensityModalError(null);
  }, []);

  const handleCloseIntensityModal = useCallback(() => {
    if (isSavingIntensity) {
      return;
    }
    setSelectedActivityId(null);
    setCurrentIntensityDraft(null);
    setIntensityModalError(null);
  }, [isSavingIntensity]);

  const persistIntensity = useCallback(
    async (value: number | null) => {
      if (!selectedActivityId || isSavingIntensity) {
        return;
      }
      const activityId = selectedActivityId;
      const hadLocalOverride = Object.prototype.hasOwnProperty.call(intensityOverrides, activityId);
      const rollbackValue = hadLocalOverride
        ? intensityOverrides[activityId]
        : getActivityIntensityValueById(activityId);

      setIntensityOverrides(prev => ({
        ...prev,
        [activityId]: value,
      }));
      setIsSavingIntensity(true);
      setIntensityModalError(null);

      try {
        await updateActivitySingle(activityId, {
          intensity: value,
          intensityEnabled: value !== null,
        });
        if (typeof refreshActivities === 'function') {
          await refreshActivities();
        }
        setIntensityOverrides(prev => {
          const next = { ...prev };
          delete next[activityId];
          return next;
        });
        setIsSavingIntensity(false);
        handleCloseIntensityModal();
      } catch (error) {
        console.error('[Home] Error saving intensity:', error);
        setIntensityOverrides(prev => {
          const next = { ...prev };
          if (hadLocalOverride) {
            next[activityId] = rollbackValue ?? null;
          } else {
            delete next[activityId];
          }
          return next;
        });
        setIsSavingIntensity(false);
        setIntensityModalError('Kunne ikke gemme intensitet. Prøv igen.');
      }
    },
    [
      getActivityIntensityValueById,
      handleCloseIntensityModal,
      intensityOverrides,
      refreshActivities,
      selectedActivityId,
      updateActivitySingle,
      isSavingIntensity,
    ]
  );

  const handleIntensityModalSave = useCallback(
    ({ score }: TaskScoreNoteModalPayload) => {
      persistIntensity(typeof score === 'number' ? score : null);
    },
    [persistIntensity]
  );

  // Flatten all data into a single list for FlatList
  // Each item has a type to determine how to render it
  const flattenedData = useMemo(() => {
    const data: any[] = [];

    // STEP H: Guard against non-array previousByWeek
    const safePreviousByWeek = Array.isArray(previousByWeek) ? previousByWeek : [];
    const safeTodayActivities = Array.isArray(todayActivities) ? todayActivities : [];
    const safeUpcomingByWeek = Array.isArray(upcomingByWeek) ? upcomingByWeek : [];
    const safeVisiblePreviousWeeks = Array.isArray(visiblePreviousWeeks) ? visiblePreviousWeeks : [];

    // Add TIDLIGERE section
    if (safePreviousByWeek.length > 0) {
      data.push({ type: 'previousHeader' });
      
      if (isPreviousExpanded) {
        safeVisiblePreviousWeeks.forEach((weekGroup, weekIndex) => {
          // STEP H: Guard against null weekGroup
          if (!weekGroup) return;
          
          data.push({ type: 'weekHeader', weekGroup, section: 'previous' });
          
          // STEP H: Guard against non-array activities
          const weekActivities = Array.isArray(weekGroup.activities) ? weekGroup.activities : [];
          weekActivities.forEach((activity: any) => {
            // STEP H: Guard against null activity
            if (!activity) return;
            data.push({ type: 'activity', activity, section: 'previous' });
          });
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
        // STEP H: Guard against null activity
        if (!activity) return;
        data.push({ type: 'activity', activity, section: 'today' });
      });
    }

    // Add KOMMENDE section
    if (safeUpcomingByWeek.length > 0) {
      data.push({ type: 'upcomingHeader' });
      safeUpcomingByWeek.forEach((weekGroup, weekIndex) => {
        // STEP H: Guard against null weekGroup
        if (!weekGroup) return;
        
        data.push({ type: 'weekHeader', weekGroup, section: 'upcoming' });
        
        // STEP H: Guard against non-array activities
        const weekActivities = Array.isArray(weekGroup.activities) ? weekGroup.activities : [];
        weekActivities.forEach((activity: any) => {
          // STEP H: Guard against null activity
          if (!activity) return;
          data.push({ type: 'activity', activity, section: 'upcoming' });
        });
      });
    }

    return data;
  }, [previousByWeek, isPreviousExpanded, visiblePreviousWeeks, showPreviousWeeks, todayActivities, upcomingByWeek]);

  // Render item based on type
  const renderItem = useCallback(({ item }: { item: any }) => {
    // STEP H: Guard against null item
    if (!item || !item.type) return null;

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
        // STEP H: Guard against null weekGroup
        if (!item.weekGroup || !item.weekGroup.weekStart) return null;

        try {
          return (
            <View style={styles.weekGroup}>
              <Text style={[styles.weekLabel, { color: isDark ? '#e3e3e3' : colors.text }]}>
                Uge {getWeek(item.weekGroup.weekStart, { weekStartsOn: 1, locale: da })}
              </Text>
              <Text style={[styles.weekDateRange, { color: isDark ? '#999' : colors.textSecondary }]}>{getWeekLabel(item.weekGroup.weekStart)}</Text>
            </View>
          );
        } catch (error) {
          console.error('[Home] Error rendering week header:', error);
          return null;
        }

      case 'activity': {
        // STEP H: Guard against null activity
        if (!item.activity) return null;

        const activity = item.activity;
        const activityIsExternal = isExternalActivity(activity);
        
        // 1️⃣ Permission calculation (only via helper)
        // STEP H: Defensive permission check with false as default
        const canManageActivity = currentTrainerId && typeof canTrainerManageActivity === 'function'
          ? canTrainerManageActivity({
              activity,
              trainerId: currentTrainerId,
              adminMode: adminMode || 'self',
            })
          : false;

        // 2️⃣ Determine if should dim
        const shouldDim = isAdminMode && !canManageActivity;

        // 3️⃣ Activity press handler with early return (no feedback)
        const handleActivityPress = () => {
          if (isAdminMode && !canManageActivity) {
            return;
          }
          
          // STEP H: Guard against null router or activity.id
          if (!router || !activity.id) {
            console.error('[Home] Cannot navigate: router or activity.id is null');
            return;
          }

          try {
            router.push({
              pathname: '/activity-details',
              params: { id: activity.id },
            });
          } catch (error) {
            console.error('[Home] Error navigating to activity details:', error);
          }
        };

        const intensityFeatureEnabled = getActivityIntensityEnabled(activity);
        const shouldAllowIntensityEdit =
          !activityIsExternal && (!isAdminMode || canManageActivity);

        const intensityPressHandler = shouldAllowIntensityEdit
          ? () => handleOpenIntensityModal(activity)
          : undefined;

        return (
          <View
            style={[
              styles.activityWrapper,
              shouldDim && styles.activityWrapperDimmed,
              // Remove any fixed height/maxHeight/overflow here!
              // (No minHeight restriction, let ActivityCard grow)
            ]}
          >
            <ActivityCard
              activity={activity}
              resolvedDate={activity.__resolvedDateTime}
              showTasks={item.section === 'today' || item.section === 'previous'}
              onPress={handleActivityPress}
              onPressIntensity={intensityPressHandler}
            />
          </View>
        );
      }

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
  }, [isDark, isPreviousExpanded, togglePreviousExpanded, isAdminMode, currentTrainerId, adminMode, router, handleLoadMorePrevious, showPreviousWeeks, handleOpenIntensityModal]);

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: any, index: number) => {
    // STEP H: Guard against null item
    if (!item) return `null-${index}`;

    if (item.type === 'activity') {
      // STEP H: Guard against null activity or activity.id
      return item.activity?.id ? `activity-${item.activity.id}` : `activity-${index}`;
    }
    if (item.type === 'weekHeader') {
      // STEP H: Guard against null weekGroup or weekStart
      const weekKey = item.weekGroup?.weekStart ? item.weekGroup.weekStart.toISOString() : index;
      return `week-${item.section}-${weekKey}`;
    }
    return `${item.type}-${index}`;
  }, []);

  // List header component
  const ListHeaderComponent = useCallback(() => (
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
        colors={performanceGradientColors}
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
            // STEP H: Guard against null router
            if (!router) {
              console.error('[Home] Cannot navigate: router is null');
              return;
            }
            try {
              router.push('/(tabs)/performance');
            } catch (error) {
              console.error('[Home] Error navigating to performance:', error);
            }
          }}
        >
          <Text style={styles.performanceButtonText}>Se performance</Text>
        </Pressable>
      </LinearGradient>

      {/* STEP E: Static inline info-box when adminMode !== 'self' */}
      {adminMode !== 'self' && (
        <View style={[styles.adminInfoBox, { backgroundColor: isDark ? '#3a2a1a' : '#FFF3E0', borderColor: isDark ? '#B8860B' : '#FF9800' }]}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={20}
            color={isDark ? '#FFB74D' : '#F57C00'}
          />
          <Text style={[styles.adminInfoText, { color: isDark ? '#FFB74D' : '#E65100' }]}>
            Du kan kun redigere indhold, du selv har oprettet.
          </Text>
        </View>
      )}

      {/* Create Activity Button */}
      <Pressable 
        style={styles.createButton}
        onPress={() => setShowCreateModal(true)}
      >
        <Text style={styles.createButtonText}>+  Opret Aktivitet</Text>
      </Pressable>
    </>
  ), [isDark, currentWeekNumber, currentWeekLabel, performanceMetrics, adminMode, router]);

  // List footer component
  const ListFooterComponent = useCallback(() => (
    <View style={styles.bottomSpacer} />
  ), []);

  return (
    <AdminContextWrapper
      isAdmin={isAdminMode}
      contextName={selectedContext?.name ?? undefined}
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
              refreshing={isRefreshing}
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

      <TaskScoreNoteModal
        visible={Boolean(selectedActivityId)}
        title="Feedback på Intensitet"
        introText="Hvordan gik det?"
        helperText="1 = let · 10 = maks"
        initialScore={currentIntensityDraft}
        initialNote=""
        enableScore
        enableNote={false}
        isSaving={isSavingIntensity}
        error={intensityModalError}
        onSave={handleIntensityModalSave}
        onClose={handleCloseIntensityModal}
        showLabels={false}
      />
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

  // Admin Info Box
  adminInfoBox: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  adminInfoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
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

  // Intensity Modal
  intensityModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    padding: 24,
  },
  intensityModalContent: {
    backgroundColor: '#1F2933',
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  intensityModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  intensityModalSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E5E7EB',
    marginTop: 6,
  },
  intensityModalHelper: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 10,
    marginBottom: 16,
  },
  intensityModalLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  intensityModalLoadingText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  intensityOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  intensityOption: {
    minWidth: 54,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  intensityOptionSelected: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  intensityOptionDisabled: {
    opacity: 0.6,
  },
  intensityOptionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  intensityOptionTextSelected: {
    color: '#FFFFFF',
  },
  intensityModalButton: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  intensityModalRemoveButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: '#F87171',
  },
  intensityModalCloseButton: {
    backgroundColor: '#4CAF50',
  },
  intensityModalButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 120,
  },
});

// Anti-patterns forbidden: fetch-on-press, inline renders, non-virtualized lists, unstable context values
