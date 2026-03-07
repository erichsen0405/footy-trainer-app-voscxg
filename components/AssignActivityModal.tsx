import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';

import { IconSymbol } from '@/components/IconSymbol';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import {
  activityAssignmentsService,
  ActivityAssignmentState,
  AssignActivityResult,
} from '@/services/activityAssignments';
import { colors, getColors } from '@/styles/commonStyles';

type TabKey = 'players' | 'teams';

type AssignableActivity = {
  id: string;
  title: string;
  isExternal: boolean;
  externalEventRowId?: string | null;
  categoryId?: string | null;
  intensity?: number | null;
  intensityEnabled?: boolean;
  intensityNote?: string | null;
};

type BaseRow = {
  id: string;
  title: string;
  subtitle?: string | null;
};

type PlayerRow = BaseRow;
type TeamRow = BaseRow;

const normalizeExcludedPlayerIdsByTeamId = (
  value?: Record<string, string[] | null> | null,
): Record<string, string[]> => {
  const next: Record<string, string[]> = {};
  if (!value || typeof value !== 'object') return next;

  Object.entries(value).forEach(([teamId, playerIds]) => {
    const normalizedTeamId = typeof teamId === 'string' ? teamId.trim() : '';
    const normalizedPlayerIds = Array.from(
      new Set(
        (Array.isArray(playerIds) ? playerIds : [])
          .filter((playerId): playerId is string => typeof playerId === 'string')
          .map((playerId) => playerId.trim())
          .filter(Boolean),
      ),
    ).sort();
    if (!normalizedTeamId || !normalizedPlayerIds.length) return;
    next[normalizedTeamId] = normalizedPlayerIds;
  });

  return next;
};

const cloneExcludedPlayerIdsByTeamId = (
  value?: Record<string, string[] | null> | null,
): Record<string, string[]> => {
  const next: Record<string, string[]> = {};
  Object.entries(normalizeExcludedPlayerIdsByTeamId(value)).forEach(([teamId, playerIds]) => {
    next[teamId] = [...playerIds];
  });
  return next;
};

const areExcludedPlayerIdsByTeamIdEqual = (
  left?: Record<string, string[] | null> | null,
  right?: Record<string, string[] | null> | null,
): boolean => {
  const normalizedLeft = normalizeExcludedPlayerIdsByTeamId(left);
  const normalizedRight = normalizeExcludedPlayerIdsByTeamId(right);
  const leftTeamIds = Object.keys(normalizedLeft).sort();
  const rightTeamIds = Object.keys(normalizedRight).sort();

  if (leftTeamIds.length !== rightTeamIds.length) return false;

  return leftTeamIds.every((teamId, index) => {
    if (teamId !== rightTeamIds[index]) return false;
    const leftPlayerIds = normalizedLeft[teamId];
    const rightPlayerIds = normalizedRight[teamId] || [];
    if (leftPlayerIds.length !== rightPlayerIds.length) return false;
    return leftPlayerIds.every((playerId, playerIndex) => playerId === rightPlayerIds[playerIndex]);
  });
};

export type AssignActivityModalProps = {
  visible: boolean;
  activity: AssignableActivity | null;
  trainerId: string | null;
  onClose: () => void;
  onSuccess?: (payload: {
    createdCount: number;
    assignedPlayerCount: number;
    assignedTeamCount: number;
  }) => void;
};

