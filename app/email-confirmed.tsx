
import { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/integrations/supabase/client';
import { colors } from '@/styles/commonStyles';

export default function EmailConfirmedScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Confirming your email...');

  const handleEmailConfirmation = useCallback(async () => {
    try {
      console.log('📧 Email confirmation screen loaded');
      
      // Get the current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('❌ Session error:', sessionError);
        setStatus('error');
        setMessage('There was an error verifying your email.');
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.replace('/(tabs)/(home)');
        }, 3000);
        return;
      }

      if (session) {
        console.log('✅ Email confirmed successfully');
        setStatus('success');
        setMessage('Your email has been confirmed! Redirecting...');
        
        // Redirect to home after 2 seconds
        setTimeout(() => {
          router.replace('/(tabs)/(home)');
        }, 2000);
      } else {
        console.log('⚠️ No session found');
        setStatus('error');
        setMessage('Could not verify email. Please try again.');
        
        // Redirect to login after 3 seconds
        setTimeout(() => {
          router.replace('/(tabs)/(home)');
        }, 3000);
      }
    } catch (error) {
      console.error('❌ Error in email confirmation:', error);
      setStatus('error');
      setMessage('An unexpected error occurred.');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.replace('/(tabs)/(home)');
      }, 3000);
    }
  }, [router]);

  useEffect(() => {
    handleEmailConfirmation();
  }, [handleEmailConfirmation]);

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {status === 'loading' && (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.message}>{message}</Text>
          </>
        )}
        
        {status === 'success' && (
          <>
            <Text style={styles.successIcon}>✅</Text>
            <Text style={styles.successMessage}>{message}</Text>
          </>
        )}
        
        {status === 'error' && (
          <>
            <Text style={styles.errorIcon}>❌</Text>
            <Text style={styles.errorMessage}>{message}</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    alignItems: 'center',
    gap: 20,
  },
  message: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginTop: 20,
  },
  successIcon: {
    fontSize: 64,
  },
  successMessage: {
    fontSize: 18,
    color: colors.primary,
    textAlign: 'center',
    fontWeight: '600',
  },
  errorIcon: {
    fontSize: 64,
  },
  errorMessage: {
    fontSize: 18,
    color: colors.error,
    textAlign: 'center',
    fontWeight: '600',
  },
});
