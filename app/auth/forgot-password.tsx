import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/integrations/supabase/client';
import { colors } from '@/styles/commonStyles';

const AUTH_REDIRECT_URL = 'footballcoach://auth/recovery-callback';

const getFirstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const initialEmail = useMemo(() => getFirstParam(params.email)?.trim() ?? '', [params.email]);
  const [email, setEmail] = useState(initialEmail);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSendResetEmail = async () => {
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) {
      setError('Indtast din e-mail.');
      setMessage(null);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: AUTH_REDIRECT_URL,
      });

      if (resetError) {
        throw resetError;
      }

      setMessage(`Vi har sendt et nulstillingslink til ${trimmedEmail}.`);
    } catch (resetError: any) {
      setError(resetError?.message ?? 'Kunne ikke sende nulstillingsmail.');
    } finally {
      setLoading(false);
    }
  };

  const goToLogin = () => {
    router.replace({
      pathname: '/(tabs)/profile',
      params: { email: email.trim().toLowerCase(), authMode: 'login' },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Glemt adgangskode</Text>
      <Text style={styles.text}>Indtast din e-mail, så sender vi et link til at nulstille adgangskoden.</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        style={styles.input}
        placeholder="din@email.dk"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
      />

      {message ? <Text style={styles.success}>{message}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSendResetEmail}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Send nulstillingsmail</Text>
        )}
      </Pressable>

      <Pressable style={styles.buttonSecondary} onPress={goToLogin}>
        <Text style={styles.buttonSecondaryText}>Tilbage til login</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  text: {
    fontSize: 15,
    color: colors.text,
    lineHeight: 22,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: '#fff',
  },
  success: {
    fontSize: 14,
    color: '#22863a',
  },
  error: {
    fontSize: 14,
    color: colors.error,
  },
  button: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonSecondaryText: {
    color: colors.text,
    fontWeight: '600',
  },
});
