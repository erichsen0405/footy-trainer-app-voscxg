import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DeviceEventEmitter } from 'react-native';
import { subDays, startOfDay, parseISO, format, differenceInCalendarDays, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { ActivityCategory } from '@/types';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';

export type ProgressionMetric = 'rating' | 'intensity';

export interface ProgressionEntry {
  id: string;
  kind: ProgressionMetric;
  createdAt: string;
  activityId: string | null;
  taskInstanceId?: string | null;
  taskTemplateId: string | null;
  taskTemplateName?: string | null;
  taskTemplateDescription?: string | null;
  taskTemplateScoreExplanation?: string | null;
  activityTitle?: string | null;
  rating: number | null;
  intensity: number | null;
  note: string | null;
  dateKey: string;
  focusCategoryId: string | null;
  focusName: string;
  focusColor?: string;
  sessionKey?: string | null;
}

export interface TrendPoint {
  id: string;
  dateKey: string;
  dateLabel: string;
  value: number;
  representative: ProgressionEntry;
  sampleCount: number;
  seriesId?: string;
  seriesName?: string;
}

export interface TrendSeries {
  id: string;
  name: string;
  points: TrendPoint[];
  color: string;
}

export interface HeatmapWeek {
  weekStart: string;
  label: string;
  completed: number;
  possible: number;
  ratio: number;
}

export interface HeatmapRow {
  focusId: string | null;
  focusName: string;
  color?: string;
  weeks: HeatmapWeek[];
  totalCompleted: number;
  totalPossible: number;
}

export interface ProgressionSummary {
  completionRate: number;
  previousRate: number;
  delta: number;
  totalEntries: number;
  successCount: number;
  streakDays: number;
  badges: string[];
  possibleCount: number;
  completedCount: number;
  avgCurrent: number;
  avgPrevious: number;
  avgChangePercent: number;
  scorePercent: number;
  previousScorePercent: number;
  deltaPercentPoints: number;
}

interface FocusPossibleEntry {
  templateId: string | null;
  templateName: string;
  dateKey: string;
  activityId: string | null;
  sessionKey?: string | null;
}

interface FocusTemplateOption {
  id: string;
  name: string;
}

interface UseProgressionDataArgs {
  days: number;
  metric: ProgressionMetric;
  focusTaskTemplateId?: string | null;
  intensityCategoryId?: string | null;
  categories: ActivityCategory[];
}

interface UseProgressionDataResult {
  isLoading: boolean;
  error: string | null;
  trendPoints: TrendPoint[];
  heatmapRows: HeatmapRow[];
  summary: ProgressionSummary;
  rawEntries: ProgressionEntry[];
  allFocusEntries: ProgressionEntry[];
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
  focusTemplates: FocusTemplateOption[];
  intensityCategoriesWithData: string[];
  possibleCount: number;
  requiresLogin: boolean;
}

interface HomeAlignedTaskCounter {
  periodStart: string;
  periodEnd: string;
  possibleIds: string[];
  completedIds: string[];
}

const SUCCESS_THRESHOLD = 7;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type DedupeSource = {
  activityId?: string | null;
  taskInstanceId?: string | null;
  sessionKey?: string | null;
  dateKey?: string | null;
  id?: string | null;
};

type CreatedAtSource = {
  createdAt?: string | null;
};

// Exported for unit tests; keep usage internal to this module in app code.
export const resolveBaseKey = (entry: DedupeSource) => {
  const sessionKey = entry?.sessionKey ?? null;
  if (sessionKey && sessionKey.startsWith('event:')) {
    return sessionKey;
  }
  const activityId = entry?.activityId ?? null;
  if (activityId && UUID_REGEX.test(activityId)) {
    return activityId;
  }
  const dateKey = entry?.dateKey ?? null;
  const id = entry?.id ?? null;
  return sessionKey ?? activityId ?? dateKey ?? id ?? 'na';
};

export const resolveFeedbackBaseKey = (entry: DedupeSource) => {
  const sessionKey = entry?.sessionKey ?? null;
  if (sessionKey && sessionKey.startsWith('event:')) {
    return sessionKey;
  }
  const activityId = entry?.activityId ?? null;
  if (activityId && UUID_REGEX.test(activityId)) {
    return activityId;
  }
  const taskInstanceId = entry?.taskInstanceId ?? null;
  if (taskInstanceId && UUID_REGEX.test(taskInstanceId)) {
    return `task:${taskInstanceId}`;
  }
  return sessionKey ?? activityId ?? taskInstanceId ?? entry?.dateKey ?? entry?.id ?? 'na';
};

export const safeDateMs = (value?: string | null) => {
  const ms = new Date(String(value ?? '')).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

export const dedupeByLatestCreatedAt = <T extends CreatedAtSource>(
  entries: T[],
  keyBuilder: (entry: T) => string
): T[] => {
  const latestByKey = new Map<string, { item: T; ms: number; index: number }>();

  entries.forEach((entry, index) => {
    const key = keyBuilder(entry);
    const currentMs = safeDateMs(entry.createdAt);
    const previous = latestByKey.get(key);
    if (!previous) {
      latestByKey.set(key, { item: entry, ms: currentMs, index });
      return;
    }
    if (currentMs > previous.ms || (currentMs === previous.ms && index > previous.index)) {
      latestByKey.set(key, { item: entry, ms: currentMs, index });
    }
  });

  return Array.from(latestByKey.values()).map((entry) => entry.item);
};

export const toDateKey = (value?: string | null) => (value ? value.slice(0, 10) : '');
export const normalizeTime = (value?: string | null) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 5);
};
export const isUuid = (value?: string | null) => {
  if (!value) return false;
  return UUID_REGEX.test(value);
};
export const normalizeEventId = (value?: string | null) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return isUuid(trimmed) ? trimmed : null;
};
export const buildSessionKey = (args: {
  eventId?: string | null;
  userId?: string | null;
  date?: string | null;
  time?: string | null;
}) => {
  const normalizedEventId = normalizeEventId(args.eventId);
  if (normalizedEventId) return `event:${normalizedEventId}`;
  const dateKey = toDateKey(args.date ?? null);
  const timeKey = normalizeTime(args.time ?? null) ?? '00:00';
  const owner = String(args.userId ?? '').trim();
  if (!owner || !dateKey) return null;
  return `${owner}:${dateKey}:${timeKey}`;
};

type ProgressionSummaryArgs = {
  metric: ProgressionMetric;
  days: number;
  focusCompleted: ProgressionEntry[];
  focusCompletedPrevious: ProgressionEntry[];
  intensityCompleted: ProgressionEntry[];
  intensityCompletedPrevious: ProgressionEntry[];
  intensityPossible: ProgressionEntry[];
  intensityPossiblePrevious: ProgressionEntry[];
  ratingPossibleCount: number;
  ratingCompletedCount: number;
  ratingPreviousPossibleCount: number;
  ratingPreviousCompletedCount: number;
};

