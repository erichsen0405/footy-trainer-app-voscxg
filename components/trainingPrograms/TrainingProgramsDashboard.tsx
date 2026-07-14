import React, { useMemo, useState } from 'react';
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { getColors } from '@/styles/commonStyles';
import { OwnerPlayerCrmPlayer } from '@/services/ownerPlayerCrmService';
import {
  ProgramEnrollment,
  ProgramEnrollmentStatus,
  TrainingProgram,
  TrainingProgramsPayload,
} from '@/services/trainingProgramService';

export type TrainingProgramsView = 'programs' | 'enrollments';

type Colors = ReturnType<typeof getColors>;
type ProgramStatusFilter = 'all' | TrainingProgram['status'];
type EnrollmentStatusFilter = 'all' | ProgramEnrollmentStatus;

type Props = {
  payload: TrainingProgramsPayload;
  players: OwnerPlayerCrmPlayer[];
  colors: Colors;
  topInset: number;
  view: TrainingProgramsView;
  embedded?: boolean;
  selectedProgramId: string | null;
  refreshing: boolean;
  busy: boolean;
  error: string | null;
  onBack: () => void;
  onRefresh: () => void;
  onEdit: (program: TrainingProgram) => void;
  onPublish: (program: TrainingProgram) => void;
  onBulkAssign: (program: TrainingProgram) => void;
  onArchive: (program: TrainingProgram) => void;
  onDelete: (program: TrainingProgram) => void;
  onEnrollmentStatus: (enrollmentId: string, status: ProgramEnrollmentStatus) => void;
  onViewChange: (view: TrainingProgramsView, programId?: string | null) => void;
};

const PROGRAM_FILTERS: { value: ProgramStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Drafts' },
  { value: 'archived', label: 'Archived' },
];

