
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, useColorScheme, RefreshControl } from 'react-native';
import { useFootball } from '@/contexts/FootballContext';
import { colors } from '@/styles/commonStyles';
import { getWeek } from 'date-fns';

export default function PerformanceScreen() {
  const { trophies, currentWeekStats, externalCalendars, fetchExternalCalendarEvents } = useFootball();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    console.log('Pull to refresh triggered on performance screen');
    setRefreshing(true);
    
    try {
      // Sync all enabled external calendars
      const enabledCalendars = externalCalendars.filter(cal => cal.enabled);
      console.log(`Syncing ${enabledCalendars.length} enabled calendars`);
      
      for (const calendar of enabledCalendars) {
        try {
          await fetchExternalCalendarEvents(calendar);
          console.log(`Successfully synced calendar: ${calendar.name}`);
        } catch (error) {
          console.error(`Failed to sync calendar ${calendar.name}:`, error);
        }
      }
      
      console.log('Refresh completed');
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const getTrophyColor = (type: 'gold' | 'silver' | 'bronze') => {
    switch (type) {
      case 'gold':
        return colors.gold;
      case 'silver':
        return colors.silver;
      case 'bronze':
        return colors.bronze;
    }
  };

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
    } else if (percentage >= 60) {
      return 'Rigtig godt! Du klarer dig godt indtil nu. Bliv ved! 💪';
    } else if (percentage >= 40) {
      return 'Du er på vej! Der er stadig tid til at forbedre dig. 🔥';
    } else {
      return 'Kom igen! Fokuser på dine opgaver for at komme tilbage på sporet. ⚽';
    }
  };

  const goldTrophies = trophies.filter(t => t.type === 'gold').length;
  const silverTrophies = trophies.filter(t => t.type === 'silver').length;
  const bronzeTrophies = trophies.filter(t => t.type === 'bronze').length;

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const currentWeek = getWeek(new Date());
  const currentYear = new Date().getFullYear();

  const totalTasksForWeek = currentWeekStats?.totalTasksForWeek ?? 0;
  const completedTasksForWeek = currentWeekStats?.completedTasksForWeek ?? 0;
  const weekPercentage = totalTasksForWeek > 0 
    ? Math.round((completedTasksForWeek / totalTasksForWeek) * 100) 
    : 0;

  const currentPercentage = currentWeekStats?.percentage ?? 0;
  const completedTasks = currentWeekStats?.completedTasks ?? 0;
  const totalTasks = currentWeekStats?.totalTasks ?? 0;

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: bgColor }]} 
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textColor }]}>🏆 Din Performance</Text>
        <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
          Se hvordan du klarer dig over tid
        </Text>
      </View>

      <View style={[styles.currentWeekCard, { backgroundColor: colors.accent }]}>
        <View style={styles.currentWeekHeader}>
          <Text style={styles.currentWeekTitle}>Denne uge</Text>
          <Text style={styles.trophyBadge}>{getTrophyEmoji(currentPercentage >= 80 ? 'gold' : currentPercentage >= 60 ? 'silver' : 'bronze')}</Text>
        </View>
        <Text style={styles.currentWeekSubtitle}>Uge {currentWeek}, {currentYear}</Text>
        
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Indtil i dag</Text>
            <Text style={styles.statPercentage}>{currentPercentage}%</Text>
            <Text style={styles.statTasks}>
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

      <View style={[styles.trophiesCard, { backgroundColor: colors.gold }]}>
        <View style={styles.trophiesContent}>
          <Text style={styles.trophiesTitle}>Guld pokaler</Text>
          <Text style={styles.trophiesCount}>{goldTrophies}</Text>
        </View>
        <Text style={styles.trophiesEmoji}>🥇</Text>
      </View>

      <View style={[styles.trophiesCard, { backgroundColor: colors.silver }]}>
        <View style={styles.trophiesContent}>
          <Text style={styles.trophiesTitle}>Sølv pokaler</Text>
          <Text style={styles.trophiesCount}>{silverTrophies}</Text>
        </View>
        <Text style={styles.trophiesEmoji}>🥈</Text>
      </View>

      <View style={[styles.trophiesCard, { backgroundColor: colors.bronze }]}>
        <View style={styles.trophiesContent}>
          <Text style={styles.trophiesTitle}>Bronze pokaler</Text>
          <Text style={styles.trophiesCount}>{bronzeTrophies}</Text>
        </View>
        <Text style={styles.trophiesEmoji}>🥉</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: textColor }]}>📊 Performance historik</Text>
        
        {trophies.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
            <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen historik endnu</Text>
          </View>
        ) : (
          trophies.map((trophy, index) => (
            <View key={index} style={[styles.historyCard, { backgroundColor: cardBgColor }]}>
              <View style={styles.historyHeader}>
                <View style={styles.historyLeft}>
                  <Text style={styles.historyEmoji}>{getTrophyEmoji(trophy.type)}</Text>
                  <View>
                    <Text style={[styles.historyWeek, { color: textColor }]}>Uge {trophy.week}</Text>
                    <Text style={[styles.historyYear, { color: textSecondaryColor }]}>{trophy.year}</Text>
                  </View>
                </View>
                <View style={styles.historyRight}>
                  <Text style={[styles.historyPercentage, { color: getTrophyColor(trophy.type) }]}>
                    {trophy.percentage}%
                  </Text>
                  <Text style={[styles.historyTasks, { color: textSecondaryColor }]}>
                    {trophy.completedTasks}/{trophy.totalTasks} opgaver
                  </Text>
                </View>
              </View>
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBar,
                    { width: `${trophy.percentage}%`, backgroundColor: getTrophyColor(trophy.type) }
                  ]}
                />
              </View>
            </View>
          ))
        )}
      </View>

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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trophiesContent: {
    flex: 1,
  },
  trophiesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  trophiesCount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
  },
  trophiesEmoji: {
    fontSize: 48,
  },
  section: {
    marginTop: 24,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  emptyCard: {
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  historyCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyEmoji: {
    fontSize: 32,
  },
  historyWeek: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  historyYear: {
    fontSize: 14,
  },
  historyRight: {
    alignItems: 'flex-end',
  },
  historyPercentage: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  historyTasks: {
    fontSize: 14,
  },
});
