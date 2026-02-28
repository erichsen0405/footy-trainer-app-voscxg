import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { getWeek } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';

import ActivityCard from '@/components/ActivityCard';
import { IconSymbol } from '@/components/IconSymbol';
import { ProgressionSection } from '@/components/ProgressionSection';
import { WeeklySummaryCard } from '@/components/WeeklySummaryCard';
import { useFootball } from '@/contexts/FootballContext';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import * as CommonStyles from '@/styles/commonStyles';
import {
  buildPerformanceHistoryWeeks,
  type PerformanceHistoryWeek,
} from '@/utils/performanceHistory';

type HistoryListItem =
  | { type: 'weekCard'; key: string; week: PerformanceHistoryWeek }
  | { type: 'activity'; key: string; weekKey: string; activity: any };

function buildHistoryActivityKey(activity: any, weekKey: string, index: number): string {
  const rawId = activity?.id ?? activity?.activity_id ?? activity?.activityId;
  const normalizedId = rawId !== null && rawId !== undefined ? String(rawId).trim() : '';
  if (normalizedId.length > 0) {
    return `history:activity:${weekKey}:${normalizedId}`;
  }

  const dateKey =
    activity?.__resolvedDateTime instanceof Date && !Number.isNaN(activity.__resolvedDateTime.getTime())
      ? activity.__resolvedDateTime.toISOString()
      : 'unknown-date';

  return `history:activity:fallback:${weekKey}:${dateKey}:${index}`;
}

