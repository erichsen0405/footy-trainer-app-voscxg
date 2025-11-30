
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { supabase } from '@/app/integrations/supabase/client';

interface CreatePlayerModalProps {
  visible: boolean;
  onClose: () => void;
  onPlayerCreated: () => void;
}

export default function CreatePlayerModal({
  visible,
  onClose,
  onPlayerCreated,
}: CreatePlayerModalProps) {
  const [playerName, setPlayerName] = useState('');
  const [playerEmail, setPlayerEmail] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setPlayerName('');
    setPlayerEmail('');
    setPlayerPhone('');
    setPassword('');
  };

  const handleCreatePlayer = async () => {
    // Validation
    if (!playerName.trim()) {
      Alert.alert('Fejl', 'Indtast venligst spillerens navn');
      return;
    }

    if (!playerEmail.trim()) {
      Alert.alert('Fejl', 'Indtast venligst spillerens email');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(playerEmail)) {
      Alert.alert('Fejl', 'Indtast venligst en gyldig email-adresse');
      return;
    }

    if (!password || password.length < 6) {
      Alert.alert('Fejl', 'Adgangskoden skal være mindst 6 tegn lang');
      return;
    }

    setLoading(true);

    try {
      // Get current admin user
      const { data: { user: adminUser }, error: adminError } = await supabase.auth.getUser();
      
      if (adminError || !adminUser) {
        throw new Error('Kunne ikke hente admin bruger');
      }

      console.log('Creating player account for:', playerEmail);

      // Create the player account using admin API
      // Note: This requires the admin to be authenticated
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: playerEmail,
        password: password,
        options: {
          data: {
            full_name: playerName,
            phone_number: playerPhone,
          },
          emailRedirectTo: 'https://natively.dev/email-confirmed',
        },
      });

      if (signUpError) {
        console.error('Sign up error:', signUpError);
        throw signUpError;
      }

      if (!signUpData.user) {
        throw new Error('Kunne ikke oprette spillerprofil');
      }

      const playerId = signUpData.user.id;
      console.log('Player account created:', playerId);

      // Create profile for the player
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          user_id: playerId,
          full_name: playerName,
          phone_number: playerPhone,
        });

      if (profileError) {
        console.error('Profile creation error:', profileError);
        // Continue even if profile creation fails
      }

      // Set user role as player
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: playerId,
          role: 'player',
        });

      if (roleError) {
        console.error('Role assignment error:', roleError);
        throw new Error('Kunne ikke tildele spillerrolle');
      }

      // Create admin-player relationship
      const { error: relationshipError } = await supabase
        .from('admin_player_relationships')
        .insert({
          admin_id: adminUser.id,
          player_id: playerId,
        });

      if (relationshipError) {
        console.error('Relationship creation error:', relationshipError);
        throw new Error('Kunne ikke oprette admin-spiller relation');
      }

      Alert.alert(
        'Succes! 🎉',
        `Spillerprofil for ${playerName} er oprettet.\n\nEmail: ${playerEmail}\n\nSpilleren skal bekræfte sin email før login.`,
        [
          {
            text: 'OK',
            onPress: () => {
              resetForm();
              onPlayerCreated();
              onClose();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error creating player:', error);
      Alert.alert(
        'Fejl',
        error.message || 'Der opstod en fejl ved oprettelse af spillerprofil'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <IconSymbol
              ios_icon_name="xmark"
              android_material_icon_name="close"
              size={24}
              color={colors.text}
            />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Opret Spillerprofil</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
              <IconSymbol
                ios_icon_name="person.badge.plus"
                android_material_icon_name="person_add"
                size={48}
                color="#fff"
              />
            </View>
          </View>

          <Text style={styles.description}>
            Opret en ny spillerprofil. Spilleren vil kun have adgang til Hjem, Performance og Profil.
          </Text>

          <View style={styles.form}>
            <Text style={styles.label}>Spillerens navn *</Text>
            <TextInput
              style={styles.input}
              value={playerName}
              onChangeText={setPlayerName}
              placeholder="F.eks. Anders Hansen"
              placeholderTextColor={colors.textSecondary}
              editable={!loading}
              autoCorrect={false}
            />

            <Text style={styles.label}>Email *</Text>
            <TextInput
              style={styles.input}
              value={playerEmail}
              onChangeText={setPlayerEmail}
              placeholder="spiller@email.dk"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
              autoCorrect={false}
            />

            <Text style={styles.label}>Telefonnummer</Text>
            <TextInput
              style={styles.input}
              value={playerPhone}
              onChangeText={setPlayerPhone}
              placeholder="+45 12 34 56 78"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              editable={!loading}
              autoCorrect={false}
            />

            <Text style={styles.label}>Adgangskode *</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Mindst 6 tegn"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              editable={!loading}
              autoCorrect={false}
              autoCapitalize="none"
            />

            <View style={styles.infoBox}>
              <IconSymbol
                ios_icon_name="info.circle"
                android_material_icon_name="info"
                size={20}
                color={colors.secondary}
              />
              <Text style={styles.infoText}>
                Spilleren vil modtage en bekræftelsesmail og skal klikke på linket før login.
              </Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.cancelButton]}
            onPress={onClose}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Annuller</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.createButton,
              { backgroundColor: colors.primary },
              loading && { opacity: 0.6 },
            ]}
            onPress={handleCreatePlayer}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.createButtonText}>Opret Spiller</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  form: {
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.highlight,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: colors.highlight,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.highlight,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.highlight,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  createButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});