export const buildPeriodBounds = (days: number, now = new Date()) => {
  const today = startOfDay(now);
  const periodStart = startOfDay(subDays(today, Math.max(days - 1, 0)));
  const periodEndExclusive = startOfDay(addDays(today, 1));
  const previousStart = startOfDay(subDays(periodStart, days));
  return {
    periodStart,
    periodEndExclusive,
    previousStart,
    periodStartDate: format(periodStart, 'yyyy-MM-dd'),
    periodEndDate: format(periodEndExclusive, 'yyyy-MM-dd'),
    previousStartDate: format(previousStart, 'yyyy-MM-dd'),
    previousEndDate: format(periodStart, 'yyyy-MM-dd'),
    periodEndInclusiveDate: format(addDays(periodEndExclusive, -1), 'yyyy-MM-dd'),
  };
};

export const computeProgressionSummary = ({
  metric,
  days,
  focusCompleted,
  focusCompletedPrevious,
  intensityCompleted,
  intensityCompletedPrevious,
  intensityPossible,
  intensityPossiblePrevious,
  ratingPossibleCount,
  ratingCompletedCount,
  ratingPreviousPossibleCount,
  ratingPreviousCompletedCount,
}: ProgressionSummaryArgs): ProgressionSummary => {
  if (metric === 'rating') {
    const completed = focusCompleted;
    const completedCount = ratingCompletedCount;
    const possibleCount = ratingPossibleCount;
    const previousCompleted = focusCompletedPrevious;
    const previousCompletedCount = ratingPreviousCompletedCount;
    const previousPossibleCount = ratingPreviousPossibleCount;
    const completionRate = possibleCount ? Math.round((completedCount / possibleCount) * 100) : 0;
    const previousRate = previousPossibleCount ? Math.round((previousCompletedCount / previousPossibleCount) * 100) : 0;
    const delta = completionRate - previousRate;
    const ratings = completed.map(entry => entry.rating ?? 0);
    const ratingsPrev = previousCompleted.map(entry => entry.rating ?? 0);
    const avgCurrent = ratings.length ? ratings.reduce((sum, v) => sum + v, 0) / ratings.length : 0;
    const avgPrevious = ratingsPrev.length ? ratingsPrev.reduce((sum, v) => sum + v, 0) / ratingsPrev.length : 0;
    const scorePercent = Math.round((avgCurrent / 10) * 100);
    const previousScorePercent = Math.round((avgPrevious / 10) * 100);
    const deltaPercentPoints = scorePercent - previousScorePercent;
    const avgChangePercent =
      avgPrevious > 0 ? ((avgCurrent - avgPrevious) / avgPrevious) * 100 : avgCurrent > 0 ? 100 : 0;
    const successCount = completed.filter(entry => (entry.rating ?? 0) >= SUCCESS_THRESHOLD).length;
    const uniqueDates = Array.from(
      new Set(completed.map(entry => entry.dateKey || entry.createdAt.slice(0, 10)))
    )
      .map(d => parseISO(`${d}T00:00:00`))
      .sort((a, b) => b.getTime() - a.getTime());

    let streak = 0;
    for (let i = 0; i < uniqueDates.length; i++) {
      if (i === 0) {
        streak = 1;
        continue;
      }
      const diff = differenceInCalendarDays(uniqueDates[i - 1], uniqueDates[i]);
      if (diff === 1) {
        streak += 1;
      } else if (diff > 1) {
        break;
      }
    }

    const badges: string[] = [];
    if (streak >= 3) badges.push('Streak 3+');
    if (delta > 0) badges.push('Momentum');
    if (completedCount >= Math.max(3, Math.round(days / 4))) badges.push('Consistency');
    if (successCount >= 3) badges.push('8+ mastery');

    return {
      completionRate,
      previousRate,
      delta,
      totalEntries: completed.length,
      successCount,
      streakDays: streak,
      badges,
      possibleCount,
      completedCount,
      avgCurrent,
      avgPrevious,
      avgChangePercent,
      scorePercent,
      previousScorePercent,
      deltaPercentPoints,
    };
  }

  const registered = intensityCompleted;
  const registeredCount = registered.length;
  const possibleCount = intensityPossible.length;
  const previousRegistered = intensityCompletedPrevious;
  const previousPossibleCount = intensityPossiblePrevious.length;
  const completionRate = possibleCount ? Math.round((registeredCount / possibleCount) * 100) : 0;
  const previousRate = previousPossibleCount ? Math.round((previousRegistered.length / previousPossibleCount) * 100) : 0;
  const delta = completionRate - previousRate;
  const intensities = registered.map(entry => entry.intensity ?? 0);
  const intensitiesPrev = previousRegistered.map(entry => entry.intensity ?? 0);
  const avgCurrent = intensities.length ? intensities.reduce((sum, v) => sum + v, 0) / intensities.length : 0;
  const avgPrevious = intensitiesPrev.length ? intensitiesPrev.reduce((sum, v) => sum + v, 0) / intensitiesPrev.length : 0;
  const scorePercent = Math.round((avgCurrent / 10) * 100);
  const previousScorePercent = Math.round((avgPrevious / 10) * 100);
  const deltaPercentPoints = scorePercent - previousScorePercent;
  const avgChangePercent =
    avgPrevious > 0 ? ((avgCurrent - avgPrevious) / avgPrevious) * 100 : avgCurrent > 0 ? 100 : 0;
  const successCount = registered.filter(entry => (entry.intensity ?? 0) >= SUCCESS_THRESHOLD).length;
  const uniqueDates = Array.from(new Set(registered.map(entry => entry.dateKey || entry.createdAt.slice(0, 10))))
    .map(d => parseISO(`${d}T00:00:00`))
    .sort((a, b) => b.getTime() - a.getTime());

  let streak = 0;
  for (let i = 0; i < uniqueDates.length; i++) {
    if (i === 0) {
      streak = 1;
      continue;
    }
    const diff = differenceInCalendarDays(uniqueDates[i - 1], uniqueDates[i]);
    if (diff === 1) {
      streak += 1;
    } else if (diff > 1) {
      break;
    }
  }

  const badges: string[] = [];
  if (streak >= 3) badges.push('Streak 3+');
  if (delta > 0) badges.push('Momentum');
  if (registeredCount >= Math.max(3, Math.round(days / 4))) badges.push('Consistency');
  if (successCount >= 3) badges.push('8+ mastery');

  return {
    completionRate,
    previousRate,
    delta,
    totalEntries: registeredCount,
    successCount,
    streakDays: streak,
    badges,
    possibleCount,
    completedCount: registeredCount,
    avgCurrent,
    avgPrevious,
    avgChangePercent,
    scorePercent,
    previousScorePercent,
    deltaPercentPoints,
  };
};

