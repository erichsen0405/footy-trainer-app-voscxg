import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subDays, startOfDay, parseISO, format, differenceInCalendarDays, addDays } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { ActivityCategory } from '@/types';

export type ProgressionMetric = 'rating' | 'intensity';

export interface ProgressionEntry {
  id: string;
  kind: ProgressionMetric;
  createdAt: string;
  activityId: string | null;
  taskTemplateId: string | null;
  taskTemplateName?: string | null;
  activityTitle?: string | null;
  rating: number | null;
  intensity: number | null;
  note: string | null;
  dateKey: string;
  focusCategoryId: string | null;
  focusName: string;
  focusColor?: string;
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
  lastUpdated: Date | null;
  refetch: () => Promise<void>;
  focusTemplates: FocusTemplateOption[];
  intensityCategoriesWithData: string[];
  possibleCount: number;
  requiresLogin: boolean;
}

const SUCCESS_THRESHOLD = 7;

const toDateKey = (value?: string | null) => (value ? value.slice(0, 10) : '');

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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [requiresLogin, setRequiresLogin] = useState(false);
  const mountedRef = useRef(true);

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
    const templateName = row.task_templates?.title ?? 'Fokusopgave';

    return {
      id: String(row.id),
      kind: 'rating',
      createdAt: createdIso,
      activityId: row.activity_id ? String(row.activity_id) : null,
      taskTemplateId: templateId,
      taskTemplateName: templateName,
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
    const dateKey = toDateKey(activityDate || row.created_at);
    const templateId = row.task_template_id ? String(row.task_template_id) : null;
    const templateName = row.task_templates?.title ?? 'Fokusopgave';

    return {
      templateId,
      templateName,
      dateKey,
      activityId: row.activity_id ? String(row.activity_id) : null,
    };
  }, []);

  const mapIntensityRow = useCallback(
    (row: any): ProgressionEntry => {
      const activityDate: string | null = row.activity_date ?? null;
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
        note: null,
        dateKey,
        focusCategoryId: categoryId,
        focusName: categoryMeta?.name ?? 'Ukendt kategori',
        focusColor: categoryMeta?.color,
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

      const today = startOfDay(new Date());
      const periodStart = startOfDay(subDays(today, Math.max(days - 1, 0)));
      const periodEndExclusive = startOfDay(addDays(today, 1));
      const previousStart = startOfDay(subDays(periodStart, days));

      const focusSelect = `
        id,
        rating,
        note,
        created_at,
        task_template_id,
        activity_id
      `;

      const activityTaskSelect = `
        id,
        created_at,
        activity_id,
        task_template_id,
        task_templates ( title ),
        activities!inner ( activity_date, user_id )
      `;

      const activitySelect = 'id, activity_date, category_id, intensity, title, user_id, created_at';

      const [
        { data: focusCurrent, error: focusCurrentError },
        { data: focusPrevious, error: focusPreviousError },
        { data: possibleCurrent, error: possibleCurrentError },
        { data: possiblePrevious, error: possiblePreviousError },
        { data: intensityCurrent, error: intensityCurrentError },
        { data: intensityPrevious, error: intensityPreviousError },
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
          .gte('activities.activity_date', periodStart.toISOString())
          .lt('activities.activity_date', periodEndExclusive.toISOString())
          .eq('activities.user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('activity_tasks')
          .select(activityTaskSelect)
          .not('task_template_id', 'is', null)
          .gte('activities.activity_date', previousStart.toISOString())
          .lt('activities.activity_date', periodStart.toISOString())
          .eq('activities.user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('activities')
          .select(activitySelect)
          .eq('user_id', userId)
          .gte('activity_date', periodStart.toISOString())
          .lt('activity_date', periodEndExclusive.toISOString())
          .order('activity_date', { ascending: true }),
        supabase
          .from('activities')
          .select(activitySelect)
          .eq('user_id', userId)
          .gte('activity_date', previousStart.toISOString())
          .lt('activity_date', periodStart.toISOString())
          .order('activity_date', { ascending: true }),
      ]);

      if (focusCurrentError) throw focusCurrentError;
      if (focusPreviousError) throw focusPreviousError;
      if (possibleCurrentError) throw possibleCurrentError;
      if (possiblePreviousError) throw possiblePreviousError;
      if (intensityCurrentError) throw intensityCurrentError;
      if (intensityPreviousError) throw intensityPreviousError;

      const focusRows = [...(focusCurrent || []), ...(focusPrevious || [])];
      const uniqueTemplateIds = Array.from(
        new Set(
          focusRows
            .map(row => row?.task_template_id)
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
      if (uniqueTemplateIds.length) {
        for (const chunk of chunkArray(uniqueTemplateIds, 50)) {
          const { data, error } = await supabase
            .from('task_templates')
            .select('id, title')
            .in('id', chunk);
          if (error) throw error;
          (data || []).forEach((row: any) => {
            if (row?.id) templateTitleById.set(String(row.id), row.title ?? 'Fokusopgave');
          });
        }
      }

      const activityMetaById = new Map<string, { activity_date: string | null; title: string | null }>();
      if (uniqueActivityIds.length) {
        for (const chunk of chunkArray(uniqueActivityIds, 50)) {
          const { data, error } = await supabase
            .from('activities')
            .select('id, activity_date, title')
            .in('id', chunk);
          if (error) throw error;
          (data || []).forEach((row: any) => {
            if (!row?.id) return;
            activityMetaById.set(String(row.id), {
              activity_date: row.activity_date ?? null,
              title: row.title ?? null,
            });
          });
        }
      }

      const missingActivityIds = uniqueActivityIds.filter(id => !activityMetaById.has(id));
      if (missingActivityIds.length) {
        for (const chunk of chunkArray(missingActivityIds, 50)) {
          const { data, error } = await supabase
            .from('events_external')
            .select('id, start_date, title')
            .in('id', chunk);
          if (error) throw error;
          (data || []).forEach((row: any) => {
            if (!row?.id) return;
            activityMetaById.set(String(row.id), {
              activity_date: row.start_date ?? null,
              title: row.title ?? null,
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
          task_templates: templateId && templateTitleById.has(templateId)
            ? { title: templateTitleById.get(templateId) }
            : null,
        };
      };

      const mappedFocusCurrent = (focusCurrent || []).map(row => mapFocusFeedbackRow(enrichFocusRow(row)));
      const mappedFocusPrevious = (focusPrevious || []).map(row => mapFocusFeedbackRow(enrichFocusRow(row)));
      const mappedPossibleCurrent = (possibleCurrent || []).map(mapFocusPossibleRow);
      const mappedPossiblePrevious = (possiblePrevious || []).map(mapFocusPossibleRow);
      const mappedIntensityCurrent = (intensityCurrent || []).map(mapIntensityRow);
      const mappedIntensityPrevious = (intensityPrevious || []).map(mapIntensityRow);

      const templateNameLookup = new Map<string, string>();
      [...mappedFocusCurrent, ...mappedFocusPrevious].forEach(entry => {
        if (entry.taskTemplateId) {
          templateNameLookup.set(entry.taskTemplateId, entry.focusName);
        }
      });
      [...mappedPossibleCurrent, ...mappedPossiblePrevious].forEach(entry => {
        if (entry.templateId) {
          templateNameLookup.set(entry.templateId, entry.templateName);
        }
      });

      const templateOptions: FocusTemplateOption[] = Array.from(templateNameLookup.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      runIfMounted(() => {
        setFocusEntries(mappedFocusCurrent);
        setFocusEntriesPrevious(mappedFocusPrevious);
        setFocusPossible(mappedPossibleCurrent);
        setFocusPossiblePrevious(mappedPossiblePrevious);
        setFocusTemplates(templateOptions);
        setIntensityEntries(mappedIntensityCurrent);
        setIntensityEntriesPrevious(mappedIntensityPrevious);
        setLastUpdated(new Date());
      });
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
  }, [days, mapFocusFeedbackRow, mapFocusPossibleRow, mapIntensityRow, clearDataState, runIfMounted]);

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
      const key = `${entry.activityId ?? entry.dateKey ?? 'na'}::${entry.templateId ?? 'none'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredFocusPossible]);

  const focusPossiblePreviousDeduped = useMemo(() => {
    const seen = new Set<string>();
    return filteredFocusPossiblePrevious.filter(entry => {
      const key = `${entry.activityId ?? entry.dateKey ?? 'na'}::${entry.templateId ?? 'none'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredFocusPossiblePrevious]);

  const focusCompletedDeduped = useMemo(() => {
    const possibleKeys = new Set<string>(
      focusPossibleDeduped.map(entry => `${entry.activityId ?? entry.dateKey ?? 'na'}::${entry.templateId ?? 'none'}`)
    );
    const seen = new Set<string>();
    return filteredFocusEntries
      .filter(entry => typeof entry.rating === 'number')
      .filter(entry => {
        const key = `${entry.activityId ?? entry.dateKey ?? entry.id}::${entry.taskTemplateId ?? 'none'}`;
        if (seen.has(key)) return false;
        if (possibleKeys.size && !possibleKeys.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [filteredFocusEntries, focusPossibleDeduped]);

  const focusCompletedPreviousDeduped = useMemo(() => {
    const possibleKeys = new Set<string>(
      focusPossiblePreviousDeduped.map(entry => `${entry.activityId ?? entry.dateKey ?? 'na'}::${entry.templateId ?? 'none'}`)
    );
    const seen = new Set<string>();
    return filteredFocusPrevious
      .filter(entry => typeof entry.rating === 'number')
      .filter(entry => {
        const key = `${entry.activityId ?? entry.dateKey ?? entry.id}::${entry.taskTemplateId ?? 'none'}`;
        if (seen.has(key)) return false;
        if (possibleKeys.size && !possibleKeys.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [filteredFocusPrevious, focusPossiblePreviousDeduped]);

  const intensityPossibleDeduped = useMemo(() => {
    const seen = new Set<string>();
    return filteredIntensityEntries.filter(entry => {
      const key = entry.activityId ?? entry.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredIntensityEntries]);

  const intensityPossiblePreviousDeduped = useMemo(() => {
    const seen = new Set<string>();
    return filteredIntensityPrevious.filter(entry => {
      const key = entry.activityId ?? entry.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [filteredIntensityPrevious]);

  const intensityCompletedDeduped = useMemo(() => {
    const possibleKeys = new Set<string>(intensityPossibleDeduped.map(entry => entry.activityId ?? entry.id));
    const seen = new Set<string>();
    return filteredIntensityEntries
      .filter(entry => typeof entry.intensity === 'number')
      .filter(entry => {
        const key = entry.activityId ?? entry.id;
        if (seen.has(key)) return false;
        if (possibleKeys.size && !possibleKeys.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [filteredIntensityEntries, intensityPossibleDeduped]);

  const intensityCompletedPreviousDeduped = useMemo(() => {
    const possibleKeys = new Set<string>(intensityPossiblePreviousDeduped.map(entry => entry.activityId ?? entry.id));
    const seen = new Set<string>();
    return filteredIntensityPrevious
      .filter(entry => typeof entry.intensity === 'number')
      .filter(entry => {
        const key = entry.activityId ?? entry.id;
        if (seen.has(key)) return false;
        if (possibleKeys.size && !possibleKeys.has(key)) return false;
        seen.add(key);
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
    if (metric === 'rating') {
      const completed = focusCompletedDeduped;
      const completedCount = completed.length;
      const possibleCount = focusPossibleDeduped.length;

      const previousCompleted = focusCompletedPreviousDeduped;
      const previousPossibleCount = focusPossiblePreviousDeduped.length;

      const completionRate = possibleCount ? Math.round((completedCount / possibleCount) * 100) : 0;
      const previousRate = previousPossibleCount ? Math.round((previousCompleted.length / previousPossibleCount) * 100) : 0;
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
        totalEntries: completedCount,
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

    // Intensity summary
    const registered = intensityCompletedDeduped;
    const registeredCount = registered.length;
    const possibleCount = intensityPossibleDeduped.length;

    const previousRegistered = intensityCompletedPreviousDeduped;
    const previousPossibleCount = intensityPossiblePreviousDeduped.length;

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
  }, [
    days,
    focusCompletedDeduped,
    focusCompletedPreviousDeduped,
    focusPossibleDeduped,
    focusPossiblePreviousDeduped,
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

  const possibleCount = metric === 'rating' ? focusPossibleDeduped.length : intensityPossibleDeduped.length;

  return {
    isLoading,
    error,
    trendPoints,
    heatmapRows,
    summary,
    rawEntries: activeEntries,
    lastUpdated,
    refetch: fetchEntries,
    focusTemplates,
    intensityCategoriesWithData,
    possibleCount,
    requiresLogin,
  };
}
