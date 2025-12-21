
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { format } from 'date-fns';

interface ActivityCardProps {
  activity: any;
  resolvedDate: Date;
  onPress?: () => void;
}

export default function ActivityCard({ activity, resolvedDate, onPress }: ActivityCardProps) {
  const theme = useTheme();

  // TRIN 5 – VERIFIKATION LOG (KUN MIDLOM)
  console.log('[ActivityCard]', {
    title: activity.title,
    is_external: activity.is_external,
    resolvedDate,
  });

  // TRIN 3 – BRUG KUN resolvedDate I ActivityCard
  const dateLabel = format(resolvedDate, 'dd-MM-yyyy');
  const timeLabel = format(resolvedDate, 'HH:mm');

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.activityCard,
        { backgroundColor: theme.colors.card },
      ]}
    >
      <View style={styles.activityCardContent}>
        <Text style={[styles.activityTitle, { color: theme.colors.text }]}>
          {activity.title || activity.name || 'Uden titel'}
        </Text>

        <Text style={[styles.activityDateTime, { color: theme.colors.text }]}>
          {dateLabel} • {timeLabel}
        </Text>

        {activity.category_name && (
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: activity.category_color || theme.colors.primary },
            ]}
          >
            <Text style={styles.categoryText}>
              {activity.category_name}
            </Text>
          </View>
        )}

        {activity.is_external && (
          <View style={[styles.externalBadge, { backgroundColor: '#6366f1' }]}>
            <Text style={styles.externalText}>Ekstern</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  activityCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  activityCardContent: {
    gap: 6,
  },

  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
  },

  activityDateTime: {
    fontSize: 14,
    opacity: 0.7,
  },

  categoryBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },

  categoryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },

  externalBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginTop: 4,
  },

  externalText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
