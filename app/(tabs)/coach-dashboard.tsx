import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { useAdmin } from '@/contexts/AdminContext';
import { useUserRole } from '@/hooks/useUserRole';
import { getColors } from '@/styles/commonStyles';
import {
  OwnerPlayerCrmContext,
  OwnerPlayerCrmWorkspace,
  fetchOwnerPlayerCrmContext,
} from '@/services/ownerPlayerCrmService';
import {
  OwnerCoachDashboardActivity,
  OwnerCoachDashboardAlert,
  OwnerCoachDashboardPayload,
  OwnerCoachDashboardPlayer,
  fetchOwnerCoachDashboard,
} from '@/services/ownerCoachDashboardService';

type DashboardScopeType = 'all' | 'team' | 'player';
type DashboardFilterPicker = 'attention' | 'status' | 'team' | 'tag' | 'position' | 'level';

type DashboardFilters = {
  scopeType: DashboardScopeType;
  scopeId: string | null;
  status: string | null;
  teamId: string | null;
  tagId: string | null;
  level: string | null;
  position: string | null;
  alertOnly: boolean;
};

const emptyFilters: DashboardFilters = {
  scopeType: 'all',
  scopeId: null,
  status: null,
  teamId: null,
  tagId: null,
  level: null,
  position: null,
  alertOnly: false,
};

function filtersStorageKey(ownerAccountId: string): string {
  return `owner-coach-dashboard-filters:${ownerAccountId}`;
}

function formatCompactDate(value: string | null): string {
  if (!value) return 'No date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatCompactDateTime(value: string | null): string {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatActivityTime(activity: OwnerCoachDashboardActivity): string {
  if (activity.activityStart) return formatCompactDateTime(activity.activityStart);
  return `${formatCompactDate(activity.activityDate)}${activity.activityTime ? ` ${activity.activityTime}` : ''}`;
}

function statusLabel(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}

function severityColor(severity: OwnerCoachDashboardAlert['severity'], colors: ReturnType<typeof getColors>): string {
  if (severity === 'high') return colors.error;
  if (severity === 'warning') return colors.warning;
  return colors.secondary;
}

function hasActiveFilters(filters: DashboardFilters): boolean {
  return Boolean(
    (filters.scopeType !== 'all' && filters.scopeId) ||
      filters.status ||
      filters.teamId ||
      filters.tagId ||
      filters.level ||
      filters.position ||
      filters.alertOnly
  );
}

function countActivePlayerFilters(filters: DashboardFilters): number {
  return [
    filters.alertOnly,
    filters.status,
    filters.teamId,
    filters.tagId,
    filters.level,
    filters.position,
  ].filter(Boolean).length;
}

function playerMatchesFilters(player: OwnerCoachDashboardPlayer, filters: DashboardFilters): boolean {
  if (filters.alertOnly && player.alertTypes.length === 0) return false;
  if (filters.status && player.crmStatus !== filters.status) return false;
  if (filters.teamId && !player.teamIds.includes(filters.teamId)) return false;
  if (filters.tagId && !player.tagIds.includes(filters.tagId)) return false;
  if (filters.level && player.playingLevel !== filters.level) return false;
  if (filters.position && !player.positions.includes(filters.position)) return false;
  return true;
}

function getDashboardScopeLabel(dashboard: OwnerCoachDashboardPayload | null, filters: DashboardFilters): string {
  if (!dashboard || filters.scopeType === 'all' || !filters.scopeId) return 'All players';
  if (filters.scopeType === 'team') {
    return dashboard.filters.teams.find((team) => team.id === filters.scopeId)?.name ?? 'Selected team';
  }
  return dashboard.players.find((player) => player.playerId === filters.scopeId)?.displayName ?? 'Selected player';
}

function getDashboardScopeKicker(filters: DashboardFilters): string {
  if (filters.scopeType === 'team') return 'Team view';
  if (filters.scopeType === 'player') return 'Player view';
  return 'Dashboard view';
}

function getScopedPlayers(dashboard: OwnerCoachDashboardPayload, filters: DashboardFilters): OwnerCoachDashboardPlayer[] {
  if (filters.scopeType === 'all' || !filters.scopeId) return dashboard.players;
  if (filters.scopeType === 'team') {
    return dashboard.players.filter((player) => player.teamIds.includes(filters.scopeId as string));
  }
  return dashboard.players.filter((player) => player.playerId === filters.scopeId);
}

function getDashboardFilterTeamIds(filters: DashboardFilters): Set<string> {
  const teamIds = new Set<string>();
  if (filters.scopeType === 'team' && filters.scopeId) {
    teamIds.add(filters.scopeId);
  }
  if (filters.teamId) {
    teamIds.add(filters.teamId);
  }
  return teamIds;
}

function getFilteredDashboardPlayers(
  dashboard: OwnerCoachDashboardPayload,
  filters: DashboardFilters
): OwnerCoachDashboardPlayer[] {
  return getScopedPlayers(dashboard, filters).filter((player) => playerMatchesFilters(player, filters));
}

function activityMatchesDashboardFilters(
  activity: OwnerCoachDashboardActivity,
  filters: DashboardFilters,
  filteredPlayerIds: Set<string>
): boolean {
  if (filteredPlayerIds.size === 0) return false;
  if (activity.playerIds.some((playerId) => filteredPlayerIds.has(playerId))) {
    return true;
  }

  const selectedTeamIds = getDashboardFilterTeamIds(filters);
  return Boolean(activity.teamId && selectedTeamIds.has(activity.teamId));
}

function alertMatchesDashboardFilters(
  alert: OwnerCoachDashboardAlert,
  filteredPlayerIds: Set<string>
): boolean {
  return filteredPlayerIds.has(alert.playerId);
}

