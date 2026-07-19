import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getColors } from '@/styles/commonStyles';
import { usePlayerProgramExperience } from '@/hooks/usePlayerProgramExperience';
import type {
  PlayerProgramExperienceEnrollment,
  PlayerProgramExperienceItem,
} from '@/services/trainingProgramService';
import { setPlayerProgramItemCompletion } from '@/services/trainingProgramService';

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function itemStatusLabel(status: PlayerProgramExperienceItem['status']) {
  if (status === 'today') return 'Today';
  if (status === 'overdue') return 'Needs attention';
  if (status === 'completed') return 'Done';
  if (status === 'skipped') return 'Skipped';
  return 'Upcoming';
}

function openProgramItem(router: ReturnType<typeof useRouter>, item: PlayerProgramExperienceItem, enrollmentId?: string) {
  if (item.activityId) {
    router.push({
      pathname: '/activity-details',
      params: {
        id: item.activityId,
        activityId: item.activityId,
        ...(item.taskId ? { openTaskId: item.taskId } : {}),
      },
    } as any);
    return;
  }
  if (item.taskId) {
    if (enrollmentId) {
      router.push({ pathname: '/(tabs)/programs', params: { enrollmentId, itemId: item.id } } as any);
      return;
    }
    router.push({ pathname: '/(tabs)/tasks', params: { openTaskId: item.taskId } } as any);
    return;
  }
  router.push({ pathname: '/(tabs)/programs', params: { ...(enrollmentId ? { enrollmentId } : {}), itemId: item.id } } as any);
}

function ProgressBar({ percent, color, track }: { percent: number; color: string; track: string }) {
  return <View style={[styles.progressTrack, { backgroundColor: track }]}><View style={[styles.progressFill, { backgroundColor: color, width: `${Math.max(0, Math.min(100, percent))}%` }]} /></View>;
}

function OwnerIdentity({ enrollment }: { enrollment: PlayerProgramExperienceEnrollment }) {
  return <View style={styles.ownerRow}>
    {enrollment.owner.logoUrl ? <Image source={{ uri: enrollment.owner.logoUrl }} style={styles.logo} /> : null}
    <Text style={styles.ownerText} numberOfLines={1}>{enrollment.owner.displayName}</Text>
  </View>;
}

