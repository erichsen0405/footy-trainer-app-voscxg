import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from './types';
import type { Session, User } from '@supabase/supabase-js';
import { AuthError, createClient } from '@supabase/supabase-js'
import { trackStartupTelemetry } from '@/utils/startupTelemetry';

const SUPABASE_URL = "https://lhpczofddvwcyrgotzha.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocGN6b2ZkZHZ3Y3lyZ290emhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgzMjQsImV4cCI6MjA3OTczNDMyNH0.5oWZ_G5ryy_ae77CG8YMeEDEyAJkSS7Jv4cFZy-G7qA";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

const AUTH_DEDUPE_WINDOW_MS = 1500;
const AUTH_GET_SESSION_TIMEOUT_MS = 4000;
const AUTH_GET_USER_TIMEOUT_MS = 4000;

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Deep links are handled explicitly in auth callback screens.
    detectSessionInUrl: false,
  },
})

let latestSession: Session | null = null;
let inFlightGetSession:
  | Promise<Awaited<ReturnType<typeof originalGetSession>>>
  | null = null;
let inFlightGetUser:
  | Promise<Awaited<ReturnType<typeof originalGetUser>>>
  | null = null;
let inFlightGetSessionStartedAt = 0;
let inFlightGetUserStartedAt = 0;

class AuthRequestTimeoutError extends Error {
  timeoutMs: number;

