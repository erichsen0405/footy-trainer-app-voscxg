
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import {
  getAllScheduledNotifications,
  getNotificationStats,
  checkNotificationPermissions,
  loadNotificationIdentifiers,
  testNotification,
  cancelAllNotifications,
} from '@/utils/notificationService';
import * as Notifications from 'expo-notifications';

export default function NotificationDebugScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [permissions, setPermissions] = useState<Notifications.NotificationPermissionsStatus | null>(null);
  const [scheduledNotifications, setScheduledNotifications] = useState<Notifications.NotificationRequest[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [storedIdentifiers, setStoredIdentifiers] = useState<any>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      console.log('🔍 Loading notification debug data...');
      
      // Get permissions
      const perms = await Notifications.getPermissionsAsync();
      setPermissions(perms);
      console.log('Permissions:', perms);

      // Get scheduled notifications
      const scheduled = await getAllScheduledNotifications();
      setScheduledNotifications(scheduled);
      console.log('Scheduled notifications:', scheduled.length);

      // Get stats
      const statsData = await getNotificationStats();
      setStats(statsData);
      console.log('Stats:', statsData);

      // Get stored identifiers
      const identifiers = await loadNotificationIdentifiers();
      setStoredIdentifiers(identifiers);
      console.log('Stored identifiers:', Object.keys(identifiers).length);
    } catch (error) {
      console.error('Error loading debug data:', error);
      Alert.alert('Fejl', 'Kunne ikke indlæse debug data');
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleTestNotification = async () => {
    try {
      await testNotification();
      Alert.alert('Test notifikation', 'En test notifikation vil vises om 2 sekunder');
    } catch (error) {
      console.error('Error testing notification:', error);
      Alert.alert('Fejl', 'Kunne ikke sende test notifikation');
    }
  };

  const handleCancelAll = () => {
    Alert.alert(
      'Annuller alle notifikationer',
      'Er du sikker på, at du vil annullere alle planlagte notifikationer?',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Ja, annuller alle',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelAllNotifications();
              await loadData();
              Alert.alert('Succes', 'Alle notifikationer er blevet annulleret');
            } catch (error) {
              console.error('Error cancelling notifications:', error);
              Alert.alert('Fejl', 'Kunne ikke annullere notifikationer');
            }
          },
        },
      ]
    );
  };

  const formatDate = (date: Date) => {
    return date.toLocaleString('da-DK', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getTimeUntil = (date: Date) => {
    const now = Date.now();
    const diff = date.getTime() - now;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (diff < 0) {
      return `${Math.abs(minutes)} minutter siden`;
    } else if (days > 0) {
      return `om ${days} dage, ${hours % 24} timer`;
    } else if (hours > 0) {
      return `om ${hours} timer, ${minutes % 60} minutter`;
    } else if (minutes > 0) {
      return `om ${minutes} minutter`;
    } else {
      return `om ${seconds} sekunder`;
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <IconSymbol
            ios_icon_name="chevron.left"
            android_material_icon_name="arrow_back"
            size={24}
            color={colors.text}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifikation Debug</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Handlinger</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.success }]}
              onPress={handleTestNotification}
            >
              <IconSymbol
                ios_icon_name="paperplane.fill"
                android_material_icon_name="send"
                size={20}
                color="#fff"
              />
              <Text style={styles.actionButtonText}>Test Notifikation</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: colors.error }]}
              onPress={handleCancelAll}
            >
              <IconSymbol
                ios_icon_name="trash.fill"
                android_material_icon_name="delete"
                size={20}
                color="#fff"
              />
              <Text style={styles.actionButtonText}>Annuller Alle</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Permissions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tilladelser</Text>
          {permissions && (
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Status:</Text>
                <Text style={[
                  styles.infoValue,
                  { color: permissions.granted ? colors.success : colors.error }
                ]}>
                  {permissions.granted ? 'Godkendt' : 'Ikke godkendt'}
                </Text>
              </View>
              {Platform.OS === 'ios' && permissions.ios && (
                <React.Fragment>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>iOS Status:</Text>
                    <Text style={styles.infoValue}>
                      {permissions.ios.status}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Alert:</Text>
                    <Text style={styles.infoValue}>
                      {permissions.ios.allowsAlert ? 'Ja' : 'Nej'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Badge:</Text>
                    <Text style={styles.infoValue}>
                      {permissions.ios.allowsBadge ? 'Ja' : 'Nej'}
                    </Text>
                  </View>
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Sound:</Text>
                    <Text style={styles.infoValue}>
                      {permissions.ios.allowsSound ? 'Ja' : 'Nej'}
                    </Text>
                  </View>
                </React.Fragment>
              )}
            </View>
          )}
        </View>

        {/* Stats */}
        {stats && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistik</Text>
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Planlagt:</Text>
                <Text style={[styles.infoValue, { color: colors.primary }]}>
                  {stats.scheduled}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Gemt:</Text>
                <Text style={[styles.infoValue, { color: colors.secondary }]}>
                  {stats.stored}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Forældreløse:</Text>
                <Text style={[
                  styles.infoValue,
                  { color: stats.orphaned > 0 ? colors.error : colors.success }
                ]}>
                  {stats.orphaned}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Scheduled Notifications */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Planlagte Notifikationer ({scheduledNotifications.length})
          </Text>
          {scheduledNotifications.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>Ingen planlagte notifikationer</Text>
            </View>
          ) : (
            scheduledNotifications.map((notification, index) => {
              const trigger = notification.trigger as any;
              const triggerDate = trigger?.date ? new Date(trigger.date) : null;
              
              return (
                <View key={notification.identifier} style={styles.notificationCard}>
                  <View style={styles.notificationHeader}>
                    <Text style={styles.notificationIndex}>#{index + 1}</Text>
                    <Text style={styles.notificationId} numberOfLines={1}>
                      {notification.identifier}
                    </Text>
                  </View>
                  
                  <Text style={styles.notificationTitle}>
                    {notification.content.title}
                  </Text>
                  <Text style={styles.notificationBody}>
                    {notification.content.body}
                  </Text>
                  
                  {triggerDate && (
                    <React.Fragment>
                      <View style={styles.notificationInfo}>
                        <IconSymbol
                          ios_icon_name="calendar"
                          android_material_icon_name="event"
                          size={16}
                          color={colors.textSecondary}
                        />
                        <Text style={styles.notificationInfoText}>
                          {formatDate(triggerDate)}
                        </Text>
                      </View>
                      <View style={styles.notificationInfo}>
                        <IconSymbol
                          ios_icon_name="clock"
                          android_material_icon_name="schedule"
                          size={16}
                          color={colors.textSecondary}
                        />
                        <Text style={styles.notificationInfoText}>
                          {getTimeUntil(triggerDate)}
                        </Text>
                      </View>
                    </React.Fragment>
                  )}
                  
                  {notification.content.data && (
                    <View style={styles.notificationData}>
                      <Text style={styles.notificationDataLabel}>Data:</Text>
                      <Text style={styles.notificationDataText}>
                        {JSON.stringify(notification.content.data, null, 2)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* Stored Identifiers */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Gemte Identifikatorer ({Object.keys(storedIdentifiers).length})
          </Text>
          {Object.keys(storedIdentifiers).length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.emptyText}>Ingen gemte identifikatorer</Text>
            </View>
          ) : (
            Object.entries(storedIdentifiers).map(([taskId, data]: [string, any]) => (
              <View key={taskId} style={styles.identifierCard}>
                <Text style={styles.identifierTaskId}>Task ID: {taskId}</Text>
                <Text style={styles.identifierText}>
                  Notification ID: {data.identifier}
                </Text>
                <Text style={styles.identifierText}>
                  Activity ID: {data.activityId}
                </Text>
                <Text style={styles.identifierText}>
                  Scheduled For: {new Date(data.scheduledFor).toLocaleString('da-DK')}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* System Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System Information</Text>
          <View style={styles.card}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Platform:</Text>
              <Text style={styles.infoValue}>{Platform.OS}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version:</Text>
              <Text style={styles.infoValue}>{Platform.Version}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Current Time:</Text>
              <Text style={styles.infoValue}>
                {formatDate(new Date())}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
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
    paddingTop: Platform.OS === 'android' ? 60 : 60,
    paddingBottom: 20,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  notificationCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  notificationIndex: {
    fontSize: 12,
    fontWeight: 'bold',
    color: colors.primary,
    backgroundColor: `${colors.primary}20`,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  notificationId: {
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  notificationBody: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  notificationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  notificationInfoText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  notificationData: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
  },
  notificationDataLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
  },
  notificationDataText: {
    fontSize: 11,
    color: colors.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  identifierCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  identifierTaskId: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  identifierText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
