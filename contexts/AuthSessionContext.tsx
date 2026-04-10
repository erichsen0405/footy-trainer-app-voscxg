import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getLatestSession, supabase } from '@/integrations/supabase/client';

type AuthSessionContextValue = {
  authReady: boolean;
  isAuthenticated: boolean;
  session: Session | null;
  user: User | null;
  refreshSession: () => Promise<Session | null>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | undefined>(undefined);

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const initialSession = getLatestSession();
  const [session, setSession] = useState<Session | null>(initialSession);
  const [authReady, setAuthReady] = useState(Boolean(initialSession));

  const refreshSession = useCallback(async () => {
    const {
      data: { session: nextSession },
    } = await supabase.auth.getSession();
    setSession(nextSession ?? null);
    setAuthReady(true);
    return nextSession ?? null;
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setAuthReady(true);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession ?? null);
      setAuthReady(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthSessionContextValue>(() => {
    const user = session?.user ?? null;
    return {
      authReady,
      isAuthenticated: Boolean(user),
      session,
      user,
      refreshSession,
    };
  }, [authReady, refreshSession, session]);

  return (
    <AuthSessionContext.Provider value={value}>
      {children}
    </AuthSessionContext.Provider>
  );
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error('useAuthSession must be used within an AuthSessionProvider');
  }
  return context;
}
