
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/integrations/supabase/client';

const PUSH_TOKEN_CACHE_KEY = '@push_token_registration_v1';

const readProjectId = () => {
  const easProjectId = (Constants as any)?.easConfig?.projectId;
  const extraProjectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId;
  return easProjectId || extraProjectId || undefined;
};

export async function syncPushTokenForCurrentUser(force = false): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      console.log('[pushTokenService] No authenticated user, skipping push token sync');
      return false;
    }

    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      console.log('[pushTokenService] Notification permission is not granted, skipping push token sync');
      return false;
    }

    const projectId = readProjectId();
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    const expoPushToken = tokenResponse?.data;
    if (!expoPushToken) {
      console.log('[pushTokenService] No Expo push token available');
      return false;
    }

    const cachedRaw = await AsyncStorage.getItem(PUSH_TOKEN_CACHE_KEY);
    const cached = cachedRaw ? JSON.parse(cachedRaw) : null;
    if (!force && cached?.userId === user.id && cached?.expoPushToken === expoPushToken) {
      console.log('[pushTokenService] Push token already synced for current user');
      return true;
    }

    const nowIso = new Date().toISOString();

    const { error } = await supabase.from('user_push_tokens').upsert(
      {
        user_id: user.id,
        expo_push_token: expoPushToken,
        platform: Platform.OS,
        updated_at: nowIso,
      },
      {
        onConflict: 'user_id,expo_push_token',
      },
    );

    if (error) {
      console.error('[pushTokenService] Failed to upsert push token:', error);
      return false;
    }

    console.log('[pushTokenService] Push token synced for user:', user.id);

    await AsyncStorage.setItem(
      PUSH_TOKEN_CACHE_KEY,
      JSON.stringify({ userId: user.id, expoPushToken }),
    );

    return true;
  } catch (error) {
    console.error('[pushTokenService] Unexpected push token sync error:', error);
    return false;
  }
}

export async function clearPushTokenCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PUSH_TOKEN_CACHE_KEY);
  } catch {
    // ignore cache clear errors
  }
}
