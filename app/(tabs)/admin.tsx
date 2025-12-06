
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { useUserRole } from '@/hooks/useUserRole';
import { useRouter } from 'expo-router';
import CreatePlayerModal from '@/components/CreatePlayerModal';
import PlayersList from '@/components/PlayersList';
import ExternalCalendarManager from '@/components/ExternalCalendarManager';
import { useFootball } from '@/contexts/FootballContext';
import { supabase } from '@/app/integrations/supabase/client';

export default function AdminScreen() {
  const { userRole, loading: roleLoading, isAdmin } = useUserRole();
  const { activities, refreshData } = useFootball();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [isDeletingAllActivities, setIsDeletingAllActivities] = useState(false);

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  // Redirect if not admin
  useEffect(() => {
    if (!roleLoading && !isAdmin) {
      Alert.alert(
        'Adgang nægtet',
        'Du har ikke adgang til admin-siden',
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/(home)') }]
      );
    }
  }, [roleLoading, isAdmin, router]);

  const handleDeleteAllActivities = () => {
    const activityCount = activities.length;
    
    Alert.alert(
      'Slet alle aktiviteter',
      `Dette vil slette ALLE dine ${activityCount} aktiviteter permanent. Denne handling kan ikke fortrydes. Er du helt sikker?`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet alle',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingAllActivities(true);
            try {
              console.log('🗑️ Starting to delete all activities...');
              
              // Get current user
              const { data: { user }, error: userError } = await supabase.auth.getUser();
              
              if (userError || !user) {
                throw new Error('Kunne ikke hente bruger information');
              }

              // Delete all activities for the current user
              // The activity_tasks will be deleted automatically due to CASCADE foreign key
              const { error: deleteError, count } = await supabase
                .from('activities')
                .delete()
                .eq('user_id', user.id);

              if (deleteError) {
                console.error('❌ Error deleting activities:', deleteError);
                throw deleteError;
              }

              console.log(`✅ Successfully deleted all activities (count: ${count})`);

              // Refresh data to update UI
              refreshData();

              Alert.alert(
                'Succes',
                `Alle ${activityCount} aktiviteter er blevet slettet.`,
                [{ text: 'OK' }]
              );
            } catch (error: any) {
              console.error('❌ Error during delete all activities:', error);
              Alert.alert(
                'Fejl',
                `Kunne ikke slette aktiviteter: ${error?.message || 'Ukendt fejl'}`
              );
            } finally {
              setIsDeletingAllActivities(false);
            }
          }
        }
      ]
    );
  };

  if (roleLoading) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: textColor }]}>Indlæser...</Text>
        </View>
      </View>
    );
  }

  if (!isAdmin) {
    return null; // Will redirect via useEffect
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={[styles.headerCard, { backgroundColor: colors.primary }]}>
            <IconSymbol
              ios_icon_name="shield.checkered"
              android_material_icon_name="admin_panel_settings"
              size={48}
              color="#fff"
            />
            <Text style={styles.headerTitle}>Admin Panel</Text>
            <Text style={styles.headerSubtitle}>Administrer spillere og indstillinger</Text>
          </View>
        </View>

        {/* External Calendars Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol
                ios_icon_name="calendar.badge.plus"
                android_material_icon_name="event"
                size={28}
                color={colors.primary}
              />
              <Text style={[styles.sectionTitle, { color: textColor }]}>Eksterne Kalendere</Text>
            </View>
          </View>
          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            Tilknyt eksterne kalendere (iCal/webcal) for automatisk at importere aktiviteter
          </Text>
          <ExternalCalendarManager />
        </View>

        {/* Players Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol
                ios_icon_name="person.3.fill"
                android_material_icon_name="group"
                size={28}
                color={colors.primary}
              />
              <Text style={[styles.sectionTitle, { color: textColor }]}>Spillere</Text>
            </View>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={() => setShowCreatePlayerModal(true)}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="plus"
                android_material_icon_name="add"
                size={20}
                color="#fff"
              />
              <Text style={styles.addButtonText}>Tilføj spiller</Text>
            </TouchableOpacity>
          </View>

          <PlayersList />
        </View>

        {/* Maintenance Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol
                ios_icon_name="wrench.and.screwdriver.fill"
                android_material_icon_name="build"
                size={28}
                color={colors.error}
              />
              <Text style={[styles.sectionTitle, { color: textColor }]}>Vedligeholdelse</Text>
            </View>
          </View>
          
          {/* Delete All Activities Button */}
          <View style={styles.maintenanceItem}>
            <View style={styles.maintenanceInfo}>
              <View style={[styles.maintenanceIconContainer, { backgroundColor: 'rgba(244, 67, 54, 0.15)' }]}>
                <IconSymbol
                  ios_icon_name="trash.circle.fill"
                  android_material_icon_name="delete_forever"
                  size={32}
                  color={colors.error}
                />
              </View>
              <View style={styles.maintenanceTextContainer}>
                <Text style={[styles.maintenanceTitle, { color: textColor }]}>
                  Slet alle aktiviteter
                </Text>
                <Text style={[styles.maintenanceDescription, { color: textSecondaryColor }]}>
                  Slet alle dine {activities.length} aktiviteter permanent
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.maintenanceButton,
                { backgroundColor: isDark ? '#3a1a1a' : '#ffebee' }
              ]}
              onPress={handleDeleteAllActivities}
              activeOpacity={0.7}
              disabled={isDeletingAllActivities || activities.length === 0}
            >
              {isDeletingAllActivities ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <React.Fragment>
                  <IconSymbol
                    ios_icon_name="trash.fill"
                    android_material_icon_name="delete"
                    size={20}
                    color={activities.length === 0 ? textSecondaryColor : colors.error}
                  />
                  <Text style={[
                    styles.maintenanceButtonText, 
                    { color: activities.length === 0 ? textSecondaryColor : colors.error }
                  ]}>
                    Slet alle
                  </Text>
                </React.Fragment>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Info Section */}
        <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
          <IconSymbol
            ios_icon_name="info.circle"
            android_material_icon_name="info"
            size={24}
            color={colors.secondary}
          />
          <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
            Som admin har du adgang til at administrere spillere og eksterne kalendere.
            Vær forsigtig med sletteoperationer, da de ikke kan fortrydes.
          </Text>
        </View>

        {/* Bottom Padding */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Create Player Modal */}
      <CreatePlayerModal
        visible={showCreatePlayerModal}
        onClose={() => setShowCreatePlayerModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: Platform.OS === 'android' ? 60 : 20,
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 24,
  },
  headerCard: {
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    textAlign: 'center',
  },
  section: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  sectionDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  maintenanceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  maintenanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    flex: 1,
  },
  maintenanceIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(244, 67, 54, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  maintenanceTextContainer: {
    flex: 1,
  },
  maintenanceTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  maintenanceDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  maintenanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  maintenanceButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
});
