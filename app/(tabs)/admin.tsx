
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
import { deleteTestTasksFromTraening } from '@/utils/cleanupTasks';
import { testNotification, getNotificationStats, syncNotifications, getAllScheduledNotifications } from '@/utils/notificationService';
import { rescheduleAllNotifications } from '@/utils/notificationRescheduler';
import { useFootball } from '@/contexts/FootballContext';

export default function AdminScreen() {
  const { userRole, loading: roleLoading, isAdmin } = useUserRole();
  const { activities } = useFootball();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const [showCreatePlayerModal, setShowCreatePlayerModal] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [notificationStats, setNotificationStats] = useState<{
    scheduled: number;
    stored: number;
    orphaned: number;
  } | null>(null);

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  // Load notification stats on mount
  useEffect(() => {
    loadNotificationStats();
  }, []);

  const loadNotificationStats = async () => {
    try {
      const stats = await getNotificationStats();
      setNotificationStats(stats);
    } catch (error) {
      console.error('Error loading notification stats:', error);
    }
  };

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

  const handleCleanupTestTasks = () => {
    Alert.alert(
      'Ryd op i test-opgaver',
      'Dette vil slette alle opgaver med titlen "test" fra aktiviteter i kategorien "træning". Er du sikker?',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            setIsCleaningUp(true);
            try {
              const result = await deleteTestTasksFromTraening();
              
              if (result.success) {
                Alert.alert(
                  'Succes',
                  `${result.deletedCount} "test" opgaver blev slettet fra "træning" aktiviteter.`
                );
              } else {
                Alert.alert(
                  'Fejl',
                  `Kunne ikke slette opgaver: ${result.error || 'Ukendt fejl'}`
                );
              }
            } catch (error: any) {
              console.error('Error during cleanup:', error);
              Alert.alert('Fejl', `Der opstod en fejl: ${error?.message || 'Ukendt fejl'}`);
            } finally {
              setIsCleaningUp(false);
            }
          }
        }
      ]
    );
  };

  const handleTestNotification = async () => {
    try {
      await testNotification();
    } catch (error) {
      console.error('Error testing notification:', error);
    }
  };

  const handleSyncNotifications = async () => {
    setIsSyncing(true);
    try {
      await syncNotifications();
      await loadNotificationStats();
      Alert.alert('Succes', 'Notifikationer er blevet synkroniseret');
    } catch (error) {
      console.error('Error syncing notifications:', error);
      Alert.alert('Fejl', 'Kunne ikke synkronisere notifikationer');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRescheduleNotifications = async () => {
    setIsRescheduling(true);
    try {
      console.log('🔄 Manual notification rescheduling triggered from admin panel');
      await rescheduleAllNotifications(activities);
      await loadNotificationStats();
      await getAllScheduledNotifications();
      Alert.alert('Succes', 'Alle notifikationer er blevet genplanlagt');
    } catch (error) {
      console.error('Error rescheduling notifications:', error);
      Alert.alert('Fejl', 'Kunne ikke genplanlegge notifikationer');
    } finally {
      setIsRescheduling(false);
    }
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

        {/* Players Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Spillere</Text>
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

        {/* Notifications Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Notifikationer</Text>
            <View style={styles.debugButtons}>
              <TouchableOpacity
                style={[styles.debugButton, { backgroundColor: colors.accent }]}
                onPress={() => router.push('/console-logs')}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="terminal"
                  android_material_icon_name="code"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.debugButtonText}>Logs</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.debugButton, { backgroundColor: colors.secondary }]}
                onPress={() => router.push('/notification-debug')}
                activeOpacity={0.7}
              >
                <IconSymbol
                  ios_icon_name="ant.circle"
                  android_material_icon_name="bug_report"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.debugButtonText}>Debug</Text>
              </TouchableOpacity>
            </View>
          </View>
          
          {/* Notification Stats */}
          {notificationStats && (
            <View style={[styles.statsContainer, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' }]}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.primary }]}>
                  {notificationStats.scheduled}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondaryColor }]}>
                  Planlagt
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: colors.secondary }]}>
                  {notificationStats.stored}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondaryColor }]}>
                  Gemt
                </Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: notificationStats.orphaned > 0 ? colors.error : colors.success }]}>
                  {notificationStats.orphaned}
                </Text>
                <Text style={[styles.statLabel, { color: textSecondaryColor }]}>
                  Forældreløse
                </Text>
              </View>
            </View>
          )}

          {/* Test Notification Button */}
          <View style={styles.maintenanceItem}>
            <View style={styles.maintenanceInfo}>
              <View style={[styles.maintenanceIconContainer, { backgroundColor: 'rgba(76, 175, 80, 0.1)' }]}>
                <IconSymbol
                  ios_icon_name="bell.badge.fill"
                  android_material_icon_name="notifications_active"
                  size={32}
                  color={colors.success}
                />
              </View>
              <View style={styles.maintenanceTextContainer}>
                <Text style={[styles.maintenanceTitle, { color: textColor }]}>
                  Test notifikation
                </Text>
                <Text style={[styles.maintenanceDescription, { color: textSecondaryColor }]}>
                  Send en test notifikation om 2 sekunder
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.maintenanceButton,
                { backgroundColor: isDark ? '#1a3a1a' : '#e8f5e9' }
              ]}
              onPress={handleTestNotification}
              activeOpacity={0.7}
            >
              <IconSymbol
                ios_icon_name="paperplane.fill"
                android_material_icon_name="send"
                size={20}
                color={colors.success}
              />
              <Text style={[styles.maintenanceButtonText, { color: colors.success }]}>
                Test
              </Text>
            </TouchableOpacity>
          </View>

          {/* Sync Notifications Button */}
          <View style={[styles.maintenanceItem, { marginTop: 16 }]}>
            <View style={styles.maintenanceInfo}>
              <View style={[styles.maintenanceIconContainer, { backgroundColor: 'rgba(33, 150, 243, 0.1)' }]}>
                <IconSymbol
                  ios_icon_name="arrow.triangle.2.circlepath"
                  android_material_icon_name="sync"
                  size={32}
                  color={colors.secondary}
                />
              </View>
              <View style={styles.maintenanceTextContainer}>
                <Text style={[styles.maintenanceTitle, { color: textColor }]}>
                  Synkroniser notifikationer
                </Text>
                <Text style={[styles.maintenanceDescription, { color: textSecondaryColor }]}>
                  Ryd op i forældreløse notifikationer
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.maintenanceButton,
                { backgroundColor: isDark ? '#1a2a3a' : '#e3f2fd' }
              ]}
              onPress={handleSyncNotifications}
              activeOpacity={0.7}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <ActivityIndicator size="small" color={colors.secondary} />
              ) : (
                <React.Fragment>
                  <IconSymbol
                    ios_icon_name="arrow.clockwise"
                    android_material_icon_name="refresh"
                    size={20}
                    color={colors.secondary}
                  />
                  <Text style={[styles.maintenanceButtonText, { color: colors.secondary }]}>
                    Synk
                  </Text>
                </React.Fragment>
              )}
            </TouchableOpacity>
          </View>

          {/* Reschedule All Notifications Button */}
          <View style={[styles.maintenanceItem, { marginTop: 16 }]}>
            <View style={styles.maintenanceInfo}>
              <View style={[styles.maintenanceIconContainer, { backgroundColor: 'rgba(156, 39, 176, 0.1)' }]}>
                <IconSymbol
                  ios_icon_name="calendar.badge.clock"
                  android_material_icon_name="schedule"
                  size={32}
                  color={colors.accent}
                />
              </View>
              <View style={styles.maintenanceTextContainer}>
                <Text style={[styles.maintenanceTitle, { color: textColor }]}>
                  Genplanlæg alle notifikationer
                </Text>
                <Text style={[styles.maintenanceDescription, { color: textSecondaryColor }]}>
                  Genplanlæg alle notifikationer for opgaver med påmindelser
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.maintenanceButton,
                { backgroundColor: isDark ? '#2a1a3a' : '#f3e5f5' }
              ]}
              onPress={handleRescheduleNotifications}
              activeOpacity={0.7}
              disabled={isRescheduling}
            >
              {isRescheduling ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <React.Fragment>
                  <IconSymbol
                    ios_icon_name="arrow.clockwise.circle"
                    android_material_icon_name="update"
                    size={20}
                    color={colors.accent}
                  />
                  <Text style={[styles.maintenanceButtonText, { color: colors.accent }]}>
                    Genplanlæg
                  </Text>
                </React.Fragment>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Maintenance Section */}
        <View style={[styles.section, { backgroundColor: cardBgColor }]}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Vedligeholdelse</Text>
          
          <View style={styles.maintenanceItem}>
            <View style={styles.maintenanceInfo}>
              <View style={styles.maintenanceIconContainer}>
                <IconSymbol
                  ios_icon_name="trash.circle.fill"
                  android_material_icon_name="delete_sweep"
                  size={32}
                  color={colors.error}
                />
              </View>
              <View style={styles.maintenanceTextContainer}>
                <Text style={[styles.maintenanceTitle, { color: textColor }]}>
                  Ryd op i test-opgaver
                </Text>
                <Text style={[styles.maintenanceDescription, { color: textSecondaryColor }]}>
                  Slet alle duplikerede "test" opgaver fra træningsaktiviteter
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[
                styles.maintenanceButton,
                { backgroundColor: isDark ? '#3a1a1a' : '#ffe5e5' }
              ]}
              onPress={handleCleanupTestTasks}
              activeOpacity={0.7}
              disabled={isCleaningUp}
            >
              {isCleaningUp ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <React.Fragment>
                  <IconSymbol
                    ios_icon_name="trash"
                    android_material_icon_name="delete"
                    size={20}
                    color={colors.error}
                  />
                  <Text style={[styles.maintenanceButtonText, { color: colors.error }]}>
                    Ryd op
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
            Som admin har du adgang til at administrere spillere og udføre vedligeholdelsesopgaver.
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
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
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
  debugButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  debugButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  debugButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statItem: {
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 13,
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