const ENROLLMENT_FILTERS: { value: EnrollmentStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const cleanLabel = (value: string | null | undefined) =>
  value ? value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : null;

const formatDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, Math.max(0, month - 1), day);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export function TrainingProgramsDashboard({
  payload,
  players,
  colors,
  topInset,
  view,
  embedded = false,
  selectedProgramId,
  refreshing,
  busy,
  error,
  onBack,
  onRefresh,
  onEdit,
  onPublish,
  onBulkAssign,
  onArchive,
  onDelete,
  onEnrollmentStatus,
  onViewChange,
}: Props) {
  const [programQuery, setProgramQuery] = useState('');
  const [programStatus, setProgramStatus] = useState<ProgramStatusFilter>('all');
  const [enrollmentQuery, setEnrollmentQuery] = useState('');
  const [enrollmentStatus, setEnrollmentStatus] = useState<EnrollmentStatusFilter>('all');

  const playerNames = useMemo(
    () => new Map(players.map((player) => [player.playerId, player.displayName])),
    [players],
  );
  const programById = useMemo(
    () => new Map(payload.programs.map((program) => [program.id, program])),
    [payload.programs],
  );
  const enrollmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    payload.enrollments.forEach((enrollment) => {
      counts.set(enrollment.program_id, (counts.get(enrollment.program_id) ?? 0) + 1);
    });
    return counts;
  }, [payload.enrollments]);

  const filteredPrograms = useMemo(() => {
    const query = programQuery.trim().toLowerCase();
    return payload.programs
      .filter((program) => programStatus === 'all' || program.status === programStatus)
      .filter((program) => {
        if (!query) return true;
        return [program.title, program.description, program.audience, program.level]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query);
      })
      .sort((a, b) => {
        const order = { published: 0, draft: 1, archived: 2 };
        return order[a.status] - order[b.status] || a.title.localeCompare(b.title);
      });
  }, [payload.programs, programQuery, programStatus]);

  const filteredEnrollments = useMemo(() => {
    const query = enrollmentQuery.trim().toLowerCase();
    return payload.enrollments.filter((enrollment) => {
      if (selectedProgramId && enrollment.program_id !== selectedProgramId) return false;
      if (enrollmentStatus !== 'all' && enrollment.status !== enrollmentStatus) return false;
      if (!query) return true;
      const program = programById.get(enrollment.program_id);
      const playerName = playerNames.get(enrollment.player_id) ?? 'Player';
      return `${program?.title ?? ''} ${playerName}`.toLowerCase().includes(query);
    });
  }, [enrollmentQuery, enrollmentStatus, payload.enrollments, playerNames, programById, selectedProgramId]);

  const enrollmentGroups = useMemo(
    () => payload.programs
      .map((program) => ({
        program,
        enrollments: filteredEnrollments.filter((enrollment) => enrollment.program_id === program.id),
      }))
      .filter((group) => group.enrollments.length > 0),
    [filteredEnrollments, payload.programs],
  );

  const activeEnrollments = payload.enrollments.filter((item) => item.status === 'active').length;
  const pausedEnrollments = payload.enrollments.filter((item) => item.status === 'paused').length;
  const completedEnrollments = payload.enrollments.filter((item) => item.status === 'completed').length;

  const openEnrollments = (programId?: string) => {
    setEnrollmentQuery('');
    setEnrollmentStatus('all');
    onViewChange('enrollments', programId ?? null);
  };

  const requestEnrollmentStatus = (enrollmentId: string, status: ProgramEnrollmentStatus) => {
    if (status === 'active' || status === 'paused') {
      onEnrollmentStatus(enrollmentId, status);
      return;
    }
    const verb = status === 'completed' ? 'Complete' : 'Cancel';
    Alert.alert(
      `${verb} enrollment?`,
      'The player history is preserved.',
      [
        { text: 'Back', style: 'cancel' },
        {
          text: status === 'completed' ? 'Complete' : 'Cancel enrollment',
          style: status === 'cancelled' ? 'destructive' : 'default',
          onPress: () => onEnrollmentStatus(enrollmentId, status),
        },
      ],
    );
  };

  const content = (
    <>
      {!embedded ? (
        <View style={styles.headerRow}>
          <TouchableOpacity
            testID="programs.back"
            accessibilityRole="button"
            accessibilityLabel="Back to Plan"
            style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
            onPress={onBack}
          >
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="arrow_back" size={21} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>PLAN</Text>
            <Text style={[styles.heading, { color: colors.text }]}>
              {view === 'programs' ? 'Training programs' : 'Enrollments'}
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {payload.owner.name}
            </Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      ) : null}

      {error ? (
        <View style={[styles.notice, { borderColor: colors.error, backgroundColor: `${colors.error}10` }]}>
          <IconSymbol ios_icon_name="exclamationmark.triangle.fill" android_material_icon_name="warning" size={19} color={colors.error} />
          <Text style={[styles.noticeText, { color: colors.text }]}>{error}</Text>
        </View>
      ) : null}

      {view === 'programs' ? (
        <>
          <View style={styles.metricsRow}>
            <MetricCard label="Published" value={payload.programs.filter((item) => item.status === 'published').length} colors={colors} />
            <MetricCard label="Drafts" value={payload.programs.filter((item) => item.status === 'draft').length} colors={colors} />
            <MetricCard label="Active enrollments" value={activeEnrollments} colors={colors} />
          </View>

          <SearchField value={programQuery} onChangeText={setProgramQuery} placeholder="Search programs…" colors={colors} />
          <View style={styles.filterRow}>
            {PROGRAM_FILTERS.map((filter) => (
              <FilterChip
                key={filter.value}
                label={filter.label}
                active={programStatus === filter.value}
                colors={colors}
                onPress={() => setProgramStatus(filter.value)}
              />
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Programs</Text>
              <Text style={[styles.sectionDetail, { color: colors.textSecondary }]}>
                {filteredPrograms.length} of {payload.programs.length}
              </Text>
            </View>
          </View>

          {filteredPrograms.map((program) => (
            <ProgramCard
              key={program.id}
              program={program}
              enrollmentCount={enrollmentCounts.get(program.id) ?? 0}
              colors={colors}
              busy={busy}
              onEdit={() => onEdit(program)}
              onPublish={() => onPublish(program)}
              onBulkAssign={() => onBulkAssign(program)}
              onViewEnrollments={() => openEnrollments(program.id)}
              onArchive={() => onArchive(program)}
              onDelete={() => onDelete(program)}
            />
          ))}
          {!filteredPrograms.length ? (
            <EmptyState
              title={payload.programs.length ? 'No programs match' : 'No programs yet'}
              detail={payload.programs.length ? 'Try another search or status filter.' : 'Create a guided program to get started.'}
              colors={colors}
            />
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.metricsRow}>
            <MetricCard label="Active" value={activeEnrollments} colors={colors} />
            <MetricCard label="Paused" value={pausedEnrollments} colors={colors} />
            <MetricCard label="Completed" value={completedEnrollments} colors={colors} />
          </View>

          <SearchField value={enrollmentQuery} onChangeText={setEnrollmentQuery} placeholder="Search player or program…" colors={colors} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {ENROLLMENT_FILTERS.map((filter) => (
              <FilterChip
                key={filter.value}
                label={filter.label}
                active={enrollmentStatus === filter.value}
                colors={colors}
                onPress={() => setEnrollmentStatus(filter.value)}
              />
            ))}
          </ScrollView>

          {selectedProgramId ? (
            <View style={[styles.programFilter, { borderColor: colors.primary, backgroundColor: `${colors.primary}0D` }]}>
              <View style={styles.flexOne}>
                <Text style={[styles.programFilterLabel, { color: colors.primary }]}>PROGRAM FILTER</Text>
                <Text style={[styles.programFilterTitle, { color: colors.text }]}>
                  {programById.get(selectedProgramId)?.title ?? 'Selected program'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => onViewChange('enrollments', null)} accessibilityLabel="Show all programs">
                <Text style={[styles.clearText, { color: colors.primary }]}>Show all</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>People by program</Text>
              <Text style={[styles.sectionDetail, { color: colors.textSecondary }]}>
                {filteredEnrollments.length} enrollment{filteredEnrollments.length === 1 ? '' : 's'}
              </Text>
            </View>
          </View>

          {enrollmentGroups.map(({ program, enrollments }) => (
            <EnrollmentGroup
              key={program.id}
              program={program}
              enrollments={enrollments}
              playerNames={playerNames}
              teams={payload.teams}
              colors={colors}
              busy={busy}
              onStatus={requestEnrollmentStatus}
            />
          ))}
          {!enrollmentGroups.length ? (
            <EmptyState
              title="No enrollments found"
              detail={payload.enrollments.length ? 'Try another search, status, or program filter.' : 'Published programs can enroll individual players or teams.'}
              colors={colors}
            />
          ) : null}
        </>
      )}
    </>
  );

  if (embedded) {
    return <View style={styles.embeddedContent}>{content}</View>;
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingTop: topInset + 12 }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </ScrollView>
  );
}

function ProgramCard({
  program,
  enrollmentCount,
  colors,
  busy,
  onEdit,
  onPublish,
  onBulkAssign,
  onViewEnrollments,
  onArchive,
  onDelete,
}: {
  program: TrainingProgram;
  enrollmentCount: number;
  colors: Colors;
  busy: boolean;
  onEdit: () => void;
  onPublish: () => void;
  onBulkAssign: () => void;
  onViewEnrollments: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.programIcon, { backgroundColor: `${colors.primary}14` }]}>
          <IconSymbol ios_icon_name="list.bullet.clipboard.fill" android_material_icon_name="view_timeline" size={21} color={colors.primary} />
        </View>
        <View style={styles.flexOne}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{program.title}</Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>
            {program.duration_weeks} weeks · {program.phases.length} phases · {program.items.length} items
          </Text>
        </View>
        <StatusPill status={program.status} colors={colors} />
      </View>

      {program.description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>{program.description}</Text>
      ) : null}

      <View style={styles.metadataRow}>
        {program.level ? <MetadataPill label={cleanLabel(program.level) ?? program.level} colors={colors} /> : null}
        {program.audience ? <MetadataPill label={program.audience} colors={colors} /> : null}
        <MetadataPill label={`${enrollmentCount} enrolled`} colors={colors} />
      </View>

      <View style={[styles.actionDivider, { borderTopColor: colors.border }]} />
      <View style={styles.actionsRow}>
        {program.status === 'draft' ? (
          <>
            <ProgramAction label="Edit" iosIcon="pencil" materialIcon="edit" primary colors={colors} disabled={busy} onPress={onEdit} />
            <ProgramAction label="Publish" iosIcon="paperplane.fill" materialIcon="publish" colors={colors} disabled={busy} onPress={onPublish} />
          </>
        ) : null}
        {program.status === 'published' ? (
          <>
            <ProgramAction label="Bulk assign" iosIcon="person.2.badge.plus" materialIcon="group_add" primary colors={colors} disabled={busy} onPress={onBulkAssign} />
            <ProgramAction label="View enrollments" iosIcon="person.2.fill" materialIcon="groups" colors={colors} disabled={busy} onPress={onViewEnrollments} />
            <ProgramAction label="Archive" iosIcon="archivebox" materialIcon="archive" colors={colors} disabled={busy} onPress={onArchive} />
          </>
        ) : null}
        {program.status === 'archived' && enrollmentCount > 0 ? (
          <ProgramAction label="View enrollments" iosIcon="person.2.fill" materialIcon="groups" colors={colors} disabled={busy} onPress={onViewEnrollments} />
        ) : null}
        <ProgramAction label="Delete" iosIcon="trash" materialIcon="delete_outline" danger colors={colors} disabled={busy} onPress={onDelete} />
      </View>
    </View>
  );
}

function EnrollmentGroup({
  program,
  enrollments,
  playerNames,
  teams,
  colors,
  busy,
  onStatus,
}: {
  program: TrainingProgram;
  enrollments: ProgramEnrollment[];
  playerNames: Map<string, string>;
  teams: TrainingProgramsPayload['teams'];
  colors: Colors;
  busy: boolean;
  onStatus: (enrollmentId: string, status: ProgramEnrollmentStatus) => void;
}) {
  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.groupHeader}>
        <View style={styles.flexOne}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{program.title}</Text>
          <Text style={[styles.cardMeta, { color: colors.textSecondary }]}>{enrollments.length} people shown</Text>
        </View>
        <StatusPill status={program.status} colors={colors} />
      </View>
      {enrollments.map((enrollment, index) => {
        const sourceTeam = teams.find((team) => team.id === enrollment.source_team_id);
        return (
          <View
            key={enrollment.id}
            style={[styles.enrollmentRow, index > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}
          >
            <View style={[styles.avatar, { backgroundColor: `${colors.primary}14` }]}>
              <Text style={[styles.avatarText, { color: colors.primary }]}>
                {(playerNames.get(enrollment.player_id) ?? 'P').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.flexOne}>
              <View style={styles.enrollmentTitleRow}>
                <Text style={[styles.enrollmentName, { color: colors.text }]} numberOfLines={1}>
                  {playerNames.get(enrollment.player_id) ?? 'Player'}
                </Text>
                <StatusPill status={enrollment.status} colors={colors} compact />
              </View>
              <Text style={[styles.enrollmentMeta, { color: colors.textSecondary }]}>
                Starts {formatDate(enrollment.start_date)}{sourceTeam ? ` · ${sourceTeam.name}` : ''}
              </Text>
              {!['completed', 'cancelled'].includes(enrollment.status) ? (
                <View style={styles.enrollmentActions}>
                  {enrollment.status === 'active' ? (
                    <InlineAction label="Pause" disabled={busy} colors={colors} onPress={() => onStatus(enrollment.id, 'paused')} />
                  ) : (
                    <InlineAction label="Resume" disabled={busy} colors={colors} onPress={() => onStatus(enrollment.id, 'active')} />
                  )}
                  <InlineAction label="Complete" disabled={busy} colors={colors} onPress={() => onStatus(enrollment.id, 'completed')} />
                  <InlineAction label="Cancel" danger disabled={busy} colors={colors} onPress={() => onStatus(enrollment.id, 'cancelled')} />
                </View>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function MetricCard({ label, value, colors }: { label: string; value: number; colors: Colors }) {
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function SearchField({ value, onChangeText, placeholder, colors }: { value: string; onChangeText: (value: string) => void; placeholder: string; colors: Colors }) {
  return (
    <View style={[styles.search, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={19} color={colors.textSecondary} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.searchInput, { color: colors.text }]}
        autoCorrect={false}
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} accessibilityLabel="Clear search">
          <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="cancel" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function FilterChip({ label, active, colors, onPress }: { label: string; active: boolean; colors: Colors; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.filterChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? colors.primary : colors.card }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.filterChipText, { color: active ? '#FFFFFF' : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function StatusPill({ status, colors, compact }: { status: string; colors: Colors; compact?: boolean }) {
  const tone = status === 'published' || status === 'active'
    ? colors.success
    : status === 'paused' || status === 'draft'
      ? colors.warning
      : status === 'cancelled'
        ? colors.error
        : colors.textSecondary;
  return (
    <View style={[styles.statusPill, compact && styles.statusPillCompact, { backgroundColor: `${tone}16` }]}>
      <Text style={[styles.statusPillText, compact && styles.statusPillTextCompact, { color: tone }]}>{cleanLabel(status)}</Text>
    </View>
  );
}

function MetadataPill({ label, colors }: { label: string; colors: Colors }) {
  return (
    <View style={[styles.metadataPill, { backgroundColor: colors.background }]}>
      <Text style={[styles.metadataText, { color: colors.textSecondary }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function ProgramAction({ label, iosIcon, materialIcon, colors, onPress, primary, danger, disabled }: { label: string; iosIcon: string; materialIcon: string; colors: Colors; onPress: () => void; primary?: boolean; danger?: boolean; disabled?: boolean }) {
  const tone = danger ? colors.error : primary ? '#FFFFFF' : colors.text;
  return (
    <TouchableOpacity
      style={[
        styles.programAction,
        {
          borderColor: danger ? `${colors.error}55` : primary ? colors.primary : colors.border,
          backgroundColor: primary ? colors.primary : colors.background,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <IconSymbol ios_icon_name={iosIcon} android_material_icon_name={materialIcon} size={16} color={tone} />
      <Text style={[styles.programActionText, { color: tone }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function InlineAction({ label, colors, onPress, danger, disabled }: { label: string; colors: Colors; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={{ opacity: disabled ? 0.5 : 1 }}>
      <Text style={[styles.inlineActionText, { color: danger ? colors.error : colors.primary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ title, detail, colors }: { title: string; detail: string; colors: Colors }) {
  return (
    <View style={[styles.emptyState, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}12` }]}>
        <IconSymbol ios_icon_name="tray" android_material_icon_name="inbox" size={25} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyDetail, { color: colors.textSecondary }]}>{detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flexOne: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 120, gap: 14 },
  embeddedContent: { gap: 14 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconButton: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: 1 },
  headerSpacer: { width: 72 },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 1.1 },
  heading: { fontSize: 27, lineHeight: 32, fontWeight: '900' },
  subtitle: { fontSize: 13, lineHeight: 18 },
  notice: { borderWidth: 1, borderRadius: 13, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 18 },
  metricsRow: { flexDirection: 'row', gap: 8 },
  metricCard: { flex: 1, minHeight: 78, borderWidth: 1, borderRadius: 14, padding: 12, justifyContent: 'space-between' },
  metricValue: { fontSize: 23, fontWeight: '900' },
  metricLabel: { fontSize: 11, lineHeight: 14, fontWeight: '700' },
  search: { minHeight: 48, borderRadius: 14, borderWidth: 1, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 9 },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { minHeight: 36, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  filterChipText: { fontSize: 13, fontWeight: '700' },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 2 },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  sectionDetail: { fontSize: 12, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 18, padding: 15, gap: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  programIcon: { width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 17, lineHeight: 22, fontWeight: '900' },
  cardMeta: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  description: { fontSize: 13, lineHeight: 19 },
  metadataRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  metadataPill: { maxWidth: '100%', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  metadataText: { fontSize: 11, fontWeight: '700' },
  statusPill: { borderRadius: 11, paddingHorizontal: 9, paddingVertical: 6 },
  statusPillCompact: { paddingHorizontal: 7, paddingVertical: 4 },
  statusPillText: { fontSize: 10, fontWeight: '900' },
  statusPillTextCompact: { fontSize: 9 },
  actionDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  programAction: { minHeight: 38, borderRadius: 11, borderWidth: 1, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 6 },
  programActionText: { fontSize: 12, fontWeight: '800' },
  programFilter: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  programFilterLabel: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  programFilterTitle: { fontSize: 14, fontWeight: '800', marginTop: 2 },
  clearText: { fontSize: 12, fontWeight: '800' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  enrollmentRow: { paddingTop: 12, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '900' },
  enrollmentTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  enrollmentName: { flex: 1, fontSize: 14, fontWeight: '800' },
  enrollmentMeta: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  enrollmentActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 8 },
  inlineActionText: { fontSize: 12, fontWeight: '800' },
  emptyState: { borderWidth: 1, borderRadius: 18, padding: 24, alignItems: 'center', gap: 7 },
  emptyIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  emptyTitle: { fontSize: 17, fontWeight: '900', textAlign: 'center' },
  emptyDetail: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
});
