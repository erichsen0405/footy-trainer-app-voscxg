
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, ActivityCategory, Task, Trophy, ExternalCalendar, ActivitySeries } from '@/types';
import { fetchAndParseICalendar, formatTimeFromDate } from '@/utils/icalParser';
import { supabase } from '@/app/integrations/supabase/client';
import { 
  checkNotificationPermissions,
} from '@/utils/notificationService';
import { refreshNotificationQueue, forceRefreshNotificationQueue } from '@/utils/notificationScheduler';
import { startOfWeek, endOfWeek } from 'date-fns';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';

function getWeekNumber(date: Date): number {
  const d = new Date(date.getTime());
  d.setHours(0, 0, 0, 0);
  // Adjust to start week on Monday (ISO week)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// Helper function to generate dates for recurring activities
function generateRecurringDates(
  startDate: Date,
  endDate: Date | undefined,
  recurrenceType: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly',
  recurrenceDays?: number[]
): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  const end = endDate || new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000); // Default 1 year
  
  // Limit to prevent infinite loops
  const maxIterations = 1000;
  let iterations = 0;

  while (current <= end && iterations < maxIterations) {
    iterations++;

    if (recurrenceType === 'daily') {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    } else if (recurrenceType === 'weekly' || recurrenceType === 'biweekly' || recurrenceType === 'triweekly') {
      const weekMultiplier = recurrenceType === 'weekly' ? 1 : recurrenceType === 'biweekly' ? 2 : 3;
      
      if (recurrenceDays && recurrenceDays.length > 0) {
        // For the first week, add dates from start date onwards
        const startDay = current.getDay();
        const sortedDays = [...recurrenceDays].sort((a, b) => a - b);
        
        for (const day of sortedDays) {
          const daysToAdd = (day - startDay + 7) % 7;
          const targetDate = new Date(current);
          targetDate.setDate(current.getDate() + daysToAdd);
          
          if (targetDate >= startDate && targetDate <= end) {
            dates.push(new Date(targetDate));
          }
        }
        
        // Move to next week(s)
        current.setDate(current.getDate() + 7 * weekMultiplier);
      } else {
        // If no specific days, use the start date's day of week
        dates.push(new Date(current));
        current.setDate(current.getDate() + 7 * weekMultiplier);
      }
    } else if (recurrenceType === 'monthly') {
      dates.push(new Date(current));
      current.setMonth(current.getMonth() + 1);
    }
  }

  return dates;
}