export function PlayerProgramHomeCard() {
  const router = useRouter();
  const colors = getColors(useColorScheme());
  const { experience, loading, error } = usePlayerProgramExperience();
  const active = experience?.enrollments.find((item) => item.id === experience.activeEnrollmentId) ?? null;

  if (loading && !experience) return <View testID="home.playerProgram.loading" style={[styles.homeCard, { backgroundColor: colors.card, borderColor: colors.border }]}><ActivityIndicator /></View>;
  if (error || !active) return null;
  const next = active.nextItem;
  const accent = active.owner.brandColors.accent || colors.primary;

  return <View testID="home.playerProgram.card" style={[styles.homeCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <OwnerIdentity enrollment={active} />
    <View style={styles.row}>
      <View style={styles.grow}>
        <Text style={[styles.eyebrow, { color: colors.textSecondary }]}>MY ACTIVE PROGRAM</Text>
        <Text style={[styles.title, { color: colors.text }]}>{active.program.title}</Text>
      </View>
      <Text style={[styles.percent, { color: accent }]}>{active.progress.percent}%</Text>
    </View>
    <ProgressBar percent={active.progress.percent} color={accent} track={colors.border} />
    <Text style={{ color: colors.textSecondary }}>{active.progress.completedItems} of {active.progress.totalItems} completed</Text>
    {next ? <TouchableOpacity testID="home.playerProgram.nextAction" style={[styles.primaryButton, { backgroundColor: accent }]} onPress={() => openProgramItem(router, next, active.id)}>
      <View style={styles.grow}>
        <Text style={styles.primaryButtonLabel}>{itemStatusLabel(next.status)}</Text>
        <Text style={styles.primaryButtonTitle} numberOfLines={1}>{next.title}</Text>
      </View>
      <Text style={styles.primaryButtonArrow}>›</Text>
    </TouchableOpacity> : <Text style={[styles.successText, { color: accent }]}>You are all caught up.</Text>}
    <TouchableOpacity testID="home.playerProgram.open" onPress={() => router.push({ pathname: '/(tabs)/programs', params: { enrollmentId: active.id } } as any)}>
      <Text style={[styles.link, { color: colors.primary }]}>View full program</Text>
    </TouchableOpacity>
  </View>;
}

export function PlayerProgramProgressCard() {
  const router = useRouter();
  const colors = getColors(useColorScheme());
  const { experience, loading } = usePlayerProgramExperience();
  const active = experience?.enrollments.find((item) => item.id === experience.activeEnrollmentId) ?? null;
  if (loading && !experience) return null;
  if (!active) return null;
  const accent = active.owner.brandColors.accent || colors.primary;

  return <TouchableOpacity testID="performance.playerProgram.card" activeOpacity={0.88} style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push({ pathname: '/(tabs)/programs', params: { enrollmentId: active.id } } as any)}>
    <View style={styles.row}><View style={styles.grow}><Text style={[styles.eyebrow, { color: colors.textSecondary }]}>PROGRAM PROGRESS</Text><Text style={[styles.title, { color: colors.text }]}>{active.program.title}</Text></View><Text style={[styles.percent, { color: accent }]}>{active.progress.percent}%</Text></View>
    <ProgressBar percent={active.progress.percent} color={accent} track={colors.border} />
    <Text style={{ color: colors.textSecondary }}>{active.progress.completedItems}/{active.progress.totalItems} program items complete</Text>
  </TouchableOpacity>;
}

export function PlayerProgramsExperienceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ enrollmentId?: string | string[]; itemId?: string | string[] }>();
  const requestedEnrollmentId = firstParam(params.enrollmentId);
  const requestedItemId = firstParam(params.itemId);
  const colors = getColors(useColorScheme());
  const { experience, loading, refreshing, error, refresh } = usePlayerProgramExperience();
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const enrollments = useMemo(() => {
    const rows = experience?.enrollments.filter((item) => item.status !== 'cancelled') ?? [];
    if (!requestedEnrollmentId) return rows;
    return [...rows].sort((a, b) => Number(b.id === requestedEnrollmentId) - Number(a.id === requestedEnrollmentId));
  }, [experience?.enrollments, requestedEnrollmentId]);
  const toggleStandaloneTask = async (item: PlayerProgramExperienceItem) => {
    setBusyItemId(item.id);
    try {
      await setPlayerProgramItemCompletion(item.id, item.status !== 'completed');
      await refresh();
    } catch (cause) {
      Alert.alert('Could not update task', cause instanceof Error ? cause.message : 'Try again.');
    } finally {
      setBusyItemId(null);
    }
  };

  if (loading && !experience) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator /></View>;

  return <ScrollView testID="playerPrograms.screen" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.screenContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}>
    <View><Text style={[styles.screenTitle, { color: colors.text }]}>My programs</Text><Text style={{ color: colors.textSecondary }}>Your coach-assigned plan, next action and progress.</Text></View>
    {error ? <View style={[styles.messageCard, { borderColor: colors.error, backgroundColor: colors.card }]}><Text style={{ color: colors.error, fontWeight: '700' }}>Could not load your programs</Text><Text style={{ color: colors.textSecondary }}>{error}</Text><TouchableOpacity onPress={() => void refresh()}><Text style={[styles.link, { color: colors.primary }]}>Try again</Text></TouchableOpacity></View> : null}
    {!error && !enrollments.length ? <View testID="playerPrograms.empty" style={[styles.messageCard, { borderColor: colors.border, backgroundColor: colors.card }]}><Text style={[styles.title, { color: colors.text }]}>No coach program yet</Text><Text style={{ color: colors.textSecondary }}>Your personal activities and tasks are still available. A program will appear here when a coach assigns one.</Text></View> : null}
    {enrollments.map((enrollment) => {
      const accent = enrollment.owner.brandColors.accent || colors.primary;
      return <View key={enrollment.id} testID={`playerPrograms.enrollment.${enrollment.id}`} style={[styles.enrollmentCard, { backgroundColor: colors.card, borderColor: enrollment.id === requestedEnrollmentId ? accent : colors.border }]}>
        <OwnerIdentity enrollment={enrollment} />
        <View style={styles.row}><View style={styles.grow}><Text style={[styles.title, { color: colors.text }]}>{enrollment.program.title}</Text><Text style={{ color: colors.textSecondary }}>{enrollment.startDate} – {enrollment.endDate}</Text></View><Text style={[styles.statusPill, { color: accent, borderColor: accent }]}>{enrollment.status}</Text></View>
        {enrollment.program.description ? <Text style={{ color: colors.text }}>{enrollment.program.description}</Text> : null}
        <View style={styles.row}><Text style={{ color: colors.textSecondary }}>{enrollment.progress.completedItems}/{enrollment.progress.totalItems} completed</Text><Text style={[styles.percent, { color: accent }]}>{enrollment.progress.percent}%</Text></View>
        <ProgressBar percent={enrollment.progress.percent} color={accent} track={colors.border} />
        <View style={styles.timeline}>
          {enrollment.items.map((item) => <View key={item.id} testID={`playerPrograms.item.${item.id}`} style={[styles.itemRow, { borderColor: item.id === requestedItemId ? accent : colors.border, backgroundColor: item.id === requestedItemId ? `${accent}12` : 'transparent', opacity: item.activityId || item.taskId ? 1 : 0.78 }]}>
            <View style={[styles.statusDot, { backgroundColor: item.status === 'completed' ? accent : item.status === 'overdue' ? colors.error : colors.border }]} />
            <View style={styles.grow}><Text style={[styles.itemTitle, { color: colors.text }]}>{item.title}</Text><Text style={{ color: colors.textSecondary }}>Week {item.weekNumber}{item.phaseTitle ? ` · ${item.phaseTitle}` : ''} · {item.scheduledDate} · {itemStatusLabel(item.status)}</Text></View>
            {item.activityId ? <TouchableOpacity accessibilityLabel={`Open ${item.title}`} onPress={() => openProgramItem(router, item, enrollment.id)}><Text style={{ color: colors.primary, fontSize: 22 }}>›</Text></TouchableOpacity> : null}
            {!item.activityId && item.taskId ? <TouchableOpacity testID={`playerPrograms.item.${item.id}.complete`} disabled={busyItemId === item.id} style={[styles.doneButton, { borderColor: accent }]} onPress={() => void toggleStandaloneTask(item)}>{busyItemId === item.id ? <ActivityIndicator size="small" /> : <Text style={{ color: accent, fontWeight: '800' }}>{item.status === 'completed' ? 'Undo' : 'Done'}</Text>}</TouchableOpacity> : null}
          </View>)}
        </View>
      </View>;
    })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  homeCard: { marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 },
  progressCard: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 10, marginBottom: 18 },
  ownerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logo: { width: 24, height: 24, borderRadius: 7 },
  ownerText: { color: '#64748b', fontSize: 12, fontWeight: '700', flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8 },
  title: { fontSize: 18, fontWeight: '800' },
  screenTitle: { fontSize: 28, fontWeight: '900' },
  percent: { fontSize: 20, fontWeight: '900' },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 999 },
  primaryButton: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 13, gap: 10 },
  primaryButtonLabel: { color: '#fff', fontSize: 11, fontWeight: '800', opacity: 0.85, textTransform: 'uppercase' },
  primaryButtonTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  primaryButtonArrow: { color: '#fff', fontSize: 28 },
  successText: { fontWeight: '800' },
  link: { fontWeight: '800' },
  screenContent: { padding: 16, paddingTop: 24, paddingBottom: 120, gap: 16 },
  messageCard: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 8 },
  enrollmentCard: { borderWidth: 1.5, borderRadius: 18, padding: 16, gap: 12 },
  statusPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontWeight: '800', textTransform: 'capitalize' },
  timeline: { gap: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  itemTitle: { fontWeight: '700' },
  doneButton: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, minWidth: 54, alignItems: 'center' },
});
