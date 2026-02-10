/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as FileSystem from 'expo-file-system';
import { supabase } from '@/integrations/supabase/client';
import { getCategories, DatabaseActivityCategory } from '@/services/activities';
import { resolveActivityCategory, type CategoryMappingRecord } from '@/shared/activityCategoryResolver';
import { subscribeToTaskCompletion } from '@/utils/taskEvents';
import { parseTemplateIdFromMarker } from '@/utils/afterTrainingMarkers';
import { useUserRole } from '@/hooks/useUserRole';
import {
  subscribeToActivityPatch,
  subscribeToActivitiesRefreshRequested,
  getActivitiesRefreshRequestedVersion,
  getLastActivitiesRefreshRequestedEvent,
} from '@/utils/activityEvents';

interface ActivityTask {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  reminder_minutes?: number | null;
  after_training_delay_minutes?: number | null;
  video_url?: string;
  feedback_template_id?: string | null;
  task_template_id?: string | null;
}

interface ActivityWithCategory {
  id: string;
  user_id: string;
  title: string;
  activity_date: string;
  activity_time: string;
  location?: string;
  category_id?: string;
  category?: DatabaseActivityCategory | null;
  intensity?: number | null;
  intensityNote?: string | null;
  intensity_note?: string | null;
  intensityEnabled?: boolean;
  intensity_enabled?: boolean;
  is_external: boolean;
  external_calendar_id?: string;
  external_event_id?: string;
  created_at: string;
  updated_at: string;
  tasks?: ActivityTask[];
  minReminderMinutes?: number | null;
  external_event_row_id?: string;
}

const coerceReminderMinutes = (val: any): number | null => {
  if (val === null || val === undefined) return null;
  const str = typeof val === 'string' ? val.trim().toLowerCase() : null;
  if (str === 'null' || str === 'undefined' || str === '') return null;
  const num = typeof val === 'string' ? parseFloat(val) : val;
  if (!Number.isFinite(num)) return null;
  return Math.round(num as number);
};

const decodeUtf8Garble = (value: unknown): string => {
  const asString = typeof value === 'string' ? value : String(value ?? '');
  const fixScandi = (s: string) =>
    s
      .replace(/Ã¥|Ã…/g, 'å')
      .replace(/Ã¦|Ã†/g, 'æ')
      .replace(/Ã¸|Ã˜/g, 'ø')
      .replace(/Ã¼/g, 'ü')
      .replace(/Ã¶/g, 'ö')
      .replace(/Ã¤/g, 'ä')
      .replace(/Â·/g, '·')
      .replace(/Â°/g, '°')
      .replace(/Â©/g, '©')
      .replace(/Â®/g, '®');

  const looksGarbled = /Ã.|Â./.test(asString);
  const decodeOnce = (s: string) => {
    try {
      return decodeURIComponent(escape(s));
    } catch {
      return s;
    }
  };
  if (!looksGarbled) return fixScandi(asString);
  const first = decodeOnce(asString);
  if (/Ã.|Â./.test(first)) {
    const second = decodeOnce(first);
    return fixScandi(second);
  }
  return fixScandi(first);
};

const parseIntensityValue = (raw: any): number | null => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const parsed = parseFloat(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeId = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const normalizeTitle = (value?: string | null): string => {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
};

const stripLeadingFeedbackPrefix = (title: string): string => {
  if (typeof title !== 'string') return title;
  const trimmed = title.trim();
  const stripped = trimmed.replace(/^feedback\s+p[\u00e5a]\s*/i, '');
  return stripped.length ? stripped : title;
};

const isFeedbackTitle = (title?: string | null): boolean => {
  if (typeof title !== 'string') return false;
  const normalized = normalizeTitle(title);
  return normalized.startsWith('feedback pa');
};

const getMarkerTemplateId = (task: ActivityTask | null | undefined): string | null => {
  if (!task) return null;
  const fromDescription =
    typeof task.description === 'string' ? parseTemplateIdFromMarker(task.description) : null;
  if (fromDescription) return fromDescription;
  const fromTitle = typeof task.title === 'string' ? parseTemplateIdFromMarker(task.title) : null;
  return fromTitle ?? null;
};

const isFeedbackTask = (task: ActivityTask | null | undefined): boolean => {
  if (!task) return false;
  const direct = normalizeId(task.feedback_template_id);
  if (direct) return true;
  return !!getMarkerTemplateId(task) || isFeedbackTitle(task.title);
};

const computeMinReminder = (tasks: ActivityTask[] | undefined | null): number | null => {
  if (!Array.isArray(tasks) || !tasks.length) return null;
  let min: number | null = null;
  for (const t of tasks) {
    const reminder = coerceReminderMinutes(t?.reminder_minutes);
    const afterTraining = isFeedbackTask(t)
      ? coerceReminderMinutes((t as any)?.after_training_delay_minutes)
      : null;
    const val = reminder ?? afterTraining;
    if (val === null) continue;
    if (min === null || val < min) min = val;
  }
  return min;
};

const resolveTaskTemplateId = (task: any): string | null => {
  const direct = normalizeId(task?.task_template_id);
  if (direct) return direct;
  const feedback = normalizeId(task?.feedback_template_id);
  if (feedback) return feedback;
  const marker =
    parseTemplateIdFromMarker(typeof task?.description === 'string' ? task.description : '') ||
    parseTemplateIdFromMarker(typeof task?.title === 'string' ? task.title : '');
  return normalizeId(marker);
};

const computeOrphanFeedbackTaskIds = (tasks: ActivityTask[]): string[] => {
  const parentsByTemplate = new Set<string>();
  const parentsByTitle = new Set<string>();

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (isFeedbackTask(task)) continue;
    const templateId = normalizeId(task.task_template_id);
    if (templateId) parentsByTemplate.add(templateId);
    const normalized = normalizeTitle(task.title);
    if (normalized) parentsByTitle.add(normalized);
  }

  const orphanIds: string[] = [];

  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (!isFeedbackTask(task)) continue;

    const linkedTemplateId = normalizeId(task.feedback_template_id) ?? getMarkerTemplateId(task);
    const linkedTitle = normalizeTitle(stripLeadingFeedbackPrefix(task.title ?? ''));

    let isOrphan = false;
    if (linkedTemplateId) {
      isOrphan = !parentsByTemplate.has(linkedTemplateId);
    } else if (linkedTitle) {
      isOrphan = !parentsByTitle.has(linkedTitle);
    } else {
      continue;
    }

    if (isOrphan) {
      orphanIds.push(String(task.id));
    }
  }

  return orphanIds;
};

