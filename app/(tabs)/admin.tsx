
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
import SubscriptionManager from '@/components/SubscriptionManager';
import TeamManagement from '@/components/TeamManagement';
import TeamPlayerSelector from '@/components/TeamPlayerSelector';
import { useFootball } from '@/contexts/FootballContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';

export default function AdminScreen() {
  const { userRole, loading: roleLoading, isAdmin } = useUserRole();
  const { refreshData } = useFootball();
  const { subscriptionStatus, loading: subscriptionLoading } = useSubscription();
  const { refreshTeams, refreshPlayers } = useTeamPlayer();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

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

  const handlePlayerCreated = () => {
    setRefreshTrigger(prev => prev + 1);
    refreshPlayers();
  };

  const handleCreatePlayer = () => {
    // Check if user has subscription and player limit
    if (!subscriptionStatus?.hasSubscription) {
      Alert.alert(
        'Abonnement påkrævet',
        'Du skal have et aktivt abonnement for at oprette spillere. Start din 14-dages gratis prøveperiode nu!',
        [{ text: 'OK' }]
      );
      return;
    }

    if (subscriptionStatus.currentPlayers >= subscriptionStatus.maxPlayers) {
      Alert.alert(
        'Spillergrænse nået',
        `Din ${subscriptionStatus.planName} plan tillader op til ${subscriptionStatus.maxPlayers} spiller${subscriptionStatus.maxPlayers > 1 ? 'e' : ''}. Opgrader din plan for at tilføje flere spillere.`,
        [{ text: 'OK' }]
      );
      return;
    }

    setShowCreatePlayerModal(true);
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
            <Text style={styles.headerSubtitle}>Administrer abonnement, teams, spillere og indstillinger</Text>
          </View>
        </View>

        {/* Team/Player Selector */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol
                ios_icon_name="person.crop.circle.badge.checkmark"
                android_material_icon_name="how_to_reg"
                size={28}
                color={colors.primary}
              />
              <Text style={[styles.sectionTitle, { color: textColor }]}>Aktiv kontekst</Text>
            </View>
          </View>
          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            Vælg hvilken spiller eller hvilket team du vil administrere aktiviteter for
          </Text>
          <TeamPlayerSelector />
        </View>

        {/* Subscription Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol
                ios_icon_name="creditcard.fill"
                android_material_icon_name="payment"
                size={28}
                color={colors.primary}
              />
              <Text style={[styles.sectionTitle, { color: textColor }]}>Abonnement</Text>
            </View>
          </View>
          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            Administrer dit abonnement og spillergrænser
          </Text>
          <SubscriptionManager />
        </View>

        {/* Teams Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol
                ios_icon_name="person.3.fill"
                android_material_icon_name="groups"
                size={28}
                color={colors.primary}
              />
              <Text style={[styles.sectionTitle, { color: textColor }]}>Teams</Text>
            </View>
          </View>
          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            Opret og administrer teams, og tilknyt spillere til teams
          </Text>
          <TeamManagement />
        </View>

        {/* Players Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleContainer}>
              <IconSymbol
                ios_icon_name="person.2.fill"
                android_material_icon_name="group"
                size={28}
                color={colors.primary}
              />
              <Text style={[styles.sectionTitle, { color: textColor }]}>Spillere</Text>
            </View>
            <TouchableOpacity
              style={[styles.addButton, { backgroundColor: colors.primary }]}
              onPress={handleCreatePlayer}
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

          <PlayersList 
            onCreatePlayer={handleCreatePlayer}
            refreshTrigger={refreshTrigger}
          />
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
            Som admin har du adgang til at administrere abonnement, teams og spillere. 
            Husk at vælge en spiller eller et team før du administrerer aktiviteter.
            {'\n\n'}
            For at tilføje eksterne kalendere, gå til din Profil-side.
          </Text>
        </View>

        {/* Bottom Padding */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Create Player Modal */}
      <CreatePlayerModal
        visible={showCreatePlayerModal}
        onClose={() => setShowCreatePlayerModal(false)}
        onPlayerCreated={handlePlayerCreated}
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
