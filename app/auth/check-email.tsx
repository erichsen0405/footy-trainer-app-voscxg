import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/integrations/supabase/client';
import { colors } from '@/styles/commonStyles';

const AUTH_REDIRECT_URL = 'footballcoach://auth/callback';

const getFirstParam = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value);

export default function CheckEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const initialEmail = useMemo(() => getFirstParam(params.email)?.trim() ?? '', [params.email]);
  const [email, setEmail] = useState(initialEmail);
  const [resendLoading, setResendLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resendRequestedAt, setResendRequestedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!resendRequestedAt) return;
    let active = true;

    const sendResend = async () => {
      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        if (active) {
          setError('Enter an email to resend confirmation email.');
          setMessage(null);
          setResendRequestedAt(null);
        }
        return;
      }

      if (active) {
        setResendLoading(true);
        setError(null);
        setMessage(null);
      }

      try {
        const { error: resendError } = await supabase.auth.resend({
          type: 'signup',
          email: trimmedEmail,
          options: { emailRedirectTo: AUTH_REDIRECT_URL },
        });

        if (resendError) {
          throw resendError;
        }

        if (active) {
          setMessage(`We have sent a new confirmation email to ${trimmedEmail}.`);
        }
      } catch (resendError: any) {
        if (active) {
          setError(resendError?.message ?? 'Failed to resend confirmation email.');
        }
      } finally {
        if (active) {
          setResendLoading(false);
          setResendRequestedAt(null);
        }
      }
    };

    void sendResend();

    return () => {
      active = false;
    };
  }, [email, resendRequestedAt]);

  const goToLogin = () => {
    router.replace({
      pathname: '/(tabs)/profile',
      params: { email: email.trim(), authMode: 'login' },
    });
  };

  const goToSignup = () => {
    router.replace({
      pathname: '/(tabs)/profile',
      params: { email: email.trim(), authMode: 'signup' },
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tjek din e-mail</Text>
      <Text style={styles.text}>Vi har sendt en mail til {email || 'din e-mail'}.</Text>

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
        style={[styles.button, resendLoading && styles.buttonDisabled]}
        onPress={() => setResendRequestedAt(Date.now())}
        disabled={resendLoading}
      >
        {resendLoading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Resend confirmation email</Text>
        )}
      </Pressable>

      <Pressable style={styles.buttonSecondary} onPress={goToSignup}>
        <Text style={styles.buttonSecondaryText}>Skift e-mail</Text>
      </Pressable>

      <Pressable style={styles.buttonSecondary} onPress={goToLogin}>
        <Text style={styles.buttonSecondaryText}>I have confirmed (log in)</Text>
      </Pressable>

      <View style={styles.noticeBox}>
        <Text style={styles.noticeTitle}>OBS</Text>
        <Text style={styles.noticeText}>
          If you do not receive the email, please check your spam or junk mail folder.
        </Text>
      </View>
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
  noticeBox: {
    marginTop: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#f2c46d',
    backgroundColor: '#fff7e6',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8a5a00',
  },
  noticeText: {
    fontSize: 13,
    color: '#8a5a00',
    lineHeight: 18,
  },
});
