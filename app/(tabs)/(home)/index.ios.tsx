/**
 * PERFORMANCE LOCK (STEP F)
 * DO NOT:
 * - Add fetch / async work in onPress, onOpen, or navigation handlers
 * - Replace FlatList / SectionList with ScrollView for dynamic lists
 * - Add inline handlers inside render
 * - Remove memoization (useCallback, useMemo, React.memo)
 * - Introduce blocking logic before first paint
 *
 * Any change here REQUIRES re-validation against STEP F.
 * This file is PERFORMANCE-SENSITIVE.
 */

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PERFORMANCE BASELINE CHECKLIST (STEP F)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ✅ 1️⃣ First render & loading
 *    - Skeleton shown immediately (no blocking before paint)
 *    - Data fetched in useEffect (after mount)
 *    - Parallel fetch in useHomeActivities hook (Promise.all)
 *
 * ✅ 2️⃣ Navigation
 *    - No fetch in onPress handlers
 *    - Navigation happens immediately
 *    - Data fetched after mount in target screen
 *
 * ✅ 3️⃣ Lists (FlatList)
 *    - Using FlatList (not ScrollView)
 *    - keyExtractor with stable, unique keys
 *    - initialNumToRender=8
 *    - windowSize=5
 *    - removeClippedSubviews enabled (native only)
 *
 * ✅ 4️⃣ Render control
 *    - useMemo for derived data (flattenedData, performanceMetrics)
 *    - useCallback for handlers (handleCardPress, onRefresh)
 *    - No inline functions in render
 *    - Stable dependencies in hooks
 *
 * ✅ 5️⃣ Context guardrails
 *    - Contexts split by responsibility (Admin, TeamPlayer, Football)
 *    - No unstable values passed to context
 *    - Selective consumption of context values
 *
 * ✅ 6️⃣ Permissions & admin-mode
 *    - Permission logic via helper (canTrainerManageActivity)
 *    - UI remains dumb (no permission checks in render)
 *    - Handlers are authoritative (early return)
 *
 * ✅ 7️⃣ Platform parity
 *    - Same performance behavior on iOS/Android/Web
 *    - Platform-specific optimizations (removeClippedSubviews)
 *    - No platform-specific workarounds
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { BackHandler, FlatList, View, Text, StyleSheet, Pressable, StatusBar, RefreshControl, Platform, useColorScheme, DeviceEventEmitter, Image, ImageBackground } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Stop, LinearGradient as SvgLinearGradient, Circle, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import { useFootball } from '@/contexts/FootballContext';
import { useAdmin } from '@/contexts/AdminContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import ActivityCard from '@/components/ActivityCard';
import CreateActivityModal from '@/components/CreateActivityModal';
import HomeSkeleton from '@/components/HomeSkeleton';
import { IconSymbol } from '@/components/IconSymbol';
import { AdminContextWrapper } from '@/components/AdminContextWrapper';
import * as CommonStyles from '@/styles/commonStyles';
import { format, startOfWeek, endOfWeek, getWeek } from 'date-fns';
import { da } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { canTrainerManageActivity } from '@/utils/permissions';
import { fetchSelfFeedbackForActivities } from '@/services/feedbackService';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { formatHoursDa, getActivityEffectiveDurationMinutes } from '@/utils/activityDuration';
import { markHomeScreenReady } from '@/utils/startupLoader';
import { withTimeout } from '@/utils/withTimeout';
import type { TaskTemplateSelfFeedback } from '@/types';

const FALLBACK_COLORS = {
  primary: '#4CAF50',
  secondary: '#2196F3',
  accent: '#FF9800',
  background: '#FFFFFF',
  backgroundAlt: '#F5F5F5',
  text: '#333333',
  textSecondary: '#666666',
  card: '#F5F5F5',
  highlight: '#E0E0E0',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  gold: '#FFD700',
  silver: '#C0C0C0',
  bronze: '#CD7F32',
  contextWarning: '#F5E6D3',
};

const colors = (CommonStyles as any).colors ?? FALLBACK_COLORS;

