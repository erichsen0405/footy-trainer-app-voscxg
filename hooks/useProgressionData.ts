import { useCallback, useEffect, useMemo, useState } from 'react';
import { subDays, startOfDay, parseISO, format, startOfWeek, differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/app/integrations/supabase/client';
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
      const dateKey = toDateKey(row.activity_date ?? row.created_at);
      const categoryId = row.category_id ? String(row.category_id) : null;
      const categoryMeta = categoryId ? categoryMap[categoryId] : undefined;

      return {
        id: String(row.id),
        kind: 'intensity',
        createdAt: row.activity_date ?? row.created_at,
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
    setIsLoading(true);
    setError(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        throw sessionError;
      }

      const userId = sessionData?.session?.user?.id;
      if (!userId) {
        throw new Error('Ingen aktiv session');
      }

      const today = startOfDay(new Date());
      const periodStart = startOfDay(subDays(today, Math.max(days - 1, 0)));
      const previousStart = startOfDay(subDays(periodStart, days));

      const focusSelect = `
        id,
        rating,
        note,
        created_at,
        task_template_id,
        activity_id,
        task_templates ( title ),
        activities ( activity_date, title )
      `;

      const activityTaskSelect = `
        id,
        created_at,
        activity_id,
        task_template_id,
        task_templates ( title ),
        activities ( activity_date, user_id )
      `;

      const activitySelect = 'id, activity_date, category_id, intensity, title, user_id';

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
          .lte('activities.activity_date', today.toISOString())
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

      const mappedFocusCurrent = (focusCurrent || []).map(mapFocusFeedbackRow);
      const mappedFocusPrevious = (focusPrevious || []).map(mapFocusFeedbackRow);
      const mappedPossibleCurrent = (possibleCurrent || []).map(mapFocusPossibleRow);
      const mappedPossiblePrevious = (possiblePrevious || []).map(mapFocusPossibleRow);
      const mappedIntensityCurrent = (intensityCurrent || []).map(mapIntensityRow);
      const mappedIntensityPrevious = (intensityPrevious || []).map(mapIntensityRow);

      const templateLookup = new Map<string, string>();
      [...mappedFocusCurrent, ...mappedFocusPrevious].forEach(entry => {
        if (entry.taskTemplateId) {
          templateLookup.set(entry.taskTemplateId, entry.focusName);
        }
      });
      [...mappedPossibleCurrent, ...mappedPossiblePrevious].forEach(entry => {
        if (entry.templateId) {
          templateLookup.set(entry.templateId, entry.templateName);
        }
      });

      const templateOptions: FocusTemplateOption[] = Array.from(templateLookup.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setFocusEntries(mappedFocusCurrent);
      setFocusEntriesPrevious(mappedFocusPrevious);
      setFocusPossible(mappedPossibleCurrent);
      setFocusPossiblePrevious(mappedPossiblePrevious);
      setFocusTemplates(templateOptions);
      setIntensityEntries(mappedIntensityCurrent);
      setIntensityEntriesPrevious(mappedIntensityPrevious);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('[useProgressionData] fetch failed:', err);
      setError(err?.message ?? 'Kunne ikke hente progression');
      setFocusEntries([]);
      setFocusEntriesPrevious([]);
      setFocusPossible([]);
      setFocusPossiblePrevious([]);
      setIntensityEntries([]);
      setIntensityEntriesPrevious([]);
    } finally {
      setIsLoading(false);
    }
  }, [days, mapFocusFeedbackRow, mapFocusPossibleRow, mapIntensityRow]);

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

  const trendPoints = useMemo(() => {
    const sourceEntries = metric === 'rating' ? filteredFocusEntries : filteredIntensityEntries;
    const grouped: Record<string, { values: number[]; sample: ProgressionEntry }> = {};

    sourceEntries.forEach(entry => {
      const value = metric === 'rating' ? entry.rating : entry.intensity;
      if (typeof value !== 'number') return;

      const key = entry.dateKey || entry.createdAt.slice(0, 10);
      const bucket = grouped[key] || { values: [], sample: entry };
      bucket.values.push(value);

      const bucketDate = bucket.sample?.createdAt ? parseISO(bucket.sample.createdAt) : null;
      const entryDate = entry.createdAt ? parseISO(entry.createdAt) : null;
      if (bucketDate && entryDate && entryDate > bucketDate) {
        bucket.sample = entry;
      }

      grouped[key] = bucket;
    });

    return Object.entries(grouped)
      .map(([dateKey, bucket]) => {
        const avg = bucket.values.reduce((sum, v) => sum + v, 0) / bucket.values.length;
        return {
          id: `${dateKey}-${bucket.sample.id}`,
          dateKey,
          dateLabel: format(parseISO(`${dateKey}T00:00:00`), 'dd MMM'),
          value: Number(avg.toFixed(2)),
          representative: bucket.sample,
          sampleCount: bucket.values.length,
        } as TrendPoint;
      })
      .sort((a, b) => (a.dateKey < b.dateKey ? -1 : 1));
  }, [filteredFocusEntries, filteredIntensityEntries, metric]);

  const heatmapRows = useMemo(() => {
    if (metric === 'rating') {
      if (!focusPossible.length && !filteredFocusEntries.length) return [];

      const weekLabels = new Set<string>();
      const possibleByTemplate: Record<string, Record<string, number>> = {};
      const completedByTemplate: Record<string, Record<string, number>> = {};
      const templateNames: Record<string, string> = {};
      const safeParse = (key?: string) => {
        try {
          return key ? parseISO(`${key}T00:00:00`) : new Date();
        } catch (error) {
          return new Date();
        }
      };

      filteredFocusPossible.forEach(entry => {
        const weekStart = startOfWeek(safeParse(entry.dateKey), { weekStartsOn: 1 });
        const weekKey = weekStart.toISOString().slice(0, 10);
        weekLabels.add(weekKey);
        const key = entry.templateId ?? 'none';
        templateNames[key] = entry.templateName;
        possibleByTemplate[key] = possibleByTemplate[key] || {};
        possibleByTemplate[key][weekKey] = (possibleByTemplate[key][weekKey] || 0) + 1;
      });

      filteredFocusEntries
        .filter(entry => typeof entry.rating === 'number')
        .forEach(entry => {
          const parsedDate = safeParse(entry.dateKey || entry.createdAt.slice(0, 10));
          const weekStart = startOfWeek(parsedDate, { weekStartsOn: 1 });
          const weekKey = weekStart.toISOString().slice(0, 10);
          weekLabels.add(weekKey);
          const key = entry.taskTemplateId ?? 'none';
          templateNames[key] = entry.focusName;
          completedByTemplate[key] = completedByTemplate[key] || {};
          completedByTemplate[key][weekKey] = (completedByTemplate[key][weekKey] || 0) + 1;
          if (!possibleByTemplate[key]) {
            possibleByTemplate[key] = {};
          }
          if (!possibleByTemplate[key][weekKey]) {
            possibleByTemplate[key][weekKey] = 1;
          }
        });

      const sortedWeeks = Array.from(weekLabels).sort();

      return Object.keys({ ...possibleByTemplate, ...completedByTemplate }).map(templateKey => {
        const weeks: HeatmapWeek[] = sortedWeeks.map(weekKey => {
          const possible = possibleByTemplate[templateKey]?.[weekKey] ?? 0;
          const completed = completedByTemplate[templateKey]?.[weekKey] ?? 0;
          const ratio = possible ? completed / possible : 0;
          return {
            weekStart: weekKey,
            label: format(parseISO(`${weekKey}T00:00:00`), 'd MMM'),
            possible,
            completed,
            ratio,
          };
        });

        const totals = weeks.reduce(
          (acc, week) => {
            acc.possible += week.possible;
            acc.completed += week.completed;
            return acc;
          },
          { possible: 0, completed: 0 }
        );

        return {
          focusId: templateKey === 'none' ? null : templateKey,
          focusName: templateNames[templateKey] || 'Fokusopgave',
          color: undefined,
          weeks,
          totalCompleted: totals.completed,
          totalPossible: totals.possible,
        } as HeatmapRow;
      });
    }

    // Intensity heatmap
    if (!filteredIntensityEntries.length) return [];

    const weekLabels = new Set<string>();
    const possibleByCategory: Record<string, Record<string, number>> = {};
    const completedByCategory: Record<string, Record<string, number>> = {};
    const categoryNames: Record<string, { name: string; color?: string }> = {};
    const safeParse = (key?: string) => {
      try {
        return key ? parseISO(`${key}T00:00:00`) : new Date();
      } catch (error) {
        return new Date();
      }
    };

    filteredIntensityEntries.forEach(entry => {
      const parsedDate = safeParse(entry.dateKey || entry.createdAt.slice(0, 10));
      const weekStart = startOfWeek(parsedDate, { weekStartsOn: 1 });
      const weekKey = weekStart.toISOString().slice(0, 10);
      weekLabels.add(weekKey);
      const key = entry.focusCategoryId ?? 'none';
      categoryNames[key] = { name: entry.focusName, color: entry.focusColor };
      possibleByCategory[key] = possibleByCategory[key] || {};
      possibleByCategory[key][weekKey] = (possibleByCategory[key][weekKey] || 0) + 1;
      if (typeof entry.intensity === 'number') {
        completedByCategory[key] = completedByCategory[key] || {};
        completedByCategory[key][weekKey] = (completedByCategory[key][weekKey] || 0) + 1;
      }
    });

    const sortedWeeks = Array.from(weekLabels).sort();

    return Object.keys(possibleByCategory).map(categoryKey => {
      const weeks: HeatmapWeek[] = sortedWeeks.map(weekKey => {
        const possible = possibleByCategory[categoryKey]?.[weekKey] ?? 0;
        const completed = completedByCategory[categoryKey]?.[weekKey] ?? 0;
        const ratio = possible ? completed / possible : 0;
        return {
          weekStart: weekKey,
          label: format(parseISO(`${weekKey}T00:00:00`), 'd MMM'),
          possible,
          completed,
          ratio,
        };
      });

      const totals = weeks.reduce(
        (acc, week) => {
          acc.possible += week.possible;
          acc.completed += week.completed;
          return acc;
        },
        { possible: 0, completed: 0 }
      );

      return {
        focusId: categoryKey === 'none' ? null : categoryKey,
        focusName: categoryNames[categoryKey]?.name ?? 'Kategori',
        color: categoryNames[categoryKey]?.color,
        weeks,
        totalCompleted: totals.completed,
        totalPossible: totals.possible,
      } as HeatmapRow;
    });
  }, [
    filteredFocusEntries,
    filteredFocusPossible,
    focusPossible,
    filteredIntensityEntries,
    metric,
  ]);

  const summary = useMemo<ProgressionSummary>(() => {
    if (metric === 'rating') {
      const completed = filteredFocusEntries.filter(entry => typeof entry.rating === 'number');
      const completedCount = completed.length;
      const possibleCount = filteredFocusPossible.length || completedCount;

      const previousCompleted = filteredFocusPrevious.filter(entry => typeof entry.rating === 'number');
      const previousPossibleCount = filteredFocusPossiblePrevious.length || previousCompleted.length;

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
        scorePercent,
        previousScorePercent,
        deltaPercentPoints,
      };
    }

    // Intensity summary
    const registered = filteredIntensityEntries.filter(entry => typeof entry.intensity === 'number');
    const registeredCount = registered.length;
    const possibleCount = filteredIntensityEntries.length;

    const previousRegistered = filteredIntensityPrevious.filter(entry => typeof entry.intensity === 'number');
    const previousPossibleCount = filteredIntensityPrevious.length;

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
      scorePercent,
      previousScorePercent,
      deltaPercentPoints,
    };
  }, [
    days,
    filteredFocusEntries,
    filteredFocusPossible,
    filteredFocusPrevious,
    filteredFocusPossiblePrevious,
    filteredIntensityEntries,
    filteredIntensityPrevious,
    metric,
  ]);

  const activeEntries = metric === 'rating' ? filteredFocusEntries : filteredIntensityEntries;
  const intensityCategoriesWithData = useMemo(
    () => Array.from(new Set(intensityEntries.map(entry => entry.focusCategoryId).filter(Boolean))) as string[],
    [intensityEntries]
  );

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
  };
}
