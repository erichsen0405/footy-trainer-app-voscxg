import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/integrations/supabase/client';
import { colors } from '@/styles/commonStyles';

type CallbackStatus = 'loading' | 'error';

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

export default function AuthCallbackScreen() {
  const router = useRouter();
  const incomingUrl = Linking.useURL();
  const routeParams = useLocalSearchParams<Record<string, string | string[]>>();
  const [status, setStatus] = useState<CallbackStatus>('loading');
  const [message, setMessage] = useState('Bekraefter login...');

  const parsedParams = useMemo(
    () => parseParams(incomingUrl, routeParams),
    [incomingUrl, routeParams]
  );

  useEffect(() => {
    let cancelled = false;

    const completeAuth = async () => {
      try {
        const authError =
          parsedParams.get('error_description') ?? parsedParams.get('error');
        if (authError) {
          throw new Error(authError);
        }

        const code = parsedParams.get('code');
        const accessToken = parsedParams.get('access_token');
        const refreshToken = parsedParams.get('refresh_token');

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else {
          throw new Error('Manglende auth-parametre i callback URL.');
        }

        if (!cancelled) {
          router.replace('/(tabs)/(home)');
        }
      } catch (error: any) {
        if (!cancelled) {
          setStatus('error');
          setMessage(error?.message ?? 'Kunne ikke gennemfoere login fra bekraeftelseslinket.');
        }
      }
    };

    void completeAuth();

    return () => {
      cancelled = true;
    };
  }, [parsedParams, router]);

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
