import { useState, useEffect, useRef, useCallback } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
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
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  const userIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const fetchUserRole = useCallback(async ({ silent = false, userId, reason = 'initial' }: FetchRoleOptions = {}) => {
    if (!silent) {
      setLoading(true);
    }

    try {
      let targetUserId = userId ?? userIdRef.current;

      if (!targetUserId) {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          if (mountedRef.current) {
            setUserRole(null);
            setCurrentUserId(null);
          }
          return;
        }

        targetUserId = user.id;
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
          setUserRole(null);
        }
        return;
      }

      if (data?.role) {
        if (mountedRef.current) {
          setUserRole(data.role as UserRole);
        }
        return;
      }

      console.log('[useUserRole] No role found – awaiting onboarding flow');
      if (mountedRef.current) {
        setUserRole(null);
      }
    } catch (error) {
      console.error('[useUserRole] Error in fetchUserRole:', error, { reason });
      if (mountedRef.current) {
        setUserRole(null);
      }
    } finally {
      if (!silent && mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const refreshUserRole = useCallback(async () => {
    await fetchUserRole({ reason: 'manual-refresh' });
  }, [fetchUserRole]);

  useEffect(() => {
    fetchUserRole();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mountedRef.current) {
        return;
      }

      if (session?.user) {
        fetchUserRole({ reason: 'auth-change', userId: session.user.id });
      } else {
        userIdRef.current = null;
        setCurrentUserId(null);
        setUserRole(null);
        setLoading(false);
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [fetchUserRole]);

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

  return { userRole, loading, isAdmin, refreshUserRole };
}
