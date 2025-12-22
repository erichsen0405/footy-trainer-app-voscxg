
import React, { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import ActivityCard from '@/components/ActivityCard';
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
  return `${format(start, 'd/M', { locale: da })} - ${format(end, 'd/M', { locale: da })}`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { activities, loading } = useHomeActivities();

  const { todayActivities, upcomingByWeek } = useMemo(() => {
    if (!Array.isArray(activities)) {
      return { todayActivities: [], upcomingByWeek: [] };
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

    // Group upcoming activities by week
    const weekGroups: { [key: string]: any[] } = {};
    upcomingActivities.forEach(activity => {
      const weekStart = startOfWeek(activity.__resolvedDateTime, { weekStartsOn: 1 });
      const weekKey = weekStart.toISOString();
      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = [];
      }
      weekGroups[weekKey].push(activity);
    });

    const upcomingByWeek = Object.entries(weekGroups)
      .map(([weekKey, activities]) => ({
        weekStart: new Date(weekKey),
        activities,
      }))
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

    return { todayActivities, upcomingByWeek };
  }, [activities]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Indlæser…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <View style={styles.logo}>
            <Text style={styles.logoIcon}>⚽</Text>
          </View>
        </View>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>FOOTBALL COACH</Text>
          <Text style={styles.headerSubtitle}>Styrk din fodboldtræning</Text>
        </View>
      </View>

      {/* Weekly Progress Card with Red Gradient */}
      <LinearGradient
        colors={['#DC2626', '#991B1B']}
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

        <Pressable style={styles.performanceButton}>
          <Text style={styles.performanceButtonText}>📊  Se Performance  →</Text>
        </Pressable>
      </LinearGradient>

      {/* Create Activity Button */}
      <Pressable 
        style={styles.createButton}
        onPress={() => {
          // Navigate to create activity
        }}
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
            />
          </View>
        ))}
      </View>

      {/* KOMMENDE Section */}
      {upcomingByWeek.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>KOMMENDE</Text>
            <Pressable>
              <Text style={styles.expandButton}>▲ Tidligere</Text>
            </Pressable>
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
    paddingVertical: 24,
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
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 2,
  },

  // Progress Card
  progressCard: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    borderRadius: 20,
    padding: 20,
    boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.2)',
    elevation: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  medalBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalIcon: {
    fontSize: 24,
  },
  progressPercentage: {
    fontSize: 64,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 4,
    marginVertical: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  progressDetail: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 8,
  },
  motivationText: {
    fontSize: 14,
    color: '#FFFFFF',
    marginTop: 16,
    lineHeight: 20,
  },
  performanceButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 16,
    alignItems: 'center',
  },
  performanceButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Create Button
  createButton: {
    backgroundColor: '#4CAF50',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    boxShadow: '0px 2px 8px rgba(76, 175, 80, 0.3)',
    elevation: 3,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Sections
  section: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  greenMarker: {
    width: 4,
    height: 24,
    backgroundColor: '#4CAF50',
    borderRadius: 2,
    marginRight: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  expandButton: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },

  // Week Groups
  weekGroup: {
    marginBottom: 20,
  },
  weekLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  weekDateRange: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    marginBottom: 12,
  },

  // Activity Wrapper
  activityWrapper: {
    marginBottom: 12,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 120,
  },
});
