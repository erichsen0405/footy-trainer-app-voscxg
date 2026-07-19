import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { getWeek } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';

import ActivityCard from '@/components/ActivityCard';
import { IconSymbol } from '@/components/IconSymbol';
import { ProgressionSection } from '@/components/ProgressionSection';
import { TrainerScopeFilter } from '@/components/TrainerScopeFilter';
import { WeeklySummaryCard } from '@/components/WeeklySummaryCard';
import { PlayerProgramProgressCard } from '@/components/playerPrograms/PlayerProgramExperience';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { useFootball } from '@/contexts/FootballContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { useHomeActivities } from '@/hooks/useHomeActivities';
import { useUserRole } from '@/hooks/useUserRole';
import { fetchSelfFeedbackForActivities } from '@/services/feedbackService';
import * as CommonStyles from '@/styles/commonStyles';
import type { ActivityCategory, TaskTemplateSelfFeedback } from '@/types';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import {
  buildPerformanceHistoryWeeks,
  resolvePerformanceHistoryActivityCategoryId,
  type PerformanceHistoryWeek,
} from '@/utils/performanceHistory';
import { appendVirtualScoredTasksForActivityCandidates } from '@/utils/virtualFeedbackTasks';

type HistoryListItem =
  | { type: 'weekCard'; key: string; week: PerformanceHistoryWeek }
  | { type: 'activity'; key: string; weekKey: string; activity: any };

type HistoryCategoryOption = Pick<ActivityCategory, 'id' | 'name' | 'color' | 'emoji'>;

type SavedHistoryCategoryFilter = {
  id: string;
  name: string;
  categoryIds: string[];
  createdAt: string;
  updatedAt: string;
};

const HISTORY_FILTER_STORAGE_KEY = '@performance_history_category_filters_v1';

function buildHistoryActivityKey(activity: any, weekKey: string, index: number): string {
  const rawId = activity?.id ?? activity?.activity_id ?? activity?.activityId;
  const normalizedId = rawId !== null && rawId !== undefined ? String(rawId).trim() : '';
  if (normalizedId.length > 0) {
    return `history:activity:${weekKey}:${normalizedId}`;
  }

  const dateKey =
    activity?.__resolvedDateTime instanceof Date && !Number.isNaN(activity.__resolvedDateTime.getTime())
      ? activity.__resolvedDateTime.toISOString()
      : 'unknown-date';

  return `history:activity:fallback:${weekKey}:${dateKey}:${index}`;
}

function sanitizeTestIdSegment(value: string): string {
  return String(value).replace(/[^A-Za-z0-9_-]/g, '_');
}

function normalizeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeIdList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => (value === null || value === undefined ? '' : String(value).trim()))
        .filter((value) => value.length > 0)
    )
  );
}