export function useFootballData() {
  const [categories, setCategories] = useState<ActivityCategory[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [externalCalendars, setExternalCalendars] = useState<ExternalCalendar[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'trainer' | 'player' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  // Get selected context from TeamPlayerContext
  const { selectedContext } = useTeamPlayer();

  // Get current user and role
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user?.id);
      setUserId(user?.id || null);

      if (user) {
        // Get user role
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (roleData) {
          console.log('User role:', roleData.role);
          setUserRole(roleData.role as 'admin' | 'trainer' | 'player');
        }
      }
    };
    getCurrentUser();
  }, []);

  // Check notification permissions on mount
  useEffect(() => {
    const initializeNotifications = async () => {
      console.log('🔔 Checking notification permissions...');
      const granted = await checkNotificationPermissions();
      setNotificationsEnabled(granted);
      
      if (granted) {
        console.log('✅ Notifications are enabled');
      } else {
        console.log('❌ Notifications are disabled');
      }
    };
    
    initializeNotifications();
  }, []);

  // CRITICAL FIX: Add app state listener to refresh data when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log(`🔄 App became active on ${Platform.OS}, triggering data refresh...`);
        setRefreshTrigger(prev => prev + 1);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  // Load categories from Supabase with filtering based on selected context
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const loadCategories = async () => {
      console.log('🔄 Loading categories for user:', userId);
      console.log('Selected context:', selectedContext);

      let query = supabase
        .from('activity_categories')
        .select('*')
        .order('name', { ascending: true });

      // Filter based on user role and selected context
      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY categories for the selected player
          console.log('Loading categories ONLY for selected player:', selectedContext.id);
          query = query.eq('player_id', selectedContext.id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY categories for the selected team
          console.log('Loading categories ONLY for selected team:', selectedContext.id);
          query = query.eq('team_id', selectedContext.id);
        } else {
          // No selection - show only trainer's own categories
          query = query.eq('user_id', userId);
        }
      } else {
        // Player - show own categories and those assigned to them
        query = query.or(`user_id.eq.${userId},player_id.eq.${userId}`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Error loading categories:', error);
        setIsLoading(false);
        return;
      }

      if (data && data.length > 0) {
        const loadedCategories = data.map(cat => ({
          id: cat.id,
          name: cat.name,
          color: cat.color,
          emoji: cat.emoji,
        }));
        console.log('✅ Loaded categories:', loadedCategories.length, loadedCategories.map(c => c.name));
        setCategories(loadedCategories);
      } else {
        console.log('⚠️ No categories found in database');
        setCategories([]);
      }
    };

    loadCategories();
  }, [userId, userRole, selectedContext, refreshTrigger]);

  // Load task templates from Supabase with filtering based on selected context
  useEffect(() => {
    if (!userId) return;

    const loadTasks = async () => {
      console.log('Loading task templates for user:', userId);
      console.log('Selected context:', selectedContext);
      
      let query = supabase
        .from('task_templates')
        .select(`
          *,
          task_template_categories(
            category_id
          )
        `);

      // Filter based on user role and selected context
      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY task templates for the selected player
          console.log('Loading task templates ONLY for selected player:', selectedContext.id);
          query = query.eq('player_id', selectedContext.id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY task templates for the selected team
          console.log('Loading task templates ONLY for selected team:', selectedContext.id);
          query = query.eq('team_id', selectedContext.id);
        } else {
          // No selection - show only trainer's own task templates
          query = query.eq('user_id', userId);
        }
      } else {
        // Player - show own task templates and those assigned to them
        query = query.or(`user_id.eq.${userId},player_id.eq.${userId}`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading task templates:', error);
        return;
      }

      if (data) {
        const loadedTasks: Task[] = data.map(template => ({
          id: template.id,
          title: template.title,
          description: template.description || '',
          completed: false,
          isTemplate: true,
          categoryIds: template.task_template_categories?.map((ttc: any) => ttc.category_id) || [],
          reminder: template.reminder_minutes || undefined,
          subtasks: [],
          videoUrl: template.video_url || undefined,
        }));
        console.log('Loaded task templates:', loadedTasks.length);
        setTasks(loadedTasks);
      }
    };

    loadTasks();
  }, [userId, userRole, selectedContext, refreshTrigger]);

  // Load external calendars from Supabase with filtering based on selected context
  useEffect(() => {
    if (!userId) return;

    const loadExternalCalendars = async () => {
      console.log('Loading external calendars for user:', userId);
      console.log('Selected context:', selectedContext);

      let query = supabase
        .from('external_calendars')
        .select('*');

      // Filter based on user role and selected context
      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY calendars for the selected player
          console.log('Loading calendars ONLY for selected player:', selectedContext.id);
          query = query.eq('player_id', selectedContext.id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY calendars for the selected team
          console.log('Loading calendars ONLY for selected team:', selectedContext.id);
          query = query.eq('team_id', selectedContext.id);
        } else {
          // No selection - show only trainer's own calendars
          query = query.eq('user_id', userId);
        }
      } else {
        // Player - show own calendars and those assigned to them
        query = query.or(`user_id.eq.${userId},player_id.eq.${userId}`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading external calendars:', error);
        return;
      }

      if (data) {
        const loadedCalendars: ExternalCalendar[] = data.map(cal => ({
          id: cal.id,
          name: cal.name,
          icsUrl: cal.ics_url,
          enabled: cal.enabled,
          lastFetched: cal.last_fetched ? new Date(cal.last_fetched) : undefined,
          eventCount: cal.event_count || 0,
        }));
        console.log('Loaded external calendars:', loadedCalendars.length);
        setExternalCalendars(loadedCalendars);
      }
    };

    loadExternalCalendars();
  }, [userId, userRole, selectedContext, refreshTrigger]);

  // Load ALL activities (internal + external with NEW ARCHITECTURE) WITH TASKS
  // Filtered based on selected context
  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    const loadActivities = async () => {
      console.log('🔄 Loading activities for user (NEW ARCHITECTURE):', userId);
      console.log('Selected context:', selectedContext);
      
      // Build query for internal activities
      let internalQuery = supabase
        .from('activities')
        .select(`
          *,
          category:activity_categories(*),
          activity_tasks(
            id,
            title,
            description,
            completed,
            reminder_minutes,
            task_template_id
          )
        `)
        .eq('is_external', false)
        .order('activity_date', { ascending: true });

      // Filter based on user role and selected context
      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY activities for the selected player
          console.log('Loading activities ONLY for selected player:', selectedContext.id);
          internalQuery = internalQuery.eq('player_id', selectedContext.id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY activities for the selected team
          console.log('Loading activities ONLY for selected team:', selectedContext.id);
          internalQuery = internalQuery.eq('team_id', selectedContext.id);
        } else {
          // No selection - show only trainer's own activities
          internalQuery = internalQuery.eq('user_id', userId);
        }
      } else {
        // Player - show own activities and those assigned to them
        internalQuery = internalQuery.or(`user_id.eq.${userId},player_id.eq.${userId}`);
      }

      const { data: internalData, error: internalError } = await internalQuery;

      if (internalError) {
        console.error('❌ Error loading internal activities:', internalError);
      }

      // Build query for external activities
      let externalQuery = supabase
        .from('events_external')
        .select(`
          id,
          title,
          description,
          location,
          start_date,
          start_time,
          end_date,
          end_time,
          is_all_day,
          provider_event_uid,
          provider_calendar_id,
          events_local_meta!inner(
            id,
            user_id,
            category_id,
            manually_set_category,
            category_updated_at,
            player_id,
            team_id,
            activity_categories(*),
            external_event_tasks(
              id,
              title,
              description,
              completed,
              reminder_minutes,
              task_template_id
            )
          )
        `);

      // Filter based on user role and selected context
      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY external events for the selected player
          console.log('Loading external events ONLY for selected player:', selectedContext.id);
          externalQuery = externalQuery.eq('events_local_meta.player_id', selectedContext.id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          // CRITICAL FIX: Show ONLY external events for the selected team
          console.log('Loading external events ONLY for selected team:', selectedContext.id);
          externalQuery = externalQuery.eq('events_local_meta.team_id', selectedContext.id);
        } else {
          // No selection - show only trainer's own external events
          externalQuery = externalQuery.eq('events_local_meta.user_id', userId);
        }
      } else {
        // Player - show own external events and those assigned to them
        externalQuery = externalQuery.or(`events_local_meta.user_id.eq.${userId},events_local_meta.player_id.eq.${userId}`);
      }

      const { data: externalData, error: externalError } = await externalQuery;

      if (externalError) {
        console.error('❌ Error loading external activities:', externalError);
      }

      const loadedActivities: Activity[] = [];

      // Process internal activities
      if (internalData) {
        console.log(`✅ Loaded ${internalData.length} internal activities`);
        
        internalData.forEach(act => {
          const category = act.category ? {
            id: act.category.id,
            name: act.category.name,
            color: act.category.color,
            emoji: act.category.emoji,
          } : categories[0];

          const activityDate = new Date(act.activity_date);
          
          const activityTasks: Task[] = (act.activity_tasks || [])
            .filter((at: any) => at && at.id && at.title)
            .map((at: any) => ({
              id: at.id,
              title: at.title,
              description: at.description || '',
              completed: at.completed || false,
              isTemplate: false,
              categoryIds: [],
              reminder: at.reminder_minutes || undefined,
              subtasks: [],
            }));

          loadedActivities.push({
            id: act.id,
            title: act.title,
            date: activityDate,
            time: act.activity_time,
            location: act.location || 'Ingen lokation',
            category,
            tasks: activityTasks,
            isExternal: false,
            seriesId: act.series_id || undefined,
            seriesInstanceDate: act.series_instance_date ? new Date(act.series_instance_date) : undefined,
          });
        });
      }

      // Process external activities (NEW ARCHITECTURE WITH TASKS)
      if (externalData) {
        console.log(`✅ Loaded ${externalData.length} external activities (NEW ARCHITECTURE)`);
        
        externalData.forEach((extEvent: any) => {
          // CRITICAL FIX: Handle events_local_meta as an array (due to !inner join)
          const localMetaArray = extEvent.events_local_meta;
          
          // If it's an array, take the first element; otherwise use it directly
          const localMeta = Array.isArray(localMetaArray) && localMetaArray.length > 0
            ? localMetaArray[0]
            : (Array.isArray(localMetaArray) ? null : localMetaArray);

          if (!localMeta) {
            console.warn('⚠️ External event without local metadata:', extEvent.id);
            return;
          }

          const category = localMeta.activity_categories ? {
            id: localMeta.activity_categories.id,
            name: localMeta.activity_categories.name,
            color: localMeta.activity_categories.color,
            emoji: localMeta.activity_categories.emoji,
          } : categories[0];

          const activityDate = new Date(extEvent.start_date);
          
          // CRITICAL FIX: Process external event tasks (handle both array and null)
          const externalTasksRaw = localMeta.external_event_tasks;
          const externalTasks: Task[] = (Array.isArray(externalTasksRaw) ? externalTasksRaw : [])
            .filter((eet: any) => eet && eet.id && eet.title)
            .map((eet: any) => ({
              id: eet.id,
              title: eet.title,
              description: eet.description || '',
              completed: eet.completed || false,
              isTemplate: false,
              categoryIds: [],
              reminder: eet.reminder_minutes || undefined,
              subtasks: [],
            }));
          
          const manuallySet = localMeta.manually_set_category ? '✅ MANUAL' : '❌ AUTO';
          console.log(`📅 External activity "${extEvent.title}" -> Category: ${category.name} (${category.emoji}) [${manuallySet}] - ${externalTasks.length} tasks`);

          loadedActivities.push({
            id: localMeta.id, // Use local metadata ID as the activity ID
            title: extEvent.title,
            date: activityDate,
            time: extEvent.start_time,
            location: extEvent.location || 'Ingen lokation',
            category,
            tasks: externalTasks,
            isExternal: true,
            externalCalendarId: extEvent.provider_calendar_id,
            externalEventId: extEvent.provider_event_uid,
          });
        });
      }

      console.log('✅ Total activities loaded:', loadedActivities.length);
      console.log('📊 Internal activities:', loadedActivities.filter(a => !a.isExternal).length);
      console.log('📊 External activities:', loadedActivities.filter(a => a.isExternal).length);
      console.log('📊 Total tasks across all activities:', loadedActivities.reduce((sum, a) => sum + a.tasks.length, 0));
      
      setActivities(loadedActivities);

      // Refresh notification queue after loading activities
      if (notificationsEnabled) {
        console.log('🔔 Refreshing notification queue after loading activities...');
        refreshNotificationQueue().catch(err => {
          console.error('❌ Error refreshing notification queue:', err);
        });
      }

      setIsLoading(false);
    };

    loadActivities();
  }, [userId, userRole, selectedContext, categories, refreshTrigger, notificationsEnabled]);

  // Load trophies from database
  useEffect(() => {
    if (!userId) return;

    const loadTrophies = async () => {
      console.log('Loading trophies for user:', userId);
      const { data, error } = await supabase
        .from('trophies')
        .select('*')
        .eq('user_id', userId)
        .order('year', { ascending: false })
        .order('week', { ascending: false });

      if (error) {
        console.error('Error loading trophies:', error);
        return;
      }

      if (data) {
        const loadedTrophies: Trophy[] = data.map(trophy => ({
          week: trophy.week,
          year: trophy.year,
          type: trophy.type as 'gold' | 'silver' | 'bronze',
          percentage: trophy.percentage,
          completedTasks: trophy.completed_tasks,
          totalTasks: trophy.total_tasks,
        }));
        console.log('Loaded trophies:', loadedTrophies.length);
        setTrophies(loadedTrophies);
      }
    };

    loadTrophies();
  }, [userId]);

  const getCurrentWeekStats = useMemo(() => {
    const now = new Date();
    // Start week on Monday (weekStartsOn: 1)
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    // Get today's date for comparison
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const weekActivities = activities.filter(activity => {
      const activityDate = new Date(activity.date);
      return activityDate >= weekStart && activityDate <= weekEnd;
    });

    // Calculate tasks up to today
    const activitiesUpToToday = weekActivities.filter(activity => {
      const activityDate = new Date(activity.date);
      return activityDate <= today;
    });

    const totalTasksUpToToday = activitiesUpToToday.reduce((sum, activity) => sum + activity.tasks.length, 0);
    const completedTasksUpToToday = activitiesUpToToday.reduce(
      (sum, activity) => sum + activity.tasks.filter(task => task.completed).length,
      0
    );

    // Calculate total tasks for the week
    const totalTasksForWeek = weekActivities.reduce((sum, activity) => sum + activity.tasks.length, 0);
    const completedTasksForWeek = weekActivities.reduce(
      (sum, activity) => sum + activity.tasks.filter(task => task.completed).length,
      0
    );

    const percentageUpToToday = totalTasksUpToToday > 0 
      ? Math.round((completedTasksUpToToday / totalTasksUpToToday) * 100) 
      : 0;

    return {
      percentage: percentageUpToToday,
      completedTasks: completedTasksUpToToday,
      totalTasks: totalTasksUpToToday,
      completedTasksForWeek,
      totalTasksForWeek,
      weekActivities,
    };
  }, [activities]);

  const getTodayActivities = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    return activities.filter(activity => {
      const activityDate = new Date(activity.date);
      activityDate.setHours(0, 0, 0, 0);
      return activityDate >= today && activityDate < tomorrow;
    });
  }, [activities]);

  // Computed property for external activities (for backwards compatibility)
  const externalActivities = useMemo(() => {
    return activities.filter(a => a.isExternal);
  }, [activities]);

  const addActivity = (activity: Omit<Activity, 'id'>) => {
    const newActivity: Activity = {
      ...activity,
      id: `activity-${Date.now()}`,
    };
    setActivities([...activities, newActivity]);
  };

  const createActivity = async (activityData: {
    title: string;
    location: string;
    categoryId: string;
    date: Date;
    time: string;
    isRecurring: boolean;
    recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
    recurrenceDays?: number[];
    endDate?: Date;
  }) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Creating activity:', activityData);
    console.log('Selected context:', selectedContext);

    try {
      // Determine player_id and team_id based on selected context
      let player_id = null;
      let team_id = null;

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          player_id = selectedContext.id;
          console.log('Creating activity for player:', player_id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          team_id = selectedContext.id;
          console.log('Creating activity for team:', team_id);
        }
      }

      if (activityData.isRecurring) {
        // Create activity series
        const { data: seriesData, error: seriesError } = await supabase
          .from('activity_series')
          .insert({
            user_id: userId,
            title: activityData.title,
            location: activityData.location,
            category_id: activityData.categoryId,
            recurrence_type: activityData.recurrenceType!,
            recurrence_days: activityData.recurrenceDays || [],
            start_date: activityData.date.toISOString().split('T')[0],
            end_date: activityData.endDate ? activityData.endDate.toISOString().split('T')[0] : null,
            activity_time: activityData.time,
            player_id,
            team_id,
          })
          .select()
          .single();

        if (seriesError) {
          console.error('Error creating series:', seriesError);
          throw seriesError;
        }

        console.log('Series created:', seriesData.id);

        // Generate dates for the series
        const dates = generateRecurringDates(
          activityData.date,
          activityData.endDate,
          activityData.recurrenceType!,
          activityData.recurrenceDays
        );

        console.log(`Generated ${dates.length} dates for series`);

        // Create activities for each date
        const activitiesToInsert = dates.map(date => ({
          user_id: userId,
          title: activityData.title,
          activity_date: date.toISOString().split('T')[0],
          activity_time: activityData.time,
          location: activityData.location,
          category_id: activityData.categoryId,
          series_id: seriesData.id,
          series_instance_date: date.toISOString().split('T')[0],
          is_external: false,
          player_id,
          team_id,
        }));

        const { error: activitiesError } = await supabase
          .from('activities')
          .insert(activitiesToInsert);

        if (activitiesError) {
          console.error('Error creating activities:', activitiesError);
          throw activitiesError;
        }

        console.log('Activities created successfully');
      } else {
        // Create single activity
        const { error } = await supabase
          .from('activities')
          .insert({
            user_id: userId,
            title: activityData.title,
            activity_date: activityData.date.toISOString().split('T')[0],
            activity_time: activityData.time,
            location: activityData.location,
            category_id: activityData.categoryId,
            is_external: false,
            player_id,
            team_id,
          });

        if (error) {
          console.error('Error creating activity:', error);
          throw error;
        }

        console.log('Activity created successfully');
      }

      // Trigger refresh
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue after creating activities
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      console.error('Failed to create activity:', error);
      throw error;
    }
  };

  const updateActivity = (id: string, updates: Partial<Activity>) => {
    setActivities(activities.map(activity => 
      activity.id === id ? { ...activity, ...updates } : activity
    ));
  };

  const updateActivitySingle = async (activityId: string, updates: {
    title?: string;
    location?: string;
    categoryId?: string;
    date?: Date;
    time?: string;
  }) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('');
    console.log('🔄 ========== UPDATE ACTIVITY STARTED (NEW ARCHITECTURE) ==========');
    console.log(`📱 Platform: ${Platform.OS}`);
    console.log(`🆔 Activity ID: ${activityId}`);
    console.log(`👤 User ID: ${userId}`);
    console.log(`📝 Updates:`, JSON.stringify(updates, null, 2));
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);

    try {
      // First, check if this is an external activity
      const activity = activities.find(a => a.id === activityId);
      if (!activity) {
        console.error('❌ Activity not found in local state');
        throw new Error('Activity not found');
      }

      const isExternal = activity.isExternal || false;
      console.log(`📦 Activity type: ${isExternal ? 'EXTERNAL' : 'INTERNAL'}`);
      console.log(`📋 Current category: ${activity.category.name} (${activity.category.id})`);

      if (isExternal) {
        // Update local metadata for external activity
        console.log('🔄 Updating local metadata for external activity...');
        
        const updateData: any = {};
        
        if (updates.categoryId !== undefined) {
          updateData.category_id = updates.categoryId;
          updateData.manually_set_category = true;
          updateData.category_updated_at = new Date().toISOString();
          console.log(`   🏷️ Updating category ID: ${updates.categoryId}`);
          console.log('   🔒 Setting manually_set_category = TRUE');
          console.log(`   🕐 Setting category_updated_at = ${updateData.category_updated_at}`);
        }
        
        if (updates.title !== undefined) {
          updateData.local_title_override = updates.title;
          console.log(`   ✏️ Setting title override: "${updates.title}"`);
        }
        
        updateData.last_local_modified = new Date().toISOString();
        updateData.updated_at = new Date().toISOString();

        console.log('📤 Sending update to events_local_meta...');
        
        const { error: updateError } = await supabase
          .from('events_local_meta')
          .update(updateData)
          .eq('id', activityId)
          .eq('user_id', userId);

        if (updateError) {
          console.error('❌ Error updating local metadata:', updateError);
          throw updateError;
        }

        console.log('✅ Local metadata updated successfully');
      } else {
        // Update internal activity
        console.log('🔄 Updating internal activity...');
        
        const updateData: any = {};
        
        if (updates.title !== undefined) {
          updateData.title = updates.title;
          console.log(`   ✏️ Updating title: "${updates.title}"`);
        }
        if (updates.location !== undefined) {
          updateData.location = updates.location;
          console.log(`   📍 Updating location: "${updates.location}"`);
        }
        if (updates.date !== undefined) {
          updateData.activity_date = updates.date.toISOString().split('T')[0];
          console.log(`   📅 Updating date: ${updateData.activity_date}`);
        }
        if (updates.time !== undefined) {
          updateData.activity_time = updates.time;
          console.log(`   ⏰ Updating time: ${updates.time}`);
        }
        
        if (updates.categoryId !== undefined) {
          updateData.category_id = updates.categoryId;
          updateData.manually_set_category = true;
          updateData.category_updated_at = new Date().toISOString();
          console.log(`   🏷️ Updating category ID: ${updates.categoryId}`);
          console.log('   🔒 Setting manually_set_category = TRUE');
        }
        
        // Remove from series when updating single activity
        if (updates.title !== undefined || updates.location !== undefined || updates.date !== undefined || updates.time !== undefined) {
          updateData.series_id = null;
          updateData.series_instance_date = null;
          console.log('   🔗 Removing from series (if applicable)');
        }
        
        updateData.updated_at = new Date().toISOString();

        console.log('📤 Sending update to activities...');
        
        const { error: updateError } = await supabase
          .from('activities')
          .update(updateData)
          .eq('id', activityId)
          .eq('user_id', userId);

        if (updateError) {
          console.error('❌ Error updating activity:', updateError);
          throw updateError;
        }

        console.log('✅ Activity updated successfully');
      }
      
      // Wait for database propagation
      console.log('⏳ Waiting 500ms for database propagation...');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Trigger a full refresh to ensure consistency
      console.log('🔄 Triggering full data refresh...');
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue if date/time changed
      if ((updates.date || updates.time) && notificationsEnabled) {
        console.log('🔔 Refreshing notification queue...');
        await refreshNotificationQueue(true);
      }

      console.log('');
      console.log('✅ ========== UPDATE ACTIVITY COMPLETED (NEW ARCHITECTURE) ==========');
      console.log('');
    } catch (error) {
      console.error('');
      console.error('❌ ========== UPDATE ACTIVITY FAILED ==========');
      console.error('Failed to update activity:', error);
      console.error('');
      throw error;
    }
  };

  const updateActivitySeries = async (seriesId: string, updates: {
    title?: string;
    location?: string;
    categoryId?: string;
    time?: string;
  }) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Updating activity series:', seriesId);

    try {
      const updateData: any = {};
      
      if (updates.title) updateData.title = updates.title;
      if (updates.location) updateData.location = updates.location;
      if (updates.categoryId) updateData.category_id = updates.categoryId;
      if (updates.time) updateData.activity_time = updates.time;
      updateData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('activity_series')
        .update(updateData)
        .eq('id', seriesId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating series:', error);
        throw error;
      }

      console.log('Series updated successfully (trigger will update all activities)');
      
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue if time changed
      if (updates.time && notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      console.error('Failed to update series:', error);
      throw error;
    }
  };

  const deleteActivity = async (id: string) => {
    console.log('Deleting activity:', id);
    
    // Check if it's an external activity
    const activity = activities.find(a => a.id === id);
    const isExternal = activity?.isExternal;
    
    if (isExternal) {
      console.log('Cannot delete external activity from app');
      throw new Error('Cannot delete external activities');
    }

    try {
      // Delete from Supabase
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting activity from database:', error);
        throw error;
      }

      console.log('Activity deleted from database successfully');

      // Update local state immediately
      setActivities(prevActivities => prevActivities.filter(activity => activity.id !== id));
      
      // Trigger a refresh to ensure consistency
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue after deleting activity
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      console.error('Failed to delete activity:', error);
      throw error;
    }
  };

  const deleteActivitySingle = async (activityId: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Deleting single activity:', activityId);

    try {
      // Delete from Supabase
      const { error } = await supabase
        .from('activities')
        .delete()
        .eq('id', activityId)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting activity:', error);
        throw error;
      }

      console.log('Activity deleted successfully');

      // Update local state immediately
      setActivities(prevActivities => prevActivities.filter(a => a.id !== activityId));
      
      // Trigger a refresh to ensure consistency
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue after deleting activity
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      console.error('Failed to delete activity:', error);
      throw error;
    }
  };

  const deleteActivitySeries = async (seriesId: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Deleting activity series:', seriesId);

    try {
      // Delete all activities in the series
      const { error: activitiesError } = await supabase
        .from('activities')
        .delete()
        .eq('series_id', seriesId)
        .eq('user_id', userId);

      if (activitiesError) {
        console.error('Error deleting series activities:', activitiesError);
        throw activitiesError;
      }

      console.log('Series activities deleted');

      // Delete the series itself
      const { error: seriesError } = await supabase
        .from('activity_series')
        .delete()
        .eq('id', seriesId)
        .eq('user_id', userId);

      if (seriesError) {
        console.error('Error deleting series:', seriesError);
        throw seriesError;
      }

      console.log('Series deleted successfully');

      // Update local state immediately
      setActivities(prevActivities => prevActivities.filter(a => a.seriesId !== seriesId));
      
      // Trigger a refresh to ensure consistency
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue after deleting series
      if (notificationsEnabled) {
        await forceRefreshNotificationQueue();
      }
    } catch (error) {
      console.error('Failed to delete series:', error);
      throw error;
    }
  };

  const duplicateActivity = async (id: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('🔄 Duplicating activity:', id);

    const activity = activities.find(a => a.id === id);
    if (!activity) {
      console.error('❌ Activity not found');
      throw new Error('Activity not found');
    }

    // Check if it's an external activity
    if (activity.isExternal) {
      console.error('❌ Cannot duplicate external activity');
      throw new Error('Cannot duplicate external activities. Only manual activities can be duplicated.');
    }

    try {
      // Create a duplicate of the activity with " (kopi)" appended to the title
      const duplicateTitle = `${activity.title} (kopi)`;
      
      console.log(`📝 Creating duplicate: "${duplicateTitle}"`);
      console.log(`📅 Date: ${activity.date.toISOString().split('T')[0]}`);
      console.log(`⏰ Time: ${activity.time}`);
      console.log(`📍 Location: ${activity.location}`);
      console.log(`🏷️ Category: ${activity.category.name} (${activity.category.id})`);

      // Determine player_id and team_id based on selected context
      let player_id = null;
      let team_id = null;

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          player_id = selectedContext.id;
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          team_id = selectedContext.id;
        }
      }

      // Insert the duplicate activity
      const { data: newActivity, error: activityError } = await supabase
        .from('activities')
        .insert({
          user_id: userId,
          title: duplicateTitle,
          activity_date: activity.date.toISOString().split('T')[0],
          activity_time: activity.time,
          location: activity.location,
          category_id: activity.category.id,
          is_external: false,
          player_id,
          team_id,
          // Don't copy series_id - this is a standalone duplicate
        })
        .select()
        .single();

      if (activityError) {
        console.error('❌ Error creating duplicate activity:', activityError);
        throw activityError;
      }

      console.log('✅ Duplicate activity created:', newActivity.id);

      // Duplicate all tasks from the original activity
      if (activity.tasks.length > 0) {
        console.log(`📋 Duplicating ${activity.tasks.length} tasks...`);
        
        const tasksToInsert = activity.tasks.map(task => ({
          activity_id: newActivity.id,
          task_template_id: null, // Don't link to template for duplicated tasks
          title: task.title,
          description: task.description,
          completed: false, // Reset completion status
          reminder_minutes: task.reminder,
        }));

        const { error: tasksError } = await supabase
          .from('activity_tasks')
          .insert(tasksToInsert);

        if (tasksError) {
          console.error('❌ Error duplicating tasks:', tasksError);
          // Don't throw - activity was created successfully
        } else {
          console.log('✅ Tasks duplicated successfully');
        }
      }

      // Trigger refresh to show the new activity
      console.log('🔄 Triggering data refresh...');
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue after duplicating activity
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }

      console.log('✅ Activity duplication completed successfully');
    } catch (error) {
      console.error('❌ Failed to duplicate activity:', error);
      throw error;
    }
  };

  const addTask = async (task: Omit<Task, 'id'>) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Creating task template:', task);
    console.log('Selected context:', selectedContext);

    try {
      // Determine player_id and team_id based on selected context
      let player_id = null;
      let team_id = null;

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          player_id = selectedContext.id;
          console.log('Creating task template for player:', player_id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          team_id = selectedContext.id;
          console.log('Creating task template for team:', team_id);
        }
      }

      // Insert the task template
      const { data: templateData, error: templateError } = await supabase
        .from('task_templates')
        .insert({
          user_id: userId,
          title: task.title,
          description: task.description,
          reminder_minutes: task.reminder,
          video_url: task.videoUrl || null,
          player_id,
          team_id,
        })
        .select()
        .single();

      if (templateError) {
        console.error('Error creating task template:', templateError);
        throw templateError;
      }

      console.log('Task template created:', templateData.id);

      // Insert category associations
      if (task.categoryIds && task.categoryIds.length > 0) {
        const categoryInserts = task.categoryIds.map(categoryId => ({
          task_template_id: templateData.id,
          category_id: categoryId,
        }));

        const { error: categoryError } = await supabase
          .from('task_template_categories')
          .insert(categoryInserts);

        if (categoryError) {
          console.error('Error creating task template categories:', categoryError);
          throw categoryError;
        }

        console.log('Task template categories created - trigger will create tasks for activities');
      }

      // Trigger refresh to reload tasks AND activities (to show new tasks)
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue after adding task template
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      console.error('Failed to create task template:', error);
      throw error;
    }
  };

  const updateTask = async (id: string, updates: Partial<Task>) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Updating task template:', id);

    try {
      // Update the task template
      const updateData: any = {};
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.reminder !== undefined) updateData.reminder_minutes = updates.reminder;
      if (updates.videoUrl !== undefined) updateData.video_url = updates.videoUrl || null;
      updateData.updated_at = new Date().toISOString();

      const { error: templateError } = await supabase
        .from('task_templates')
        .update(updateData)
        .eq('id', id)
        .eq('user_id', userId);

      if (templateError) {
        console.error('Error updating task template:', templateError);
        throw templateError;
      }

      console.log('Task template updated');

      // Update category associations if provided
      if (updates.categoryIds !== undefined) {
        // Delete existing associations
        const { error: deleteError } = await supabase
          .from('task_template_categories')
          .delete()
          .eq('task_template_id', id);

        if (deleteError) {
          console.error('Error deleting task template categories:', deleteError);
          throw deleteError;
        }

        // Insert new associations
        if (updates.categoryIds.length > 0) {
          const categoryInserts = updates.categoryIds.map(categoryId => ({
            task_template_id: id,
            category_id: categoryId,
          }));

          const { error: categoryError } = await supabase
            .from('task_template_categories')
            .insert(categoryInserts);

          if (categoryError) {
            console.error('Error creating task template categories:', categoryError);
            throw categoryError;
          }

          console.log('Task template categories updated - trigger will update tasks for activities');
        }
      }

      // Update all activity tasks linked to this template
      if (updateData.title || updateData.description || updateData.reminder_minutes !== undefined) {
        const activityUpdateData: any = {};
        if (updateData.title) activityUpdateData.title = updateData.title;
        if (updateData.description) activityUpdateData.description = updateData.description;
        if (updateData.reminder_minutes !== undefined) activityUpdateData.reminder_minutes = updateData.reminder_minutes;
        
        if (Object.keys(activityUpdateData).length > 0) {
          const { error: activityTaskError } = await supabase
            .from('activity_tasks')
            .update(activityUpdateData)
            .eq('task_template_id', id);

          if (activityTaskError) {
            console.error('Error updating activity tasks:', activityTaskError);
          } else {
            console.log('Activity tasks updated to match template');
          }
        }
      }

      // Trigger refresh to reload tasks AND activities
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue if reminder changed
      if (updateData.reminder_minutes !== undefined && notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error) {
      console.error('Failed to update task template:', error);
      throw error;
    }
  };

  const deleteTask = async (id: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('Deleting task template:', id);

    try {
      // Delete the task template (cascade will delete categories and activity tasks)
      const { error } = await supabase
        .from('task_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting task template:', error);
        throw error;
      }

      console.log('Task template deleted');

      // Trigger refresh to reload tasks AND activities
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue after deleting task template
      if (notificationsEnabled) {
        await forceRefreshNotificationQueue();
      }
    } catch (error) {
      console.error('Failed to delete task template:', error);
      throw error;
    }
  };

  const duplicateTask = async (id: string) => {
    const task = tasks.find(t => t.id === id);
    if (task) {
      await addTask({
        ...task,
        title: `${task.title} (kopi)`,
      });
    }
  };

  const toggleTaskCompletion = async (activityId: string, taskId: string) => {
    console.log('⚡ OPTIMISTIC: Toggling task completion:', { activityId, taskId });
    
    // Find the activity and task
    const activity = activities.find(a => a.id === activityId);
    if (!activity) {
      console.error('Activity not found:', activityId);
      return;
    }

    const task = activity.tasks.find(t => t.id === taskId);
    if (!task) {
      console.error('Task not found:', taskId);
      return;
    }

    const newCompleted = !task.completed;
    console.log('⚡ OPTIMISTIC: Setting task completed to:', newCompleted);

    // CRITICAL PERFORMANCE FIX: Update local state IMMEDIATELY (optimistic update)
    setActivities(prevActivities => 
      prevActivities.map(act => {
        if (act.id === activityId) {
          return {
            ...act,
            tasks: act.tasks.map(t =>
              t.id === taskId ? { ...t, completed: newCompleted } : t
            ),
          };
        }
        return act;
      })
    );

    // Then update database in the background
    try {
      // Determine which table to update based on whether it's an external activity
      const tableName = activity.isExternal ? 'external_event_tasks' : 'activity_tasks';
      
      console.log(`🔄 BACKGROUND: Updating ${tableName} in database...`);
      
      // Update in database
      const { error } = await supabase
        .from(tableName)
        .update({ completed: newCompleted })
        .eq('id', taskId);

      if (error) {
        console.error('❌ Error updating task completion in database:', error);
        
        // ROLLBACK: Revert the optimistic update if database update fails
        console.log('⚠️ ROLLBACK: Reverting optimistic update due to database error');
        setActivities(prevActivities => 
          prevActivities.map(act => {
            if (act.id === activityId) {
              return {
                ...act,
                tasks: act.tasks.map(t =>
                  t.id === taskId ? { ...t, completed: !newCompleted } : t
                ),
              };
            }
            return act;
          })
        );
        
        throw error;
      }

      console.log(`✅ BACKGROUND: Task completion updated in ${tableName}`);
      
      // Refresh notification queue in the background (don't wait for it)
      if (notificationsEnabled) {
        refreshNotificationQueue(true).catch(err => {
          console.error('❌ Error refreshing notification queue:', err);
        });
      }
    } catch (error) {
      console.error('Failed to toggle task completion:', error);
      throw error;
    }
  };

  const deleteActivityTask = async (activityId: string, taskId: string) => {
    if (!userId) {
      throw new Error('User not authenticated');
    }

    console.log('🗑️ Deleting activity task:', { activityId, taskId, userId });

    try {
      // Find the activity to determine if it's external
      const activity = activities.find(a => a.id === activityId);
      if (!activity) {
        console.error('❌ Activity not found in local state');
        throw new Error('Activity not found');
      }

      const isExternal = activity.isExternal || false;
      const tableName = isExternal ? 'external_event_tasks' : 'activity_tasks';
      
      console.log(`📦 Deleting from ${tableName} (isExternal: ${isExternal})`);

      if (!isExternal) {
        // CRITICAL FIX: First verify the activity belongs to the user (for internal activities)
        const { data: activityData, error: activityError } = await supabase
          .from('activities')
          .select('id, user_id')
          .eq('id', activityId)
          .eq('user_id', userId)
          .single();

        if (activityError || !activityData) {
          console.error('❌ Activity not found or access denied:', activityError);
          throw new Error('Activity not found or you do not have permission to delete this task');
        }

        console.log('✅ Activity ownership verified');

        // Delete the activity task
        const { error: deleteError } = await supabase
          .from('activity_tasks')
          .delete()
          .eq('id', taskId)
          .eq('activity_id', activityId);

        if (deleteError) {
          console.error('❌ Error deleting activity task from database:', deleteError);
          throw deleteError;
        }
      } else {
        // For external events, delete from external_event_tasks
        // RLS will handle permission checking
        const { error: deleteError } = await supabase
          .from('external_event_tasks')
          .delete()
          .eq('id', taskId);

        if (deleteError) {
          console.error('❌ Error deleting external event task from database:', deleteError);
          throw deleteError;
        }
      }

      console.log(`✅ Task deleted from ${tableName} successfully`);

      // CRITICAL FIX: Update local state immediately to reflect the deletion
      console.log('🔄 Updating local state to remove task');
      setActivities(prevActivities => 
        prevActivities.map(act => {
          if (act.id === activityId) {
            console.log(`  Removing task ${taskId} from activity ${activityId}`);
            return {
              ...act,
              tasks: act.tasks.filter(t => t.id !== taskId),
            };
          }
          return act;
        })
      );

      console.log('✅ Local state updated successfully');

      // Trigger a refresh to ensure consistency with database
      console.log('🔄 Triggering refresh to sync with database');
      setRefreshTrigger(prev => prev + 1);
      
      // Refresh notification queue after deleting task
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } catch (error: any) {
      console.error('❌ Failed to delete activity task:', error);
      throw error;
    }
  };

  const addExternalCalendar = async (calendar: Omit<ExternalCalendar, 'id'>) => {
    if (!userId) {
      console.error('No user ID, cannot add calendar');
      throw new Error('User not authenticated');
    }

    console.log('Adding external calendar to Supabase:', calendar.name);
    console.log('User ID:', userId);
    console.log('Calendar URL:', calendar.icsUrl);
    console.log('Selected context:', selectedContext);

    try {
      // First, verify the user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) {
        console.error('Session error:', sessionError);
        throw new Error('No active session. Please log in again.');
      }

      console.log('Session verified, user:', session.user.id);
      console.log('Inserting calendar into database...');

      // Determine player_id and team_id based on selected context
      let player_id = null;
      let team_id = null;

      if (userRole === 'trainer' || userRole === 'admin') {
        if (selectedContext.type === 'player' && selectedContext.id) {
          player_id = selectedContext.id;
          console.log('Creating calendar for player:', player_id);
        } else if (selectedContext.type === 'team' && selectedContext.id) {
          team_id = selectedContext.id;
          console.log('Creating calendar for team:', team_id);
        }
      }

      // Insert the calendar
      const { data, error } = await supabase
        .from('external_calendars')
        .insert({
          user_id: userId,
          name: calendar.name,
          ics_url: calendar.icsUrl,
          enabled: calendar.enabled !== undefined ? calendar.enabled : true,
          player_id,
          team_id,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding external calendar:', error);
        throw error;
      }

      if (data) {
        console.log('Calendar inserted successfully:', data.id);
        
        const newCalendar: ExternalCalendar = {
          id: data.id,
          name: data.name,
          icsUrl: data.ics_url,
          enabled: data.enabled,
          lastFetched: data.last_fetched ? new Date(data.last_fetched) : undefined,
          eventCount: data.event_count || 0,
        };
        
        console.log('Adding calendar to state:', newCalendar);
        setExternalCalendars(prev => [...prev, newCalendar]);

        // Immediately fetch events for the new calendar
        if (newCalendar.enabled) {
          console.log('Triggering initial sync for new calendar');
          try {
            await fetchExternalCalendarEvents(newCalendar);
            console.log('Initial sync completed successfully');
          } catch (syncError) {
            console.error('Error during initial sync:', syncError);
          }
        }
        
        return newCalendar;
      }
    } catch (error) {
      console.error('Failed to add external calendar:', error);
      throw error;
    }
  };

  const toggleCalendar = async (id: string) => {
    const calendar = externalCalendars.find(cal => cal.id === id);
    if (!calendar) {
      console.error('Calendar not found:', id);
      return;
    }

    const newEnabled = !calendar.enabled;
    console.log(`Toggling calendar ${calendar.name} to ${newEnabled ? 'enabled' : 'disabled'}`);

    try {
      // Update the database first
      const { error } = await supabase
        .from('external_calendars')
        .update({ enabled: newEnabled })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Error toggling calendar:', error);
        throw error;
      }

      console.log('Calendar toggle successful in database');

      // Update local state
      setExternalCalendars(externalCalendars.map(cal => {
        if (cal.id === id) {
          const updated = { ...cal, enabled: newEnabled };
          
          // If enabling, fetch events
          if (newEnabled) {
            console.log('Calendar enabled, fetching events');
            fetchExternalCalendarEvents(updated).catch(err => {
              console.error('Failed to fetch calendar events:', err);
            });
          } else {
            // If disabling, remove external activities from this calendar
            console.log('Calendar disabled, removing activities');
            setActivities(prev => prev.filter(a => a.externalCalendarId !== id));
          }
          
          return updated;
        }
        return cal;
      }));
    } catch (error: any) {
      console.error('Error in toggleCalendar:', error);
      throw error;
    }
  };

  const deleteExternalCalendar = async (id: string) => {
    console.log('Deleting external calendar:', id);

    if (!userId) {
      console.error('No user ID, cannot delete calendar');
      throw new Error('User not authenticated');
    }

    try {
      // Delete external events (cascade will delete local metadata)
      console.log('Deleting external events for calendar:', id);
      const { error: eventsError } = await supabase
        .from('events_external')
        .delete()
        .eq('provider_calendar_id', id);

      if (eventsError) {
        console.error('Error deleting external events:', eventsError);
        throw eventsError;
      }

      console.log('External events deleted, now deleting calendar');

      // Then delete the calendar itself
      const { error } = await supabase
        .from('external_calendars')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error('Error deleting calendar:', error);
        throw error;
      }

      console.log('Calendar deleted successfully from database');

      // Update local state immediately
      setExternalCalendars(prevCalendars => prevCalendars.filter(cal => cal.id !== id));
      setActivities(prevActivities => prevActivities.filter(a => a.externalCalendarId !== id));
      
      // Trigger a refresh to ensure consistency
      setRefreshTrigger(prev => prev + 1);
      
      console.log('Local state updated');
    } catch (error) {
      console.error('Failed to delete calendar:', error);
      throw error;
    }
  };

  const importExternalActivity = async (externalActivityId: string, categoryId: string) => {
    if (!userId) {
      console.error('No user ID, cannot import activity');
      return;
    }

    const externalActivity = activities.find(a => a.id === externalActivityId && a.isExternal);
    if (!externalActivity) {
      console.log('External activity not found:', externalActivityId);
      return;
    }

    const category = categories.find(c => c.id === categoryId) || categories[0];
    
    console.log('Importing activity to Supabase:', externalActivity.title);

    // Format date and time for Supabase
    const activityDate = new Date(externalActivity.date);
    const dateStr = activityDate.toISOString().split('T')[0];

    // Determine player_id and team_id based on selected context
    let player_id = null;
    let team_id = null;

    if (userRole === 'trainer' || userRole === 'admin') {
      if (selectedContext.type === 'player' && selectedContext.id) {
        player_id = selectedContext.id;
      } else if (selectedContext.type === 'team' && selectedContext.id) {
        team_id = selectedContext.id;
      }
    }

    const { data, error } = await supabase
      .from('activities')
      .insert({
        user_id: userId,
        title: externalActivity.title,
        activity_date: dateStr,
        activity_time: externalActivity.time,
        location: externalActivity.location,
        category_id: category.id,
        is_external: false,
        player_id,
        team_id,
      })
      .select()
      .single();

    if (error) {
      console.error('Error importing activity:', error);
      return;
    }

    if (data) {
      console.log('Activity imported successfully:', data.id);
      
      // Trigger a refresh to reload activities (tasks will be created by trigger)
      setRefreshTrigger(prev => prev + 1);
    }
  };

  const importMultipleActivities = async (
    activityIds: string[], 
    categoryId: string,
    onProgress?: (current: number, total: number) => void
  ) => {
    console.log(`Importing ${activityIds.length} activities`);
    
    const total = activityIds.length;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < activityIds.length; i++) {
      try {
        await importExternalActivity(activityIds[i], categoryId);
        successCount++;
        console.log(`Imported ${i + 1}/${total} activities`);
      } catch (error) {
        console.error(`Failed to import activity ${activityIds[i]}:`, error);
        failCount++;
      }
      
      // Call progress callback if provided
      if (onProgress) {
        onProgress(i + 1, total);
      }
    }

    console.log(`Import complete: ${successCount} succeeded, ${failCount} failed`);
    return { successCount, failCount };
  };

  const fetchExternalCalendarEvents = useCallback(async (calendar: ExternalCalendar) => {
    if (!userId) {
      console.log('No user ID, skipping fetch');
      throw new Error('User not authenticated');
    }

    try {
      console.log('🔄 Fetching calendar:', calendar.name);
      console.log('Calendar URL:', calendar.icsUrl);
      
      // Get the current session to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error('Session error: ' + sessionError.message);
      }
      
      if (!session) {
        console.error('No active session');
        throw new Error('No active session');
      }

      console.log('Session valid, calling Edge Function...');
      console.log('Supabase URL:', supabase.supabaseUrl);

      // Call the Edge Function to sync the calendar
      const { data, error } = await supabase.functions.invoke('sync-external-calendar', {
        body: { calendarId: calendar.id }
      });

      if (error) {
        console.error('Error syncing calendar:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        throw error;
      }

      console.log('✅ Sync response:', data);

      // Update the calendar's last fetched time
      const { error: updateError } = await supabase
        .from('external_calendars')
        .update({ 
          last_fetched: new Date().toISOString(),
          event_count: data?.eventCount || 0
        })
        .eq('id', calendar.id);

      if (updateError) {
        console.error('Error updating calendar:', updateError);
      }

      // Add a delay to ensure database writes complete and propagate
      console.log('⏳ Waiting for database writes to complete and propagate...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Force immediate data refresh after sync completes
      console.log('🔄 Triggering immediate data refresh after sync...');
      setRefreshTrigger(prev => prev + 1);

      console.log(`✅ Successfully synced calendar: ${calendar.name}`);
    } catch (error: any) {
      console.error('Error fetching external calendar:', error);
      console.error('Error name:', error?.name);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      throw error;
    }
  }, [userId]);

  // Auto-fetch enabled calendars on mount and when calendars change
  useEffect(() => {
    if (!userId) return;

    const enabledCalendars = externalCalendars.filter(cal => cal.enabled);
    console.log(`Found ${enabledCalendars.length} enabled calendars to fetch`);
    
    enabledCalendars.forEach(calendar => {
      // Only fetch if not recently fetched (within last 5 minutes)
      const shouldFetch = !calendar.lastFetched || 
        (new Date().getTime() - new Date(calendar.lastFetched).getTime()) > 5 * 60 * 1000;
      
      if (shouldFetch) {
        console.log(`Fetching calendar: ${calendar.name}`);
        fetchExternalCalendarEvents(calendar).catch(err => {
          console.error(`Failed to fetch calendar ${calendar.name}:`, err);
        });
      } else {
        console.log(`Skipping fetch for ${calendar.name} - recently fetched`);
      }
    });
  }, [externalCalendars, fetchExternalCalendarEvents, userId]);

  const refreshData = useCallback(() => {
    console.log('🔄 Manual data refresh triggered');
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    categories,
    tasks,
    activities,
    trophies,
    externalCalendars,
    externalActivities,
    currentWeekStats: getCurrentWeekStats,
    todayActivities: getTodayActivities,
    isLoading,
    addActivity,
    createActivity,
    updateActivity,
    updateActivitySingle,
    updateActivitySeries,
    deleteActivity,
    deleteActivitySingle,
    deleteActivitySeries,
    duplicateActivity,
    addTask,
    updateTask,
    deleteTask,
    duplicateTask,
    toggleTaskCompletion,
    deleteActivityTask,
    refreshData,
    addExternalCalendar,
    toggleCalendar,
    deleteExternalCalendar,
    importExternalActivity,
    importMultipleActivities,
    fetchExternalCalendarEvents,
  };
}