export default function PerformanceScreen() {
  const {
    trophies,
    currentWeekStats,
    externalCalendars,
    fetchExternalCalendarEvents,
    categories,
  } = useFootball();
  const { activities, loading: homeActivitiesLoading } = useHomeActivities();

  const colorScheme = useColorScheme();
  const [refreshing, setRefreshing] = useState(false);
  const [expandedHistoryWeeks, setExpandedHistoryWeeks] = useState<Record<string, boolean>>({});
  const [isHistorySectionExpanded, setIsHistorySectionExpanded] = useState(true);

  const palette = useMemo(() => {
    const fromHelper =
      typeof CommonStyles.getColors === 'function'
        ? CommonStyles.getColors(colorScheme as any)
        : undefined;
    const base = (fromHelper || (CommonStyles as any).colors || {}) as Record<string, string>;
    return {
      primary: base.primary ?? '#4CAF50',
      secondary: base.secondary ?? '#2196F3',
      accent: base.accent ?? '#FF9800',
      background: base.background ?? '#FFFFFF',
      card: base.card ?? '#F5F5F5',
      text: base.text ?? '#333333',
      textSecondary: base.textSecondary ?? '#666666',
      gold: base.gold ?? '#FFD700',
      silver: base.silver ?? '#C0C0C0',
      bronze: base.bronze ?? '#CD7F32',
    };
  }, [colorScheme]);

  const isDark = colorScheme === 'dark';
  const bgColor = isDark ? '#1a1a1a' : palette.background;
  const textColor = isDark ? '#e3e3e3' : palette.text;
  const textSecondaryColor = isDark ? '#999' : palette.textSecondary;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const enabledCalendars = externalCalendars.filter((cal) => cal.enabled);
      for (const calendar of enabledCalendars) {
        try {
          await fetchExternalCalendarEvents(calendar);
        } catch (error) {
          console.error(`Failed to sync calendar ${calendar.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [externalCalendars, fetchExternalCalendarEvents]);

  const toggleHistoryWeekExpanded = useCallback((weekKey: string) => {
    setExpandedHistoryWeeks((prev) => ({
      ...prev,
      [weekKey]: !prev[weekKey],
    }));
  }, []);

  const historyWeeks = useMemo(() => buildPerformanceHistoryWeeks(activities), [activities]);

  const historyListData = useMemo(() => {
    const items: HistoryListItem[] = [];

    historyWeeks.forEach((week) => {
      items.push({
        type: 'weekCard',
        key: `history:week:${week.weekKey}`,
        week,
      });

      if (!expandedHistoryWeeks[week.weekKey]) return;

      week.activities.forEach((activity, index) => {
        items.push({
          type: 'activity',
          key: buildHistoryActivityKey(activity, week.weekKey, index),
          weekKey: week.weekKey,
          activity,
        });
      });
    });

    return items;
  }, [expandedHistoryWeeks, historyWeeks]);

  const safeWeekStats = currentWeekStats ?? {
    totalTasksForWeek: 0,
    completedTasksForWeek: 0,
  };

  const totalTasksForWeek = safeWeekStats.totalTasksForWeek;
  const completedTasksForWeek = safeWeekStats.completedTasksForWeek;
  const weekPercentage =
    totalTasksForWeek > 0 ? Math.round((completedTasksForWeek / totalTasksForWeek) * 100) : 0;

  const currentPercentage =
    currentWeekStats && currentWeekStats.percentage !== undefined ? currentWeekStats.percentage : 0;
  const completedTasks =
    currentWeekStats && currentWeekStats.completedTasks !== undefined
      ? currentWeekStats.completedTasks
      : 0;
  const totalTasks =
    currentWeekStats && currentWeekStats.totalTasks !== undefined ? currentWeekStats.totalTasks : 0;

  const currentWeek = getWeek(new Date());
  const currentYear = new Date().getFullYear();

  const getTrophyEmoji = (type: 'gold' | 'silver' | 'bronze') => {
    switch (type) {
      case 'gold':
        return '🥇';
      case 'silver':
        return '🥈';
      case 'bronze':
        return '🥉';
    }
  };

  const getCoachingMessage = (percentage: number) => {
    if (percentage >= 80) {
      return 'Fantastisk! Du er helt på toppen indtil nu! Fortsæt det gode arbejde! 🌟';
    }
    if (percentage >= 60) {
      return 'Rigtig godt! Du klarer dig godt indtil nu. Bliv ved! 💪';
    }
    if (percentage >= 40) {
      return 'Du er på vej! Der er stadig tid til at forbedre dig. 🔥';
    }
    return 'Kom igen! Fokuser på dine opgaver for at komme tilbage på sporet. ⚽';
  };

  const goldTrophies = trophies.filter((t) => t.type === 'gold').length;
  const silverTrophies = trophies.filter((t) => t.type === 'silver').length;
  const bronzeTrophies = trophies.filter((t) => t.type === 'bronze').length;

  return (
    <ScrollView
      testID="performance.screen"
      style={[styles.container, { backgroundColor: bgColor }]}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.primary}
          colors={[palette.primary]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textColor }]}>🏆 Din Performance</Text>
        <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>Se hvordan du klarer dig over tid</Text>
      </View>

      <View
        style={[styles.currentWeekCard, { backgroundColor: palette.accent }]}
        testID="performance.currentWeekCard"
      >
        <View style={styles.currentWeekHeader}>
          <Text style={styles.currentWeekTitle}>Denne uge</Text>
          <Text style={styles.trophyBadge}>
            {getTrophyEmoji(currentPercentage >= 80 ? 'gold' : currentPercentage >= 60 ? 'silver' : 'bronze')}
          </Text>
        </View>
        <Text style={styles.currentWeekSubtitle}>
          Uge {currentWeek}, {currentYear}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox} testID="performance.statBox.today">
            <Text style={styles.statLabel}>Indtil i dag</Text>
            <Text style={styles.statPercentage} testID="performance.statPercentage.today">
              {currentPercentage}%
            </Text>
            <Text style={styles.statTasks} testID="performance.statTasks.today">
              {completedTasks} / {totalTasks}
            </Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${currentPercentage}%` }]} />
            </View>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Hele ugen</Text>
            <Text style={styles.statPercentage}>{weekPercentage}%</Text>
            <Text style={styles.statTasks}>
              {completedTasksForWeek} / {totalTasksForWeek}
            </Text>
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, { width: `${weekPercentage}%` }]} />
            </View>
          </View>
        </View>

        <View style={styles.coachingBox}>
          <Text style={styles.coachingTitle}>💬 Coaching</Text>
          <Text style={styles.coachingText}>{getCoachingMessage(currentPercentage)}</Text>
        </View>
      </View>

      <View style={[styles.trophiesCard, { backgroundColor: palette.gold }]}>
        <View style={styles.trophiesContent}>
          <Text style={styles.trophiesTitle}>Guld pokaler</Text>
          <Text style={styles.trophiesCount}>{goldTrophies}</Text>
        </View>
        {expandedTrophy === 'gold' && (
          <FlatList
            data={trophyWeeksByType.gold}
            scrollEnabled={false}
            keyExtractor={(item, index) => `gold-${item.year}-${item.week}-${index}`}
            contentContainerStyle={styles.expandedList}
            ListEmptyComponent={<Text style={styles.emptyWeekText}>Ingen guld-uger endnu</Text>}
            renderItem={({ item }) => (
              <View style={styles.weekRow}>
                <Text style={styles.weekLabel}>Uge {item.week}, {item.year}</Text>
                <Text style={styles.weekValue}>{item.completedTasks} / {item.totalTasks}</Text>
              </View>
            )}
          />
        )}
      </Pressable>

      <View style={[styles.trophiesCard, { backgroundColor: palette.silver }]}>
        <View style={styles.trophiesContent}>
          <Text style={styles.trophiesTitle}>Sølv pokaler</Text>
          <Text style={styles.trophiesCount}>{silverTrophies}</Text>
        </View>
        {expandedTrophy === 'silver' && (
          <FlatList
            data={trophyWeeksByType.silver}
            scrollEnabled={false}
            keyExtractor={(item, index) => `silver-${item.year}-${item.week}-${index}`}
            contentContainerStyle={styles.expandedList}
            ListEmptyComponent={<Text style={styles.emptyWeekText}>Ingen sølv-uger endnu</Text>}
            renderItem={({ item }) => (
              <View style={styles.weekRow}>
                <Text style={styles.weekLabel}>Uge {item.week}, {item.year}</Text>
                <Text style={styles.weekValue}>{item.completedTasks} / {item.totalTasks}</Text>
              </View>
            )}
          />
        )}
      </Pressable>

      <View style={[styles.trophiesCard, { backgroundColor: palette.bronze }]}>
        <View style={styles.trophiesContent}>
          <Text style={styles.trophiesTitle}>Bronze pokaler</Text>
          <Text style={styles.trophiesCount}>{bronzeTrophies}</Text>
        </View>
        <Text style={styles.trophiesEmoji}>🥉</Text>
      </View>

      <ProgressionSection categories={categories} />

      <View style={styles.historySection}>
        <Pressable
          style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyHeaderPressed]}
          onPress={() => setIsHistorySectionExpanded((prev) => !prev)}
          testID="performance.history.toggle"
        >
          <View style={styles.historyHeaderShadow}>
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(43, 76, 92, 0.62)', 'rgba(29, 52, 69, 0.62)', 'rgba(25, 43, 56, 0.62)']
                  : ['rgba(255, 255, 255, 0.62)', 'rgba(234, 243, 238, 0.62)', 'rgba(221, 239, 227, 0.62)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.historyHeaderCard, { borderColor: isDark ? 'rgba(191, 220, 203, 0.20)' : 'rgba(76, 175, 80, 0.22)' }]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.00)']
                    : ['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 0.8, y: 0.8 }}
                style={styles.historyHeaderSheen}
              />

              <View style={styles.historyHeader}>
                <View style={styles.historyTitleBlock}>
                  <Text style={[styles.historyTitle, { color: isDark ? '#E6F5EC' : '#1D3A2A' }]}>Historik</Text>
                  <Text style={[styles.historySubtitle, { color: isDark ? '#B5D8C2' : '#2C5A40' }]}>
                    Overståede uger og udført arbejde
                  </Text>
                </View>
                <View style={styles.historyChevronShadow}>
                  <LinearGradient
                    colors={isDark ? ['#3CC06A', '#1F8A43'] : ['#4CC46E', '#279B4A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.historyChevronButton}
                  >
                    <IconSymbol
                      ios_icon_name={isHistorySectionExpanded ? 'chevron.up' : 'chevron.down'}
                      android_material_icon_name={isHistorySectionExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                      size={20}
                      color="#FFFFFF"
                    />
                    <LinearGradient
                      colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.historyChevronSheen}
                    />
                  </LinearGradient>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Pressable>
      </View>

      {isHistorySectionExpanded ? (
        homeActivitiesLoading ? (
          <View style={styles.historyPlaceholder}>
            <Text style={[styles.historyPlaceholderText, { color: textSecondaryColor }]}>Indlæser historik...</Text>
          </View>
        ) : historyWeeks.length === 0 ? (
          <View style={styles.historyPlaceholder}>
            <Text style={[styles.historyPlaceholderText, { color: textSecondaryColor }]}>Ingen historik endnu</Text>
          </View>
        ) : (
          <FlatList
            data={historyListData}
            style={styles.historyList}
            renderItem={({ item }) => {
              if (item.type === 'weekCard') {
                return (
                  <WeeklySummaryCard
                    weekStart={item.week.weekStart}
                    isDark={isDark}
                    isExpanded={expandedHistoryWeeks[item.week.weekKey] === true}
                    onPress={() => toggleHistoryWeekExpanded(item.week.weekKey)}
                    activityCount={item.week.activityCount}
                    totalTasks={item.week.totalCompletedTasks}
                    totalMinutes={item.week.totalMinutes}
                    eyebrowText="HISTORIK UGE"
                    timeLabelPrefix="Udført"
                  />
                );
              }

              return (
                <View style={styles.activityWrapper}>
                  <ActivityCard
                    activity={item.activity}
                    resolvedDate={item.activity.__resolvedDateTime}
                    showTasks
                  />
                </View>
              );
            }}
            keyExtractor={(item) => item.key}
            scrollEnabled={false}
            removeClippedSubviews={Platform.OS !== 'web'}
            initialNumToRender={6}
            maxToRenderPerBatch={8}
            windowSize={5}
            testID="performance.history.list"
          />
        )
      ) : null}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
  },
  currentWeekCard: {
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
  },
  currentWeekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  currentWeekTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  trophyBadge: {
    fontSize: 32,
  },
  currentWeekSubtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 16,
  },
  statLabel: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 8,
    fontWeight: '600',
  },
  statPercentage: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  statTasks: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 8,
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 3,
  },
  coachingBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 16,
  },
  coachingTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  coachingText: {
    fontSize: 15,
    color: '#fff',
    lineHeight: 22,
  },
  trophiesCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  trophiesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trophiesContent: {
    flex: 1,
  },
  trophiesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  trophiesCount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  trophiesEmoji: {
    fontSize: 40,
    marginLeft: 12,
  },
  historySection: {
    marginTop: 24,
    marginBottom: 12,
  },
  historyHeaderPressable: {
    borderRadius: 24,
  },
  historyHeaderPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  historyHeaderShadow: {
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  historyHeaderCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  historyHeaderSheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
  },
  historyTitleBlock: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  historySubtitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
  },
  historyChevronShadow: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  historyChevronButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  historyChevronSheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  historyPlaceholder: {
    paddingVertical: 8,
  },
  historyPlaceholderText: {
    fontSize: 15,
    lineHeight: 22,
  },
  activityWrapper: {
    marginBottom: 16,
  },
  historyList: {
    marginHorizontal: -16,
  },
  trophiesMeta: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  expandHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    opacity: 0.95,
  },
  expandedList: {
    marginTop: 12,
    gap: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  weekLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  weekValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyWeekText: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.95,
  },
});
