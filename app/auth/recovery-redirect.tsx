import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { colors } from '@/styles/commonStyles';

const getFirstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default function RecoveryRedirectScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    token_hash?: string | string[];
    type?: string | string[];
  }>();

  const autoOpenTriggeredRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const [autoOpenFinished, setAutoOpenFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokenHash = useMemo(() => getFirstParam(params.token_hash)?.trim() ?? '', [params.token_hash]);
  const type = useMemo(() => getFirstParam(params.type)?.trim() || 'recovery', [params.type]);

  const deepLink = useMemo(() => {
    if (!tokenHash) {
      return 'footballcoach://auth/recovery-callback?type=recovery';
    }
    return `footballcoach://auth/recovery-callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}`;
  }, [tokenHash, type]);

  const openApp = useCallback(async () => {
    setOpening(true);
    setError(null);
    try {
      await Linking.openURL(deepLink);
    } catch (openError: any) {
      setError(openError?.message ?? 'Kunne ikke åbne appen automatisk.');
    } finally {
      setAutoOpenFinished(true);
      setOpening(false);
    }
  }, [deepLink]);

  useEffect(() => {
    if (autoOpenTriggeredRef.current) {
      return;
    }
    autoOpenTriggeredRef.current = true;
    void openApp();
  }, [openApp]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Åbn Football Coach</Text>
      <Text style={styles.text}>Vi sender dig videre til appen, så du kan nulstille din adgangskode.</Text>

      <Pressable style={[styles.button, opening && styles.buttonDisabled]} onPress={openApp} disabled={opening}>
        {opening ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Åbn app nu</Text>
        )}
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {autoOpenFinished && !error ? (
        <Text style={styles.hint}>Hvis appen ikke åbnede, tryk på knappen igen.</Text>
      ) : null}

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.replace({ pathname: '/(tabs)/profile', params: { authMode: 'login' } })}
      >
        <Text style={styles.secondaryText}>Tilbage til login</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    gap: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  text: {
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
    lineHeight: 22,
  },
  hint: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  button: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 180,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignItems: 'center',
    minWidth: 180,
  },
  secondaryText: {
    color: colors.text,
    fontWeight: '600',
  },
  error: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
  },
});
