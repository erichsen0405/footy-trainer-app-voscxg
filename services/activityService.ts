import { supabase } from '@/integrations/supabase/client';
import { resolveExternalCategoryIntensityTargetIds } from '@/utils/activityIntensity';

export interface CreateActivityData {
  title: string;
  location: string;
  categoryId: string;
  date: Date;
  time: string;
  endTime?: string;
  intensity?: number | null;
  intensityEnabled?: boolean;
  isRecurring: boolean;
  recurrenceType?: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly';
  recurrenceDays?: number[];
  endDate?: Date;
  userId: string;
  playerId?: string | null;
  teamId?: string | null;
}

export interface UpdateActivityData {
  title?: string;
  location?: string;
  categoryId?: string;
  date?: Date;
  time?: string;
  endTime?: string;
  intensity?: number | null;
  intensityEnabled?: boolean;
  intensityNote?: string | null;
}

export interface ActivityContextScope {
  playerId?: string | null;
  teamId?: string | null;
}

const normalizeEndTime = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const parseTimeToMinutes = (value?: string | null): number | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length < 2) return null;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const minutesToTime = (totalMinutes: number): string => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hours = String(Math.floor(clamped / 60)).padStart(2, '0');
  const minutes = String(clamped % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const ensureEndTimeAfterStart = (startTime?: string | null, endTime?: string | null): string | null => {
  const normalizedEnd = normalizeEndTime(endTime);
  if (!normalizedEnd) return null;

  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(normalizedEnd);
  if (startMinutes === null || endMinutes === null) return normalizedEnd;
  if (endMinutes > startMinutes) return normalizedEnd;

  // Keep duplicated activity valid if source data has invalid order.
  return minutesToTime(startMinutes + 60);
};

const normalizeIntensity = (value?: number | null): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  return rounded >= 1 && rounded <= 10 ? rounded : null;
};

const normalizeIntensityNote = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return value === null ? null : null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeScopeId = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const buildIntensityUpdate = (
  intensity?: number | null,
  intensityEnabled?: boolean
): { intensity?: number | null; intensity_enabled?: boolean } | undefined => {
  const hasIntensityUpdate = intensity !== undefined;
  const explicitFlag = typeof intensityEnabled === 'boolean' ? intensityEnabled : undefined;

  if (!hasIntensityUpdate && explicitFlag === undefined) {
    return undefined;
  }

  const payload: { intensity?: number | null; intensity_enabled?: boolean } = {};

  if (hasIntensityUpdate) {
    payload.intensity = normalizeIntensity(intensity);
  }

  if (explicitFlag !== undefined) {
    payload.intensity_enabled = explicitFlag;
    if (!explicitFlag && !hasIntensityUpdate) {
      payload.intensity = null;
    }
  } else if (hasIntensityUpdate) {
    payload.intensity_enabled = payload.intensity !== null && payload.intensity !== undefined;
  }

  return payload;
};

const getCurrentUserId = async (): Promise<string> => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.user?.id) {
    throw new Error('User not authenticated');
  }

  return session.user.id;
};

