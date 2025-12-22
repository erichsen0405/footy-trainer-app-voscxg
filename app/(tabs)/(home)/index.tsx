
import React, { useMemo } from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import ActivityCard from '@/components/ActivityCard';

/**
 * Normalize activity date to YYYY-MM-DD (local).
 * Works for both internal and external activities.
 */
function normalizeActivityDate(activity: any): string | null {
  const raw =
    activity.activity_date ||
    activity.scheduled_at ||
    activity.start_date ||
    activity.date;

  if (!raw || typeof raw !== 'string') return null;

  const datePart = raw.split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  return datePart;
}

export default function HomeScreen() {
  const { activitiesSafe, loading } = useHomeActivities();

  const { todayActivities, upcomingActivities } = useMemo(() => {
    if (!Array.isArray(activitiesSafe)) {
      return { todayActivities: [], upcomingActivities: [] };
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const resolved = activitiesSafe
      .map(activity => {
        const date = normalizeActivityDate(activity);
        if (!date) return null;
        return { ...activity, __resolvedDate: date };
      })
      .filter(Boolean) as any[];

    return {
      todayActivities: resolved
        .filter(a => a.__resolvedDate === todayStr)
        .sort((a, b) => a.__resolvedDate.localeCompare(b.__resolvedDate)),
      upcomingActivities: resolved
        .filter(a => a.__resolvedDate > todayStr)
        .sort((a, b) => a.__resolvedDate.localeCompare(b.__resolvedDate)),
    };
  }, [activitiesSafe]);

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
          resolvedDate={activity.__resolvedDate}
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
          resolvedDate={activity.__resolvedDate}
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
