
import { useState, useCallback, useEffect, useRef } from 'react';
import { Activity } from '@/types';
import { activityService, CreateActivityData, UpdateActivityData } from '@/services/activityService';
import { refreshNotificationQueue, forceRefreshNotificationQueue } from '@/utils/notificationScheduler';

export function useActivities(
  userId: string | null,
  notificationsEnabled: boolean,
  onRefresh: () => void
) {
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const createActivity = useCallback(async (data: Omit<CreateActivityData, 'userId'>) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsCreating(true);
    try {
      await activityService.createActivity({ ...data, userId }, controller.signal);
      onRefresh();
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } finally {
      setIsCreating(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, notificationsEnabled, onRefresh]);

  const updateActivitySingle = useCallback(async (
    activityId: string,
    updates: UpdateActivityData,
    isExternal: boolean
  ) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsUpdating(true);
    try {
      await activityService.updateActivitySingle(activityId, updates, isExternal, controller.signal);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      onRefresh();
      
      if ((updates.date || updates.time) && notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } finally {
      setIsUpdating(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, notificationsEnabled, onRefresh]);

  const updateActivitySeries = useCallback(async (
    seriesId: string,
    updates: UpdateActivityData
  ) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsUpdating(true);
    try {
      await activityService.updateActivitySeries(seriesId, userId, updates, controller.signal);
      onRefresh();
      
      if (updates.time && notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } finally {
      setIsUpdating(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, notificationsEnabled, onRefresh]);

  const deleteActivitySingle = useCallback(async (activityId: string) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsDeleting(true);
    try {
      await activityService.deleteActivitySingle(activityId, userId, controller.signal);
      onRefresh();
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } finally {
      setIsDeleting(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, notificationsEnabled, onRefresh]);

  const deleteActivitySeries = useCallback(async (seriesId: string) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsDeleting(true);
    try {
      await activityService.deleteActivitySeries(seriesId, userId, controller.signal);
      onRefresh();
      
      if (notificationsEnabled) {
        await forceRefreshNotificationQueue();
      }
    } finally {
      setIsDeleting(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, notificationsEnabled, onRefresh]);

  const duplicateActivity = useCallback(async (
    activityId: string,
    playerId?: string | null,
    teamId?: string | null
  ) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsDuplicating(true);
    try {
      await activityService.duplicateActivity(activityId, userId, playerId, teamId, controller.signal);
      onRefresh();
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } finally {
      setIsDuplicating(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, notificationsEnabled, onRefresh]);

  return {
    createActivity,
    updateActivitySingle,
    updateActivitySeries,
    deleteActivitySingle,
    deleteActivitySeries,
    duplicateActivity,
    isCreating,
    isUpdating,
    isDeleting,
    isDuplicating,
  };
}
