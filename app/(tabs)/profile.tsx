
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, useColorScheme, Alert, Platform, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
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
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  useEffect(() => {
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
        setUserRole('admin');
        return;
      }

      setUserRole(data?.role as 'admin' | 'player');
      
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
      const { data: relationship, error: relError } = await supabase
        .from('admin_player_relationships')
        .select('admin_id')
        .eq('player_id', playerId)
        .single();

      if (relError || !relationship) {
        console.error('Error fetching admin relationship:', relError);
        return;
      }

      const { data: adminProfile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, phone_number')
        .eq('user_id', relationship.admin_id)
        .single();

      if (profileError) {
        console.error('Error fetching admin profile:', profileError);
      }

      setAdminInfo({
        full_name: adminProfile?.full_name || 'Din træner',
        phone_number: adminProfile?.phone_number || '',
        email: '',
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
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: editName,
            phone_number: editPhone,
          })
          .eq('user_id', user.id);

        if (error) throw error;
      } else {
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
          <>
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
                    {profile?.full_name || user.email?.split('@')[0] || 'Bruger'}
                  </Text>
                  <Text style={[styles.userEmail, { color: textSecondaryColor }]}>
                    {user.email}
                  </Text>
                  {userRole && (
                    <View style={[styles.roleBadge, { 
                      backgroundColor: userRole === 'admin' ? colors.primary : '#FF9500' 
                    }]}>
                      <Text style={styles.roleText}>
                        {userRole === 'admin' ? 'Admin/Træner' : 'Spiller'}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Profile Info Section */}
            <View style={[styles.card, { backgroundColor: cardBgColor }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>
                  Profil Information
                </Text>
                {!isEditingProfile && (
                  <TouchableOpacity onPress={() => setIsEditingProfile(true)}>
                    <IconSymbol
                      ios_icon_name="pencil"
                      android_material_icon_name="edit"
                      size={20}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {isEditingProfile ? (
                <View style={styles.editForm}>
                  <Text style={[styles.label, { color: textColor }]}>Navn</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="Dit navn"
                    placeholderTextColor={textSecondaryColor}
                  />

                  <Text style={[styles.label, { color: textColor }]}>Telefon</Text>
                  <TextInput
                    style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                    value={editPhone}
                    onChangeText={setEditPhone}
                    placeholder="+45 12 34 56 78"
                    placeholderTextColor={textSecondaryColor}
                    keyboardType="phone-pad"
                  />

                  <View style={styles.editButtons}>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: colors.highlight }]}
                      onPress={() => {
                        setIsEditingProfile(false);
                        setEditName(profile?.full_name || '');
                        setEditPhone(profile?.phone_number || '');
                      }}
                    >
                      <Text style={[styles.buttonText, { color: textColor }]}>Annuller</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.button, { backgroundColor: colors.primary }]}
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
                        color={colors.primary}
                      />
                      <Text style={[styles.infoText, { color: textColor }]}>
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
                        color={colors.primary}
                      />
                      <Text style={[styles.infoText, { color: textColor }]}>
                        {profile.phone_number}
                      </Text>
                    </View>
                  )}
                  {!profile?.full_name && !profile?.phone_number && (
                    <Text style={[styles.emptyText, { color: textSecondaryColor }]}>
                      Ingen profilinformation tilgængelig. Tryk på rediger for at tilføje.
                    </Text>
                  )}
                </View>
              )}
            </View>

            {/* Admin Info for Players */}
            {userRole === 'player' && adminInfo && (
              <View style={[styles.card, { backgroundColor: cardBgColor }]}>
                <Text style={[styles.sectionTitle, { color: textColor }]}>
                  Din Træner
                </Text>
                <View style={styles.profileInfo}>
                  <View style={styles.infoRow}>
                    <IconSymbol
                      ios_icon_name="person.fill"
                      android_material_icon_name="person"
                      size={20}
                      color={colors.primary}
                    />
                    <Text style={[styles.infoText, { color: textColor }]}>
                      {adminInfo.full_name}
                    </Text>
                  </View>
                  {adminInfo.phone_number && (
                    <View style={styles.infoRow}>
                      <IconSymbol
                        ios_icon_name="phone.fill"
                        android_material_icon_name="phone"
                        size={20}
                        color={colors.primary}
                      />
                      <Text style={[styles.infoText, { color: textColor }]}>
                        {adminInfo.phone_number}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            {/* Player Management Section for Admins */}
            {userRole === 'admin' && (
              <View style={[styles.playerManagementSection, { backgroundColor: cardBgColor }]}>
                <View style={styles.playerManagementHeader}>
                  <View style={styles.playerManagementHeaderLeft}>
                    <IconSymbol 
                      ios_icon_name="person.2.fill" 
                      android_material_icon_name="group" 
                      size={28} 
                      color={colors.primary} 
                    />
                    <View style={styles.playerManagementTitleContainer}>
                      <Text style={[styles.playerManagementTitle, { color: textColor }]}>Spillerstyring</Text>
                      <Text style={[styles.playerManagementSubtitle, { color: textSecondaryColor }]}>
                        Administrer dine spillerprofiler
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Players List */}
                <PlayersList 
                  onCreatePlayer={() => setShowCreatePlayerModal(true)}
                  refreshTrigger={playersRefreshTrigger}
                />
              </View>
            )}

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
          </>
        ) : (
          // Login/Sign up view
          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            {showSuccessMessage && (
              <View style={[styles.successMessage, { backgroundColor: colors.primary }]}>
                <IconSymbol 
                  ios_icon_name="checkmark.circle.fill" 
                  android_material_icon_name="check_circle" 
                  size={48} 
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
                    <Text style={[styles.infoBoxText, { color: textSecondaryColor }]}>
                      {isSignUp 
                        ? 'Efter du opretter din konto, vil du modtage en bekræftelsesmail. Du skal klikke på linket i emailen før du kan logge ind.\n\nTjek også din spam-mappe hvis du ikke modtager emailen.'
                        : 'For at gemme eksterne kalendere og synkronisere dine data på tværs af enheder, skal du oprette en gratis konto.\n\nDine data gemmes sikkert i Supabase og er kun tilgængelige for dig.'
                      }
                    </Text>
                  </View>
                </View>
              </>
            )}
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <CreatePlayerModal
        visible={showCreatePlayerModal}
        onClose={() => setShowCreatePlayerModal(false)}
        onPlayerCreated={() => {
          setPlayersRefreshTrigger(prev => prev + 1);
        }}
      />
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
    marginBottom: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
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
    marginBottom: 8,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
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
  editButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  playerManagementSection: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  playerManagementHeader: {
    marginBottom: 16,
  },
  playerManagementHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 18,
    borderRadius: 14,
    marginHorizontal: 20,
    marginTop: 8,
  },
  signOutButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  successMessage: {
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
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
  infoBoxText: {
    fontSize: 15,
    lineHeight: 22,
  },
});
