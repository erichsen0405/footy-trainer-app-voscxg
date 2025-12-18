
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, useColorScheme, Alert, Platform, ActivityIndicator } from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import ExternalCalendarManager from '@/components/ExternalCalendarManager';
import SubscriptionManager from '@/components/SubscriptionManager';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { deleteAllExternalActivities } from '@/utils/deleteExternalActivities';

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
  const [userRole, setUserRole] = useState<'admin' | 'trainer' | 'player' | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [adminInfo, setAdminInfo] = useState<AdminInfo | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  
  // New onboarding flow states
  const [needsRoleSelection, setNeedsRoleSelection] = useState(false);
  const [needsSubscription, setNeedsSubscription] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'player' | 'trainer' | null>(null);
  
  // Profile editing
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  
  // Collapsible sections
  const [isCalendarSyncExpanded, setIsCalendarSyncExpanded] = useState(false);
  const [isSubscriptionExpanded, setIsSubscriptionExpanded] = useState(false);
  
  // Delete external activities state
  const [isDeletingExternalActivities, setIsDeletingExternalActivities] = useState(false);
  
  // Debug state
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

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
        // Refresh subscription status immediately when user is detected
        await refreshSubscription();
        await checkUserOnboarding(user.id);
      }
    };
    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      console.log('Auth state changed:', _event, session?.user);
      setUser(session?.user || null);
      
      if (session?.user) {
        // Refresh subscription status immediately on auth state change
        await refreshSubscription();
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

  const handleDeleteAllExternalActivities = async () => {
    Alert.alert(
      'Slet alle eksterne aktiviteter',
      'Er du sikker på at du vil slette ALLE dine eksterne aktiviteter?\n\nDette vil slette alle aktiviteter importeret fra eksterne kalendere. Aktiviteterne vil blive importeret igen ved næste synkronisering, medmindre du fjerner kalenderne fra din profil.\n\n⚠️ Denne handling kan ikke fortrydes!',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet alle',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingExternalActivities(true);
            try {
              const result = await deleteAllExternalActivities();
              
              if (!result.success) {
                throw new Error(result.error || 'Kunne ikke slette aktiviteter');
              }

              if (result.count === 0) {
                Alert.alert('Ingen aktiviteter', 'Du har ingen eksterne aktiviteter at slette');
              } else {
                Alert.alert(
                  'Slettet',
                  `${result.count} eksterne aktivitet${result.count === 1 ? '' : 'er'} er blevet slettet fra din app`
                );
              }
            } catch (error: any) {
              console.error('Error deleting external activities:', error);
              Alert.alert('Fejl', error.message || 'Kunne ikke slette eksterne aktiviteter');
            } finally {
              setIsDeletingExternalActivities(false);
            }
          }
        }
      ]
    );
  };

  const getPlanColor = (planName: string | null) => {
    if (!planName) return colors.primary;
    
    const lowerName = planName.toLowerCase();
    if (lowerName.includes('bronze') || lowerName.includes('basic')) {
      return '#CD7F32'; // Bronze
    } else if (lowerName.includes('silver') || lowerName.includes('standard')) {
      return '#C0C0C0'; // Silver
    } else if (lowerName.includes('gold') || lowerName.includes('premium')) {
      return '#FFD700'; // Gold
    }
    return colors.primary;
  };

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const isTrainer = userRole === 'admin' || userRole === 'trainer';

  // Show role selection if user is logged in but has no role
  if (user && needsRoleSelection) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: textColor }]}>Vælg din rolle</Text>
            <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
              Vælg om du er spiller eller træner for at fortsætte
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            <Text style={[styles.onboardingTitle, { color: textColor }]}>
              Velkommen til din nye konto! 🎉
            </Text>
            <Text style={[styles.onboardingDescription, { color: textSecondaryColor }]}>
              For at komme i gang skal du vælge din rolle. Dette hjælper os med at tilpasse oplevelsen til dig.
            </Text>

            <TouchableOpacity
              style={[styles.roleCard, { backgroundColor: bgColor }]}
              onPress={() => handleRoleSelection('player')}
              disabled={loading}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="figure.run"
                android_material_icon_name="directions_run"
                size={48}
                color={colors.primary}
              />
              <Text style={[styles.roleTitle, { color: textColor }]}>Spiller</Text>
              <Text style={[styles.roleDescription, { color: textSecondaryColor }]}>
                Jeg er en spiller og vil holde styr på min træning
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.roleCard, { backgroundColor: bgColor }]}
              onPress={() => handleRoleSelection('trainer')}
              disabled={loading}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="person.3.fill"
                android_material_icon_name="group"
                size={48}
                color={colors.primary}
              />
              <Text style={[styles.roleTitle, { color: textColor }]}>Træner</Text>
              <Text style={[styles.roleDescription, { color: textSecondaryColor }]}>
                Jeg er træner og vil administrere spillere og hold
              </Text>
            </TouchableOpacity>

            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[styles.loadingText, { color: textColor }]}>
                  Gemmer din rolle...
                </Text>
              </View>
            )}
          </View>

          {/* Debug Info */}
          {debugInfo.length > 0 && (
            <View style={[styles.card, { backgroundColor: cardBgColor }]}>
              <Text style={[styles.debugTitle, { color: textColor }]}>📋 Debug Log:</Text>
              <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                {debugInfo.map((info, index) => (
                  <Text key={index} style={[styles.debugText, { color: textSecondaryColor }]}>
                    {info}
                  </Text>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  // Show subscription selection if user is trainer but has no subscription
  if (user && needsSubscription) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: textColor }]}>Vælg dit abonnement</Text>
            <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
              Som træner skal du vælge et abonnement for at administrere spillere
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: cardBgColor }]}>
            <SubscriptionManager 
              onPlanSelected={handleCompleteSubscription}
              isSignupFlow={true}
              selectedRole="trainer"
            />
          </View>

          {/* Debug Info */}
          {debugInfo.length > 0 && (
            <View style={[styles.card, { backgroundColor: cardBgColor, marginTop: 16 }]}>
              <Text style={[styles.debugTitle, { color: textColor }]}>📋 Debug Log:</Text>
              <ScrollView style={styles.debugScroll} nestedScrollEnabled>
                {debugInfo.map((info, index) => (
                  <Text key={index} style={[styles.debugText, { color: textSecondaryColor }]}>
                    {info}
                  </Text>
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

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
                <View style={styles.avatarContainer}>
                  <View style={[styles.avatar, { 
                    backgroundColor: subscriptionStatus?.hasSubscription 
                      ? getPlanColor(subscriptionStatus.planName)
                      : colors.primary 
                  }]}>
                    <IconSymbol 
                      ios_icon_name="person.fill" 
                      android_material_icon_name="person" 
                      size={48} 
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
                <View style={styles.userDetails}>
                  <Text style={[styles.userName, { color: textColor }]}>
                    {profile?.full_name || user.email?.split('@')[0] || 'Bruger'}
                  </Text>
                  <Text style={[styles.userEmail, { color: textSecondaryColor }]}>
                    {user.email}
                  </Text>
                  {/* Only show subscription badge if user has an active subscription */}
                  {subscriptionStatus?.hasSubscription && subscriptionStatus.planName && (
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

            {/* Calendar Sync Section - Collapsible - Available for all users */}
            <View style={[styles.card, { backgroundColor: cardBgColor }]}>
              <TouchableOpacity
                style={styles.collapsibleHeader}
                onPress={() => setIsCalendarSyncExpanded(!isCalendarSyncExpanded)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionTitleContainer}>
                  <IconSymbol
                    ios_icon_name="calendar.badge.plus"
                    android_material_icon_name="event"
                    size={28}
                    color={colors.primary}
                  />
                  <Text style={[styles.sectionTitle, { color: textColor }]}>Kalender Synkronisering</Text>
                </View>
                <IconSymbol
                  ios_icon_name={isCalendarSyncExpanded ? 'chevron.up' : 'chevron.down'}
                  android_material_icon_name={isCalendarSyncExpanded ? 'expand_less' : 'expand_more'}
                  size={24}
                  color={textSecondaryColor}
                />
              </TouchableOpacity>
              
              {isCalendarSyncExpanded && (
                <>
                  <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
                    Tilknyt eksterne kalendere (iCal/webcal) for automatisk at importere aktiviteter
                  </Text>
                  <ExternalCalendarManager />
                  
                  {/* Delete All External Activities Button */}
                  <TouchableOpacity
                    style={[styles.deleteExternalButton, { backgroundColor: isDark ? '#3a1a1a' : '#ffe5e5' }]}
                    onPress={handleDeleteAllExternalActivities}
                    activeOpacity={0.7}
                    disabled={isDeletingExternalActivities}
                  >
                    {isDeletingExternalActivities ? (
                      <ActivityIndicator size="small" color={colors.error} />
                    ) : (
                      <React.Fragment>
                        <IconSymbol
                          ios_icon_name="trash.fill"
                          android_material_icon_name="delete"
                          size={24}
                          color={colors.error}
                        />
                        <Text style={[styles.deleteExternalButtonText, { color: colors.error }]}>
                          Slet alle eksterne aktiviteter
                        </Text>
                      </React.Fragment>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Subscription Section - Collapsible - Available for all users */}
            <View style={[styles.card, { backgroundColor: cardBgColor }]}>
              <TouchableOpacity
                style={styles.collapsibleHeader}
                onPress={() => setIsSubscriptionExpanded(!isSubscriptionExpanded)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionTitleContainer}>
                  <IconSymbol
                    ios_icon_name="creditcard.fill"
                    android_material_icon_name="payment"
                    size={28}
                    color={colors.primary}
                  />
                  <Text style={[styles.sectionTitle, { color: textColor }]}>Abonnement</Text>
                </View>
                <IconSymbol
                  ios_icon_name={isSubscriptionExpanded ? 'chevron.up' : 'chevron.down'}
                  android_material_icon_name={isSubscriptionExpanded ? 'expand_less' : 'expand_more'}
                  size={24}
                  color={textSecondaryColor}
                />
              </TouchableOpacity>
              
              {isSubscriptionExpanded && (
                <>
                  <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
                    Administrer dit abonnement
                  </Text>
                  <SubscriptionManager />
                </>
              )}
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
                <View style={styles.authToggle}>
                  <TouchableOpacity
                    style={[
                      styles.authToggleButton,
                      !isSignUp && [styles.authToggleButtonActive, { backgroundColor: colors.primary }]
                    ]}
                    onPress={() => {
                      setIsSignUp(false);
                      setDebugInfo([]);
                    }}
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
                    onPress={() => {
                      setIsSignUp(true);
                      setDebugInfo([]);
                    }}
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

                <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd', marginTop: 24 }]}>
                  <IconSymbol 
                    ios_icon_name="info.circle" 
                    android_material_icon_name="info" 
                    size={28} 
                    color={colors.secondary} 
                  />
                  <View style={styles.infoTextContainer}>
                    <Text style={[styles.infoTitle, { color: textColor }]}>
                      {isSignUp ? 'Hvad sker der efter oprettelse?' : 'Hvorfor skal jeg logge ind?'}
                    </Text>
                    <Text style={[styles.infoBoxText, { color: textSecondaryColor }]}>
                      {isSignUp 
                        ? 'Efter du opretter din konto, bliver du automatisk logget ind og kan begynde at bruge appen med det samme. Du vil modtage en bekræftelsesmail som du kan bekræfte når du har tid.\n\nDu vil blive bedt om at vælge din rolle (spiller eller træner) og derefter vælge et abonnement hvis du er træner.'
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
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subscriptionBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#fff',
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
  badgesRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  planBadgeText: {
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
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  sectionDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 16,
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
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginBottom: 4,
    color: '#fff',
    opacity: 0.9,
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
    borderColor: colors.primary,
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
  deleteExternalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 20,
  },
  deleteExternalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
