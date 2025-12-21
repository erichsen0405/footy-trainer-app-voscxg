
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { format, startOfWeek, endOfWeek, isSameWeek, isToday, parseISO, isBefore, startOfDay } from 'date-fns';
import { da } from 'date-fns/locale';

import { BodyScrollView } from '@/components/BodyScrollView';
import CreateActivityModal from '@/components/CreateActivityModal';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const themeColors = getColors(colorScheme);
  const router = useRouter();
  
  const [showCreateModal, setShowCreateModal] = useState(false);

  const {
    activities,
    categories,
    loading,
    refetchActivities,
    refetchCategories,
  } = useHomeActivities();

  // Calculate week progress and points
  const weekStats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const weekActivities = activities.filter(activity => {
      const activityDate = parseISO(activity.activity_date);
      return isSameWeek(activityDate, now, { weekStartsOn: 1 });
    });

    // For now, we'll use a simple calculation
    // In a real app, this would be based on completed tasks
    const totalActivities = weekActivities.length;
    const completedActivities = 0; // TODO: Calculate from tasks
    const percentage = totalActivities > 0 ? (completedActivities / totalActivities) * 100 : 0;

    return {
      percentage,
      completed: completedActivities,
      total: totalActivities,
    };
  }, [activities]);

  // Get motivational text based on progress
  const getMotivationalText = (percentage: number) => {
    if (percentage >= 80) {
      return {
        title: 'Fantastisk arbejde! 🎉',
        message: 'Du er på rette vej til en fantastisk uge!',
      };
    } else if (percentage >= 50) {
      return {
        title: 'Godt gået! 💪',
        message: 'Du klarer dig rigtig godt. Fortsæt det gode arbejde!',
      };
    } else if (percentage > 0) {
      return {
        title: 'Kom så! 🔥',
        message: 'Der er stadig tid til at nå dine mål denne uge!',
      };
    } else {
      return {
        title: 'Lad os komme i gang! ⚽',
        message: 'En ny uge er en ny mulighed for at nå dine mål!',
      };
    }
  };

  // Get progress color
  const getProgressColor = (percentage: number) => {
    if (percentage >= 80) return '#4CAF50'; // Green
    if (percentage >= 50) return '#FFC107'; // Yellow
    return '#F44336'; // Red
  };

  // Filter today's activities
  const todayActivities = useMemo(() => {
    return activities.filter(activity => {
      const activityDate = parseISO(activity.activity_date);
      return isToday(activityDate);
    });
  }, [activities]);

  // Group upcoming activities by week
  const upcomingActivitiesByWeek = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    
    const upcoming = activities.filter(activity => {
      const activityDate = parseISO(activity.activity_date);
      return !isBefore(activityDate, today);
    });

    const grouped: { [key: string]: typeof activities } = {};
    
    upcoming.forEach(activity => {
      const activityDate = parseISO(activity.activity_date);
      const weekStart = startOfWeek(activityDate, { weekStartsOn: 1 });
      const weekKey = format(weekStart, 'yyyy-MM-dd');
      
      if (!grouped[weekKey]) {
        grouped[weekKey] = [];
      }
      grouped[weekKey].push(activity);
    });

    return Object.entries(grouped).map(([weekKey, weekActivities]) => ({
      weekStart: parseISO(weekKey),
      activities: weekActivities,
    }));
  }, [activities]);

  const motivationalText = getMotivationalText(weekStats.percentage);
  const progressColor = getProgressColor(weekStats.percentage);

  const getCategoryForActivity = (categoryId?: string) => {
    return categories.find(cat => cat.id === categoryId);
  };

  const handleActivityPress = (activityId: string) => {
    router.push({
      pathname: '/activity-details',
      params: { id: activityId },
    });
  };

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <BodyScrollView contentContainerStyle={styles.scrollContent}>
        {/* Week Progress Card */}
        <View style={[styles.progressCard, { backgroundColor: themeColors.card }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressTitle, { color: themeColors.text }]}>
              Ugens fremskridt
            </Text>
            <View style={[styles.pointsBadge, { backgroundColor: progressColor }]}>
              <Text style={styles.pointsText}>
                {weekStats.completed}/{weekStats.total}
              </Text>
            </View>
          </View>
          
          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { backgroundColor: themeColors.highlight }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    backgroundColor: progressColor,
                    width: `${weekStats.percentage}%`,
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.motivationalContainer}>
            <Text style={[styles.motivationalTitle, { color: themeColors.text }]}>
              {motivationalText.title}
            </Text>
            <Text style={[styles.motivationalMessage, { color: themeColors.textSecondary }]}>
              {motivationalText.message}
            </Text>
          </View>
        </View>

        {/* Create Activity Button */}
        <TouchableOpacity
          style={[styles.createButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowCreateModal(true)}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
            size={24}
            color="#fff"
          />
          <Text style={styles.createButtonText}>Opret aktivitet</Text>
        </TouchableOpacity>

        {/* Today's Activities */}
        {todayActivities.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
              I dag
            </Text>
            {todayActivities.map((activity, index) => {
              const category = getCategoryForActivity(activity.category_id);
              return (
                <TouchableOpacity
                  key={activity.id}
                  style={[styles.activityCard, { backgroundColor: themeColors.card }]}
                  onPress={() => handleActivityPress(activity.id)}
                >
                  <View style={styles.activityHeader}>
                    <View style={styles.activityTitleRow}>
                      {category && (
                        <View
                          style={[
                            styles.categoryDot,
                            { backgroundColor: category.color },
                          ]}
                        />
                      )}
                      <Text style={[styles.activityTitle, { color: themeColors.text }]}>
                        {activity.title}
                      </Text>
                    </View>
                    <Text style={[styles.activityTime, { color: themeColors.textSecondary }]}>
                      {activity.activity_time}
                    </Text>
                  </View>
                  {activity.location && (
                    <Text style={[styles.activityLocation, { color: themeColors.textSecondary }]}>
                      📍 {activity.location}
                    </Text>
                  )}
                  {category && (
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                      <Text style={[styles.categoryName, { color: themeColors.textSecondary }]}>
                        {category.name}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Upcoming Activities by Week */}
        {upcomingActivitiesByWeek.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
              Kommende aktiviteter
            </Text>
            {upcomingActivitiesByWeek.map((week, weekIndex) => {
              const weekStart = week.weekStart;
              const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
              const weekLabel = `Uge ${format(weekStart, 'w', { locale: da })} • ${format(weekStart, 'd. MMM', { locale: da })} - ${format(weekEnd, 'd. MMM', { locale: da })}`;

              return (
                <View key={weekIndex} style={styles.weekGroup}>
                  <Text style={[styles.weekLabel, { color: themeColors.textSecondary }]}>
                    {weekLabel}
                  </Text>
                  {week.activities.map((activity, activityIndex) => {
                    const category = getCategoryForActivity(activity.category_id);
                    const activityDate = parseISO(activity.activity_date);
                    const dayLabel = format(activityDate, 'EEEE d. MMM', { locale: da });

                    return (
                      <TouchableOpacity
                        key={activity.id}
                        style={[styles.activityCard, { backgroundColor: themeColors.card }]}
                        onPress={() => handleActivityPress(activity.id)}
                      >
                        <View style={styles.activityHeader}>
                          <View style={styles.activityTitleRow}>
                            {category && (
                              <View
                                style={[
                                  styles.categoryDot,
                                  { backgroundColor: category.color },
                                ]}
                              />
                            )}
                            <Text style={[styles.activityTitle, { color: themeColors.text }]}>
                              {activity.title}
                            </Text>
                          </View>
                          <Text style={[styles.activityTime, { color: themeColors.textSecondary }]}>
                            {activity.activity_time}
                          </Text>
                        </View>
                        <Text style={[styles.activityDate, { color: themeColors.textSecondary }]}>
                          {dayLabel}
                        </Text>
                        {activity.location && (
                          <Text style={[styles.activityLocation, { color: themeColors.textSecondary }]}>
                            📍 {activity.location}
                          </Text>
                        )}
                        {category && (
                          <View style={styles.categoryBadge}>
                            <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                            <Text style={[styles.categoryName, { color: themeColors.textSecondary }]}>
                              {category.name}
                            </Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </View>
        )}

        {/* Empty State */}
        {!loading && activities.length === 0 && (
          <View style={styles.emptyState}>
            <IconSymbol
              ios_icon_name="calendar.badge.plus"
              android_material_icon_name="event_available"
              size={64}
              color={themeColors.textSecondary}
            />
            <Text style={[styles.emptyTitle, { color: themeColors.text }]}>
              Ingen aktiviteter endnu
            </Text>
            <Text style={[styles.emptyMessage, { color: themeColors.textSecondary }]}>
              Opret din første aktivitet for at komme i gang
            </Text>
          </View>
        )}
      </BodyScrollView>

      {/* Create Activity Modal */}
      {showCreateModal && (
        <CreateActivityModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreateActivity={async (activityData) => {
            // Handle activity creation
            await refetchActivities();
            setShowCreateModal(false);
          }}
          categories={categories}
          onRefreshCategories={refetchCategories}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  progressCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.1)',
    elevation: 3,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  pointsBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pointsText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  progressBarContainer: {
    marginBottom: 16,
  },
  progressBar: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  motivationalContainer: {
    marginTop: 8,
  },
  motivationalTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  motivationalMessage: {
    fontSize: 14,
    lineHeight: 20,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  weekGroup: {
    marginBottom: 16,
  },
  weekLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  activityCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.08)',
    elevation: 2,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  activityTime: {
    fontSize: 14,
    fontWeight: '500',
  },
  activityDate: {
    fontSize: 14,
    marginBottom: 4,
  },
  activityLocation: {
    fontSize: 14,
    marginBottom: 8,
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  categoryEmoji: {
    fontSize: 14,
  },
  categoryName: {
    fontSize: 13,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyMessage: {
    fontSize: 14,
    textAlign: 'center',
  },
});
