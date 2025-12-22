
import React, { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import ActivityCard from '@/components/ActivityCard';

/**
 * Resolve a FULL ISO datetime string.
 * ActivityCard MUST receive a valid datetime.
 */
function resolveActivityDateTime(activity: any): string | null {
  // External calendar activities
  if (activity.scheduled_at) return activity.scheduled_at;
  if (activity.start_time) return activity.start_time;

  // Internal DB activities
  if (activity.activity_date && activity.activity_time) {
    return `${activity.activity_date}T${activity.activity_time}`;
  }

  if (activity.activity_date) {
    // Safe fallback to avoid timezone crash
    return `${activity.activity_date}T12:00:00`;
  }

  return null;
}

export default function HomeScreen() {
  const { activities, loading } = useHomeActivities();

  console.log('[HomeScreen] Total activities received:', activities.length);
  console.log('[HomeScreen] External activities:', activities.filter(a => a.is_external).length);
  console.log('[HomeScreen] Internal activities:', activities.filter(a => !a.is_external).length);

  const { todayActivities, upcomingActivities } = useMemo(() => {
    if (!Array.isArray(activities)) {
      return { todayActivities: [], upcomingActivities: [] };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const resolved = activities
      .map(activity => {
        const dateTime = resolveActivityDateTime(activity);
        if (!dateTime) return null;

        const dateObj = new Date(dateTime);
        if (isNaN(dateObj.getTime())) return null;

        return {
          ...activity,
          __resolvedDateTime: dateTime,
          __dateObj: dateObj,
        };
      })
      .filter(Boolean) as any[];

    return {
      todayActivities: resolved
        .filter(a => {
          const d = new Date(a.__dateObj);
          d.setHours(0, 0, 0, 0);
          return d.getTime() === today.getTime();
        })
        .sort((a, b) => a.__dateObj.getTime() - b.__dateObj.getTime()),

      upcomingActivities: resolved
        .filter(a => a.__dateObj.getTime() > today.getTime())
        .sort((a, b) => a.__dateObj.getTime() - b.__dateObj.getTime()),
    };
  }, [activities]);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Indlæser…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.sectionTitle}>I dag</Text>

      {todayActivities.length === 0 && (
        <Text style={styles.emptyText}>Ingen aktiviteter i dag</Text>
      )}

      {todayActivities.map(activity => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          resolvedDate={activity.__dateObj}
        />
      ))}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        Kommende aktiviteter
      </Text>

      {upcomingActivities.length === 0 && (
        <Text style={styles.emptyText}>Ingen kommende aktiviteter</Text>
      )}

      {upcomingActivities.map(activity => (
        <ActivityCard
          key={activity.id}
          activity={activity}
          resolvedDate={activity.__dateObj}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  center: {
    padding: 16,
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: {
    color: '#666',
    marginBottom: 12,
  },
});
