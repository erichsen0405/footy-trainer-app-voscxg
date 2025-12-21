
import { useState, useCallback, useEffect, useRef } from 'react';
import { taskService, CreateTaskData, UpdateTaskData } from '@/services/taskService';
import { refreshNotificationQueue, forceRefreshNotificationQueue } from '@/utils/notificationScheduler';

export function useTasks(
  userId: string | null,
  notificationsEnabled: boolean,
  onRefresh: () => void
) {
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isTogglingCompletion, setIsTogglingCompletion] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const createTask = useCallback(async (data: Omit<CreateTaskData, 'userId'>) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsCreating(true);
    try {
      await taskService.createTask({ ...data, userId }, controller.signal);
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

  const updateTask = useCallback(async (taskId: string, updates: UpdateTaskData) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsUpdating(true);
    try {
      await taskService.updateTask(taskId, userId, updates, controller.signal);
      onRefresh();
      
      if (updates.reminder !== undefined && notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } finally {
      setIsUpdating(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, notificationsEnabled, onRefresh]);

  const deleteTask = useCallback(async (taskId: string) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsDeleting(true);
    try {
      await taskService.deleteTask(taskId, userId, controller.signal);
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

  const toggleTaskCompletion = useCallback(async (
    taskId: string,
    isExternal: boolean,
    currentCompleted: boolean
  ) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsTogglingCompletion(true);
    try {
      const newCompleted = !currentCompleted;
      await taskService.toggleTaskCompletion(taskId, isExternal, newCompleted, controller.signal);
      
      if (notificationsEnabled) {
        refreshNotificationQueue(true).catch(err => {
          console.error('Error refreshing notification queue:', err);
        });
      }
    } finally {
      setIsTogglingCompletion(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [notificationsEnabled]);

  const deleteActivityTask = useCallback(async (
    activityId: string,
    taskId: string,
    isExternal: boolean
  ) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsDeleting(true);
    try {
      await taskService.deleteActivityTask(activityId, taskId, userId, isExternal, controller.signal);
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

  return {
    createTask,
    updateTask,
    deleteTask,
    toggleTaskCompletion,
    deleteActivityTask,
    isCreating,
    isUpdating,
    isDeleting,
    isTogglingCompletion,
  };
}
