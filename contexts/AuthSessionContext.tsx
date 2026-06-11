import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';
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

const getAuthErrorMessage = (error: unknown) => {
  if (!error || typeof error !== 'object') {
    return '';
  }
  const candidate = error as { message?: unknown; name?: unknown; code?: unknown };
  return [candidate.name, candidate.code, candidate.message]
    .filter(value => typeof value === 'string' && value.trim())
    .join(' ')
    .toLowerCase();
};

const isStaleLocalSessionError = (error: unknown) => {
  const message = getAuthErrorMessage(error);
  return (
    message.includes('auth session missing') ||
    message.includes('invalid refresh token') ||
    message.includes('refresh token not found') ||
    message.includes('refresh_token_not_found') ||
    message.includes('user not found') ||
    message.includes('user from sub claim')
  );
};

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const initialSession = getLatestSession();
  const [session, setSession] = useState<Session | null>(initialSession);
  const [authReady, setAuthReady] = useState(false);
  const validationRunRef = useRef(0);

  const clearLocalSession = useCallback(async (reason: string) => {
    console.log('[AuthSession] Clearing local auth session:', reason);
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        console.warn('[AuthSession] Local sign-out failed while clearing stale session:', error);
      }
    } catch (error) {
      console.warn('[AuthSession] Unexpected local sign-out failure:', error);
    }
  }, []);

  const validateStoredSession = useCallback(
    async (candidate: Session | null) => {
      if (!candidate) {
        return null;
      }

      try {
        const { data, error } = await supabase.auth.getUser();
        if (data.user) {
          return { ...candidate, user: data.user };
        }

        if (!error || isStaleLocalSessionError(error)) {
          await clearLocalSession(error ? getAuthErrorMessage(error) : 'missing remote auth user');
          return null;
        }

        console.log('[AuthSession] Could not validate stored session; keeping local session:', error);
        return candidate;
      } catch (error) {
        if (isStaleLocalSessionError(error)) {
          await clearLocalSession(getAuthErrorMessage(error));
          return null;
        }

        console.log('[AuthSession] Session validation failed; keeping local session:', error);
        return candidate;
      }
    },
    [clearLocalSession]
  );

  const refreshSession = useCallback(async () => {
    try {
      const {
        data: { session: nextSession },
      } = await supabase.auth.getSession();
      const validatedSession = await validateStoredSession(nextSession ?? null);
      setSession(validatedSession);
      setAuthReady(true);
      return validatedSession;
    } catch (error) {
      console.log('[AuthSession] Failed refreshing auth session:', error);
      setSession(null);
      setAuthReady(true);
      return null;
    }
  }, [validateStoredSession]);

  useEffect(() => {
    let mounted = true;
    const runValidation = async (nextSession: Session | null) => {
      const validationId = validationRunRef.current + 1;
      validationRunRef.current = validationId;
      const validatedSession = await validateStoredSession(nextSession);
      if (!mounted || validationRunRef.current !== validationId) return;
      setSession(validatedSession);
      setAuthReady(true);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        void runValidation(data.session ?? null);
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
      if (!nextSession) {
        validationRunRef.current += 1;
        setSession(null);
        setAuthReady(true);
        return;
      }
      setAuthReady(false);
      void runValidation(nextSession);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [validateStoredSession]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void refreshSession();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshSession]);

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