export function useProgressionData({
  days,
  metric,
  focusTaskTemplateId,
  intensityCategoryId,
  categories,
}: UseProgressionDataArgs): UseProgressionDataResult {
  const [focusEntries, setFocusEntries] = useState<ProgressionEntry[]>([]);
  const [focusEntriesPrevious, setFocusEntriesPrevious] = useState<ProgressionEntry[]>([]);
  const [focusPossible, setFocusPossible] = useState<FocusPossibleEntry[]>([]);
  const [focusPossiblePrevious, setFocusPossiblePrevious] = useState<FocusPossibleEntry[]>([]);
  const [focusTemplates, setFocusTemplates] = useState<FocusTemplateOption[]>([]);
  const [intensityEntries, setIntensityEntries] = useState<ProgressionEntry[]>([]);
  const [intensityEntriesPrevious, setIntensityEntriesPrevious] = useState<ProgressionEntry[]>([]);
  const [homeAlignedTaskCounter, setHomeAlignedTaskCounter] = useState<HomeAlignedTaskCounter>({
    periodStart: '',
    periodEnd: '',
    possibleIds: [],
    completedIds: [],
  });
  const [homeAlignedTaskCounterPrevious, setHomeAlignedTaskCounterPrevious] = useState<HomeAlignedTaskCounter>({
    periodStart: '',
    periodEnd: '',
    possibleIds: [],
    completedIds: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const mountedRef = useRef(true);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runIfMounted = useCallback((fn: () => void) => {
    if (mountedRef.current) fn();
  }, []);

  const clearDataState = useCallback(() => {
    if (!mountedRef.current) return;
    setFocusEntries([]);
    setFocusEntriesPrevious([]);
    setFocusPossible([]);
    setFocusPossiblePrevious([]);
    setFocusTemplates([]);
    setIntensityEntries([]);
    setIntensityEntriesPrevious([]);
    setHomeAlignedTaskCounter({
      periodStart: '',
      periodEnd: '',
      possibleIds: [],
      completedIds: [],
    });
    setHomeAlignedTaskCounterPrevious({
      periodStart: '',
      periodEnd: '',
      possibleIds: [],
      completedIds: [],
    });
    setLastUpdated(null);
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const categoryMap = useMemo(() => {
    const lookup: Record<string, ActivityCategory> = {};
    categories.forEach(cat => {
      lookup[String((cat as any).id)] = cat;
    });
    return lookup;
  }, [categories]);

  const mapFocusFeedbackRow = useCallback((row: any): ProgressionEntry => {
    const createdIso = row.created_at as string;
    const activityDate = row.activities?.activity_date as string | null;
    const dateKey = toDateKey(activityDate || createdIso);
    const templateId = row.task_template_id ? String(row.task_template_id) : null;
    const templateName = row.task_templates?.title ?? 'Feedback opgaver';
    const templateDescription = row.task_templates?.description ?? null;
    const templateScoreExplanation = row.task_templates?.after_training_feedback_score_explanation ?? null;

    return {
      id: String(row.id),
      kind: 'rating',
      createdAt: createdIso,
      activityId: row.activity_id ? String(row.activity_id) : null,
      taskInstanceId: row.task_instance_id ? String(row.task_instance_id) : null,
      taskTemplateId: templateId,
      taskTemplateName: templateName,
      taskTemplateDescription: templateDescription,
      taskTemplateScoreExplanation: templateScoreExplanation,
      rating: typeof row.rating === 'number' ? row.rating : null,
      intensity: null,
      note: row.note ?? null,
      dateKey,
      focusCategoryId: templateId,
      focusName: templateName,
      focusColor: undefined,
      activityTitle: row.activities?.title ?? null,
    };
  }, []);

  const mapFocusPossibleRow = useCallback((row: any): FocusPossibleEntry => {
    const activityDate = row.activities?.activity_date as string | null;
    const activityTime = row.activities?.activity_time as string | null;
    const eventId = row.activities?.external_event_id as string | null;
    const ownerId = row.activities?.user_id as string | null;
    const dateKey = toDateKey(activityDate || row.created_at);
    const templateId = row.task_template_id ? String(row.task_template_id) : null;
    const templateName = row.task_templates?.title ?? 'Feedback opgaver';

    return {
      templateId,
      templateName,
      dateKey,
      activityId: row.activity_id ? String(row.activity_id) : null,
      sessionKey: buildSessionKey({
        eventId,
        userId: ownerId,
        date: activityDate || row.created_at,
        time: activityTime,
      }),
    };
  }, []);

  const mapIntensityRow = useCallback(
    (row: any): ProgressionEntry => {
      const activityDate: string | null = row.activity_date ?? null;
      const activityTime: string | null = row.activity_time ?? null;
      const eventId: string | null = row.external_event_id ?? null;
      const ownerId: string | null = row.user_id ?? null;
      const createdAt: string = activityDate || row.created_at || new Date().toISOString();
      const dateKey = toDateKey(activityDate || row.createdAt);
      const categoryId = row.category_id ? String(row.category_id) : null;
      const categoryMeta = categoryId ? categoryMap[categoryId] : undefined;

      return {
        id: String(row.id),
        kind: 'intensity',
        createdAt,
        activityId: row.id ? String(row.id) : null,
        taskTemplateId: null,
        taskTemplateName: null,
        activityTitle: row.title ?? null,
        rating: null,
        intensity: typeof row.intensity === 'number' ? row.intensity : null,
        note: typeof row.intensity_note === 'string' ? row.intensity_note : null,
        dateKey,
        focusCategoryId: categoryId,
        focusName: categoryMeta?.name ?? 'Ukendt kategori',
        focusColor: categoryMeta?.color,
        sessionKey: buildSessionKey({
          eventId,
          userId: ownerId,
          date: activityDate || row.created_at,
          time: activityTime,
        }),
      };
    },
    [categoryMap]
  );

  const fetchEntries = useCallback(async () => {
    runIfMounted(() => {
      setIsLoading(true);
      setError(null);
    });

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        console.info('[useProgressionData] Skipping progression fetch – no active session');
        clearDataState();
        runIfMounted(() => setRequiresLogin(true));
        return;
      }

      runIfMounted(() => setRequiresLogin(false));

      const {
        periodStart,
        periodEndExclusive,
        previousStart,
        periodStartDate,
        periodEndDate,
        previousStartDate,
        previousEndDate,
        periodEndInclusiveDate,
      } = buildPeriodBounds(days);

      const focusSelect = `
        id,
        rating,
        note,
        created_at,
        task_instance_id,
        task_template_id,
        activity_id
      `;

      const activityTaskSelect = `
        id,
        created_at,
        activity_id,
        task_template_id,
        task_templates ( title ),
        activities!inner ( activity_date, activity_time, user_id, external_event_id )
      `;

      const activitySelect = 'id, activity_date, activity_time, category_id, intensity, intensity_note, title, user_id, created_at, external_event_id';
      const externalTaskSelect = `
        id,
        created_at,
        local_meta_id,
        task_template_id,
        feedback_template_id,
        task_templates ( title ),
        events_local_meta!inner (
          id,
          user_id,
          external_event_id,
          events_external!inner (
            id,
            start_date,
            start_time
          )
        )
      `;
      const externalIntensitySelect = `
        id,
        user_id,
        category_id,
        intensity,
        intensity_note,
        intensity_enabled,
        local_title_override,
        external_event_id,
        created_at,
        events_external!inner (
          id,
          start_date,
          start_time,
          title
        )
      `;
      const taskCounterInternalSelect =
        'id, activity_id, completed, title, description, task_template_id, feedback_template_id, activities!inner ( activity_date, user_id )';
      const taskCounterExternalSelect = `
        id,
        title,
        description,
        local_meta_id,
        task_template_id,
        feedback_template_id,
        completed,
        events_local_meta!inner (
          id,
          user_id,
          external_event_id,
          events_external!inner (
            start_date,
            deleted
          )
        )
      `;

      const [
        { data: focusCurrent, error: focusCurrentError },
        { data: focusPrevious, error: focusPreviousError },
        { data: possibleCurrent, error: possibleCurrentError },
        { data: possiblePrevious, error: possiblePreviousError },
        { data: intensityCurrent, error: intensityCurrentError },
        { data: intensityPrevious, error: intensityPreviousError },
        { data: externalPossibleCurrent, error: externalPossibleCurrentError },
        { data: externalPossiblePrevious, error: externalPossiblePreviousError },
        { data: externalIntensityCurrent, error: externalIntensityCurrentError },
        { data: externalIntensityPrevious, error: externalIntensityPreviousError },
        { data: taskCounterInternalCurrent, error: taskCounterInternalCurrentError },
        { data: taskCounterInternalPrevious, error: taskCounterInternalPreviousError },
        { data: taskCounterExternalCurrent, error: taskCounterExternalCurrentError },
        { data: taskCounterExternalPrevious, error: taskCounterExternalPreviousError },
      ] = await Promise.all([
        (supabase as any)
          .from('task_template_self_feedback')
          .select(focusSelect)
          .eq('user_id', userId)
          .gte('created_at', periodStart.toISOString())
          .order('created_at', { ascending: true }),
        (supabase as any)
          .from('task_template_self_feedback')
          .select(focusSelect)
          .eq('user_id', userId)
          .gte('created_at', previousStart.toISOString())
          .lt('created_at', periodStart.toISOString())
          .order('created_at', { ascending: true }),
        supabase
          .from('activity_tasks')
          .select(activityTaskSelect)
          .not('task_template_id', 'is', null)
          .gte('activities.activity_date', periodStartDate)
          .lt('activities.activity_date', periodEndDate)
          .eq('activities.user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('activity_tasks')
          .select(activityTaskSelect)
          .not('task_template_id', 'is', null)
          .gte('activities.activity_date', previousStartDate)
          .lt('activities.activity_date', periodStartDate)
          .eq('activities.user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('activities')
          .select(activitySelect)
          .eq('user_id', userId)
          .gte('activity_date', periodStartDate)
          .lt('activity_date', periodEndDate)
          .order('activity_date', { ascending: true }),
        supabase
          .from('activities')
          .select(activitySelect)
          .eq('user_id', userId)
          .gte('activity_date', previousStartDate)
          .lt('activity_date', periodStartDate)
          .order('activity_date', { ascending: true }),
        supabase
          .from('external_event_tasks')
          .select(externalTaskSelect)
          .or('task_template_id.not.is.null,feedback_template_id.not.is.null')
          .eq('events_local_meta.user_id', userId)
          .gte('events_local_meta.events_external.start_date', periodStartDate)
          .lt('events_local_meta.events_external.start_date', periodEndDate)
          .order('created_at', { ascending: true }),
        supabase
          .from('external_event_tasks')
          .select(externalTaskSelect)
          .or('task_template_id.not.is.null,feedback_template_id.not.is.null')
          .eq('events_local_meta.user_id', userId)
          .gte('events_local_meta.events_external.start_date', previousStartDate)
          .lt('events_local_meta.events_external.start_date', periodStartDate)
          .order('created_at', { ascending: true }),
        supabase
          .from('events_local_meta')
          .select(externalIntensitySelect)
          .eq('user_id', userId)
          .gte('events_external.start_date', periodStartDate)
          .lt('events_external.start_date', periodEndDate),
        supabase
          .from('events_local_meta')
          .select(externalIntensitySelect)
          .eq('user_id', userId)
          .gte('events_external.start_date', previousStartDate)
          .lt('events_external.start_date', periodStartDate),
        supabase
          .from('activity_tasks')
          .select(taskCounterInternalSelect)
          .eq('activities.user_id', userId)
          .gte('activities.activity_date', periodStartDate)
          .lt('activities.activity_date', periodEndDate),
        supabase
          .from('activity_tasks')
          .select(taskCounterInternalSelect)
          .eq('activities.user_id', userId)
          .gte('activities.activity_date', previousStartDate)
          .lt('activities.activity_date', previousEndDate),
        supabase
          .from('external_event_tasks')
          .select(taskCounterExternalSelect)
          .eq('events_local_meta.user_id', userId)
          .gte('events_local_meta.events_external.start_date', periodStartDate)
          .lt('events_local_meta.events_external.start_date', periodEndDate),
        supabase
          .from('external_event_tasks')
          .select(taskCounterExternalSelect)
          .eq('events_local_meta.user_id', userId)
          .gte('events_local_meta.events_external.start_date', previousStartDate)
          .lt('events_local_meta.events_external.start_date', previousEndDate),
      ]);

      if (focusCurrentError) throw focusCurrentError;
      if (focusPreviousError) throw focusPreviousError;
      if (possibleCurrentError) throw possibleCurrentError;
      if (possiblePreviousError) throw possiblePreviousError;
      if (intensityCurrentError) throw intensityCurrentError;
      if (intensityPreviousError) throw intensityPreviousError;
      if (externalPossibleCurrentError) throw externalPossibleCurrentError;
      if (externalPossiblePreviousError) throw externalPossiblePreviousError;
      if (externalIntensityCurrentError) throw externalIntensityCurrentError;
      if (externalIntensityPreviousError) throw externalIntensityPreviousError;
      if (taskCounterInternalCurrentError) throw taskCounterInternalCurrentError;
      if (taskCounterInternalPreviousError) throw taskCounterInternalPreviousError;
      if (taskCounterExternalCurrentError) throw taskCounterExternalCurrentError;
      if (taskCounterExternalPreviousError) throw taskCounterExternalPreviousError;

      const normalizeId = (value: unknown): string | null => {
        if (value === null || value === undefined) return null;
        const normalized = String(value).trim();
        return normalized.length ? normalized : null;
      };
      const normalizeFeedbackTitle = (value?: string | null): string => {
        if (typeof value !== 'string') return '';
        return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
      };
      const isFeedbackTitle = (value?: string | null): boolean => {
        return normalizeFeedbackTitle(value).startsWith('feedback pa');
      };
      const feedbackAnswered = (row: any): boolean => {
        const hasScore = typeof row?.rating === 'number';
        const hasNote = typeof row?.note === 'string' && row.note.trim().length > 0;
        return hasScore || hasNote;
      };
      const feedbackByActivityTask: Record<string, any> = {};
      const feedbackByActivityTemplate: Record<string, any> = {};
      const shouldIncludeExternalTaskInCounter = (task: any): boolean => {
        const externalEvent = task?.events_local_meta?.events_external;
        const startDate = typeof externalEvent?.start_date === 'string' ? externalEvent.start_date : null;
        if (!startDate) return false;

        const isSoftDeleted = externalEvent?.deleted === true;
        const isCompleted = task?.completed === true;
        return !isSoftDeleted || isCompleted;
      };
      const getExternalActivityCandidateIds = (task: any): string[] => {
        const ids = new Set<string>();
        const push = (value: unknown) => {
          const id = normalizeId(value);
          if (id) ids.add(id);
        };
        push(task?.local_meta_id);
        push(task?.events_local_meta?.id);
        push(task?.events_local_meta?.external_event_id);
        return Array.from(ids);
      };

      const taskCounterExternalCurrentFiltered = (taskCounterExternalCurrent || []).filter(shouldIncludeExternalTaskInCounter);
      const taskCounterExternalPreviousFiltered = (taskCounterExternalPrevious || []).filter(shouldIncludeExternalTaskInCounter);
      const taskCounterActivityIdSet = new Set<string>();
      [...(taskCounterInternalCurrent || []), ...(taskCounterInternalPrevious || [])].forEach((row: any) => {
        const activityId = normalizeId(row?.activity_id);
        if (activityId) taskCounterActivityIdSet.add(activityId);
      });
      [...taskCounterExternalCurrentFiltered, ...taskCounterExternalPreviousFiltered].forEach((row: any) => {
        getExternalActivityCandidateIds(row).forEach(activityId => taskCounterActivityIdSet.add(activityId));
      });
      const taskCounterActivityIds = Array.from(taskCounterActivityIdSet);
      if (taskCounterActivityIds.length) {
        const { data: taskCounterFeedbackRows, error: taskCounterFeedbackError } = await supabase
          .from('task_template_self_feedback')
          .select('activity_id, task_template_id, task_instance_id, rating, note, created_at')
          .eq('user_id', userId)
          .in('activity_id', taskCounterActivityIds)
          .order('created_at', { ascending: false });

        if (taskCounterFeedbackError) throw taskCounterFeedbackError;

        (taskCounterFeedbackRows || []).forEach((row: any) => {
          const activityId = normalizeId(row?.activity_id);
          const taskInstanceId = normalizeId(row?.task_instance_id);
          const templateId = normalizeId(row?.task_template_id);
          if (activityId && taskInstanceId) {
            const key = `${activityId}::${taskInstanceId}`;
            if (!feedbackByActivityTask[key]) feedbackByActivityTask[key] = row;
          }
          if (activityId && templateId) {
            const key = `${activityId}::${templateId}`;
            if (!feedbackByActivityTemplate[key]) feedbackByActivityTemplate[key] = row;
          }
        });
      }
      const isInternalTaskCompletedForCounter = (taskRow: any): boolean => {
        if (taskRow?.completed === true) return true;
        const activityId = normalizeId(taskRow?.activity_id);
        const taskId = normalizeId(taskRow?.id);
        const feedbackTemplateId = normalizeId(taskRow?.feedback_template_id);
        const templateId = normalizeId(taskRow?.task_template_id);
        const markerTemplateId =
          normalizeId(
            parseTemplateIdFromMarker(typeof taskRow?.description === 'string' ? taskRow.description : '') ||
            parseTemplateIdFromMarker(typeof taskRow?.title === 'string' ? taskRow.title : '')
          );
        const looksLikeFeedbackTask = !!feedbackTemplateId || !!markerTemplateId || isFeedbackTitle(taskRow?.title);
        if (!looksLikeFeedbackTask || !activityId) return false;

        if (taskId) {
          const byTask = feedbackByActivityTask[`${activityId}::${taskId}`];
          if (feedbackAnswered(byTask)) return true;
        }
        const templateKey = feedbackTemplateId ?? markerTemplateId ?? templateId;
        if (templateKey) {
          const byTemplate = feedbackByActivityTemplate[`${activityId}::${templateKey}`];
          if (feedbackAnswered(byTemplate)) return true;
        }
        return false;
      };
      const isExternalTaskCompletedForCounter = (taskRow: any): boolean => {
        if (taskRow?.completed === true) return true;

        const taskId = normalizeId(taskRow?.id);
        const feedbackTemplateId = normalizeId(taskRow?.feedback_template_id);
        const templateId = normalizeId(taskRow?.task_template_id);
        const markerTemplateId =
          normalizeId(
            parseTemplateIdFromMarker(typeof taskRow?.description === 'string' ? taskRow.description : '') ||
            parseTemplateIdFromMarker(typeof taskRow?.title === 'string' ? taskRow.title : '')
          );
        const templateKey = feedbackTemplateId ?? markerTemplateId ?? templateId;
        const looksLikeFeedbackTask = !!feedbackTemplateId || !!markerTemplateId || isFeedbackTitle(taskRow?.title);
        if (!looksLikeFeedbackTask) return false;

        const activityIds = getExternalActivityCandidateIds(taskRow);
        if (!activityIds.length) return false;

        for (const activityId of activityIds) {
          if (taskId) {
            const byTask = feedbackByActivityTask[`${activityId}::${taskId}`];
            if (feedbackAnswered(byTask)) return true;
          }
          if (templateKey) {
            const byTemplate = feedbackByActivityTemplate[`${activityId}::${templateKey}`];
            if (feedbackAnswered(byTemplate)) return true;
          }
        }

        return false;
      };

      const focusRows = [...(focusCurrent || []), ...(focusPrevious || [])];
      const possibleTemplateIds = [
        ...(possibleCurrent || []).map(row => row?.task_template_id),
        ...(possiblePrevious || []).map(row => row?.task_template_id),
        ...(externalPossibleCurrent || []).map(row => row?.task_template_id ?? row?.feedback_template_id),
        ...(externalPossiblePrevious || []).map(row => row?.task_template_id ?? row?.feedback_template_id),
      ];
      const uniqueTemplateIds = Array.from(
        new Set(
          [...focusRows.map(row => row?.task_template_id), ...possibleTemplateIds]
            .filter(Boolean)
            .map((id: any) => String(id))
        )
      );
      const uniqueActivityIds = Array.from(
        new Set(
          focusRows
            .map(row => row?.activity_id)
            .filter(Boolean)
            .map((id: any) => String(id))
        )
      );

      const chunkArray = <T,>(items: T[], size: number): T[][] => {
        if (!Array.isArray(items) || items.length === 0) return [];
        const chunks: T[][] = [];
        for (let i = 0; i < items.length; i += size) {
          chunks.push(items.slice(i, i + size));
        }
        return chunks;
      };

      const templateTitleById = new Map<string, string>();
      const templateMetaById = new Map<string, { title: string; description: string | null; scoreExplanation: string | null }>();
      if (uniqueTemplateIds.length) {
        for (const chunk of chunkArray(uniqueTemplateIds, 50)) {
          const { data, error } = await supabase
            .from('task_templates')
            .select('id, title, description, after_training_feedback_score_explanation')
            .in('id', chunk);
          if (error) throw error;
          (data || []).forEach((row: any) => {
            if (!row?.id) return;
            const title = row.title ?? 'Feedback opgaver';
            templateTitleById.set(String(row.id), title);
            templateMetaById.set(String(row.id), {
              title,
              description: row.description ?? null,
              scoreExplanation: row.after_training_feedback_score_explanation ?? null,
            });
          });
        }
      }

      const activityMetaById = new Map<
        string,
        {
          activity_date: string | null;
          activity_time?: string | null;
          title: string | null;
          event_id?: string | null;
          external_event_id?: string | null;
          user_id?: string | null;
        }
      >();
      if (uniqueActivityIds.length) {
        for (const chunk of chunkArray(uniqueActivityIds, 50)) {
          const { data, error } = await supabase
            .from('activities')
            .select('id, activity_date, activity_time, title, external_event_id, user_id')
            .in('id', chunk);
          if (error) throw error;
          (data || []).forEach((row: any) => {
            if (!row?.id) return;
            activityMetaById.set(String(row.id), {
              activity_date: row.activity_date ?? null,
              activity_time: row.activity_time ?? null,
              title: row.title ?? null,
              external_event_id: row.external_event_id ?? null,
              user_id: row.user_id ?? null,
            });
          });
        }
      }

      const missingActivityIds = uniqueActivityIds.filter(id => !activityMetaById.has(id));
      if (missingActivityIds.length) {
        for (const chunk of chunkArray(missingActivityIds, 50)) {
          const { data, error } = await supabase
            .from('events_local_meta')
            .select(`
              id,
              user_id,
              external_event_id,
              events_external!inner (
                id,
                start_date,
                start_time,
                title
              )
            `)
            .in('id', chunk);
          if (error) throw error;
          (data || []).forEach((row: any) => {
            if (!row?.id) return;
            const event = row.events_external ?? {};
            activityMetaById.set(String(row.id), {
              activity_date: event.start_date ?? null,
              activity_time: event.start_time ?? null,
              title: event.title ?? null,
              event_id: event.id ?? null,
              external_event_id: row.external_event_id ?? null,
              user_id: row.user_id ?? null,
            });
          });
        }
      }

      const stillMissingActivityIds = uniqueActivityIds.filter(id => !activityMetaById.has(id));
      if (stillMissingActivityIds.length) {
        for (const chunk of chunkArray(stillMissingActivityIds, 50)) {
          const { data, error } = await supabase
            .from('events_external')
            .select('id, start_date, start_time, title')
            .in('id', chunk);
          if (error) throw error;
          (data || []).forEach((row: any) => {
            if (!row?.id) return;
            activityMetaById.set(String(row.id), {
              activity_date: row.start_date ?? null,
              activity_time: row.start_time ?? null,
              title: row.title ?? null,
              event_id: row.id ?? null,
            });
          });
        }
      }

      const enrichFocusRow = (row: any) => {
        const activityId = row?.activity_id ? String(row.activity_id) : '';
        const templateId = row?.task_template_id ? String(row.task_template_id) : '';
        return {
          ...row,
          activities: activityId && activityMetaById.has(activityId) ? activityMetaById.get(activityId) : null,
          task_templates: templateId && templateMetaById.has(templateId)
            ? {
                title: templateMetaById.get(templateId)?.title ?? 'Feedback opgaver',
                description: templateMetaById.get(templateId)?.description ?? null,
                after_training_feedback_score_explanation:
                  templateMetaById.get(templateId)?.scoreExplanation ?? null,
              }
            : null,
        };
      };

      const mapFocusEntryWithSession = (row: any): ProgressionEntry => {
        const enriched = enrichFocusRow(row);
        const entry = mapFocusFeedbackRow(enriched);
        const meta = (enriched as any)?.activities ?? {};
        return {
          ...entry,
          sessionKey: buildSessionKey({
            eventId: meta?.event_id ?? meta?.external_event_id ?? null,
            userId: meta?.user_id ?? userId,
            date: meta?.activity_date ?? null,
            time: meta?.activity_time ?? null,
          }),
        };
      };

      const mapExternalPossibleRow = (row: any): FocusPossibleEntry => {
        const meta = row.events_local_meta ?? {};
        const event = meta.events_external ?? {};
        const activityDate = event.start_date ?? null;
        const activityTime = event.start_time ?? null;
        const ownerId = meta.user_id ?? userId;
        const eventId = event.id ?? meta.external_event_id ?? null;
        const templateId =
          row.task_template_id ? String(row.task_template_id) : row.feedback_template_id ? String(row.feedback_template_id) : null;
        const templateName =
          row.task_templates?.title ??
          (templateId ? templateMetaById.get(templateId)?.title : null) ??
          'Feedback opgaver';
        const activityId = row.local_meta_id ?? meta.id ?? null;

        return {
          templateId,
          templateName,
          dateKey: toDateKey(activityDate || row.created_at),
          activityId: activityId ? String(activityId) : null,
          sessionKey: buildSessionKey({
            eventId,
            userId: ownerId,
            date: activityDate || row.created_at,
            time: activityTime,
          }),
        };
      };

      const mapExternalIntensityRow = (row: any): ProgressionEntry => {
        const event = row.events_external ?? {};
        const activityDate: string | null = event.start_date ?? null;
        const activityTime: string | null = event.start_time ?? null;
        const createdAt: string = activityDate || row.created_at || new Date().toISOString();
        const dateKey = toDateKey(activityDate || row.created_at);
        const categoryId = row.category_id ? String(row.category_id) : null;
        const categoryMeta = categoryId ? categoryMap[categoryId] : undefined;
        const eventId = event.id ?? row.external_event_id ?? null;

        return {
          id: String(row.id),
          kind: 'intensity',
          createdAt,
          activityId: row.id ? String(row.id) : null,
          taskTemplateId: null,
          taskTemplateName: null,
          activityTitle: row.local_title_override ?? event.title ?? null,
          rating: null,
          intensity: typeof row.intensity === 'number' ? row.intensity : null,
          note: typeof row.intensity_note === 'string' ? row.intensity_note : null,
          dateKey,
          focusCategoryId: categoryId,
          focusName: categoryMeta?.name ?? 'Ukendt kategori',
          focusColor: categoryMeta?.color,
          sessionKey: buildSessionKey({
            eventId,
            userId: row.user_id ?? userId,
            date: activityDate || row.created_at,
            time: activityTime,
          }),
        };
      };

      const mappedFocusCurrent = (focusCurrent || []).map(mapFocusEntryWithSession);
      const mappedFocusPrevious = (focusPrevious || []).map(mapFocusEntryWithSession);
      const mappedPossibleCurrent = [
        ...(possibleCurrent || []).map(mapFocusPossibleRow),
        ...(externalPossibleCurrent || []).map(mapExternalPossibleRow),
      ];
      const mappedPossiblePrevious = [
        ...(possiblePrevious || []).map(mapFocusPossibleRow),
        ...(externalPossiblePrevious || []).map(mapExternalPossibleRow),
      ];
      const mapTaskCounterId = (prefix: 'internal' | 'external', row: any) => {
        const raw = row?.id;
        if (raw === null || raw === undefined) return null;
        const normalized = String(raw).trim();
        if (!normalized.length) return null;
        return `${prefix}:${normalized}`;
      };
      const toCurrentPossibleIds = [
        ...(taskCounterInternalCurrent || []).map(row => mapTaskCounterId('internal', row)),
        ...taskCounterExternalCurrentFiltered.map(row => mapTaskCounterId('external', row)),
      ].filter(Boolean) as string[];
      const toCurrentCompletedIds = [
        ...(taskCounterInternalCurrent || [])
          .filter(row => isInternalTaskCompletedForCounter(row))
          .map(row => mapTaskCounterId('internal', row)),
        ...taskCounterExternalCurrentFiltered
          .filter(row => isExternalTaskCompletedForCounter(row))
          .map(row => mapTaskCounterId('external', row)),
      ].filter(Boolean) as string[];
      const toPreviousPossibleIds = [
        ...(taskCounterInternalPrevious || []).map(row => mapTaskCounterId('internal', row)),
        ...taskCounterExternalPreviousFiltered.map(row => mapTaskCounterId('external', row)),
      ].filter(Boolean) as string[];
      const toPreviousCompletedIds = [
        ...(taskCounterInternalPrevious || [])
          .filter(row => isInternalTaskCompletedForCounter(row))
          .map(row => mapTaskCounterId('internal', row)),
        ...taskCounterExternalPreviousFiltered
          .filter(row => isExternalTaskCompletedForCounter(row))
          .map(row => mapTaskCounterId('external', row)),
      ].filter(Boolean) as string[];
      const mappedIntensityCurrent = [
        ...(intensityCurrent || []).map(mapIntensityRow),
        ...(externalIntensityCurrent || []).map(mapExternalIntensityRow),
      ];
      const mappedIntensityPrevious = [
        ...(intensityPrevious || []).map(mapIntensityRow),
        ...(externalIntensityPrevious || []).map(mapExternalIntensityRow),
      ];

      const templateNameLookup = new Map<string, string>();
      mappedFocusCurrent
        .filter((entry: ProgressionEntry) => typeof entry.rating === 'number')
        .forEach((entry: ProgressionEntry) => {
          if (!entry.taskTemplateId) return;
          const resolvedName =
            entry.taskTemplateName ??
            entry.focusName ??
            templateMetaById.get(entry.taskTemplateId)?.title ??
            null;
          if (!resolvedName || resolvedName === 'Feedback opgaver') return;
          templateNameLookup.set(entry.taskTemplateId, resolvedName);
        });

      const templateOptions: FocusTemplateOption[] = Array.from(templateNameLookup.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      runIfMounted(() => {
        setFocusEntries(mappedFocusCurrent);
        setFocusEntriesPrevious(mappedFocusPrevious);
        setFocusPossible(mappedPossibleCurrent);
        setFocusPossiblePrevious(mappedPossiblePrevious);
        setHomeAlignedTaskCounter({
          periodStart: periodStartDate,
          periodEnd: periodEndDate,
          possibleIds: toCurrentPossibleIds,
          completedIds: toCurrentCompletedIds,
        });
        setHomeAlignedTaskCounterPrevious({
          periodStart: previousStartDate,
          periodEnd: previousEndDate,
          possibleIds: toPreviousPossibleIds,
          completedIds: toPreviousCompletedIds,
        });
        setFocusTemplates(templateOptions);
        setIntensityEntries(mappedIntensityCurrent);
        setIntensityEntriesPrevious(mappedIntensityPrevious);
        setLastUpdated(new Date());
      });

      const userEmail = String(sessionData?.session?.user?.email ?? '').toLowerCase();
      if (__DEV__ && userEmail === 'mhe0405@gmail.com') {
        console.log('[RECON][PerformanceCounter]', {
          periodStart: periodStartDate,
          periodEnd: periodEndInclusiveDate,
          perfPossibleTaskIdsCount: toCurrentPossibleIds.length,
          perfPossibleTaskIdsSample: toCurrentPossibleIds.slice(0, 5),
          perfCompletedTaskIdsCount: toCurrentCompletedIds.length,
          perfCompletedTaskIdsSample: toCurrentCompletedIds.slice(0, 5),
        });
      }
    } catch (err: any) {
      console.error('[useProgressionData] fetch failed:', err);
      clearDataState();
      runIfMounted(() => {
        setRequiresLogin(false);
        setError(err?.message ?? 'Kunne ikke hente progression');
      });
    } finally {
      runIfMounted(() => setIsLoading(false));
    }
  }, [days, mapFocusFeedbackRow, mapFocusPossibleRow, mapIntensityRow, categoryMap, clearDataState, runIfMounted]);

  const scheduleRefetch = useCallback(
    (delayMs: number = 250) => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        refreshTimeoutRef.current = null;
        fetchEntries();
      }, delayMs);
    },
    [fetchEntries],
  );

  useEffect(() => {
    const handleRefresh = () => scheduleRefetch(250);
    const refreshSub = DeviceEventEmitter.addListener('progression:refresh', handleRefresh);

    return () => {
      refreshSub.remove();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [scheduleRefetch]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const filteredFocusEntries = useMemo(() => {
    if (!focusTaskTemplateId) return focusEntries;
    return focusEntries.filter(entry => entry.taskTemplateId === focusTaskTemplateId);
  }, [focusEntries, focusTaskTemplateId]);

  const filteredFocusPrevious = useMemo(() => {
    if (!focusTaskTemplateId) return focusEntriesPrevious;
    return focusEntriesPrevious.filter(entry => entry.taskTemplateId === focusTaskTemplateId);
  }, [focusEntriesPrevious, focusTaskTemplateId]);

  const filteredFocusPossible = useMemo(() => {
    if (!focusTaskTemplateId) return focusPossible;
    return focusPossible.filter(entry => entry.templateId === focusTaskTemplateId);
  }, [focusPossible, focusTaskTemplateId]);

  const filteredFocusPossiblePrevious = useMemo(() => {
    if (!focusTaskTemplateId) return focusPossiblePrevious;
    return focusPossiblePrevious.filter(entry => entry.templateId === focusTaskTemplateId);
  }, [focusPossiblePrevious, focusTaskTemplateId]);

  const filteredIntensityEntries = useMemo(() => {
    if (!intensityCategoryId) return intensityEntries;
    return intensityEntries.filter(entry => entry.focusCategoryId === intensityCategoryId);
  }, [intensityEntries, intensityCategoryId]);

  const filteredIntensityPrevious = useMemo(() => {
    if (!intensityCategoryId) return intensityEntriesPrevious;
    return intensityEntriesPrevious.filter(entry => entry.focusCategoryId === intensityCategoryId);
  }, [intensityEntriesPrevious, intensityCategoryId]);
  const focusPossibleDeduped = useMemo(() => {
    const seen = new Set<string>();
    return filteredFocusPossible.filter(entry => {
      const baseKey = resolveBaseKey(entry);
      const key = `${baseKey}::${entry.templateId ?? 'none'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredFocusPossible]);

  const focusPossibleAllDeduped = useMemo(() => {
    const seen = new Set<string>();
    return focusPossible.filter(entry => {
      const baseKey = resolveBaseKey(entry);
      const key = `${baseKey}::${entry.templateId ?? 'none'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [focusPossible]);

  const focusPossiblePreviousDeduped = useMemo(() => {
    const seen = new Set<string>();
    return filteredFocusPossiblePrevious.filter(entry => {
      const baseKey = resolveBaseKey(entry);
      const key = `${baseKey}::${entry.templateId ?? 'none'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredFocusPossiblePrevious]);

  const focusCompletedDeduped = useMemo(() => {
    return dedupeByLatestCreatedAt(
      filteredFocusEntries,
      (entry) => `${resolveFeedbackBaseKey(entry)}::${entry.taskTemplateId ?? 'none'}`
    ).filter((entry) => typeof entry.rating === 'number');
  }, [filteredFocusEntries]);

  const focusCompletedAllDeduped = useMemo(() => {
    return dedupeByLatestCreatedAt(
      focusEntries,
      (entry) => `${resolveFeedbackBaseKey(entry)}::${entry.taskTemplateId ?? 'none'}`
    ).filter((entry) => typeof entry.rating === 'number');
  }, [focusEntries]);

  const focusCompletedPreviousDeduped = useMemo(() => {
    return dedupeByLatestCreatedAt(
      filteredFocusPrevious,
      (entry) => `${resolveFeedbackBaseKey(entry)}::${entry.taskTemplateId ?? 'none'}`
    ).filter((entry) => typeof entry.rating === 'number');
  }, [filteredFocusPrevious]);

  const intensityPossibleDeduped = useMemo(() => {
    return dedupeByLatestCreatedAt(
      filteredIntensityEntries,
      (entry) => resolveBaseKey(entry)
    );
  }, [filteredIntensityEntries]);

  const intensityPossiblePreviousDeduped = useMemo(() => {
    return dedupeByLatestCreatedAt(
      filteredIntensityPrevious,
      (entry) => resolveBaseKey(entry)
    );
  }, [filteredIntensityPrevious]);

  const intensityCompletedDeduped = useMemo(() => {
    const possibleKeys = new Set<string>(
      intensityPossibleDeduped.map(entry => resolveBaseKey(entry))
    );
    return dedupeByLatestCreatedAt(
      filteredIntensityEntries,
      (entry) => resolveBaseKey(entry)
    )
      .filter(entry => typeof entry.intensity === 'number')
      .filter(entry => {
        const key = resolveBaseKey(entry);
        if (possibleKeys.size && !possibleKeys.has(key)) return false;
        return true;
      });
  }, [filteredIntensityEntries, intensityPossibleDeduped]);

  const intensityCompletedPreviousDeduped = useMemo(() => {
    const possibleKeys = new Set<string>(
      intensityPossiblePreviousDeduped.map(entry => resolveBaseKey(entry))
    );
    return dedupeByLatestCreatedAt(
      filteredIntensityPrevious,
      (entry) => resolveBaseKey(entry)
    )
      .filter(entry => typeof entry.intensity === 'number')
      .filter(entry => {
        const key = resolveBaseKey(entry);
        if (possibleKeys.size && !possibleKeys.has(key)) return false;
        return true;
      });
  }, [filteredIntensityPrevious, intensityPossiblePreviousDeduped]);

  const trendPoints = useMemo(() => {
    const sourceEntries = metric === 'rating' ? focusCompletedDeduped : intensityCompletedDeduped;
    return sourceEntries
      .map(entry => {
        const dateKey = entry.dateKey || entry.createdAt.slice(0, 10);
        const parsedDate = (() => {
          try {
            return parseISO(`${dateKey || entry.createdAt.slice(0, 10)}T00:00:00`);
          } catch (error) {
            return new Date(entry.createdAt);
          }
        })();
        return {
          id: entry.id,
          dateKey,
          dateLabel: format(parsedDate, 'dd MMM'),
          value: metric === 'rating' ? (entry.rating ?? 0) : (entry.intensity ?? 0),
          representative: entry,
          sampleCount: 1,
        } as TrendPoint;
      })
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  }, [focusCompletedDeduped, intensityCompletedDeduped, metric]);

  const heatmapRows = useMemo<HeatmapRow[]>(() => [], []);

  const summary = useMemo<ProgressionSummary>(() => {
    return computeProgressionSummary({
      metric,
      days,
      focusCompleted: focusCompletedDeduped,
      focusCompletedPrevious: focusCompletedPreviousDeduped,
      intensityCompleted: intensityCompletedDeduped,
      intensityCompletedPrevious: intensityCompletedPreviousDeduped,
      intensityPossible: intensityPossibleDeduped,
      intensityPossiblePrevious: intensityPossiblePreviousDeduped,
      ratingPossibleCount: homeAlignedTaskCounter.possibleIds.length,
      ratingCompletedCount: homeAlignedTaskCounter.completedIds.length,
      ratingPreviousPossibleCount: homeAlignedTaskCounterPrevious.possibleIds.length,
      ratingPreviousCompletedCount: homeAlignedTaskCounterPrevious.completedIds.length,
    });
  }, [
    days,
    focusCompletedDeduped,
    focusCompletedPreviousDeduped,
    homeAlignedTaskCounter.completedIds.length,
    homeAlignedTaskCounter.possibleIds.length,
    homeAlignedTaskCounterPrevious.completedIds.length,
    homeAlignedTaskCounterPrevious.possibleIds.length,
    intensityCompletedDeduped,
    intensityCompletedPreviousDeduped,
    intensityPossibleDeduped,
    intensityPossiblePreviousDeduped,
    metric,
  ]);

  const activeEntries = metric === 'rating' ? focusCompletedDeduped : intensityCompletedDeduped;
  const intensityCategoriesWithData = useMemo(
    () => Array.from(new Set(intensityEntries.map(entry => entry.focusCategoryId).filter(Boolean))) as string[],
    [intensityEntries]
  );

  const possibleCount = metric === 'rating' ? homeAlignedTaskCounter.possibleIds.length : intensityPossibleDeduped.length;

  return {
    isLoading,
    error,
    trendPoints,
    heatmapRows,
    summary,
    rawEntries: activeEntries,
    allFocusEntries: focusCompletedAllDeduped,
    lastUpdated,
    refetch: fetchEntries,
    focusTemplates,
    intensityCategoriesWithData,
    possibleCount,
    requiresLogin,
  };
}
