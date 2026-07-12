import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getColors } from '@/styles/commonStyles';
import { useUserRole } from '@/hooks/useUserRole';
import { fetchOwnerTrainingTemplatesContext } from '@/services/trainingTemplateService';
import { enrollTrainingProgram, fetchMyTrainingPrograms, fetchTrainingPrograms, PlayerProgramEnrollment, publishTrainingProgram, saveTrainingProgram, TrainingProgramsPayload } from '@/services/trainingProgramService';

export function createProgramDraftId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export default function ProgramsScreen() {
  const colors = getColors(useColorScheme()); const insets = useSafeAreaInsets(); const { userRole } = useUserRole();
  const isCoach = userRole === 'admin' || userRole === 'trainer';
  const [payload, setPayload] = useState<TrainingProgramsPayload | null>(null); const [mine, setMine] = useState<PlayerProgramEnrollment[]>([]);
  const [ownerId, setOwnerId] = useState<string | null>(null); const [loading, setLoading] = useState(true); const [refreshing, setRefreshing] = useState(false);
  const [title, setTitle] = useState(''); const [weeks, setWeeks] = useState('4'); const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => { setError(null); try { if (!isCoach) { setMine((await fetchMyTrainingPrograms()).enrollments); return; }
    const context = await fetchOwnerTrainingTemplatesContext(); const nextOwner = ownerId ?? context.defaultOwnerAccountId; setOwnerId(nextOwner); if (nextOwner) setPayload(await fetchTrainingPrograms(nextOwner));
  } catch (e) { setError(e instanceof Error ? e.message : 'Could not load programs.'); } finally { setLoading(false); setRefreshing(false); } }, [isCoach, ownerId]);
  useEffect(() => { void load(); }, [load]);
  const createDraft = async () => { if (!ownerId || !title.trim()) return; try { setLoading(true); const durationWeeks = Math.max(1, Math.min(52, Number(weeks) || 4));
    const phaseId = createProgramDraftId(); setPayload(await saveTrainingProgram({ ownerAccountId: ownerId, title: title.trim(), durationWeeks,
      phases: [{ id: phaseId, title: 'Week 1', weekOffset: 0, durationWeeks }], items: [{ phaseId, itemType: 'focus', title: 'Program focus', dayOffset: 0 }] })); setTitle('');
  } catch (e) { Alert.alert('Could not create program', e instanceof Error ? e.message : 'Try again.'); } finally { setLoading(false); } };
  if (loading && !payload && !mine.length) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator /></View>;
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}>
    <Text style={[styles.heading, { color: colors.text }]}>{isCoach ? 'Training programs' : 'My program'}</Text>
    <Text style={{ color: colors.textSecondary }}>{isCoach ? 'Build, publish and enroll structured player journeys.' : 'Your current week, upcoming work and progress.'}</Text>
    {error ? <Text style={{ color: colors.error }}>{error}</Text> : null}
    {isCoach ? <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.cardTitle, { color: colors.text }]}>New guided draft</Text>
      <TextInput accessibilityLabel="Program title" placeholder="Program title" placeholderTextColor={colors.textSecondary} value={title} onChangeText={setTitle} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
      <TextInput accessibilityLabel="Duration in weeks" placeholder="Weeks" keyboardType="number-pad" placeholderTextColor={colors.textSecondary} value={weeks} onChangeText={setWeeks} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
      <TouchableOpacity style={styles.primary} onPress={() => void createDraft()}><Text style={styles.primaryText}>Create draft</Text></TouchableOpacity></View> : null}
    {isCoach ? payload?.programs.map((program) => <View key={program.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.row}><Text style={[styles.cardTitle, { color: colors.text }]}>{program.title}</Text><Text style={{ color: colors.textSecondary }}>{program.status}</Text></View>
      <Text style={{ color: colors.textSecondary }}>{program.duration_weeks} weeks · {program.phases.length} phases · {program.items.length} items</Text>
      {program.status === 'draft' ? <TouchableOpacity style={styles.secondary} onPress={async () => { if (ownerId) setPayload(await publishTrainingProgram(ownerId, program.id)); }}><Text style={{ color: '#2563eb', fontWeight: '700' }}>Publish</Text></TouchableOpacity> : null}
      {program.status === 'published' && payload.players[0] ? <TouchableOpacity style={styles.secondary} onPress={async () => { if (ownerId) setPayload(await enrollTrainingProgram({ ownerAccountId: ownerId, programId: program.id, playerIds: [payload.players[0].player_id], startDate: new Date().toISOString().slice(0, 10) })); }}><Text style={{ color: '#2563eb', fontWeight: '700' }}>Enroll first player (preview)</Text></TouchableOpacity> : null}
    </View>) : mine.map((enrollment) => <View key={enrollment.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={styles.row}><Text style={[styles.cardTitle, { color: colors.text }]}>{enrollment.training_programs.title}</Text><Text style={{ color: colors.textSecondary }}>{enrollment.status}</Text></View>
      <Text style={{ color: colors.textSecondary }}>Started {enrollment.start_date} · {enrollment.training_programs.duration_weeks} weeks</Text>
      {enrollment.program_enrollment_items.slice(0, 4).map((item) => <View key={item.id} style={styles.item}><Text style={{ color: colors.text }}>{item.title}</Text><Text style={{ color: colors.textSecondary }}>{item.scheduled_date}</Text></View>)}</View>)}
  </ScrollView>;
}
const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, content: { padding: 16, paddingBottom: 120, gap: 12 }, heading: { fontSize: 28, fontWeight: '800' }, card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 }, cardTitle: { fontSize: 17, fontWeight: '800' }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, input: { borderWidth: 1, borderRadius: 10, padding: 12 }, primary: { backgroundColor: '#2563eb', padding: 13, borderRadius: 10, alignItems: 'center' }, primaryText: { color: 'white', fontWeight: '800' }, secondary: { paddingVertical: 8 }, item: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#94a3b8' } });
