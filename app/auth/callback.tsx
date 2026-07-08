import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/integrations/supabase/client';
import { colors } from '@/styles/commonStyles';

type CallbackStatus = 'loading' | 'error';
type EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email';

const EMAIL_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set([
  'signup',
  'invite',
  'magiclink',
  'recovery',
  'email_change',
  'email',
]);

const AUTH_PARAM_KEYS = ['code', 'access_token', 'refresh_token', 'token_hash', 'token', 'type'];
const INVITE_TOKEN_PARAM_KEYS = ['clubInviteToken', 'guardianInviteToken'];
const INVITE_META_PARAM_KEYS = ['clubInviteAuthType', 'guardianInviteAuthType'];
const CALLBACK_PARAM_KEYS = [...AUTH_PARAM_KEYS, ...INVITE_TOKEN_PARAM_KEYS, ...INVITE_META_PARAM_KEYS];

const parseParams = (
  incomingUrl: string | null | undefined,
  routeParams: Record<string, string | string[] | undefined>
) => {
  const params = new URLSearchParams();

  if (incomingUrl) {
    const queryIndex = incomingUrl.indexOf('?');
    const hashIndex = incomingUrl.indexOf('#');

    if (queryIndex >= 0) {
      const query = incomingUrl.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
      new URLSearchParams(query).forEach((value, key) => params.set(key, value));
    }

    if (hashIndex >= 0) {
      const hash = incomingUrl.slice(hashIndex + 1);
      new URLSearchParams(hash).forEach((value, key) => params.set(key, value));
    }
  }

  Object.entries(routeParams).forEach(([key, value]) => {
    if (!value || params.has(key)) {
      return;
    }
    params.set(key, Array.isArray(value) ? value[0] : value);
  });

  return params;
};

const mergeParams = (...paramSets: URLSearchParams[]) => {
  const merged = new URLSearchParams();
  paramSets.forEach((set) => {
    set.forEach((value, key) => {
      if (!merged.has(key) && value) {
        merged.set(key, value);
      }
    });
  });
  return merged;
};

const hasAnyParam = (params: URLSearchParams, keys: string[]) =>
  keys.some((key) => {
    const value = params.get(key);
    return Boolean(value && value.length > 0);
  });

const hasAnyAuthParam = (params: URLSearchParams) => hasAnyParam(params, AUTH_PARAM_KEYS);

const hasAnyInviteTokenParam = (params: URLSearchParams) =>
  hasAnyParam(params, INVITE_TOKEN_PARAM_KEYS);

const hasAnyCallbackParam = (params: URLSearchParams) =>
  hasAnyParam(params, CALLBACK_PARAM_KEYS);

const getEmailOtpType = (typeValue: string | null): EmailOtpType | null => {
  if (!typeValue) return null;
  return EMAIL_OTP_TYPES.has(typeValue as EmailOtpType) ? (typeValue as EmailOtpType) : null;
};

const shouldRetryCallbackParams = (params: URLSearchParams) => {
  if (!hasAnyCallbackParam(params)) {
    return true;
  }

  if (!hasAnyAuthParam(params)) {
    return true;
  }

  if (hasAnyInviteTokenParam(params)) {
    return false;
  }

  const otpType = getEmailOtpType(params.get('type'));
  const hasInviteAuthType = Boolean(
    params.get('clubInviteAuthType') || params.get('guardianInviteAuthType')
  );

  return hasInviteAuthType || otpType === 'invite' || otpType === 'magiclink';
};

const waitForSession = async (attempts: number, delayMs: number) => {
  for (let i = 0; i < attempts; i += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) return true;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return false;
};

const getFunctionErrorMessage = async (error: any, fallback: string) => {
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.message === 'string' && payload.message.trim()) {
        return payload.message;
      }
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
      if (payload?.error && typeof payload.error === 'object') {
        const errorMessage = (payload.error as Record<string, unknown>).message;
        if (typeof errorMessage === 'string' && errorMessage.trim()) {
          return errorMessage;
        }
      }
    } catch {
      // Fall back to the Supabase error message below.
    }
  }

  return error?.message ?? fallback;
};

const getClubInviteToken = (params: URLSearchParams) => {
  const token = params.get('clubInviteToken')?.trim();
  return token || null;
};

const getGuardianInviteToken = (params: URLSearchParams) => {
  const token = params.get('guardianInviteToken')?.trim();
  return token || null;
};

