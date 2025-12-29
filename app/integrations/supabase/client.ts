
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Database } from './types';
import { createClient } from '@supabase/supabase-js'
import { router } from 'expo-router';

const SUPABASE_URL = "https://lhpczofddvwcyrgotzha.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxocGN6b2ZkZHZ3Y3lyZ290emhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQxNTgzMjQsImV4cCI6MjA3OTczNDMyNH0.5oWZ_G5ryy_ae77CG8YMeEDEyAJkSS7Jv4cFZy-G7qA";

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

// Global error handler for invalid refresh token
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'TOKEN_REFRESHED') {
    console.log('[Supabase] Token refreshed successfully');
  }
  
  if (event === 'SIGNED_OUT') {
    console.log('[Supabase] User signed out');
  }
});

// Wrap auth methods to handle invalid refresh token errors
const originalGetSession = supabase.auth.getSession.bind(supabase.auth);
const originalGetUser = supabase.auth.getUser.bind(supabase.auth);

supabase.auth.getSession = async () => {
  try {
    const result = await originalGetSession();
    return result;
  } catch (error: any) {
    if (isInvalidRefreshTokenError(error)) {
      await handleInvalidRefreshToken();
      return { data: { session: null }, error: null };
    }
    throw error;
  }
};

supabase.auth.getUser = async () => {
  try {
    const result = await originalGetUser();
    return result;
  } catch (error: any) {
    if (isInvalidRefreshTokenError(error)) {
      await handleInvalidRefreshToken();
      return { data: { user: null }, error: null };
    }
    throw error;
  }
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
  
  try {
    // Clear local storage
    await AsyncStorage.removeItem('supabase.auth.token');
    await AsyncStorage.clear();
    
    // Sign out (this will clear the session)
    await supabase.auth.signOut({ scope: 'local' });
    
    console.log('[Supabase] Session cleared successfully');
  } catch (error) {
    console.error('[Supabase] Error clearing session:', error);
  }
}