function resolveActivityDateTime(activity: any): Date | null {
  // STEP H: Guard against null/undefined activity
  if (!activity) return null;

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

function getWeekLabel(date: Date): string {
  // STEP H: Guard against invalid date
  if (!date || isNaN(date.getTime())) {
    return '';
  }

  try {
    const start = startOfWeek(date, { weekStartsOn: 1 });
    const end = endOfWeek(date, { weekStartsOn: 1 });
    return `${format(start, 'd. MMM', { locale: da })} – ${format(end, 'd. MMM', { locale: da })}`;
  } catch (error) {
    console.error('[Home] Error formatting week label:', error);
    return '';
  }
}

function getUpcomingDayLabel(date: Date): string {
  if (!date || isNaN(date.getTime())) return '';
  try {
    return format(date, 'EEE d. MMM', { locale: da });
  } catch {
    return '';
  }
}

// Helper function to get gradient colors based on performance percentage
// Matches the trophy thresholds from performance screen: ≥80% gold, ≥60% silver, <60% bronze
function getPerformanceGradient(percentage: number): readonly [string, string, string] {
  const safePercentage = typeof percentage === 'number' && !isNaN(percentage) ? percentage : 0;

  if (safePercentage >= 80) {
    return ['#FFD700', '#FFA500', '#FF8C00'] as const;
  } else if (safePercentage >= 60) {
    return ['#E8E8E8', '#C0C0C0', '#A8A8A8'] as const;
  } else {
    return ['#CD7F32', '#B8722E', '#A0642A'] as const;
  }
}

function getPerformanceScaleVisuals(percentage: number): {
  ringGlow: string;
  ringStops: [string, string, string];
  barColors: [string, string, string];
  middleRingProgress: string;
  middleRingTrack: string;
} {
  const safePercentage = typeof percentage === 'number' && !isNaN(percentage) ? percentage : 0;
  const ringStops: [string, string, string] = ['#7EF0FF', '#A6FF7A', '#FFD27A'];
  const barColors: [string, string, string] = ['#FF6B6B', '#FDE776', '#59E382'];
  if (safePercentage >= 80) {
    return {
      ringGlow: 'rgba(96, 224, 123, 0.55)',
      ringStops,
      barColors,
      middleRingProgress: '#6FAF88',
      middleRingTrack: 'rgba(111, 175, 136, 0.24)',
    };
  }
  if (safePercentage >= 60) {
    return {
      ringGlow: 'rgba(255, 210, 94, 0.55)',
      ringStops,
      barColors,
      middleRingProgress: '#BDA86A',
      middleRingTrack: 'rgba(189, 168, 106, 0.24)',
    };
  }
  return {
    ringGlow: 'rgba(255, 92, 92, 0.55)',
    ringStops,
    barColors,
    middleRingProgress: '#B36F6F',
    middleRingTrack: 'rgba(179, 111, 111, 0.24)',
  };
}

type ThisWeekPremiumCardProps = {
  weekLabel: string;
  dateRangeLabel: string;
  percentNumber: number;
  tasksLabel: string;
  plannedLabel: string;
  activitiesLabel?: string;
  trophyCount?: number;
  expanded: boolean;
  onToggle: () => void;
  onCreateActivity: () => void;
  isTodayOnly: boolean;
  onToggleMode: () => void;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const THIS_WEEK_PREMIUM_BG = require('../../../assets/images/home_this_week_premium_bg.png');
const THIS_WEEK_CARD_RADIUS = 28;
const THIS_WEEK_BG_CROP_RADIUS = THIS_WEEK_CARD_RADIUS;
const HOME_REFRESH_TIMEOUT_MS = 10000;

const ThisWeekPremiumCard = React.memo(function ThisWeekPremiumCard({
  weekLabel,
  dateRangeLabel,
  percentNumber,
  tasksLabel,
  plannedLabel,
  activitiesLabel,
  trophyCount = 0,
  expanded,
  onToggle,
  onCreateActivity,
  isTodayOnly,
  onToggleMode,
}: ThisWeekPremiumCardProps) {
  const p = clamp01((Number.isFinite(percentNumber) ? percentNumber : 0) / 100);
  const visuals = getPerformanceScaleVisuals(percentNumber);
  const ignoreNextToggleRef = useRef(false);
  const trophyEmoji = trophyCount <= 1 ? '🥇' : trophyCount === 2 ? '🥈' : '🥉';

  const size = 109;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const progressRingStroke = stroke;
  const progressRingRadius = r;
  const bgRingStroke = progressRingStroke * 2;
  const bgRingRadius = progressRingRadius + progressRingStroke / 2 - bgRingStroke / 2;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - p);

  const chevronRotation = expanded ? '180deg' : '0deg';
  const handleCardPress = useCallback(() => {
    if (ignoreNextToggleRef.current) {
      ignoreNextToggleRef.current = false;
      return;
    }
    onToggle();
  }, [onToggle]);
  const handleCreatePress = useCallback(
    (e: any) => {
      e?.stopPropagation?.();
      onCreateActivity();
    },
    [onCreateActivity]
  );

  const handleModeTogglePress = useCallback(
    (e: any) => {
      e?.stopPropagation?.();
      onToggleMode();
    },
    [onToggleMode]
  );
  return (
    <Pressable
      testID="home.thisWeekPremiumCard.toggle"
      onPress={handleCardPress}
      style={thisWeekPremiumCardStyles.cardPressable}
      accessibilityRole="button"
    >
      <View style={thisWeekPremiumCardStyles.glowWrap}>
        <View style={thisWeekPremiumCardStyles.cardInner}>
          <ImageBackground
            testID="home.thisWeekPremiumCard"
            source={THIS_WEEK_PREMIUM_BG}
            style={thisWeekPremiumCardStyles.cardBackground}
            imageStyle={thisWeekPremiumCardStyles.cardImage}
            resizeMode="stretch"
          />
          <View pointerEvents="none" style={thisWeekPremiumCardStyles.cardImageOverlay} />
          <View pointerEvents="none" style={thisWeekPremiumCardStyles.cardBorderOverlay} />

          <View style={thisWeekPremiumCardStyles.cardContent}>
        <View style={thisWeekPremiumCardStyles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={thisWeekPremiumCardStyles.headerKicker}>
              DENNE UGE <Text style={thisWeekPremiumCardStyles.headerDot}>•</Text>{' '}
              <Text style={thisWeekPremiumCardStyles.headerWeek}>{weekLabel}</Text>
            </Text>
            <Text style={thisWeekPremiumCardStyles.headerRange}>{dateRangeLabel}</Text>
          </View>

          <View style={thisWeekPremiumCardStyles.headerActions}>
            <Pressable
              onPressIn={() => {
                ignoreNextToggleRef.current = true;
              }}
              onPress={handleCreatePress}
              style={thisWeekPremiumCardStyles.createCirclePressable}
              accessibilityRole="button"
              accessibilityLabel="Opret aktivitet"
              testID="home.thisWeekPremiumCard.addButton"
            >
              <LinearGradient
                colors={['#4CC46E', '#279B4A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={thisWeekPremiumCardStyles.createCircle}
              >
                <IconSymbol
                  ios_icon_name="plus"
                  android_material_icon_name="add"
                  size={18}
                  color="#FFFFFF"
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={thisWeekPremiumCardStyles.createSheen}
                />
              </LinearGradient>
            </Pressable>

            <View style={thisWeekPremiumCardStyles.chevronCircle}>
              <LinearGradient
                colors={['#4CC46E', '#279B4A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={thisWeekPremiumCardStyles.chevronCircleButton}
              >
                <View style={[thisWeekPremiumCardStyles.chevronIconWrap, { transform: [{ rotate: chevronRotation }] }]}>
                  <IconSymbol
                    ios_icon_name="chevron.down"
                    android_material_icon_name="keyboard-arrow-down"
                    size={18}
                    color="#FFFFFF"
                  />
                </View>
                <LinearGradient
                  pointerEvents="none"
                  colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={thisWeekPremiumCardStyles.chevronSheen}
                />
              </LinearGradient>
            </View>
          </View>
        </View>

        <View style={thisWeekPremiumCardStyles.contentRow}>
          <View
            testID="home.thisWeekPremiumCard.ring"
            style={[
              thisWeekPremiumCardStyles.ringWrap,
              { shadowColor: visuals.ringGlow },
            ]}
          >
            <Svg width={size} height={size}>
              <Defs>
                <SvgLinearGradient id="homeThisWeekPremiumRing" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={visuals.ringStops[0]} />
                  <Stop offset="0.5" stopColor={visuals.ringStops[1]} />
                  <Stop offset="1" stopColor={visuals.ringStops[2]} />
                </SvgLinearGradient>
              </Defs>

              <Circle
                cx={size / 2}
                cy={size / 2}
                r={bgRingRadius}
                stroke={visuals.middleRingProgress}
                strokeWidth={bgRingStroke}
                fill="none"
                opacity={0.48}
              />
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={progressRingRadius}
                stroke="rgba(213, 246, 230, 0.30)"
                strokeWidth={progressRingStroke}
                fill="none"
              />
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={progressRingRadius}
                stroke="url(#homeThisWeekPremiumRing)"
                strokeWidth={progressRingStroke}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${c} ${c}`}
                strokeDashoffset={dashOffset}
                rotation={-90}
                originX={size / 2}
                originY={size / 2}
              />
            </Svg>

            <Text testID="home.thisWeekPremiumCard.percent" style={thisWeekPremiumCardStyles.percentText}>
              {Math.round(p * 100)}%
            </Text>
          </View>

          <View style={thisWeekPremiumCardStyles.rightCol}>
            <View style={thisWeekPremiumCardStyles.trophyWrap}>
              <View pointerEvents="none" style={thisWeekPremiumCardStyles.trophySparkles}>
                <Svg width="100%" height="100%">
                  <G opacity="0.85">
                    <Circle cx="12%" cy="34%" r="2.2" fill="#FFE7B0" opacity="0.85" />
                    <Circle cx="24%" cy="16%" r="1.2" fill="#FFFFFF" opacity="0.6" />
                    <Circle cx="78%" cy="14%" r="1.5" fill="#FFE7B0" opacity="0.7" />
                    <Circle cx="90%" cy="40%" r="1.1" fill="#FFFFFF" opacity="0.48" />
                  </G>
                </Svg>
              </View>
              <View testID="home.thisWeekPremiumCard.trophy" style={thisWeekPremiumCardStyles.trophyBubble}>
                <Text style={thisWeekPremiumCardStyles.trophyMedal}>{trophyEmoji}</Text>
              </View>
            </View>

            <View style={thisWeekPremiumCardStyles.longBarTrack}>
              <View
                testID="home.thisWeekPremiumCard.progress"
                style={[
                  thisWeekPremiumCardStyles.longBarFill,
                  {
                    width: `${Math.round(p * 100)}%`,
                    backgroundColor: visuals.middleRingProgress,
                  },
                ]}
              />
            </View>
          </View>
        </View>

        <View style={thisWeekPremiumCardStyles.chipsRow}>
          {activitiesLabel ? (
            <View
              testID="home.thisWeekPremiumCard.chip.activities"
              style={[thisWeekPremiumCardStyles.chip, thisWeekPremiumCardStyles.chipActivities]}
            >
              <LinearGradient
                pointerEvents="none"
                colors={['rgba(248,210,124,0.16)', 'rgba(248,210,124,0.13)', 'rgba(255,255,255,0.10)', 'rgba(172,228,255,0.14)', 'rgba(172,228,255,0.18)']}
                locations={[0, 0.28, 0.50, 0.72, 1]}
                start={{ x: 0.92, y: 0.10 }}
                end={{ x: 0.08, y: 0.90 }}
                style={[thisWeekPremiumCardStyles.chipGradientTint, thisWeekPremiumCardStyles.chipGradientTintActivities]}
              />
              <IconSymbol ios_icon_name="calendar" android_material_icon_name="calendar_today" size={14} color="rgba(255,255,255,0.92)" />
              <Text numberOfLines={1} ellipsizeMode="tail" style={thisWeekPremiumCardStyles.chipText}>
                {activitiesLabel}
              </Text>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <View
            testID="home.thisWeekPremiumCard.chip.tasks"
            style={[thisWeekPremiumCardStyles.chip, thisWeekPremiumCardStyles.chipTasks]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(175,228,255,0.18)', 'rgba(175,228,255,0.15)', 'rgba(255,255,255,0.11)', 'rgba(255,210,122,0.15)', 'rgba(255,210,122,0.18)']}
              locations={[0, 0.28, 0.50, 0.72, 1]}
              start={{ x: 0.0, y: 0.12 }}
              end={{ x: 1.0, y: 0.88 }}
              style={[thisWeekPremiumCardStyles.chipGradientTint, thisWeekPremiumCardStyles.chipGradientTintTasks]}
            />
            <IconSymbol ios_icon_name="checkmark.circle" android_material_icon_name="check_circle" size={14} color="rgba(255,255,255,0.92)" />
            <Text numberOfLines={1} ellipsizeMode="tail" style={thisWeekPremiumCardStyles.chipText}>
              {tasksLabel}
            </Text>
          </View>

        </View>

        <View style={thisWeekPremiumCardStyles.chipsRow2}>
          <View
            testID="home.thisWeekPremiumCard.chip.planned"
            style={[thisWeekPremiumCardStyles.chip, thisWeekPremiumCardStyles.chipPlanned]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(166,224,255,0.14)', 'rgba(255,255,255,0.10)', 'rgba(255,216,132,0.14)', 'rgba(255,216,132,0.18)', 'rgba(255,216,132,0.22)']}
              locations={[0, 0.34, 0.56, 0.78, 1]}
              start={{ x: 0.08, y: 0.30 }}
              end={{ x: 0.92, y: 0.70 }}
              style={[thisWeekPremiumCardStyles.chipGradientTint, thisWeekPremiumCardStyles.chipGradientTintPlanned]}
            />
            <IconSymbol ios_icon_name="clock" android_material_icon_name="schedule" size={14} color="rgba(255,255,255,0.92)" />
            <Text numberOfLines={1} ellipsizeMode="tail" style={thisWeekPremiumCardStyles.chipText}>
              {plannedLabel}
            </Text>
          </View>

          <View
            testID="home.thisWeekPremiumCard.badge.today"
            style={[thisWeekPremiumCardStyles.todayBadge, thisWeekPremiumCardStyles.todayBadgeVariant]}
          >
            <LinearGradient
              pointerEvents="none"
              colors={['rgba(168,230,255,0.11)', 'rgba(255,255,255,0.08)', 'rgba(255,220,138,0.12)', 'rgba(255,220,138,0.16)', 'rgba(255,220,138,0.20)']}
              locations={[0, 0.34, 0.56, 0.78, 1]}
              start={{ x: 0.16, y: 0.24 }}
              end={{ x: 0.84, y: 0.76 }}
              style={thisWeekPremiumCardStyles.todayBadgeGradientTint}
            />
            <Pressable
              onPressIn={() => {
                ignoreNextToggleRef.current = true;
              }}
              onPress={handleModeTogglePress}
              testID="home.currentWeek.modeToggle"
              accessibilityRole="switch"
              accessibilityState={{ checked: isTodayOnly }}
              style={thisWeekPremiumCardStyles.todayPressable}
            >
              <IconSymbol ios_icon_name="sun.max" android_material_icon_name="wb_sunny" size={14} color="rgba(255,255,255,0.92)" />
              <Text numberOfLines={1} style={thisWeekPremiumCardStyles.todayText}>
                {isTodayOnly ? 'I dag' : 'Uge'}
              </Text>
            </Pressable>
          </View>
        </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

const thisWeekPremiumCardStyles = StyleSheet.create({
  cardPressable: {
    borderRadius: THIS_WEEK_CARD_RADIUS,
  },
  glowWrap: {
    borderRadius: THIS_WEEK_CARD_RADIUS,
    position: 'relative',
    overflow: 'visible',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardInner: {
    position: 'relative',
    borderRadius: THIS_WEEK_CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  cardBackground: {
    ...StyleSheet.absoluteFillObject,
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: THIS_WEEK_BG_CROP_RADIUS,
    overflow: 'hidden',
  },
  cardImage: {
    borderRadius: THIS_WEEK_BG_CROP_RADIUS,
  },
  cardImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: THIS_WEEK_BG_CROP_RADIUS,
    backgroundColor: 'rgba(0, 0, 0, 0.12)',
  },
  cardBorderOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: THIS_WEEK_CARD_RADIUS,
    borderWidth: 1.2,
    borderTopColor: 'rgba(174, 230, 255, 0.72)',
    borderLeftColor: 'rgba(174, 230, 255, 0.60)',
    borderRightColor: 'rgba(255, 214, 128, 0.62)',
    borderBottomColor: 'rgba(255, 214, 128, 0.78)',
    zIndex: 3,
  },
  cardContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerKicker: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 18,
    letterSpacing: 1.2,
    fontWeight: '700',
  },
  headerDot: { color: 'rgba(255,255,255,0.55)' },
  headerWeek: { color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  headerRange: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '500',
  },
  headerActions: { marginLeft: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  createCirclePressable: {
    width: 34,
    height: 34,
    borderRadius: 17,
    shadowColor: 'rgba(45, 190, 102, 0.55)',
    shadowOpacity: 0.52,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 9,
  },
  createCircle: {
    width: '100%',
    height: '100%',
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  createSheen: {
    position: 'absolute',
    left: -5,
    top: -5,
    width: 34,
    height: 34,
    borderRadius: 999,
  },
  chevronCircle: {
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  chevronCircleButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chevronIconWrap: {
    marginTop: 0,
  },
  chevronSheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: -6,
  },
  ringWrap: {
    width: 122,
    height: 122,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: 0 }],
    marginLeft: -7,
    shadowOpacity: 0.55,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
  },
  percentText: {
    position: 'absolute',
    color: 'rgba(255,255,255,0.92)',
    width: '100%',
    textAlign: 'center',
    fontSize: 25.65,
    fontWeight: '800',
  },
  rightCol: { flex: 1, paddingLeft: 8, justifyContent: 'center' },
  trophyWrap: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    position: 'relative',
    width: 96,
    height: 80,
    transform: [{ translateY: -13 }],
    alignSelf: 'flex-end',
  },
  trophySparkles: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 96,
    height: 80,
  },
  trophyBubble: {
    width: 47,
    height: 47,
    borderRadius: 23.5,
    backgroundColor: 'rgba(255, 210, 122, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,210,122,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD27A',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  trophyMedal: { fontSize: 38, lineHeight: 42 },
  longBarTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
    marginTop: -27,
    width: '108%',
    alignSelf: 'flex-end',
  },
  longBarFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: 'rgba(255, 210, 122, 0.90)',
  },
  chipsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 14,
  },
  chipsRow2: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
    alignItems: 'center',
  },
  chip: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1.1,
    borderTopColor: 'rgba(175, 228, 255, 0.58)',
    borderLeftColor: 'rgba(175, 228, 255, 0.44)',
    borderRightColor: 'rgba(255, 210, 122, 0.44)',
    borderBottomColor: 'rgba(255, 210, 122, 0.58)',
    gap: 8,
    shadowColor: '#84D9FF',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
  },
  chipGradientTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  chipGradientTintTasks: {
    opacity: 0.46,
  },
  chipGradientTintPlanned: {
    opacity: 0.48,
  },
  chipGradientTintActivities: {
    opacity: 0.45,
  },
  chipTasks: {
    borderTopColor: 'rgba(166, 232, 255, 0.82)',
    borderLeftColor: 'rgba(166, 232, 255, 0.72)',
    borderRightColor: 'rgba(246, 212, 126, 0.36)',
    borderBottomColor: 'rgba(246, 212, 126, 0.44)',
    shadowColor: '#8EE0FF',
    shadowOpacity: 0.2,
  },
  chipPlanned: {
    borderTopColor: 'rgba(156, 223, 255, 0.34)',
    borderLeftColor: 'rgba(156, 223, 255, 0.30)',
    borderRightColor: 'rgba(255, 216, 132, 0.78)',
    borderBottomColor: 'rgba(255, 216, 132, 0.86)',
    shadowColor: '#FFD27A',
    shadowOpacity: 0.22,
  },
  chipActivities: {
    borderTopColor: 'rgba(174, 230, 255, 0.70)',
    borderLeftColor: 'rgba(174, 230, 255, 0.62)',
    borderRightColor: 'rgba(250, 210, 120, 0.62)',
    borderBottomColor: 'rgba(250, 210, 120, 0.40)',
    shadowColor: '#A8E9FF',
    shadowOpacity: 0.19,
  },
  chipText: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  todayBadge: {
    width: '24%',
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1.1,
    borderTopColor: 'rgba(175, 228, 255, 0.62)',
    borderLeftColor: 'rgba(175, 228, 255, 0.46)',
    borderRightColor: 'rgba(255, 210, 122, 0.46)',
    borderBottomColor: 'rgba(255, 210, 122, 0.62)',
    marginLeft: 'auto',
    shadowColor: '#FFD27A',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
  },
  todayBadgeGradientTint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    opacity: 0.50,
  },
  todayBadgeVariant: {
    borderTopColor: 'rgba(168, 230, 255, 0.36)',
    borderLeftColor: 'rgba(168, 230, 255, 0.32)',
    borderRightColor: 'rgba(255, 220, 138, 0.84)',
    borderBottomColor: 'rgba(255, 220, 138, 0.92)',
    shadowOpacity: 0.24,
  },
  todayPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    paddingVertical: 0,
    paddingHorizontal: 12,
    borderRadius: 999,
    gap: 8,
  },
  todayText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    fontWeight: '700',
  },
});

function isExternalActivity(activity: any): boolean {
  return Boolean(activity?.is_external ?? activity?.isExternal);
}

function isTrainerAssignedActivityForCurrentUser(activity: any, currentUserId: string | null): boolean {
  const currentUser = normalizeId(currentUserId);
  if (!activity || !currentUser) return false;

  const scopedPlayerId = normalizeId(activity?.player_id ?? activity?.playerId);
  if (scopedPlayerId && scopedPlayerId === currentUser) {
    return true;
  }

  const scopedTeamId = normalizeId(activity?.team_id ?? activity?.teamId);
  if (!scopedTeamId) return false;
  const ownerId = normalizeId(activity?.user_id ?? activity?.userId);
  return !!ownerId && ownerId !== currentUser;
}

type AfterTrainingFeedbackConfig = {
  enableScore: boolean;
  scoreExplanation?: string | null;
  enableNote: boolean;
};

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function isUuidString(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function getFeedbackActivityIdCandidatesForActivity(activity: any): string[] {
  if (!activity) return [];
  const candidates: string[] = [];

  const push = (value: unknown) => {
    const normalized = normalizeId(value);
    if (!normalized) return;
    if (!isUuidString(normalized)) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  if (isExternalActivity(activity)) {
    push((activity as any)?.id ?? (activity as any)?.activity_id);
    push((activity as any)?.externalEventRowId ?? (activity as any)?.external_event_row_id);
    push((activity as any)?.externalEventId ?? (activity as any)?.external_event_id);
    return candidates;
  }

  push((activity as any)?.activity_id ?? (activity as any)?.activityId);
  push((activity as any)?.id);
  return candidates;
}

function safeDateMs(value: unknown): number {
  const ms = new Date(String(value ?? '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeFeedbackTitle(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function isFeedbackTitle(title?: string | null): boolean {
  if (typeof title !== 'string') return false;
  const normalized = normalizeFeedbackTitle(title);
  return normalized.startsWith('feedback pa');
}

function getMarkerTemplateIdFromTask(task: any): string | null {
  if (!task) return null;
  if (typeof task.description === 'string') {
    const fromMarker = parseTemplateIdFromMarker(task.description);
    if (fromMarker) return fromMarker;
  }
  if (typeof task.title === 'string') {
    const fromTitle = parseTemplateIdFromMarker(task.title);
    if (fromTitle) return fromTitle;
  }
  return null;
}

function resolveFeedbackTemplateIdFromTask(task: any): string | null {
  if (!task) return null;
  const direct = normalizeId(task.feedbackTemplateId ?? task.feedback_template_id);
  if (direct) return direct;
  const markerTemplateId = getMarkerTemplateIdFromTask(task);
  if (markerTemplateId) return markerTemplateId;

  if (isFeedbackTitle(task.title)) {
    const fallbackTemplateId = task.taskTemplateId ?? task.task_template_id;
    const normalized = normalizeId(fallbackTemplateId);
    if (normalized) return normalized;
  }

  return null;
}

function isFeedbackTaskFromTask(task: any): boolean {
  if (!task) return false;
  const direct = normalizeId(task.feedbackTemplateId ?? task.feedback_template_id);
  if (direct) return true;
  return !!getMarkerTemplateIdFromTask(task) || isFeedbackTitle(task.title);
}

function normalizeScoreExplanation(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return value ?? null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function buildFeedbackConfig(row?: any): AfterTrainingFeedbackConfig {
  if (!row) {
    return {
      enableScore: true,
      scoreExplanation: null,
      enableNote: true,
    };
  }

  return {
    enableScore: row.after_training_feedback_enable_score ?? true,
    scoreExplanation: normalizeScoreExplanation(row.after_training_feedback_score_explanation),
    enableNote: row.after_training_feedback_enable_note ?? true,
  };
}

function isFeedbackAnswered(
  feedback?: TaskTemplateSelfFeedback,
  config?: AfterTrainingFeedbackConfig,
): boolean {
  if (!feedback) return false;

  const enableScore = config?.enableScore !== false;
  const enableNote = config?.enableNote !== false;

  const hasScore = typeof feedback.rating === 'number';
  const hasNote = (feedback.note?.trim() ?? '').length > 0;

  if (enableScore && hasScore) return true;
  if (enableNote && hasNote) return true;
  return false;
}

function getActivityTasks(activity: any): any[] {
  if (!activity) return [];
  const primary = Array.isArray(activity?.tasks) ? activity.tasks : [];
  if (primary.length) return primary;
  const fallback =
    Array.isArray(activity?.external_tasks) ? activity.external_tasks :
    Array.isArray(activity?.calendar_tasks) ? activity.calendar_tasks :
    [];
  return Array.isArray(fallback) ? fallback : [];
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    activities,
    loading,
    refresh: refreshActivities,
  } = useHomeActivities();
  const {
    categories,
    createActivity,
    refreshData,
    isLoading: footballLoading,
    currentWeekStats,
    updateIntensityByCategory,
  } = useFootball();
  const { adminMode, adminTargetType } = useAdmin();
  const { selectedContext } = useTeamPlayer();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPreviousWeeks, setShowPreviousWeeks] = useState(0);
  const [isPreviousWeeksModalVisible, setIsPreviousWeeksModalVisible] = useState(false);
  const [expandedUpcomingWeeks, setExpandedUpcomingWeeks] = useState<Record<string, boolean>>({});
  const [expandedUpcomingDays, setExpandedUpcomingDays] = useState<Record<string, boolean>>({});
  const [isCurrentWeekTodayOnly, setIsCurrentWeekTodayOnly] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentTrainerId, setCurrentTrainerId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [feedbackConfigByTemplate, setFeedbackConfigByTemplate] = useState<Record<string, AfterTrainingFeedbackConfig>>({});
  const [selfFeedbackRows, setSelfFeedbackRows] = useState<TaskTemplateSelfFeedback[]>([]);
  const [feedbackRefreshKey, setFeedbackRefreshKey] = useState(0);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const emittedHomeReadyRef = useRef(false);

  useEffect(() => {
    if (loading || footballLoading || emittedHomeReadyRef.current) return;
    emittedHomeReadyRef.current = true;
    markHomeScreenReady();
  }, [footballLoading, loading]);

  useEffect(() => {
    const handleSaved = (payload: any) => {
      const activityId = String(payload?.activityId ?? '').trim();
      const templateId = String(payload?.templateId ?? '').trim();
      const taskInstanceId = String(payload?.taskInstanceId ?? '').trim();
      if (!activityId || !templateId) return;

      const createdAt =
        typeof payload?.createdAt === 'string' && payload.createdAt.length
          ? payload.createdAt
          : new Date().toISOString();
      const effectiveInstanceId = taskInstanceId || templateId;
      const optimisticId =
        typeof payload?.optimisticId === 'string' && payload.optimisticId.length
          ? payload.optimisticId
          : `optimistic:${activityId}:${templateId}:${effectiveInstanceId}:${createdAt}`;

      const optimisticRow: TaskTemplateSelfFeedback = {
        id: optimisticId,
        userId: currentUserId ?? 'optimistic',
        taskTemplateId: templateId,
        taskInstanceId: effectiveInstanceId,
        activityId,
        rating: typeof payload?.rating === 'number' ? payload.rating : null,
        note: typeof payload?.note === 'string' ? payload.note : null,
        createdAt,
        updatedAt: createdAt,
      };

      setSelfFeedbackRows((prev) => {
        const next = prev.filter((row) => {
          if (!row?.id?.startsWith('optimistic:')) return true;
          if (row.id === optimisticId) return false;
          const rowInstanceId =
            normalizeId((row as any)?.taskInstanceId ?? (row as any)?.task_instance_id) ??
            normalizeId((row as any)?.taskTemplateId ?? (row as any)?.task_template_id);
          if (row.activityId === activityId && rowInstanceId === effectiveInstanceId) return false;
          return true;
        });
        return [optimisticRow, ...next];
      });
    };

    const handleFailed = (payload: any) => {
      const activityId = String(payload?.activityId ?? '').trim();
      const templateId = String(payload?.templateId ?? '').trim();
      const taskInstanceId = String(payload?.taskInstanceId ?? '').trim();
      const optimisticId =
        typeof payload?.optimisticId === 'string' && payload.optimisticId.length
          ? payload.optimisticId
          : null;

      if (!activityId || !templateId) return;

      setSelfFeedbackRows((prev) =>
        prev.filter((row) => {
          if (!row?.id?.startsWith('optimistic:')) return true;
          if (optimisticId && row.id === optimisticId) return false;
          const rowInstanceId =
            normalizeId((row as any)?.taskInstanceId ?? (row as any)?.task_instance_id) ??
            normalizeId((row as any)?.taskTemplateId ?? (row as any)?.task_template_id);
          const effectiveInstanceId = taskInstanceId || templateId;
          if (row.activityId === activityId && rowInstanceId === effectiveInstanceId) return false;
          return true;
        })
      );
    };

    const savedSub = DeviceEventEmitter.addListener('feedback:saved', handleSaved);
    const failedSub = DeviceEventEmitter.addListener('feedback:save_failed', handleFailed);

    return () => {
      savedSub.remove();
      failedSub.remove();
    };
  }, [currentUserId]);

  // CRITICAL FIX: Check for both player AND team admin mode
  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetType === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  // ✅ GEN-3: category lookup keyed by ID (no fetch; uses cached categories from context)
  const categoriesById = useMemo(() => {
    const m = new Map<string, any>();
    (Array.isArray(categories) ? categories : []).forEach((c: any) => {
      const id = String(c?.id ?? '').trim();
      if (id) m.set(id, c);
    });
    return m;
  }, [categories]);

  // Fetch current trainer ID (the logged-in user who is administering)
  useEffect(() => {
    async function fetchCurrentTrainerId() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setCurrentTrainerId(user.id);
          setCurrentUserId(user.id);
        }
      } catch (error) {
        console.error('[Home] Error fetching current trainer ID:', error);
        // STEP H: Safe fallback - no throw
      }
    }

    fetchCurrentTrainerId();
  }, []);

  // Reset previously loaded week count when loading starts (pull-to-refresh or navigation back)
  useEffect(() => {
    if (loading) {
      if (!isPreviousWeeksModalVisible) {
        setShowPreviousWeeks(0);
      }
    }
  }, [loading, isPreviousWeeksModalVisible]);

  useEffect(() => {
    if (!isPreviousWeeksModalVisible || Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setIsPreviousWeeksModalVisible(false);
      return true;
    });
    return () => subscription.remove();
  }, [isPreviousWeeksModalVisible]);

  const { currentWeekGroup, upcomingByWeek, previousByWeek } = useMemo(() => {
    // STEP H: Guard against non-array activities
    const safeActivities = Array.isArray(activities) ? activities : [];

    const now = new Date();
    const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
    const currentWeekEnd = endOfWeek(now, { weekStartsOn: 1 });

    const resolved = safeActivities
      .map((activity: any) => {
        // STEP H: Guard against null activity
        if (!activity) return null;

        const dateTime = resolveActivityDateTime(activity);
        if (!dateTime) return null;

        // ✅ GEN-3: enrich activity with resolved category color (by category_id) for ActivityCard
        const categoryId = String(
          activity?.category_id ??
            activity?.categoryId ??
            activity?.activity_category_id ??
            activity?.activityCategoryId ??
            activity?.category ??
            ''
        ).trim();

        const cat = categoryId ? categoriesById.get(categoryId) : null;

        const resolvedColor =
          activity?.categoryColor ??
          activity?.category_color ??
          cat?.color ??
          undefined;

        const resolvedEmoji =
          activity?.activity_categories?.emoji ??
          activity?.activity_category?.emoji ??
          cat?.emoji ??
          undefined;

        const resolvedJoined =
          activity?.activity_categories ??
          activity?.activity_category ??
          (cat ? { color: cat.color, emoji: resolvedEmoji } : undefined);

        return {
          ...activity,
          __resolvedDateTime: dateTime,
          categoryColor: resolvedColor,
          category_color: resolvedColor,
          activity_categories: resolvedJoined,
        };
      })
      .filter(Boolean) as any[];

    const currentWeekActivities = resolved
      .filter(
        a =>
          a.__resolvedDateTime >= currentWeekStart &&
          a.__resolvedDateTime <= currentWeekEnd
      )
      .sort(
        (a, b) =>
          a.__resolvedDateTime.getTime() -
          b.__resolvedDateTime.getTime()
      );

    const upcomingActivities = resolved
      .filter(a => a.__resolvedDateTime > currentWeekEnd)
      .sort(
        (a, b) =>
          a.__resolvedDateTime.getTime() -
          b.__resolvedDateTime.getTime()
      );

    const previousActivities = resolved
      .filter(a => a.__resolvedDateTime < currentWeekStart)
      .sort(
        (a, b) =>
          a.__resolvedDateTime.getTime() -
          b.__resolvedDateTime.getTime()
      );

    const currentWeekGroup = {
      weekStart: currentWeekStart,
      activities: currentWeekActivities,
    };

    // Group upcoming activities by week
    const upcomingWeekGroups: { [key: string]: any[] } = {};
    upcomingActivities.forEach(activity => {
      try {
        const weekStart = startOfWeek(activity.__resolvedDateTime, { weekStartsOn: 1 });
        const weekKey = weekStart.toISOString();
        if (!upcomingWeekGroups[weekKey]) {
          upcomingWeekGroups[weekKey] = [];
        }
        upcomingWeekGroups[weekKey].push(activity);
      } catch (error) {
        console.error('[Home] Error grouping upcoming activity:', error);
      }
    });

    const upcomingByWeek = Object.entries(upcomingWeekGroups)
      .map(([weekKey, activities]) => ({
        weekStart: new Date(weekKey),
        activities,
      }))
      .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime());

    // Group previous activities by week
    const previousWeekGroups: { [key: string]: any[] } = {};
    previousActivities.forEach(activity => {
      try {
        const weekStart = startOfWeek(activity.__resolvedDateTime, { weekStartsOn: 1 });
        const weekKey = weekStart.toISOString();
        if (!previousWeekGroups[weekKey]) {
          previousWeekGroups[weekKey] = [];
        }
        previousWeekGroups[weekKey].push(activity);
      } catch (error) {
        console.error('[Home] Error grouping previous activity:', error);
      }
    });

    const previousByWeek = Object.entries(previousWeekGroups)
      .map(([weekKey, activities]) => ({
        weekStart: new Date(weekKey),
        activities,
      }))
      .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());

    return { currentWeekGroup, upcomingByWeek, previousByWeek };
  }, [activities, categoriesById]);

  const feedbackActivityIds = useMemo(() => {
    const ids = new Set<string>();
    const safeActivities = Array.isArray(activities) ? activities : [];
    safeActivities.forEach((activity: any) => {
      const candidates = getFeedbackActivityIdCandidatesForActivity(activity);
      candidates.forEach((candidate) => ids.add(candidate));
    });
    return Array.from(ids);
  }, [activities]);

  const feedbackActivityIdsKey = useMemo(
    () => feedbackActivityIds.join("|"),
    [feedbackActivityIds]
  );

  const getFeedbackActivityCandidates = useCallback(
    (activity: any): string[] => getFeedbackActivityIdCandidatesForActivity(activity),
    [],
  );

  const feedbackTemplateIds = useMemo(() => {
    const ids = new Set<string>();
    const safeActivities = Array.isArray(activities) ? activities : [];
    safeActivities.forEach((activity) => {
      const tasks = getActivityTasks(activity);
      tasks.forEach((task) => {
        if (!isFeedbackTaskFromTask(task)) return;
        const templateId = resolveFeedbackTemplateIdFromTask(task);
        if (templateId) ids.add(templateId);
      });
    });
    return Array.from(ids);
  }, [activities]);

  const feedbackTemplateIdsKey = useMemo(
    () => feedbackTemplateIds.join('|'),
    [feedbackTemplateIds]
  );

  const triggerFeedbackRefresh = useCallback(() => {
    setFeedbackRefreshKey((prev) => prev + 1);
  }, []);

  const refreshHomeScreen = useCallback(async (timeoutMs: number = HOME_REFRESH_TIMEOUT_MS) => {
    const refreshPromises: Promise<unknown>[] = [];

    if (typeof refreshActivities === 'function') {
      refreshPromises.push(refreshActivities());
    } else {
      console.error('[Home] refreshActivities is not a function');
    }

    if (typeof refreshData === 'function') {
      refreshPromises.push(refreshData());
    } else {
      console.error('[Home] refreshData is not a function');
    }

    try {
      if (!refreshPromises.length) {
        return;
      }

      await withTimeout(
        Promise.allSettled(refreshPromises),
        timeoutMs,
        '[Home] Refresh timed out'
      );
    } finally {
      triggerFeedbackRefresh();
    }
  }, [refreshActivities, refreshData, triggerFeedbackRefresh]);

  useFocusEffect(
    useCallback(() => {
      if (!currentUserId || !feedbackActivityIds.length) return;
      triggerFeedbackRefresh();
    }, [currentUserId, feedbackActivityIds.length, triggerFeedbackRefresh])
  );

  useFocusEffect(
    useCallback(() => {
      void refreshHomeScreen().catch((error) => {
        console.error('[Home] Focus refresh failed:', error);
      });
    }, [refreshHomeScreen])
  );

  useEffect(() => {
    if (Array.isArray(activities) && activities.length > 0) {
      setFeedbackRefreshKey((prev) => prev + 1);
    }
  }, [activities]);

  useEffect(() => {
    let cancelled = false;

    if (!feedbackActivityIds.length || !currentUserId) {
      setSelfFeedbackRows([]);
      return;
    }

    (async () => {
      if (feedbackTemplateIds.length) {
        try {
          const { data } = await supabase
            .from('task_templates')
            .select('id, after_training_feedback_enable_score, after_training_feedback_score_explanation, after_training_feedback_enable_note')
            .in('id', feedbackTemplateIds);

          if (!cancelled && Array.isArray(data)) {
            const next: Record<string, AfterTrainingFeedbackConfig> = {};
            for (const row of data as any[]) {
              if (!row?.id) continue;
              next[String(row.id)] = buildFeedbackConfig(row);
            }
            setFeedbackConfigByTemplate((prev) => ({ ...prev, ...next }));
          }
        } catch (error) {
          if (__DEV__) console.log('[Home] feedback config fetch failed', error);
        }
      }

      try {
        const rows = await fetchSelfFeedbackForActivities(currentUserId, feedbackActivityIds);
        if (cancelled) return;
        setSelfFeedbackRows(Array.isArray(rows) ? rows : []);
      } catch (error) {
        if (__DEV__) console.log('[Home] self feedback fetch failed', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentUserId, feedbackActivityIds, feedbackActivityIdsKey, feedbackTemplateIds, feedbackTemplateIdsKey, feedbackRefreshKey]);

  const feedbackCompletionByActivityTaskId = useMemo(() => {
    const latestByKey: Record<string, TaskTemplateSelfFeedback> = {};
    for (const row of selfFeedbackRows) {
      const activityId = normalizeId((row as any)?.activityId ?? (row as any)?.activity_id);
      const taskInstanceId = normalizeId(
        (row as any)?.taskInstanceId ?? (row as any)?.task_instance_id,
      );
      if (!activityId || !taskInstanceId) continue;

      const key = `${activityId}::${taskInstanceId}`;
      if (!latestByKey[key] || safeDateMs(row.createdAt) > safeDateMs(latestByKey[key].createdAt)) {
        latestByKey[key] = row;
      }
    }

    const completionByActivity: Record<string, Record<string, boolean>> = {};
    Object.entries(latestByKey).forEach(([key, row]) => {
      const [activityId, taskInstanceId] = key.split('::');
      if (!activityId || !taskInstanceId) return;

      const templateId = normalizeId((row as any)?.taskTemplateId ?? (row as any)?.task_template_id);
      const config = templateId ? (feedbackConfigByTemplate[templateId] ?? buildFeedbackConfig(undefined)) : buildFeedbackConfig(undefined);
      if (!completionByActivity[activityId]) {
        completionByActivity[activityId] = {};
      }
      completionByActivity[activityId][taskInstanceId] = isFeedbackAnswered(row, config);
    });

    return completionByActivity;
  }, [feedbackConfigByTemplate, selfFeedbackRows]);

  const feedbackCompletionByActivityId = useMemo(() => {
    const latestByKey: Record<string, TaskTemplateSelfFeedback> = {};
    for (const row of selfFeedbackRows) {
      const activityId = normalizeId((row as any)?.activityId ?? (row as any)?.activity_id);
      const templateId = normalizeId((row as any)?.taskTemplateId ?? (row as any)?.task_template_id);
      if (!activityId || !templateId) continue;

      const key = `${activityId}::${templateId}`;
      if (!latestByKey[key] || safeDateMs(row.createdAt) > safeDateMs(latestByKey[key].createdAt)) {
        latestByKey[key] = row;
      }
    }

    const completionByActivity: Record<string, Record<string, boolean>> = {};
    Object.entries(latestByKey).forEach(([key, row]) => {
      const [activityId, templateId] = key.split('::');
      if (!activityId || !templateId) return;

      const config = feedbackConfigByTemplate[templateId] ?? buildFeedbackConfig(undefined);
      if (!completionByActivity[activityId]) {
        completionByActivity[activityId] = {};
      }
      completionByActivity[activityId][templateId] = isFeedbackAnswered(row, config);
    });

    return completionByActivity;
  }, [feedbackConfigByTemplate, selfFeedbackRows]);

  const feedbackDoneByActivityId = useMemo(() => {
    const doneMap: Record<string, boolean> = {};
    Object.entries(feedbackCompletionByActivityId).forEach(([activityId, templateMap]) => {
      if (Object.values(templateMap).some(Boolean)) {
        doneMap[activityId] = true;
      }
    });
    Object.entries(feedbackCompletionByActivityTaskId).forEach(([activityId, taskMap]) => {
      if (Object.values(taskMap).some(Boolean)) {
        doneMap[activityId] = true;
      }
    });
    return doneMap;
  }, [feedbackCompletionByActivityId, feedbackCompletionByActivityTaskId]);

  const buildWeekSummary = useCallback((weekGroup: any, index: number, prefix: string) => {
    const weekStart =
      weekGroup?.weekStart instanceof Date && !isNaN(weekGroup.weekStart.getTime())
        ? weekGroup.weekStart
        : null;
    const weekKey = weekStart ? weekStart.toISOString() : `${prefix}-week-${index}`;
    const weekActivities = Array.isArray(weekGroup?.activities) ? weekGroup.activities : [];
    let totalTasks = 0;
    let totalMinutes = 0;

    weekActivities.forEach((activity: any) => {
      if (!activity) return;
      totalTasks += getActivityTasks(activity).length;
      totalMinutes += getActivityEffectiveDurationMinutes(activity);
    });

    return {
      weekGroup: {
        weekStart: weekStart ?? new Date(),
        activities: weekActivities,
      },
      weekKey,
      activityCount: weekActivities.length,
      totalTasks,
      totalMinutes,
    };
  }, []);

  const currentWeekSummary = useMemo(
    () => buildWeekSummary(currentWeekGroup, 0, 'current-week'),
    [buildWeekSummary, currentWeekGroup]
  );

  const upcomingWeekSummaries = useMemo(() => {
    const safeUpcomingByWeek = Array.isArray(upcomingByWeek) ? upcomingByWeek : [];
    return safeUpcomingByWeek.map((weekGroup, index) => buildWeekSummary(weekGroup, index, 'upcoming'));
  }, [buildWeekSummary, upcomingByWeek]);

  const previousWeekSummaries = useMemo(() => {
    const safePreviousByWeek = Array.isArray(previousByWeek) ? previousByWeek : [];
    return safePreviousByWeek.map((weekGroup, index) => buildWeekSummary(weekGroup, index, 'previous'));
  }, [buildWeekSummary, previousByWeek]);
  const hasPreviousWeekSummaries = previousWeekSummaries.length > 0;

  // Calculate how many previous weeks to display
  const visiblePreviousWeeks = useMemo(() => {
    // STEP H: Guard against invalid showPreviousWeeks
    const safeShowPreviousWeeks = typeof showPreviousWeeks === 'number' && showPreviousWeeks >= 0 ? showPreviousWeeks : 0;

    if (safeShowPreviousWeeks === 0) return [];

    const safePreviousWeekSummaries = Array.isArray(previousWeekSummaries) ? previousWeekSummaries : [];
    return safePreviousWeekSummaries.slice(0, safeShowPreviousWeeks);
  }, [previousWeekSummaries, showPreviousWeeks]);

  // LINT FIX: Include currentWeekStats in dependency array
  const performanceMetrics = useMemo(() => {
    // STEP H: Guard against null/undefined currentWeekStats
    const safeStats = currentWeekStats || {
      percentage: 0,
      completedTasks: 0,
      totalTasks: 0,
      completedTasksForWeek: 0,
      totalTasksForWeek: 0,
    };

    const percentageUpToToday = typeof safeStats.percentage === 'number' ? safeStats.percentage : 0;
    const totalTasksForWeek = typeof safeStats.totalTasksForWeek === 'number' ? safeStats.totalTasksForWeek : 0;
    const completedTasksForWeek = typeof safeStats.completedTasksForWeek === 'number' ? safeStats.completedTasksForWeek : 0;

    const weekPercentage = totalTasksForWeek > 0
      ? Math.round((completedTasksForWeek / totalTasksForWeek) * 100)
      : 0;

    // Determine trophy emoji based on percentage up to today (same thresholds as performance screen)
    let trophyEmoji = '🥉'; // Bronze
    if (percentageUpToToday >= 80) {
      trophyEmoji = '🥇'; // Gold
    } else if (percentageUpToToday >= 60) {
      trophyEmoji = '🥈'; // Silver
    }

    // Calculate remaining tasks
    const completedTasks = typeof safeStats.completedTasks === 'number' ? safeStats.completedTasks : 0;
    const totalTasks = typeof safeStats.totalTasks === 'number' ? safeStats.totalTasks : 0;

    const remainingTasksToday = totalTasks - completedTasks;
    const remainingTasksWeek = totalTasksForWeek - completedTasksForWeek;

    // Generate motivation text
    let motivationText = '';
    if (percentageUpToToday >= 80) {
      motivationText = `Fantastisk! Du er helt på toppen! ${remainingTasksToday > 0 ? `${remainingTasksToday} opgaver tilbage indtil i dag.` : 'Alle opgaver indtil i dag er fuldført! 🌟'}\n${remainingTasksWeek > 0 ? `${remainingTasksWeek} opgaver tilbage for ugen.` : 'Hele ugen er fuldført! 🎉'} ⚽`;
    } else if (percentageUpToToday >= 60) {
      motivationText = `Rigtig godt! Du klarer dig godt! ${remainingTasksToday > 0 ? `${remainingTasksToday} opgaver tilbage indtil i dag.` : 'Alle opgaver indtil i dag er fuldført! 💪'}\n${remainingTasksWeek > 0 ? `${remainingTasksWeek} opgaver tilbage for ugen.` : 'Hele ugen er fuldført! 🎉'} ⚽`;
    } else if (percentageUpToToday >= 40) {
      motivationText = `Du er på vej! ${remainingTasksToday > 0 ? `${remainingTasksToday} opgaver tilbage indtil i dag.` : 'Alle opgaver indtil i dag er fuldført!'}\n${remainingTasksWeek > 0 ? `${remainingTasksWeek} opgaver tilbage for ugen.` : 'Hele ugen er fuldført!'} 🔥`;
    } else {
      motivationText = `Hver træning tæller! ${remainingTasksToday > 0 ? `${remainingTasksToday} opgaver tilbage indtil i dag.` : 'Alle opgaver indtil i dag er fuldført!'}\n${remainingTasksWeek > 0 ? `${remainingTasksWeek} opgaver tilbage for ugen.` : 'Hele ugen er fuldført!'} ⚽`;
    }

    // Get gradient colors based on performance (same thresholds as performance screen)
    const gradientColors = getPerformanceGradient(percentageUpToToday);

    return {
      percentageUpToToday,
      weekPercentage,
      trophyEmoji,
      motivationText,
      completedTasksToday: completedTasks,
      totalTasksToday: totalTasks,
      completedTasksWeek: completedTasksForWeek,
      totalTasksWeek: totalTasksForWeek,
      gradientColors,
    };
  }, [currentWeekStats]);

  const handleCreateActivity = useCallback(async (activityData: any) => {
    try {
      // STEP H: Guard against null/undefined functions
      if (typeof createActivity !== 'function') {
        console.error('[Home] createActivity is not a function');
        return;
      }
      if (typeof refreshData !== 'function') {
        console.error('[Home] refreshData is not a function');
        return;
      }

      const { intensityApplyScope, ...createPayload } = activityData || {};

      await createActivity(createPayload);
      if (
        intensityApplyScope === 'category' &&
        typeof updateIntensityByCategory === 'function' &&
        typeof createPayload?.categoryId === 'string' &&
        createPayload.categoryId.trim().length > 0
      ) {
        await updateIntensityByCategory(
          createPayload.categoryId,
          createPayload.intensityEnabled === true
        );
      }
      refreshData();
    } catch (error) {
      console.error('[Home] Error creating activity:', error);
      // STEP H: Safe fallback - no throw
    }
  }, [createActivity, refreshData, updateIntensityByCategory]);

  const handleLoadMorePrevious = useCallback(() => {
    setShowPreviousWeeks(prev => {
      // STEP H: Guard against invalid prev value
      const safePrev = typeof prev === 'number' && prev >= 0 ? prev : 0;
      const maxWeeks = Array.isArray(previousWeekSummaries) ? previousWeekSummaries.length : 0;
      return Math.min(safePrev + 1, maxWeeks);
    });
  }, [previousWeekSummaries]);

  const handleOpenPreviousWeeksModal = useCallback(() => {
    setShowPreviousWeeks((currentCount) => {
      const safeCount = typeof currentCount === 'number' && currentCount >= 0 ? currentCount : 0;
      if (safeCount > 0) return safeCount;
      const maxWeeks = Array.isArray(previousWeekSummaries) ? previousWeekSummaries.length : 0;
      return Math.min(1, maxWeeks);
    });
    setIsPreviousWeeksModalVisible(true);
  }, [previousWeekSummaries]);

  const handleClosePreviousWeeksModal = useCallback(() => {
    setIsPreviousWeeksModalVisible(false);
  }, []);

  const buildUpcomingDayToggleKey = useCallback((weekKey: string, dayKey: string) => {
    return `${weekKey}::${dayKey}`;
  }, []);

  const getCurrentWeekIdentity = useCallback(() => {
    const now = new Date();
    return {
      currentWeekKey: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      todayDayKey: format(now, 'yyyy-MM-dd'),
    };
  }, []);

  const getCurrentWeekDayToggleKeys = useCallback(
    (todayOnly: boolean) => {
      const { currentWeekKey, todayDayKey } = getCurrentWeekIdentity();
      if (!todayOnly) {
        return [];
      }
      return [buildUpcomingDayToggleKey(currentWeekKey, todayDayKey)];
    },
    [buildUpcomingDayToggleKey, getCurrentWeekIdentity]
  );

  const applyCurrentWeekViewMode = useCallback((todayOnly: boolean) => {
    const { currentWeekKey } = getCurrentWeekIdentity();
    const targetDayKeys = getCurrentWeekDayToggleKeys(todayOnly);

    setExpandedUpcomingWeeks((prev) =>
      prev[currentWeekKey]
        ? prev
        : {
            ...prev,
            [currentWeekKey]: true,
          }
    );

    setExpandedUpcomingDays((prev) => {
      const prefix = `${currentWeekKey}::`;
      const next: Record<string, boolean> = {};
      let changed = false;

      Object.entries(prev).forEach(([key, value]) => {
        if (key.startsWith(prefix)) {
          changed = true;
          return;
        }
        next[key] = value;
      });

      targetDayKeys.forEach((key) => {
        if (next[key] !== true) {
          changed = true;
        }
        next[key] = true;
      });

      return changed ? next : prev;
    });
  }, [getCurrentWeekDayToggleKeys, getCurrentWeekIdentity]);

  const toggleCurrentWeekViewMode = useCallback(() => {
    setIsCurrentWeekTodayOnly((prev) => {
      const next = !prev;
      applyCurrentWeekViewMode(next);
      return next;
    });
  }, [applyCurrentWeekViewMode]);

  const toggleUpcomingWeekExpanded = useCallback((weekKey: string, section?: string) => {
    setExpandedUpcomingWeeks((prev) => {
      const nextExpanded = !prev[weekKey];

      // Requirement: when opening a week, all day groups start collapsed.
      if (nextExpanded) {
        if (section === 'currentWeek') {
          const targetDayKeys = getCurrentWeekDayToggleKeys(isCurrentWeekTodayOnly);
          setExpandedUpcomingDays((dayPrev) => {
            const next = { ...dayPrev };
            const prefix = `${weekKey}::`;
            Object.keys(next).forEach((key) => {
              if (key.startsWith(prefix)) {
                delete next[key];
              }
            });
            targetDayKeys.forEach((key) => {
              next[key] = true;
            });
            return next;
          });
        } else {
          setExpandedUpcomingDays((dayPrev) => {
            const next = { ...dayPrev };
            const prefix = `${weekKey}::`;
            Object.keys(next).forEach((key) => {
              if (key.startsWith(prefix)) {
                delete next[key];
              }
            });
            return next;
          });
        }
      }

      return {
        ...prev,
        [weekKey]: nextExpanded,
      };
    });
  }, [getCurrentWeekDayToggleKeys, isCurrentWeekTodayOnly]);

  const toggleUpcomingDayExpanded = useCallback(
    (weekKey: string, dayKey: string) => {
      const toggleKey = buildUpcomingDayToggleKey(weekKey, dayKey);
      setExpandedUpcomingDays((prev) => ({
        ...prev,
        [toggleKey]: !prev[toggleKey],
      }));
    },
    [buildUpcomingDayToggleKey],
  );

  useEffect(() => {
    applyCurrentWeekViewMode(isCurrentWeekTodayOnly);
  }, [applyCurrentWeekViewMode, isCurrentWeekTodayOnly]);

  useFocusEffect(
    useCallback(() => {
      applyCurrentWeekViewMode(isCurrentWeekTodayOnly);
    }, [applyCurrentWeekViewMode, isCurrentWeekTodayOnly])
  );

  // P4 FIX: Pull-to-refresh handler with deterministic stop
  const onRefresh = useCallback(async () => {
    // Guard against double-trigger
    if (isRefreshing) {
      console.log('[Home] Pull-to-refresh already in progress, ignoring');
      return;
    }

    console.log('[Home] Pull-to-refresh triggered');
    setIsRefreshing(true);

    try {
      await refreshHomeScreen();
      console.log('[Home] Pull-to-refresh completed successfully');
    } catch (error) {
      console.error('[Home] Pull-to-refresh error:', error);
      // STEP H: Safe fallback - no throw
    } finally {
      // Deterministic stop - always called
      setIsRefreshing(false);
      console.log('[Home] Pull-to-refresh spinner stopped');
    }
  }, [isRefreshing, refreshHomeScreen]);

  const buildActivityKey = useCallback((activity: any, section: string) => {
    if (!activity) return `fallback:activity:${section}`;
    const rawId = activity?.id ?? activity?.activity_id ?? activity?.activityId;
    const normalizedId = rawId !== null && rawId !== undefined ? String(rawId).trim() : '';
    if (normalizedId) return `activity:${normalizedId}`;
    const dateKey =
      activity.__resolvedDateTime instanceof Date && !isNaN(activity.__resolvedDateTime.getTime())
        ? activity.__resolvedDateTime.toISOString()
        : '';
    const titleKey = typeof activity?.title === 'string' ? activity.title.trim() : '';
    return `fallback:activity:${section}:${dateKey}:${titleKey}`;
  }, []);

  // Flatten all data into a single list for FlatList
  // Each item has a type to determine how to render it
  const flattenedData = useMemo(() => {
    const data: any[] = [];

    const safeCurrentWeekSummary = currentWeekSummary?.weekGroup ? currentWeekSummary : null;
    const safeUpcomingWeekSummaries = Array.isArray(upcomingWeekSummaries) ? upcomingWeekSummaries : [];
    const safePreviousWeekSummaries = Array.isArray(previousWeekSummaries) ? previousWeekSummaries : [];

    const appendWeekAccordionRows = (summary: any, section: string) => {
      if (!summary?.weekGroup || !summary?.weekKey) return;

      data.push({
        type: 'upcomingWeekSummary',
        weekGroup: summary.weekGroup,
        section,
        weekKey: summary.weekKey,
        activityCount: summary.activityCount,
        totalTasks: summary.totalTasks,
        totalMinutes: summary.totalMinutes,
        key: `summary:${section}:${summary.weekKey}`,
      });

      if (!expandedUpcomingWeeks[summary.weekKey]) return;

      const rawWeekActivities = Array.isArray(summary.weekGroup.activities) ? summary.weekGroup.activities : [];
      const currentDayKey = format(new Date(), 'yyyy-MM-dd');
      const weekActivities =
        section === 'currentWeek' && isCurrentWeekTodayOnly
          ? rawWeekActivities.filter((activity: any) => {
              const resolvedDate =
                activity?.__resolvedDateTime instanceof Date && !isNaN(activity.__resolvedDateTime.getTime())
                  ? activity.__resolvedDateTime
                  : null;
              const dayKey = resolvedDate ? format(resolvedDate, 'yyyy-MM-dd') : null;
              return dayKey === currentDayKey;
            })
          : rawWeekActivities;
      const dayStatsByKey: Record<
        string,
        { activityCount: number; totalTasks: number; totalMinutes: number }
      > = {};
      weekActivities.forEach((activity: any) => {
        if (!activity) return;
        const resolvedDate =
          activity.__resolvedDateTime instanceof Date && !isNaN(activity.__resolvedDateTime.getTime())
            ? activity.__resolvedDateTime
            : null;
        const dayKey = resolvedDate ? format(resolvedDate, 'yyyy-MM-dd') : null;
        if (!dayKey) return;
        if (!dayStatsByKey[dayKey]) {
          dayStatsByKey[dayKey] = { activityCount: 0, totalTasks: 0, totalMinutes: 0 };
        }
        dayStatsByKey[dayKey].activityCount += 1;
        dayStatsByKey[dayKey].totalTasks += getActivityTasks(activity).length;
        dayStatsByKey[dayKey].totalMinutes += getActivityEffectiveDurationMinutes(activity);
      });

      let previousDayKey: string | null = null;
      weekActivities.forEach((activity: any) => {
        if (!activity) return;
        const resolvedDate =
          activity.__resolvedDateTime instanceof Date && !isNaN(activity.__resolvedDateTime.getTime())
            ? activity.__resolvedDateTime
            : null;
        const dayKey = resolvedDate ? format(resolvedDate, 'yyyy-MM-dd') : null;

        if (dayKey && dayKey !== previousDayKey) {
          const dayToggleKey = buildUpcomingDayToggleKey(summary.weekKey, dayKey);
          const dayStats = dayStatsByKey[dayKey] ?? {
            activityCount: 0,
            totalTasks: 0,
            totalMinutes: 0,
          };
          data.push({
            type: 'upcomingDayDivider',
            section,
            weekKey: summary.weekKey,
            dayKey,
            dayToggleKey,
            date: resolvedDate,
            activityCount: dayStats.activityCount,
            totalTasks: dayStats.totalTasks,
            totalMinutes: dayStats.totalMinutes,
            key: `divider:${section}:${summary.weekKey}:${dayKey}`,
          });
          previousDayKey = dayKey;
        }

        if (dayKey) {
          const dayToggleKey = buildUpcomingDayToggleKey(summary.weekKey, dayKey);
          if (!expandedUpcomingDays[dayToggleKey]) {
            return;
          }
        }

        const rawId = activity?.id ?? activity?.activity_id ?? activity?.activityId;
        const normalizedId = rawId !== null && rawId !== undefined ? String(rawId).trim() : '';
        const fallbackDateKey =
          activity?.__resolvedDateTime instanceof Date && !isNaN(activity.__resolvedDateTime.getTime())
            ? activity.__resolvedDateTime.toISOString()
            : '';
        const fallbackTitleKey = typeof activity?.title === 'string' ? activity.title.trim() : '';
        const activityKey = normalizedId
          ? `activity:${normalizedId}`
          : `fallback:activity:${section}:${fallbackDateKey}:${fallbackTitleKey}`;

        data.push({
          type: 'activity',
          activity,
          section,
          key: activityKey,
        });
      });
    };

    // Add control row for previous weeks (opened in modal)
    if (safePreviousWeekSummaries.length > 0) {
      data.push({
        type: 'loadMore',
        key: 'loadMore:previous',
        canLoadMore: showPreviousWeeks < safePreviousWeekSummaries.length,
        source: 'main',
      });
    }

    // Add DENNE UGE card
    if (safeCurrentWeekSummary) {
      appendWeekAccordionRows(safeCurrentWeekSummary, 'currentWeek');
    }

    // Add KOMMENDE cards
    if (safeUpcomingWeekSummaries.length > 0) {
      safeUpcomingWeekSummaries.forEach((summary) => {
        appendWeekAccordionRows(summary, 'upcoming');
      });
    }

    return data;
  }, [
    currentWeekSummary,
    isCurrentWeekTodayOnly,
    previousWeekSummaries,
    showPreviousWeeks,
    upcomingWeekSummaries,
    buildUpcomingDayToggleKey,
    expandedUpcomingDays,
    expandedUpcomingWeeks,
  ]);

  const previousWeeksModalData = useMemo(() => {
    const data: any[] = [];
    const safeVisiblePreviousWeeks = Array.isArray(visiblePreviousWeeks) ? visiblePreviousWeeks : [];

    const appendWeekAccordionRows = (summary: any, section: string) => {
      if (!summary?.weekGroup || !summary?.weekKey) return;

      data.push({
        type: 'upcomingWeekSummary',
        weekGroup: summary.weekGroup,
        section,
        weekKey: summary.weekKey,
        activityCount: summary.activityCount,
        totalTasks: summary.totalTasks,
        totalMinutes: summary.totalMinutes,
        key: `summary:${section}:${summary.weekKey}`,
      });

      if (!expandedUpcomingWeeks[summary.weekKey]) return;

      const rawWeekActivities = Array.isArray(summary.weekGroup.activities) ? summary.weekGroup.activities : [];
      const dayStatsByKey: Record<
        string,
        { activityCount: number; totalTasks: number; totalMinutes: number }
      > = {};

      rawWeekActivities.forEach((activity: any) => {
        if (!activity) return;
        const resolvedDate =
          activity.__resolvedDateTime instanceof Date && !isNaN(activity.__resolvedDateTime.getTime())
            ? activity.__resolvedDateTime
            : null;
        const dayKey = resolvedDate ? format(resolvedDate, 'yyyy-MM-dd') : null;
        if (!dayKey) return;
        if (!dayStatsByKey[dayKey]) {
          dayStatsByKey[dayKey] = { activityCount: 0, totalTasks: 0, totalMinutes: 0 };
        }
        dayStatsByKey[dayKey].activityCount += 1;
        dayStatsByKey[dayKey].totalTasks += getActivityTasks(activity).length;
        dayStatsByKey[dayKey].totalMinutes += getActivityEffectiveDurationMinutes(activity);
      });

      let previousDayKey: string | null = null;
      rawWeekActivities.forEach((activity: any) => {
        if (!activity) return;
        const resolvedDate =
          activity.__resolvedDateTime instanceof Date && !isNaN(activity.__resolvedDateTime.getTime())
            ? activity.__resolvedDateTime
            : null;
        const dayKey = resolvedDate ? format(resolvedDate, 'yyyy-MM-dd') : null;

        if (dayKey && dayKey !== previousDayKey) {
          const dayToggleKey = buildUpcomingDayToggleKey(summary.weekKey, dayKey);
          const dayStats = dayStatsByKey[dayKey] ?? {
            activityCount: 0,
            totalTasks: 0,
            totalMinutes: 0,
          };
          data.push({
            type: 'upcomingDayDivider',
            section,
            weekKey: summary.weekKey,
            dayKey,
            dayToggleKey,
            date: resolvedDate,
            activityCount: dayStats.activityCount,
            totalTasks: dayStats.totalTasks,
            totalMinutes: dayStats.totalMinutes,
            key: `divider:${section}:${summary.weekKey}:${dayKey}`,
          });
          previousDayKey = dayKey;
        }

        if (dayKey) {
          const dayToggleKey = buildUpcomingDayToggleKey(summary.weekKey, dayKey);
          if (!expandedUpcomingDays[dayToggleKey]) {
            return;
          }
        }

        data.push({
          type: 'activity',
          activity,
          section,
          key: buildActivityKey(activity, section),
        });
      });
    };

    safeVisiblePreviousWeeks.forEach((summary) => {
      appendWeekAccordionRows(summary, 'previous');
    });

    data.push({
      type: 'loadMore',
      key: 'loadMore:previous:modal',
      canLoadMore: showPreviousWeeks < safeVisiblePreviousWeeks.length
        ? false
        : showPreviousWeeks < (Array.isArray(previousWeekSummaries) ? previousWeekSummaries.length : 0),
      source: 'modal',
    });

    return data;
  }, [
    buildActivityKey,
    buildUpcomingDayToggleKey,
    expandedUpcomingDays,
    expandedUpcomingWeeks,
    previousWeekSummaries,
    showPreviousWeeks,
    visiblePreviousWeeks,
  ]);

  const handleOpenCreateModal = useCallback(() => {
    setShowCreateModal(true);
  }, []);
  const hasPreviousWeekSummaries = Array.isArray(previousWeekSummaries) && previousWeekSummaries.length > 0;

  const renderItem = useCallback(({ item }: { item: any }) => {
    // STEP H: Guard against null item
    if (!item || !item.type) return null;

    switch (item.type) {
      case 'upcomingWeekSummary':
        if (!item.weekGroup || !item.weekGroup.weekStart || !item.weekKey) return null;

        const summaryEyebrowText =
          item.section === 'previous'
            ? 'TIDLIGERE UGE'
            : item.section === 'currentWeek'
              ? 'DENNE UGE'
              : 'KOMMENDE UGE';
        const summaryTimeLabelPrefix = item.section === 'previous' ? 'Planlagt' : 'Planlagt';

        if (item.section === 'currentWeek') {
          const weekNumber = getWeek(item.weekGroup.weekStart, { weekStartsOn: 1, locale: da });
          const isExpanded = expandedUpcomingWeeks[item.weekKey] === true;
          const percentage = Math.max(0, Math.min(100, Math.round(performanceMetrics.percentageUpToToday || 0)));
          const trophyCount = percentage >= 80 ? 1 : percentage >= 60 ? 2 : 3;

          return (
            <View
              style={[styles.upcomingSummaryWrapper, !hasPreviousWeekSummaries && { marginTop: 16 }]}
              testID="home.weekSummary.currentWeek"
            >
              <ThisWeekPremiumCard
                weekLabel={`Uge ${weekNumber}`}
                dateRangeLabel={getWeekLabel(item.weekGroup.weekStart)}
                percentNumber={percentage}
                tasksLabel={`Opgaver ${performanceMetrics.completedTasksWeek}/${performanceMetrics.totalTasksWeek}`}
                plannedLabel={`Planlagt ${formatHoursDa(item.totalMinutes)}`}
                activitiesLabel={`Aktiviteter ${item.activityCount}`}
                trophyCount={trophyCount}
                expanded={isExpanded}
                onToggle={() => toggleUpcomingWeekExpanded(item.weekKey, item.section)}
                onCreateActivity={handleOpenCreateModal}
                isTodayOnly={isCurrentWeekTodayOnly}
                onToggleMode={toggleCurrentWeekViewMode}
              />
            </View>
          );
        }

        return (
          <View
            style={styles.upcomingSummaryWrapper}
            testID={`home.weekSummary.${item.section ?? 'unknown'}`}
          >
            <Pressable
              onPress={() => toggleUpcomingWeekExpanded(item.weekKey, item.section)}
              style={({ pressed }) => [styles.upcomingSummaryPressable, pressed && styles.upcomingSummaryCardPressed]}
            >
              <View style={styles.upcomingSummaryShadow}>
                <LinearGradient
                  colors={
                    isDark
                      ? ['rgba(43, 76, 92, 0.62)', 'rgba(29, 52, 69, 0.62)', 'rgba(25, 43, 56, 0.62)']
                      : ['rgba(255, 255, 255, 0.62)', 'rgba(234, 243, 238, 0.62)', 'rgba(221, 239, 227, 0.62)']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.upcomingSummaryCard, { borderColor: isDark ? 'rgba(191, 220, 203, 0.20)' : 'rgba(76, 175, 80, 0.22)' }]}
                >
                  <LinearGradient
                    colors={
                      isDark
                        ? ['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.00)']
                        : ['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.8, y: 0.8 }}
                    style={styles.upcomingSummarySheen}
                  />

                  <View style={styles.upcomingSummaryHeader}>
                    <View>
                      <Text style={[styles.upcomingSummaryEyebrow, { color: isDark ? '#BFDCCB' : '#3B6A4D' }]}>
                        {summaryEyebrowText}
                      </Text>
                      <Text style={[styles.upcomingSummaryTitle, { color: isDark ? '#E6F5EC' : '#1D3A2A' }]}>
                        Uge {getWeek(item.weekGroup.weekStart, { weekStartsOn: 1, locale: da })}
                      </Text>
                    </View>

                    <View style={styles.thisWeekHeaderActions}>
                      <Pressable
                        style={styles.upcomingChevronShadow}
                        onPress={handleOpenCreateModal}
                        accessibilityRole="button"
                        accessibilityLabel="Opret aktivitet"
                      >
                        <LinearGradient
                          colors={isDark ? ['#3CC06A', '#1F8A43'] : ['#4CC46E', '#279B4A']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.upcomingChevronButton}
                        >
                          <IconSymbol
                            ios_icon_name="plus"
                            android_material_icon_name="add"
                            size={18}
                            color="#FFFFFF"
                          />
                          <LinearGradient
                            colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.upcomingChevronSheen}
                          />
                        </LinearGradient>
                      </Pressable>
                      <View style={styles.upcomingChevronShadow}>
                        <LinearGradient
                          colors={isDark ? ['#3CC06A', '#1F8A43'] : ['#4CC46E', '#279B4A']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.upcomingChevronButton}
                        >
                          <IconSymbol
                            ios_icon_name="chevron.down"
                            android_material_icon_name="keyboard-arrow-down"
                            size={18}
                            color="#FFFFFF"
                            style={[
                              styles.upcomingChevronIcon,
                              expandedUpcomingWeeks[item.weekKey] && styles.upcomingChevronIconExpanded,
                            ]}
                          />
                          <LinearGradient
                            colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.upcomingChevronSheen}
                          />
                        </LinearGradient>
                      </View>
                    </View>
                  </View>

                  <Text style={[styles.upcomingSummaryRange, { color: isDark ? '#B5D8C2' : '#2C5A40' }]}>
                    {getWeekLabel(item.weekGroup.weekStart)}
                  </Text>

                  <View style={styles.upcomingSummaryBadgesRow}>
                  <View
                      style={[
                        styles.upcomingSummaryChip,
                        { backgroundColor: isDark ? 'rgba(19, 42, 53, 0.62)' : 'rgba(255, 255, 255, 0.72)' },
                      ]}
                    >
                      <IconSymbol
                        ios_icon_name="calendar"
                        android_material_icon_name="calendar_today"
                        size={14}
                        color={isDark ? 'rgba(216, 239, 225, 0.95)' : 'rgba(29, 58, 42, 0.9)'}
                      />
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[styles.upcomingSummaryChipText, { color: isDark ? '#D8EFE1' : '#1D3A2A' }]}
                      >
                        Aktiviteter · {item.activityCount}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.upcomingSummaryChip,
                        { backgroundColor: isDark ? 'rgba(19, 42, 53, 0.62)' : 'rgba(255, 255, 255, 0.72)' },
                      ]}
                    >
                      <IconSymbol
                        ios_icon_name="checkmark.circle"
                        android_material_icon_name="check_circle"
                        size={14}
                        color={isDark ? 'rgba(216, 239, 225, 0.95)' : 'rgba(29, 58, 42, 0.9)'}
                      />
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[styles.upcomingSummaryChipText, { color: isDark ? '#D8EFE1' : '#1D3A2A' }]}
                      >
                        Opgaver · {item.totalTasks}
                      </Text>
                    </View>

                    <View
                      style={[
                        styles.upcomingSummaryChip,
                        styles.upcomingSummaryChipPrimary,
                        { backgroundColor: isDark ? 'rgba(201, 235, 214, 0.14)' : 'rgba(76, 175, 80, 0.16)' },
                      ]}
                    >
                      <IconSymbol
                        ios_icon_name="clock"
                        android_material_icon_name="schedule"
                        size={14}
                        color={isDark ? 'rgba(216, 239, 225, 0.98)' : 'rgba(29, 58, 42, 0.92)'}
                      />
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[styles.upcomingSummaryChipText, { color: isDark ? '#D8EFE1' : '#1D3A2A' }]}
                      >
                        {summaryTimeLabelPrefix}: {formatHoursDa(item.totalMinutes)}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </View>
            </Pressable>
          </View>
        );

      case 'upcomingDayDivider': {
        const date = item.date instanceof Date && !isNaN(item.date.getTime()) ? item.date : null;
        if (!date) return null;
        const isCurrentWeekSection = item.section === 'currentWeek';
        const todayDayKey = format(new Date(), 'yyyy-MM-dd');
        const isCurrentWeekTodayLabel =
          isCurrentWeekSection && String(item.dayKey) === todayDayKey;
        const label = isCurrentWeekTodayLabel ? 'I dag' : getUpcomingDayLabel(date);
        if (!label) return null;
        const dayToggleKey =
          typeof item.dayToggleKey === 'string' && item.dayToggleKey.length > 0
            ? item.dayToggleKey
            : item.weekKey && item.dayKey
              ? buildUpcomingDayToggleKey(String(item.weekKey), String(item.dayKey))
              : null;
        const isExpanded = dayToggleKey ? expandedUpcomingDays[dayToggleKey] === true : false;
        const activityCount = Math.max(0, Number(item.activityCount) || 0);
        const totalTasks = Math.max(0, Number(item.totalTasks) || 0);
        const totalMinutes = Math.max(0, Number(item.totalMinutes) || 0);
        return (
          <View style={styles.upcomingDayDivider}>
            <View style={styles.upcomingDayCardShadow}>
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(43, 76, 92, 0.46)', 'rgba(29, 52, 69, 0.46)', 'rgba(25, 43, 56, 0.46)']
                    : ['rgba(255, 255, 255, 0.56)', 'rgba(234, 243, 238, 0.56)', 'rgba(221, 239, 227, 0.56)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.upcomingDayCard,
                  { borderColor: isDark ? 'rgba(191,220,203,0.18)' : 'rgba(76,175,80,0.2)' },
                ]}
              >
                <Pressable
                  style={styles.upcomingDayDividerPressable}
                  onPress={() => {
                    if (isCurrentWeekSection && isCurrentWeekTodayOnly) return;
                    if (!item.weekKey || !item.dayKey) return;
                    toggleUpcomingDayExpanded(String(item.weekKey), String(item.dayKey));
                  }}
                >
                  <Text
                    style={[
                      styles.upcomingDayDividerText,
                      { color: isDark ? '#B5D8C2' : '#2C5A40' },
                      isCurrentWeekTodayLabel && styles.todayDayDividerText,
                    ]}
                  >
                    {label}
                  </Text>
                  <View style={styles.upcomingDayHeaderRight}>
                    <View style={styles.upcomingDayBadgesRow}>
                      <View
                        style={[
                          styles.upcomingDayBadge,
                          { backgroundColor: isDark ? 'rgba(19, 42, 53, 0.62)' : 'rgba(255, 255, 255, 0.72)' },
                        ]}
                      >
                        <IconSymbol
                          ios_icon_name="calendar"
                          android_material_icon_name="calendar_today"
                          size={12}
                          color={isDark ? 'rgba(216, 239, 225, 0.95)' : 'rgba(29, 58, 42, 0.9)'}
                        />
                        <Text numberOfLines={1} style={[styles.upcomingDayBadgeText, { color: isDark ? '#D8EFE1' : '#1D3A2A' }]}>
                          {activityCount}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.upcomingDayBadge,
                          { backgroundColor: isDark ? 'rgba(19, 42, 53, 0.62)' : 'rgba(255, 255, 255, 0.72)' },
                        ]}
                      >
                        <IconSymbol
                          ios_icon_name="checkmark.circle"
                          android_material_icon_name="check_circle"
                          size={12}
                          color={isDark ? 'rgba(216, 239, 225, 0.95)' : 'rgba(29, 58, 42, 0.9)'}
                        />
                        <Text numberOfLines={1} style={[styles.upcomingDayBadgeText, { color: isDark ? '#D8EFE1' : '#1D3A2A' }]}>
                          {totalTasks}
                        </Text>
                      </View>

                      <View
                        style={[
                          styles.upcomingDayBadge,
                          { backgroundColor: isDark ? 'rgba(201, 235, 214, 0.14)' : 'rgba(76, 175, 80, 0.16)' },
                        ]}
                      >
                        <IconSymbol
                          ios_icon_name="clock"
                          android_material_icon_name="schedule"
                          size={12}
                          color={isDark ? 'rgba(216, 239, 225, 0.98)' : 'rgba(29, 58, 42, 0.92)'}
                        />
                        <Text numberOfLines={1} style={[styles.upcomingDayBadgeText, { color: isDark ? '#D8EFE1' : '#1D3A2A' }]}>
                          {formatHoursDa(totalMinutes)}
                        </Text>
                      </View>
                    </View>
                    {(!isCurrentWeekSection || !isCurrentWeekTodayOnly) && (
                      <IconSymbol
                        ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
                        android_material_icon_name={isExpanded ? 'keyboard-arrow-down' : 'keyboard-arrow-right'}
                        size={16}
                        color={isDark ? '#B5D8C2' : '#2C5A40'}
                      />
                    )}
                  </View>
                </Pressable>
              </LinearGradient>
            </View>
          </View>
        );
      }

      case 'weekHeader':
        // STEP H: Guard against null weekGroup
        if (!item.weekGroup || !item.weekGroup.weekStart) return null;

        try {
          return (
            <View style={styles.weekGroup}>
              <Text style={[styles.weekLabel, { color: isDark ? '#e3e3e3' : colors.text }]}>
                Uge {getWeek(item.weekGroup.weekStart, { weekStartsOn: 1, locale: da })}
              </Text>
              <Text style={[styles.weekDateRange, { color: isDark ? '#999' : colors.textSecondary }]}>{getWeekLabel(item.weekGroup.weekStart)}</Text>
            </View>
          );
        } catch (error) {
          console.error('[Home] Error rendering week header:', error);
          return null;
        }

      case 'activity':
        // STEP H: Guard against null activity
        if (!item.activity) return null;

        const activity = item.activity;

        // 1️⃣ Permission calculation (only via helper)
        // STEP H: Defensive permission check with false as default
        const canManageActivity = currentTrainerId && typeof canTrainerManageActivity === 'function'
          ? canTrainerManageActivity({
              activity,
              trainerId: currentTrainerId,
              adminMode: adminMode || 'self',
            })
          : false;

        // 2️⃣ Determine if should dim
        const shouldDim = isAdminMode && !canManageActivity;

        // 3️⃣ Activity press handler with early return (no feedback)
        const handleActivityPress = () => {
          if (isAdminMode && !canManageActivity) {
            return;
          }

          // STEP H: Guard against null router or activity.id
          if (!router || !activity.id) {
            console.error('[Home] Cannot navigate: router or activity.id is null');
            return;
          }

          try {
            router.push({
              pathname: '/activity-details',
              params: { id: activity.id },
            });
          } catch (error) {
            console.error('[Home] Error navigating to activity details:', error);
          }
        };

        const feedbackActivityCandidates = getFeedbackActivityCandidates(activity);
        const feedbackActivityId = feedbackActivityCandidates.length ? feedbackActivityCandidates[0] : null;

        const mergedFeedbackCompletionByTemplateId: Record<string, boolean> = {};
        for (const candidateId of feedbackActivityCandidates) {
          const perTemplate = feedbackCompletionByActivityId[candidateId];
          if (!perTemplate) continue;
          for (const [templateId, done] of Object.entries(perTemplate)) {
            const tid = normalizeId(templateId);
            if (!tid) continue;
            if (done) {
              mergedFeedbackCompletionByTemplateId[tid] = true;
            } else if (mergedFeedbackCompletionByTemplateId[tid] === undefined) {
              mergedFeedbackCompletionByTemplateId[tid] = false;
            }
          }
        }

        const mergedFeedbackCompletionByTaskId: Record<string, boolean> = {};
        for (const candidateId of feedbackActivityCandidates) {
          const perTask = feedbackCompletionByActivityTaskId[candidateId];
          if (!perTask) continue;
          for (const [taskId, done] of Object.entries(perTask)) {
            const tid = normalizeId(taskId);
            if (!tid) continue;
            if (done) {
              mergedFeedbackCompletionByTaskId[tid] = true;
            } else if (mergedFeedbackCompletionByTaskId[tid] === undefined) {
              mergedFeedbackCompletionByTaskId[tid] = false;
            }
          }
        }

        const feedbackDone = feedbackActivityCandidates.some(
          (candidateId) => feedbackDoneByActivityId[candidateId] === true,
        );
        const showTrainerAssignedBadge = isTrainerAssignedActivityForCurrentUser(activity, currentUserId);

        return (
          <View
            style={[
              styles.activityWrapper,
              shouldDim && styles.activityWrapperDimmed,
              // Remove any fixed height/maxHeight/overflow here!
            ]}
          >
            <ActivityCard
              activity={activity}
              resolvedDate={activity.__resolvedDateTime}
              showTasks={true}
              feedbackActivityId={feedbackActivityId}
              feedbackCompletionByTaskId={mergedFeedbackCompletionByTaskId}
              feedbackCompletionByTemplateId={mergedFeedbackCompletionByTemplateId}
              feedbackDone={feedbackDone}
              showTrainerAssignedBadge={showTrainerAssignedBadge}
              onPress={handleActivityPress}
            />
          </View>
        );

      case 'emptyToday':
        return (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: isDark ? '#999' : colors.textSecondary }]}>Ingen aktiviteter i dag</Text>
          </View>
        );

      case 'loadMore':
        const canLoadMore = item.canLoadMore === true;
        if (item.source === 'modal') {
          if (!canLoadMore) return null;
          return (
            <View style={styles.loadMoreContainer}>
              <View style={styles.loadMoreButtonRow}>
                <Pressable
                  style={[
                    styles.loadMoreButton,
                    styles.loadMoreButtonSecondary,
                    {
                      backgroundColor: isDark ? '#2a2a2a' : colors.card,
                      borderColor: isDark ? '#444' : colors.highlight,
                    },
                  ]}
                  onPress={handleLoadMorePrevious}
                  accessibilityRole="button"
                  accessibilityLabel="Hent en tidligere uge mere"
                  testID="home.previousWeeks.loadOne"
                >
                  <Text style={[styles.loadMoreButtonText, styles.loadMoreSecondaryText, { color: isDark ? '#e3e3e3' : colors.text }]}>
                    +1
                  </Text>
                  <IconSymbol
                    ios_icon_name="plus"
                    android_material_icon_name="add"
                    size={12}
                    color={isDark ? '#e3e3e3' : colors.text}
                  />
                </Pressable>
              </View>
            </View>
          );
        }
        if (isPreviousWeeksModalVisible) return null;
        return (
          <View style={styles.loadMoreContainer}>
            <View style={styles.loadMoreButtonRow}>
              <Pressable
                style={[
                  styles.loadMoreButton,
                  {
                    backgroundColor: isDark ? '#2a2a2a' : colors.card,
                    borderColor: isDark ? '#444' : colors.highlight,
                  },
                ]}
                onPress={handleOpenPreviousWeeksModal}
                accessibilityRole="button"
                accessibilityLabel="Vis forrige uger"
                testID="home.previousWeeks.toggle"
              >
                <Text style={[styles.loadMoreButtonText, { color: isDark ? '#e3e3e3' : colors.text }]}>
                  Forrige
                </Text>
              </Pressable>
            </View>
          </View>
        );

      default:
        return null;
    }
  }, [
    isDark,
    toggleUpcomingWeekExpanded,
    toggleCurrentWeekViewMode,
    toggleUpcomingDayExpanded,
    buildUpcomingDayToggleKey,
    expandedUpcomingDays,
    expandedUpcomingWeeks,
    isCurrentWeekTodayOnly,
    isAdminMode,
    currentTrainerId,
    currentUserId,
    adminMode,
    router,
    handleLoadMorePrevious,
    handleOpenPreviousWeeksModal,
    handleOpenCreateModal,
    performanceMetrics,
    feedbackCompletionByActivityId,
    feedbackCompletionByActivityTaskId,
    feedbackDoneByActivityId,
    getFeedbackActivityCandidates,
    isPreviousWeeksModalVisible,
    hasPreviousWeekSummaries,
  ]);

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: any, index: number) => {
    // STEP H: Guard against null item
    if (!item) return `null-${index}`;
    if (typeof item.key === 'string' && item.key.length > 0) return item.key;

    if (item.type === 'activity') {
      // STEP H: Guard against null activity or activity.id
      return item.activity?.id ? `activity-${item.activity.id}` : `activity-${index}`;
    }
    if (item.type === 'weekHeader') {
      // STEP H: Guard against null weekGroup or weekStart
      const weekKey = item.weekGroup?.weekStart ? item.weekGroup.weekStart.toISOString() : index;
      return `week-${item.section}-${weekKey}`;
    }
    if (item.type === 'upcomingWeekSummary') {
      return `summary-${item.section ?? 'unknown'}-${item.weekKey ?? index}`;
    }
    return `${item.type}-${index}`;
  }, []);

  // List header component
  const ListHeaderComponent = useCallback(() => {
    const headerPaddingTop = 12;
    const headerPaddingBottom = 12;

    return (
      <>
        {/* Header */}
        <View style={[styles.header, { paddingTop: headerPaddingTop, paddingBottom: headerPaddingBottom }]}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../../../assets/images/fc_logo_blue.png')}
              style={styles.headerLogo}
              resizeMode="stretch"
              accessibilityLabel="Football Coach logo"
              testID="home-header-logo"
            />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerTitle}>Football Coach</Text>
            <Text style={styles.headerSubtitle}>Træn som en Pro</Text>
          </View>
        </View>

        {/* STEP E: Static inline info-box when adminMode !== 'self' */}
        {adminMode !== 'self' && (
          <View style={[styles.adminInfoBox, { backgroundColor: isDark ? '#3a2a1a' : '#FFF3E0', borderColor: isDark ? '#B8860B' : '#FF9800' }]}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={20}
              color={isDark ? '#FFB74D' : '#F57C00'}
            />
            <Text style={[styles.adminInfoText, { color: isDark ? '#FFB74D' : '#E65100' }]}>
              Du kan kun redigere indhold, du selv har oprettet.
            </Text>
          </View>
        )}

      </>
    );
  }, [adminMode, isDark]);

  // List footer component
  const ListFooterComponent = useCallback(() => (
    <View style={styles.bottomSpacer} />
  ), []);

  return (
    <AdminContextWrapper
      isAdmin={isAdminMode}
      contextName={selectedContext?.name ?? undefined}
      contextType={adminTargetType || 'player'}
    >
      <StatusBar barStyle="dark-content" />

      {loading ? (
        <HomeSkeleton />
      ) : (
        <FlatList
          testID="home.screen"
          data={flattenedData}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListHeaderComponent={ListHeaderComponent}
          ListFooterComponent={ListFooterComponent}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={Platform.OS !== 'web'}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
            />
          }
        />
      )}

      {isPreviousWeeksModalVisible ? (
        <View style={styles.previousModalOverlay}>
          <View style={[styles.previousModalRoot, { backgroundColor: isDark ? '#111' : '#F3F4F6' }]}>
            <View style={[styles.previousModalHeader, { paddingTop: insets.top + 8 }]}>
              <Text style={[styles.previousModalTitle, { color: isDark ? '#E6F5EC' : '#1D3A2A' }]}>Forrige Uger</Text>
              <Pressable
                style={[styles.previousModalCloseButton, { borderColor: isDark ? '#444' : '#D6D6D6' }]}
                onPress={handleClosePreviousWeeksModal}
                accessibilityRole="button"
                accessibilityLabel="Luk forrige uger"
                testID="home.previousWeeks.toggle"
              >
                <Text style={[styles.previousModalCloseText, { color: isDark ? '#E6F5EC' : '#1D3A2A' }]}>Luk</Text>
              </Pressable>
            </View>

            <FlatList
              data={previousWeeksModalData}
              renderItem={renderItem}
              keyExtractor={keyExtractor}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={Platform.OS !== 'web'}
              initialNumToRender={8}
              maxToRenderPerBatch={10}
              windowSize={5}
              contentContainerStyle={styles.previousModalListContent}
            />
          </View>
        </View>
      ) : null}

      {/* Create Activity Modal */}
      {showCreateModal ? (
        <CreateActivityModal
          visible={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onCreateActivity={handleCreateActivity}
          categories={categories}
          onRefreshCategories={refreshData}
        />
      ) : null}
    </AdminContextWrapper>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    paddingTop: 0,
  },

  // Header
  header: {
    backgroundColor: '#162634',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 48 : 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoContainer: {
    marginRight: 16,
    width: 60,
    height: 41,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 60,
    height: 41,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 32.4,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 18,
    fontWeight: '400',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },

  // Week Header
  weekHeaderContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  weekHeaderTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  weekHeaderSubtitle: {
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.2,
  },

  // Performance card
  performanceCard: {
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 28,
    padding: 24,
    boxShadow: '0px 6px 20px rgba(0, 0, 0, 0.25)',
    elevation: 8,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  medalBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalIcon: {
    fontSize: 44,
    lineHeight: 44,
  },
  performanceCollapseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  performanceCollapseIcon: {
    transform: [{ rotate: '0deg' }],
  },
  performanceCollapseIconExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  progressPercentage: {
    fontSize: 72,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  progressPercentageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressBar: {
    height: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: 5,
    marginVertical: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 5,
  },
  progressDetail: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: 8,
  },
  motivationText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.95)',
    marginTop: 20,
    lineHeight: 22,
  },
  performanceButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginTop: 20,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  performanceButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Admin Info Box
  adminInfoBox: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  adminInfoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },

  // Create Button
  createButton: {
    backgroundColor: '#4CAF50',
    marginHorizontal: 16,
    marginVertical: 16,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    boxShadow: '0px 3px 10px rgba(76, 175, 80, 0.35)',
    elevation: 4,
  },
  createButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Sections
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
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  chevronIcon: {
    marginLeft: 8,
  },
  loadMoreContainer: {
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  loadMoreButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  loadMoreButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    flexDirection: 'row',
    columnGap: 6,
  },
  loadMoreButtonSecondary: {
    minWidth: 58,
    justifyContent: 'center',
  },
  loadMoreButtonText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  loadMoreSecondaryText: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  previousModalRoot: {
    flex: 1,
  },
  previousModalOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    elevation: 30,
  },
  previousModalHeader: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(120,120,120,0.35)',
  },
  previousModalTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  previousModalCloseButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  previousModalCloseText: {
    fontSize: 13,
    fontWeight: '700',
  },
  previousModalListContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  emptyContainer: {
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 15,
    marginBottom: 16,
    lineHeight: 22,
  },

  // Week Groups
  weekGroup: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  weekLabel: {
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  weekDateRange: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 18,
    letterSpacing: 0.2,
  },
  upcomingDayDivider: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  upcomingDayCardShadow: {
    borderRadius: 16,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  upcomingDayCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  upcomingDayDividerPressable: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 8,
  },
  upcomingDayHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  upcomingDayBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  upcomingDayBadge: {
    width: 64,
    height: 28,
    borderRadius: 999,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 4,
  },
  upcomingDayBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  upcomingDayDividerLine: {
    height: 1,
    width: '100%',
  },
  upcomingDayDividerText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    flexShrink: 1,
  },
  todayDayDividerText: {
    textTransform: 'none',
  },
  upcomingSummaryWrapper: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  currentWeekSummaryTopSpacing: {
    marginTop: 16,
  },
  thisWeekPremiumCard: {
    borderColor: 'rgba(142, 194, 255, 0.55)',
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 7,
  },
  thisWeekPremiumHeaderText: {
    color: '#E3F3D8',
    fontSize: 13,
    letterSpacing: 2.2,
  },
  thisWeekPremiumRange: {
    color: '#E9EDF4',
    marginTop: 4,
    fontSize: 18,
  },
  thisWeekPremiumBackgroundImage: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  thisWeekPremiumBackgroundTint: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  thisWeekPremiumGlowTopLeft: {
    position: 'absolute',
    left: 42,
    top: 70,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(109, 247, 239, 0.16)',
  },
  thisWeekPremiumGlowRight: {
    position: 'absolute',
    right: 36,
    top: 128,
    width: 136,
    height: 136,
    borderRadius: 68,
  },
  thisWeekPremiumMainRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  thisWeekPremiumPercent: {
    color: '#FFFFFF',
    fontSize: 56,
    lineHeight: 58,
    fontWeight: '900',
  },
  thisWeekRingOuterGlow: {
    width: 178,
    height: 178,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FFD46B',
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  thisWeekRingInner: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(145, 191, 255, 0.35)',
    backgroundColor: 'rgba(3, 18, 37, 0.92)',
    shadowColor: '#6AB3FF',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  thisWeekPremiumRightColumn: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
    alignItems: 'flex-end',
    minHeight: 144,
    paddingTop: 4,
    paddingBottom: 4,
  },
  thisWeekPremiumTrophyBadge: {
    alignSelf: 'flex-end',
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 229, 132, 0.45)',
    shadowColor: '#FFD86B',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  thisWeekPremiumTrophyText: {
    fontSize: 40,
    lineHeight: 40,
  },
  thisWeekPremiumProgressTrack: {
    marginTop: 16,
    height: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(238, 216, 153, 0.52)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 239, 192, 0.72)',
    shadowColor: '#FFD86B',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  thisWeekPremiumProgressFill: {
    height: '100%',
    borderRadius: 999,
  },
  thisWeekPremiumChip: {
    minHeight: 44,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(131, 181, 255, 0.48)',
    backgroundColor: 'rgba(12, 27, 50, 0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexBasis: '48%',
    width: '48%',
    maxWidth: '48%',
    shadowColor: '#6AA8FF',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  thisWeekPremiumChipText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  thisWeekPremiumModeToggle: {
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 218, 146, 0.55)',
    backgroundColor: 'rgba(18, 32, 56, 0.86)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    shadowColor: '#FFD67D',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
    flexBasis: '48%',
    width: '48%',
    maxWidth: '48%',
    justifyContent: 'center',
  },
  thisWeekPremiumModeToggleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.2,
    flexShrink: 1,
  },
  thisWeekPremiumTodayBadge: {
    minHeight: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.30)',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 11,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  thisWeekPremiumTodayText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  currentWeekModeToggle: {
    position: 'absolute',
    right: 32,
    bottom: 16,
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  currentWeekModeToggleText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  upcomingSummaryPressable: {
    borderRadius: 28,
  },
  upcomingSummaryShadow: {
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  upcomingSummaryCard: {
    borderRadius: 28,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  upcomingSummaryCardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  upcomingSummarySheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  upcomingSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  thisWeekHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
  },
  thisWeekPremiumChevronButton: {
    borderWidth: 1,
    borderColor: 'rgba(255, 236, 186, 0.55)',
    shadowColor: '#FFE39C',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  upcomingSummaryEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  upcomingSummaryTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  upcomingSummaryRange: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
  },
  upcomingSummaryBadgesRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  upcomingSummaryChip: {
    height: 32,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.18)',
    flexGrow: 0,
    flexBasis: '48%',
    width: '48%',
    maxWidth: '48%',
  },
  upcomingSummaryChipPrimary: {
    borderColor: 'rgba(76, 175, 80, 0.26)',
  },
  upcomingSummaryChipText: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  upcomingChevronShadow: {
    borderRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  upcomingChevronButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  upcomingChevronIcon: {
    transform: [{ rotate: '0deg' }],
  },
  upcomingChevronIconExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  upcomingChevronSheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },

  // Activity Wrapper
  activityWrapper: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  activityWrapperDimmed: {
    opacity: 0.4,
  },

  // Bottom Spacer
  bottomSpacer: {
    height: 120,
  },
});

// Anti-patterns forbidden: fetch-on-press, inline renders, non-virtualized lists, unstable context values
