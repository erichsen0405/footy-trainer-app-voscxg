
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { da } from 'date-fns/locale';

interface ActivityCardProps {
  activity: any;
  resolvedDate: Date;
  onPress?: () => void;
}

// Category gradient mapping - uses actual category names from database
const getCategoryGradient = (category: any): string[] => {
  if (!category || !category.color) {
    return ['#6B7280', '#4B5563']; // Neutral gray fallback
  }
  
  // Use the category color from the database to generate a gradient
  const baseColor = category.color;
  
  // Create a gradient by darkening the base color slightly
  // This ensures all categories get their correct color
  return [baseColor, baseColor];
};

// Get emoji for category
const getCategoryEmoji = (category: any): string => {
  if (!category || !category.emoji) return '⚽';
  return category.emoji;
};

export default function ActivityCard({ activity, resolvedDate, onPress }: ActivityCardProps) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) {
      onPress();
    } else {
      console.log('ActivityCard: Navigating to activity details with id:', activity.id);
      router.push({
        pathname: '/activity-details',
        params: { id: activity.id },
      });
    }
  };

  // Read category from activity.category (resolved in useHomeActivities)
  const category = activity.category || null;
  const gradientColors = getCategoryGradient(category);
  const categoryEmoji = getCategoryEmoji(category);
  
  // Format date and time
  const dayLabel = format(resolvedDate, 'EEE. d. MMM.', { locale: da });
  const timeLabel = format(resolvedDate, 'HH:mm');
  
  // Location or category location
  const location = activity.location || activity.category_location || '';

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        pressed && styles.cardPressed,
      ]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
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
                <Text style={styles.detailText} numberOfLines={1}>{location}</Text>
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
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    padding: 16,
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.15)',
    elevation: 4,
  },
  cardPressed: {
    opacity: 0.85,
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
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
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
    flex: 1,
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
