import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';

import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { exerciseAssignmentsService } from '@/services/exerciseAssignments';
import { taskService } from '@/services/taskService';

const DELETE_TEMPLATE_CONFIRM_TEXT = 'SLET';
const DELETE_TEMPLATE_WARNING_TEXT =
  'Hvis du sletter denne opgaveskabelon, slettes alle tidligere og fremtidige opgaver på relaterede aktiviteter. Hvis du vil beholde historik, vælg Arkiver i stedet.';

export type AssignExerciseModalProps = {
  visible: boolean;
  exercise: { id: string; title: string } | null;
  trainerId: string | null;
  onClose: () => void;
  onSuccess?: (payload: { createdCount: number }) => void;
};

type TabKey = 'players' | 'teams';

type PlayerRow = {
  id: string;
  title: string;
  subtitle?: string | null;
};

type TeamRow = {
  id: string;
  title: string;
  subtitle?: string | null;
};

type DeleteScope = 'player' | 'team' | 'teamMembers';

export function AssignExerciseModal({ visible, exercise, trainerId, onClose, onSuccess }: AssignExerciseModalProps) {
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);
  const {
    players,
    teams,
    getTeamMembers,
  } = useTeamPlayer();

  const [activeTab, setActiveTab] = useState<TabKey>('players');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [archivingRecipientKey, setArchivingRecipientKey] = useState<string | null>(null);
  const [removingRecipientKey, setRemovingRecipientKey] = useState<string | null>(null);
  const [assignedPlayerIds, setAssignedPlayerIds] = useState<Set<string>>(new Set());
  const [assignedTeamIds, setAssignedTeamIds] = useState<Set<string>>(new Set());
  const [teamMembersByTeamId, setTeamMembersByTeamId] = useState<Record<string, PlayerRow[]>>({});
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());
  const [assignmentTemplateStates, setAssignmentTemplateStates] = useState<
    Record<string, { taskTemplateId: string; archived: boolean }>
  >({});
  const [deleteCandidate, setDeleteCandidate] = useState<{ id: string; title: string; mode: DeleteScope } | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);

  const resetSelections = useCallback(() => {
    setSelectedPlayerIds(new Set());
    setSelectedTeamIds(new Set());
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!exercise?.id || !trainerId) {
      setAssignedPlayerIds(new Set());
      setAssignedTeamIds(new Set());
      setAssignmentTemplateStates({});
      return;
    }
    const [{ playerIds, teamIds }, templateStates] = await Promise.all([
      exerciseAssignmentsService.fetchAssignments(exercise.id, trainerId),
      exerciseAssignmentsService.fetchAssignmentTemplateStates(exercise.id, trainerId),
    ]);
    setAssignedPlayerIds(new Set(playerIds));
    setAssignedTeamIds(new Set(teamIds));
    setAssignmentTemplateStates(templateStates);
  }, [exercise?.id, trainerId]);

  const loadTeamMembers = useCallback(async () => {
    if (!teams.length) {
      setTeamMembersByTeamId({});
      return;
    }
    const resolved = await Promise.all(
      teams.map(async team => {
        const members = await getTeamMembers(team.id);
        const rows: PlayerRow[] = members
          .map(member => ({
            id: member.id,
            title: member.full_name,
            subtitle: member.phone_number || null,
          }))
          .sort((a, b) => a.title.localeCompare(b.title));
        return [team.id, rows] as const;
      })
    );
    const next: Record<string, PlayerRow[]> = {};
    resolved.forEach(([teamId, rows]) => {
      next[teamId] = rows;
    });
    setTeamMembersByTeamId(next);
    setExpandedTeamIds(prev => {
      if (prev.size || !teams.length) return prev;
      return new Set([teams[0].id]);
    });
  }, [teams, getTeamMembers]);

  useEffect(() => {
    if (!visible) {
      resetSelections();
      setActiveTab('players');
      setErrorMessage('');
      setLoadingState('idle');
      setDeleteCandidate(null);
      setDeleteConfirmationText('');
      setIsDeleteConfirming(false);
      setExpandedTeamIds(new Set());
      return;
    }
  }, [visible, resetSelections]);

  useEffect(() => {
    if (!visible) return;
    if (!exercise?.id || !trainerId) {
      setLoadingState('error');
      setErrorMessage('Mangler brugeroplysninger. Log ind igen og prøv senere.');
      return;
    }

    setLoadingState('loading');
    setErrorMessage('');

    (async () => {
      try {
        await Promise.all([loadAssignments(), loadTeamMembers()]);
        setLoadingState('idle');
      } catch (err: any) {
        console.error('[AssignExerciseModal] load failed', err);
        setErrorMessage(err?.message || 'Kunne ikke hente data.');
        setLoadingState('error');
      }
    })();
  }, [visible, exercise?.id, trainerId, loadAssignments, loadTeamMembers]);

  const playerRows = useMemo(
    () =>
      [...players]
        .sort((a, b) => a.full_name.localeCompare(b.full_name))
        .map<PlayerRow>(player => ({
          id: player.id,
          title: player.full_name,
          subtitle: player.phone_number || null,
        })),
    [players]
  );

  const teamRows = useMemo(
    () =>
      [...teams].sort((a, b) => a.name.localeCompare(b.name)).map<TeamRow>(team => ({
        id: team.id,
        title: team.name,
        subtitle: team.description || null,
      })),
    [teams]
  );

  const listData = activeTab === 'players' ? playerRows : teamRows;

  const effectiveSelectedPlayerIds = useMemo(() => {
    const next = new Set<string>(selectedPlayerIds);
    selectedTeamIds.forEach(teamId => {
      const members = teamMembersByTeamId[teamId] || [];
      members.forEach(member => {
        if (!assignedPlayerIds.has(member.id)) {
          next.add(member.id);
        }
      });
    });
    return next;
  }, [selectedPlayerIds, selectedTeamIds, teamMembersByTeamId, assignedPlayerIds]);

  const selectionCount = effectiveSelectedPlayerIds.size;

  const listKeyExtractor = useCallback((item: PlayerRow | TeamRow) => item.id, []);

  const togglePlayer = useCallback(
    (playerId: string) => {
      if (assignedPlayerIds.has(playerId)) return;
      setSelectedPlayerIds(prev => {
        const next = new Set(prev);
        if (next.has(playerId)) {
          next.delete(playerId);
        } else {
          next.add(playerId);
        }
        return next;
      });
    },
    [assignedPlayerIds]
  );

  const toggleTeam = useCallback(
    (teamId: string) => {
      const members = teamMembersByTeamId[teamId] || [];
      const memberIds = members.map(member => member.id);
      const hasAssignableMembers = memberIds.some(memberId => !assignedPlayerIds.has(memberId));
      if (!hasAssignableMembers) return;
      setSelectedTeamIds(prev => {
        const next = new Set(prev);
        const hasTeamSelected = next.has(teamId);
        if (hasTeamSelected) {
          next.delete(teamId);
        } else {
          next.add(teamId);
        }
        return next;
      });
      setSelectedPlayerIds(prev => {
        if (!memberIds.length) return prev;
        const next = new Set(prev);
        memberIds.forEach(memberId => {
          next.delete(memberId);
        });
        return next;
      });
    },
    [assignedPlayerIds, teamMembersByTeamId]
  );

  const handleAssign = useCallback(async () => {
    if (!exercise?.id || !trainerId) return;
    if (!selectionCount) {
      Alert.alert('Vælg modtagere', 'Vælg mindst én spiller eller ét hold.');
      return;
    }

    setAssigning(true);
    try {
      const result = await exerciseAssignmentsService.assignExercise({
        exerciseId: exercise.id,
        trainerId,
        playerIds: Array.from(effectiveSelectedPlayerIds),
        teamIds: [],
      });

      await loadAssignments();
      resetSelections();
      onSuccess?.({ createdCount: result.createdCount });

      const message = result.createdCount
        ? `Tildelte øvelsen til ${result.createdCount} modtager${result.createdCount === 1 ? '' : 'e'}.`
        : 'Alle valgte modtagere havde allerede fået denne øvelse.';
      Alert.alert('Øvelse tildelt', message);
      onClose();
    } catch (err: any) {
      console.error('[AssignExerciseModal] assign failed', err);
      Alert.alert('Kunne ikke tildele', err?.message || 'Prøv igen senere.');
    } finally {
      setAssigning(false);
    }
  }, [exercise?.id, trainerId, selectionCount, effectiveSelectedPlayerIds, loadAssignments, resetSelections, onClose, onSuccess]);

  const removeRecipient = useCallback(
    async (item: PlayerRow | TeamRow, mode: DeleteScope) => {
      if (!exercise?.id || !trainerId) return;
      const key =
        mode === 'player'
          ? `player:${item.id}`
          : mode === 'team'
            ? `team:${item.id}`
            : `team-bulk:${item.id}`;
      setRemovingRecipientKey(key);
      try {
        if (mode === 'teamMembers') {
          const members = teamMembersByTeamId[item.id] || [];
          const operations: Promise<void>[] = [];
          members.forEach(member => {
            const memberState = assignmentTemplateStates[`player:${member.id}`];
            if (assignedPlayerIds.has(member.id) || memberState?.taskTemplateId) {
              operations.push(
                exerciseAssignmentsService.unassignExercise({
                  exerciseId: exercise.id,
                  trainerId,
                  playerId: member.id,
                  teamId: null,
                })
              );
            }
          });
          const teamState = assignmentTemplateStates[`team:${item.id}`];
          if (assignedTeamIds.has(item.id) || teamState?.taskTemplateId) {
            operations.push(
              exerciseAssignmentsService.unassignExercise({
                exerciseId: exercise.id,
                trainerId,
                playerId: null,
                teamId: item.id,
              })
            );
          }
          await Promise.all(operations);
        } else {
          await exerciseAssignmentsService.unassignExercise({
            exerciseId: exercise.id,
            trainerId,
            playerId: mode === 'player' ? item.id : null,
            teamId: mode === 'team' ? item.id : null,
          });
        }
        await loadAssignments();
        setSelectedPlayerIds(prev => {
          const next = new Set(prev);
          if (mode === 'player') {
            next.delete(item.id);
          }
          if (mode === 'teamMembers') {
            (teamMembersByTeamId[item.id] || []).forEach(member => next.delete(member.id));
          }
          return next;
        });
        setSelectedTeamIds(prev => {
          const next = new Set(prev);
          if (mode !== 'player') next.delete(item.id);
          return next;
        });
      } finally {
        setRemovingRecipientKey(null);
      }
    },
    [exercise?.id, trainerId, loadAssignments, teamMembersByTeamId, assignedPlayerIds, assignedTeamIds, assignmentTemplateStates]
  );

  const toggleArchiveRecipient = useCallback(
    async (item: PlayerRow | TeamRow, mode: DeleteScope) => {
      if (!trainerId) return;
      const recipientKey =
        mode === 'player'
          ? `player:${item.id}`
          : mode === 'team'
            ? `team:${item.id}`
            : `team-bulk:${item.id}`;
      setArchivingRecipientKey(recipientKey);
      try {
        if (mode === 'teamMembers') {
          const keys: string[] = [];
          (teamMembersByTeamId[item.id] || []).forEach(member => {
            const memberKey = `player:${member.id}`;
            if (assignmentTemplateStates[memberKey]?.taskTemplateId) {
              keys.push(memberKey);
            }
          });
          const legacyTeamKey = `team:${item.id}`;
          if (assignmentTemplateStates[legacyTeamKey]?.taskTemplateId) {
            keys.push(legacyTeamKey);
          }
          if (!keys.length) {
            Alert.alert('Kunne ikke arkivere', 'Ingen aktive opgaveskabeloner fundet for dette hold.');
            return;
          }
          const allArchived = keys.every(keyValue => assignmentTemplateStates[keyValue]?.archived);
          await Promise.all(
            keys.map(keyValue =>
              taskService.setTaskTemplateArchived(
                assignmentTemplateStates[keyValue].taskTemplateId,
                trainerId,
                !allArchived,
              )
            )
          );
        } else {
          const templateState = assignmentTemplateStates[mode === 'player' ? `player:${item.id}` : `team:${item.id}`];
          if (!templateState?.taskTemplateId) {
            Alert.alert('Kunne ikke arkivere', 'Opgaveskabelon blev ikke fundet for denne modtager.');
            return;
          }
          await taskService.setTaskTemplateArchived(
            templateState.taskTemplateId,
            trainerId,
            !templateState.archived,
          );
        }
        await loadAssignments();
      } catch (err: any) {
        console.error('[AssignExerciseModal] archive toggle failed', err);
        Alert.alert('Kunne ikke opdatere arkivstatus', err?.message || 'Prøv igen senere.');
      } finally {
        setArchivingRecipientKey(null);
      }
    },
    [assignmentTemplateStates, loadAssignments, trainerId, teamMembersByTeamId]
  );

  const openRemoveDialog = useCallback((item: PlayerRow | TeamRow, mode: DeleteScope) => {
    setDeleteCandidate({ id: item.id, title: item.title, mode });
    setDeleteConfirmationText('');
    setIsDeleteConfirming(false);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteCandidate(null);
    setDeleteConfirmationText('');
    setIsDeleteConfirming(false);
  }, []);

  const confirmDeleteAssignment = useCallback(async () => {
    if (!deleteCandidate) return;
    if (deleteConfirmationText !== DELETE_TEMPLATE_CONFIRM_TEXT) return;

    setIsDeleteConfirming(true);
    try {
      await removeRecipient(
        { id: deleteCandidate.id, title: deleteCandidate.title },
        deleteCandidate.mode
      );
      closeDeleteDialog();
    } catch (err: any) {
      console.error('[AssignExerciseModal] remove failed', err);
      Alert.alert('Kunne ikke fjerne', err?.message || 'Prøv igen senere.');
      setIsDeleteConfirming(false);
    }
  }, [deleteCandidate, deleteConfirmationText, removeRecipient, closeDeleteDialog]);

  const handleRemoveRecipient = useCallback(
    (item: PlayerRow | TeamRow, mode: DeleteScope) => {
      openRemoveDialog(item, mode);
    },
    [openRemoveDialog]
  );

  const renderPlayerRow = useCallback(
    ({ item }: { item: PlayerRow }) => {
      const isAlreadyAssigned = assignedPlayerIds.has(item.id);
      const isSelected = selectedPlayerIds.has(item.id);
      const recipientKey = `player:${item.id}`;
      const isRemovingThis = removingRecipientKey === recipientKey;
      const isArchivingThis = archivingRecipientKey === recipientKey;
      const templateState = assignmentTemplateStates[recipientKey];
      const isArchived = !!templateState?.archived;
      const disabled = assigning || isRemovingThis || isArchivingThis;

      return (
        <TouchableOpacity
          onPress={() => {
            if (isAlreadyAssigned) return;
            togglePlayer(item.id);
          }}
          disabled={disabled}
          activeOpacity={0.85}
          style={[
            styles.row,
            { borderColor: isSelected ? theme.primary : theme.highlight, backgroundColor: theme.card },
            disabled ? styles.rowDisabled : null,
            isAlreadyAssigned ? styles.rowAssigned : null,
          ]}
        >
          <View style={[styles.rowIcon, { backgroundColor: theme.highlight }]}>
            <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={18} color={theme.text} />
          </View>
          <View style={styles.rowMain}>
            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}
            {isAlreadyAssigned ? (
              <View style={styles.rowMetaBadges}>
                <View style={[styles.rowMetaIcon, { backgroundColor: theme.highlight }]}>
                  <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={13} color={theme.primary} />
                </View>
                {isArchived ? (
                  <View style={[styles.rowMetaIcon, { backgroundColor: theme.highlight }]}>
                    <IconSymbol ios_icon_name="archivebox.fill" android_material_icon_name="archive" size={12} color={theme.textSecondary} />
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
          {isAlreadyAssigned ? (
            <View style={styles.rowActions}>
              <TouchableOpacity
                onPress={() => toggleArchiveRecipient(item, 'player')}
                disabled={disabled}
                style={[styles.iconActionButton, { backgroundColor: theme.highlight, borderColor: theme.highlight, opacity: disabled ? 0.65 : 1 }]}
                testID={`assign.archive.player.${item.id}`}
              >
                {isArchivingThis ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <IconSymbol
                    ios_icon_name={isArchived ? 'arrow.uturn.backward.circle' : 'archivebox'}
                    android_material_icon_name={isArchived ? 'unarchive' : 'archive'}
                    size={18}
                    color={theme.primary}
                  />
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleRemoveRecipient(item, 'player')}
                disabled={disabled}
                style={[styles.iconActionButton, { backgroundColor: theme.highlight, borderColor: theme.highlight, opacity: disabled ? 0.65 : 1 }]}
                testID={`assign.remove.player.${item.id}`}
              >
                {isRemovingThis ? (
                  <ActivityIndicator size="small" color={theme.error} />
                ) : (
                  <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={theme.error} />
                )}
              </TouchableOpacity>
            </View>
          ) : isSelected ? (
            <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={22} color={theme.primary} />
          ) : null}
        </TouchableOpacity>
      );
    },
    [
      assignedPlayerIds,
      selectedPlayerIds,
      removingRecipientKey,
      archivingRecipientKey,
      assignmentTemplateStates,
      assigning,
      theme,
      togglePlayer,
      toggleArchiveRecipient,
      handleRemoveRecipient,
    ]
  );

  const renderTeamRow = useCallback(
    ({ item }: { item: TeamRow }) => {
      const members = teamMembersByTeamId[item.id] || [];
      const isExpanded = expandedTeamIds.has(item.id);
      const teamSelected = selectedTeamIds.has(item.id);
      const teamBulkKey = `team-bulk:${item.id}`;
      const teamKey = `team:${item.id}`;
      const legacyTeamState = assignmentTemplateStates[teamKey];
      const hasAssignedMembers = members.some(member => assignedPlayerIds.has(member.id));
      const isAlreadyAssigned = hasAssignedMembers || assignedTeamIds.has(item.id);
      const isRemovingThis = removingRecipientKey === teamBulkKey;
      const isArchivingThis = archivingRecipientKey === teamBulkKey;
      const canSelectTeam = members.some(member => !assignedPlayerIds.has(member.id));

      const archiveKeys: string[] = [];
      if (legacyTeamState?.taskTemplateId) archiveKeys.push(teamKey);
      members.forEach(member => {
        const memberKey = `player:${member.id}`;
        if (assignmentTemplateStates[memberKey]?.taskTemplateId) archiveKeys.push(memberKey);
      });
      const isArchived = !!archiveKeys.length && archiveKeys.every(key => assignmentTemplateStates[key]?.archived);
      const disabled = assigning || isRemovingThis || isArchivingThis;

      return (
        <View style={[styles.teamBlock, { borderColor: teamSelected ? theme.primary : theme.highlight, backgroundColor: theme.card }]}>
          <TouchableOpacity
            onPress={() => {
              if (disabled || !canSelectTeam) return;
              toggleTeam(item.id);
            }}
            activeOpacity={0.85}
            disabled={disabled}
            style={styles.teamHeaderRow}
          >
            <View style={[styles.rowIcon, { backgroundColor: theme.highlight }]}>
              <IconSymbol ios_icon_name="person.3.fill" android_material_icon_name="groups" size={18} color={theme.text} />
            </View>
            <View style={styles.rowMain}>
              <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {members.length} spillere
              </Text>
              {isAlreadyAssigned ? (
                <View style={styles.rowMetaBadges}>
                  <View style={[styles.rowMetaIcon, { backgroundColor: theme.highlight }]}>
                    <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={13} color={theme.primary} />
                  </View>
                  {isArchived ? (
                    <View style={[styles.rowMetaIcon, { backgroundColor: theme.highlight }]}>
                      <IconSymbol ios_icon_name="archivebox.fill" android_material_icon_name="archive" size={12} color={theme.textSecondary} />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
            {isAlreadyAssigned ? (
              <View style={styles.rowActions}>
                <TouchableOpacity
                  onPress={() => toggleArchiveRecipient(item, 'teamMembers')}
                  disabled={disabled}
                  style={[styles.iconActionButton, { backgroundColor: theme.highlight, borderColor: theme.highlight, opacity: disabled ? 0.65 : 1 }]}
                  testID={`assign.archive.team.${item.id}`}
                >
                  {isArchivingThis ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <IconSymbol
                      ios_icon_name={isArchived ? 'arrow.uturn.backward.circle' : 'archivebox'}
                      android_material_icon_name={isArchived ? 'unarchive' : 'archive'}
                      size={18}
                      color={theme.primary}
                    />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRemoveRecipient(item, 'teamMembers')}
                  disabled={disabled}
                  style={[styles.iconActionButton, { backgroundColor: theme.highlight, borderColor: theme.highlight, opacity: disabled ? 0.65 : 1 }]}
                  testID={`assign.remove.team.${item.id}`}
                >
                  {isRemovingThis ? (
                    <ActivityIndicator size="small" color={theme.error} />
                  ) : (
                    <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={18} color={theme.error} />
                  )}
                </TouchableOpacity>
              </View>
            ) : teamSelected ? (
              <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={22} color={theme.primary} />
            ) : null}
            <TouchableOpacity
              onPress={() => {
                setExpandedTeamIds(prev => {
                  const next = new Set(prev);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                });
              }}
              style={styles.teamExpandButton}
            >
              <IconSymbol
                ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
                android_material_icon_name={isExpanded ? 'expand_less' : 'expand_more'}
                size={18}
                color={theme.textSecondary}
              />
            </TouchableOpacity>
          </TouchableOpacity>

          {isExpanded ? (
            <View style={[styles.teamMembersList, { borderTopColor: theme.highlight }]}>
              {members.map(member => {
                const memberKey = `player:${member.id}`;
                const memberAssigned = assignedPlayerIds.has(member.id);
                const memberSelected = teamSelected || selectedPlayerIds.has(member.id);
                const memberRemoving = removingRecipientKey === memberKey;
                const memberArchiving = archivingRecipientKey === memberKey;
                const memberTemplateState = assignmentTemplateStates[memberKey];
                const memberArchived = !!memberTemplateState?.archived;
                const memberDisabled = assigning || memberRemoving || memberArchiving || teamSelected;
                return (
                  <TouchableOpacity
                    key={member.id}
                    onPress={() => {
                      if (teamSelected || memberAssigned) return;
                      togglePlayer(member.id);
                    }}
                    activeOpacity={0.85}
                    disabled={memberDisabled}
                    style={[
                      styles.teamMemberRow,
                      { borderColor: memberSelected ? theme.primary : theme.highlight, backgroundColor: theme.background },
                    ]}
                  >
                    <View style={[styles.teamMemberIcon, { backgroundColor: theme.highlight }]}>
                      <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={14} color={theme.text} />
                    </View>
                    <View style={styles.rowMain}>
                      <Text style={[styles.teamMemberTitle, { color: theme.text }]} numberOfLines={1}>
                        {member.title}
                      </Text>
                      {memberAssigned ? (
                        <View style={styles.rowMetaBadges}>
                          <View style={[styles.rowMetaIcon, { backgroundColor: theme.highlight }]}>
                            <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={12} color={theme.primary} />
                          </View>
                          {memberArchived ? (
                            <View style={[styles.rowMetaIcon, { backgroundColor: theme.highlight }]}>
                              <IconSymbol ios_icon_name="archivebox.fill" android_material_icon_name="archive" size={11} color={theme.textSecondary} />
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                    {memberAssigned ? (
                      <View style={styles.rowActions}>
                        <TouchableOpacity
                          onPress={() => toggleArchiveRecipient(member, 'player')}
                          disabled={memberDisabled}
                          style={[styles.miniIconActionButton, { backgroundColor: theme.highlight, borderColor: theme.highlight, opacity: memberDisabled ? 0.65 : 1 }]}
                          testID={`assign.archive.player.${member.id}`}
                        >
                          {memberArchiving ? (
                            <ActivityIndicator size="small" color={theme.primary} />
                          ) : (
                            <IconSymbol
                              ios_icon_name={memberArchived ? 'arrow.uturn.backward.circle' : 'archivebox'}
                              android_material_icon_name={memberArchived ? 'unarchive' : 'archive'}
                              size={15}
                              color={theme.primary}
                            />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleRemoveRecipient(member, 'player')}
                          disabled={memberDisabled}
                          style={[styles.miniIconActionButton, { backgroundColor: theme.highlight, borderColor: theme.highlight, opacity: memberDisabled ? 0.65 : 1 }]}
                          testID={`assign.remove.player.${member.id}`}
                        >
                          {memberRemoving ? (
                            <ActivityIndicator size="small" color={theme.error} />
                          ) : (
                            <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={15} color={theme.error} />
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : memberSelected ? (
                      <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={18} color={theme.primary} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null}
        </View>
      );
    },
    [
      teamMembersByTeamId,
      expandedTeamIds,
      selectedTeamIds,
      assignmentTemplateStates,
      assignedPlayerIds,
      assignedTeamIds,
      selectedPlayerIds,
      removingRecipientKey,
      archivingRecipientKey,
      assigning,
      theme,
      toggleTeam,
      togglePlayer,
      toggleArchiveRecipient,
      handleRemoveRecipient,
    ]
  );

  const showEmptyState = !loadingState || loadingState === 'idle';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}> 
        <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? 54 : 24 }]}> 
          <TouchableOpacity onPress={onClose} style={[styles.headerButton, { backgroundColor: theme.card, borderColor: theme.highlight }]}>
            <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Tildel øvelse</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.exerciseCard, { backgroundColor: theme.card, borderColor: theme.highlight }]}> 
          <Text style={[styles.exerciseLabel, { color: theme.textSecondary }]}>Øvelse</Text>
          <Text style={[styles.exerciseTitle, { color: theme.text }]} numberOfLines={2}>
            {exercise?.title || 'Ukendt øvelse'}
          </Text>
        </View>

        <View style={[styles.tabsRow, { backgroundColor: theme.card, borderColor: theme.highlight }]}>
          <TouchableOpacity
            onPress={() => setActiveTab('players')}
            activeOpacity={0.85}
            style={[
              styles.tabButton,
              {
                borderColor: activeTab === 'players' ? theme.primary : theme.highlight,
                backgroundColor: activeTab === 'players' ? theme.primary : 'transparent',
              },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'players' ? '#fff' : theme.text }]}>Spillere ({players.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveTab('teams')}
            activeOpacity={0.85}
            style={[
              styles.tabButton,
              {
                borderColor: activeTab === 'teams' ? theme.primary : theme.highlight,
                backgroundColor: activeTab === 'teams' ? theme.primary : 'transparent',
              },
            ]}
          >
            <Text style={[styles.tabText, { color: activeTab === 'teams' ? '#fff' : theme.text }]}>Hold ({teams.length})</Text>
          </TouchableOpacity>
        </View>

        {loadingState === 'loading' ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" color={theme.text} />
            <Text style={[styles.loaderText, { color: theme.textSecondary }]}>Henter data...</Text>
          </View>
        ) : null}

        {loadingState === 'error' ? (
          <View style={[styles.errorCard, { backgroundColor: theme.card, borderColor: theme.error }]}> 
            <Text style={[styles.errorTitle, { color: theme.error }]}>Kunne ikke hente data</Text>
            <Text style={[styles.errorMessage, { color: theme.textSecondary }]}>{errorMessage}</Text>
          </View>
        ) : null}

        {showEmptyState ? (
          <FlatList
            data={listData}
            keyExtractor={listKeyExtractor}
            renderItem={({ item }) =>
              activeTab === 'players'
                ? renderPlayerRow({ item: item as PlayerRow })
                : renderTeamRow({ item: item as TeamRow })
            }
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={[styles.emptyState, { borderColor: theme.highlight }]}> 
                <Text style={[styles.emptyTitle, { color: theme.text }]}>Ingen {activeTab === 'players' ? 'spillere' : 'hold'}</Text>
                <Text style={[styles.emptyMessage, { color: theme.textSecondary }]}>Tilføj {activeTab === 'players' ? 'spillere' : 'hold'} i trænerområdet for at kunne tildele øvelser.</Text>
              </View>
            }
            initialNumToRender={14}
            windowSize={10}
          />
        ) : null}

        <View style={[styles.footer, { borderTopColor: theme.highlight, backgroundColor: theme.card }]}> 
          <View>
            <Text style={[styles.footerLabel, { color: theme.textSecondary }]}>Valgt</Text>
            <Text style={[styles.footerValue, { color: theme.text }]}>{selectionCount}</Text>
          </View>
          <TouchableOpacity
            onPress={handleAssign}
            activeOpacity={0.85}
            disabled={assigning || !selectionCount || loadingState !== 'idle'}
            style={[
              styles.assignButton,
              {
                backgroundColor:
                  assigning || !selectionCount || loadingState !== 'idle' ? theme.highlight : colors.success,
                opacity: assigning || !selectionCount || loadingState !== 'idle' ? 0.65 : 1,
              },
            ]}
          >
            {assigning ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Text style={styles.assignButtonText}>Tildel</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <Modal visible={!!deleteCandidate} animationType="fade" transparent onRequestClose={closeDeleteDialog}>
        <View style={styles.deleteConfirmOverlay}>
          <View style={[styles.deleteConfirmCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.deleteConfirmTitle, { color: theme.text }]}>Slet opgaveskabelon</Text>
            <Text style={[styles.deleteConfirmWarning, { color: theme.text }]}>
              {DELETE_TEMPLATE_WARNING_TEXT}
            </Text>
            <Text style={[styles.deleteConfirmHelper, { color: theme.textSecondary }]}>
              Skriv {DELETE_TEMPLATE_CONFIRM_TEXT} for at aktivere sletning.
            </Text>
            <TextInput
              style={[styles.deleteConfirmInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.highlight }]}
              value={deleteConfirmationText}
              onChangeText={setDeleteConfirmationText}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={DELETE_TEMPLATE_CONFIRM_TEXT}
              placeholderTextColor={theme.textSecondary}
              testID="assign.deleteModal.input"
            />

            <View style={styles.deleteConfirmActions}>
              <TouchableOpacity
                style={[styles.deleteModalButton, styles.deleteModalCancelButton, { backgroundColor: theme.background }]}
                onPress={closeDeleteDialog}
              >
                <Text style={[styles.deleteModalButtonText, { color: theme.text }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.deleteModalButton,
                  styles.deleteModalConfirmButton,
                  {
                    backgroundColor: theme.error,
                    opacity:
                      deleteConfirmationText === DELETE_TEMPLATE_CONFIRM_TEXT && !isDeleteConfirming ? 1 : 0.45,
                  },
                ]}
                disabled={deleteConfirmationText !== DELETE_TEMPLATE_CONFIRM_TEXT || isDeleteConfirming}
                onPress={() => {
                  void confirmDeleteAssignment();
                }}
                testID="assign.deleteModal.confirmButton"
              >
                <Text style={[styles.deleteModalButtonText, { color: '#fff' }]}>
                  {isDeleteConfirming ? 'Sletter...' : 'Slet'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 42, height: 42 },
  headerTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 0.2 },
  exerciseCard: {
    marginHorizontal: 20,
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  exerciseLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.3 },
  exerciseTitle: { marginTop: 8, fontSize: 22, lineHeight: 28, fontWeight: '900' },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { fontSize: 14, fontWeight: '800' },
  loaderWrap: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
  },
  loaderText: { fontSize: 13, fontWeight: '600' },
  errorCard: {
    marginHorizontal: 18,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  errorTitle: { fontSize: 14, fontWeight: '800' },
  errorMessage: { fontSize: 13, marginTop: 4, fontWeight: '500' },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowAssigned: {
    opacity: 1,
  },
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowMain: {
    flex: 1,
  },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  rowMetaBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  rowMetaIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowActions: {
    marginLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamBlock: {
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
  },
  teamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  teamExpandButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  teamMembersList: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  teamMemberRow: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamMemberIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamMemberTitle: { fontSize: 14, fontWeight: '700' },
  iconActionButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  miniIconActionButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  deleteConfirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  deleteConfirmCard: {
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  deleteConfirmTitle: { fontSize: 20, fontWeight: '800' },
  deleteConfirmWarning: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  deleteConfirmHelper: { fontSize: 13, fontWeight: '500' },
  deleteConfirmInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  deleteConfirmActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  deleteModalButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalCancelButton: {},
  deleteModalConfirmButton: {},
  deleteModalButtonText: { fontSize: 15, fontWeight: '800' },
  emptyState: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    marginTop: 44,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyMessage: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 18,
    borderTopWidth: 1,
  },
  footerLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  footerValue: { fontSize: 20, fontWeight: '800' },
  assignButton: {
    paddingHorizontal: 30,
    paddingVertical: 13,
    borderRadius: 999,
  },
  assignButtonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
});
