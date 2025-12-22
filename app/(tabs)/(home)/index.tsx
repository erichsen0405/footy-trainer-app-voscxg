
import React, { useMemo } from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import { Text } from 'native-base';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import ActivityCard from '@/components/ActivityCard';
// import WeeklyProgressCard from '@/components/WeeklyProgressCard';
// import CreateActivityButton from '@/components/CreateActivityButton';

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

export default function HomeScreen() {
  const { activities, loading } = useHomeActivities();

  const { todayActivities, upcomingActivities } = useMemo(() => {
    if (!Array.isArray(activities)) {
      return { todayActivities: [], upcomingActivities: [] };
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

    return { todayActivities, upcomingActivities };
  }, [activities]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Indlæser…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* I DAG */}
      <Text style={styles.sectionTitle}>I dag</Text>

      {todayActivities.length === 0 && (
        <Text style={styles.emptyText}>Ingen aktiviteter i dag</Text>
      )}

      {todayActivities.map(activity => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          resolvedDate={activity.__resolvedDateTime}
        />
      ))}

      {/* KOMMENDE */}
      <Text style={styles.sectionTitle}>Kommende aktiviteter</Text>

      {upcomingActivities.length === 0 && (
        <Text style={styles.emptyText}>
          Ingen kommende aktiviteter
        </Text>
      )}

      {upcomingActivities.map(activity => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          resolvedDate={activity.__resolvedDateTime}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  loading: {
    padding: 24,
  },
  sectionTitle: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 18,
    fontWeight: '600',
  },
  emptyText: {
    color: '#888',
    marginBottom: 8,
  },
});
