
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/IconSymbol';
import { GlassView } from 'expo-glass-effect';
import { useTheme } from '@react-navigation/native';
import { supabase } from '@/app/integrations/supabase/client';
import CreatePlayerModal from '@/components/CreatePlayerModal';
import PlayersList from '@/components/PlayersList';
import TeamManagement from '@/components/TeamManagement';
import ExternalCalendarManager from '@/components/ExternalCalendarManager';
import SubscriptionManager from '@/components/SubscriptionManager';
import { useSubscription } from '@/contexts/SubscriptionContext';

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
  const [userRole, setUserRole] = useState<'admin' | 'trainer' | 'player' | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [playersRefreshTrigger, setPlayersRefreshTrigger] = useState(0);
  
  // New onboarding flow states
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);
  const [needsSubscription, setNeedsSubscription] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'player' | 'trainer' | null>(null);
  
  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  
  // Debug state
  const [debugInfo, setDebugInfo] = useState<string[]>([]);

  // Get subscription status
  const { subscriptionStatus, refreshSubscription } = useSubscription();

  const addDebugInfo = (message: string) => {
    console.log('[PROFILE DEBUG]', message);
    setDebugInfo(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]} - ${message}`]);
  };

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Current user:', user);
      setUser(user);
      
      if (user) {
        await checkUserOnboarding(user.id);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('Auth state changed:', _event, session?.user);
      setUser(session?.user || null);
      
      if (session?.user) {
        await checkUserOnboarding(session.user.id);
      } else {
        setUserRole(null);
        setProfile(null);
        setAdminInfo(null);
        setNeedsRoleSelection(false);
        setNeedsSubscription(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserOnboarding = async (userId: string) => {
    addDebugInfo('Checking user onboarding status...');
    
    // Check if user has a role
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (roleError || !roleData) {
      addDebugInfo('No role found - needs role selection');
      setNeedsRoleSelection(true);
      setNeedsSubscription(false);
      return;
    }

    const role = roleData.role as 'admin' | 'trainer' | 'player';
    setUserRole(role);
    addDebugInfo(`Role found: ${role}`);

    // If role is trainer or admin, check if they have a subscription
    if (role === 'trainer' || role === 'admin') {
      const { data: subData, error: subError } = await supabase
        .from('subscriptions')
        .select('id, status')
        .eq('admin_id', userId)
        .single();

      if (subError || !subData) {
        addDebugInfo('No subscription found - needs subscription');
        setNeedsRoleSelection(false);
        setNeedsSubscription(true);
        return;
      }

      addDebugInfo(`Subscription found: ${subData.status}`);
      // Refresh subscription status
      await refreshSubscription();
    }

    // User is fully onboarded
    setNeedsRoleSelection(false);
    setNeedsSubscription(false);
    await fetchUserProfile(userId);
    
    if (role === 'player') {
      await fetchAdminInfo(userId);
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
        .maybeSingle();

      // If no relationship exists yet (player hasn't been added by a trainer), just return
      if (relError && relError.code !== 'PGRST116') {
        console.error('Error fetching admin relationship:', relError);
        return;
      }

      if (!relationship) {
        console.log('No admin relationship found yet - player has not been added by a trainer');
        setAdminInfo(null);
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

  const handleSignup = async () => {
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
    setDebugInfo([]);
    addDebugInfo('Starting signup process...');
    
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'natively://auth-callback'
        }
      });

      if (error) {
        addDebugInfo(`❌ Signup error: ${error.message}`);
        console.error('Sign up error:', error);
        Alert.alert(
          'Kunne ikke oprette konto',
          error.message || 'Der opstod en fejl. Prøv venligst igen.'
        );
        return;
      }

      if (!data.user) {
        addDebugInfo('❌ No user returned from signup');
        Alert.alert('Fejl', 'Kunne ikke oprette bruger. Prøv venligst igen.');
        return;
      }

      addDebugInfo(`✅ User created: ${data.user.id}`);
      addDebugInfo(`Session exists: ${data.session ? 'Yes - Auto logged in!' : 'No - Email confirmation required'}`);

      setEmail('');
      setPassword('');

      // Check if user is automatically logged in
      if (data.session) {
        // User is logged in immediately - show success and they'll be prompted for role
        addDebugInfo('✅ User logged in automatically - will show role selection');
        Alert.alert(
          'Velkommen! 🎉', 
          `Din konto er oprettet og du er nu logget ind!\n\nVi har sendt en bekræftelsesmail til ${email}. Bekræft venligst din email når du får tid.\n\nNu skal du vælge din rolle for at fortsætte.`,
          [{ text: 'OK' }]
        );
      } else {
        // Email confirmation required before login
        addDebugInfo('📧 Email confirmation required before login');
        setShowSuccessMessage(true);
        
        setTimeout(() => {
          setShowSuccessMessage(false);
          setIsSignUp(false);
        }, 5000);

        Alert.alert(
          'Bekræft din email ✉️',
          `Din konto er oprettet!\n\nVi har sendt en bekræftelsesmail til ${email}.\n\nTjek venligst din indbakke og klik på linket for at bekræfte din email. Derefter kan du logge ind.\n\n⚠️ Bemærk: Tjek også din spam-mappe hvis du ikke kan finde emailen.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      addDebugInfo(`❌ Unexpected error: ${error.message}`);
      console.error('Signup error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en uventet fejl. Prøv venligst igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Fejl', 'Udfyld venligst både email og adgangskode');
      return;
    }

    setLoading(true);
    console.log('Attempting to sign in with:', email);
    
    try {
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
        setEmail('');
        setPassword('');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en uventet fejl. Prøv venligst igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleSelection = async (role: 'player' | 'trainer') => {
    if (!user) return;

    setLoading(true);
    addDebugInfo(`Setting role to: ${role}`);

    try {
      // Insert role into user_roles table
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: role
        });

      if (roleError) {
        addDebugInfo(`❌ Error setting role: ${roleError.message}`);
        Alert.alert('Fejl', 'Kunne ikke gemme rolle. Prøv venligst igen.');
        return;
      }

      addDebugInfo(`✅ Role set successfully`);
      setSelectedRole(role);
      setUserRole(role);
      setNeedsRoleSelection(false);

      // If trainer, show subscription selection
      if (role === 'trainer') {
        setNeedsSubscription(true);
        Alert.alert(
          'Vælg abonnement',
          'Som træner skal du vælge et abonnement for at kunne administrere spillere.',
          [{ text: 'OK' }]
        );
      } else {
        // Player doesn't need subscription
        Alert.alert(
          'Velkommen! 🎉',
          'Din konto er nu klar til brug!',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      addDebugInfo(`❌ Unexpected error: ${error.message}`);
      Alert.alert('Fejl', error.message || 'Der opstod en fejl. Prøv venligst igen.');
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteSubscription = async (planId: string) => {
    if (!user) return;

    setLoading(true);
    addDebugInfo(`Creating subscription with plan: ${planId}`);

    try {
      // Call the create-subscription edge function
      const { data, error } = await supabase.functions.invoke('create-subscription', {
        body: { planId }
      });

      if (error) {
        addDebugInfo(`❌ Error creating subscription: ${error.message}`);
        Alert.alert('Fejl', 'Kunne ikke oprette abonnement. Prøv venligst igen.');
        return;
      }

      addDebugInfo(`✅ Subscription created successfully`);
      setNeedsSubscription(false);
      
      // Refresh subscription status
      await refreshSubscription();
      
      Alert.alert(
        'Velkommen! 🎉',
        'Dit abonnement er aktiveret med 14 dages gratis prøveperiode. Du kan nu oprette spillere og hold!',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      addDebugInfo(`❌ Unexpected error: ${error.message}`);
      Alert.alert('Fejl', error.message || 'Der opstod en fejl. Prøv venligst igen.');
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

  const getPlanColor = (planName: string | null) => {
    if (!planName) return theme.colors.primary;
    
    const lowerName = planName.toLowerCase();
    if (lowerName.includes('bronze') || lowerName.includes('basic')) {
      return '#CD7F32'; // Bronze
    } else if (lowerName.includes('silver') || lowerName.includes('standard')) {
      return '#C0C0C0'; // Silver
    } else if (lowerName.includes('gold') || lowerName.includes('premium')) {
      return '#FFD700'; // Gold
    }
    return theme.colors.primary;
  };

  // Show role selection if user is logged in but has no role
  if (user && needsRoleSelection) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={[styles.title, { color: theme.colors.text }]}>Vælg din rolle</Text>
          <Text style={[styles.subtitle, { color: theme.dark ? '#98989D' : '#666' }]}>
            Vælg om du er spiller eller træner for at fortsætte
          </Text>

          <GlassView style={styles.onboardingCard} glassEffectStyle="regular">
            <Text style={[styles.onboardingTitle, { color: theme.colors.text }]}>
              Velkommen til din nye konto! 🎉
            </Text>
            <Text style={[styles.onboardingDescription, { color: theme.dark ? '#98989D' : '#666' }]}>
              For at komme i gang skal du vælge din rolle. Dette hjælper os med at tilpasse oplevelsen til dig.
            </Text>

            <TouchableOpacity
              style={[styles.roleCard, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
              onPress={() => handleRoleSelection('player')}
              disabled={loading}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="figure.run"
                android_material_icon_name="directions_run"
                size={48}
                color={theme.colors.primary}
              />
              <Text style={[styles.roleTitle, { color: theme.colors.text }]}>Spiller</Text>
              <Text style={[styles.roleDescription, { color: theme.dark ? '#98989D' : '#666' }]}>
                Jeg er en spiller og vil holde styr på min træning
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleCard, { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}
              onPress={() => handleRoleSelection('trainer')}
              disabled={loading}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="person.3.fill"
                android_material_icon_name="group"
                size={48}
                color={theme.colors.primary}
              />
              <Text style={[styles.roleTitle, { color: theme.colors.text }]}>Træner</Text>
              <Text style={[styles.roleDescription, { color: theme.dark ? '#98989D' : '#666' }]}>
                Jeg er træner og vil administrere spillere og hold
              </Text>
            </TouchableOpacity>

            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={[styles.loadingText, { color: theme.colors.text }]}>
                  Gemmer din rolle...
                </Text>
              </View>
            )}
          </GlassView>

          {/* Debug Info */}
          {debugInfo.length > 0 && (
            <GlassView style={[styles.debugCard, { marginTop: 20 }]} glassEffectStyle="regular">
              <Text style={[styles.debugTitle, { color: theme.colors.text }]}>📋 Debug Log:</Text>
              <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                {debugInfo.map((info, index) => (
                  <Text key={index} style={[styles.debugText, { color: theme.dark ? '#98989D' : '#666' }]}>
                    {info}
                  </Text>
                ))}
              </ScrollView>
            </GlassView>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Show subscription selection if user is trainer but has no subscription
  if (user && needsSubscription) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.colors.background }]} edges={['top']}>
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.contentContainer}
        >
          <Text style={[styles.title, { color: theme.colors.text }]}>Vælg dit abonnement</Text>
          <Text style={[styles.subtitle, { color: theme.dark ? '#98989D' : '#666' }]}>
            Som træner skal du vælge et abonnement for at administrere spillere
          </Text>

          <GlassView style={styles.subscriptionCard} glassEffectStyle="regular">
            <SubscriptionManager 
              onPlanSelected={handleCompleteSubscription}
              isSignupFlow={true}
              selectedRole="trainer"
            />
          </GlassView>

          {/* Debug Info */}
          {debugInfo.length > 0 && (
            <GlassView style={[styles.debugCard, { marginTop: 20 }]} glassEffectStyle="regular">
              <Text style={[styles.debugTitle, { color: theme.colors.text }]}>📋 Debug Log:</Text>
              <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                {debugInfo.map((info, index) => (
                  <Text key={index} style={[styles.debugText, { color: theme.dark ? '#98989D' : '#666' }]}>
                    {info}
                  </Text>
                ))}
              </ScrollView>
            </GlassView>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

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
              <View style={styles.avatarContainer}>
                <View style={[styles.avatar, { 
                  backgroundColor: subscriptionStatus?.hasSubscription 
                    ? getPlanColor(subscriptionStatus.planName)
                    : theme.colors.primary 
                }]}>
                  <IconSymbol 
                    ios_icon_name="person.circle.fill" 
                    android_material_icon_name="person" 
                    size={80} 
                    color="#fff" 
                  />
                </View>
                {subscriptionStatus?.hasSubscription && (
                  <View style={[styles.subscriptionBadge, { 
                    backgroundColor: getPlanColor(subscriptionStatus.planName) 
                  }]}>
                    <IconSymbol
                      ios_icon_name="star.fill"
                      android_material_icon_name="star"
                      size={16}
                      color="#fff"
                    />
                  </View>
                )}
              </View>
              <Text style={[styles.name, { color: theme.colors.text }]}>
                {profile?.full_name || user.email?.split('@')[0] || 'Bruger'}
              </Text>
              <Text style={[styles.email, { color: theme.dark ? '#98989D' : '#666' }]}>
                {user.email}
              </Text>
              {/* Only show subscription badge, not role badge */}
              {subscriptionStatus?.hasSubscription && (
                <View style={styles.badgesRow}>
                  <View style={[styles.planBadge, { 
                    backgroundColor: getPlanColor(subscriptionStatus.planName) 
                  }]}>
                    <IconSymbol
                      ios_icon_name="star.fill"
                      android_material_icon_name="star"
                      size={12}
                      color="#fff"
                    />
                    <Text style={styles.planBadgeText}>
                      {subscriptionStatus.planName}
                    </Text>
                  </View>
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

            {/* Calendar Sync Section */}
            <GlassView style={styles.section} glassEffectStyle="regular">
              <View style={styles.sectionHeader}>
                <IconSymbol
                  ios_icon_name="calendar.badge.plus"
                  android_material_icon_name="event"
                  size={28}
                  color={theme.colors.primary}
                />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Kalender Synkronisering
                </Text>
              </View>
              <Text style={[styles.sectionDescription, { color: theme.dark ? '#98989D' : '#666' }]}>
                Tilknyt eksterne kalendere (iCal/webcal) for automatisk at importere aktiviteter
              </Text>
              <ExternalCalendarManager />
            </GlassView>

            {/* Subscription Section */}
            <GlassView style={styles.section} glassEffectStyle="regular">
              <View style={styles.sectionHeader}>
                <IconSymbol
                  ios_icon_name="creditcard.fill"
                  android_material_icon_name="payment"
                  size={28}
                  color={theme.colors.primary}
                />
                <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>
                  Abonnement
                </Text>
              </View>
              <Text style={[styles.sectionDescription, { color: theme.dark ? '#98989D' : '#666' }]}>
                Administrer dit abonnement
              </Text>
              <SubscriptionManager />
            </GlassView>

            {/* Player Management Section for Trainers */}
            {(userRole === 'admin' || userRole === 'trainer') && (
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

                <PlayersList 
                  onCreatePlayer={() => setShowCreatePlayerModal(true)}
                  refreshTrigger={playersRefreshTrigger}
                />
              </GlassView>
            )}

            {/* Team Management Section for Trainers */}
            {(userRole === 'admin' || userRole === 'trainer') && (
              <GlassView style={styles.teamManagementSection} glassEffectStyle="regular">
                <View style={styles.teamManagementHeader}>
                  <IconSymbol 
                    ios_icon_name="person.3.fill" 
                    android_material_icon_name="groups" 
                    size={28} 
                    color={theme.colors.primary} 
                  />
                  <View style={styles.teamManagementTitleContainer}>
                    <Text style={[styles.teamManagementTitle, { color: theme.colors.text }]}>
                      Teamstyring
                    </Text>
                    <Text style={[styles.teamManagementSubtitle, { color: theme.dark ? '#98989D' : '#666' }]}>
                      Opret og administrer teams
                    </Text>
                  </View>
                </View>

                <TeamManagement />
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
                  Tjek din email for at bekræfte din konto, og log derefter ind.
                </Text>
                
                {/* Debug Info */}
                {debugInfo.length > 0 && (
                  <View style={styles.debugContainer}>
                    <Text style={styles.debugTitle}>📋 Debug Log:</Text>
                    {debugInfo.map((info, index) => (
                      <Text key={index} style={styles.debugText}>{info}</Text>
                    ))}
                  </View>
                )}
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
                    onPress={() => {
                      setIsSignUp(false);
                      setDebugInfo([]);
                    }}
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
                    onPress={() => {
                      setIsSignUp(true);
                      setDebugInfo([]);
                    }}
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
                    onPress={isSignUp ? handleSignup : handleLogin}
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
                      ? 'Efter du opretter din konto, bliver du automatisk logget ind og kan begynde at bruge appen med det samme. Du vil modtage en bekræftelsesmail som du kan bekræfte når du har tid.\n\nDu vil blive bedt om at vælge din rolle (spiller eller træner) og derefter vælge et abonnement hvis du er træner.'
                      : 'Log ind for at gemme dine data sikkert i skyen.'
                    }
                  </Text>
                </View>
                
                {/* Debug Info during signup */}
                {debugInfo.length > 0 && (
                  <View style={styles.debugContainer}>
                    <Text style={[styles.debugTitle, { color: theme.colors.text }]}>📋 Debug Log:</Text>
                    <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                      {debugInfo.map((info, index) => (
                        <Text key={index} style={[styles.debugText, { color: theme.dark ? '#98989D' : '#666' }]}>{info}</Text>
                      ))}
                    </ScrollView>
                  </View>
                )}
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
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  email: {
    fontSize: 16,
  },
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 8,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  planBadgeText: {
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
  sectionDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
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
  teamManagementSection: {
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  teamManagementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  teamManagementTitleContainer: {
    flex: 1,
  },
  teamManagementTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  teamManagementSubtitle: {
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
  subtitle: {
    fontSize: 16,
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
  debugContainer: {
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#fff',
  },
  debugScroll: {
    maxHeight: 200,
  },
  debugText: {
    fontSize: 12,
    fontFamily: 'Courier',
    marginBottom: 4,
    color: '#fff',
    opacity: 0.9,
  },
  onboardingCard: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  },
  onboardingTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  onboardingDescription: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    textAlign: 'center',
  },
  roleCard: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(0,122,255,0.5)',
    alignItems: 'center',
    marginBottom: 16,
  },
  roleTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 12,
    marginBottom: 8,
  },
  roleDescription: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingOverlay: {
    marginTop: 24,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
  },
  subscriptionCard: {
    borderRadius: 12,
    padding: 24,
    marginBottom: 16,
  },
  debugCard: {
    borderRadius: 12,
    padding: 16,
  },
});
