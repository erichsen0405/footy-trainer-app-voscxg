import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { endOfWeek, format, getWeek, startOfWeek } from 'date-fns';
import { da } from 'date-fns/locale';

import { IconSymbol } from '@/components/IconSymbol';
import { formatHoursDa } from '@/utils/activityDuration';

type WeeklySummaryCardProps = {
  weekStart: Date;
  isDark: boolean;
  isExpanded: boolean;
  onPress: () => void;
  eyebrowText?: string;
  activityCount: number;
  totalTasks: number;
  totalMinutes: number;
  timeLabelPrefix?: string;
};

function getWeekLabel(date: Date): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }

  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return `${format(start, 'd. MMM', { locale: da })} – ${format(end, 'd. MMM', { locale: da })}`;
}

export function WeeklySummaryCard({
  weekStart,
  isDark,
  isExpanded,
  onPress,
  eyebrowText = 'KOMMENDE UGE',
  activityCount,
  totalTasks,
  totalMinutes,
  timeLabelPrefix = 'Planlagt',
}: WeeklySummaryCardProps) {
  const weekLabel = useMemo(() => getWeekLabel(weekStart), [weekStart]);

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.pressable, pressed && styles.cardPressed]}
      >
        <View style={styles.shadow}>
          <LinearGradient
            colors={
              isDark
                ? ['rgba(43, 76, 92, 0.62)', 'rgba(29, 52, 69, 0.62)', 'rgba(25, 43, 56, 0.62)']
                : ['rgba(255, 255, 255, 0.62)', 'rgba(234, 243, 238, 0.62)', 'rgba(221, 239, 227, 0.62)']
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.card, { borderColor: isDark ? 'rgba(191, 220, 203, 0.20)' : 'rgba(76, 175, 80, 0.22)' }]}
          >
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.00)']
                  : ['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 0.8, y: 0.8 }}
              style={styles.sheen}
            />

            <View style={styles.header}>
              <View>
                <Text style={[styles.eyebrow, { color: isDark ? '#BFDCCB' : '#3B6A4D' }]}>{eyebrowText}</Text>
                <Text style={[styles.title, { color: isDark ? '#E6F5EC' : '#1D3A2A' }]}>
                  Uge {getWeek(weekStart, { weekStartsOn: 1, locale: da })}
                </Text>
              </View>

              <View style={styles.chevronShadow}>
                <LinearGradient
                  colors={isDark ? ['#3CC06A', '#1F8A43'] : ['#4CC46E', '#279B4A']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.chevronButton}
                >
                  <IconSymbol
                    ios_icon_name="chevron.down"
                    android_material_icon_name="keyboard-arrow-down"
                    size={18}
                    color="#FFFFFF"
                    style={[styles.chevronIcon, isExpanded && styles.chevronIconExpanded]}
                  />
                  <LinearGradient
                    colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.chevronSheen}
                  />
                </LinearGradient>
              </View>
            </View>

            <Text style={[styles.range, { color: isDark ? '#B5D8C2' : '#2C5A40' }]}>{weekLabel}</Text>

            <View style={styles.badgesRow}>
              <View
                style={[
                  styles.chip,
                  { backgroundColor: isDark ? 'rgba(19, 42, 53, 0.62)' : 'rgba(255, 255, 255, 0.72)' },
                ]}
              >
                <IconSymbol
                  ios_icon_name="calendar"
                  android_material_icon_name="calendar_today"
                  size={14}
                  color={isDark ? 'rgba(216, 239, 225, 0.95)' : 'rgba(29, 58, 42, 0.9)'}
                />
                <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.chipText, { color: isDark ? '#D8EFE1' : '#1D3A2A' }]}>
                  Aktiviteter · {activityCount}
                </Text>
              </View>

              <View
                style={[
                  styles.chip,
                  { backgroundColor: isDark ? 'rgba(19, 42, 53, 0.62)' : 'rgba(255, 255, 255, 0.72)' },
                ]}
              >
                <IconSymbol
                  ios_icon_name="checkmark.circle"
                  android_material_icon_name="check_circle"
                  size={14}
                  color={isDark ? 'rgba(216, 239, 225, 0.95)' : 'rgba(29, 58, 42, 0.9)'}
                />
                <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.chipText, { color: isDark ? '#D8EFE1' : '#1D3A2A' }]}>
                  Opgaver · {totalTasks}
                </Text>
              </View>

              <View
                style={[
                  styles.chip,
                  styles.chipPrimary,
                  { backgroundColor: isDark ? 'rgba(201, 235, 214, 0.14)' : 'rgba(76, 175, 80, 0.16)' },
                ]}
              >
                <IconSymbol
                  ios_icon_name="clock"
                  android_material_icon_name="schedule"
                  size={14}
                  color={isDark ? 'rgba(216, 239, 225, 0.98)' : 'rgba(29, 58, 42, 0.92)'}
                />
                <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.chipText, { color: isDark ? '#D8EFE1' : '#1D3A2A' }]}>
                  {timeLabelPrefix}: {formatHoursDa(totalMinutes)}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  pressable: {
    borderRadius: 24,
  },
  shadow: {
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  card: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  sheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  range: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '600',
  },
  badgesRow: {
    marginTop: 14,
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
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
  chipPrimary: {
    borderColor: 'rgba(76, 175, 80, 0.26)',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
  },
  chevronShadow: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  chevronButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  chevronIcon: {
    transform: [{ rotate: '0deg' }],
  },
  chevronIconExpanded: {
    transform: [{ rotate: '180deg' }],
  },
  chevronSheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
});
