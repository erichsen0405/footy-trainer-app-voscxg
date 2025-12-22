
import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';
import { colors } from '@/styles/commonStyles';

interface ActivityCardProps {
  activity: any;
  resolvedDate: Date;
  onPress?: () => void;
}

// Category color mapping
const getCategoryColor = (categoryName: string | null): string => {
  if (!categoryName) return '#6B7280';
  
  const colorMap: { [key: string]: string } = {
    'Træning': '#4CAF50',
    'Styrketræning': '#5B9AA0',
    'VR træning': '#6366F1',
    'Sprinttræning': '#F59E0B',
    'Privattræning m. Ergün': '#EF4444',
  };
  
  return colorMap[categoryName] || '#6B7280';
};

// Get emoji for category
const getCategoryEmoji = (categoryName: string | null): string => {
  if (!categoryName) return '⚽';
  
  const emojiMap: { [key: string]: string } = {
    'Træning': '⚽',
    'Styrketræning': '💪',
    'VR træning': '🥽',
    'Sprinttræning': '🏃',
    'Privattræning m. Ergün': '📋',
  };
  
  return emojiMap[categoryName] || '⚽';
};

export default function ActivityCard({ activity, resolvedDate, onPress }: ActivityCardProps) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      // Navigate to activity details - FIXED: use 'id' parameter name
      console.log('ActivityCard: Navigating to activity details with id:', activity.id);
      router.push({
        pathname: '/activity-details',
        params: { id: activity.id },
      });
    }
  };

  const categoryColor = getCategoryColor(activity.category_name);
  const categoryEmoji = getCategoryEmoji(activity.category_name);
  
  // Format date and time
  const dayLabel = format(resolvedDate, 'EEE. d. MMM.', { locale: da });
  const timeLabel = format(resolvedDate, 'HH:mm');
  
  // Location or category location
  const location = activity.location || activity.category_location || '';

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: categoryColor },
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.cardContent}>
        {/* Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconEmoji}>{categoryEmoji}</Text>
          </View>
        </View>

        {/* Content */}
        <View style={styles.textContainer}>
          <Text style={styles.title} numberOfLines={1}>
            {activity.title || activity.name || 'Uden titel'}
          </Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailIcon}>🕐</Text>
            <Text style={styles.detailText}>{dayLabel} • {timeLabel}</Text>
          </View>

          {location && (
            <View style={styles.detailRow}>
              <Text style={styles.detailIcon}>📍</Text>
              <Text style={styles.detailText}>{location}</Text>
            </View>
          )}

          {activity.is_external && (
            <View style={styles.externalBadge}>
              <Text style={styles.externalText}>📅 Ekstern kalender</Text>
            </View>
          )}
        </View>

        {/* Arrow */}
        <View style={styles.arrowContainer}>
          <Text style={styles.arrow}>›</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.98 }],
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Icon
  iconContainer: {
    marginRight: 12,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 28,
  },

  // Text Content
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detailIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  detailText: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  externalBadge: {
    marginTop: 6,
  },
  externalText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
  },

  // Arrow
  arrowContainer: {
    marginLeft: 8,
  },
  arrow: {
    fontSize: 32,
    fontWeight: '300',
    color: '#FFFFFF',
  },
});
