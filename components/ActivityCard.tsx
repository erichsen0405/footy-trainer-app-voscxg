
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

// Helper function to lighten a hex color
function lightenColor(hex: string, percent: number): string {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Lighten
  const newR = Math.min(255, Math.floor(r + (255 - r) * percent));
  const newG = Math.min(255, Math.floor(g + (255 - g) * percent));
  const newB = Math.min(255, Math.floor(b + (255 - b) * percent));
  
  // Convert back to hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Helper function to darken a hex color
function darkenColor(hex: string, percent: number): string {
  // Remove # if present
  hex = hex.replace('#', '');
  
  // Convert to RGB
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  
  // Darken
  const newR = Math.floor(r * (1 - percent));
  const newG = Math.floor(g * (1 - percent));
  const newB = Math.floor(b * (1 - percent));
  
  // Convert back to hex
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}

// Category gradient mapping - uses actual category color to create gradient
const getCategoryGradient = (category: any): string[] => {
  if (!category || !category.color) {
    // Fallback gradient - should never be used if category is properly resolved
    return ['#6B7280', '#4B5563'];
  }
  
  const baseColor = category.color;
  
  // Create a gradient from lighter to darker variant of the same color
  const lighterColor = lightenColor(baseColor, 0.15);
  const darkerColor = darkenColor(baseColor, 0.2);
  
  return [lighterColor, darkerColor];
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

          {/* Chevron Arrow */}
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
    padding: 18,
    minHeight: 100,
    boxShadow: '0px 4px 14px rgba(0, 0, 0, 0.18)',
    elevation: 5,
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
    marginRight: 14,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 30,
  },

  // Text Content
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  detailIcon: {
    fontSize: 13,
    marginRight: 6,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.95)',
    flex: 1,
  },
  externalBadge: {
    marginTop: 6,
  },
  externalText: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },

  // Chevron Arrow
  arrowContainer: {
    marginLeft: 12,
    justifyContent: 'center',
  },
  arrow: {
    fontSize: 40,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 40,
  },
});