  constructor(requestName: string, timeoutMs: number) {
    super(`${requestName} timed out after ${timeoutMs}ms`);
    this.name = 'AuthRequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

// Global error handler for invalid refresh token
supabase.auth.onAuthStateChange((event, session) => {
  latestSession = session ?? null;
  void trackStartupTelemetry(supabase, {
    eventName: 'auth_state_changed',
    status: event,
    metadata: {
      hasSession: Boolean(session),
      hasUser: Boolean(session?.user),
    },
  });

  if (event === 'TOKEN_REFRESHED') {
    console.log('[Supabase] Token refreshed successfully');
  }
  
  if (event === 'SIGNED_OUT') {
    console.log('[Supabase] User signed out');
    void (async () => {
      try {
        await AsyncStorage.removeItem('supabase.auth.token');
      } catch (storageError) {
        console.warn('[Supabase] Failed clearing auth token on SIGNED_OUT:', storageError);
      }
    })();
  }
});

// Wrap auth methods to handle invalid refresh token errors
const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
const originalGetUser = supabase.auth.getUser.bind(supabase.auth);
type GetSessionResult = Awaited<ReturnType<typeof originalGetSession>>;
type GetUserResult = Awaited<ReturnType<typeof originalGetUser>>;

const getSessionSuccess = (session: Session): GetSessionResult => ({
  data: { session },
  error: null,
});

const getSessionNull = (): GetSessionResult => ({
  data: { session: null },
  error: null,
});

const getSessionError = (error: AuthError): GetSessionResult => ({
  data: { session: null },
  error,
});

const normalizeGetSessionResult = (result: GetSessionResult): GetSessionResult => {
  if (result.error) {
    return getSessionError(result.error);
  }

  if (result.data.session) {
    return getSessionSuccess(result.data.session);
  }

  return getSessionNull();
};

const getUserSuccess = (user: User): GetUserResult => ({
  data: { user },
  error: null,
});

const getUserError = (error: AuthError): GetUserResult => ({
  data: { user: null },
  error,
});

const normalizeGetUserResult = (result: GetUserResult): GetUserResult => {
  if (result.error) {
    return getUserError(result.error);
  }

  if (result.data.user) {
    return getUserSuccess(result.data.user);
  }

  return getUserError(new AuthError('User not found', 404, 'user_not_found'));
};

const withAuthRequestTimeout = async <T,>(
  promise: Promise<T>,
  timeoutMs: number,
  requestName: string,
): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new AuthRequestTimeoutError(requestName, timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const isAuthRequestTimeoutError = (error: unknown): error is AuthRequestTimeoutError =>
  error instanceof AuthRequestTimeoutError;

supabase.auth.getSession = async (): Promise<GetSessionResult> => {
  const inFlightAgeMs = Math.max(0, Date.now() - inFlightGetSessionStartedAt);
  if (inFlightGetSession && inFlightAgeMs < AUTH_DEDUPE_WINDOW_MS) {
    void trackStartupTelemetry(supabase, {
      eventName: 'auth_get_session_dedupe_hit',
      status: 'reused',
      metadata: {
        dedupeWindowMs: AUTH_DEDUPE_WINDOW_MS,
        ageMs: inFlightAgeMs,
      },
    });
    return inFlightGetSession;
  }

  if (inFlightGetSession) {
    void trackStartupTelemetry(supabase, {
      eventName: 'auth_get_session_dedupe_hit',
      status: 'expired',
      metadata: {
        dedupeWindowMs: AUTH_DEDUPE_WINDOW_MS,
        ageMs: inFlightAgeMs,
      },
    });
  }

  inFlightGetSessionStartedAt = Date.now();
  const requestPromise = (async () => {
    try {
      const result = await withAuthRequestTimeout(
        originalGetSession(),
        AUTH_GET_SESSION_TIMEOUT_MS,
        'supabase.auth.getSession',
      );
      latestSession = result.data.session ?? null;
      void trackStartupTelemetry(supabase, {
        eventName: 'auth_get_session_completed',
        status: 'success',
        metadata: {
          durationMs: Date.now() - inFlightGetSessionStartedAt,
          hasSession: Boolean(result.data.session),
          hasUser: Boolean(result.data.session?.user),
        },
      });
      return normalizeGetSessionResult(result);
    } catch (error: any) {
      if (isAuthRequestTimeoutError(error)) {
        void trackStartupTelemetry(supabase, {
          eventName: 'auth_get_session_completed',
          status: 'timeout',
          metadata: {
            durationMs: Date.now() - inFlightGetSessionStartedAt,
            timeoutMs: AUTH_GET_SESSION_TIMEOUT_MS,
            reusedLatestSession: Boolean(latestSession),
          },
        });
        return latestSession ? getSessionSuccess(latestSession) : getSessionNull();
      }
      if (isInvalidRefreshTokenError(error)) {
        void trackStartupTelemetry(supabase, {
          eventName: 'auth_get_session_completed',
          status: 'invalid_refresh_token',
          metadata: {
            durationMs: Date.now() - inFlightGetSessionStartedAt,
          },
        });
        await handleInvalidRefreshToken();
        return getSessionNull();
      }
      void trackStartupTelemetry(supabase, {
        eventName: 'auth_get_session_completed',
        status: 'error',
        metadata: {
          durationMs: Date.now() - inFlightGetSessionStartedAt,
          message: error?.message ?? 'unknown',
        },
      });
      throw error;
    }
  })();
  inFlightGetSession = requestPromise;

  try {
    return await requestPromise;
  } finally {
    if (inFlightGetSession === requestPromise) {
      inFlightGetSession = null;
      inFlightGetSessionStartedAt = 0;
    }
  }
};

supabase.auth.getUser = async (jwt?: string): Promise<GetUserResult> => {
  const inFlightAgeMs = Math.max(0, Date.now() - inFlightGetUserStartedAt);
  if (
    jwt === undefined &&
    inFlightGetUser &&
    inFlightAgeMs < AUTH_DEDUPE_WINDOW_MS
  ) {
    return inFlightGetUser;
  }

  if (jwt === undefined && inFlightGetUser && inFlightAgeMs >= AUTH_DEDUPE_WINDOW_MS) {
    inFlightGetUser = null;
    inFlightGetUserStartedAt = 0;
  }

  const run = async () => {
    try {
      const result = await withAuthRequestTimeout(
        originalGetUser(jwt),
        AUTH_GET_USER_TIMEOUT_MS,
        'supabase.auth.getUser',
      );
      return normalizeGetUserResult(result);
    } catch (error: unknown) {
      if (jwt === undefined && isAuthRequestTimeoutError(error)) {
        return latestSession?.user
          ? getUserSuccess(latestSession.user)
          : getUserError(new AuthError(error.message, 408, 'auth_get_user_timeout'));
      }
      if (jwt === undefined && isInvalidRefreshTokenError(error)) {
        await handleInvalidRefreshToken();
        return getUserError(new AuthError('Invalid Refresh Token', 401, 'invalid_refresh_token'));
      }
      throw error;
    }
  };

  if (jwt !== undefined) {
    return run();
  }

  inFlightGetUserStartedAt = Date.now();
  const requestPromise = run();
  inFlightGetUser = requestPromise;

  try {
    return await requestPromise;
  } finally {
    if (inFlightGetUser === requestPromise) {
      inFlightGetUser = null;
      inFlightGetUserStartedAt = 0;
    }
  }
};

export const getUser = (jwt?: string) => {
  const token = typeof jwt === 'string' ? jwt.trim() : undefined;
  return token ? supabase.auth.getUser(token) : supabase.auth.getUser();
};

function isInvalidRefreshTokenError(error: any): boolean {
  if (!error) return false;
  
  const errorMessage = error.message || '';
  const errorName = error.name || '';
  
  return (
    errorMessage.includes('Invalid Refresh Token') ||
    errorMessage.includes('Refresh Token Not Found') ||
    errorMessage.includes('refresh_token_not_found') ||
    errorName === 'AuthApiError'
  );
}

async function handleInvalidRefreshToken() {
  console.log('[Supabase] Invalid refresh token detected - clearing session');
  void trackStartupTelemetry(supabase, {
    eventName: 'auth_invalid_refresh_token',
    status: 'clearing_session',
  });
  
  try {
    latestSession = null;
    inFlightGetSession = null;
    inFlightGetUser = null;
    inFlightGetSessionStartedAt = 0;
    inFlightGetUserStartedAt = 0;
    // Only clear the Supabase auth token. Clearing all AsyncStorage also wipes
    // unrelated app state and can leave startup/navigation restore in a bad state.
    await AsyncStorage.removeItem('supabase.auth.token');
    
    // Sign out locally to let the app recover into a clean signed-out state.
    await supabase.auth.signOut({ scope: 'local' });
    
    console.log('[Supabase] Session cleared successfully');
  } catch (error) {
    console.error('[Supabase] Error clearing session:', error);
  }
}
