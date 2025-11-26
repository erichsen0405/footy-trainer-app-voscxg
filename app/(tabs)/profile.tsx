
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, useColorScheme, Alert, Platform } from 'react-native';
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
      setUser(user);
    };
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Fejl', 'Udfyld venligst både email og adgangskode');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: 'https://natively.dev/email-confirmed'
          }
        });

        if (error) throw error;

        Alert.alert(
          'Bekræft din email',
          'Vi har sendt en bekræftelsesmail til dig. Tjek venligst din indbakke og klik på linket for at aktivere din konto.',
          [{ text: 'OK' }]
        );
        setEmail('');
        setPassword('');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        Alert.alert('Succes', 'Du er nu logget ind!');
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en fejl');
    } finally {
      setLoading(false);
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
              />

              <Text style={[styles.label, { color: textColor }]}>Adgangskode</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={textSecondaryColor}
                secureTextEntry
                editable={!loading}
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
                <Text style={styles.authButtonText}>
                  {loading ? 'Vent venligst...' : (isSignUp ? 'Opret konto' : 'Log ind')}
                </Text>
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
                  Hvorfor skal jeg logge ind?
                </Text>
                <Text style={[styles.infoText, { color: textSecondaryColor }]}>
                  For at gemme eksterne kalendere og synkronisere dine data på tværs af enheder, skal du oprette en gratis konto.
                  {'\n\n'}
                  Dine data gemmes sikkert i Supabase og er kun tilgængelige for dig.
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
});