const acceptClubInviteIfPresent = async (params: URLSearchParams) => {
  const clubInviteToken = getClubInviteToken(params);
  if (!clubInviteToken) {
    return false;
  }

  const { error } = await supabase.functions.invoke('acceptClubInvite', {
    body: {
      token: clubInviteToken,
      fullName: null,
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Could not accept club invitation.'));
  }

  return true;
};

const acceptGuardianInviteIfPresent = async (params: URLSearchParams) => {
  const guardianInviteToken = getGuardianInviteToken(params);
  if (!guardianInviteToken) {
    return false;
  }

  const { error } = await supabase.functions.invoke('acceptOwnerPlayerGuardianInvite', {
    body: {
      token: guardianInviteToken,
      fullName: null,
    },
  });

  if (error) {
    throw new Error(await getFunctionErrorMessage(error, 'Could not accept guardian invitation.'));
  }

  return true;
};

const acceptInvitesIfPresent = async (params: URLSearchParams) => {
  const clubAccepted = await acceptClubInviteIfPresent(params);
  const guardianAccepted = await acceptGuardianInviteIfPresent(params);
  return clubAccepted || guardianAccepted;
};

export default function AuthCallbackScreen() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const routeParams = useLocalSearchParams<Record<string, string | string[]>>();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('Confirming login...');

  const parsedParams = useMemo(
    () => parseParams(incomingUrl, routeParams),
    [incomingUrl, routeParams]
  );

  useEffect(() => {
    let cancelled = false;

    const completeAuth = async () => {
      try {
        const parsedFromHook = parsedParams;
        const initialUrl = await Linking.getInitialURL();
        const parsedFromInitial = parseParams(initialUrl, routeParams);
        let effectiveParams = mergeParams(parsedFromHook, parsedFromInitial);

        if (shouldRetryCallbackParams(effectiveParams)) {
          // iOS/Safari can open the callback route before all auth/invite params are visible.
          for (let i = 0; i < 6; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            const retryInitialUrl = await Linking.getInitialURL();
            const retryParams = parseParams(retryInitialUrl, routeParams);
            effectiveParams = mergeParams(effectiveParams, retryParams);
            if (!shouldRetryCallbackParams(effectiveParams)) break;
          }
        }

        const authError =
          effectiveParams.get('error_description') ?? effectiveParams.get('error');
        if (authError) {
          throw new Error(authError);
        }

        const code = effectiveParams.get('code');
        const accessToken = effectiveParams.get('access_token');
        const refreshToken = effectiveParams.get('refresh_token');
        const tokenHash = effectiveParams.get('token_hash');
        const token = effectiveParams.get('token');
        const email = effectiveParams.get('email');
        const otpType = getEmailOtpType(effectiveParams.get('type'));
        const flow = effectiveParams.get('flow');
        const fallbackOtpType: EmailOtpType | null =
          flow === 'reset-password' ? 'recovery' : null;
        const resolvedOtpType = otpType ?? fallbackOtpType;

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (tokenHash && resolvedOtpType) {
          const { error } = await supabase.auth.verifyOtp({
            type: resolvedOtpType,
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else if (token && resolvedOtpType && email) {
          const { error } = await supabase.auth.verifyOtp({
            type: resolvedOtpType,
            token,
            email,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Some clients can strip/consume callback params. Fall back to login flow.
          const hasSession = await waitForSession(12, 300);
          if (!cancelled) {
            if (hasSession) {
              setMessage('Accepting invitation...');
              await acceptInvitesIfPresent(effectiveParams);
              router.replace('/(tabs)/profile');
            } else {
              router.replace({ pathname: '/(tabs)/profile', params: { authMode: 'login' } });
            }
          }
          return;
        }

        if (!cancelled) {
          const shouldGoToPasswordReset =
            otpType === 'recovery' || flow === 'reset-password';
          if (shouldGoToPasswordReset) {
            router.replace('/update-password');
          } else {
            setMessage('Accepting invitation...');
            await acceptInvitesIfPresent(effectiveParams);
            router.replace('/(tabs)/profile');
          }
        }
      } catch (error: any) {
        if (!cancelled) {
          setStatus('error');
          setMessage(error?.message ?? 'Failed to complete login from verification link.');
        }
      }
    };

    void completeAuth();

    return () => {
      cancelled = true;
    };
  }, [parsedParams, routeParams, router]);

  if (status === 'loading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.text}>{message}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.errorTitle}>Could not log in</Text>
      <Text style={styles.text}>{message}</Text>
      <Pressable
        style={styles.button}
        onPress={() => router.replace({ pathname: '/(tabs)/profile', params: { authMode: 'login' } })}
      >
        <Text style={styles.buttonText}>Tilbage til login</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 16,
  },
  text: {
    fontSize: 15,
    textAlign: 'center',
    color: colors.text,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.error,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
