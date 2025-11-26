
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { GlassView } from 'expo-glass-effect';
import { useTheme } from '@react-navigation/native';
import { supabase } from '@/app/integrations/supabase/client';

export default function ProfileScreen() {
  const theme = useTheme();
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);

  useEffect(() => {
    // Check current user
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user);
      setUser(user);
    };
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      console.log('Auth state changed:', _event, session?.user);
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Fejl', 'Udfyld venligst både email og adgangskode');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Fejl', 'Indtast venligst en gyldig email-adresse');
      return;
    }

    // Password length validation
    if (password.length < 6) {
      Alert.alert('Fejl', 'Adgangskoden skal være mindst 6 tegn lang');
      return;
    }

    setLoading(true);
    console.log(`Starting ${isSignUp ? 'signup' : 'login'} process for:`, email);
    
    try {
      if (isSignUp) {
        console.log('Attempting to sign up with:', email);
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'https://natively.dev/email-confirmed'
          }
        });

        console.log('Sign up response:', { 
          user: data.user?.id, 
          session: data.session ? 'exists' : 'null',
          error: error?.message 
        });

        if (error) {
          console.error('Sign up error:', error);
          // Show the actual error message from Supabase
          Alert.alert(
            'Kunne ikke oprette konto',
            error.message || 'Der opstod en fejl. Prøv venligst igen.'
          );
          return;
        }

        // Show success message in the app
        setShowSuccessMessage(true);
        
        // Clear form fields
        setEmail('');
        setPassword('');

        // Wait 3 seconds to show the success message, then switch to login
        setTimeout(() => {
          setShowSuccessMessage(false);
          setIsSignUp(false);
        }, 3000);

        // Check if email confirmation is required
        if (data.user && !data.session) {
          Alert.alert(
            'Bekræft din email ✉️',
            'Vi har sendt en bekræftelsesmail til dig. Tjek venligst din indbakke og klik på linket for at aktivere din konto.\n\n⚠️ Bemærk: Tjek også din spam-mappe hvis du ikke kan finde emailen.\n\n✅ Din konto er oprettet, men du skal bekræfte din email før du kan logge ind.',
            [{ text: 'OK' }]
          );
        } else if (data.session) {
          Alert.alert('Succes! 🎉', 'Din konto er oprettet og du er nu logget ind!');
        }
      } else {
        console.log('Attempting to sign in with:', email);
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        console.log('Sign in response:', { 
          user: data.user?.id, 
          session: data.session ? 'exists' : 'null',
          error: error?.message 
        });

        if (error) {
          console.error('Sign in error:', error);
          
          // Provide more helpful error messages
          if (error.message.includes('Invalid login credentials')) {
            Alert.alert(
              'Login fejlede', 
              'Email eller adgangskode er forkert.\n\nHusk:\n• Har du bekræftet din email?\n• Er du sikker på at du har oprettet en konto?\n• Prøv at nulstille din adgangskode hvis du har glemt den.'
            );
          } else if (error.message.includes('Email not confirmed')) {
            Alert.alert(
              'Email ikke bekræftet',
              'Du skal bekræfte din email før du kan logge ind. Tjek din indbakke for bekræftelsesmailen.\n\nTjek også din spam-mappe.'
            );
          } else {
            Alert.alert('Login fejlede', error.message || 'Der opstod en fejl. Prøv venligst igen.');
          }
          return;
        }

        if (data.session) {
          Alert.alert('Succes! 🎉', 'Du er nu logget ind!');
        }
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en uventet fejl. Prøv venligst igen.');
    } finally {
      setLoading(false);
      console.log(`${isSignUp ? 'Signup' : 'Login'} process completed`);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      Alert.alert('Logget ud', 'Du er nu logget ud');
    } catch (error: any) {
      console.error('Sign out error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en fejl');
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
      >
        {user ? (
          // Logged in view
          <>
            <GlassView style={styles.profileHeader} glassEffectStyle="regular">
              <IconSymbol ios_icon_name="person.circle.fill" android_material_icon_name="person" size={80} color={theme.colors.primary} />
              <Text style={[styles.name, { color: theme.colors.text }]}>{user.email?.split('@')[0] || 'Bruger'}</Text>
              <Text style={[styles.email, { color: theme.dark ? '#98989D' : '#666' }]}>{user.email}</Text>
            </GlassView>

            <TouchableOpacity
              style={[styles.signOutButton, { backgroundColor: '#ff3b30' }]}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <Text style={styles.signOutButtonText}>Log ud</Text>
            </TouchableOpacity>
          </>
        ) : (
          // Login/Sign up view
          <GlassView style={styles.authCard} glassEffectStyle="regular">
            {/* Success Message */}
            {showSuccessMessage && (
              <View style={[styles.successMessage, { backgroundColor: theme.colors.primary }]}>
                <IconSymbol 
                  ios_icon_name="checkmark.circle.fill" 
                  android_material_icon_name="check_circle" 
                  size={64} 
                  color="#fff" 
                />
                <Text style={styles.successTitle}>Konto oprettet! 🎉</Text>
                <Text style={styles.successText}>
                  Din konto er blevet oprettet succesfuldt.{'\n'}
                  Du bliver nu sendt til login siden...
                </Text>
              </View>
            )}

            {!showSuccessMessage && (
              <>
                <Text style={[styles.title, { color: theme.colors.text }]}>
                  {isSignUp ? 'Opret konto' : 'Log ind'}
                </Text>

                <View style={styles.authToggle}>
                  <TouchableOpacity
                    style={[
                      styles.authToggleButton,
                      !isSignUp && styles.authToggleButtonActive
                    ]}
                    onPress={() => setIsSignUp(false)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.authToggleText,
                      { color: theme.colors.text },
                      !isSignUp && styles.authToggleTextActive
                    ]}>
                      Log ind
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.authToggleButton,
                      isSignUp && styles.authToggleButtonActive
                    ]}
                    onPress={() => setIsSignUp(true)}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.authToggleText,
                      { color: theme.colors.text },
                      isSignUp && styles.authToggleTextActive
                    ]}>
                      Opret konto
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.form}>
                  <Text style={[styles.label, { color: theme.colors.text }]}>Email</Text>
                  <TextInput
                    style={[styles.input, { 
                      backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      color: theme.colors.text 
                    }]}
                    value={email}
                    onChangeText={setEmail}
                    placeholder="din@email.dk"
                    placeholderTextColor={theme.dark ? '#98989D' : '#666'}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!loading}
                    autoCorrect={false}
                  />

                  <Text style={[styles.label, { color: theme.colors.text }]}>Adgangskode</Text>
                  <TextInput
                    style={[styles.input, { 
                      backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      color: theme.colors.text 
                    }]}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Mindst 6 tegn"
                    placeholderTextColor={theme.dark ? '#98989D' : '#666'}
                    secureTextEntry
                    editable={!loading}
                    autoCorrect={false}
                    autoCapitalize="none"
                  />

                  <TouchableOpacity
                    style={[
                      styles.authButton,
                      { backgroundColor: theme.colors.primary },
                      loading && { opacity: 0.6 }
                    ]}
                    onPress={handleAuth}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    {loading ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator color="#fff" size="small" />
                        <Text style={[styles.authButtonText, { marginLeft: 12 }]}>
                          {isSignUp ? 'Opretter konto...' : 'Logger ind...'}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.authButtonText}>
                        {isSignUp ? 'Opret konto' : 'Log ind'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.infoBox}>
                  <IconSymbol 
                    ios_icon_name="info.circle" 
                    android_material_icon_name="info" 
                    size={24} 
                    color={theme.colors.primary} 
                  />
                  <Text style={[styles.infoText, { color: theme.dark ? '#98989D' : '#666' }]}>
                    {isSignUp 
                      ? 'Efter du opretter din konto, vil du modtage en bekræftelsesmail. Du skal klikke på linket i emailen før du kan logge ind.'
                      : 'Log ind for at gemme dine data sikkert i skyen.'
                    }
                  </Text>
                </View>
              </>
            )}
          </GlassView>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  profileHeader: {
    alignItems: 'center',
    borderRadius: 12,
    padding: 32,
    marginBottom: 16,
    gap: 12,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  email: {
    fontSize: 16,
  },
  signOutButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 16,
  },
  signOutButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  authCard: {
    borderRadius: 12,
    padding: 24,
  },
  successMessage: {
    borderRadius: 12,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  successText: {
    fontSize: 17,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  authToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  authToggleButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: 'rgba(128,128,128,0.2)',
  },
  authToggleButtonActive: {
    backgroundColor: 'rgba(0,122,255,0.3)',
  },
  authToggleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  authToggleTextActive: {
    fontWeight: 'bold',
  },
  form: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  authButton: {
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  authButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    padding: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.1)',
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