function getFilteredDashboardMetrics(
  players: OwnerCoachDashboardPlayer[],
  todayActivities: OwnerCoachDashboardActivity[],
  weekActivities: OwnerCoachDashboardActivity[]
): OwnerCoachDashboardPayload['metrics'] {
  const openTasks = players.reduce((sum, player) => sum + player.openTasks, 0);
  const completedTasks = players.reduce((sum, player) => sum + player.completedTasks, 0);
  const taskTotal = openTasks + completedTasks;

  return {
    totalPlayers: players.length,
    activePlayers: players.filter((player) => player.crmStatus === 'active').length,
    trialPlayers: players.filter((player) => player.crmStatus === 'trial').length,
    pausedPlayers: players.filter((player) => player.crmStatus === 'paused').length,
    formerPlayers: players.filter((player) => player.crmStatus === 'former').length,
    playersMissingTasks: players.filter((player) => player.missingTasks > 0).length,
    inactivePlayers: players.filter((player) => player.isInactive).length,
    playersWithoutPlan: players.filter((player) => player.withoutPlan).length,
    newFeedback: players.reduce((sum, player) => sum + player.recentFeedbackCount, 0),
    todayActivities: todayActivities.length,
    weekActivities: weekActivities.length,
    upcomingSessions: players.reduce((sum, player) => sum + player.upcomingActivitiesCount, 0),
    openTasks,
    completedTasks,
    taskCompletionRate: taskTotal ? Math.round((completedTasks / taskTotal) * 100) : null,
  };
}

