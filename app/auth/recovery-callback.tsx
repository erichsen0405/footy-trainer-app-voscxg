import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/integrations/supabase/client';
import { colors } from '@/styles/commonStyles';

type CallbackStatus = 'loading' | 'error';
type EmailOtpType = 'recovery' | 'email';

const EMAIL_OTP_TYPES: ReadonlySet<EmailOtpType> = new Set(['recovery', 'email']);
const AUTH_PARAM_KEYS = ['code', 'access_token', 'refresh_token', 'token_hash', 'token', 'type'];
const MAX_NESTED_PARSE_PASSES = 64;

const tryDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const getFirstParamValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

const extractParamsFromInput = (input: string) => {
  const extracted = new URLSearchParams();
  if (!input) return extracted;

  const addSegment = (segment: string) => {
    if (!segment) return;
    new URLSearchParams(segment).forEach((value, key) => {
      if (value && !extracted.has(key)) {
        extracted.set(key, value);
      }
    });
  };

  const queryIndex = input.indexOf('?');
  const hashIndex = input.indexOf('#');

  if (queryIndex >= 0) {
    const query = input.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined);
    addSegment(query);
  }

  if (hashIndex >= 0) {
    const hash = input.slice(hashIndex + 1);
    addSegment(hash);
  }

  if (queryIndex < 0 && hashIndex < 0 && input.includes('=')) {
    addSegment(input);
  }

  return extracted;
};

const looksLikeNestedPayload = (value: string) => {
  if (!value) return false;

  return (
    value.includes('://') ||
    value.includes('%3A%2F%2F') ||
    value.includes('token_hash=') ||
    value.includes('access_token=') ||
    value.includes('refresh_token=') ||
    value.includes('code=') ||
    (value.includes('=') && (value.includes('&') || value.includes('?') || value.includes('#')))
  );
};

const parseParams = (
  incomingUrl: string | null | undefined,
  routeParams: Record<string, string | string[] | undefined>
) => {
  const merged = new URLSearchParams();
  const queue: string[] = [];
  const seen = new Set<string>();

  const enqueue = (candidate?: string | null) => {
    if (!candidate) return;
    const trimmed = candidate.trim();
    if (!trimmed || seen.has(trimmed)) return;
    queue.push(trimmed);
  };

  enqueue(incomingUrl);

  Object.values(routeParams).forEach((value) => {
    const first = getFirstParamValue(value);
    if (first) enqueue(first);
  });

  let passes = 0;
  while (queue.length > 0 && passes < MAX_NESTED_PARSE_PASSES) {
    passes += 1;
    const current = queue.shift();
    if (!current) continue;

    const variants = [
      current,
      tryDecodeURIComponent(current),
      tryDecodeURIComponent(tryDecodeURIComponent(current)),
    ];

    variants.forEach((variant) => {
      const normalized = variant.trim();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);

      const extracted = extractParamsFromInput(normalized);
      extracted.forEach((value, key) => {
        if (value && !merged.has(key)) {
          merged.set(key, value);
        }

        if (looksLikeNestedPayload(value)) {
          enqueue(value);
          const decoded = tryDecodeURIComponent(value);
          if (decoded !== value) enqueue(decoded);
        }
      });
    });
  }

  Object.entries(routeParams).forEach(([key, value]) => {
    const first = getFirstParamValue(value);
    if (first && !merged.has(key)) {
      merged.set(key, first);
    }
  });

  return merged;
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

export default function RecoveryCallbackScreen() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const routeParams = useLocalSearchParams<Record<string, string | string[]>>();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('Klargør nulstilling af adgangskode...');

  const parsedParams = useMemo(
    () => parseParams(incomingUrl, routeParams),
    [incomingUrl, routeParams]
  );

  useEffect(() => {
    let cancelled = false;

    const completeRecovery = async () => {
      try {
        const parsedFromHook = parsedParams;
        const initialUrl = await Linking.getInitialURL();
        const parsedFromInitial = parseParams(initialUrl, routeParams);
        let effectiveParams = mergeParams(parsedFromHook, parsedFromInitial);

        if (!hasAnyAuthParam(effectiveParams)) {
          for (let i = 0; i < 8; i += 1) {
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
        const fallbackOtpType: EmailOtpType = 'recovery';

        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            type: otpType ?? fallbackOtpType,
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else if (token && email) {
          const { error } = await supabase.auth.verifyOtp({
            type: otpType ?? fallbackOtpType,
            token,
            email,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          const hasSession = await waitForSession(45, 300);
          if (!cancelled) {
            if (hasSession) {
              router.replace('/update-password');
            } else {
              throw new Error(
                'Linket kunne ikke valideres i appen. Prøv at åbne nulstillingslinket igen fra den nyeste e-mail.'
              );
            }
          }
          return;
        }

        if (!cancelled) {
          router.replace('/update-password');
        }
      } catch (error: any) {
        if (!cancelled) {
          setStatus('error');
          setMessage(error?.message ?? 'Kunne ikke gennemføre nulstilling af adgangskode.');
        }
      }
    };

    void completeRecovery();

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
      <Text style={styles.errorTitle}>Kunne ikke nulstille adgangskode</Text>
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
