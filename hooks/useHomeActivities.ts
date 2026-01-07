import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '@/app/integrations/supabase/client';
import { getCategories, DatabaseActivityCategory } from '@/services/activities';
import { resolveActivityCategory, type CategoryMappingRecord } from '@/shared/activityCategoryResolver';
import { subscribeToTaskCompletion } from '@/utils/taskEvents';
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
  reminder_minutes?: number;
  video_url?: string;
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
  is_external: boolean;
  external_calendar_id?: string;
  external_event_id?: string;
  created_at: string;
  updated_at: string;
  tasks?: ActivityTask[];
}

interface UseHomeActivitiesResult {
  activities: ActivityWithCategory[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useHomeActivities(): UseHomeActivitiesResult {
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
          is_external: false,
          created_at: activity.created_at,
          updated_at: activity.updated_at,
          tasks,
        };
      });
      
      const calendarIds = calendarsData?.map(c => c.id) || [];
      console.log('[useHomeActivities] Found enabled calendars:', calendarIds.length);
      
      let externalActivities: ActivityWithCategory[] = [];
      
      if (calendarIds.length > 0) {
        // ✅ SEQUENTIAL FETCH GROUP 2: External Events (depends on calendar IDs)
        const { data: eventsData, error: eventsError } = await supabase
          .from('events_external')
          .select('id, title, start_date, start_time, location, provider_calendar_id, provider_event_uid, raw_payload')
          .in('provider_calendar_id', calendarIds)
          .eq('deleted', false);
        
        if (eventsError) {
          console.error('[useHomeActivities] Error fetching external events:', eventsError);
        } else if (eventsData) {
          console.log('[useHomeActivities] External events found:', eventsData.length);
          
          // ✅ SEQUENTIAL FETCH GROUP 3: External Metadata (depends on event IDs)
          const externalEventIds = eventsData.map(e => e.id);
          const { data: metaData, error: metaError } = await supabase
            .from('events_local_meta')
            .select(`
              id,
              external_event_id,
              category_id,
              user_id,
              local_title_override,
              external_event_tasks (
                id,
                title,
                description,
                completed,
                reminder_minutes
              )
            `)
            .eq('user_id', userId)
            .in('external_event_id', externalEventIds);
          
          if (metaError) {
            console.error('[useHomeActivities] Error fetching external event metadata:', metaError);
          }
          
          // Map external events to activity format with resolved category and tasks
          externalActivities = eventsData.map(event => {
            const meta = metaData?.find(m => m.external_event_id === event.id);
            const categoryId = meta?.category_id || null;
            const providerCategories = Array.isArray(event.raw_payload?.categories)
              ? (event.raw_payload.categories as string[]).filter((cat) => typeof cat === 'string' && cat.trim().length > 0)
              : undefined;
            const resolvedCategory = resolveCategory(
              meta?.local_title_override || event.title,
              categoryId,
              providerCategories,
            );
            
            // Map tasks to the expected format
            const tasks: ActivityTask[] = (meta?.external_event_tasks || []).map((task: any) => ({
              id: task.id,
              title: task.title,
              description: task.description || '',
              completed: task.completed,
              reminder_minutes: task.reminder_minutes,
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
              is_external: true,
              external_calendar_id: event.provider_calendar_id,
              external_event_id: event.provider_event_uid,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              tasks,
            } as ActivityWithCategory;
          });
        }
      }
      
      console.log('[useHomeActivities] External activities:', externalActivities.length);
      
      // 4. Merge internal and external activities
      const mergedActivities = [...internalActivities, ...externalActivities];
      console.log('[useHomeActivities] Total merged activities:', mergedActivities.length);
      console.log('[useHomeActivities] Activities with resolved category:', mergedActivities.filter(a => a.category).length);
      console.log('[useHomeActivities] Activities WITHOUT resolved category:', mergedActivities.filter(a => !a.category).length);
      
      // 🔍 DEBUG: Log activities with tasks
      const activitiesWithTasks = mergedActivities.filter(a => a.tasks && a.tasks.length > 0);
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
      const activitiesWithoutCategory = mergedActivities.filter(a => !a.category);
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
      
      const todayActivities = mergedActivities.filter(a => {
        const activityDate = new Date(a.activity_date);
        return activityDate >= todayStart && activityDate <= todayEnd;
      });
      
      todayActivities.forEach(activity => {
        if (!activity.tasks || activity.tasks.length === 0) {
          console.warn(`⚠️ "I DAG" activity "${activity.title}" (${activity.id}) has 0 tasks`);
        }
      });
      
      setActivities(mergedActivities);
    } catch (err) {
      console.error('Failed to fetch activities:', err);
      setActivities([]);
    }
  }, [userId]);

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
