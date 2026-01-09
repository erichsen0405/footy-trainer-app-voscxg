import { useCallback, useEffect, useMemo, useState } from 'react';
import { subDays, startOfDay, parseISO, format, startOfWeek, differenceInCalendarDays } from 'date-fns';
import { supabase } from '@/app/integrations/supabase/client';
import { ActivityCategory } from '@/types';

export type ProgressionMetric = 'rating' | 'intensity';

export interface ProgressionEntry {
  id: string;
  createdAt: string;
  activityId: string;
  taskTemplateId: string;
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

export interface HeatmapRow {
  focusId: string | null;
  focusName: string;
  color?: string;
  weeks: { weekStart: string; label: string; count: number }[];
  total: number;
}

export interface ProgressionSummary {
  completionRate: number;
  previousRate: number;
  delta: number;
  totalEntries: number;
  successCount: number;
  streakDays: number;
  badges: string[];
}

interface UseProgressionDataArgs {
  days: number;
  metric: ProgressionMetric;
  focusCategoryId?: string | null;
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
}

const SUCCESS_THRESHOLD = 7;

export function useProgressionData({
  days,
  metric,
  focusCategoryId,
  categories,
}: UseProgressionDataArgs): UseProgressionDataResult {
  const [rawEntries, setRawEntries] = useState<ProgressionEntry[]>([]);
  const [previousEntries, setPreviousEntries] = useState<ProgressionEntry[]>([]);
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

  const mapRowToEntry = useCallback(
    (row: any, templateCategoryLookup: Record<string, string | null>): ProgressionEntry => {
      const createdIso = row.created_at as string;
      const activityDate = row.activities?.activity_date as string | null;
      const dateKey = (activityDate || createdIso || '').slice(0, 10);
      const focusId = templateCategoryLookup[String(row.task_template_id)] ?? null;
      const focusMeta = focusId ? categoryMap[focusId] : undefined;

      return {
        id: row.id,
        createdAt: createdIso,
        activityId: row.activity_id,
        taskTemplateId: row.task_template_id,
        rating: typeof row.rating === 'number' ? row.rating : null,
        intensity: typeof row.intensity === 'number' ? row.intensity : null,
        note: row.note ?? null,
        dateKey,
        focusCategoryId: focusId,
        focusName: focusMeta?.name ?? 'Ukategoriseret',
        focusColor: focusMeta?.color,
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

      const selectColumns = `
        id,
        rating,
        intensity,
        note,
        created_at,
        task_template_id,
        activity_id,
        activities (activity_date)
      `;

      const [{ data: currentData, error: currentError }, { data: prevData, error: prevError }] = await Promise.all([
        supabase
          .from('task_template_self_feedback')
          .select(selectColumns)
          .eq('user_id', userId)
          .gte('created_at', periodStart.toISOString())
          .order('created_at', { ascending: true }),
        supabase
          .from('task_template_self_feedback')
          .select(selectColumns)
          .eq('user_id', userId)
          .gte('created_at', previousStart.toISOString())
          .lt('created_at', periodStart.toISOString())
          .order('created_at', { ascending: true }),
      ]);

      if (currentError) {
        throw currentError;
      }

      if (prevError) {
        throw prevError;
      }

      const templateIds = new Set<string>();
      (currentData || []).forEach(row => {
        if (row?.task_template_id) {
          templateIds.add(String(row.task_template_id));
        }
      });
      (prevData || []).forEach(row => {
        if (row?.task_template_id) {
          templateIds.add(String(row.task_template_id));
        }
      });
      const templateCategoryLookup: Record<string, string | null> = {};

      if (templateIds.size) {
        const templateIdList = Array.from(templateIds);

        const loadFromTemplates = async () => {
          const { data: templateRows, error: templateError } = await supabase
            .from('task_templates')
            .select('id, task_template_categories ( category_id )')
            .in('id', templateIdList);

          if (templateError) {
            throw templateError;
          }

          (templateRows || []).forEach(row => {
            const firstCategoryId =
              Array.isArray((row as any)?.task_template_categories) && (row as any).task_template_categories.length
                ? String((row as any).task_template_categories[0].category_id)
                : null;
            templateCategoryLookup[String((row as any).id)] = firstCategoryId;
          });
        };

        const loadFromJoinFallback = async () => {
          const { data: joinRows, error: joinError } = await supabase
            .from('task_template_categories')
            .select('task_template_id, category_id')
            .in('task_template_id', templateIdList);

          if (joinError) {
            throw joinError;
          }

          (joinRows || [])
            .map(row => ({
              templateId: row?.task_template_id ? String(row.task_template_id) : '',
              categoryId: row?.category_id ? String(row.category_id) : null,
            }))
            .sort((a, b) => {
              const templateCompare = a.templateId.localeCompare(b.templateId);
              if (templateCompare !== 0) {
                return templateCompare;
              }
              return (a.categoryId ?? '').localeCompare(b.categoryId ?? '');
            })
            .forEach(({ templateId, categoryId }) => {
              if (!templateId) {
                return;
              }
              if (templateCategoryLookup[templateId] !== undefined) {
                return;
              }
              templateCategoryLookup[templateId] = categoryId;
            });
        };

        try {
          await loadFromTemplates();
        } catch (templateLoadError) {
          console.warn('[useProgressionData] template load failed, trying join fallback:', templateLoadError);
          try {
            await loadFromJoinFallback();
          } catch (joinFallbackError) {
            console.error('[useProgressionData] join fallback failed:', joinFallbackError);
          }
        }
      }

      const mappedCurrent = (currentData || []).map(row => mapRowToEntry(row, templateCategoryLookup));
      const mappedPrevious = (prevData || []).map(row => mapRowToEntry(row, templateCategoryLookup));

      setRawEntries(mappedCurrent);
      setPreviousEntries(mappedPrevious);
      setLastUpdated(new Date());
    } catch (err: any) {
      console.error('[useProgressionData] fetch failed:', err);
      setError(err?.message ?? 'Kunne ikke hente progression');
      setRawEntries([]);
      setPreviousEntries([]);
    } finally {
      setIsLoading(false);
    }
  }, [days, mapRowToEntry]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const filteredEntries = useMemo(() => {
    if (!focusCategoryId) {
      return rawEntries;
    }
    return rawEntries.filter(entry => entry.focusCategoryId === focusCategoryId);
  }, [focusCategoryId, rawEntries]);

  const filteredPrevious = useMemo(() => {
    if (!focusCategoryId) {
      return previousEntries;
    }
    return previousEntries.filter(entry => entry.focusCategoryId === focusCategoryId);
  }, [focusCategoryId, previousEntries]);

  const trendPoints = useMemo(() => {
    const grouped: Record<string, { values: number[]; sample: ProgressionEntry }> = {};

    filteredEntries.forEach(entry => {
      const value = metric === 'rating' ? entry.rating : entry.intensity;
      if (typeof value !== 'number') {
        return;
      }

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
  }, [filteredEntries, metric]);

  const heatmapRows = useMemo(() => {
    if (!rawEntries.length) {
      return [];
    }

    const buckets: Record<string, HeatmapRow> = {};
    const weekLabels = new Set<string>();

    rawEntries.forEach(entry => {
      const date = parseISO(`${entry.dateKey || entry.createdAt.slice(0, 10)}T00:00:00`);
      const weekStart = startOfWeek(date, { weekStartsOn: 1 });
      const weekKey = weekStart.toISOString().slice(0, 10);
      const label = format(weekStart, 'd MMM');

      const focusId = entry.focusCategoryId || 'none';
      const focusKey = focusId;
      if (!buckets[focusKey]) {
        buckets[focusKey] = {
          focusId: entry.focusCategoryId,
          focusName: entry.focusName,
          color: entry.focusColor,
          weeks: [],
          total: 0,
        };
      }

      const row = buckets[focusKey];
      const existingWeek = row.weeks.find(w => w.weekStart === weekKey);

      if (existingWeek) {
        existingWeek.count += 1;
      } else {
        row.weeks.push({ weekStart: weekKey, label, count: 1 });
      }

      weekLabels.add(weekKey);
      row.total += 1;
    });

    const sortedWeeks = Array.from(weekLabels).sort();

    return Object.values(buckets).map(row => {
      const normalizedWeeks = sortedWeeks.map(weekKey => {
        const existing = row.weeks.find(w => w.weekStart === weekKey);
        if (existing) {
          return existing;
        }
        const parsed = parseISO(`${weekKey}T00:00:00`);
        return { weekStart: weekKey, label: format(parsed, 'd MMM'), count: 0 };
      });

      return {
        ...row,
        weeks: normalizedWeeks,
      } as HeatmapRow;
    });
  }, [rawEntries]);

  const summary = useMemo<ProgressionSummary>(() => {
    const currentValues = filteredEntries
      .map(entry => (metric === 'rating' ? entry.rating : entry.intensity))
      .filter((v): v is number => typeof v === 'number');

    const previousValues = filteredPrevious
      .map(entry => (metric === 'rating' ? entry.rating : entry.intensity))
      .filter((v): v is number => typeof v === 'number');

    const successCount = currentValues.filter(v => v >= SUCCESS_THRESHOLD).length;
    const completionRate = currentValues.length ? Math.round((successCount / currentValues.length) * 100) : 0;
    const previousSuccess = previousValues.filter(v => v >= SUCCESS_THRESHOLD).length;
    const previousRate = previousValues.length ? Math.round((previousSuccess / previousValues.length) * 100) : 0;
    const delta = completionRate - previousRate;

    const uniqueDates = Array.from(
      new Set(filteredEntries.map(entry => entry.dateKey || entry.createdAt.slice(0, 10)))
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

    const highScores = currentValues.filter(v => v >= 8).length;
    const badges: string[] = [];

    if (streak >= 3) {
      badges.push('Streak 3+');
    }

    if (delta > 0) {
      badges.push('Momentum');
    }

    if (highScores >= 3) {
      badges.push('8+ mastery');
    }

    if (currentValues.length >= Math.max(3, Math.round(days / 4))) {
      badges.push('Consistency');
    }

    return {
      completionRate,
      previousRate,
      delta,
      totalEntries: filteredEntries.length,
      successCount,
      streakDays: streak,
      badges,
    };
  }, [days, filteredEntries, filteredPrevious, metric]);

  return {
    isLoading,
    error,
    trendPoints,
    heatmapRows,
    summary,
    rawEntries: filteredEntries,
    lastUpdated,
    refetch: fetchEntries,
  };
}
