import { useState, useEffect, useRef, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import { supabase } from '@/integrations/supabase/client';

type UserRole = 'admin' | 'trainer' | 'player';
type RoleRefreshListener = (reason?: string) => void;

const roleRefreshListeners = new Set<RoleRefreshListener>();

export function forceUserRoleRefresh(reason = 'manual') {
  console.log('[useUserRole] External refresh requested', reason);
  for (const listener of roleRefreshListeners) {
    try {
      listener(reason);
    } catch (error) {
      console.warn('[useUserRole] Refresh listener failed', error);
    }
  }
}

interface FetchRoleOptions {
  silent?: boolean;
  userId?: string | null;
  reason?: string;
}

export function useUserRole() {
  const { authReady, isAuthenticated, user } = useAuthSession();
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const userIdRef = useRef<string | null>(null);
  const lastKnownRoleRef = useRef<UserRole | null>(null);
  const mountedRef = useRef(true);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchUserRole = useCallback(async ({ silent = false, userId, reason = 'initial' }: FetchRoleOptions = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      let targetUserId = userId ?? userIdRef.current ?? user?.id ?? null;

      if (!targetUserId) {
        if (mountedRef.current) {
          lastKnownRoleRef.current = null;
          setUserRole(null);
          setCurrentUserId(null);
        }
        return;
      }

      if (userIdRef.current && userIdRef.current !== targetUserId) {
        lastKnownRoleRef.current = null;
      }

      userIdRef.current = targetUserId;
      setCurrentUserId(prev => (prev === targetUserId ? prev : targetUserId));

      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', targetUserId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('[useUserRole] Error fetching user role:', error, { reason });
        if (mountedRef.current) {
          if (!lastKnownRoleRef.current) {
            setUserRole(null);
          }
        }
        return;
      }

      if (data?.role) {
        if (mountedRef.current) {
          const nextRole = data.role as UserRole;
          lastKnownRoleRef.current = nextRole;
          setUserRole(nextRole);
        }
        return;
      }

      console.log('[useUserRole] No role found - awaiting onboarding flow');
      if (mountedRef.current) {
        if (!lastKnownRoleRef.current) {
          setUserRole(null);
        }
      }
    } catch (error) {
      console.error('[useUserRole] Error in fetchUserRole:', error, { reason });
      if (mountedRef.current) {
        if (!lastKnownRoleRef.current) {
          setUserRole(null);
        }
      }
    } finally {
      if (!silent && mountedRef.current) {
        setLoading(false);
      }
    }
  }, [user?.id]);

  const refreshUserRole = useCallback(async () => {
    await fetchUserRole({ reason: 'manual-refresh' });
  }, [fetchUserRole]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!authReady) {
      return;
    }

    if (user?.id) {
      void fetchUserRole({ reason: 'auth-state', userId: user.id });
      return;
    }

    userIdRef.current = null;
    lastKnownRoleRef.current = null;
    setCurrentUserId(null);
    setUserRole(null);
    setLoading(false);
  }, [authReady, fetchUserRole, user?.id]);

  useEffect(() => {
    if (!currentUserId) {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

    const channel = supabase
      .channel(`user-roles-${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_roles',
          filter: `user_id=eq.${currentUserId}`,
        },
        payload => {
          console.log('[useUserRole] Detected user_roles change:', payload.eventType);
          fetchUserRole({ silent: true, reason: `realtime-${payload.eventType}`, userId: currentUserId });
        }
      )
      .subscribe(status => {
        console.log('[useUserRole] Realtime channel status:', status);
        if (status === 'CHANNEL_ERROR') {
          fetchUserRole({ silent: true, reason: 'realtime-error', userId: currentUserId });
        }
      });

    realtimeChannelRef.current = channel;

    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [currentUserId, fetchUserRole]);

  useEffect(() => {
    const listener: RoleRefreshListener = reason => {
      fetchUserRole({ silent: true, reason: reason ?? 'external-signal' });
    };

    roleRefreshListeners.add(listener);

    return () => {
      roleRefreshListeners.delete(listener);
    };
  }, [fetchUserRole]);

  // Export isAdmin as a computed property - includes both admin and trainer roles
  const isAdmin = userRole === 'admin' || userRole === 'trainer';

  return { userRole, loading: !authReady || loading, isAdmin, refreshUserRole, isAuthenticated };
}
