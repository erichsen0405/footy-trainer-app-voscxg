
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors } from '@/styles/commonStyles';

export default function HomeSkeleton() {
  return (
    <View style={styles.container}>
      {/* Header Skeleton */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
          <View style={styles.logoSkeleton} />
        </View>
        <View style={styles.headerTextContainer}>
          <View style={styles.headerTitleSkeleton} />
          <View style={styles.headerSubtitleSkeleton} />
        </View>
      </View>

      {/* Week Header Skeleton */}
      <View style={styles.weekHeaderContainer}>
        <View style={styles.weekHeaderTitleSkeleton} />
        <View style={styles.weekHeaderSubtitleSkeleton} />
      </View>

      {/* Performance Card Skeleton */}
      <View style={styles.performanceCardSkeleton}>
        <View style={styles.performanceHeaderRow}>
          <View style={styles.performanceLabelSkeleton} />
          <View style={styles.medalBadgeSkeleton} />
        </View>
        <View style={styles.performancePercentageSkeleton} />
        <View style={styles.progressBarSkeleton} />
        <View style={styles.progressDetailSkeleton} />
        <View style={styles.progressBarSkeleton} />
        <View style={styles.progressDetailSkeleton} />
        <View style={styles.motivationTextSkeleton} />
        <View style={styles.performanceButtonSkeleton} />
      </View>

      {/* Create Button Skeleton */}
      <View style={styles.createButtonSkeleton} />

      {/* Section Title Skeleton */}
      <View style={styles.section}>
        <View style={styles.sectionTitleContainer}>
          <View style={styles.greenMarker} />
          <View style={styles.sectionTitleSkeleton} />
        </View>

        {/* Activity Card Skeletons */}
        <View style={styles.activityCardSkeleton}>
          <View style={styles.activityIconSkeleton} />
          <View style={styles.activityContentSkeleton}>
            <View style={styles.activityTitleSkeleton} />
            <View style={styles.activityDetailSkeleton} />
            <View style={styles.activityDetailSkeleton} />
          </View>
        </View>

        <View style={styles.activityCardSkeleton}>
          <View style={styles.activityIconSkeleton} />
          <View style={styles.activityContentSkeleton}>
            <View style={styles.activityTitleSkeleton} />
            <View style={styles.activityDetailSkeleton} />
            <View style={styles.activityDetailSkeleton} />
          </View>
        </View>

        <View style={styles.activityCardSkeleton}>
          <View style={styles.activityIconSkeleton} />
          <View style={styles.activityContentSkeleton}>
            <View style={styles.activityTitleSkeleton} />
            <View style={styles.activityDetailSkeleton} />
            <View style={styles.activityDetailSkeleton} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header Skeleton
  header: {
    backgroundColor: '#2C3E50',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 16,
    paddingBottom: 32,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    marginRight: 16,
  },
  logoSkeleton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitleSkeleton: {
    width: '70%',
    height: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    marginBottom: 8,
  },
  headerSubtitleSkeleton: {
    width: '50%',
    height: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 6,
  },

  // Week Header Skeleton
  weekHeaderContainer: {
    backgroundColor: colors.background,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  weekHeaderTitleSkeleton: {
    width: 120,
    height: 24,
    backgroundColor: colors.card,
    borderRadius: 6,
    marginBottom: 8,
  },
  weekHeaderSubtitleSkeleton: {
    width: 180,
    height: 15,
    backgroundColor: colors.card,
    borderRadius: 4,
  },

  // Performance Card Skeleton
  performanceCardSkeleton: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 24,
    padding: 24,
    backgroundColor: colors.card,
  },
  performanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  performanceLabelSkeleton: {
    width: 100,
    height: 14,
    backgroundColor: colors.highlight,
    borderRadius: 4,
  },
  medalBadgeSkeleton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.highlight,
  },
  performancePercentageSkeleton: {
    width: 120,
    height: 72,
    backgroundColor: colors.highlight,
    borderRadius: 8,
    marginBottom: 12,
  },
  progressBarSkeleton: {
    height: 10,
    backgroundColor: colors.highlight,
    borderRadius: 5,
    marginVertical: 10,
  },
  progressDetailSkeleton: {
    width: '80%',
    height: 15,
    backgroundColor: colors.highlight,
    borderRadius: 4,
    marginTop: 8,
  },
  motivationTextSkeleton: {
    width: '100%',
    height: 44,
    backgroundColor: colors.highlight,
    borderRadius: 6,
    marginTop: 20,
  },
  performanceButtonSkeleton: {
    height: 48,
    backgroundColor: colors.highlight,
    borderRadius: 12,
    marginTop: 20,
  },

  // Create Button Skeleton
  createButtonSkeleton: {
    marginHorizontal: 16,
    marginVertical: 16,
    height: 54,
    backgroundColor: colors.card,
    borderRadius: 14,
  },

  // Section Skeleton
  section: {
    paddingHorizontal: 16,
    marginTop: 28,
    marginBottom: 8,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  greenMarker: {
    width: 5,
    height: 32,
    backgroundColor: '#4CAF50',
    borderRadius: 2.5,
    marginRight: 14,
  },
  sectionTitleSkeleton: {
    width: 80,
    height: 22,
    backgroundColor: colors.card,
    borderRadius: 6,
  },

  // Activity Card Skeleton
  activityCardSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    minHeight: 100,
  },
  activityIconSkeleton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.highlight,
    marginRight: 14,
  },
  activityContentSkeleton: {
    flex: 1,
  },
  activityTitleSkeleton: {
    width: '80%',
    height: 18,
    backgroundColor: colors.highlight,
    borderRadius: 4,
    marginBottom: 12,
  },
  activityDetailSkeleton: {
    width: '60%',
    height: 14,
    backgroundColor: colors.highlight,
    borderRadius: 4,
    marginTop: 6,
  },
});
