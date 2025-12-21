
import { useState, useCallback } from 'react';
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

  const createTask = useCallback(async (data: Omit<CreateTaskData, 'userId'>) => {
    if (!userId) throw new Error('User not authenticated');

    setIsCreating(true);
    try {
      await taskService.createTask({ ...data, userId });
      onRefresh();
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } finally {
      setIsCreating(false);
    }
  }, [userId, notificationsEnabled, onRefresh]);

  const updateTask = useCallback(async (taskId: string, updates: UpdateTaskData) => {
    if (!userId) throw new Error('User not authenticated');

    setIsUpdating(true);
    try {
      await taskService.updateTask(taskId, userId, updates);
      onRefresh();
      
      if (updates.reminder !== undefined && notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } finally {
      setIsUpdating(false);
    }
  }, [userId, notificationsEnabled, onRefresh]);

  const deleteTask = useCallback(async (taskId: string) => {
    if (!userId) throw new Error('User not authenticated');

    setIsDeleting(true);
    try {
      await taskService.deleteTask(taskId, userId);
      onRefresh();
      
      if (notificationsEnabled) {
        await forceRefreshNotificationQueue();
      }
    } finally {
      setIsDeleting(false);
    }
  }, [userId, notificationsEnabled, onRefresh]);

  const toggleTaskCompletion = useCallback(async (
    taskId: string,
    isExternal: boolean,
    currentCompleted: boolean
  ) => {
    setIsTogglingCompletion(true);
    try {
      const newCompleted = !currentCompleted;
      await taskService.toggleTaskCompletion(taskId, isExternal, newCompleted);
      
      if (notificationsEnabled) {
        refreshNotificationQueue(true).catch(err => {
          console.error('Error refreshing notification queue:', err);
        });
      }
    } finally {
      setIsTogglingCompletion(false);
    }
  }, [notificationsEnabled]);

  const deleteActivityTask = useCallback(async (
    activityId: string,
    taskId: string,
    isExternal: boolean
  ) => {
    if (!userId) throw new Error('User not authenticated');

    setIsDeleting(true);
    try {
      await taskService.deleteActivityTask(activityId, taskId, userId, isExternal);
      onRefresh();
      
      if (notificationsEnabled) {
        await refreshNotificationQueue(true);
      }
    } finally {
      setIsDeleting(false);
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