function isUuidString(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isExternalActivity(activity: any): boolean {
  return Boolean(activity?.is_external ?? activity?.isExternal);
}

function getFeedbackActivityIdCandidatesForActivity(activity: any): string[] {
  if (!activity) return [];
  const candidates: string[] = [];
  const push = (value: unknown) => {
    const normalized = normalizeId(value);
    if (!normalized || !isUuidString(normalized)) return;
    if (!candidates.includes(normalized)) candidates.push(normalized);
  };

  if (isExternalActivity(activity)) {
    push(activity?.id ?? activity?.activity_id);
    push(activity?.externalEventRowId ?? activity?.external_event_row_id);
    push(activity?.externalEventId ?? activity?.external_event_id);
    return candidates;
  }

  push(activity?.activity_id ?? activity?.activityId);
  push(activity?.id);
  return candidates;
}

function safeDateMs(value: unknown): number {
  const ms = new Date(String(value ?? '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function isFeedbackAnswered(feedback?: TaskTemplateSelfFeedback): boolean {
  if (!feedback) return false;
  const hasScore = typeof feedback.rating === 'number';
  const hasNote = (feedback.note?.trim() ?? '').length > 0;
  return hasScore || hasNote;
}

function normalizeFeedbackTitle(value?: string | null): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isFeedbackTitle(value?: string | null): boolean {
  const normalized = normalizeFeedbackTitle(value);
  return normalized.startsWith('feedback pa') || normalized.startsWith('feedback on');
}

function getHistoryFeedbackTemplateId(task: any): string | null {
  return (
    normalizeId(task?.feedbackTemplateId ?? task?.feedback_template_id) ??
    normalizeId(parseTemplateIdFromMarker(typeof task?.description === 'string' ? task.description : '')) ??
    normalizeId(parseTemplateIdFromMarker(typeof task?.title === 'string' ? task.title : '')) ??
    (isFeedbackTitle(task?.title)
      ? normalizeId(task?.taskTemplateId ?? task?.task_template_id)
      : null)
  );
}

function isHistoryFeedbackTask(task: any): boolean {
  return (
    !!getHistoryFeedbackTemplateId(task) ||
    task?.isFeedbackTask === true ||
    task?.is_feedback_task === true ||
    isFeedbackTitle(task?.title)
  );
}

function areIdListsEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((value) => bSet.has(value));
}

function getCategoryFromActivity(activity: any): Partial<HistoryCategoryOption> | null {
  const raw =
    activity?.category ??
    activity?.activity_category ??
    activity?.activity_categories ??
    null;
  return raw && typeof raw === 'object' ? raw : null;
}

function buildHistoryCategoryOptions(
  categories: ActivityCategory[] | null | undefined,
  activities: any[] | null | undefined,
): HistoryCategoryOption[] {
  const byId = new Map<string, HistoryCategoryOption>();

  const addOption = (candidate: Partial<HistoryCategoryOption> | null | undefined, fallbackId?: string | null) => {
    const id = String(candidate?.id ?? fallbackId ?? '').trim();
    if (!id || byId.has(id)) return;

    const name = String(candidate?.name ?? '').trim() || 'Unknown category';
    byId.set(id, {
      id,
      name,
      color: String(candidate?.color ?? '').trim() || '#4CAF50',
      emoji: String(candidate?.emoji ?? '').trim(),
    });
  };

  (categories || []).forEach((category) => addOption(category));
  (activities || []).forEach((activity) => {
    addOption(getCategoryFromActivity(activity), resolvePerformanceHistoryActivityCategoryId(activity));
  });

  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function sanitizeSavedHistoryFilters(raw: unknown): SavedHistoryCategoryFilter[] {
  const rawItems = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  if (!rawItems.length) return [];

  return rawItems
    .map((filter, index) => {
      if (!filter || typeof filter !== 'object') return null;
      const item = filter as Record<string, unknown>;
      const name = String(item.name ?? '').trim();
      const categoryIds = normalizeIdList(item.categoryIds);
      if (!name || categoryIds.length === 0) return null;

      const nowIso = new Date().toISOString();
      return {
        id: String(item.id ?? `saved-filter-${index}`).trim() || `saved-filter-${index}`,
        name,
        categoryIds,
        createdAt: String(item.createdAt ?? nowIso),
        updatedAt: String(item.updatedAt ?? item.createdAt ?? nowIso),
      };
    })
    .filter((filter): filter is SavedHistoryCategoryFilter => filter !== null);
}

export default function PerformanceScreen() {
  const { adminMode, adminTargetId, adminTargetType } = useAdmin();
  const { user } = useAuthSession();
  const {
    trophies,
    externalCalendars,
    fetchExternalCalendarEvents,
    categories,
    hasPerformanceDataLoaded,
    ensurePerformanceDataLoaded,
  } = useFootball();
  const {
    activities,
    loading: homeActivitiesLoading,
    hasLoadedFullWindow: hasLoadedFullHistoryWindow,
    loadFullWindow,
  } = useHomeActivities();
  const { userRole } = useUserRole();
  const {
    players,
    teams,
    ensureRosterLoaded,
    getTeamMembers,
  } = useTeamPlayer();

  const colorScheme = useColorScheme();
  const [refreshing, setRefreshing] = useState(false);
  const [isBootstrappingPerformanceData, setIsBootstrappingPerformanceData] = useState(false);
  const [isBootstrappingHistoryData, setIsBootstrappingHistoryData] = useState(false);
  const [selectedTeamPlayerIds, setSelectedTeamPlayerIds] = useState<string[]>([]);
  const [isSelectedTeamMembersLoading, setIsSelectedTeamMembersLoading] = useState(false);
  const [expandedTrophy, setExpandedTrophy] = useState<'gold' | 'silver' | 'bronze' | null>(null);
  const [expandedHistoryWeeks, setExpandedHistoryWeeks] = useState<Record<string, boolean>>({});
  const [isTrophySectionExpanded, setIsTrophySectionExpanded] = useState(false);
  const [isProgressionSectionExpanded, setIsProgressionSectionExpanded] = useState(false);
  const [isHistorySectionExpanded, setIsHistorySectionExpanded] = useState(false);
  const [isHistoryFilterModalOpen, setIsHistoryFilterModalOpen] = useState(false);
  const [selectedHistoryCategoryIds, setSelectedHistoryCategoryIds] = useState<string[]>([]);
  const [historyFilterDraftCategoryIds, setHistoryFilterDraftCategoryIds] = useState<string[]>([]);
  const [savedHistoryCategoryFilters, setSavedHistoryCategoryFilters] = useState<SavedHistoryCategoryFilter[]>([]);
  const [activeHistoryFilterName, setActiveHistoryFilterName] = useState<string | null>(null);
  const [historyFilterNameInput, setHistoryFilterNameInput] = useState('');
  const [historyFilterSaveError, setHistoryFilterSaveError] = useState<string | null>(null);
  const [historySelfFeedbackRows, setHistorySelfFeedbackRows] = useState<TaskTemplateSelfFeedback[]>([]);
  const isTrainerProfile = userRole === 'trainer';

  const palette = useMemo(() => {
    const fromHelper =
      typeof CommonStyles.getColors === 'function'
        ? CommonStyles.getColors(colorScheme as any)
        : undefined;
    const base = (fromHelper || (CommonStyles as any).colors || {}) as Record<string, string>;
    return {
      primary: base.primary ?? '#4CAF50',
      secondary: base.secondary ?? '#2196F3',
      accent: base.accent ?? '#FF9800',
      background: base.background ?? '#FFFFFF',
      card: base.card ?? '#F5F5F5',
      text: base.text ?? '#333333',
      textSecondary: base.textSecondary ?? '#666666',
      gold: base.gold ?? '#FFD700',
      silver: base.silver ?? '#C0C0C0',
      bronze: base.bronze ?? '#CD7F32',
    };
  }, [colorScheme]);

  const isDark = colorScheme === 'dark';
  const bgColor = isDark ? '#1a1a1a' : palette.background;
  const textColor = isDark ? '#e3e3e3' : palette.text;
  const textSecondaryColor = isDark ? '#999' : palette.textSecondary;
  const showTrophyLoadingState = !hasPerformanceDataLoaded || isBootstrappingPerformanceData;
  const isPlayerPerformanceScope = isTrainerProfile && adminMode === 'player' && adminTargetType === 'player' && Boolean(adminTargetId);
  const isTeamPerformanceScope = isTrainerProfile && adminMode === 'team' && adminTargetType === 'team' && Boolean(adminTargetId);
  const selectedPerformancePlayer = useMemo(() => {
    if (!isPlayerPerformanceScope || !adminTargetId) {
      return null;
    }
    return players.find((player) => player.id === adminTargetId) ?? null;
  }, [adminTargetId, isPlayerPerformanceScope, players]);
  const selectedPerformanceTeam = useMemo(() => {
    if (!isTeamPerformanceScope || !adminTargetId) {
      return null;
    }
    return teams.find((team) => team.id === adminTargetId) ?? null;
  }, [adminTargetId, isTeamPerformanceScope, teams]);
  const selectedPerformancePlayerId = isPlayerPerformanceScope ? adminTargetId : null;
  const selectedPerformanceScopeLabel =
    selectedPerformancePlayer?.full_name ??
    selectedPerformanceTeam?.name ??
    (isPlayerPerformanceScope ? 'Selected player' : isTeamPerformanceScope ? 'Selected team' : null);
  const progressionTargetUserIds = isTeamPerformanceScope ? selectedTeamPlayerIds : null;
  const historyFeedbackUserIds = useMemo(() => {
    if (selectedPerformancePlayerId) return [selectedPerformancePlayerId];
    if (isTeamPerformanceScope) return selectedTeamPlayerIds;
    return user?.id ? [user.id] : [];
  }, [isTeamPerformanceScope, selectedPerformancePlayerId, selectedTeamPlayerIds, user?.id]);
  const historyFeedbackUserIdsKey = useMemo(() => historyFeedbackUserIds.join('|'), [historyFeedbackUserIds]);
  const isTeamProgressionLoading = isTeamPerformanceScope && isSelectedTeamMembersLoading;
  const historyCategoryOptions = useMemo(
    () => buildHistoryCategoryOptions(categories, activities),
    [activities, categories],
  );
  const historyCategoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    historyCategoryOptions.forEach((category) => {
      map.set(category.id, category.name);
    });
    return map;
  }, [historyCategoryOptions]);
  const historyFilterDraftCategorySet = useMemo(
    () => new Set(historyFilterDraftCategoryIds),
    [historyFilterDraftCategoryIds],
  );
  const activeHistoryFilterLabel = useMemo(() => {
    if (selectedHistoryCategoryIds.length === 0) return 'All categories';
    if (activeHistoryFilterName) return activeHistoryFilterName;

    const labels = selectedHistoryCategoryIds
      .map((categoryId) => historyCategoryNameById.get(categoryId))
      .filter((name): name is string => Boolean(name));

    if (labels.length === 0) return `${selectedHistoryCategoryIds.length} categories`;
    if (labels.length <= 2) return labels.join(' + ');
    return `${labels.slice(0, 2).join(' + ')} +${labels.length - 2}`;
  }, [activeHistoryFilterName, historyCategoryNameById, selectedHistoryCategoryIds]);
  const hasActiveHistoryFilter = selectedHistoryCategoryIds.length > 0;

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(HISTORY_FILTER_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw);
        setSavedHistoryCategoryFilters(sanitizeSavedHistoryFilters(parsed));
      })
      .catch((error) => {
        console.error('[Performance] Failed to load history filters:', error);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isTrainerProfile) {
      return;
    }

    void ensureRosterLoaded()
      .catch((error) => {
        console.error('[Performance] Failed to load trainer players:', error);
      });
  }, [ensureRosterLoaded, isTrainerProfile]);

  useEffect(() => {
    if (!isTrainerProfile || adminMode !== 'team' || adminTargetType !== 'team' || !adminTargetId) {
      setSelectedTeamPlayerIds([]);
      setIsSelectedTeamMembersLoading(false);
      return;
    }

    let active = true;
    setIsSelectedTeamMembersLoading(true);

    void getTeamMembers(adminTargetId)
      .then((members) => {
        if (!active) return;
        setSelectedTeamPlayerIds(Array.from(new Set(members.map((member) => member.id).filter(Boolean))));
      })
      .catch((error) => {
        console.error('[Performance] Failed to load selected team members:', error);
        if (active) setSelectedTeamPlayerIds([]);
      })
      .finally(() => {
        if (active) setIsSelectedTeamMembersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [adminMode, adminTargetId, adminTargetType, getTeamMembers, isTrainerProfile]);

  useFocusEffect(
    useCallback(() => {
      if (hasPerformanceDataLoaded) {
        setIsBootstrappingPerformanceData(false);
        return;
      }

      let active = true;
      setIsBootstrappingPerformanceData(true);

      void ensurePerformanceDataLoaded()
        .catch((error) => {
          console.error('[Performance] Failed to load performance data:', error);
        })
        .finally(() => {
          if (active) {
            setIsBootstrappingPerformanceData(false);
          }
        });

      return () => {
        active = false;
      };
    }, [ensurePerformanceDataLoaded, hasPerformanceDataLoaded])
  );

  useFocusEffect(
    useCallback(() => {
      if (hasLoadedFullHistoryWindow) {
        setIsBootstrappingHistoryData(false);
        return;
      }

      let active = true;
      setIsBootstrappingHistoryData(true);

      void loadFullWindow()
        .then((didLoadFullWindow) => {
          if (active && didLoadFullWindow) {
            setIsBootstrappingHistoryData(false);
          }
        })
        .catch((error) => {
          console.error('[Performance] Failed to load full history window:', error);
          if (active) {
            setIsBootstrappingHistoryData(false);
          }
        });

      return () => {
        active = false;
      };
    }, [hasLoadedFullHistoryWindow, loadFullWindow])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      const enabledCalendars = externalCalendars.filter((cal) => cal.enabled);
      for (const calendar of enabledCalendars) {
        try {
          await fetchExternalCalendarEvents(calendar);
        } catch (error) {
          console.error(`Failed to sync calendar ${calendar.name}:`, error);
        }
      }
    } catch (error) {
      console.error('Error during refresh:', error);
    } finally {
      setRefreshing(false);
    }
  }, [externalCalendars, fetchExternalCalendarEvents]);

  const toggleHistoryWeekExpanded = useCallback((weekKey: string) => {
    setExpandedHistoryWeeks((prev) => ({
      ...prev,
      [weekKey]: !prev[weekKey],
    }));
  }, []);

  const persistSavedHistoryFilters = useCallback((filters: SavedHistoryCategoryFilter[]) => {
    void AsyncStorage.setItem(HISTORY_FILTER_STORAGE_KEY, JSON.stringify(filters)).catch((error) => {
      console.error('[Performance] Failed to save history filters:', error);
    });
  }, []);

  const handleOpenHistoryFilter = useCallback(() => {
    setHistoryFilterDraftCategoryIds(selectedHistoryCategoryIds);
    setHistoryFilterNameInput(activeHistoryFilterName ?? '');
    setHistoryFilterSaveError(null);
    setIsHistoryFilterModalOpen(true);
  }, [activeHistoryFilterName, selectedHistoryCategoryIds]);

  const handleCloseHistoryFilter = useCallback(() => {
    setIsHistoryFilterModalOpen(false);
    setHistoryFilterSaveError(null);
  }, []);

  const toggleHistoryFilterDraftCategory = useCallback((categoryId: string) => {
    setHistoryFilterDraftCategoryIds((prev) => {
      if (prev.includes(categoryId)) {
        return prev.filter((id) => id !== categoryId);
      }
      return [...prev, categoryId];
    });
    setHistoryFilterSaveError(null);
  }, []);

  const applyHistoryFilter = useCallback((categoryIds: string[], filterName: string | null = null) => {
    const normalizedIds = normalizeIdList(categoryIds);
    setSelectedHistoryCategoryIds(normalizedIds);
    setActiveHistoryFilterName(normalizedIds.length ? filterName : null);
    setHistoryFilterDraftCategoryIds(normalizedIds);
    setHistoryFilterNameInput(filterName ?? '');
    setIsHistoryFilterModalOpen(false);
    setHistoryFilterSaveError(null);
  }, []);

  const handleApplyHistoryFilter = useCallback(() => {
    const matchingSavedFilter = savedHistoryCategoryFilters.find((filter) =>
      areIdListsEqual(filter.categoryIds, historyFilterDraftCategoryIds)
    );
    applyHistoryFilter(historyFilterDraftCategoryIds, matchingSavedFilter?.name ?? null);
  }, [applyHistoryFilter, historyFilterDraftCategoryIds, savedHistoryCategoryFilters]);

  const handleClearHistoryFilter = useCallback(() => {
    applyHistoryFilter([], null);
  }, [applyHistoryFilter]);

  const handleClearHistoryFilterDraft = useCallback(() => {
    setHistoryFilterDraftCategoryIds([]);
    setHistoryFilterNameInput('');
    setHistoryFilterSaveError(null);
  }, []);

  const handleSaveHistoryFilter = useCallback(() => {
    const name = historyFilterNameInput.trim();
    const categoryIds = normalizeIdList(historyFilterDraftCategoryIds);

    if (!categoryIds.length) {
      setHistoryFilterSaveError('Choose at least one category before saving.');
      return;
    }

    if (!name) {
      setHistoryFilterSaveError('Name the filter before saving.');
      return;
    }

    const nowIso = new Date().toISOString();
    setSavedHistoryCategoryFilters((prev) => {
      const existing = prev.find((filter) => filter.name.trim().toLowerCase() === name.toLowerCase());
      const nextFilter: SavedHistoryCategoryFilter = {
        id: existing?.id ?? `history-filter-${Date.now()}`,
        name,
        categoryIds,
        createdAt: existing?.createdAt ?? nowIso,
        updatedAt: nowIso,
      };
      const next = existing
        ? prev.map((filter) => (filter.id === existing.id ? nextFilter : filter))
        : [...prev, nextFilter];
      persistSavedHistoryFilters(next);
      return next;
    });

    applyHistoryFilter(categoryIds, name);
  }, [applyHistoryFilter, historyFilterDraftCategoryIds, historyFilterNameInput, persistSavedHistoryFilters]);

  const handleSelectSavedHistoryFilter = useCallback(
    (filter: SavedHistoryCategoryFilter) => {
      applyHistoryFilter(filter.categoryIds, filter.name);
    },
    [applyHistoryFilter],
  );

  const baseHistoryWeeks = useMemo(
    () => buildPerformanceHistoryWeeks(activities, new Date(), { categoryIds: selectedHistoryCategoryIds }),
    [activities, selectedHistoryCategoryIds],
  );

  const historyFeedbackActivityIds = useMemo(() => {
    const ids = new Set<string>();
    baseHistoryWeeks.forEach((week) => {
      week.activities.forEach((activity) => {
        getFeedbackActivityIdCandidatesForActivity(activity).forEach((candidate) => ids.add(candidate));
      });
    });
    return Array.from(ids);
  }, [baseHistoryWeeks]);

  const historyFeedbackActivityIdsKey = useMemo(
    () => historyFeedbackActivityIds.join('|'),
    [historyFeedbackActivityIds],
  );

  useEffect(() => {
    let cancelled = false;

    if (!historyFeedbackUserIds.length || !historyFeedbackActivityIds.length) {
      setHistorySelfFeedbackRows([]);
      return;
    }

    Promise.all(historyFeedbackUserIds.map((feedbackUserId) => fetchSelfFeedbackForActivities(feedbackUserId, historyFeedbackActivityIds)))
      .then((rowGroups) => {
        if (cancelled) return;
        setHistorySelfFeedbackRows(rowGroups.flatMap((rows) => (Array.isArray(rows) ? rows : [])));
      })
      .catch((error) => {
        if (__DEV__) console.log('[Performance] history self feedback fetch failed', error);
      });

    return () => {
      cancelled = true;
    };
  }, [historyFeedbackActivityIds, historyFeedbackActivityIdsKey, historyFeedbackUserIds, historyFeedbackUserIdsKey]);

  const historyFeedbackCompletionByActivityTaskId = useMemo(() => {
    const latestByKey: Record<string, TaskTemplateSelfFeedback> = {};
    for (const row of historySelfFeedbackRows) {
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
      completionByActivity[activityId] = completionByActivity[activityId] ?? {};
      completionByActivity[activityId][taskInstanceId] = isFeedbackAnswered(row);
    });

    return completionByActivity;
  }, [historySelfFeedbackRows]);

  const historyFeedbackCompletionByActivityId = useMemo(() => {
    const latestByKey: Record<string, TaskTemplateSelfFeedback> = {};
    for (const row of historySelfFeedbackRows) {
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
      completionByActivity[activityId] = completionByActivity[activityId] ?? {};
      completionByActivity[activityId][templateId] = isFeedbackAnswered(row);
    });

    return completionByActivity;
  }, [historySelfFeedbackRows]);

  const historyFeedbackDoneByActivityId = useMemo(() => {
    const doneMap: Record<string, boolean> = {};
    Object.entries(historyFeedbackCompletionByActivityId).forEach(([activityId, templateMap]) => {
      if (Object.values(templateMap).some(Boolean)) {
        doneMap[activityId] = true;
      }
    });
    Object.entries(historyFeedbackCompletionByActivityTaskId).forEach(([activityId, taskMap]) => {
      if (Object.values(taskMap).some(Boolean)) {
        doneMap[activityId] = true;
      }
    });
    return doneMap;
  }, [historyFeedbackCompletionByActivityId, historyFeedbackCompletionByActivityTaskId]);

  const historyActivitiesWithScoredTasks = useMemo(
    () =>
      activities.map((activity) =>
        appendVirtualScoredTasksForActivityCandidates(
          activity,
          historySelfFeedbackRows,
          getFeedbackActivityIdCandidatesForActivity(activity),
        ),
      ),
    [activities, historySelfFeedbackRows],
  );

  const getHistoryActivityCardFeedbackProps = useCallback((activity: any) => {
    const feedbackActivityCandidates = getFeedbackActivityIdCandidatesForActivity(activity);
    const feedbackActivityId = feedbackActivityCandidates[0] ?? null;

    const feedbackCompletionByTemplateId: Record<string, boolean> = {};
    for (const candidateId of feedbackActivityCandidates) {
      const perTemplate = historyFeedbackCompletionByActivityId[candidateId];
      if (!perTemplate) continue;
      for (const [templateId, done] of Object.entries(perTemplate)) {
        const normalized = normalizeId(templateId);
        if (!normalized) continue;
        if (done) {
          feedbackCompletionByTemplateId[normalized] = true;
        } else if (feedbackCompletionByTemplateId[normalized] === undefined) {
          feedbackCompletionByTemplateId[normalized] = false;
        }
      }
    }

    const feedbackCompletionByTaskId: Record<string, boolean> = {};
    for (const candidateId of feedbackActivityCandidates) {
      const perTask = historyFeedbackCompletionByActivityTaskId[candidateId];
      if (!perTask) continue;
      for (const [taskId, done] of Object.entries(perTask)) {
        const normalized = normalizeId(taskId);
        if (!normalized) continue;
        if (done) {
          feedbackCompletionByTaskId[normalized] = true;
        } else if (feedbackCompletionByTaskId[normalized] === undefined) {
          feedbackCompletionByTaskId[normalized] = false;
        }
      }
    }

    const feedbackDone = feedbackActivityCandidates.some(
      (candidateId) => historyFeedbackDoneByActivityId[candidateId] === true,
    );

    return {
      feedbackActivityId,
      feedbackCompletionByTaskId,
      feedbackCompletionByTemplateId,
      feedbackDone,
    };
  }, [
    historyFeedbackCompletionByActivityId,
    historyFeedbackCompletionByActivityTaskId,
    historyFeedbackDoneByActivityId,
  ]);

  const isHistoryTaskCompleted = useCallback(
    (task: any, activity: any): boolean => {
      if (task?.completed === true) return true;
      if (!isHistoryFeedbackTask(task)) return false;

      const feedbackProps = getHistoryActivityCardFeedbackProps(activity);
      const taskId = normalizeId(task?.id ?? task?.task_id);
      if (taskId && feedbackProps.feedbackCompletionByTaskId?.[taskId] === true) {
        return true;
      }

      const templateId = getHistoryFeedbackTemplateId(task);
      if (templateId && feedbackProps.feedbackCompletionByTemplateId?.[templateId] === true) {
        return true;
      }

      return !templateId && feedbackProps.feedbackDone === true;
    },
    [getHistoryActivityCardFeedbackProps],
  );

  const historyWeeks = useMemo(
    () =>
      buildPerformanceHistoryWeeks(historyActivitiesWithScoredTasks, new Date(), {
        categoryIds: selectedHistoryCategoryIds,
        isTaskCompleted: isHistoryTaskCompleted,
      }),
    [historyActivitiesWithScoredTasks, isHistoryTaskCompleted, selectedHistoryCategoryIds],
  );

  const historyListData = useMemo(() => {
    const items: HistoryListItem[] = [];

    historyWeeks.forEach((week) => {
      items.push({
        type: 'weekCard',
        key: `history:week:${week.weekKey}`,
        week,
      });

      if (!expandedHistoryWeeks[week.weekKey]) return;

      week.activities.forEach((activity, index) => {
        items.push({
          type: 'activity',
          key: buildHistoryActivityKey(activity, week.weekKey, index),
          weekKey: week.weekKey,
          activity,
        });
      });
    });

    return items;
  }, [expandedHistoryWeeks, historyWeeks]);

  const currentWeek = getWeek(new Date(), { weekStartsOn: 1 });
  const currentYear = new Date().getFullYear();

  const trophyWeeksByType = useMemo(() => {
    const grouped = {
      gold: [] as typeof trophies,
      silver: [] as typeof trophies,
      bronze: [] as typeof trophies,
    };

    trophies.forEach((trophy) => {
      const isPastWeek =
        trophy.year < currentYear ||
        (trophy.year === currentYear && trophy.week < currentWeek);
      if (!isPastWeek) return;

      if (trophy.type === 'gold' || trophy.type === 'silver' || trophy.type === 'bronze') {
        grouped[trophy.type].push(trophy);
      }
    });

    const sortByLatestWeek = (a: { year: number; week: number }, b: { year: number; week: number }) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.week - a.week;
    };

    grouped.gold.sort(sortByLatestWeek);
    grouped.silver.sort(sortByLatestWeek);
    grouped.bronze.sort(sortByLatestWeek);

    return grouped;
  }, [currentWeek, currentYear, trophies]);

  const goldTrophies = trophyWeeksByType.gold.length;
  const silverTrophies = trophyWeeksByType.silver.length;
  const bronzeTrophies = trophyWeeksByType.bronze.length;

  const toggleExpandedTrophy = useCallback((type: 'gold' | 'silver' | 'bronze') => {
    setExpandedTrophy((prev) => (prev === type ? null : type));
  }, []);

  return (
    <ScrollView
      testID="performance.screen"
      style={[styles.container, { backgroundColor: bgColor }]}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={palette.primary}
          colors={[palette.primary]}
        />
      }
    >
      <View style={styles.header} testID="performance.result">
        <Text style={[styles.headerTitle, { color: textColor }]}>🏆 Performance</Text>
        <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>{userRole === 'player' ? 'Follow your training and development over time' : "View your players' performance over time"}</Text>
      </View>

      {userRole === 'player' ? <PlayerProgramProgressCard /> : null}

      {isTrainerProfile ? (
        <View style={styles.scopeSelector}>
          <TrainerScopeFilter
            testIDPrefix="performance.scopeFilter"
            modalTitle="Progress"
            allLabel="All progress"
            allDetail="Your progress overview"
            playerDetail="Player progress"
            teamDetail="Team progress"
            colors={{
              primary: palette.primary,
              card: palette.card,
              highlight: '#C8E2D0',
              text: textColor,
              textSecondary: textSecondaryColor,
            }}
            isDark={isDark}
          />
          {selectedPerformanceScopeLabel ? (
            <Text
              testID={selectedPerformancePlayer ? 'performance.selectedPlayer' : 'performance.selectedScope'}
              style={[styles.selectedScopeText, { color: textSecondaryColor }]}
            >
              Showing performance for {selectedPerformanceScopeLabel}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.historySection}>
        <Pressable
          style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyHeaderPressed]}
          onPress={() => setIsTrophySectionExpanded((prev) => !prev)}
          testID="performance.trophies.toggle"
        >
          <View style={styles.historyHeaderShadow}>
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(43, 76, 92, 0.62)', 'rgba(29, 52, 69, 0.62)', 'rgba(25, 43, 56, 0.62)']
                  : ['rgba(255, 255, 255, 0.62)', 'rgba(234, 243, 238, 0.62)', 'rgba(221, 239, 227, 0.62)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.historyHeaderCard, { borderColor: isDark ? 'rgba(191, 220, 203, 0.20)' : 'rgba(76, 175, 80, 0.22)' }]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.00)']
                    : ['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 0.8, y: 0.8 }}
                style={styles.historyHeaderSheen}
              />

              <View style={styles.historyHeader}>
                <View style={styles.historyTitleBlock}>
                  <Text style={[styles.historyTitle, { color: isDark ? '#E6F5EC' : '#1D3A2A' }]}>Trophies</Text>
                  <Text style={[styles.historySubtitle, { color: isDark ? '#B5D8C2' : '#2C5A40' }]}>
                    See your trophies from previous weeks
                  </Text>
                </View>
                <View style={styles.historyChevronShadow}>
                  <LinearGradient
                    colors={isDark ? ['#3CC06A', '#1F8A43'] : ['#4CC46E', '#279B4A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.historyChevronButton}
                  >
                    <IconSymbol
                      ios_icon_name={isTrophySectionExpanded ? 'chevron.up' : 'chevron.down'}
                      android_material_icon_name={isTrophySectionExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                      size={20}
                      color="#FFFFFF"
                    />
                    <LinearGradient
                      colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.historyChevronSheen}
                    />
                  </LinearGradient>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Pressable>
      </View>

      {isTrophySectionExpanded ? (
        showTrophyLoadingState ? (
          <View style={[styles.sectionLoadingCard, { backgroundColor: isDark ? '#24362C' : '#EAF5EE' }]}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={[styles.sectionLoadingTitle, { color: textColor }]}>Loading trophies and calendars...</Text>
            <Text style={[styles.sectionLoadingSubtitle, { color: textSecondaryColor }]}>
              History is ready while performance data loads in the background.
            </Text>
          </View>
        ) : (
        <>
          <Pressable
            onPress={() => toggleExpandedTrophy('gold')}
            style={[styles.trophiesCard, { backgroundColor: palette.gold }]}
          >
            <View style={styles.trophiesHeader}>
              <View style={styles.trophiesContent}>
                <Text style={styles.trophiesTitle}>Gold trophies</Text>
                <Text testID="performance.trophies.count.gold" style={styles.trophiesCount}>{goldTrophies}</Text>
              </View>
              <View style={styles.trophiesMeta}>
                <Text style={styles.trophiesEmoji}>🥇</Text>
                <Text style={styles.expandHint}>{expandedTrophy === 'gold' ? 'Hide' : 'Show weeks'}</Text>
              </View>
            </View>
            {expandedTrophy === 'gold' && (
              <FlatList
                data={trophyWeeksByType.gold}
                scrollEnabled={false}
                keyExtractor={(item, index) => `gold-${item.year}-${item.week}-${index}`}
                contentContainerStyle={styles.expandedList}
                ListEmptyComponent={<Text style={styles.emptyWeekText}>No gold weeks yet</Text>}
                renderItem={({ item }) => (
                  <View style={styles.weekRow}>
                    <Text style={styles.weekLabel}>Week {item.week}, {item.year}</Text>
                    <Text style={styles.weekValue}>{item.completedTasks} / {item.totalTasks}</Text>
                  </View>
                )}
              />
            )}
          </Pressable>

          <Pressable
            onPress={() => toggleExpandedTrophy('silver')}
            style={[styles.trophiesCard, { backgroundColor: palette.silver }]}
          >
            <View style={styles.trophiesHeader}>
              <View style={styles.trophiesContent}>
                <Text style={styles.trophiesTitle}>Silver trophies</Text>
                <Text testID="performance.trophies.count.silver" style={styles.trophiesCount}>{silverTrophies}</Text>
              </View>
              <View style={styles.trophiesMeta}>
                <Text style={styles.trophiesEmoji}>🥈</Text>
                <Text style={styles.expandHint}>{expandedTrophy === 'silver' ? 'Hide' : 'Show weeks'}</Text>
              </View>
            </View>
            {expandedTrophy === 'silver' && (
              <FlatList
                data={trophyWeeksByType.silver}
                scrollEnabled={false}
                keyExtractor={(item, index) => `silver-${item.year}-${item.week}-${index}`}
                contentContainerStyle={styles.expandedList}
                ListEmptyComponent={<Text style={styles.emptyWeekText}>No silver weeks yet</Text>}
                renderItem={({ item }) => (
                  <View style={styles.weekRow}>
                    <Text style={styles.weekLabel}>Week {item.week}, {item.year}</Text>
                    <Text style={styles.weekValue}>{item.completedTasks} / {item.totalTasks}</Text>
                  </View>
                )}
              />
            )}
          </Pressable>

          <Pressable
            onPress={() => toggleExpandedTrophy('bronze')}
            style={[styles.trophiesCard, { backgroundColor: palette.bronze }]}
          >
            <View style={styles.trophiesHeader}>
              <View style={styles.trophiesContent}>
                <Text style={styles.trophiesTitle}>Bronze trophies</Text>
                <Text testID="performance.trophies.count.bronze" style={styles.trophiesCount}>{bronzeTrophies}</Text>
              </View>
              <View style={styles.trophiesMeta}>
                <Text style={styles.trophiesEmoji}>🥉</Text>
                <Text style={styles.expandHint}>{expandedTrophy === 'bronze' ? 'Hide' : 'Show weeks'}</Text>
              </View>
            </View>
            {expandedTrophy === 'bronze' && (
              <FlatList
                data={trophyWeeksByType.bronze}
                scrollEnabled={false}
                keyExtractor={(item, index) => `bronze-${item.year}-${item.week}-${index}`}
                contentContainerStyle={styles.expandedList}
                ListEmptyComponent={<Text style={styles.emptyWeekText}>No bronze weeks yet</Text>}
                renderItem={({ item }) => (
                  <View style={styles.weekRow}>
                    <Text style={styles.weekLabel}>Week {item.week}, {item.year}</Text>
                    <Text style={styles.weekValue}>{item.completedTasks} / {item.totalTasks}</Text>
                  </View>
                )}
              />
            )}
          </Pressable>
        </>
        )
      ) : null}

      <View style={styles.historySection}>
        <Pressable
          style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyHeaderPressed]}
          onPress={() => setIsProgressionSectionExpanded((prev) => !prev)}
          testID="performance.progression.toggle"
        >
          <View style={styles.historyHeaderShadow}>
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(43, 76, 92, 0.62)', 'rgba(29, 52, 69, 0.62)', 'rgba(25, 43, 56, 0.62)']
                  : ['rgba(255, 255, 255, 0.62)', 'rgba(234, 243, 238, 0.62)', 'rgba(221, 239, 227, 0.62)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.historyHeaderCard, { borderColor: isDark ? 'rgba(191, 220, 203, 0.20)' : 'rgba(76, 175, 80, 0.22)' }]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.00)']
                    : ['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 0.8, y: 0.8 }}
                style={styles.historyHeaderSheen}
              />

              <View style={styles.historyHeader}>
                <View style={styles.historyTitleBlock}>
                  <Text style={[styles.historyTitle, { color: isDark ? '#E6F5EC' : '#1D3A2A' }]}>Development</Text>
                  <Text style={[styles.historySubtitle, { color: isDark ? '#B5D8C2' : '#2C5A40' }]}>
                    Track your development for focus points and intensity.
                  </Text>
                </View>
                <View style={styles.historyChevronShadow}>
                  <LinearGradient
                    colors={isDark ? ['#3CC06A', '#1F8A43'] : ['#4CC46E', '#279B4A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.historyChevronButton}
                  >
                    <IconSymbol
                      ios_icon_name={isProgressionSectionExpanded ? 'chevron.up' : 'chevron.down'}
                      android_material_icon_name={isProgressionSectionExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                      size={20}
                      color="#FFFFFF"
                    />
                    <LinearGradient
                      colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.historyChevronSheen}
                    />
                  </LinearGradient>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Pressable>
      </View>

      {isProgressionSectionExpanded ? (
        isTeamProgressionLoading ? (
          <View style={[styles.sectionLoadingCard, { backgroundColor: isDark ? '#24362C' : '#EAF5EE' }]}>
            <ActivityIndicator size="small" color={palette.primary} />
            <Text style={[styles.sectionLoadingTitle, { color: textColor }]}>Loading team players...</Text>
          </View>
        ) : (
          <ProgressionSection
            categories={categories}
            targetUserId={selectedPerformancePlayerId}
            targetUserIds={progressionTargetUserIds}
          />
        )
      ) : null}

      <View style={styles.historySection}>
        <Pressable
          style={({ pressed }) => [styles.historyHeaderPressable, pressed && styles.historyHeaderPressed]}
          onPress={() => setIsHistorySectionExpanded((prev) => !prev)}
          testID="performance.history.toggle"
        >
          <View style={styles.historyHeaderShadow}>
            <LinearGradient
              colors={
                isDark
                  ? ['rgba(43, 76, 92, 0.62)', 'rgba(29, 52, 69, 0.62)', 'rgba(25, 43, 56, 0.62)']
                  : ['rgba(255, 255, 255, 0.62)', 'rgba(234, 243, 238, 0.62)', 'rgba(221, 239, 227, 0.62)']
              }
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.historyHeaderCard, { borderColor: isDark ? 'rgba(191, 220, 203, 0.20)' : 'rgba(76, 175, 80, 0.22)' }]}
            >
              <LinearGradient
                colors={
                  isDark
                    ? ['rgba(255, 255, 255, 0.10)', 'rgba(255, 255, 255, 0.00)']
                    : ['rgba(255, 255, 255, 0.55)', 'rgba(255, 255, 255, 0.00)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 0.8, y: 0.8 }}
                style={styles.historyHeaderSheen}
              />

              <View style={styles.historyHeader}>
                <View style={styles.historyTitleBlock}>
                  <Text style={[styles.historyTitle, { color: isDark ? '#E6F5EC' : '#1D3A2A' }]}>History</Text>
                  <Text style={[styles.historySubtitle, { color: isDark ? '#B5D8C2' : '#2C5A40' }]}>
                    Weeks completed and work done
                  </Text>
                </View>
                <View style={styles.historyChevronShadow}>
                  <LinearGradient
                    colors={isDark ? ['#3CC06A', '#1F8A43'] : ['#4CC46E', '#279B4A']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.historyChevronButton}
                  >
                    <IconSymbol
                      ios_icon_name={isHistorySectionExpanded ? 'chevron.up' : 'chevron.down'}
                      android_material_icon_name={isHistorySectionExpanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
                      size={20}
                      color="#FFFFFF"
                    />
                    <LinearGradient
                      colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.00)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.historyChevronSheen}
                    />
                  </LinearGradient>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Pressable>
      </View>

      {isHistorySectionExpanded ? (
        <>
          <View style={styles.historyFilterToolbar}>
            <Pressable
              testID="performance.historyFilter.open"
              onPress={handleOpenHistoryFilter}
              disabled={historyCategoryOptions.length === 0}
              style={({ pressed }) => [
                styles.historyFilterButton,
                {
                  backgroundColor: hasActiveHistoryFilter ? palette.primary : isDark ? '#24362C' : '#EAF5EE',
                  borderColor: hasActiveHistoryFilter ? palette.primary : isDark ? '#385442' : '#C8E2D0',
                  opacity: historyCategoryOptions.length === 0 ? 0.55 : 1,
                },
                pressed && styles.historyFilterButtonPressed,
              ]}
            >
              <IconSymbol
                ios_icon_name="line.3.horizontal.decrease.circle"
                android_material_icon_name="filter_list"
                size={18}
                color={hasActiveHistoryFilter ? '#FFFFFF' : textSecondaryColor}
              />
              <View style={styles.historyFilterButtonTextBlock}>
                <Text
                  style={[
                    styles.historyFilterButtonLabel,
                    { color: hasActiveHistoryFilter ? 'rgba(255,255,255,0.82)' : textSecondaryColor },
                  ]}
                >
                  Filter
                </Text>
                <Text
                  testID="performance.historyFilter.activeLabel"
                  style={[
                    styles.historyFilterButtonValue,
                    { color: hasActiveHistoryFilter ? '#FFFFFF' : textColor },
                  ]}
                  numberOfLines={1}
                >
                  {activeHistoryFilterLabel}
                </Text>
              </View>
            </Pressable>

            {hasActiveHistoryFilter ? (
              <Pressable
                testID="performance.historyFilter.clear"
                onPress={handleClearHistoryFilter}
                style={({ pressed }) => [
                  styles.historyFilterClearButton,
                  {
                    backgroundColor: isDark ? '#24362C' : '#EAF5EE',
                    borderColor: isDark ? '#385442' : '#C8E2D0',
                  },
                  pressed && styles.historyFilterButtonPressed,
                ]}
              >
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={18}
                  color={textSecondaryColor}
                />
              </Pressable>
            ) : null}
          </View>

          {homeActivitiesLoading || (!hasLoadedFullHistoryWindow && isBootstrappingHistoryData) ? (
            <View style={styles.historyPlaceholder}>
              <Text style={[styles.historyPlaceholderText, { color: textSecondaryColor }]}>
                Loading full history...
              </Text>
            </View>
          ) : historyWeeks.length === 0 ? (
            <View style={styles.historyPlaceholder}>
              <Text style={[styles.historyPlaceholderText, { color: textSecondaryColor }]}>
                {hasActiveHistoryFilter ? 'No history matches this filter' : 'No history yet'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={historyListData}
              style={styles.historyList}
              renderItem={({ item }) => {
                if (item.type === 'weekCard') {
                  return (
                    <WeeklySummaryCard
                      weekStart={item.week.weekStart}
                      isDark={isDark}
                      isExpanded={expandedHistoryWeeks[item.week.weekKey] === true}
                      onPress={() => toggleHistoryWeekExpanded(item.week.weekKey)}
                      activityCount={item.week.activityCount}
                      totalTasks={item.week.totalCompletedTasks}
                      totalMinutes={item.week.totalMinutes}
                      eyebrowText="HISTORY WEEK"
                      timeLabelPrefix="Completed"
                    />
                  );
                }

                const feedbackProps = getHistoryActivityCardFeedbackProps(item.activity);

                return (
                  <View style={styles.activityWrapper}>
                    <ActivityCard
                      activity={item.activity}
                      resolvedDate={item.activity.__resolvedDateTime}
                      showTasks
                      {...feedbackProps}
                    />
                  </View>
                );
              }}
              keyExtractor={(item) => item.key}
              scrollEnabled={false}
              removeClippedSubviews={Platform.OS !== 'web'}
              initialNumToRender={6}
              maxToRenderPerBatch={8}
              windowSize={5}
              testID="performance.history.list"
            />
          )}
        </>
      ) : null}

      <View style={{ height: 100 }} />

      <Modal
        visible={isHistoryFilterModalOpen}
        transparent
        animationType="fade"
        onRequestClose={handleCloseHistoryFilter}
      >
        <Pressable style={styles.playerModalBackdrop} onPress={handleCloseHistoryFilter}>
          <Pressable
            style={[
              styles.historyFilterModalCard,
              { backgroundColor: bgColor, borderColor: isDark ? '#385442' : '#C8E2D0' },
            ]}
            onPress={() => undefined}
          >
            <View style={styles.playerModalHeader}>
              <View style={styles.historyFilterModalTitleBlock}>
                <Text style={[styles.playerModalTitle, { color: textColor }]}>History filter</Text>
                <Text style={[styles.historyFilterModalSubtitle, { color: textSecondaryColor }]}>
                  Choose categories for weekly totals
                </Text>
              </View>
              <Pressable
                testID="performance.historyFilter.close"
                onPress={handleCloseHistoryFilter}
                hitSlop={10}
              >
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={22}
                  color={textSecondaryColor}
                />
              </Pressable>
            </View>

            <ScrollView
              style={styles.historyFilterModalScroll}
              contentContainerStyle={styles.historyFilterModalContent}
              keyboardShouldPersistTaps="handled"
            >
              {savedHistoryCategoryFilters.length ? (
                <View style={styles.historyFilterGroup}>
                  <Text style={[styles.historyFilterGroupTitle, { color: textColor }]}>Saved filters</Text>
                  <View style={styles.historyFilterChipGrid}>
                    {savedHistoryCategoryFilters.map((filter) => {
                      const isSelected = areIdListsEqual(filter.categoryIds, selectedHistoryCategoryIds);
                      return (
                        <Pressable
                          key={filter.id}
                          testID={`performance.historyFilter.saved.${sanitizeTestIdSegment(filter.id)}`}
                          onPress={() => handleSelectSavedHistoryFilter(filter)}
                          style={({ pressed }) => [
                            styles.historyFilterPresetChip,
                            {
                              backgroundColor: isSelected ? palette.primary : isDark ? '#24362C' : '#F3F8F5',
                              borderColor: isSelected ? palette.primary : isDark ? '#385442' : '#C8E2D0',
                            },
                            pressed && styles.historyFilterButtonPressed,
                          ]}
                        >
                          <IconSymbol
                            ios_icon_name={isSelected ? 'checkmark.circle.fill' : 'bookmark'}
                            android_material_icon_name={isSelected ? 'check_circle' : 'bookmark_border'}
                            size={16}
                            color={isSelected ? '#FFFFFF' : textSecondaryColor}
                          />
                          <Text
                            style={[
                              styles.historyFilterPresetText,
                              { color: isSelected ? '#FFFFFF' : textColor },
                            ]}
                            numberOfLines={1}
                          >
                            {filter.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              <View style={styles.historyFilterGroup}>
                <Text style={[styles.historyFilterGroupTitle, { color: textColor }]}>Categories</Text>
                <View style={styles.historyFilterChipGrid}>
                  <Pressable
                    testID="performance.historyFilter.category.all"
                    onPress={handleClearHistoryFilterDraft}
                    style={({ pressed }) => [
                      styles.historyFilterCategoryChip,
                      {
                        backgroundColor: historyFilterDraftCategoryIds.length === 0 ? palette.primary : 'transparent',
                        borderColor: palette.primary,
                      },
                      pressed && styles.historyFilterButtonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyFilterCategoryText,
                        { color: historyFilterDraftCategoryIds.length === 0 ? '#FFFFFF' : palette.primary },
                      ]}
                      numberOfLines={1}
                    >
                      All categories
                    </Text>
                  </Pressable>

                  {historyCategoryOptions.map((category) => {
                    const isSelected = historyFilterDraftCategorySet.has(category.id);
                    const categoryColor = category.color || palette.primary;
                    const label = `${String(category.emoji ?? '').trim()} ${category.name}`.trim();

                    return (
                      <Pressable
                        key={category.id}
                        testID={`performance.historyFilter.category.${sanitizeTestIdSegment(category.id)}`}
                        onPress={() => toggleHistoryFilterDraftCategory(category.id)}
                        style={({ pressed }) => [
                          styles.historyFilterCategoryChip,
                          {
                            backgroundColor: isSelected
                              ? (isDark ? 'rgba(201, 235, 214, 0.14)' : 'rgba(76, 175, 80, 0.14)')
                              : 'transparent',
                            borderColor: categoryColor,
                          },
                          pressed && styles.historyFilterButtonPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.historyFilterCategoryText,
                            { color: isSelected ? categoryColor : textColor },
                          ]}
                          numberOfLines={1}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.historyFilterGroup}>
                <Text style={[styles.historyFilterGroupTitle, { color: textColor }]}>Save current filter</Text>
                <TextInput
                  testID="performance.historyFilter.nameInput"
                  value={historyFilterNameInput}
                  onChangeText={(value) => {
                    setHistoryFilterNameInput(value);
                    setHistoryFilterSaveError(null);
                  }}
                  placeholder="Filter name"
                  placeholderTextColor={textSecondaryColor}
                  style={[
                    styles.historyFilterNameInput,
                    {
                      color: textColor,
                      backgroundColor: isDark ? '#24362C' : '#F3F8F5',
                      borderColor: isDark ? '#385442' : '#C8E2D0',
                    },
                  ]}
                  returnKeyType="done"
                />
                {historyFilterSaveError ? (
                  <Text
                    testID="performance.historyFilter.saveError"
                    style={[styles.historyFilterErrorText, { color: '#D32F2F' }]}
                  >
                    {historyFilterSaveError}
                  </Text>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.historyFilterActions}>
              <Pressable
                testID="performance.historyFilter.clearDraft"
                onPress={handleClearHistoryFilterDraft}
                style={({ pressed }) => [
                  styles.historyFilterActionButton,
                  styles.historyFilterSecondaryAction,
                  { borderColor: isDark ? '#385442' : '#C8E2D0' },
                  pressed && styles.historyFilterButtonPressed,
                ]}
              >
                <Text style={[styles.historyFilterSecondaryActionText, { color: textSecondaryColor }]}>Clear</Text>
              </Pressable>

              <Pressable
                testID="performance.historyFilter.apply"
                onPress={handleApplyHistoryFilter}
                style={({ pressed }) => [
                  styles.historyFilterActionButton,
                  { backgroundColor: isDark ? '#24362C' : '#EAF5EE', borderColor: isDark ? '#385442' : '#C8E2D0' },
                  pressed && styles.historyFilterButtonPressed,
                ]}
              >
                <Text style={[styles.historyFilterSecondaryActionText, { color: textColor }]}>Apply</Text>
              </Pressable>

              <Pressable
                testID="performance.historyFilter.save"
                onPress={handleSaveHistoryFilter}
                disabled={historyFilterDraftCategoryIds.length === 0}
                style={({ pressed }) => [
                  styles.historyFilterActionButton,
                  styles.historyFilterPrimaryAction,
                  { backgroundColor: palette.primary, opacity: historyFilterDraftCategoryIds.length === 0 ? 0.55 : 1 },
                  pressed && styles.historyFilterButtonPressed,
                ]}
              >
                <IconSymbol
                  ios_icon_name="square.and.arrow.down"
                  android_material_icon_name="save"
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.historyFilterPrimaryActionText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    paddingTop: 60,
    paddingHorizontal: 16,
  },
  header: {
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
  },
  scopeSelector: {
    marginBottom: 4,
  },
  selectedScopeText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 18,
  },
  playerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  playerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  playerModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  trophiesCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  sectionLoadingCard: {
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  sectionLoadingTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionLoadingSubtitle: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  trophiesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  trophiesContent: {
    flex: 1,
  },
  trophiesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  trophiesCount: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
  },
  trophiesEmoji: {
    fontSize: 48,
  },
  historySection: {
    marginTop: 24,
    marginBottom: 12,
  },
  historyHeaderPressable: {
    borderRadius: 24,
  },
  historyHeaderPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  historyHeaderShadow: {
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  historyHeaderCard: {
    borderRadius: 24,
    padding: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  historyHeaderSheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: 12,
  },
  historyTitleBlock: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  historySubtitle: {
    marginTop: 4,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 21,
  },
  historyChevronShadow: {
    borderRadius: 18,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  historyChevronButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  historyChevronSheen: {
    position: 'absolute',
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
  },
  historyPlaceholder: {
    paddingVertical: 8,
  },
  historyPlaceholderText: {
    fontSize: 15,
    lineHeight: 22,
  },
  activityWrapper: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  historyList: {
    marginHorizontal: -16,
  },
  historyFilterToolbar: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'stretch',
    columnGap: 10,
  },
  historyFilterButton: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 10,
    flex: 1,
  },
  historyFilterButtonPressed: {
    opacity: 0.88,
  },
  historyFilterButtonTextBlock: {
    flex: 1,
  },
  historyFilterButtonLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  historyFilterButtonValue: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
  },
  historyFilterClearButton: {
    width: 54,
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyFilterModalCard: {
    maxHeight: '82%',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  historyFilterModalTitleBlock: {
    flex: 1,
    paddingRight: 12,
  },
  historyFilterModalSubtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
  },
  historyFilterModalScroll: {
    maxHeight: 420,
  },
  historyFilterModalContent: {
    paddingBottom: 10,
    rowGap: 18,
  },
  historyFilterGroup: {
    rowGap: 10,
  },
  historyFilterGroupTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  historyFilterChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  historyFilterPresetChip: {
    minHeight: 38,
    maxWidth: '100%',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 7,
  },
  historyFilterPresetText: {
    fontSize: 13,
    fontWeight: '800',
    flexShrink: 1,
  },
  historyFilterCategoryChip: {
    minHeight: 38,
    maxWidth: '100%',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
  },
  historyFilterCategoryText: {
    fontSize: 13,
    fontWeight: '800',
  },
  historyFilterNameInput: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: '700',
  },
  historyFilterErrorText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  historyFilterActions: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  historyFilterActionButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 6,
    flex: 1,
  },
  historyFilterSecondaryAction: {
    backgroundColor: 'transparent',
  },
  historyFilterSecondaryActionText: {
    fontSize: 14,
    fontWeight: '800',
  },
  historyFilterPrimaryAction: {
    borderWidth: 0,
  },
  historyFilterPrimaryActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  trophiesMeta: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  expandHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    opacity: 0.95,
  },
  expandedList: {
    marginTop: 12,
    gap: 8,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  weekLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  weekValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyWeekText: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.95,
  },
});
