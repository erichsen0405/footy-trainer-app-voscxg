
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, useColorScheme, Alert, Platform, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
        
        setEmail('');
        setPassword('');
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

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Profil</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            {user ? `Logget ind som ${user.email}` : 'Log ind for at gemme dine data'}
          </Text>
        </View>

        {user ? (
          // Logged in view
          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            <View style={styles.userInfo}>
              <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
                <IconSymbol 
                  ios_icon_name="person.fill" 
                  android_material_icon_name="person" 
                  size={48} 
                  color="#fff" 
                />
              </View>
              <View style={styles.userDetails}>
                <Text style={[styles.userName, { color: textColor }]}>
                  {user.email?.split('@')[0] || 'Bruger'}
                </Text>
                <Text style={[styles.userEmail, { color: textSecondaryColor }]}>
                  {user.email}
                </Text>
                <Text style={[styles.userId, { color: textSecondaryColor }]}>
                  ID: {user.id.substring(0, 8)}...
                </Text>
              </View>
            </View>

            <View style={styles.infoSection}>
              <View style={[styles.infoBox, { backgroundColor: isDark ? '#1a3a2a' : '#e8f5e9' }]}>
                <IconSymbol 
                  ios_icon_name="checkmark.circle.fill" 
                  android_material_icon_name="check_circle" 
                  size={28} 
                  color={colors.primary} 
                />
                <View style={styles.infoTextContainer}>
                  <Text style={[styles.infoTitle, { color: textColor }]}>
                    Dine data gemmes sikkert
                  </Text>
                  <Text style={[styles.infoText, { color: textSecondaryColor }]}>
                    Alle dine aktiviteter, opgaver og kalendere synkroniseres automatisk til skyen.
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.signOutButton, { backgroundColor: colors.error }]}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <IconSymbol 
                ios_icon_name="arrow.right.square" 
                android_material_icon_name="logout" 
                size={24} 
                color="#fff" 
              />
              <Text style={styles.signOutButtonText}>Log ud</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Login/Sign up view
          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            <View style={styles.authToggle}>
              <TouchableOpacity
                style={[
                  styles.authToggleButton,
                  !isSignUp && [styles.authToggleButtonActive, { backgroundColor: colors.primary }]
                ]}
                onPress={() => setIsSignUp(false)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.authToggleText,
                  !isSignUp && styles.authToggleTextActive
                ]}>
                  Log ind
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.authToggleButton,
                  isSignUp && [styles.authToggleButtonActive, { backgroundColor: colors.primary }]
                ]}
                onPress={() => setIsSignUp(true)}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.authToggleText,
                  isSignUp && styles.authToggleTextActive
                ]}>
                  Opret konto
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.form}>
              <Text style={[styles.label, { color: textColor }]}>Email</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={email}
                onChangeText={setEmail}
                placeholder="din@email.dk"
                placeholderTextColor={textSecondaryColor}
                autoCapitalize="none"
                keyboardType="email-address"
                editable={!loading}
                autoCorrect={false}
              />

              <Text style={[styles.label, { color: textColor }]}>Adgangskode</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={password}
                onChangeText={setPassword}
                placeholder="Mindst 6 tegn"
                placeholderTextColor={textSecondaryColor}
                secureTextEntry
                editable={!loading}
                autoCorrect={false}
                autoCapitalize="none"
              />

              <TouchableOpacity
                style={[
                  styles.authButton,
                  { backgroundColor: colors.primary },
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

            <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd', marginTop: 24 }]}>
              <IconSymbol 
                ios_icon_name="info.circle" 
                android_material_icon_name="info" 
                size={28} 
                color={colors.secondary} 
              />
              <View style={styles.infoTextContainer}>
                <Text style={[styles.infoTitle, { color: textColor }]}>
                  {isSignUp ? 'Opret din konto' : 'Hvorfor skal jeg logge ind?'}
                </Text>
                <Text style={[styles.infoText, { color: textSecondaryColor }]}>
                  {isSignUp 
                    ? 'Efter du opretter din konto, vil du modtage en bekræftelsesmail. Du skal klikke på linket i emailen før du kan logge ind.\n\nTjek også din spam-mappe hvis du ikke modtager emailen.'
                    : 'For at gemme eksterne kalendere og synkronisere dine data på tværs af enheder, skal du oprette en gratis konto.\n\nDine data gemmes sikkert i Supabase og er kun tilgængelige for dig.'
                  }
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Bottom Padding for Tab Bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 60 : 70,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 16,
  },
  card: {
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    marginBottom: 4,
  },
  userId: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
  infoSection: {
    marginBottom: 24,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 16,
    padding: 20,
    borderRadius: 16,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 15,
    lineHeight: 22,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    borderRadius: 14,
  },
  signOutButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  authToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 32,
  },
  authToggleButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.highlight,
  },
  authToggleButtonActive: {},
  authToggleText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  authToggleTextActive: {
    color: '#fff',
  },
  form: {
    gap: 8,
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
    marginBottom: 12,
  },
  authButton: {
    paddingVertical: 18,
    borderRadius: 14,
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
});