export function AssignActivityModal({
  visible,
  activity,
  trainerId,
  onClose,
  onSuccess,
}: AssignActivityModalProps) {
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);
  const { players, teams, getTeamMembers } = useTeamPlayer();

  const [activeTab, setActiveTab] = useState<TabKey>('players');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [selectedExcludedPlayerIdsByTeamId, setSelectedExcludedPlayerIdsByTeamId] = useState<Record<string, string[]>>({});
  const [assignedPlayerIds, setAssignedPlayerIds] = useState<Set<string>>(new Set());
  const [assignedDirectPlayerIds, setAssignedDirectPlayerIds] = useState<Set<string>>(new Set());
  const [assignedTeamIds, setAssignedTeamIds] = useState<Set<string>>(new Set());
  const [assignedExcludedPlayerIdsByTeamId, setAssignedExcludedPlayerIdsByTeamId] = useState<Record<string, string[]>>({});
  const [teamMembersByTeamId, setTeamMembersByTeamId] = useState<Record<string, PlayerRow[]>>({});
  const [expandedTeamIds, setExpandedTeamIds] = useState<Set<string>>(new Set());
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const resetSelection = useCallback(() => {
    setSelectedPlayerIds(new Set());
    setSelectedTeamIds(new Set());
    setSelectedExcludedPlayerIdsByTeamId({});
  }, []);

  const applyAssignments = useCallback((state: ActivityAssignmentState) => {
    setAssignedPlayerIds(new Set(state.playerIds));
    setAssignedDirectPlayerIds(new Set(state.directPlayerIds));
    setAssignedTeamIds(new Set(state.teamIds));
    setAssignedExcludedPlayerIdsByTeamId(cloneExcludedPlayerIdsByTeamId(state.excludedPlayerIdsByTeamId));
    setSelectedPlayerIds(new Set(state.directPlayerIds));
    setSelectedTeamIds(new Set(state.teamIds));
    setSelectedExcludedPlayerIdsByTeamId(cloneExcludedPlayerIdsByTeamId(state.excludedPlayerIdsByTeamId));
  }, []);

  const loadAssignments = useCallback(async (): Promise<ActivityAssignmentState> => {
    if (!activity?.id || !trainerId) {
      const empty = {
        playerIds: [],
        teamIds: [],
        directPlayerIds: [],
        teamScopeByPlayerId: {},
        excludedPlayerIdsByTeamId: {},
      };
      applyAssignments(empty);
      return empty;
    }

    const lookup = await activityAssignmentsService.fetchAssignmentState({
      activityId: activity.id,
      trainerId,
      isExternal: activity.isExternal,
      externalEventRowId: activity.externalEventRowId ?? null,
    });
    applyAssignments(lookup);
    return lookup;
  }, [activity?.externalEventRowId, activity?.id, activity?.isExternal, applyAssignments, trainerId]);

  const loadTeamMembers = useCallback(async () => {
    if (!teams.length) {
      setTeamMembersByTeamId({});
      return;
    }

    const resolved = await Promise.all(
      teams.map(async (team) => {
        const members = await getTeamMembers(team.id);
        const rows: PlayerRow[] = members
          .map((member) => ({
            id: member.id,
            title: member.full_name,
            subtitle: member.phone_number || null,
          }))
          .sort((a, b) => String(a.title).localeCompare(String(b.title), 'da-DK', { sensitivity: 'base' }));
        return [team.id, rows] as const;
      }),
    );

    const next: Record<string, PlayerRow[]> = {};
    resolved.forEach(([teamId, rows]) => {
      next[teamId] = rows;
    });
    setTeamMembersByTeamId(next);
    setExpandedTeamIds((prev) => {
      if (prev.size || !teams.length) return prev;
      return new Set([teams[0].id]);
    });
  }, [getTeamMembers, teams]);

  useEffect(() => {
    if (!visible) {
      setActiveTab('players');
      setErrorMessage('');
      setLoadingState('idle');
      setSaving(false);
      resetSelection();
      setExpandedTeamIds(new Set());
      return;
    }

    if (!activity?.id || !trainerId) {
      setLoadingState('error');
      setErrorMessage('Mangler aktivitet eller brugeroplysninger.');
      return;
    }

    setLoadingState('loading');
    setErrorMessage('');
    void Promise.all([loadAssignments(), loadTeamMembers()])
      .then(() => {
        setLoadingState('idle');
      })
      .catch((error: any) => {
        console.error('[AssignActivityModal] load failed', error);
        setErrorMessage(error?.message || 'Kunne ikke hente tildelinger.');
        setLoadingState('error');
      });
  }, [activity?.id, loadAssignments, loadTeamMembers, resetSelection, trainerId, visible]);

  const playerRows = useMemo<PlayerRow[]>(
    () =>
      [...players]
        .sort((a, b) => String(a.full_name).localeCompare(String(b.full_name), 'da-DK', { sensitivity: 'base' }))
        .map((player) => ({
          id: player.id,
          title: player.full_name,
          subtitle: player.phone_number || null,
        })),
    [players],
  );

  const teamRows = useMemo<TeamRow[]>(
    () =>
      [...teams]
        .sort((a, b) => String(a.name).localeCompare(String(b.name), 'da-DK', { sensitivity: 'base' }))
        .map((team) => ({
          id: team.id,
          title: team.name,
          subtitle: team.description || null,
        })),
    [teams],
  );

  const listData = activeTab === 'players' ? playerRows : teamRows;

  const selectedTeamMemberIds = useMemo(() => {
    const ids = new Set<string>();
    selectedTeamIds.forEach((teamId) => {
      const members = teamMembersByTeamId[teamId] || [];
      const excludedPlayerIds = new Set(selectedExcludedPlayerIdsByTeamId[teamId] || []);
      members.forEach((member) => {
        if (excludedPlayerIds.has(member.id)) return;
        ids.add(member.id);
      });
    });
    return ids;
  }, [selectedExcludedPlayerIdsByTeamId, selectedTeamIds, teamMembersByTeamId]);

  const effectiveSelectedPlayerIds = useMemo(() => {
    const next = new Set<string>(selectedPlayerIds);
    selectedTeamMemberIds.forEach((playerId) => next.add(playerId));
    return next;
  }, [selectedPlayerIds, selectedTeamMemberIds]);

  const selectionCount = effectiveSelectedPlayerIds.size;
  const hasChanges = useMemo(() => {
    if (selectedPlayerIds.size !== assignedDirectPlayerIds.size) return true;
    if (selectedTeamIds.size !== assignedTeamIds.size) return true;
    if (!areExcludedPlayerIdsByTeamIdEqual(selectedExcludedPlayerIdsByTeamId, assignedExcludedPlayerIdsByTeamId)) {
      return true;
    }

    for (const playerId of selectedPlayerIds) {
      if (!assignedDirectPlayerIds.has(playerId)) return true;
    }

    for (const teamId of selectedTeamIds) {
      if (!assignedTeamIds.has(teamId)) return true;
    }

    return false;
  }, [
    assignedDirectPlayerIds,
    assignedExcludedPlayerIdsByTeamId,
    assignedTeamIds,
    selectedExcludedPlayerIdsByTeamId,
    selectedPlayerIds,
    selectedTeamIds,
  ]);

  const toggleDirectPlayerSelection = useCallback((playerId: string) => {
    setSelectedPlayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }, []);

  const togglePlayer = useCallback(
    (playerId: string) => {
      if (saving) return;
      const selectedTeamIdsForPlayer = Array.from(selectedTeamIds).filter((teamId) =>
        (teamMembersByTeamId[teamId] || []).some((member) => member.id === playerId),
      );

      if (!selectedTeamIdsForPlayer.length) {
        toggleDirectPlayerSelection(playerId);
        return;
      }

      const isExcludedFromAllSelectedTeams = selectedTeamIdsForPlayer.every((teamId) =>
        (selectedExcludedPlayerIdsByTeamId[teamId] || []).includes(playerId),
      );

      if (isExcludedFromAllSelectedTeams) {
        const nextExcludedPlayerIdsByTeamId = cloneExcludedPlayerIdsByTeamId(selectedExcludedPlayerIdsByTeamId);
        selectedTeamIdsForPlayer.forEach((teamId) => {
          const nextExcludedPlayerIds = (nextExcludedPlayerIdsByTeamId[teamId] || []).filter(
            (currentPlayerId) => currentPlayerId !== playerId,
          );
          if (nextExcludedPlayerIds.length) {
            nextExcludedPlayerIdsByTeamId[teamId] = nextExcludedPlayerIds;
          } else {
            delete nextExcludedPlayerIdsByTeamId[teamId];
          }
        });
        setSelectedExcludedPlayerIdsByTeamId(nextExcludedPlayerIdsByTeamId);
        return;
      }

      const nextExcludedPlayerIdsByTeamId = cloneExcludedPlayerIdsByTeamId(selectedExcludedPlayerIdsByTeamId);
      const nextSelectedTeamIds = new Set(selectedTeamIds);

      selectedTeamIdsForPlayer.forEach((teamId) => {
        const teamMembers = teamMembersByTeamId[teamId] || [];
        const excludedPlayerIds = new Set(nextExcludedPlayerIdsByTeamId[teamId] || []);
        excludedPlayerIds.add(playerId);
        const includedMembers = teamMembers.filter((member) => !excludedPlayerIds.has(member.id));

        if (!includedMembers.length) {
          nextSelectedTeamIds.delete(teamId);
          delete nextExcludedPlayerIdsByTeamId[teamId];
          return;
        }

        nextExcludedPlayerIdsByTeamId[teamId] = Array.from(excludedPlayerIds).sort();
      });

      setSelectedPlayerIds((prev) => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
      setSelectedTeamIds(nextSelectedTeamIds);
      setSelectedExcludedPlayerIdsByTeamId(nextExcludedPlayerIdsByTeamId);
    },
    [
      saving,
      selectedExcludedPlayerIdsByTeamId,
      selectedTeamIds,
      teamMembersByTeamId,
      toggleDirectPlayerSelection,
    ],
  );

  const toggleTeamMember = useCallback(
    (teamId: string, playerId: string) => {
      if (saving) return;

      if (!selectedTeamIds.has(teamId)) {
        toggleDirectPlayerSelection(playerId);
        return;
      }

      const teamMembers = teamMembersByTeamId[teamId] || [];
      if (!teamMembers.some((member) => member.id === playerId)) {
        return;
      }

      const nextExcludedPlayerIdsByTeamId = cloneExcludedPlayerIdsByTeamId(selectedExcludedPlayerIdsByTeamId);
      const excludedPlayerIds = new Set(nextExcludedPlayerIdsByTeamId[teamId] || []);

      if (excludedPlayerIds.has(playerId)) {
        excludedPlayerIds.delete(playerId);
      } else {
        excludedPlayerIds.add(playerId);
      }

      const includedMembers = teamMembers.filter((member) => !excludedPlayerIds.has(member.id));
      if (!includedMembers.length) {
        const nextSelectedTeamIds = new Set(selectedTeamIds);
        nextSelectedTeamIds.delete(teamId);
        setSelectedTeamIds(nextSelectedTeamIds);
        delete nextExcludedPlayerIdsByTeamId[teamId];
      } else if (excludedPlayerIds.size) {
        nextExcludedPlayerIdsByTeamId[teamId] = Array.from(excludedPlayerIds).sort();
      } else {
        delete nextExcludedPlayerIdsByTeamId[teamId];
      }

      setSelectedPlayerIds((prev) => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
      setSelectedExcludedPlayerIdsByTeamId(nextExcludedPlayerIdsByTeamId);
    },
    [
      saving,
      selectedExcludedPlayerIdsByTeamId,
      selectedTeamIds,
      teamMembersByTeamId,
      toggleDirectPlayerSelection,
    ],
  );

  const toggleTeam = useCallback(
    (teamId: string) => {
      if (saving) return;
      const members = teamMembersByTeamId[teamId] || [];
      const memberIds = members.map((member) => member.id);
      if (!selectedTeamIds.has(teamId) && !memberIds.length) return;

      setSelectedTeamIds((prev) => {
        const next = new Set(prev);
        if (next.has(teamId)) next.delete(teamId);
        else next.add(teamId);
        return next;
      });
      setSelectedPlayerIds((prev) => {
        if (!memberIds.length) return prev;
        const next = new Set(prev);
        memberIds.forEach((memberId) => next.delete(memberId));
        return next;
      });
    },
    [saving, selectedTeamIds, teamMembersByTeamId],
  );

  const handleAssign = useCallback(async () => {
    if (!activity?.id || !trainerId) return;
    if (!hasChanges) {
      return;
    }

    setSaving(true);
    try {
      const result: AssignActivityResult = await activityAssignmentsService.assignActivity({
        activityId: activity.id,
        trainerId,
        isExternal: activity.isExternal,
        externalEventRowId: activity.externalEventRowId ?? null,
        categoryId: activity.categoryId ?? null,
        intensity: activity.intensity ?? null,
        intensityEnabled: activity.intensityEnabled === true,
        intensityNote: activity.intensityNote ?? null,
        playerIds: Array.from(selectedPlayerIds),
        teamIds: Array.from(selectedTeamIds),
        excludedPlayerIdsByTeamId: selectedExcludedPlayerIdsByTeamId,
      });

      resetSelection();
      onSuccess?.({
        createdCount: result.createdCount,
        assignedPlayerCount: result.assignment.playerIds.length,
        assignedTeamCount: result.assignment.teamIds.length,
      });

      let message = 'Aktivitetstildelingen blev opdateret.';
      if (result.createdCount && !result.removedCount && !result.updatedCount) {
        message = `Aktiviteten blev tilføjet til ${result.createdCount} modtager${result.createdCount === 1 ? '' : 'e'}.`;
      } else if (result.removedCount && !result.createdCount && !result.updatedCount) {
        message = `Aktiviteten blev fjernet fra ${result.removedCount} modtager${result.removedCount === 1 ? '' : 'e'}.`;
      }
      Alert.alert('Aktivitet opdateret', message);
      onClose();
    } catch (error: any) {
      console.error('[AssignActivityModal] assign failed', error);
      Alert.alert('Kunne ikke opdatere', error?.message || 'Prøv igen senere.');
    } finally {
      setSaving(false);
    }
  }, [
    activity?.categoryId,
    activity?.externalEventRowId,
    activity?.id,
    activity?.intensity,
    activity?.intensityEnabled,
    activity?.intensityNote,
    activity?.isExternal,
    onClose,
    onSuccess,
    resetSelection,
    selectedExcludedPlayerIdsByTeamId,
    selectedPlayerIds,
    selectedTeamIds,
    hasChanges,
    trainerId,
  ]);

  const renderPlayerRow = useCallback(
    ({ item }: { item: PlayerRow }) => {
      const isAssigned = assignedPlayerIds.has(item.id);
      const isSelectedByTeam = selectedTeamMemberIds.has(item.id) && !selectedPlayerIds.has(item.id);
      const isSelected = selectedPlayerIds.has(item.id) || isSelectedByTeam;

      return (
        <TouchableOpacity
          style={[
            styles.row,
            {
              backgroundColor: theme.card,
              borderColor: isSelected ? theme.primary : theme.highlight,
              opacity: saving ? 0.68 : 1,
            },
          ]}
          activeOpacity={0.85}
          onPress={() => {
            if (saving) return;
            togglePlayer(item.id);
          }}
          disabled={saving}
          testID={`activity.assign.row.player.${item.id}`}
        >
          <View style={[styles.rowIcon, { backgroundColor: theme.highlight }]}>
            <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={18} color={theme.text} />
          </View>
          <View style={styles.rowContent}>
            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}
            {isAssigned ? (
              <Text
                style={[styles.assignedLabel, { color: theme.primary }]}
                testID={`activity.assign.row.assigned.player.${item.id}`}
              >
                Tilknyttet
              </Text>
            ) : null}
          </View>
          {isSelected ? (
            <View testID={`activity.assign.row.selected.player.${item.id}`}>
              <IconSymbol
                ios_icon_name="checkmark.circle.fill"
                android_material_icon_name="check_circle"
                size={22}
                color={theme.primary}
              />
            </View>
          ) : null}
        </TouchableOpacity>
      );
    },
    [assignedPlayerIds, saving, selectedPlayerIds, selectedTeamMemberIds, theme, togglePlayer],
  );

  const renderTeamRow = useCallback(
    ({ item }: { item: TeamRow }) => {
      const members = teamMembersByTeamId[item.id] || [];
      const isExpanded = expandedTeamIds.has(item.id);
      const isAssigned = assignedTeamIds.has(item.id);
      const isSelected = selectedTeamIds.has(item.id);
      const hasAssignableMembers = members.length > 0;
      const disabled = saving || (!isSelected && !hasAssignableMembers);

      return (
        <View
          style={[
            styles.teamBlock,
            {
              backgroundColor: theme.card,
              borderColor: isSelected ? theme.primary : theme.highlight,
              opacity: disabled ? 0.68 : 1,
            },
          ]}
          testID={`activity.assign.team.block.${item.id}`}
        >
          <View style={styles.teamHeaderRow}>
            <TouchableOpacity
              style={styles.teamHeaderPress}
              activeOpacity={0.85}
              onPress={() => {
                if (disabled) return;
                toggleTeam(item.id);
              }}
              disabled={disabled}
              testID={`activity.assign.row.team.${item.id}`}
            >
              <View style={[styles.rowIcon, { backgroundColor: theme.highlight }]}>
                <IconSymbol ios_icon_name="person.3.fill" android_material_icon_name="groups" size={18} color={theme.text} />
              </View>
              <View style={styles.rowContent}>
                <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                  {members.length} spillere
                </Text>
                {isAssigned ? (
                  <Text
                    style={[styles.assignedLabel, { color: theme.primary }]}
                    testID={`activity.assign.row.assigned.team.${item.id}`}
                  >
                    Tilknyttet
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>

            <View style={styles.teamHeaderActions}>
              {isSelected ? (
                <View testID={`activity.assign.row.selected.team.${item.id}`}>
                  <IconSymbol
                    ios_icon_name="checkmark.circle.fill"
                    android_material_icon_name="check_circle"
                    size={22}
                    color={theme.primary}
                  />
                </View>
              ) : null}
              <TouchableOpacity
                onPress={() => {
                  setExpandedTeamIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                }}
                style={styles.teamExpandButton}
                testID={`activity.assign.team.toggle.${item.id}`}
              >
                <IconSymbol
                  ios_icon_name={isExpanded ? 'chevron.up' : 'chevron.down'}
                  android_material_icon_name={isExpanded ? 'expand_less' : 'expand_more'}
                  size={18}
                  color={theme.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>

          {isExpanded ? (
            <View style={[styles.teamMembersList, { borderTopColor: theme.highlight }]}>
              {members.map((member) => {
                const memberAssigned = assignedPlayerIds.has(member.id);
                const memberExcluded =
                  isSelected && (selectedExcludedPlayerIdsByTeamId[item.id] || []).includes(member.id);
                const memberSelected = isSelected ? !memberExcluded : selectedPlayerIds.has(member.id);
                const memberDisabled = saving;

                return (
                  <TouchableOpacity
                    key={`${item.id}:${member.id}`}
                    onPress={() => {
                      if (saving) return;
                      toggleTeamMember(item.id, member.id);
                    }}
                    activeOpacity={0.85}
                    disabled={memberDisabled}
                    style={[
                      styles.teamMemberRow,
                      {
                        borderColor: memberSelected ? theme.primary : theme.highlight,
                        backgroundColor: theme.background,
                        opacity: memberDisabled ? 0.7 : 1,
                      },
                    ]}
                    testID={`activity.assign.team.member.${item.id}.${member.id}`}
                  >
                    <View style={[styles.teamMemberIcon, { backgroundColor: theme.highlight }]}>
                      <IconSymbol ios_icon_name="person.fill" android_material_icon_name="person" size={14} color={theme.text} />
                    </View>
                    <View style={styles.rowContent}>
                      <Text style={[styles.teamMemberTitle, { color: theme.text }]} numberOfLines={1}>
                        {member.title}
                      </Text>
                      {member.subtitle ? (
                        <Text style={[styles.teamMemberSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                          {member.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    {memberSelected ? (
                      <View testID={`activity.assign.team.member.selected.${item.id}.${member.id}`}>
                        <IconSymbol
                          ios_icon_name="checkmark.circle.fill"
                          android_material_icon_name="check_circle"
                          size={18}
                          color={theme.primary}
                        />
                      </View>
                    ) : null}
                    {memberAssigned ? (
                      <Text
                        style={[styles.assignedLabel, { color: theme.primary }]}
                        testID={`activity.assign.team.member.assigned.${item.id}.${member.id}`}
                      >
                        Tilknyttet
                      </Text>
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
      assignedPlayerIds,
      assignedTeamIds,
      expandedTeamIds,
      saving,
      selectedExcludedPlayerIdsByTeamId,
      selectedPlayerIds,
      selectedTeamIds,
      teamMembersByTeamId,
      theme,
      toggleTeamMember,
      toggleTeam,
    ],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]} testID="activity.assign.modal">
        <View style={[styles.header, { paddingTop: Platform.OS === 'android' ? 54 : 24 }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.headerButton, { backgroundColor: theme.card, borderColor: theme.highlight }]}
            testID="activity.assign.closeButton"
          >
            <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Tilføj til aktivitet</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={[styles.activityCard, { backgroundColor: theme.card, borderColor: theme.highlight }]}>
          <Text style={[styles.activityLabel, { color: theme.textSecondary }]}>Aktivitet</Text>
          <Text style={[styles.activityTitle, { color: theme.text }]} numberOfLines={2}>
            {activity?.title || 'Ukendt aktivitet'}
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
            testID="activity.assign.tab.players"
          >
            <Text style={[styles.tabText, { color: activeTab === 'players' ? '#fff' : theme.text }]}>
              Spillere ({players.length})
            </Text>
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
            testID="activity.assign.tab.teams"
          >
            <Text style={[styles.tabText, { color: activeTab === 'teams' ? '#fff' : theme.text }]}>
              Hold ({teams.length})
            </Text>
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

        <FlatList
          data={listData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) =>
            activeTab === 'players'
              ? renderPlayerRow({ item: item as PlayerRow })
              : renderTeamRow({ item: item as TeamRow })
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          testID={activeTab === 'players' ? 'activity.assign.list.players' : 'activity.assign.list.teams'}
          ListEmptyComponent={
            <View style={[styles.emptyState, { borderColor: theme.highlight }]}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                Ingen {activeTab === 'players' ? 'spillere' : 'hold'}
              </Text>
            </View>
          }
        />

        <View style={[styles.footer, { borderTopColor: theme.highlight, backgroundColor: theme.card }]}>
          <View>
            <Text style={[styles.footerLabel, { color: theme.textSecondary }]}>Valgt</Text>
            <Text style={[styles.footerValue, { color: theme.text }]}>{selectionCount}</Text>
          </View>
          <TouchableOpacity
            onPress={handleAssign}
            activeOpacity={0.85}
            disabled={saving || !hasChanges}
            style={[
              styles.saveButton,
              {
                backgroundColor:
                  saving || !hasChanges ? theme.highlight : colors.success,
                opacity: saving || !hasChanges ? 0.65 : 1,
              },
            ]}
            testID="activity.assign.saveButton"
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Text style={styles.saveButtonText}>Gem</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
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
  activityCard: {
    marginHorizontal: 20,
    marginBottom: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  activityLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.3 },
  activityTitle: { marginTop: 8, fontSize: 22, lineHeight: 28, fontWeight: '900' },
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
  rowIcon: {
    width: 48,
    height: 48,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowContent: {
    flex: 1,
  },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  assignedLabel: { fontSize: 12, fontWeight: '700', marginTop: 6 },
  teamBlock: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  teamHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  teamHeaderPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    gap: 8,
  },
  teamExpandButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamMembersList: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  teamMemberRow: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  teamMemberIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamMemberTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  teamMemberSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
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
  saveButton: {
    paddingHorizontal: 30,
    paddingVertical: 13,
    borderRadius: 999,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '900', letterSpacing: 0.2 },
});