const extractExternalEventTasks = (
  meta: Record<string, any> | null | undefined,
  matchedKeysOut?: string[]
): any[] => {
  if (!meta || typeof meta !== 'object') {
    return [];
  }

  if (Array.isArray(meta.external_event_tasks)) {
    matchedKeysOut?.push('external_event_tasks');
    return meta.external_event_tasks;
  }

  const dynamicKeys = Object.keys(meta).filter(
    key => key.startsWith('external_event_tasks') && Array.isArray(meta[key])
  );

  if (dynamicKeys.length > 0) {
    matchedKeysOut?.push(...dynamicKeys);
    return meta[dynamicKeys[0]];
  }

  return [];
};

let loggedExternalMetaSample = false;

interface UseHomeActivitiesResult {
  activities: ActivityWithCategory[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useHomeActivities(): UseHomeActivitiesResult {
  const { isAdmin } = useUserRole();
  const [userId, setUserId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ActivityWithCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const categoryMapRef = useRef<Map<string, DatabaseActivityCategory>>(new Map());
  const refetchInFlightRef = useRef(false);
  const pendingRefreshReasonRef = useRef<string | null>(null);
  const lastSeenRefreshVersionRef = useRef<number>(0);
  const hasLoadedOnceRef = useRef(false);

  const patchActivityTasks = useCallback((activityId: string, taskId: string, completed: boolean) => {
    setActivities(prev => {
      let mutated = false;

      const next = prev.map(activity => {
        if (String(activity.id) !== String(activityId)) {
          return activity;
        }

        const tasks = Array.isArray(activity.tasks) ? activity.tasks : [];
        let taskMutated = false;
        const nextTasks = tasks.map(task => {
          if (String(task.id) !== String(taskId)) {
            return task;
          }

          if (task.completed === completed) {
            return task;
          }

          taskMutated = true;
          return { ...task, completed };
        });

        if (!taskMutated) {
          return activity;
        }

        mutated = true;
        return { ...activity, tasks: nextTasks };
      });

      return mutated ? next : prev;
    });
  }, []);

  const enrichCategoryPatch = useCallback((updates: Record<string, any>) => {
    if (!updates) {
      return updates;
    }

    const nextUpdates = { ...updates };
    const hasCategoryObject = typeof updates.category === 'object' && updates.category !== null;
    const hasActivityCategoryObject =
      typeof updates.activity_categories === 'object' && updates.activity_categories !== null;
    const hasActivityCategoryAliasObject =
      typeof updates.activity_category === 'object' && updates.activity_category !== null;

    const rawCategoryId =
      updates.category_id ??
      updates.categoryId ??
      (hasCategoryObject ? updates.category.id : undefined) ??
      (hasActivityCategoryObject ? updates.activity_categories.id : undefined);

    if (rawCategoryId === null) {
      nextUpdates.category_id = null;
      nextUpdates.category = null;
      nextUpdates.activity_categories = null;
      nextUpdates.activity_category = null;
      nextUpdates.categoryColor = null;
      nextUpdates.category_color = null;
      return nextUpdates;
    }

    if (rawCategoryId !== undefined) {
      const normalizedId = String(rawCategoryId);
      nextUpdates.category_id = normalizedId;

      const categoryObj = hasCategoryObject
        ? updates.category
        : categoryMapRef.current.get(normalizedId) ?? null;

      nextUpdates.category = categoryObj;

      if (hasActivityCategoryObject) {
        nextUpdates.activity_categories = updates.activity_categories;
      } else {
        nextUpdates.activity_categories = categoryObj;
      }

      if (hasActivityCategoryAliasObject) {
        nextUpdates.activity_category = updates.activity_category;
      } else {
        nextUpdates.activity_category = categoryObj;
      }

      const resolvedColor = categoryObj?.color ?? null; // ActivityCard prefers categoryColor/category_color first
      nextUpdates.categoryColor = resolvedColor;
      nextUpdates.category_color = resolvedColor;
    }

    return nextUpdates;
  }, []); // Keep card visuals in sync when category_id patches arrive without refetch

  const patchActivityFields = useCallback((activityId: string, updates: Record<string, any>) => {
    if (!updates || !Object.keys(updates).length) {
      return;
    }

    const enrichedUpdates = enrichCategoryPatch(updates);

    if (
      Object.prototype.hasOwnProperty.call(updates, 'intensity_enabled') &&
      typeof enrichedUpdates.intensityEnabled === 'undefined'
    ) {
      enrichedUpdates.intensityEnabled = updates.intensity_enabled;
    }

    if (
      Object.prototype.hasOwnProperty.call(updates, 'intensityEnabled') &&
      typeof enrichedUpdates.intensity_enabled === 'undefined'
    ) {
      enrichedUpdates.intensity_enabled = updates.intensityEnabled;
    }

    const disablesIntensity =
      updates.intensityEnabled === false ||
      updates.intensity_enabled === false;

    if (disablesIntensity && typeof enrichedUpdates.intensity === 'undefined') {
      enrichedUpdates.intensity = null;
    }

    setActivities(prev => {
      let mutated = false;
      const next = prev.map(activity => {
        if (String(activity.id) !== String(activityId)) {
          return activity;
        }

        mutated = true;
        return { ...activity, ...enrichedUpdates };
      });

      return mutated ? next : prev;
    });
  }, [enrichCategoryPatch]);

  // Get user ID
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (error) {
          console.error('Failed to fetch session:', error);
          setActivities([]);
          setLoading(false);
          return;
        }

        const userIdFromSession = session?.user?.id;
        if (!userIdFromSession) {
          setActivities([]);
          setLoading(false);
          return;
        }

        setUserId(userIdFromSession);
      } catch (err) {
        console.error('Failed to fetch session:', err);
        setActivities([]);
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const refetchActivities = useCallback(async () => {
    if (!userId) {
      setActivities([]);
      return;
    }

    try {
      console.log('[useHomeActivities] Fetching activities for user:', userId);
      
      // ✅ PARALLEL FETCH GROUP 1: Categories + Internal Activities + External Calendars + Category Mappings
      // These are independent and can run in parallel
      const [categoriesData, internalData, calendarsData, categoryMappingsData] = await Promise.all([
        // 1. Fetch categories (user + system)
        getCategories(userId),
        
        // 2. Fetch internal activities WITH TASKS
        supabase
          .from('activities')
          .select(`
            id,
            user_id,
            title,
            activity_date,
            activity_time,
            location,
            category_id,
            intensity,
            intensity_note,
            intensity_enabled,
            created_at,
            updated_at,
            activity_tasks (
              id,
              title,
              description,
              completed,
              reminder_minutes
            )
          `)
          .eq('user_id', userId)
          .then(({ data, error }) => {
            if (error) {
              console.error('[useHomeActivities] Error fetching internal activities:', error);
              return null;
            }
            return data;
          }),
        
        // 3. Fetch external calendars
        supabase
          .from('external_calendars')
          .select('id')
          .eq('user_id', userId)
          .eq('enabled', true)
          .then(({ data, error }) => {
            if (error) {
              console.error('[useHomeActivities] Error fetching calendars:', error);
              return null;
            }
            return data;
          }),

        // 4. Fetch user-defined external category mappings
        supabase
          .from('category_mappings')
          .select('external_category, internal_category_id')
          .eq('user_id', userId)
          .then(({ data, error }) => {
            if (error) {
              console.error('[useHomeActivities] Error fetching category mappings:', error);
              return null;
            }
            return data;
          }),
      ]);
      
      console.log('[useHomeActivities] Categories fetched:', categoriesData?.length ?? 0);
      console.log('[useHomeActivities] Internal activities:', internalData?.length ?? 0);
      console.log('[useHomeActivities] Category mappings:', categoryMappingsData?.length ?? 0);
      
      // Create a map for quick category lookup
      const categoryMap = new Map<string, DatabaseActivityCategory>();
      (categoriesData || []).forEach(cat => {
        categoryMap.set(String(cat.id), cat);
      });
      categoryMapRef.current = categoryMap;
      const categoriesList = categoriesData || [];
      const categoryMappings = (categoryMappingsData || []) as CategoryMappingRecord[];

      const resolveCategory = (
        title: string,
        categoryId?: string | null,
        externalCategories?: string[]
      ): DatabaseActivityCategory | null => {
        if (categoryId) {
          const knownCategory = categoryMap.get(String(categoryId));
          if (knownCategory) {
            return knownCategory;
          }
        }

        const resolution = resolveActivityCategory({
          title,
          categories: categoriesList,
          externalCategories,
          categoryMappings,
        });

        if (resolution) {
          return resolution.category as DatabaseActivityCategory;
        }

        return null;
      };
      
      console.log('[useHomeActivities] Category map size:', categoryMap.size);
      
      // Map internal activities with tasks and resolved category
      const internalActivities: ActivityWithCategory[] = (internalData || []).map(activity => {
        const resolvedCategory = resolveCategory(activity.title, activity.category_id);
        const intensityValue = parseIntensityValue(activity.intensity);
        const intensityNote =
          typeof activity.intensity_note === 'string' ? activity.intensity_note : null;
        const intensityEnabled = typeof activity.intensity_enabled === 'boolean'
          ? activity.intensity_enabled
          : intensityValue !== null;
        
        // Map tasks to the expected format
        const tasks: ActivityTask[] = (activity.activity_tasks || []).map((task: any) => ({
          id: task.id,
          title: task.title,
          description: task.description || '',
          completed: task.completed,
          reminder_minutes: task.reminder_minutes,
        }));
        
        return {
          id: activity.id,
          user_id: activity.user_id,
          title: activity.title,
          activity_date: activity.activity_date,
          activity_time: activity.activity_time,
          location: activity.location || '',
          category_id: activity.category_id,
          category: resolvedCategory,
          intensity: intensityValue,
          intensityNote,
          intensity_note: intensityNote,
          intensityEnabled,
          intensity_enabled: intensityEnabled,
          is_external: false,
          created_at: activity.created_at,
          updated_at: activity.updated_at,
          tasks,
        };
      });
      
      const calendarIdsNormalized = (calendarsData || [])
        .map(c => c?.id)
        .filter(Boolean)
        .map(v => String(v));

      if (__DEV__) {
        console.log('[useHomeActivities] Normalized calendars', {
          length: calendarIdsNormalized.length,
          sample: calendarIdsNormalized.slice(0, 3),
        });
      }

      let externalActivities: ActivityWithCategory[] = [];
      let externalMetaData: any[] = [];

      if (calendarIdsNormalized.length > 0) {
        const { data: eventsData, error: eventsError } = await supabase
          .from('events_external')
          .select('id, title, start_date, start_time, location, provider_calendar_id, provider_event_uid, raw_payload')
          .in('provider_calendar_id', calendarIdsNormalized)
          .eq('deleted', false);

        if (eventsError) {
          console.error('[useHomeActivities] Error fetching external events:', {
            code: eventsError?.code,
            message: eventsError?.message,
            details: eventsError?.details,
            hint: eventsError?.hint,
          });
        } else if (eventsData) {
          console.log('[useHomeActivities] External events found:', eventsData.length);

          const eventRowIds = eventsData.map(e => String(e.id)).filter(Boolean);
          const providerUids = eventsData.map(e => String(e.provider_event_uid)).filter(Boolean);

          const metaSelect = `
              id,
              external_event_id,
              external_event_uid,
              category_id,
              user_id,
              intensity,
              intensity_note,
              intensity_enabled,
              local_title_override,
              external_event_tasks ( * )
            `;

          const [metaByEventIdRes, metaByUidRes] = await Promise.all([
            eventRowIds.length
              ? supabase
                  .from('events_local_meta')
                  .select(metaSelect)
                  .eq('user_id', userId)
                  .in('external_event_id', eventRowIds)
              : Promise.resolve({ data: [], error: null }),
            providerUids.length
              ? supabase
                  .from('events_local_meta')
                  .select(metaSelect)
                  .eq('user_id', userId)
                  .in('external_event_uid', providerUids)
              : Promise.resolve({ data: [], error: null }),
          ]);

          if (metaByEventIdRes.error) {
            console.error('[useHomeActivities] Error fetching external event metadata by id:', metaByEventIdRes.error);
          }
          if (metaByUidRes.error) {
            console.error('[useHomeActivities] Error fetching external event metadata by uid:', metaByUidRes.error);
          }

          const mergedMetaMap = new Map<string, any>();
          [...(metaByEventIdRes.data || []), ...(metaByUidRes.data || [])].forEach(metaRow => {
            if (!metaRow?.id) return;
            mergedMetaMap.set(String(metaRow.id), metaRow);
          });
          const mergedMeta = Array.from(mergedMetaMap.values());
          externalMetaData = mergedMeta;

          let matchedCount = 0;

          externalActivities = eventsData.map(event => {
            const meta = mergedMeta.find(m =>
              (m?.external_event_id && String(m.external_event_id) === String(event.id)) ||
              (m?.external_event_uid && String(m.external_event_uid) === String(event.provider_event_uid))
            );
            if (meta) matchedCount += 1;

            const categoryId = meta?.category_id || null;
            const providerCategories = Array.isArray(event.raw_payload?.categories)
              ? (event.raw_payload.categories as string[]).filter((cat) => typeof cat === 'string' && cat.trim().length > 0)
              : undefined;
            const resolvedCategory = resolveCategory(
              meta?.local_title_override || event.title,
              categoryId,
              providerCategories,
            );

            const intensityValue = parseIntensityValue(meta?.intensity);
            const intensityNote =
              typeof meta?.intensity_note === 'string' ? meta.intensity_note : null;
            const metaIntensityEnabled = typeof meta?.intensity_enabled === 'boolean'
              ? meta.intensity_enabled
              : intensityValue !== null;

            const matchedTaskKeys: string[] = [];
            const rawExternalTasks = extractExternalEventTasks(meta, matchedTaskKeys);

            if (__DEV__ && !loggedExternalMetaSample && meta) {
              loggedExternalMetaSample = true;
              console.log('[useHomeActivities] External meta task sample', {
                metaId: meta?.id ?? null,
                matchedTaskKeys,
                taskCount: Array.isArray(rawExternalTasks) ? rawExternalTasks.length : 0,
              });
            }

            const tasks: ActivityTask[] = (rawExternalTasks || []).map((task: any) => ({
              id: task.id,
              title: task.title,
              description: task.description || '',
              completed: task.completed,
              reminder_minutes: coerceReminderMinutes(task.reminder_minutes),
              video_url: task.video_url ?? undefined,
              feedback_template_id: task.feedback_template_id ?? null,
              task_template_id: task.task_template_id ?? null,
            }));

            return {
              id: meta?.id || event.id,
              user_id: userId,
              title: meta?.local_title_override || event.title,
              activity_date: event.start_date,
              activity_time: event.start_time || '12:00:00',
              location: event.location || '',
              category_id: categoryId,
              category: resolvedCategory,
              intensity: intensityValue,
              intensityNote,
              intensity_note: intensityNote,
              intensityEnabled: metaIntensityEnabled,
              intensity_enabled: metaIntensityEnabled,
              is_external: true,
              external_calendar_id: event.provider_calendar_id,
              external_event_id: event.provider_event_uid,
              external_event_row_id: String(event.id),
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              tasks,
            } as ActivityWithCategory;
          });

          if (__DEV__) {
            console.log('[useHomeActivities] meta matched', { events: eventsData.length, matched: matchedCount });
          }
        }
      }
      
      console.log('[useHomeActivities] External activities:', externalActivities.length);
      
      // 4. Merge internal and external activities
      const preHydratedActivities = [...internalActivities, ...externalActivities];
      console.log('[useHomeActivities] Total merged activities:', preHydratedActivities.length);
      console.log('[useHomeActivities] Activities with resolved category:', preHydratedActivities.filter(a => a.category).length);
      console.log('[useHomeActivities] Activities WITHOUT resolved category:', preHydratedActivities.filter(a => !a.category).length);
      
      // 🔍 DEBUG: Log activities with tasks
      const activitiesWithTasks = preHydratedActivities.filter(a => a.tasks && a.tasks.length > 0);
      console.log('[useHomeActivities] Activities with tasks:', activitiesWithTasks.length);
      if (activitiesWithTasks.length > 0) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('✅ ACTIVITIES WITH TASKS:');
        activitiesWithTasks.forEach(activity => {
          console.log(`  - Title: ${activity.title}`);
          console.log(`    ID: ${activity.id}`);
          console.log(`    Tasks: ${activity.tasks?.length || 0}`);
          console.log(`    Is External: ${activity.is_external}`);
          console.log('  ---');
        });
        console.log('═══════════════════════════════════════════════════════');
      }
      
      // 🔍 DEBUG: Log all activities without resolved categories
      const activitiesWithoutCategory = preHydratedActivities.filter(a => !a.category);
      if (activitiesWithoutCategory.length > 0) {
        console.log('═══════════════════════════════════════════════════════');
        console.log('⚠️ ACTIVITIES WITHOUT RESOLVED CATEGORY:');
        activitiesWithoutCategory.forEach(activity => {
          console.log(`  - Title: ${activity.title}`);
          console.log(`    ID: ${activity.id}`);
          console.log(`    Category ID: ${activity.category_id || 'NULL'}`);
          console.log(`    Is External: ${activity.is_external}`);
          console.log(`    Category exists in map: ${activity.category_id ? categoryMap.has(activity.category_id) : 'N/A'}`);
          console.log('  ---');
        });
        console.log('═══════════════════════════════════════════════════════');
      }
      
      // 🔍 DEBUG: Warn if "I DAG" activities have 0 tasks
      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);
      
      const todayActivities = preHydratedActivities.filter(a => {
        const activityDate = new Date(a.activity_date);
        return activityDate >= todayStart && activityDate <= todayEnd;
      });
      
      todayActivities.forEach(activity => {
        if (!activity.tasks || activity.tasks.length === 0) {
          console.warn(`⚠️ "I DAG" activity "${activity.title}" (${activity.id}) has 0 tasks`);
        }
      });

      const internalIds = internalActivities.map(a => String(a.id)).filter(Boolean);
      const externalMetaIds = externalMetaData.map(m => String(m.id)).filter(Boolean);
      const externalEventRowIds = Array.isArray(externalActivities)
        ? externalActivities
            .map(a => (a as any)?.external_event_row_id)
            .filter(id => typeof id === 'string' && id.trim().length > 0)
        : [];

      const [internalTasksRes, externalEventTasksRes, externalActivityTasksRes] = await Promise.all([
        internalIds.length
          ? supabase
              .from('activity_tasks')
              .select('id, activity_id, title, description, completed, reminder_minutes, feedback_template_id, task_template_id, video_url, task_templates(after_training_delay_minutes)')
              .in('activity_id', internalIds)
          : Promise.resolve({ data: [], error: null }),
        externalMetaIds.length
          ? supabase
              .from('external_event_tasks')
              .select('*')
              .in('local_meta_id', externalMetaIds)
          : Promise.resolve({ data: [], error: null }),
        externalEventRowIds.length
          ? supabase
              .from('activity_tasks')
              .select('id, activity_id, title, description, completed, reminder_minutes, feedback_template_id, task_template_id, video_url, task_templates(after_training_delay_minutes)')
              .in('activity_id', externalEventRowIds)
          : Promise.resolve({ data: [], error: null }),
      ]);

      // Preload after_training_delay_minutes for any task templates referenced directly or via markers
      const templateIdCandidates = new Set<string>();
      [internalActivities, externalActivities].forEach(list =>
        (list || []).forEach(activity => {
          const tasks = Array.isArray(activity.tasks) ? activity.tasks : [];
          tasks.forEach(task => {
            const tid =
              normalizeId(task.task_template_id) ??
              normalizeId(task.feedback_template_id) ??
              getMarkerTemplateId(task);
            if (tid) templateIdCandidates.add(tid);
          });
        })
      );
      [internalTasksRes.data, externalEventTasksRes.data, externalActivityTasksRes.data].forEach(list =>
        (list || []).forEach((task: any) => {
          const tid = resolveTaskTemplateId(task);
          if (tid) templateIdCandidates.add(tid);
        })
      );

      let templateDelayById: Record<string, number | null> = {};
      if (templateIdCandidates.size) {
        const { data: templateRows } = await supabase
          .from('task_templates')
          .select('id, after_training_delay_minutes')
          .in('id', Array.from(templateIdCandidates));
        if (Array.isArray(templateRows)) {
          templateRows.forEach((row: any) => {
            const tid = normalizeId(row?.id);
            if (!tid) return;
            templateDelayById[tid] = coerceReminderMinutes(row.after_training_delay_minutes);
          });
        }
      }

      const internalTaskGroups = new Map<string, ActivityTask[]>();
      (internalTasksRes.data || []).forEach((task: any) => {
        const key = String(task.activity_id);
        const list = internalTaskGroups.get(key) || [];
        const templateId = resolveTaskTemplateId(task);
        const templateDelay =
          coerceReminderMinutes(task?.task_templates?.after_training_delay_minutes) ??
          (templateId ? templateDelayById[templateId] ?? null : null);
        const reminderMinutes = coerceReminderMinutes(task.reminder_minutes) ?? templateDelay ?? null;
        list.push({
          id: task.id,
          title: decodeUtf8Garble(task.title),
          description: decodeUtf8Garble(task.description || ''),
          completed: !!task.completed,
          reminder_minutes: reminderMinutes,
          after_training_delay_minutes: templateDelay ?? null,
          video_url: task.video_url ?? undefined,
          feedback_template_id: task.feedback_template_id ?? null,
          task_template_id: task.task_template_id ?? null,
        });
        internalTaskGroups.set(key, list);
      });

      const externalEventTaskGroups = new Map<string, ActivityTask[]>();
      (externalEventTasksRes.data || []).forEach((task: any) => {
        const key = String(task.local_meta_id);
        const list = externalEventTaskGroups.get(key) || [];
        const templateId = resolveTaskTemplateId(task);
        const templateDelay =
          coerceReminderMinutes(task?.task_templates?.after_training_delay_minutes) ??
          (templateId ? templateDelayById[templateId] ?? null : null);
        const reminderMinutes = coerceReminderMinutes(task.reminder_minutes) ?? templateDelay ?? null;
        list.push({
          id: task.id,
          title: decodeUtf8Garble(task.title),
          description: decodeUtf8Garble(task.description || ''),
          completed: !!task.completed,
          reminder_minutes: reminderMinutes,
          after_training_delay_minutes: templateDelay ?? null,
          video_url: task.video_url ?? undefined,
          feedback_template_id: task.feedback_template_id ?? null,
          task_template_id: task.task_template_id ?? null,
        });
        externalEventTaskGroups.set(key, list);
      });

      const externalActivityTaskGroups = new Map<string, ActivityTask[]>();
      (externalActivityTasksRes.data || []).forEach((task: any) => {
        const key = String(task.activity_id);
        const list = externalActivityTaskGroups.get(key) || [];
        const templateId = resolveTaskTemplateId(task);
        const templateDelay =
          coerceReminderMinutes(task?.task_templates?.after_training_delay_minutes) ??
          (templateId ? templateDelayById[templateId] ?? null : null);
        const reminderMinutes = coerceReminderMinutes(task.reminder_minutes) ?? templateDelay ?? null;
        list.push({
          id: task.id,
          title: decodeUtf8Garble(task.title),
          description: decodeUtf8Garble(task.description || ''),
          completed: !!task.completed,
          reminder_minutes: reminderMinutes,
          after_training_delay_minutes: templateDelay ?? null,
          video_url: task.video_url ?? undefined,
          feedback_template_id: task.feedback_template_id ?? null,
          task_template_id: task.task_template_id ?? null,
        });
        externalActivityTaskGroups.set(key, list);
      });

      const dedupeTasks = (lists: ActivityTask[][]): ActivityTask[] => {
        const seen = new Set<string>();
        const out: ActivityTask[] = [];
        lists.forEach(list =>
          (list || []).forEach(task => {
            const id = task?.id ? String(task.id) : null;
            if (id && seen.has(id)) return;
            if (id) seen.add(id);
            out.push(task);
          })
        );
        return out;
      };

      const orphanCleanupResults: {
        activityId: string;
        externalEventRowId: string | null;
        orphanIds: string[];
      }[] = [];

      const finalActivities = [...internalActivities, ...externalActivities].map(activity => {
        const key = String(activity.id);
        const rowKey = String((activity as any).external_event_row_id ?? '');
        let tasks: ActivityTask[] = [];
        if (activity.is_external) {
          tasks = dedupeTasks([
            externalEventTaskGroups.get(key) ?? [],
            (rowKey ? externalActivityTaskGroups.get(rowKey) : []) ?? [],
            activity.tasks ?? [],
          ]);

          const orphanIds = computeOrphanFeedbackTaskIds(tasks);
          if (orphanIds.length) {
            orphanCleanupResults.push({
              activityId: String(activity.id),
              externalEventRowId: rowKey || null,
              orphanIds,
            });
            const orphanSet = new Set(orphanIds.map(id => String(id)));
            tasks = tasks.filter(task => !orphanSet.has(String(task.id)));
          }
        } else {
          tasks = dedupeTasks([
            internalTaskGroups.get(key) ?? [],
            activity.tasks ?? [],
          ]);
        }

        // Decode any lingering garbled UTF-8 titles/descriptions (e.g., "pÃ¥" -> "på")
        tasks = tasks.map(task => ({
          ...task,
          title: decodeUtf8Garble(task.title),
          description: decodeUtf8Garble(task.description),
        }));

        // Enrich feedback tasks with reminder from their base template (via marker/templateId)
        const templateReminderById = new Map<string, number | null>();
        tasks.forEach((task) => {
          if (isFeedbackTask(task)) return;
          const tid = resolveTaskTemplateId(task);
          if (!tid) return;
          const val =
            coerceReminderMinutes(task.reminder_minutes) ??
            coerceReminderMinutes((task as any).after_training_delay_minutes);
          if (val !== null && !templateReminderById.has(tid)) {
            templateReminderById.set(tid, val);
          }
        });
        tasks = tasks.map((task) => {
          if (!isFeedbackTask(task)) return task;
          const tid = resolveTaskTemplateId(task);
          const existing =
            coerceReminderMinutes(task.reminder_minutes) ??
            coerceReminderMinutes((task as any).after_training_delay_minutes);
          if (existing !== null) return task;
          const inherited = tid ? templateReminderById.get(tid) ?? null : null;
          if (inherited === null) return task;
          return {
            ...task,
            reminder_minutes: inherited,
            after_training_delay_minutes:
              (task as any).after_training_delay_minutes ?? inherited,
          };
        });

        return {
          ...activity,
          tasks,
          minReminderMinutes: computeMinReminder(tasks),
        };
      });

      if (__DEV__) {
        const sampleInternal = finalActivities.find(a => !a.is_external && Array.isArray(a.tasks) && a.tasks.length);
        if (sampleInternal) {
          const firstTask = sampleInternal.tasks[0];
          const payload = {
            id: sampleInternal.id,
            title: sampleInternal.title,
            taskCount: sampleInternal.tasks.length,
            firstTask: firstTask
              ? {
                  id: firstTask.id,
                  reminder_minutes: firstTask.reminder_minutes,
                  after_training_delay_minutes: (firstTask as any).after_training_delay_minutes ?? null,
                  task_template_id: firstTask.task_template_id ?? null,
                  feedback_template_id: firstTask.feedback_template_id ?? null,
                  descriptionSnippet:
                    typeof firstTask.description === 'string'
                      ? firstTask.description.slice(0, 60)
                      : null,
                }
              : null,
          };
          console.log('[useHomeActivities][internal-sample]', payload);
          // Easy-to-copy JSON in Metro/VS Code terminal
          try {
            console.log('[useHomeActivities][internal-sample][json]', JSON.stringify(payload));
          } catch {}

          // Write to a debug file for easy sharing
          const debugPath = `${(FileSystem as any).cacheDirectory ?? ''}feedback-badge-sample.json`;
          if (debugPath) {
            FileSystem.writeAsStringAsync(debugPath, JSON.stringify(payload, null, 2)).catch(() => {});
            console.log('[useHomeActivities][internal-sample][file]', debugPath);
          }
        }
      }

      setActivities(finalActivities);

      if (orphanCleanupResults.length && __DEV__) {
        orphanCleanupResults.forEach(result => {
          console.log('[OrphanFeedbackCleanup]', {
            activityId: result.activityId,
            externalEventRowId: result.externalEventRowId,
            orphanCount: result.orphanIds.length,
            orphanIdsSample: result.orphanIds.slice(0, 3),
          });
        });
      }

      if (orphanCleanupResults.length && isAdmin) {
        const allOrphanIds = Array.from(
          new Set(orphanCleanupResults.flatMap(result => result.orphanIds.map(id => String(id))))
        );
        if (allOrphanIds.length) {
          try {
            const { error } = await supabase.from('external_event_tasks').delete().in('id', allOrphanIds);
            if (error) throw error;
          } catch (error) {
            if (__DEV__) {
              console.log('[OrphanFeedbackCleanup] failed to delete orphan feedback tasks (home)', {
                orphanCount: allOrphanIds.length,
                error,
              });
            }
          }
        }
      }

      if (__DEV__) {
        const ext = finalActivities.find(a => a.is_external && Array.isArray(a.tasks) && a.tasks.length > 0);
        if (ext) {
          console.log('[useHomeActivities] External sample post-set', {
            title: ext.title,
            id: ext.id,
            external_event_row_id: (ext as any).external_event_row_id ?? null,
            tasks: ext.tasks.length,
            minReminderMinutes: ext.minReminderMinutes ?? null,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch activities:', err);
      setActivities([]);
    }
  }, [userId, isAdmin]);

  const triggerRefetch = useCallback(
    async (reason: string = 'unspecified') => {
      if (!userId) {
        return;
      }

      if (refetchInFlightRef.current) {
        pendingRefreshReasonRef.current = reason;
        return;
      }

      refetchInFlightRef.current = true;
      try {
        console.log(`[useHomeActivities] Refetch triggered (${reason})`);
        await refetchActivities();
      } catch (error) {
        console.error(`[useHomeActivities] Refetch failed (${reason}):`, error);
      } finally {
        refetchInFlightRef.current = false;
        if (pendingRefreshReasonRef.current) {
          const nextReason = pendingRefreshReasonRef.current;
          pendingRefreshReasonRef.current = null;
          void triggerRefetch(`${nextReason}|pending`);
        }
      }
    },
    [userId, refetchActivities]
  );

  const refresh = useCallback(async () => {
    console.log('[useHomeActivities] Manual refresh triggered');
    await triggerRefetch('manual_refresh');
  }, [triggerRefetch]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!userId) {
        setActivities([]);
        setLoading(false);
        return;
      }

      try {
        await triggerRefetch('initial_load');
      } catch (err) {
        console.error('Failed to load home activities:', err);
      } finally {
        hasLoadedOnceRef.current = true;
        if (mounted) setLoading(false);
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, [userId, triggerRefetch]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedOnceRef.current) {
        return;
      }
      triggerRefetch('home_focus');
    }, [triggerRefetch])
  );

  useEffect(() => {
    const unsubscribeTask = subscribeToTaskCompletion(({ activityId, taskId, completed }) => {
      patchActivityTasks(activityId, taskId, completed);
    });

    const unsubscribePatch = subscribeToActivityPatch(({ activityId, updates }) => {
      patchActivityFields(activityId, updates);
    });

    return () => {
      unsubscribeTask();
      unsubscribePatch();
    };
  }, [patchActivityFields, patchActivityTasks]);

  useEffect(() => {
    const unsubscribe = subscribeToActivitiesRefreshRequested(event => {
      const currentVersion = getActivitiesRefreshRequestedVersion();
      if (currentVersion <= lastSeenRefreshVersionRef.current) {
        return;
      }

      if (!userId) {
        return;
      }

      lastSeenRefreshVersionRef.current = currentVersion;
      triggerRefetch(event?.reason || 'refresh_event');
    });

    return () => {
      unsubscribe();
    };
  }, [userId, triggerRefetch]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const currentVersion = getActivitiesRefreshRequestedVersion();
    if (currentVersion > lastSeenRefreshVersionRef.current) {
      lastSeenRefreshVersionRef.current = currentVersion;
      const lastEvent = getLastActivitiesRefreshRequestedEvent();
      triggerRefetch(lastEvent?.reason || 'missed_refresh_event');
    }
  }, [userId, triggerRefetch]);

  return {
    activities,
    loading,
    refresh,
  };
}


