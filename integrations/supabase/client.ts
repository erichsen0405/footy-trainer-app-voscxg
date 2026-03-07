import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from './types';
import type { Session } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js'
import { trackStartupTelemetry } from '@/utils/startupTelemetry';

const SUPABASE_URL = "https://lhpczofddvwcyrgotzha.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocGN6b2ZkZHZ3Y3lyZ290emhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgzMjQsImV4cCI6MjA3OTczNDMyNH0.5oWZ_G5ryy_ae77CG8YMeEDEyAJkSS7Jv4cFZy-G7qA";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

const AUTH_DEDUPE_WINDOW_MS = 1500;

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

supabase.auth.getSession = async () => {
  if (inFlightGetSession && Date.now() - inFlightGetSessionStartedAt < AUTH_DEDUPE_WINDOW_MS) {
    void trackStartupTelemetry(supabase, {
      eventName: 'auth_get_session_dedupe_hit',
      status: 'reused',
      metadata: {
        dedupeWindowMs: AUTH_DEDUPE_WINDOW_MS,
      },
    });
    return inFlightGetSession;
  }

  inFlightGetSessionStartedAt = Date.now();
  inFlightGetSession = (async () => {
  try {
    const result = await originalGetSession();
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
    return result;
  } catch (error: any) {
    if (isInvalidRefreshTokenError(error)) {
      void trackStartupTelemetry(supabase, {
        eventName: 'auth_get_session_completed',
        status: 'invalid_refresh_token',
        metadata: {
          durationMs: Date.now() - inFlightGetSessionStartedAt,
        },
      });
      await handleInvalidRefreshToken();
      return { data: { session: null }, error: null };
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

  try {
    return await inFlightGetSession;
  } finally {
    inFlightGetSession = null;
  }
};

supabase.auth.getUser = async (jwt?: string) => {
  if (
    jwt === undefined &&
    inFlightGetUser &&
    Date.now() - inFlightGetUserStartedAt < AUTH_DEDUPE_WINDOW_MS
  ) {
    return inFlightGetUser;
  }

  const run = async () => {
  try {
    const result = await originalGetUser(jwt);
    return result;
  } catch (error: unknown) {
    if (jwt === undefined && isInvalidRefreshTokenError(error)) {
      await handleInvalidRefreshToken();
      return originalGetUser();
    }
    throw error;
  }
  };

  if (jwt !== undefined) {
    return run();
  }

  inFlightGetUserStartedAt = Date.now();
  inFlightGetUser = run();

  try {
    return await inFlightGetUser;
  } finally {
    inFlightGetUser = null;
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
