
import React, { useState, useCallback } from 'react';
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
import { supabase } from '@/integrations/supabase/client';

/*
 * ========================================
 * PERFORMANCE CHECKLIST (STEP F)
 * ========================================
 * ✅ First render & loading:
 *    - No blocking before paint
 *    - Modal opens immediately
 * 
 * ✅ Navigation:
 *    - No fetch in onPress/onOpen
 *    - Search triggered by button press (not automatic)
 * 
 * ✅ Render control:
 *    - useCallback for all handlers (stable deps)
 *    - No inline handlers in render
 * 
 * ✅ Platform parity:
 *    - Same behavior iOS/Android/Web
 * ========================================
 */

interface CreatePlayerModalProps {
  visible: boolean;
  onClose: () => void;
  onPlayerCreated: () => void;
}

interface SearchResult {
  id: string;
  email: string;
  full_name: string | null;
}

export default function CreatePlayerModal({
  visible,
  onClose,
  onPlayerCreated,
}: CreatePlayerModalProps) {
  const [searchEmail, setSearchEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const resetForm = useCallback(() => {
    setSearchEmail('');
    setSearchResult(null);
  }, []);

  const handleSearch = useCallback(async () => {
    // Validation
    if (!searchEmail.trim()) {
      Alert.alert('Fejl', 'Indtast venligst en email-adresse');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(searchEmail)) {
      Alert.alert('Fejl', 'Indtast venligst en gyldig email-adresse');
      return;
    }

    setSearching(true);
    setSearchResult(null);

    try {
      console.log('Searching for user with email:', searchEmail);

      // Search for user by email using the Edge Function
      const { data, error } = await supabase.functions.invoke('create-player', {
        body: {
          action: 'search',
          email: searchEmail.trim().toLowerCase(),
        },
      });

      console.log('Search response:', { data, error });

      if (error) {
        console.error('Search error:', error);
        throw new Error('Kunne ikke søge efter bruger. Prøv igen.');
      }

      if (!data || !data.success) {
        const errorMessage = data?.error || 'Kunne ikke søge efter bruger';
        throw new Error(errorMessage);
      }

      if (!data.user) {
        Alert.alert(
          'Ingen bruger fundet',
          `Der blev ikke fundet nogen bruger med email: ${searchEmail}\n\nBrugeren skal først oprette en konto i appen, før du kan tilføje dem som spiller.`,
          [{ text: 'OK' }]
        );
        return;
      }

      // User found
      setSearchResult({
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.full_name,
      });

    } catch (error: any) {
      console.error('Error searching for user:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en fejl ved søgning efter bruger');
    } finally {
      setSearching(false);
    }
  }, [searchEmail]);

  const handleAddPlayer = useCallback(async () => {
    if (!searchResult) {
      Alert.alert('Fejl', 'Ingen bruger valgt');
      return;
    }

    setLoading(true);

    try {
      console.log('Adding player:', searchResult.id);

      // Add the player using the Edge Function
      const { data, error } = await supabase.functions.invoke('create-player', {
        body: {
          action: 'add',
          playerId: searchResult.id,
        },
      });

      console.log('Add player response:', { data, error });

      if (error) {
        console.error('Add player error:', error);
        throw new Error('Kunne ikke tilføje spiller. Prøv igen.');
      }

      if (!data || !data.success) {
        const errorMessage = data?.error || 'Kunne ikke tilføje spiller';
        
        // Check for specific error cases
        if (errorMessage.includes('already linked') || errorMessage.includes('already exists')) {
          throw new Error('Denne spiller er allerede tilknyttet din profil.');
        }
        
        throw new Error(errorMessage);
      }

      console.log('Player added successfully');

      // Show success message
      setShowSuccess(true);

      // Wait 2 seconds, then close modal
      setTimeout(() => {
        setShowSuccess(false);
        resetForm();
        onPlayerCreated();
        onClose();
      }, 2000);

    } catch (error: any) {
      console.error('Error adding player:', error);
      Alert.alert('Fejl', error.message || 'Der opstod en fejl ved tilføjelse af spiller');
    } finally {
      setLoading(false);
    }
  }, [searchResult, resetForm, onPlayerCreated, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={0}
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
            <Text style={styles.successTitle}>Spiller tilføjet! 🎉</Text>
            <Text style={styles.successMessage}>
              {searchResult?.full_name || searchResult?.email} er nu tilknyttet din profil.
            </Text>
            <View style={styles.successDetails}>
              <View style={styles.successDetailRow}>
                <IconSymbol
                  ios_icon_name="envelope.fill"
                  android_material_icon_name="email"
                  size={20}
                  color={colors.primary}
                />
                <Text style={styles.successDetailText}>{searchResult?.email}</Text>
              </View>
            </View>
            <ActivityIndicator size="small" color={colors.primary} style={styles.successLoader} />
            <Text style={styles.successRedirectText}>Returnerer til profilen...</Text>
          </View>
        ) : (
          // Search and Add Player Form
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
              <Text style={styles.headerTitle}>Tilføj Spiller</Text>
              <View style={styles.placeholder} />
            </View>

            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
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
                Søg efter en eksisterende bruger ved at indtaste deres email-adresse. 
                Brugeren skal allerede have oprettet en konto i appen.
              </Text>

              <View style={styles.form}>
                <Text style={styles.label}>Email *</Text>
                <View style={styles.searchContainer}>
                  <TextInput
                    style={styles.searchInput}
                    value={searchEmail}
                    onChangeText={setSearchEmail}
                    placeholder="spiller@email.dk"
                    placeholderTextColor={colors.textSecondary}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!searching && !loading}
                    autoCorrect={false}
                    onSubmitEditing={handleSearch}
                  />
                  <TouchableOpacity
                    style={[
                      styles.searchButton,
                      { backgroundColor: colors.primary },
                      (searching || loading) && { opacity: 0.6 },
                    ]}
                    onPress={handleSearch}
                    disabled={searching || loading}
                  >
                    {searching ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <IconSymbol
                        ios_icon_name="magnifyingglass"
                        android_material_icon_name="search"
                        size={20}
                        color="#fff"
                      />
                    )}
                  </TouchableOpacity>
                </View>

                {searchResult && (
                  <View style={styles.resultCard}>
                    <View style={styles.resultHeader}>
                      <IconSymbol
                        ios_icon_name="person.circle.fill"
                        android_material_icon_name="account_circle"
                        size={48}
                        color={colors.primary}
                      />
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName}>
                          {searchResult.full_name || 'Ingen navn'}
                        </Text>
                        <Text style={styles.resultEmail}>{searchResult.email}</Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.addPlayerButton,
                        { backgroundColor: colors.primary },
                        loading && { opacity: 0.6 },
                      ]}
                      onPress={handleAddPlayer}
                      disabled={loading}
                    >
                      {loading ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <IconSymbol
                            ios_icon_name="plus.circle.fill"
                            android_material_icon_name="add_circle"
                            size={20}
                            color="#fff"
                          />
                          <Text style={styles.addPlayerButtonText}>Tilføj spiller</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}

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
                      1. Indtast spillerens email-adresse{'\n'}
                      2. Klik på søg-knappen{'\n'}
                      3. Hvis brugeren findes, kan du tilføje dem som spiller{'\n'}
                      4. Spilleren vil nu være tilknyttet din træner-profil
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
                    Når du tilføjer en spiller, kan du oprette aktiviteter og opgaver for dem. 
                    Spilleren vil kunne se disse i deres Hjem og Opgaver sider.
                  </Text>
                </View>
              </View>

              {/* Extra padding at bottom to ensure button is visible above keyboard */}
              <View style={{ height: 120 }} />
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.cancelButton]}
                onPress={onClose}
                disabled={loading || searching}
              >
                <Text style={styles.cancelButtonText}>Luk</Text>
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
    paddingBottom: 40,
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
  searchContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.highlight,
  },
  searchButton: {
    width: 56,
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 4,
  },
  resultEmail: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  addPlayerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addPlayerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: colors.highlight,
    backgroundColor: colors.background,
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
