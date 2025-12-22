
import React, { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { Text, VStack } from 'native-base';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import ActivityCard from '@/components/ActivityCard';

/**
 * Normalize all activity dates to YYYY-MM-DD (local).
 * Returns null if no valid date can be resolved.
 */
function normalizeActivityDate(activity: any): string | null {
  const raw =
    activity.activity_date ||
    activity.scheduled_at ||
    activity.start_date ||
    activity.date;

  if (!raw || typeof raw !== 'string') return null;

  // Accept ISO or YYYY-MM-DD
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

        return {
          ...activity,
          __resolvedDate: date,
        };
      })
      .filter(Boolean) as Array<any>;

    const todayActivities = resolved
      .filter(a => a.__resolvedDate === todayStr)
      .sort((a, b) =>
        a.__resolvedDate.localeCompare(b.__resolvedDate)
      );

    const upcomingActivities = resolved
      .filter(a => a.__resolvedDate > todayStr)
      .sort((a, b) =>
        a.__resolvedDate.localeCompare(b.__resolvedDate)
      );

    return { todayActivities, upcomingActivities };
  }, [activitiesSafe]);

  if (loading) {
    return (
      <View style={{ padding: 16 }}>
        <Text>Indlæser…</Text>
      </View>
    );
  }

  return (
    <ScrollView>
      <VStack space={4} padding={4}>
        {/* I DAG */}
        <Text fontSize="lg" fontWeight="bold">
          I dag
        </Text>

        {todayActivities.length === 0 && (
          <Text color="gray.500">Ingen aktiviteter i dag</Text>
        )}

        {todayActivities.map(activity => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            resolvedDate={activity.__resolvedDate}
          />
        ))}

        {/* KOMMENDE */}
        <Text fontSize="lg" fontWeight="bold" marginTop={6}>
          Kommende aktiviteter
        </Text>

        {upcomingActivities.length === 0 && (
          <Text color="gray.500">Ingen kommende aktiviteter</Text>
        )}

        {upcomingActivities.map(activity => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            resolvedDate={activity.__resolvedDate}
          />
        ))}
      </VStack>
    </ScrollView>
  );
}
