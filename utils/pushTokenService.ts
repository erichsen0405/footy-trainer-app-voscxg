
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { supabase } from '@/integrations/supabase/client';

const PUSH_TOKEN_CACHE_KEY = '@push_token_registration_v1';
const PUSH_TOKEN_TRANSIENT_MAX_ATTEMPTS = 3;
const PUSH_TOKEN_TRANSIENT_BASE_DELAY_MS = 750;

const readProjectId = () => {
  const easProjectId = (Constants as any)?.easConfig?.projectId;
  const extraProjectId = (Constants as any)?.expoConfig?.extra?.eas?.projectId;
  return easProjectId || extraProjectId || undefined;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isAndroidFcmConfigIssue = (message: string) =>
  Platform.OS === 'android' &&
  (message.includes('Default FirebaseApp is not initialized') ||
    message.includes('fcm-credentials') ||
    message.includes('FCM'));

const isTransientExpoTokenError = (error: unknown) => {
  const message = String((error as any)?.message || '').toLowerCase();
  const code = String((error as any)?.code || '').toUpperCase();

  return (
    code === 'SERVICE_UNAVAILABLE' ||
    message.includes('service_unavailable') ||
    message.includes('temporarily unavailable') ||
    message.includes('istransient') ||
    /\breceived:\s*(429|500|502|503|504)\b/i.test(message)
  );
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
    let tokenResponse: Notifications.ExpoPushToken | null = null;
    for (let attempt = 1; attempt <= PUSH_TOKEN_TRANSIENT_MAX_ATTEMPTS; attempt += 1) {
      try {
        tokenResponse = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined,
        );
        break;
      } catch (tokenError: any) {
        const message = String(tokenError?.message || '');

        if (isAndroidFcmConfigIssue(message)) {
          console.log(
            '[pushTokenService] Android FCM is not configured for this build, skipping push token sync',
          );
          return false;
        }

        if (!isTransientExpoTokenError(tokenError)) {
          throw tokenError;
        }

        if (attempt < PUSH_TOKEN_TRANSIENT_MAX_ATTEMPTS) {
          const delayMs = PUSH_TOKEN_TRANSIENT_BASE_DELAY_MS * attempt;
          await wait(delayMs);
          continue;
        }

        console.log(
          '[pushTokenService] Expo push token service is temporarily unavailable, skipping sync for now',
        );
        return false;
      }
    }

    const expoPushToken = tokenResponse?.data;
    if (!expoPushToken) {
      console.log('[pushTokenService] No Expo push token available');
      return false;
    }

    const cachedRaw = await AsyncStorage.getItem(PUSH_TOKEN_CACHE_KEY);
    let cached: { userId?: string; expoPushToken?: string } | null = null;
    if (cachedRaw) {
      try {
        cached = JSON.parse(cachedRaw);
      } catch {
        cached = null;
      }
    }
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
    if (isTransientExpoTokenError(error)) {
      console.log(
        '[pushTokenService] Expo push token service is temporarily unavailable, skipping sync for now',
      );
      return false;
    }
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
