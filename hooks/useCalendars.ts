
import { useState, useCallback } from 'react';
import { ExternalCalendar } from '@/types';
import { calendarService } from '@/services/calendarService';

export function useCalendars(
  userId: string | null,
  onRefresh: () => void
) {
  const [isAdding, setIsAdding] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const addExternalCalendar = useCallback(async (
    name: string,
    icsUrl: string,
    enabled: boolean = true
  ): Promise<ExternalCalendar> => {
    if (!userId) throw new Error('User not authenticated');

    setIsAdding(true);
    try {
      const calendar = await calendarService.addExternalCalendar(userId, name, icsUrl, enabled);
      onRefresh();
      return calendar;
    } finally {
      setIsAdding(false);
    }
  }, [userId, onRefresh]);

  const toggleCalendar = useCallback(async (calendarId: string, newEnabled: boolean) => {
    if (!userId) throw new Error('User not authenticated');

    setIsToggling(true);
    try {
      await calendarService.toggleCalendar(calendarId, userId, newEnabled);
      onRefresh();
    } finally {
      setIsToggling(false);
    }
  }, [userId, onRefresh]);

  const deleteExternalCalendar = useCallback(async (calendarId: string) => {
    if (!userId) throw new Error('User not authenticated');

    setIsDeleting(true);
    try {
      await calendarService.deleteExternalCalendar(calendarId, userId);
      onRefresh();
    } finally {
      setIsDeleting(false);
    }
  }, [userId, onRefresh]);

  const syncCalendar = useCallback(async (calendarId: string): Promise<{ eventCount: number }> => {
    setIsSyncing(true);
    try {
      const result = await calendarService.syncCalendar(calendarId);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      onRefresh();
      
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [onRefresh]);

  return {
    addExternalCalendar,
    toggleCalendar,
    deleteExternalCalendar,
    syncCalendar,
    isAdding,
    isToggling,
    isDeleting,
    isSyncing,
  };
}
