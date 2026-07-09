import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { IconSymbol } from '@/components/IconSymbol';
import { useAdmin } from '@/contexts/AdminContext';
import { useTeamPlayer, type Player, type Team } from '@/contexts/TeamPlayerContext';

type ScopeOption =
  | { kind: 'all'; id: 'all'; label: string; detail: string }
  | { kind: 'player'; id: string; label: string; detail: string }
  | { kind: 'team'; id: string; label: string; detail: string };

type TrainerScopeFilterColors = {
  primary: string;
  card: string;
  highlight?: string;
  text: string;
  textSecondary: string;
};

type TrainerScopeFilterProps = {
  testIDPrefix: string;
  modalTitle: string;
  allLabel: string;
  allDetail: string;
  playerDetail: string;
  teamDetail: string;
  emptyText?: string;
  colors: TrainerScopeFilterColors;
  isDark: boolean;
  containerStyle?: StyleProp<ViewStyle>;
};

function getScopeIcon(kind: ScopeOption['kind']) {
  if (kind === 'team') return { ios: 'person.3.fill', android: 'groups' } as const;
  if (kind === 'player') return { ios: 'person.crop.circle', android: 'person' } as const;
  return { ios: 'line.3.horizontal.decrease.circle', android: 'filter_list' } as const;
}

