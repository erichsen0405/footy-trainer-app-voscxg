import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthSession } from '@/contexts/AuthSessionContext';
import {
  CurrentOwnerBrandingProfile,
  fetchCurrentOwnerBranding,
} from '@/services/currentOwnerBrandingService';

export function useCurrentOwnerBranding() {
  const { authReady, isAuthenticated, user } = useAuthSession();
  const [branding, setBranding] = useState<CurrentOwnerBrandingProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!authReady || !isAuthenticated || !user?.id) {
      setBranding(null);
      return null;
    }

    setLoading(true);
    try {
      const payload = await fetchCurrentOwnerBranding();
      if (mountedRef.current) {
        setBranding(payload);
      }
      return payload;
    } catch (error) {
      if (__DEV__) {
        console.log('[OwnerBranding] Could not load current owner branding', error);
      }
      if (mountedRef.current) {
        setBranding(null);
      }
      return null;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [authReady, isAuthenticated, user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    branding,
    loading,
    refresh,
  };
}
