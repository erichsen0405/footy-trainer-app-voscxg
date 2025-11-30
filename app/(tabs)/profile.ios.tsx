
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { GlassView } from 'expo-glass-effect';
import { useTheme } from '@react-navigation/native';
import { supabase } from '@/app/integrations/supabase/client';
import CreatePlayerModal from '@/components/CreatePlayerModal';
import PlayersList from '@/components/PlayersList';

interface UserProfile {
  full_name: string;
  phone_number: string;
}

interface AdminInfo {
  full_name: string;
  phone_number: string;
  email: string;
}

export default function ProfileScreen() {
  const theme = useTheme();
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<'admin' | 'player' | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [playersRefreshTrigger, setPlayersRefreshTrigger] = useState(0);
  
  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');

  useEffect(() => {
    // Check current user
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user);
      setUser(user);
      
      if (user) {
        await fetchUserRole(user.id);
        await fetchUserProfile(user.id);
      }
    };
    checkUser();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('Auth state changed:', _event, session?.user);
      setUser(session?.user || null);
      
      if (session?.user) {
        await fetchUserRole(session.user.id);
        await fetchUserProfile(session.user.id);
      } else {
        setUserRole(null);
        setProfile(null);
        setAdminInfo(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching user role:', error);
        // Default to admin if no role is set
        setUserRole('admin');
        return;
      }

      setUserRole(data?.role as 'admin' | 'player');
      
      // If player, fetch admin info
      if (data?.role === 'player') {
        await fetchAdminInfo(userId);
      }
    } catch (error) {
      console.error('Error in fetchUserRole:', error);
      setUserRole('admin');
    }
  };

  const fetchUserProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('full_name, phone_number')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
        return;
      }

      if (data) {
        setProfile(data);
        setEditName(data.full_name || '');
        setEditPhone(data.phone_number || '');
      }
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
    }
  };

  const fetchAdminInfo = async (playerId: string) => {
    try {
      // Get admin relationship
      const { data: relationship, error: relError } = await supabase
        .from('admin_player_relationships')
        .select('admin_id')
        .eq('player_id', playerId)
        .single();

      if (relError || !relationship) {
        console.error('Error fetching admin relationship:', relError);
        return;
      }

      // Get admin profile
      const { data: adminProfile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, phone_number')
        .eq('user_id', relationship.admin_id)
        .single();

      if (profileError) {
        console.error('Error fetching admin profile:', profileError);
      }

      // We can't directly get the email from auth.users, so we'll show what we have
      setAdminInfo({
        full_name: adminProfile?.full_name || 'Din træner',
        phone_number: adminProfile?.phone_number || '',
        email: '', // Email not available through RLS
      });
    } catch (error) {
      console.error('Error in fetchAdminInfo:', error);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      setLoading(true);

      const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (existingProfile) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: editName,
            phone_number: editPhone,
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            full_name: editName,
            phone_number: editPhone,
          });

        if (error) throw error;
      }

      await fetchUserProfile(user.id);
      setIsEditingProfile(false);
      Alert.alert('Succes', 'Din profil er opdateret');
    } catch (error: any) {
      console.error('Error saving profile:', error);
      Alert.alert('Fejl', 'Kunne ikke gemme profil');
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Fejl', 'Udfyld venligst både email og adgangskode');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      Alert.alert('Fejl', 'Indtast venligst en gyldig email-adresse');
      return;
    }

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
          Alert.alert(
            'Kunne ikke oprette konto',
            error.message || 'Der opstod en fejl. Prøv venligst igen.'
          );
          return;
        }

        // Set default role as admin for self-signup
        if (data.user) {
          await supabase.from('user_roles').insert({
            user_id: data.user.id,
            role: 'admin',
          });
        }

        setShowSuccessMessage(true);
        setEmail('');
        setPassword('');

        setTimeout(() => {
          setShowSuccessMessage(false);
          setIsSignUp(false);
        }, 3000);

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
              <IconSymbol 
                ios_icon_name="person.circle.fill" 
                android_material_icon_name="person" 
                size={80} 
                color={theme.colors.primary} 
              />
              <Text style={[styles.name, { color: theme.colors.text }]}>
                {profile?.full_name || user.email?.split('@')[0] || 'Bruger'}
              </Text>
              <Text style={[styles.email, { color: theme.dark ? '#98989D' : '#666' }]}>
                {user.email}
              </Text>
              {userRole && (
                <View style={[styles.roleBadge, { 
                  backgroundColor: userRole === 'admin' ? theme.colors.primary : '#FF9500' 
                }]}>
                  <Text style={styles.roleText}>
                    {userRole === 'admin' ? 'Admin/Træner' : 'Spiller'}
                  </Text>
                </View>
              )}
            </GlassView>

            {/* Profile Info Section */}
            <GlassView style={styles.section} glassEffectStyle="regular">
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Profil Information
                </Text>
                {!isEditingProfile && (
                  <TouchableOpacity onPress={() => setIsEditingProfile(true)}>
                    <IconSymbol
                      ios_icon_name="pencil"
                      android_material_icon_name="edit"
                      size={20}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {isEditingProfile ? (
                <View style={styles.editForm}>
                  <Text style={[styles.label, { color: theme.colors.text }]}>Navn</Text>
                  <TextInput
                    style={[styles.input, { 
                      backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      color: theme.colors.text 
                    }]}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Dit navn"
                    placeholderTextColor={theme.dark ? '#98989D' : '#666'}
                  />

                  <Text style={[styles.label, { color: theme.colors.text }]}>Telefon</Text>
                  <TextInput
                    style={[styles.input, { 
                      backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)',
                      color: theme.colors.text 
                    }]}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="+45 12 34 56 78"
                    placeholderTextColor={theme.dark ? '#98989D' : '#666'}
                    keyboardType="phone-pad"
                  />

                  <View style={styles.editButtons}>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: theme.dark ? '#3a3a3c' : '#e5e5e5' }]}
                      onPress={() => {
                        setIsEditingProfile(false);
                        setEditName(profile?.full_name || '');
                        setEditPhone(profile?.phone_number || '');
                      }}
                    >
                      <Text style={[styles.buttonText, { color: theme.colors.text }]}>Annuller</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: theme.colors.primary }]}
                      onPress={handleSaveProfile}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={[styles.buttonText, { color: '#fff' }]}>Gem</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.profileInfo}>
                  {profile?.full_name && (
                    <View style={styles.infoRow}>
                      <IconSymbol
                        ios_icon_name="person.fill"
                        android_material_icon_name="person"
                        size={20}
                        color={theme.colors.primary}
                      />
                      <Text style={[styles.infoText, { color: theme.colors.text }]}>
                        {profile.full_name}
                      </Text>
                    </View>
                  )}
                  {profile?.phone_number && (
                    <View style={styles.infoRow}>
                      <IconSymbol
                        ios_icon_name="phone.fill"
                        android_material_icon_name="phone"
                        size={20}
                        color={theme.colors.primary}
                      />
                      <Text style={[styles.infoText, { color: theme.colors.text }]}>
                        {profile.phone_number}
                      </Text>
                    </View>
                  )}
                  {!profile?.full_name && !profile?.phone_number && (
                    <Text style={[styles.emptyText, { color: theme.dark ? '#98989D' : '#666' }]}>
                      Ingen profilinformation tilgængelig. Tryk på rediger for at tilføje.
                    </Text>
                  )}
                </View>
              )}
            </GlassView>

            {/* Admin Info for Players */}
            {userRole === 'player' && adminInfo && (
              <GlassView style={styles.section} glassEffectStyle="regular">
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Din Træner
                </Text>
                <View style={styles.profileInfo}>
                  <View style={styles.infoRow}>
                    <IconSymbol
                      ios_icon_name="person.fill"
                      android_material_icon_name="person"
                      size={20}
                      color={theme.colors.primary}
                    />
                    <Text style={[styles.infoText, { color: theme.colors.text }]}>
                      {adminInfo.full_name}
                    </Text>
                  </View>
                  {adminInfo.phone_number && (
                    <View style={styles.infoRow}>
                      <IconSymbol
                        ios_icon_name="phone.fill"
                        android_material_icon_name="phone"
                        size={20}
                        color={theme.colors.primary}
                      />
                      <Text style={[styles.infoText, { color: theme.colors.text }]}>
                        {adminInfo.phone_number}
                      </Text>
                    </View>
                  )}
                </View>
              </GlassView>
            )}

            {/* Player Management Section for Admins */}
            {userRole === 'admin' && (
              <GlassView style={styles.playerManagementSection} glassEffectStyle="regular">
                <View style={styles.playerManagementHeader}>
                  <IconSymbol 
                    ios_icon_name="person.2.fill" 
                    android_material_icon_name="group" 
                    size={28} 
                    color={theme.colors.primary} 
                  />
                  <View style={styles.playerManagementTitleContainer}>
                    <Text style={[styles.playerManagementTitle, { color: theme.colors.text }]}>
                      Spillerstyring
                    </Text>
                    <Text style={[styles.playerManagementSubtitle, { color: theme.dark ? '#98989D' : '#666' }]}>
                      Administrer dine spillerprofiler
                    </Text>
                  </View>
                </View>

                {/* Players List */}
                <PlayersList 
                  onCreatePlayer={() => setShowCreatePlayerModal(true)}
                  refreshTrigger={playersRefreshTrigger}
                />
              </GlassView>
            )}

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
                  <Text style={[styles.infoBoxText, { color: theme.dark ? '#98989D' : '#666' }]}>
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

      <CreatePlayerModal
        visible={showCreatePlayerModal}
        onClose={() => setShowCreatePlayerModal(false)}
        onPlayerCreated={() => {
          setPlayersRefreshTrigger(prev => prev + 1);
        }}
      />
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
    paddingBottom: 100,
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
  roleBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 8,
  },
  roleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  profileInfo: {
    gap: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoText: {
    fontSize: 16,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  editForm: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    marginTop: 8,
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  editButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  playerManagementSection: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  playerManagementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  playerManagementTitleContainer: {
    flex: 1,
  },
  playerManagementTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  playerManagementSubtitle: {
    fontSize: 15,
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
  infoBoxText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