export function TrainerScopeFilter({
  testIDPrefix,
  modalTitle,
  allLabel,
  allDetail,
  playerDetail,
  teamDetail,
  emptyText = 'No players or teams yet.',
  colors,
  isDark,
  containerStyle,
}: TrainerScopeFilterProps) {
  const { adminMode, adminTargetId, adminTargetType, startAdminPlayer, startAdminTeam, exitAdmin } = useAdmin();
  const { players, teams, selectedContext, ensureRosterLoaded, setSelectedContext, loading } = useTeamPlayer();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isRosterLoading, setIsRosterLoading] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);

  const scopeOptions = useMemo<ScopeOption[]>(() => {
    const playerOptions = (Array.isArray(players) ? players : []).map((player: Player) => ({
      kind: 'player' as const,
      id: player.id,
      label: player.full_name || player.email || 'Player',
      detail: playerDetail,
    }));
    const teamOptions = (Array.isArray(teams) ? teams : []).map((team: Team) => ({
      kind: 'team' as const,
      id: team.id,
      label: team.name || 'Team',
      detail: teamDetail,
    }));

    return [{ kind: 'all', id: 'all', label: allLabel, detail: allDetail }, ...playerOptions, ...teamOptions];
  }, [allDetail, allLabel, playerDetail, players, teamDetail, teams]);

  const activeOptionName = useMemo(() => {
    if (adminMode === 'self') return null;
    const selectedName =
      selectedContext?.type === adminTargetType && selectedContext?.id === adminTargetId
        ? selectedContext.name
        : null;
    if (selectedName) return selectedName;
    if (adminTargetType === 'player') {
      return players.find((player) => player.id === adminTargetId)?.full_name ?? null;
    }
    if (adminTargetType === 'team') {
      return teams.find((team) => team.id === adminTargetId)?.name ?? null;
    }
    return null;
  }, [adminMode, adminTargetId, adminTargetType, players, selectedContext, teams]);

  const buttonLabel = adminMode === 'self' ? 'Filter' : activeOptionName || (adminTargetType === 'team' ? 'Team' : 'Player');
  const buttonIcon = getScopeIcon(adminMode === 'self' ? 'all' : adminTargetType === 'team' ? 'team' : 'player');
  const isScoped = adminMode !== 'self';
  const rosterBusy = loading || isRosterLoading;

  const statusMessage = useMemo(() => {
    if (rosterBusy) return 'Loading players and teams...';
    if (scopeError) return scopeError;
    if (!scopeOptions.some((option) => option.kind !== 'all')) return emptyText;
    return null;
  }, [emptyText, rosterBusy, scopeError, scopeOptions]);

  const loadRoster = useCallback(async () => {
    setIsRosterLoading(true);
    setScopeError(null);
    try {
      await ensureRosterLoaded();
    } catch {
      setScopeError('Could not load players and teams.');
    } finally {
      setIsRosterLoading(false);
    }
  }, [ensureRosterLoaded]);

  const handleOpen = useCallback(() => {
    setIsModalVisible(true);
    void loadRoster();
  }, [loadRoster]);

  const handleClose = useCallback(() => {
    setIsModalVisible(false);
  }, []);

  const isOptionSelected = useCallback(
    (option: ScopeOption) => {
      if (option.kind === 'all') return adminMode === 'self';
      return adminMode === option.kind && adminTargetType === option.kind && adminTargetId === option.id;
    },
    [adminMode, adminTargetId, adminTargetType]
  );

  const handleSelectOption = useCallback(
    (option: ScopeOption) => {
      if (option.kind === 'all') {
        exitAdmin();
        void setSelectedContext({ type: null, id: null, name: null });
      } else if (option.kind === 'player') {
        startAdminPlayer(option.id);
        void setSelectedContext({ type: 'player', id: option.id, name: option.label });
      } else {
        startAdminTeam(option.id);
        void setSelectedContext({ type: 'team', id: option.id, name: option.label });
      }

      setIsModalVisible(false);
    },
    [exitAdmin, setSelectedContext, startAdminPlayer, startAdminTeam]
  );

  const renderOption = useCallback(
    ({ item }: { item: ScopeOption }) => {
      const selected = isOptionSelected(item);
      return (
        <Pressable
          testID={`${testIDPrefix}.option.${item.kind}.${item.id}`}
          style={[
            styles.option,
            {
              backgroundColor: selected ? colors.primary : isDark ? '#171717' : '#FFFFFF',
              borderColor: selected ? colors.primary : isDark ? '#333' : '#E2E8E4',
            },
          ]}
          onPress={() => handleSelectOption(item)}
        >
          <View style={styles.optionTextBlock}>
            <Text
              style={[styles.optionLabel, { color: selected ? '#FFFFFF' : isDark ? '#F4F4F4' : colors.text }]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
            <Text
              style={[
                styles.optionDetail,
                { color: selected ? 'rgba(255,255,255,0.8)' : isDark ? '#A8A8A8' : colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {item.detail}
            </Text>
          </View>
          {selected ? (
            <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={20} color="#FFFFFF" />
          ) : null}
        </Pressable>
      );
    },
    [colors.primary, colors.text, colors.textSecondary, handleSelectOption, isDark, isOptionSelected, testIDPrefix]
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <Pressable
        style={[
          styles.button,
          isScoped && styles.buttonActive,
          {
            backgroundColor: isScoped
              ? isDark
                ? 'rgba(76, 175, 80, 0.13)'
                : 'rgba(255, 255, 255, 0.72)'
              : isDark
                ? '#2a2a2a'
                : colors.card,
            borderColor: isScoped
              ? isDark
                ? 'rgba(142, 224, 168, 0.58)'
                : 'rgba(47, 125, 70, 0.46)'
              : isDark
                ? '#444'
                : colors.highlight ?? '#E2E8E4',
          },
        ]}
        onPress={handleOpen}
        accessibilityRole="button"
        accessibilityLabel="Filter by player or team"
        testID={`${testIDPrefix}.toggle`}
      >
        <IconSymbol
          ios_icon_name={buttonIcon.ios}
          android_material_icon_name={buttonIcon.android}
          size={13}
          color={isScoped ? (isDark ? '#8EE0A8' : '#2F7D46') : isDark ? '#e3e3e3' : colors.text}
        />
        <Text
          style={[
            styles.buttonText,
            { color: isScoped ? (isDark ? '#D8F6E1' : '#243B2B') : isDark ? '#e3e3e3' : colors.text },
          ]}
          numberOfLines={1}
        >
          {buttonLabel}
        </Text>
      </Pressable>

      <Modal visible={isModalVisible} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable style={styles.backdrop} onPress={handleClose}>
          <Pressable
            style={[styles.modalCard, { backgroundColor: isDark ? '#1F1F1F' : colors.card, borderColor: isDark ? '#333' : '#E2E8E4' }]}
            onPress={() => undefined}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: isDark ? '#F4F4F4' : colors.text }]}>{modalTitle}</Text>
              <Pressable
                style={[styles.closeButton, { borderColor: isDark ? '#444' : '#D6D6D6' }]}
                onPress={handleClose}
                accessibilityRole="button"
                accessibilityLabel="Close filter"
                testID={`${testIDPrefix}.close`}
              >
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={18} color={isDark ? '#F4F4F4' : colors.text} />
              </Pressable>
            </View>

            <FlatList
              data={scopeOptions}
              keyExtractor={(item) => `${item.kind}:${item.id}`}
              renderItem={renderOption}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                statusMessage ? (
                  <View style={[styles.state, { backgroundColor: isDark ? '#171717' : '#FFFFFF', borderColor: isDark ? '#333' : '#E2E8E4' }]}>
                    {rosterBusy ? <ActivityIndicator size="small" color={colors.primary} testID={`${testIDPrefix}.loading`} /> : null}
                    <Text
                      testID={scopeError ? `${testIDPrefix}.error` : `${testIDPrefix}.empty`}
                      style={[styles.stateText, { color: isDark ? '#A8A8A8' : colors.textSecondary }]}
                    >
                      {statusMessage}
                    </Text>
                  </View>
                ) : null
              }
              ListFooterComponent={
                statusMessage ? (
                  <View style={[styles.state, { backgroundColor: isDark ? '#171717' : '#FFFFFF', borderColor: isDark ? '#333' : '#E2E8E4' }]}>
                    {rosterBusy ? <ActivityIndicator size="small" color={colors.primary} testID={`${testIDPrefix}.loading`} /> : null}
                    <Text
                      testID={scopeError ? `${testIDPrefix}.error` : `${testIDPrefix}.empty`}
                      style={[styles.stateText, { color: isDark ? '#A8A8A8' : colors.textSecondary }]}
                    >
                      {statusMessage}
                    </Text>
                  </View>
                ) : null
              }
              initialNumToRender={12}
              maxToRenderPerBatch={12}
              windowSize={5}
              removeClippedSubviews={Platform.OS !== 'web'}
              keyboardShouldPersistTaps="handled"
              testID={`${testIDPrefix}.list`}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
  },
  button: {
    maxWidth: 168,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    flexDirection: 'row',
    columnGap: 6,
  },
  buttonActive: {
    borderWidth: 1.5,
    shadowColor: '#2F7D46',
    shadowOpacity: 0.12,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  buttonText: {
    maxWidth: 118,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.34)',
  },
  modalCard: {
    maxHeight: '74%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
  },
  modalHeader: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 0,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    rowGap: 8,
    paddingBottom: 8,
  },
  option: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 10,
  },
  optionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0,
  },
  optionDetail: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  state: {
    minHeight: 58,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    rowGap: 8,
  },
  stateText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
