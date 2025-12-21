
import { useState, useCallback, useEffect, useRef } from 'react';
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

  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const addExternalCalendar = useCallback(async (
    name: string,
    icsUrl: string,
    enabled: boolean = true
  ): Promise<ExternalCalendar> => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsAdding(true);
    try {
      const calendar = await calendarService.addExternalCalendar(userId, name, icsUrl, enabled, controller.signal);
      onRefresh();
      return calendar;
    } finally {
      setIsAdding(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, onRefresh]);

  const toggleCalendar = useCallback(async (calendarId: string, newEnabled: boolean) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsToggling(true);
    try {
      await calendarService.toggleCalendar(calendarId, userId, newEnabled, controller.signal);
      onRefresh();
    } finally {
      setIsToggling(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, onRefresh]);

  const deleteExternalCalendar = useCallback(async (calendarId: string) => {
    if (!userId) throw new Error('User not authenticated');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsDeleting(true);
    try {
      await calendarService.deleteExternalCalendar(calendarId, userId, controller.signal);
      onRefresh();
    } finally {
      setIsDeleting(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [userId, onRefresh]);

  const syncCalendar = useCallback(async (calendarId: string): Promise<{ eventCount: number }> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsSyncing(true);
    try {
      const result = await calendarService.syncCalendar(calendarId, controller.signal);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      onRefresh();
      
      return result;
    } finally {
      setIsSyncing(false);
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
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
