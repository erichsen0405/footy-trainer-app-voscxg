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

const hasAnyAuthParam = (params: URLSearchParams) =>
  AUTH_PARAM_KEYS.some((key) => {
    const value = params.get(key);
    return Boolean(value && value.length > 0);
  });

const getEmailOtpType = (typeValue: string | null): EmailOtpType | null => {
  if (!typeValue) return null;
  return EMAIL_OTP_TYPES.has(typeValue as EmailOtpType) ? (typeValue as EmailOtpType) : null;
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

export default function AuthCallbackScreen() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const routeParams = useLocalSearchParams<Record<string, string | string[]>>();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('Bekræfter login...');

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

        if (!hasAnyAuthParam(effectiveParams)) {
          // iOS/Safari can open the callback route before params are visible to the hook.
          for (let i = 0; i < 6; i += 1) {
            await new Promise((resolve) => setTimeout(resolve, 200));
            const retryInitialUrl = await Linking.getInitialURL();
            const retryParams = parseParams(retryInitialUrl, routeParams);
            effectiveParams = mergeParams(effectiveParams, retryParams);
            if (hasAnyAuthParam(effectiveParams)) break;
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
            router.replace('/(tabs)/profile');
          }
        }
      } catch (error: any) {
        if (!cancelled) {
          setStatus('error');
          setMessage(error?.message ?? 'Kunne ikke gennemføre login fra bekræftelseslinket.');
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
      <Text style={styles.errorTitle}>Kunne ikke logge ind</Text>
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
