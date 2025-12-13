
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
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const resetForm = () => {
    setPlayerName('');
    setPlayerEmail('');
    setPlayerPhone('');
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

    setLoading(true);

    try {
      // Get current admin user
      const { data: { user: adminUser }, error: adminError } = await supabase.auth.getUser();
      
      if (adminError || !adminUser) {
        console.error('Admin user error:', adminError);
        throw new Error('Kunne ikke hente admin bruger. Log venligst ind igen.');
      }

      console.log('Creating player invitation for:', playerEmail);
      console.log('Admin user ID:', adminUser.id);

      const requestPayload = {
        email: playerEmail,
        fullName: playerName,
        phoneNumber: playerPhone || null,
      };

      console.log('Request payload:', requestPayload);

      // Call the Edge Function to create the player
      // The supabase client automatically includes the Authorization header
      const { data, error } = await supabase.functions.invoke('create-player', {
        body: requestPayload,
      });

      console.log('Edge function response:', { data, error });

      if (error) {
        console.error('Edge function error:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error context:', error.context);
        
        // Try to extract error message from context if it's a Response object
        let errorMessage = 'Kunne ikke oprette spillerprofil';
        
        if (error.context && error.context instanceof Response) {
          try {
            // Clone the response so we can read it
            const clonedResponse = error.context.clone();
            const errorBody = await clonedResponse.json();
            console.log('Error response body:', errorBody);
            if (errorBody.error) {
              errorMessage = errorBody.error;
            }
          } catch (e) {
            console.error('Could not parse error response:', e);
            try {
              const clonedResponse = error.context.clone();
              const errorText = await clonedResponse.text();
              console.log('Error response text:', errorText);
              if (errorText) {
                errorMessage = errorText;
              }
            } catch (e2) {
              console.error('Could not read error response text:', e2);
            }
          }
        } else if (error.message) {
          errorMessage = error.message;
        }
        
        // Provide more specific error messages
        if (errorMessage.includes('Only admins')) {
          throw new Error('Du har ikke admin rettigheder til at oprette spillere.');
        } else if (errorMessage.includes('already registered') || errorMessage.includes('already exists')) {
          throw new Error('Denne email er allerede registreret i systemet.');
        } else if (errorMessage.includes('Unauthorized') || errorMessage.includes('No authorization')) {
          throw new Error('Din session er udløbet. Log venligst ind igen.');
        } else {
          throw new Error(errorMessage);
        }
      }

      if (!data || !data.success) {
        console.error('Edge function returned error:', data);
        const errorMessage = data?.error || 'Kunne ikke oprette spillerprofil';
        const errorCode = data?.errorCode || '';
        const userRole = data?.userRole || '';
        
        let detailedMessage = errorMessage;
        if (userRole && userRole !== 'admin') {
          detailedMessage = `Du har ikke admin rettigheder (din rolle: ${userRole})`;
        }
        if (errorCode) {
          detailedMessage += `\n\nFejlkode: ${errorCode}`;
        }
        
        throw new Error(detailedMessage);
      }

      console.log('Player created successfully:', data.playerId);

      // Show success message
      setShowSuccess(true);

      // Wait 2 seconds, then close modal and navigate back
      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
        onPlayerCreated();
        onClose();
      }, 2000);

    } catch (error: any) {
      console.error('Error creating player:', error);
      console.error('Error stack:', error.stack);
      
      // Provide more detailed error message
      let errorMessage = 'Der opstod en fejl ved oprettelse af spillerprofil';
      if (error.message) {
        errorMessage = error.message;
      }
      
      let helpText = '\n\nTjek venligst:\n';
      if (errorMessage.includes('admin')) {
        helpText += '- At du er logget ind som admin\n- At din admin rolle er korrekt sat op';
      } else if (errorMessage.includes('email')) {
        helpText += '- At emailen ikke allerede er i brug\n- At emailen er korrekt formateret';
      } else if (errorMessage.includes('session') || errorMessage.includes('Unauthorized')) {
        helpText += '- At du er logget ind\n- Prøv at logge ud og ind igen';
      } else {
        helpText += '- At du har internetforbindelse\n- At alle felter er udfyldt korrekt\n- Prøv igen om et øjeblik';
      }
      
      Alert.alert('Fejl', errorMessage + helpText);
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
        {showSuccess ? (
          // Success Screen
          <View style={styles.successContainer}>
            <View style={[styles.successIconCircle, { backgroundColor: colors.primary }]}>
              <IconSymbol
                ios_icon_name="checkmark"
                android_material_icon_name="check"
                size={80}
                color="#fff"
              />
            </View>
            <Text style={styles.successTitle}>Invitation sendt! 🎉</Text>
            <Text style={styles.successMessage}>
              Spillerprofil for {playerName} er oprettet.
            </Text>
            <View style={styles.successDetails}>
              <View style={styles.successDetailRow}>
                <IconSymbol
                  ios_icon_name="envelope.fill"
                  android_material_icon_name="email"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.successDetailText}>{playerEmail}</Text>
              </View>
              <View style={styles.successInfoBox}>
                <IconSymbol
                  ios_icon_name="info.circle.fill"
                  android_material_icon_name="info"
                  size={20}
                  color={colors.secondary}
                />
                <Text style={styles.successInfoText}>
                  Spilleren har modtaget en email med et link til at oprette sin adgangskode.
                </Text>
              </View>
            </View>
            <ActivityIndicator size="small" color={colors.primary} style={styles.successLoader} />
            <Text style={styles.successRedirectText}>Returnerer til profilskærmen...</Text>
          </View>
        ) : (
          // Create Player Form
          <>
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
                Opret en ny spillerprofil. Spilleren vil modtage en email med et link til at oprette sin egen adgangskode.
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

                <View style={styles.infoBox}>
                  <IconSymbol
                    ios_icon_name="info.circle"
                    android_material_icon_name="info"
                    size={20}
                    color={colors.secondary}
                  />
                  <View style={styles.infoTextContainer}>
                    <Text style={styles.infoTitle}>Sådan fungerer det:</Text>
                    <Text style={styles.infoText}>
                      1. Du opretter spillerprofilen med navn og email{'\n'}
                      2. Spilleren modtager en email med et link{'\n'}
                      3. Spilleren klikker på linket og opretter sin egen adgangskode{'\n'}
                      4. Spilleren kan nu logge ind i appen
                    </Text>
                  </View>
                </View>

                <View style={[styles.infoBox, { backgroundColor: colors.highlight, marginTop: 16 }]}>
                  <IconSymbol
                    ios_icon_name="lock.shield"
                    android_material_icon_name="security"
                    size={20}
                    color={colors.primary}
                  />
                  <Text style={styles.infoText}>
                    Spilleren vil kun have adgang til Hjem, Performance og Profil menuer.
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
                  <Text style={styles.createButtonText}>Send Invitation</Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
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
    marginTop: 8,
  },
  infoTextContainer: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
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
  // Success Screen Styles
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: colors.background,
  },
  successIconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  successTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 16,
  },
  successMessage: {
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 26,
  },
  successDetails: {
    width: '100%',
    gap: 16,
  },
  successDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  successDetailText: {
    fontSize: 16,
    color: colors.text,
    fontWeight: '500',
  },
  successInfoBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: colors.highlight,
    borderRadius: 12,
  },
  successInfoText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  successLoader: {
    marginTop: 40,
    marginBottom: 12,
  },
  successRedirectText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
