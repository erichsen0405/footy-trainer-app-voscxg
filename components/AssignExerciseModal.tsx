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

import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { exerciseAssignmentsService } from '@/services/exerciseAssignments';

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

export function AssignExerciseModal({ visible, exercise, trainerId, onClose, onSuccess }: AssignExerciseModalProps) {
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);
  const {
    players,
    teams,
    refreshPlayers,
    refreshTeams,
  } = useTeamPlayer();

  const [activeTab, setActiveTab] = useState<TabKey>('players');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set());
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [assignedPlayerIds, setAssignedPlayerIds] = useState<Set<string>>(new Set());
  const [assignedTeamIds, setAssignedTeamIds] = useState<Set<string>>(new Set());

  const resetSelections = useCallback(() => {
    setSelectedPlayerIds(new Set());
    setSelectedTeamIds(new Set());
  }, []);

  const loadAssignments = useCallback(async () => {
    if (!exercise?.id || !trainerId) {
      setAssignedPlayerIds(new Set());
      setAssignedTeamIds(new Set());
      return;
    }
    const { playerIds, teamIds } = await exerciseAssignmentsService.fetchAssignments(exercise.id, trainerId);
    setAssignedPlayerIds(new Set(playerIds));
    setAssignedTeamIds(new Set(teamIds));
  }, [exercise?.id, trainerId]);

  useEffect(() => {
    if (!visible) {
      resetSelections();
      setActiveTab('players');
      setErrorMessage('');
      return;
    }

    if (!exercise?.id || !trainerId) {
      setLoadingState('error');
      setErrorMessage('Mangler brugeroplysninger. Log ind igen og prøv senere.');
      return;
    }

    setLoadingState('loading');
    setErrorMessage('');

    (async () => {
      try {
        await Promise.all([refreshPlayers(), refreshTeams()]);
        await loadAssignments();
        setLoadingState('idle');
      } catch (err: any) {
        console.error('[AssignExerciseModal] load failed', err);
        setErrorMessage(err?.message || 'Kunne ikke hente data.');
        setLoadingState('error');
      }
    })();
  }, [visible, exercise?.id, trainerId, refreshPlayers, refreshTeams, loadAssignments, resetSelections]);

  const selectionCount = selectedPlayerIds.size + selectedTeamIds.size;

  const listData = useMemo(() => {
    if (activeTab === 'players') {
      const sorted = [...players].sort((a, b) => a.full_name.localeCompare(b.full_name));
      return sorted.map<PlayerRow>(player => ({
        id: player.id,
        title: player.full_name,
        subtitle: player.phone_number || null,
      }));
    }
    const sorted = [...teams].sort((a, b) => a.name.localeCompare(b.name));
    return sorted.map<TeamRow>(team => ({
      id: team.id,
      title: team.name,
      subtitle: team.description || null,
    }));
  }, [activeTab, players, teams]);

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
      if (assignedTeamIds.has(teamId)) return;
      setSelectedTeamIds(prev => {
        const next = new Set(prev);
        if (next.has(teamId)) {
          next.delete(teamId);
        } else {
          next.add(teamId);
        }
        return next;
      });
    },
    [assignedTeamIds]
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
        playerIds: Array.from(selectedPlayerIds),
        teamIds: Array.from(selectedTeamIds),
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
  }, [exercise?.id, trainerId, selectionCount, selectedPlayerIds, selectedTeamIds, loadAssignments, resetSelections, onClose, onSuccess]);

  const renderRow = useCallback(
    ({ item }: { item: PlayerRow | TeamRow }) => {
      const isPlayerTab = activeTab === 'players';
      const isAlreadyAssigned = isPlayerTab ? assignedPlayerIds.has(item.id) : assignedTeamIds.has(item.id);
      const isSelected = isPlayerTab ? selectedPlayerIds.has(item.id) : selectedTeamIds.has(item.id);
      const disabled = isAlreadyAssigned || assigning;

      const handlePress = () => {
        if (isPlayerTab) togglePlayer(item.id);
        else toggleTeam(item.id);
      };

      return (
        <TouchableOpacity
          onPress={handlePress}
          disabled={disabled}
          activeOpacity={0.85}
          style={[
            styles.row,
            { borderColor: isSelected ? theme.primary : theme.highlight, backgroundColor: theme.card },
            disabled ? styles.rowDisabled : null,
          ]}
        >
          <View style={[styles.rowIcon, { backgroundColor: theme.highlight }]}> 
            <IconSymbol
              ios_icon_name={isPlayerTab ? 'person.fill' : 'person.3.fill'}
              android_material_icon_name={isPlayerTab ? 'person' : 'groups'}
              size={18}
              color={theme.text}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            {item.subtitle ? (
              <Text style={[styles.rowSubtitle, { color: theme.textSecondary }]} numberOfLines={1}>
                {item.subtitle}
              </Text>
            ) : null}
          </View>
          {isAlreadyAssigned ? (
            <View style={[styles.rowBadge, { backgroundColor: theme.highlight }]}> 
              <Text style={[styles.rowBadgeText, { color: theme.textSecondary }]}>Tildelt</Text>
            </View>
          ) : isSelected ? (
            <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={22} color={theme.primary} />
          ) : null}
        </TouchableOpacity>
      );
    },
    [activeTab, assignedPlayerIds, assignedTeamIds, assigning, theme, selectedPlayerIds, selectedTeamIds, togglePlayer, toggleTeam]
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
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Tildel øvelse</Text>
          <View style={styles.headerButton} />
        </View>

        <View style={[styles.exerciseCard, { backgroundColor: theme.card }]}> 
          <Text style={[styles.exerciseLabel, { color: theme.textSecondary }]}>Øvelse</Text>
          <Text style={[styles.exerciseTitle, { color: theme.text }]} numberOfLines={2}>
            {exercise?.title || 'Ukendt øvelse'}
          </Text>
        </View>

        <View style={styles.tabsRow}>
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
            renderItem={renderRow}
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

        <View style={[styles.footer, { borderTopColor: theme.highlight }]}> 
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800' },
  exerciseCard: {
    marginHorizontal: 18,
    marginBottom: 16,
    padding: 14,
    borderRadius: 16,
  },
  exerciseLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  exerciseTitle: { marginTop: 6, fontSize: 16, fontWeight: '800' },
  tabsRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabText: { fontSize: 13, fontWeight: '700' },
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
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontSize: 15, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, fontWeight: '500', marginTop: 2 },
  rowBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  rowBadgeText: { fontSize: 12, fontWeight: '700' },
  emptyState: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    marginTop: 40,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyMessage: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  footerLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase' },
  footerValue: { fontSize: 20, fontWeight: '800' },
  assignButton: {
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 999,
  },
  assignButtonText: { color: '#fff', fontSize: 15, fontWeight: '900' },
});