export default function CoachDashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = getColors(colorScheme);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { startAdminPlayer, exitAdmin } = useAdmin();
  const { userRole, loading: roleLoading } = useUserRole();
  const [context, setContext] = useState<OwnerPlayerCrmContext | null>(null);
  const [activeOwnerAccountId, setActiveOwnerAccountId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<OwnerCoachDashboardPayload | null>(null);
  const [filters, setFilters] = useState<DashboardFilters>(emptyFilters);
  const [savedFilters, setSavedFilters] = useState<DashboardFilters | null>(null);
  const [scopeSelectorVisible, setScopeSelectorVisible] = useState(false);
  const [filterPickerVisible, setFilterPickerVisible] = useState<DashboardFilterPicker | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAccessCoachDashboard = userRole === 'admin' || userRole === 'trainer';

  const activeWorkspace = useMemo(
    () => context?.workspaces.find((workspace) => workspace.ownerAccountId === activeOwnerAccountId) ?? null,
    [activeOwnerAccountId, context?.workspaces]
  );

  const loadContext = useCallback(async () => {
    const payload = await fetchOwnerPlayerCrmContext();
    setContext(payload);
    setActiveOwnerAccountId((current) => {
      if (current && payload.workspaces.some((workspace) => workspace.ownerAccountId === current)) {
        return current;
      }
      return payload.defaultOwnerAccountId ?? payload.workspaces[0]?.ownerAccountId ?? null;
    });
  }, []);

  const loadDashboard = useCallback(async (ownerAccountId: string) => {
    setDashboardLoading(true);
    try {
      const payload = await fetchOwnerCoachDashboard({ ownerAccountId });
      setDashboard(payload);
      setError(null);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Could not load the coach dashboard.';
      setError(message);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (roleLoading || !canAccessCoachDashboard) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    loadContext()
      .catch((loadError) => {
        if (!cancelled) {
          const message = loadError instanceof Error ? loadError.message : 'Could not load owner context.';
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canAccessCoachDashboard, loadContext, roleLoading]);

  useEffect(() => {
    if (!activeOwnerAccountId || !canAccessCoachDashboard) return;
    void loadDashboard(activeOwnerAccountId);
  }, [activeOwnerAccountId, canAccessCoachDashboard, loadDashboard]);

  useEffect(() => {
    if (!activeOwnerAccountId) {
      setFilters(emptyFilters);
      setSavedFilters(null);
      return;
    }

    let cancelled = false;
    AsyncStorage.getItem(filtersStorageKey(activeOwnerAccountId))
      .then((raw) => {
        if (cancelled) return;
        if (!raw) {
          setFilters(emptyFilters);
          setSavedFilters(null);
          return;
        }
        const parsed = JSON.parse(raw) as DashboardFilters;
        const next = { ...emptyFilters, ...parsed };
        setFilters(next);
        setSavedFilters(next);
      })
      .catch(() => {
        if (!cancelled) {
          setFilters(emptyFilters);
          setSavedFilters(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeOwnerAccountId]);

  useEffect(() => {
    if (!dashboard || filters.scopeType === 'all' || !filters.scopeId) return;

    const scopeExists =
      filters.scopeType === 'team'
        ? dashboard.filters.teams.some((team) => team.id === filters.scopeId)
        : dashboard.players.some((player) => player.playerId === filters.scopeId);

    if (!scopeExists) {
      setFilters((current) => ({ ...current, scopeType: 'all', scopeId: null }));
    }
  }, [dashboard, filters.scopeId, filters.scopeType]);

  const filteredDashboard = useMemo(() => {
    if (!dashboard) {
      return {
        players: [],
        alerts: [],
        todayActivities: [],
        weekActivities: [],
        metrics: null,
      };
    }

    const scopedPlayers = getScopedPlayers(dashboard, filters);
    const scopedPlayerIds = new Set(scopedPlayers.map((player) => player.playerId));
    const players = scopedPlayers.filter((player) => playerMatchesFilters(player, filters));
    const scopeOnlyFilters = {
      ...emptyFilters,
      scopeType: filters.scopeType,
      scopeId: filters.scopeId,
    };
    const alerts = dashboard.alerts.filter((alert) => alertMatchesDashboardFilters(alert, scopedPlayerIds));
    const todayActivities = dashboard.today.activities.filter((activity) =>
      activityMatchesDashboardFilters(activity, scopeOnlyFilters, scopedPlayerIds)
    );
    const weekActivities = dashboard.week.activities.filter((activity) =>
      activityMatchesDashboardFilters(activity, scopeOnlyFilters, scopedPlayerIds)
    );

    return {
      players,
      alerts,
      todayActivities,
      weekActivities,
      metrics: getFilteredDashboardMetrics(scopedPlayers, todayActivities, weekActivities),
    };
  }, [dashboard, filters]);

  const metricCards = useMemo(() => {
    const metrics = filteredDashboard.metrics;
    if (!metrics || !dashboard) return [];
    return [
      { label: 'Players', value: String(metrics.totalPlayers), tone: colors.primary },
      { label: 'Alerts', value: String(filteredDashboard.alerts.length), tone: colors.error },
      { label: 'Open tasks', value: String(metrics.openTasks), tone: colors.warning },
      { label: 'Today', value: String(metrics.todayActivities), tone: colors.secondary },
      {
        label: 'Completion',
        value: metrics.taskCompletionRate == null ? '-' : `${metrics.taskCompletionRate}%`,
        tone: colors.success,
      },
      { label: 'Seats left', value: String(dashboard.seatStatus.playerSeats?.seatsAvailable ?? '-'), tone: colors.accent },
    ];
  }, [
    colors.accent,
    colors.error,
    colors.primary,
    colors.secondary,
    colors.success,
    colors.warning,
    dashboard,
    filteredDashboard.alerts.length,
    filteredDashboard.metrics,
  ]);

  const handleRefresh = useCallback(async () => {
    if (!canAccessCoachDashboard) return;
    setRefreshing(true);
    try {
      await loadContext();
      if (activeOwnerAccountId) {
        await loadDashboard(activeOwnerAccountId);
      }
    } finally {
      setRefreshing(false);
    }
  }, [activeOwnerAccountId, canAccessCoachDashboard, loadContext, loadDashboard]);

  const handleSaveFilters = useCallback(async () => {
    if (!activeOwnerAccountId) return;
    await AsyncStorage.setItem(filtersStorageKey(activeOwnerAccountId), JSON.stringify(filters));
    setSavedFilters(filters);
  }, [activeOwnerAccountId, filters]);

  const handleApplySavedFilters = useCallback(() => {
    if (savedFilters) {
      setFilters(savedFilters);
    }
  }, [savedFilters]);

  const handleClearFilters = useCallback(() => {
    setFilters(emptyFilters);
  }, []);

  const handleSelectScope = useCallback((scopeType: DashboardScopeType, scopeId: string | null) => {
    setFilters((current) => ({
      ...current,
      scopeType,
      scopeId,
      teamId: scopeType === 'team' ? null : current.teamId,
    }));
    setScopeSelectorVisible(false);
  }, []);

  const openPlayerCrm = useCallback(
    (playerId?: string) => {
      router.push({
        pathname: '/(tabs)/player-crm',
        params: {
          ...(activeOwnerAccountId ? { ownerAccountId: activeOwnerAccountId } : {}),
          ...(playerId ? { playerId, openAt: String(Date.now()) } : {}),
        },
      } as any);
    },
    [activeOwnerAccountId, router]
  );

  const openPlayerActivities = useCallback(
    (playerId: string) => {
      startAdminPlayer(playerId);
      router.push({
        pathname: '/(tabs)/(home)',
        params: {
          ...(activeOwnerAccountId ? { ownerAccountId: activeOwnerAccountId } : {}),
          playerId,
          openAt: String(Date.now()),
        },
      } as any);
    },
    [activeOwnerAccountId, router, startAdminPlayer]
  );

  const openActivities = useCallback(() => {
    exitAdmin();
    router.push({
      pathname: '/(tabs)/(home)',
      params: activeOwnerAccountId ? { ownerAccountId: activeOwnerAccountId } : {},
    } as any);
  }, [activeOwnerAccountId, exitAdmin, router]);

  const openProgress = useCallback(() => {
    exitAdmin();
    router.push('/(tabs)/performance' as any);
  }, [exitAdmin, router]);

  const openProfile = useCallback(() => {
    router.push('/(tabs)/profile' as any);
  }, [router]);

  const handleAlertPress = useCallback(
    (alert: OwnerCoachDashboardAlert) => {
      if (alert.type === 'no_plan') {
        openPlayerActivities(alert.playerId);
        return;
      }

      openPlayerCrm(alert.playerId);
    },
    [openPlayerActivities, openPlayerCrm]
  );

  const openPlayerProgress = useCallback(
    (playerId: string) => {
      startAdminPlayer(playerId);
      router.push('/(tabs)/performance' as any);
    },
    [router, startAdminPlayer]
  );

  const renderWorkspaceSwitch = () => {
    if (!context || context.workspaces.length <= 1) return null;
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.workspaceRow}
        testID="coachDashboard.workspaceSwitcher"
      >
        {context.workspaces.map((workspace: OwnerPlayerCrmWorkspace) => {
          const active = workspace.ownerAccountId === activeOwnerAccountId;
          return (
            <TouchableOpacity
              key={workspace.ownerAccountId}
              style={[
                styles.workspaceChip,
                {
                  borderColor: active ? colors.primary : colors.border,
                  backgroundColor: active ? colors.primary : colors.card,
                },
              ]}
              onPress={() => setActiveOwnerAccountId(workspace.ownerAccountId)}
            >
              <Text
                style={[styles.workspaceText, { color: active ? '#FFFFFF' : colors.text }]}
                numberOfLines={1}
              >
                {workspace.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  };

  const getFilterPickerTitle = (picker: DashboardFilterPicker | null): string => {
    if (picker === 'attention') return 'Attention';
    if (picker === 'status') return 'Status';
    if (picker === 'team') return 'Team';
    if (picker === 'tag') return 'Tags';
    if (picker === 'position') return 'Position';
    if (picker === 'level') return 'Level';
    return 'Filter';
  };

  const renderFilterPicker = () => {
    if (!dashboard || !filterPickerVisible) return null;

    const close = () => setFilterPickerVisible(null);
    const options =
      filterPickerVisible === 'attention'
        ? [
            {
              id: 'all',
              label: 'All players',
              detail: 'Show the full player list',
              active: !filters.alertOnly,
              onPress: () => {
                setFilters((current) => ({ ...current, alertOnly: false }));
                close();
              },
            },
            {
              id: 'alerts',
              label: 'Alerts only',
              detail: 'Players needing attention',
              active: filters.alertOnly,
              onPress: () => {
                setFilters((current) => ({ ...current, alertOnly: true }));
                close();
              },
            },
          ]
        : filterPickerVisible === 'status'
          ? [
              {
                id: 'all',
                label: 'All statuses',
                detail: 'No status filter',
                active: !filters.status,
                onPress: () => {
                  setFilters((current) => ({ ...current, status: null }));
                  close();
                },
              },
              ...dashboard.filters.statuses.map((status) => ({
                id: status.value,
                label: status.label,
                detail: 'CRM status',
                active: filters.status === status.value,
                onPress: () => {
                  setFilters((current) => ({ ...current, status: status.value }));
                  close();
                },
              })),
            ]
          : filterPickerVisible === 'team'
            ? [
                {
                  id: 'all',
                  label: 'All teams',
                  detail: 'No team filter',
                  active: !filters.teamId,
                  onPress: () => {
                    setFilters((current) => ({ ...current, teamId: null }));
                    close();
                  },
                },
                ...dashboard.filters.teams.map((team) => ({
                  id: team.id,
                  label: team.name,
                  detail: `${team.memberCount} players`,
                  active: filters.teamId === team.id,
                  onPress: () => {
                    setFilters((current) => ({ ...current, teamId: team.id }));
                    close();
                  },
                })),
              ]
            : filterPickerVisible === 'tag'
              ? [
                  {
                    id: 'all',
                    label: 'All tags',
                    detail: 'No tag filter',
                    active: !filters.tagId,
                    onPress: () => {
                      setFilters((current) => ({ ...current, tagId: null }));
                      close();
                    },
                  },
                  ...dashboard.filters.tags.map((tag) => ({
                    id: tag.id,
                    label: tag.name,
                    detail: 'Player tag',
                    active: filters.tagId === tag.id,
                    onPress: () => {
                      setFilters((current) => ({ ...current, tagId: tag.id }));
                      close();
                    },
                  })),
                ]
              : filterPickerVisible === 'position'
                ? [
                    {
                      id: 'all',
                      label: 'All positions',
                      detail: 'No position filter',
                      active: !filters.position,
                      onPress: () => {
                        setFilters((current) => ({ ...current, position: null }));
                        close();
                      },
                    },
                    ...dashboard.filters.positions.map((position) => ({
                      id: position,
                      label: position,
                      detail: 'Position',
                      active: filters.position === position,
                      onPress: () => {
                        setFilters((current) => ({ ...current, position }));
                        close();
                      },
                    })),
                  ]
                : [
                    {
                      id: 'all',
                      label: 'All levels',
                      detail: 'No level filter',
                      active: !filters.level,
                      onPress: () => {
                        setFilters((current) => ({ ...current, level: null }));
                        close();
                      },
                    },
                    ...dashboard.filters.levels.map((level) => ({
                      id: level,
                      label: level,
                      detail: 'Level',
                      active: filters.level === level,
                      onPress: () => {
                        setFilters((current) => ({ ...current, level }));
                        close();
                      },
                    })),
                  ];

    return (
      <Modal visible transparent animationType="fade" onRequestClose={close}>
        <View style={styles.modalRoot}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={close}
            accessibilityLabel="Close player filter"
          />
          <View style={[styles.scopeSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.scopeSheetHeader}>
              <View>
                <Text style={[styles.scopeSheetTitle, { color: colors.text }]}>{getFilterPickerTitle(filterPickerVisible)}</Text>
                <Text style={[styles.scopeSheetSubtitle, { color: colors.textSecondary }]}>
                  Choose how the player list should be filtered.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.scopeCloseButton, { borderColor: colors.border }]}
                onPress={close}
                accessibilityLabel="Close player filter"
              >
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scopeSheetList} showsVerticalScrollIndicator={false}>
              {options.map((option) => (
                <DropdownOption
                  key={option.id}
                  label={option.label}
                  detail={option.detail}
                  active={option.active}
                  onPress={option.onPress}
                  colors={colors}
                />
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const renderPlayerFilters = () => {
    if (!dashboard) return null;
    const statusValue = filters.status
      ? dashboard.filters.statuses.find((status) => status.value === filters.status)?.label ?? statusLabel(filters.status)
      : 'All statuses';
    const teamValue = filters.teamId
      ? dashboard.filters.teams.find((team) => team.id === filters.teamId)?.name ?? 'Selected team'
      : 'All teams';
    const tagValue = filters.tagId
      ? dashboard.filters.tags.find((tag) => tag.id === filters.tagId)?.name ?? 'Selected tag'
      : 'All tags';
    const positionValue = filters.position ?? 'All positions';
    const levelValue = filters.level ?? 'All levels';
    const activeCount = countActivePlayerFilters(filters);

    return (
      <View style={styles.filterBlock} testID="coachDashboard.playerFilters">
        <View style={styles.playerFilterHeader}>
          <View style={styles.playerFilterTitleBlock}>
            <Text style={[styles.playerFilterTitle, { color: colors.text }]}>Player filters</Text>
            <Text style={[styles.playerFilterSubtitle, { color: colors.textSecondary }]}>
              Use the filters below.
            </Text>
          </View>
          <View style={[styles.playerFilterCountBadge, { borderColor: activeCount ? colors.primary : colors.border }]}>
            <Text style={[styles.playerFilterCountText, { color: activeCount ? colors.primary : colors.textSecondary }]}>
              {activeCount}
            </Text>
          </View>
        </View>

        <View style={styles.filterSelectGrid}>
          <FilterSelectButton
            label="Attention"
            value={filters.alertOnly ? 'Alerts only' : 'All players'}
            icon="bell.fill"
            materialIcon="notifications"
            active={filters.alertOnly}
            onPress={() => setFilterPickerVisible('attention')}
            colors={colors}
            testID="coachDashboard.playerFilters.attention"
          />
          <FilterSelectButton
            label="Status"
            value={statusValue}
            icon="checkmark.circle.fill"
            materialIcon="check_circle"
            active={Boolean(filters.status)}
            onPress={() => setFilterPickerVisible('status')}
            colors={colors}
            testID="coachDashboard.playerFilters.status"
          />
          <FilterSelectButton
            label="Team"
            value={teamValue}
            icon="person.3.fill"
            materialIcon="groups"
            active={Boolean(filters.teamId)}
            onPress={() => setFilterPickerVisible('team')}
            colors={colors}
            testID="coachDashboard.playerFilters.team"
          />
          <FilterSelectButton
            label="Tag"
            value={tagValue}
            icon="tag.fill"
            materialIcon="sell"
            active={Boolean(filters.tagId)}
            onPress={() => setFilterPickerVisible('tag')}
            colors={colors}
            testID="coachDashboard.playerFilters.tag"
          />
          <FilterSelectButton
            label="Position"
            value={positionValue}
            icon="figure.soccer"
            materialIcon="sports_soccer"
            active={Boolean(filters.position)}
            onPress={() => setFilterPickerVisible('position')}
            colors={colors}
            testID="coachDashboard.playerFilters.position"
          />
          <FilterSelectButton
            label="Level"
            value={levelValue}
            icon="chart.line.uptrend.xyaxis"
            materialIcon="trending_up"
            active={Boolean(filters.level)}
            onPress={() => setFilterPickerVisible('level')}
            colors={colors}
            testID="coachDashboard.playerFilters.level"
          />
        </View>

        <View style={styles.filterActions}>
          {savedFilters ? (
            <TouchableOpacity
              style={[styles.smallActionButton, { borderColor: colors.border }]}
              onPress={handleApplySavedFilters}
            >
              <IconSymbol ios_icon_name="arrow.down.doc.fill" android_material_icon_name="file_download" size={16} color={colors.text} />
              <Text style={[styles.smallActionText, { color: colors.text }]}>Hent</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.smallActionButton, { borderColor: colors.border, opacity: hasActiveFilters(filters) ? 1 : 0.48 }]}
            onPress={handleSaveFilters}
            disabled={!hasActiveFilters(filters)}
          >
            <IconSymbol ios_icon_name="tray.and.arrow.down.fill" android_material_icon_name="save" size={16} color={colors.text} />
            <Text style={[styles.smallActionText, { color: colors.text }]}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.smallActionButton, { borderColor: colors.border, opacity: hasActiveFilters(filters) ? 1 : 0.48 }]}
            onPress={handleClearFilters}
            disabled={!hasActiveFilters(filters)}
          >
            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={16} color={colors.text} />
            <Text style={[styles.smallActionText, { color: colors.text }]}>Ryd</Text>
          </TouchableOpacity>
        </View>
        {renderFilterPicker()}
      </View>
    );
  };

  const renderScopeSelector = () => {
    if (!dashboard) return null;

    const scopeActive = filters.scopeType !== 'all' && Boolean(filters.scopeId);

    return (
      <>
        <View style={styles.scopeFilterBlock} testID="coachDashboard.scopeFilter">
          <TouchableOpacity
            style={[
              styles.scopeFilterButton,
              {
                backgroundColor: colors.card,
                borderColor: scopeActive ? colors.success : colors.border,
                shadowColor: scopeActive ? colors.success : '#000000',
              },
            ]}
            onPress={() => setScopeSelectorVisible(true)}
            activeOpacity={0.86}
            testID="coachDashboard.scopeFilter.toggle"
          >
            <View
              style={[
                styles.scopeFilterIcon,
                {
                  backgroundColor: scopeActive ? `${colors.success}18` : colors.background,
                  borderColor: scopeActive ? colors.success : colors.border,
                },
              ]}
            >
              <IconSymbol
                ios_icon_name="line.3.horizontal.decrease.circle"
                android_material_icon_name="filter_list"
                size={18}
                color={scopeActive ? colors.success : colors.textSecondary}
              />
            </View>
            <View style={styles.scopeFilterTextBlock}>
              <Text style={[styles.scopeFilterKicker, { color: colors.textSecondary }]} numberOfLines={1}>
                {getDashboardScopeKicker(filters)}
              </Text>
              <Text style={[styles.scopeFilterLabel, { color: colors.text }]} numberOfLines={1}>
                {getDashboardScopeLabel(dashboard, filters)}
              </Text>
            </View>
            <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Modal
          visible={scopeSelectorVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setScopeSelectorVisible(false)}
        >
          <View style={styles.modalRoot}>
            <TouchableOpacity
              style={StyleSheet.absoluteFillObject}
              activeOpacity={1}
              onPress={() => setScopeSelectorVisible(false)}
              accessibilityLabel="Close dashboard scope filter"
            />
            <View style={[styles.scopeSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.scopeSheetHeader}>
                <View>
                  <Text style={[styles.scopeSheetTitle, { color: colors.text }]}>Show dashboard for</Text>
                  <Text style={[styles.scopeSheetSubtitle, { color: colors.textSecondary }]}>
                    Choose all players, one team or one player.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.scopeCloseButton, { borderColor: colors.border }]}
                  onPress={() => setScopeSelectorVisible(false)}
                  accessibilityLabel="Close dashboard scope filter"
                >
                  <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={18} color={colors.text} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.scopeSheetList} showsVerticalScrollIndicator={false}>
                <ScopeOption
                  label="All players"
                  detail="Whole workspace"
                  active={filters.scopeType === 'all' || !filters.scopeId}
                  icon="rectangle.3.group"
                  materialIcon="dashboard"
                  onPress={() => handleSelectScope('all', null)}
                  colors={colors}
                />

                {dashboard.filters.teams.length ? (
                  <View style={styles.scopeOptionGroup}>
                    <Text style={[styles.scopeGroupLabel, { color: colors.textSecondary }]}>Teams</Text>
                    {dashboard.filters.teams.map((team) => (
                      <ScopeOption
                        key={team.id}
                        label={team.name}
                        detail={`${team.memberCount} players`}
                        active={filters.scopeType === 'team' && filters.scopeId === team.id}
                        icon="person.3.fill"
                        materialIcon="groups"
                        onPress={() => handleSelectScope('team', team.id)}
                        colors={colors}
                      />
                    ))}
                  </View>
                ) : null}

                {dashboard.players.length ? (
                  <View style={styles.scopeOptionGroup}>
                    <Text style={[styles.scopeGroupLabel, { color: colors.textSecondary }]}>Players</Text>
                    {dashboard.players.map((player) => (
                      <ScopeOption
                        key={player.playerId}
                        label={player.displayName}
                        detail={player.teams[0]?.name ?? player.primaryPosition ?? statusLabel(player.crmStatus)}
                        active={filters.scopeType === 'player' && filters.scopeId === player.playerId}
                        icon="person.fill"
                        materialIcon="person"
                        onPress={() => handleSelectScope('player', player.playerId)}
                        colors={colors}
                      />
                    ))}
                  </View>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>
      </>
    );
  };

  if (roleLoading || loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!canAccessCoachDashboard) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={30} color={colors.textSecondary} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>Coach access required</Text>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 16) + 10 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        testID="coachDashboard.screen"
      >
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.title, { color: colors.text }]}>Overview</Text>
            <View style={styles.headerActions}>
              {dashboardLoading ? <ActivityIndicator color={colors.primary} size="small" /> : null}
              <TouchableOpacity
                style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.card }]}
                onPress={openProfile}
                activeOpacity={0.84}
                accessibilityLabel="Open profile and settings"
                testID="coachDashboard.profileButton"
              >
                <IconSymbol ios_icon_name="person.crop.circle" android_material_icon_name="account_circle" size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
          </View>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
            {activeWorkspace?.name ?? dashboard?.ownerAccount.name ?? 'Owner workspace'}
          </Text>
        </View>

        {renderWorkspaceSwitch()}

        {error ? (
          <View style={[styles.notice, { borderColor: colors.error, backgroundColor: colors.card }]}>
            <Text style={[styles.noticeTitle, { color: colors.error }]}>Could not load dashboard</Text>
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>{error}</Text>
          </View>
        ) : null}

        {!dashboard && !error ? (
          <View style={[styles.notice, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>No owner dashboard data yet.</Text>
          </View>
        ) : null}

        {dashboard ? (
          <>
            {renderScopeSelector()}

            <View style={styles.shortcutGrid} testID="coachDashboard.shortcuts">
              <ShortcutButton
                label="Activities"
                icon="calendar"
                materialIcon="event"
                colors={colors}
                onPress={openActivities}
                testID="coachDashboard.shortcut.activities"
              />
              <ShortcutButton
                label="Progress"
                icon="chart.bar.fill"
                materialIcon="bar_chart"
                colors={colors}
                onPress={openProgress}
                testID="coachDashboard.shortcut.progress"
              />
            </View>

            <View style={styles.metricGrid}>
              {metricCards.map((metric) => (
                <View key={metric.label} style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[styles.metricValue, { color: metric.tone }]} numberOfLines={1} adjustsFontSizeToFit>
                    {metric.value}
                  </Text>
                  <Text style={[styles.metricLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                    {metric.label}
                  </Text>
                </View>
              ))}
            </View>

            <SectionTitle title="Alerts" count={filteredDashboard.alerts.length} colors={colors} />
            {filteredDashboard.alerts.length ? (
              <View style={styles.sectionStack}>
                {filteredDashboard.alerts.slice(0, 8).map((alert) => (
                  <TouchableOpacity
                    key={alert.id}
                    style={[styles.alertRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => handleAlertPress(alert)}
                    testID={`coachDashboard.alert.${alert.type}`}
                  >
                    <View style={[styles.alertStripe, { backgroundColor: severityColor(alert.severity, colors) }]} />
                    <View style={styles.alertBody}>
                      <Text style={[styles.alertTitle, { color: colors.text }]} numberOfLines={1}>
                        {alert.title}
                      </Text>
                      <Text style={[styles.alertSubtitle, { color: colors.textSecondary }]} numberOfLines={2}>
                        {alert.subtitle}
                      </Text>
                    </View>
                    <IconSymbol ios_icon_name="chevron.right" android_material_icon_name="chevron_right" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <EmptyInline text="No players need attention right now." colors={colors} />
            )}

            <SectionTitle title="Today" count={filteredDashboard.todayActivities.length} colors={colors} />
            <ActivityList activities={filteredDashboard.todayActivities.slice(0, 6)} colors={colors} />

            <SectionTitle title="This Week" count={filteredDashboard.weekActivities.length} colors={colors} />
            <ActivityList activities={filteredDashboard.weekActivities.slice(0, 8)} colors={colors} />

            {renderPlayerFilters()}

            <SectionTitle title="Players" count={filteredDashboard.players.length} colors={colors} />
            {filteredDashboard.players.length ? (
              <View style={styles.sectionStack}>
                {filteredDashboard.players.map((player) => (
                  <PlayerCard
                    key={player.playerId}
                    player={player}
                    colors={colors}
                    onOpenCrm={() => openPlayerCrm(player.playerId)}
                    onOpenActivities={() => openPlayerActivities(player.playerId)}
                    onOpenProgress={() => openPlayerProgress(player.playerId)}
                  />
                ))}
              </View>
            ) : (
              <EmptyInline text="No players match the selected filters." colors={colors} />
            )}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title, count, colors }: { title: string; count: number; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>{count}</Text>
    </View>
  );
}

function FilterSelectButton({
  label,
  value,
  icon,
  materialIcon,
  active,
  onPress,
  colors,
  testID,
}: {
  label: string;
  value: string;
  icon: string;
  materialIcon: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.filterSelectButton,
        {
          backgroundColor: active ? `${colors.primary}12` : colors.card,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.84}
      testID={testID}
    >
      <View style={[styles.filterSelectIcon, { backgroundColor: active ? `${colors.primary}18` : colors.background, borderColor: active ? colors.primary : colors.border }]}>
        <IconSymbol ios_icon_name={icon as any} android_material_icon_name={materialIcon as any} size={17} color={active ? colors.primary : colors.textSecondary} />
      </View>
      <View style={styles.filterSelectTextBlock}>
        <Text style={[styles.filterSelectLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.filterSelectValue, { color: colors.text }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="expand_more" size={16} color={colors.textSecondary} />
    </TouchableOpacity>
  );
}

function DropdownOption({
  label,
  detail,
  active,
  onPress,
  colors,
}: {
  label: string;
  detail: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.dropdownOption,
        {
          backgroundColor: active ? `${colors.primary}12` : colors.background,
          borderColor: active ? colors.primary : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View style={styles.dropdownOptionTextBlock}>
        <Text style={[styles.dropdownOptionLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.dropdownOptionDetail, { color: colors.textSecondary }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {active ? (
        <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={19} color={colors.primary} />
      ) : null}
    </TouchableOpacity>
  );
}

function ScopeOption({
  label,
  detail,
  active,
  icon,
  materialIcon,
  onPress,
  colors,
}: {
  label: string;
  detail: string;
  active: boolean;
  icon: string;
  materialIcon: string;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.scopeOptionButton,
        {
          backgroundColor: active ? `${colors.success}12` : colors.background,
          borderColor: active ? colors.success : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.86}
    >
      <View
        style={[
          styles.scopeOptionIcon,
          {
            backgroundColor: active ? `${colors.success}18` : colors.card,
            borderColor: active ? colors.success : colors.border,
          },
        ]}
      >
        <IconSymbol
          ios_icon_name={icon as any}
          android_material_icon_name={materialIcon as any}
          size={18}
          color={active ? colors.success : colors.textSecondary}
        />
      </View>
      <View style={styles.scopeOptionTextBlock}>
        <Text style={[styles.scopeOptionLabel, { color: colors.text }]} numberOfLines={1}>
          {label}
        </Text>
        <Text style={[styles.scopeOptionDetail, { color: colors.textSecondary }]} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      {active ? (
        <IconSymbol ios_icon_name="checkmark.circle.fill" android_material_icon_name="check_circle" size={19} color={colors.success} />
      ) : null}
    </TouchableOpacity>
  );
}

function EmptyInline({ text, colors }: { text: string; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={[styles.emptyInline, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.emptyInlineText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function ShortcutButton({
  label,
  icon,
  materialIcon,
  colors,
  onPress,
  testID,
}: {
  label: string;
  icon: string;
  materialIcon: string;
  colors: ReturnType<typeof getColors>;
  onPress: () => void;
  testID: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.shortcutButton, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.84}
      testID={testID}
    >
      <View style={[styles.shortcutIcon, { backgroundColor: `${colors.primary}14`, borderColor: `${colors.primary}33` }]}>
        <IconSymbol ios_icon_name={icon as any} android_material_icon_name={materialIcon as any} size={18} color={colors.primary} />
      </View>
      <Text style={[styles.shortcutLabel, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function ActivityList({
  activities,
  colors,
}: {
  activities: OwnerCoachDashboardActivity[];
  colors: ReturnType<typeof getColors>;
}) {
  if (!activities.length) {
    return <EmptyInline text="No activities in this window." colors={colors} />;
  }

  return (
    <View style={styles.sectionStack}>
      {activities.map((activity) => (
        <View key={activity.id} style={[styles.activityRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.activityIcon}>
            <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={19} color={colors.primary} />
          </View>
          <View style={styles.activityBody}>
            <Text style={[styles.activityTitle, { color: colors.text }]} numberOfLines={1}>
              {activity.title}
            </Text>
            <Text style={[styles.activityMeta, { color: colors.textSecondary }]} numberOfLines={1}>
              {formatActivityTime(activity)}
              {activity.teamName ? ` · ${activity.teamName}` : ''}
              {activity.playerCount > 1 ? ` · ${activity.playerCount} players` : ''}
            </Text>
          </View>
          <View style={styles.taskPill}>
            <Text style={[styles.taskPillText, { color: activity.openTasks ? colors.warning : colors.success }]}>
              {activity.openTasks}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PlayerCard({
  player,
  colors,
  onOpenCrm,
  onOpenActivities,
  onOpenProgress,
}: {
  player: OwnerCoachDashboardPlayer;
  colors: ReturnType<typeof getColors>;
  onOpenCrm: () => void;
  onOpenActivities: () => void;
  onOpenProgress: () => void;
}) {
  const primaryAlert = player.alertTypes[0] ? statusLabel(player.alertTypes[0]) : 'On track';
  const alertTone = player.alertTypes.length ? colors.warning : colors.success;

  return (
    <View style={[styles.playerCard, { backgroundColor: colors.card, borderColor: colors.border }]} testID="coachDashboard.playerCard">
      <TouchableOpacity style={styles.playerHeader} onPress={onOpenCrm} activeOpacity={0.84}>
        <View style={styles.playerNameBlock}>
          <Text style={[styles.playerName, { color: colors.text }]} numberOfLines={1}>
            {player.displayName}
          </Text>
          <Text style={[styles.playerMeta, { color: colors.textSecondary }]} numberOfLines={1}>
            {player.primaryPosition ?? 'No position'} · {statusLabel(player.crmStatus)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { borderColor: alertTone }]}>
          <Text style={[styles.statusBadgeText, { color: alertTone }]} numberOfLines={1}>
            {primaryAlert}
          </Text>
        </View>
      </TouchableOpacity>

      <View style={styles.playerStats}>
        <StatPill label="Open" value={String(player.openTasks)} colors={colors} />
        <StatPill label="Week" value={String(player.weekActivitiesCount)} colors={colors} />
        <StatPill label="Feedback" value={String(player.recentFeedbackCount)} colors={colors} />
      </View>

      <Text style={[styles.playerTimeline, { color: colors.textSecondary }]} numberOfLines={2}>
        Last: {formatCompactDateTime(player.lastActivityAt)} · Next: {formatCompactDateTime(player.nextActivityAt)}
      </Text>

      <View style={styles.playerActions}>
        <IconAction icon="calendar" materialIcon="event" label="Activities" onPress={onOpenActivities} colors={colors} />
        <IconAction icon="chart.bar.fill" materialIcon="bar_chart" label="Progress" onPress={onOpenProgress} colors={colors} />
      </View>
    </View>
  );
}

function StatPill({ label, value, colors }: { label: string; value: string; colors: ReturnType<typeof getColors> }) {
  return (
    <View style={[styles.statPill, { borderColor: colors.border }]}>
      <Text style={[styles.statPillValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.statPillLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
}

function IconAction({
  icon,
  materialIcon,
  label,
  onPress,
  colors,
}: {
  icon: string;
  materialIcon: string;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof getColors>;
}) {
  return (
    <TouchableOpacity style={[styles.iconAction, { borderColor: colors.border }]} onPress={onPress}>
      <IconSymbol ios_icon_name={icon as any} android_material_icon_name={materialIcon as any} size={17} color={colors.primary} />
      <Text style={[styles.iconActionText, { color: colors.text }]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 132,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    marginBottom: 14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 38,
    columnGap: 12,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  headerIconButton: {
    width: 38,
    height: 38,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: 0,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  workspaceRow: {
    paddingBottom: 14,
    columnGap: 8,
  },
  workspaceChip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: 210,
  },
  workspaceText: {
    fontSize: 13,
    fontWeight: '700',
  },
  notice: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  noticeText: {
    fontSize: 14,
    lineHeight: 20,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
    marginBottom: 14,
  },
  metricCard: {
    width: '31.6%',
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'center',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  shortcutGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
    marginBottom: 14,
  },
  shortcutButton: {
    width: '48.8%',
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  shortcutIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '900',
  },
  filterBlock: {
    marginTop: 8,
    marginBottom: 12,
  },
  playerFilterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 10,
    marginBottom: 10,
  },
  playerFilterTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  playerFilterTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  playerFilterSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  playerFilterCountBadge: {
    minWidth: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  playerFilterCountText: {
    fontSize: 12,
    fontWeight: '900',
  },
  filterSelectGrid: {
    rowGap: 8,
  },
  filterSelectButton: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 9,
  },
  filterSelectIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSelectTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  filterSelectLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  filterSelectValue: {
    fontSize: 14,
    fontWeight: '900',
    marginTop: 2,
  },
  dropdownOption: {
    minHeight: 54,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    marginBottom: 7,
  },
  dropdownOptionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  dropdownOptionLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  dropdownOptionDetail: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  filterActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 8,
    rowGap: 8,
    marginTop: 10,
  },
  scopeFilterBlock: {
    marginBottom: 14,
  },
  scopeFilterButton: {
    minHeight: 58,
    borderWidth: 1.5,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  scopeFilterIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeFilterTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  scopeFilterKicker: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  scopeFilterLabel: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.34)',
    padding: 16,
  },
  scopeSheet: {
    maxHeight: '78%',
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
  },
  scopeSheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    columnGap: 12,
    marginBottom: 12,
  },
  scopeSheetTitle: {
    fontSize: 18,
    fontWeight: '900',
  },
  scopeSheetSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  scopeCloseButton: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeSheetList: {
    marginHorizontal: -2,
  },
  scopeOptionGroup: {
    marginTop: 12,
  },
  scopeGroupLabel: {
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0,
    marginBottom: 7,
    paddingHorizontal: 2,
  },
  scopeOptionButton: {
    minHeight: 56,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    marginBottom: 7,
  },
  scopeOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scopeOptionTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  scopeOptionLabel: {
    fontSize: 14,
    fontWeight: '900',
  },
  scopeOptionDetail: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  smallActionButton: {
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  smallActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionCount: {
    fontSize: 13,
    fontWeight: '800',
  },
  sectionStack: {
    rowGap: 8,
    marginBottom: 14,
  },
  alertRow: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    overflow: 'hidden',
    alignItems: 'center',
  },
  alertStripe: {
    width: 5,
    alignSelf: 'stretch',
  },
  alertBody: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  alertTitle: {
    fontSize: 15,
    fontWeight: '900',
  },
  alertSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 3,
    lineHeight: 18,
  },
  activityRow: {
    minHeight: 66,
    borderWidth: 1,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  activityIcon: {
    width: 32,
    alignItems: 'center',
  },
  activityBody: {
    flex: 1,
    paddingHorizontal: 8,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: '900',
  },
  activityMeta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  taskPill: {
    width: 34,
    alignItems: 'center',
  },
  taskPillText: {
    fontSize: 15,
    fontWeight: '900',
  },
  emptyInline: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
  },
  emptyInlineText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 12,
  },
  playerCard: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 10,
  },
  playerNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    fontSize: 16,
    fontWeight: '900',
  },
  playerMeta: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 128,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
  },
  playerStats: {
    flexDirection: 'row',
    columnGap: 8,
    marginTop: 10,
  },
  statPill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statPillValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  playerTimeline: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 17,
  },
  playerActions: {
    flexDirection: 'row',
    columnGap: 8,
    marginTop: 11,
  },
  iconAction: {
    flex: 1,
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    columnGap: 5,
    paddingHorizontal: 4,
  },
  iconActionText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