// Helper function to generate dates for recurring activities
function generateRecurringDates(
  startDate: Date,
  endDate: Date | undefined,
  recurrenceType: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'monthly',
  recurrenceDays?: number[]
): Date[] {
  const dates: Date[] = [];
  const current = new Date(startDate);
  const end = endDate || new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000);
  
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
        
        current.setDate(current.getDate() + 7 * weekMultiplier);
      } else {
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

export const activityService = {
  async createActivity(data: CreateActivityData, signal: AbortSignal = new AbortController().signal): Promise<void> {
    console.log('Creating activity:', data);

    const normalizedEndTime = normalizeEndTime(data.endTime);
    let normalizedIntensity = normalizeIntensity(data.intensity);
    let normalizedIntensityEnabled =
      typeof data.intensityEnabled === 'boolean'
        ? data.intensityEnabled
        : data.intensity !== undefined && data.intensity !== null;

    if (!normalizedIntensity) {
      normalizedIntensity = null;
    }

    if (data.isRecurring) {
      const { data: seriesData, error: seriesError } = await supabase
        .from('activity_series')
        .insert({
          user_id: data.userId,
          title: data.title,
          location: data.location,
          category_id: data.categoryId,
          recurrence_type: data.recurrenceType!,
          recurrence_days: data.recurrenceDays || [],
          start_date: data.date.toISOString().split('T')[0],
          end_date: data.endDate ? data.endDate.toISOString().split('T')[0] : null,
          activity_time: data.time,
          activity_end_time: normalizedEndTime,
          player_id: data.playerId,
          team_id: data.teamId,
          intensity_enabled: normalizedIntensityEnabled,
        })
        .select()
        .abortSignal(signal)
        .single();

      if (seriesError) throw seriesError;

      const dates = generateRecurringDates(
        data.date,
        data.endDate,
        data.recurrenceType!,
        data.recurrenceDays
      );

      const activitiesToInsert = dates.map(date => ({
        user_id: data.userId,
        title: data.title,
        activity_date: date.toISOString().split('T')[0],
        activity_time: data.time,
        activity_end_time: normalizedEndTime,
        location: data.location,
        category_id: data.categoryId,
        intensity: normalizedIntensity,
        intensity_enabled: normalizedIntensityEnabled,
        series_id: seriesData.id,
        series_instance_date: date.toISOString().split('T')[0],
        is_external: false,
        player_id: data.playerId,
        team_id: data.teamId,
      }));

      const { error: activitiesError } = await supabase
        .from('activities')
        .insert(activitiesToInsert)
        .abortSignal(signal);

      if (activitiesError) throw activitiesError;
    } else {
      const { error } = await supabase
        .from('activities')
        .insert({
          user_id: data.userId,
          title: data.title,
          activity_date: data.date.toISOString().split('T')[0],
          activity_time: data.time,
          activity_end_time: normalizedEndTime,
          location: data.location,
          category_id: data.categoryId,
          intensity: normalizedIntensity,
          intensity_enabled: normalizedIntensityEnabled,
          is_external: false,
          player_id: data.playerId,
          team_id: data.teamId,
        })
        .abortSignal(signal);

      if (error) throw error;
    }
  },

  async updateActivitySingle(activityId: string, updates: UpdateActivityData, isExternal: boolean, signal: AbortSignal = new AbortController().signal): Promise<void> {
    const intensityChanges = buildIntensityUpdate(updates.intensity, updates.intensityEnabled);

    if (isExternal) {
      const updateData: any = {};
      
      if (updates.categoryId !== undefined) {
        updateData.category_id = updates.categoryId;
        updateData.manually_set_category = true;
        updateData.category_updated_at = new Date().toISOString();
      }
      
      if (updates.title !== undefined) {
        updateData.local_title_override = updates.title;
      }

      if (intensityChanges?.intensity !== undefined) {
        updateData.intensity = intensityChanges.intensity;
      }

      if (intensityChanges?.intensity_enabled !== undefined) {
        updateData.intensity_enabled = intensityChanges.intensity_enabled;
      }

      if (updates.intensityNote !== undefined) {
        updateData.intensity_note = normalizeIntensityNote(updates.intensityNote);
      }
      
      updateData.last_local_modified = new Date().toISOString();
      updateData.updated_at = new Date().toISOString();

      const { data: updatedById, error: updateError } = await supabase
        .from('events_local_meta')
        .update(updateData)
        .eq('id', activityId)
        .select('id')
        .abortSignal(signal);

      if (updateError) throw updateError;

      if (!updatedById || updatedById.length === 0) {
        const { data: updatedByExternal, error: updateByExternalError } = await supabase
          .from('events_local_meta')
          .update(updateData)
          .eq('external_event_id', activityId)
          .select('id')
          .abortSignal(signal);

        if (updateByExternalError) throw updateByExternalError;

        if (!updatedByExternal || updatedByExternal.length === 0) {
          const userId = await getCurrentUserId();
          const { error: insertError } = await supabase
            .from('events_local_meta')
            .insert({
              ...updateData,
              user_id: userId,
              external_event_id: activityId,
            })
            .abortSignal(signal);

          if (insertError) throw insertError;
        }
      }
    } else {
      const updateData: any = {};
      
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.location !== undefined) updateData.location = updates.location;
      if (updates.date !== undefined) updateData.activity_date = updates.date.toISOString().split('T')[0];
      if (updates.time !== undefined) updateData.activity_time = updates.time;
      if (updates.endTime !== undefined) updateData.activity_end_time = normalizeEndTime(updates.endTime);
      if (intensityChanges?.intensity !== undefined) {
        updateData.intensity = intensityChanges.intensity;
      }
      if (intensityChanges?.intensity_enabled !== undefined) {
        updateData.intensity_enabled = intensityChanges.intensity_enabled;
      }

      if (updates.intensityNote !== undefined) {
        updateData.intensity_note = normalizeIntensityNote(updates.intensityNote);
      }
      
      if (updates.categoryId !== undefined) {
        updateData.category_id = updates.categoryId;
        updateData.manually_set_category = true;
        updateData.category_updated_at = new Date().toISOString();
      }
      
      updateData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('activities')
        .update(updateData)
        .eq('id', activityId)
        .abortSignal(signal);

      if (error) throw error;
    }
  },

  async updateIntensityByCategory(
    userId: string,
    categoryId: string,
    intensityEnabled: boolean,
    scope: ActivityContextScope = {},
    signal: AbortSignal = new AbortController().signal
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    const normalizedCategoryId = typeof categoryId === 'string' ? categoryId.trim() : '';
    const normalizedPlayerId = normalizeScopeId(scope.playerId);
    const normalizedTeamId = normalizeScopeId(scope.teamId);
    const shouldPersistGlobalRule = !normalizedPlayerId && !normalizedTeamId;

    if (!normalizedCategoryId) {
      throw new Error('Category ID is required');
    }

    if (shouldPersistGlobalRule) {
      const { error: ruleError } = await (supabase as any)
        .from('external_category_intensity_rules')
        .upsert(
          {
            user_id: userId,
            category_id: normalizedCategoryId,
            intensity_enabled: intensityEnabled,
            updated_at: nowIso,
          },
          { onConflict: 'user_id,category_id' }
        )
        .abortSignal(signal);

      if (ruleError) {
        throw ruleError;
      }
    }

    let internalCandidatesQuery = supabase
      .from('activities')
      .select('id, intensity, intensity_enabled')
      .eq('user_id', userId)
      .eq('category_id', normalizedCategoryId);

    if (normalizedPlayerId) {
      internalCandidatesQuery = internalCandidatesQuery.eq('player_id', normalizedPlayerId);
    } else {
      internalCandidatesQuery = internalCandidatesQuery.is('player_id', null);
    }

    if (normalizedTeamId) {
      internalCandidatesQuery = internalCandidatesQuery.eq('team_id', normalizedTeamId);
    } else {
      internalCandidatesQuery = internalCandidatesQuery.is('team_id', null);
    }

    const { data: internalCandidates, error: internalCandidatesError } = await internalCandidatesQuery
      .abortSignal(signal);

    if (internalCandidatesError) {
      throw internalCandidatesError;
    }

    let externalCandidatesQuery = supabase
      .from('events_local_meta')
      .select('id, intensity, intensity_enabled')
      .eq('user_id', userId)
      .eq('category_id', normalizedCategoryId);

    if (normalizedPlayerId) {
      externalCandidatesQuery = externalCandidatesQuery.eq('player_id', normalizedPlayerId);
    } else {
      externalCandidatesQuery = externalCandidatesQuery.is('player_id', null);
    }

    if (normalizedTeamId) {
      externalCandidatesQuery = externalCandidatesQuery.eq('team_id', normalizedTeamId);
    } else {
      externalCandidatesQuery = externalCandidatesQuery.is('team_id', null);
    }

    const { data: externalCandidates, error: externalCandidatesError } = await externalCandidatesQuery
      .abortSignal(signal);

    if (externalCandidatesError) {
      throw externalCandidatesError;
    }

    const internalTargetIds = resolveExternalCategoryIntensityTargetIds(
      (internalCandidates || []).map((row: any) => ({
        id: String(row?.id ?? ''),
        intensityEnabled: row?.intensity_enabled ?? false,
        intensity: row?.intensity ?? null,
      })),
      intensityEnabled
    );

    const externalTargetIds = resolveExternalCategoryIntensityTargetIds(
      (externalCandidates || []).map((row: any) => ({
        id: String(row?.id ?? ''),
        intensityEnabled: row?.intensity_enabled ?? false,
        intensity: row?.intensity ?? null,
      })),
      intensityEnabled
    );

    if (!internalTargetIds.length && !externalTargetIds.length) {
      return;
    }

    const updateData = intensityEnabled
      ? {
          intensity_enabled: true,
          updated_at: nowIso,
          last_local_modified: nowIso,
        }
      : {
          intensity_enabled: false,
          intensity: null,
          intensity_note: null,
          updated_at: nowIso,
          last_local_modified: nowIso,
        };

    if (internalTargetIds.length) {
      const internalUpdateData = intensityEnabled
        ? {
            intensity_enabled: true,
            updated_at: nowIso,
          }
        : {
            intensity_enabled: false,
            intensity: null,
            intensity_note: null,
            updated_at: nowIso,
          };

      let internalUpdateQuery = supabase
        .from('activities')
        .update(internalUpdateData)
        .in('id', internalTargetIds)
        .eq('user_id', userId)
        .eq('category_id', normalizedCategoryId);

      if (normalizedPlayerId) {
        internalUpdateQuery = internalUpdateQuery.eq('player_id', normalizedPlayerId);
      } else {
        internalUpdateQuery = internalUpdateQuery.is('player_id', null);
      }

      if (normalizedTeamId) {
        internalUpdateQuery = internalUpdateQuery.eq('team_id', normalizedTeamId);
      } else {
        internalUpdateQuery = internalUpdateQuery.is('team_id', null);
      }

      const { error: internalUpdateError } = await internalUpdateQuery.abortSignal(signal);

      if (internalUpdateError) {
        throw internalUpdateError;
      }
    }

    if (externalTargetIds.length) {
      let externalUpdateQuery = supabase
        .from('events_local_meta')
        .update(updateData)
        .in('id', externalTargetIds)
        .eq('user_id', userId)
        .eq('category_id', normalizedCategoryId);

      if (normalizedPlayerId) {
        externalUpdateQuery = externalUpdateQuery.eq('player_id', normalizedPlayerId);
      } else {
        externalUpdateQuery = externalUpdateQuery.is('player_id', null);
      }

      if (normalizedTeamId) {
        externalUpdateQuery = externalUpdateQuery.eq('team_id', normalizedTeamId);
      } else {
        externalUpdateQuery = externalUpdateQuery.is('team_id', null);
      }

      const { error: externalUpdateError } = await externalUpdateQuery.abortSignal(signal);

      if (externalUpdateError) {
        throw externalUpdateError;
      }
    }
  },

  async updateActivitySeries(seriesId: string, userId: string, updates: UpdateActivityData, signal: AbortSignal = new AbortController().signal): Promise<void> {
    const seriesUpdate: any = {
      updated_at: new Date().toISOString(),
    };

    if (updates.title !== undefined) seriesUpdate.title = updates.title;
    if (updates.location !== undefined) seriesUpdate.location = updates.location;
    if (updates.categoryId !== undefined) seriesUpdate.category_id = updates.categoryId;
    if (updates.time !== undefined) seriesUpdate.activity_time = updates.time;
    if (updates.endTime !== undefined) seriesUpdate.activity_end_time = normalizeEndTime(updates.endTime);

    const intensityChanges = buildIntensityUpdate(updates.intensity, updates.intensityEnabled);
    if (intensityChanges?.intensity_enabled !== undefined) {
      seriesUpdate.intensity_enabled = intensityChanges.intensity_enabled;
    }

    const { error: seriesError } = await supabase
      .from('activity_series')
      .update(seriesUpdate)
      .eq('id', seriesId)
      .eq('user_id', userId)
      .abortSignal(signal);

    if (seriesError) throw seriesError;

    const activityUpdate: any = {};

    if (updates.title !== undefined) activityUpdate.title = updates.title;
    if (updates.location !== undefined) activityUpdate.location = updates.location;
    if (updates.categoryId !== undefined) {
      activityUpdate.category_id = updates.categoryId;
      activityUpdate.manually_set_category = true;
      activityUpdate.category_updated_at = new Date().toISOString();
    }
    if (updates.time !== undefined) activityUpdate.activity_time = updates.time;
    if (updates.endTime !== undefined) activityUpdate.activity_end_time = normalizeEndTime(updates.endTime);
    if (intensityChanges?.intensity !== undefined) {
      activityUpdate.intensity = intensityChanges.intensity;
    }
    if (intensityChanges?.intensity_enabled !== undefined) {
      activityUpdate.intensity_enabled = intensityChanges.intensity_enabled;
    }

    if (Object.keys(activityUpdate).length > 0) {
      activityUpdate.updated_at = new Date().toISOString();

      const { error: activitiesError } = await supabase
        .from('activities')
        .update(activityUpdate)
        .eq('series_id', seriesId)
        .eq('user_id', userId)
        .abortSignal(signal);

      if (activitiesError) throw activitiesError;
    }
  },

  async deleteActivitySingle(activityId: string, userId: string, signal: AbortSignal = new AbortController().signal): Promise<void> {
    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', activityId)
      .eq('user_id', userId)
      .abortSignal(signal);

    if (error) throw error;
  },

  async deleteActivitySeries(seriesId: string, userId: string, signal: AbortSignal = new AbortController().signal): Promise<void> {
    const { error: activitiesError } = await supabase
      .from('activities')
      .delete()
      .eq('series_id', seriesId)
      .eq('user_id', userId)
      .abortSignal(signal);

    if (activitiesError) throw activitiesError;

    const { error: seriesError } = await supabase
      .from('activity_series')
      .delete()
      .eq('id', seriesId)
      .eq('user_id', userId)
      .abortSignal(signal);

    if (seriesError) throw seriesError;
  },

  async duplicateActivity(activityId: string, userId: string, playerId?: string | null, teamId?: string | null, signal: AbortSignal = new AbortController().signal): Promise<void> {
    const { data: activity, error: fetchError } = await supabase
      .from('activities')
      .select(`
        *,
        activity_tasks(
          id,
          title,
          description,
          completed,
          reminder_minutes
        )
      `)
      .eq('id', activityId)
      .abortSignal(signal)
      .single();

    if (fetchError || !activity) throw new Error('Activity not found');

    const duplicateTitle = `${activity.title} (kopi)`;
    const sourceIntensityEnabled =
      typeof activity.intensity_enabled === 'boolean'
        ? activity.intensity_enabled
        : activity.intensity !== null && activity.intensity !== undefined;

    const { data: newActivity, error: activityError } = await supabase
      .from('activities')
      .insert({
        user_id: userId,
        title: duplicateTitle,
        activity_date: activity.activity_date,
        activity_time: activity.activity_time,
        activity_end_time: ensureEndTimeAfterStart(activity.activity_time, activity.activity_end_time),
        location: activity.location,
        category_id: activity.category_id,
        intensity: normalizeIntensity(activity.intensity),
        intensity_enabled: sourceIntensityEnabled,
        is_external: false,
        player_id: playerId,
        team_id: teamId,
      })
      .select()
      .abortSignal(signal)
      .single();

    if (activityError) throw activityError;

    const sourceTasks = Array.isArray((activity as any)?.activity_tasks)
      ? ((activity as any).activity_tasks as any[])
      : [];

    if (!sourceTasks.length) {
      return;
    }

    const taskRows = sourceTasks.map((task: any) => ({
      activity_id: newActivity.id,
      title: task?.title ?? '',
      description: task?.description ?? '',
      completed: !!task?.completed,
      reminder_minutes:
        typeof task?.reminder_minutes === 'number'
          ? task.reminder_minutes
          : null,
    }));

    const { error: taskInsertError } = await supabase
      .from('activity_tasks')
      .insert(taskRows)
      .abortSignal(signal);

    if (taskInsertError) throw taskInsertError;
  },
};
