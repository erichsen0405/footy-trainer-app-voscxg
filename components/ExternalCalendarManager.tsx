
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  useColorScheme,
  ScrollView,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

interface ExternalCalendar {
  id: string;
  name: string;
  ics_url: string;
  enabled: boolean;
  last_fetched: string | null;
  event_count: number;
  created_at: string;
}

export default function ExternalCalendarManager() {
  const [calendars, setCalendars] = useState<ExternalCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [newCalendarUrl, setNewCalendarUrl] = useState('');
  const [adding, setAdding] = useState(false);

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;
  const bgColor = isDark ? '#1a1a1a' : colors.background;

  useEffect(() => {
    fetchCalendars();
  }, []);

  const fetchCalendars = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('No user found');
        return;
      }

      const { data, error } = await supabase
        .from('external_calendars')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching calendars:', error);
        throw error;
      }

      setCalendars(data || []);
    } catch (error: any) {
      console.error('Error in fetchCalendars:', error);
      Alert.alert('Fejl', 'Kunne ikke hente kalendere');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCalendar = async () => {
    if (!newCalendarName.trim() || !newCalendarUrl.trim()) {
      Alert.alert('Fejl', 'Udfyld venligst både navn og URL');
      return;
    }

    // Validate URL format
    const urlPattern = /^(https?:\/\/|webcal:\/\/)/i;
    if (!urlPattern.test(newCalendarUrl)) {
      Alert.alert(
        'Ugyldig URL',
        'URL skal starte med http://, https:// eller webcal://'
      );
      return;
    }

    try {
      setAdding(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Ikke logget ind');
      }

      const { data, error } = await supabase
        .from('external_calendars')
        .insert({
          user_id: user.id,
          name: newCalendarName.trim(),
          ics_url: newCalendarUrl.trim(),
          enabled: true,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding calendar:', error);
        throw error;
      }

      Alert.alert(
        'Succes',
        'Kalender tilføjet! Klik på "Synkroniser" for at importere aktiviteter.'
      );

      setNewCalendarName('');
      setNewCalendarUrl('');
      setShowAddForm(false);
      await fetchCalendars();
    } catch (error: any) {
      console.error('Error in handleAddCalendar:', error);
      Alert.alert('Fejl', error.message || 'Kunne ikke tilføje kalender');
    } finally {
      setAdding(false);
    }
  };

  const handleSyncCalendar = async (calendarId: string, calendarName: string) => {
    try {
      setSyncing(calendarId);
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Ikke logget ind');
      }

      console.log('Syncing calendar:', calendarId);

      // Call the Edge Function
      const { data, error } = await supabase.functions.invoke('sync-external-calendar', {
        body: { calendarId },
      });

      if (error) {
        console.error('Error syncing calendar:', error);
        throw error;
      }

      console.log('Sync response:', data);

      Alert.alert(
        'Succes',
        `${data.eventCount} aktiviteter blev importeret fra "${calendarName}"`
      );

      await fetchCalendars();
    } catch (error: any) {
      console.error('Error in handleSyncCalendar:', error);
      Alert.alert(
        'Fejl',
        error.message || 'Kunne ikke synkronisere kalender. Tjek at URL\'en er korrekt.'
      );
    } finally {
      setSyncing(null);
    }
  };

  const handleToggleCalendar = async (calendarId: string, currentEnabled: boolean) => {
    try {
      const { error } = await supabase
        .from('external_calendars')
        .update({ enabled: !currentEnabled })
        .eq('id', calendarId);

      if (error) {
        console.error('Error toggling calendar:', error);
        throw error;
      }

      await fetchCalendars();
    } catch (error: any) {
      console.error('Error in handleToggleCalendar:', error);
      Alert.alert('Fejl', 'Kunne ikke opdatere kalender');
    }
  };

  const handleDeleteCalendar = async (calendarId: string, calendarName: string) => {
    Alert.alert(
      'Slet kalender',
      `Er du sikker på at du vil slette "${calendarName}"?\n\nAlle importerede aktiviteter fra denne kalender vil også blive slettet.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            try {
              // First delete all activities from this calendar
              const { error: activitiesError } = await supabase
                .from('activities')
                .delete()
                .eq('external_calendar_id', calendarId);

              if (activitiesError) {
                console.error('Error deleting activities:', activitiesError);
                throw activitiesError;
              }

              // Then delete the calendar
              const { error: calendarError } = await supabase
                .from('external_calendars')
                .delete()
                .eq('id', calendarId);

              if (calendarError) {
                console.error('Error deleting calendar:', calendarError);
                throw calendarError;
              }

              Alert.alert('Succes', 'Kalender og tilknyttede aktiviteter er slettet');
              await fetchCalendars();
            } catch (error: any) {
              console.error('Error in handleDeleteCalendar:', error);
              Alert.alert('Fejl', 'Kunne ikke slette kalender');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: textColor }]}>Indlæser kalendere...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Add Calendar Button */}
      {!showAddForm && (
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowAddForm(true)}
          activeOpacity={0.7}
        >
          <IconSymbol
            ios_icon_name="plus.circle.fill"
            android_material_icon_name="add_circle"
            size={24}
            color="#fff"
          />
          <Text style={styles.addButtonText}>Tilføj ekstern kalender</Text>
        </TouchableOpacity>
      )}

      {/* Add Calendar Form */}
      {showAddForm && (
        <View style={[styles.addForm, { backgroundColor: isDark ? '#2a2a2a' : colors.card }]}>
          <View style={styles.formHeader}>
            <Text style={[styles.formTitle, { color: textColor }]}>Tilføj ekstern kalender</Text>
            <TouchableOpacity onPress={() => setShowAddForm(false)}>
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="cancel"
                size={28}
                color={textSecondaryColor}
              />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: textColor }]}>Kalender navn</Text>
          <TextInput
            style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
            value={newCalendarName}
            onChangeText={setNewCalendarName}
            placeholder="F.eks. Træningskalender"
            placeholderTextColor={textSecondaryColor}
            editable={!adding}
          />

          <Text style={[styles.label, { color: textColor }]}>iCal URL (webcal:// eller https://)</Text>
          <TextInput
            style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
            value={newCalendarUrl}
            onChangeText={setNewCalendarUrl}
            placeholder="webcal://example.com/calendar.ics"
            placeholderTextColor={textSecondaryColor}
            autoCapitalize="none"
            autoCorrect={false}
            editable={!adding}
          />

          <View style={styles.formButtons}>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.highlight }]}
              onPress={() => {
                setShowAddForm(false);
                setNewCalendarName('');
                setNewCalendarUrl('');
              }}
              disabled={adding}
            >
              <Text style={[styles.formButtonText, { color: textColor }]}>Annuller</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formButton, { backgroundColor: colors.primary }]}
              onPress={handleAddCalendar}
              disabled={adding}
            >
              {adding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.formButtonText, { color: '#fff' }]}>Tilføj</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.infoBox, { backgroundColor: isDark ? '#1a3a1a' : '#e8f5e9' }]}>
            <IconSymbol
              ios_icon_name="info.circle"
              android_material_icon_name="info"
              size={20}
              color={colors.success}
            />
            <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
              Du kan finde iCal URL&apos;en i din kalender app. Den starter typisk med webcal:// eller https://
            </Text>
          </View>
        </View>
      )}

      {/* Calendars List */}
      {calendars.length === 0 ? (
        <View style={[styles.emptyState, { backgroundColor: isDark ? '#2a2a2a' : colors.card }]}>
          <IconSymbol
            ios_icon_name="calendar.badge.exclamationmark"
            android_material_icon_name="event_busy"
            size={64}
            color={textSecondaryColor}
          />
          <Text style={[styles.emptyTitle, { color: textColor }]}>Ingen eksterne kalendere</Text>
          <Text style={[styles.emptyText, { color: textSecondaryColor }]}>
            Tilføj en ekstern kalender for at importere aktiviteter automatisk
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.calendarsList} showsVerticalScrollIndicator={false}>
          {calendars.map((calendar) => (
            <View
              key={calendar.id}
              style={[styles.calendarCard, { backgroundColor: isDark ? '#2a2a2a' : colors.card }]}
            >
              <View style={styles.calendarHeader}>
                <View style={styles.calendarInfo}>
                  <View style={styles.calendarTitleRow}>
                    <IconSymbol
                      ios_icon_name={calendar.enabled ? 'calendar.circle.fill' : 'calendar.circle'}
                      android_material_icon_name={calendar.enabled ? 'event_available' : 'event_busy'}
                      size={28}
                      color={calendar.enabled ? colors.primary : textSecondaryColor}
                    />
                    <Text style={[styles.calendarName, { color: textColor }]}>
                      {calendar.name}
                    </Text>
                  </View>
                  <Text style={[styles.calendarUrl, { color: textSecondaryColor }]} numberOfLines={1}>
                    {calendar.ics_url}
                  </Text>
                  <View style={styles.calendarStats}>
                    <Text style={[styles.calendarStat, { color: textSecondaryColor }]}>
                      {calendar.event_count} aktiviteter
                    </Text>
                    {calendar.last_fetched && (
                      <Text style={[styles.calendarStat, { color: textSecondaryColor }]}>
                        • Sidst synkroniseret: {new Date(calendar.last_fetched).toLocaleDateString('da-DK')}
                      </Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.calendarActions}>
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { backgroundColor: isDark ? '#1a2a3a' : '#e3f2fd' },
                  ]}
                  onPress={() => handleSyncCalendar(calendar.id, calendar.name)}
                  disabled={syncing === calendar.id}
                  activeOpacity={0.7}
                >
                  {syncing === calendar.id ? (
                    <ActivityIndicator size="small" color={colors.secondary} />
                  ) : (
                    <React.Fragment>
                      <IconSymbol
                        ios_icon_name="arrow.triangle.2.circlepath"
                        android_material_icon_name="sync"
                        size={20}
                        color={colors.secondary}
                      />
                      <Text style={[styles.actionButtonText, { color: colors.secondary }]}>
                        Synkroniser
                      </Text>
                    </React.Fragment>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { backgroundColor: isDark ? '#2a1a1a' : '#ffebee' },
                  ]}
                  onPress={() => handleToggleCalendar(calendar.id, calendar.enabled)}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name={calendar.enabled ? 'eye.slash.fill' : 'eye.fill'}
                    android_material_icon_name={calendar.enabled ? 'visibility_off' : 'visibility'}
                    size={20}
                    color={calendar.enabled ? colors.error : colors.success}
                  />
                  <Text
                    style={[
                      styles.actionButtonText,
                      { color: calendar.enabled ? colors.error : colors.success },
                    ]}
                  >
                    {calendar.enabled ? 'Deaktiver' : 'Aktiver'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    { backgroundColor: isDark ? '#3a1a1a' : '#ffebee' },
                  ]}
                  onPress={() => handleDeleteCalendar(calendar.id, calendar.name)}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    ios_icon_name="trash.fill"
                    android_material_icon_name="delete"
                    size={20}
                    color={colors.error}
                  />
                  <Text style={[styles.actionButtonText, { color: colors.error }]}>Slet</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  addButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  addForm: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  formHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  formButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  formButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  emptyState: {
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  calendarsList: {
    flex: 1,
  },
  calendarCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  calendarHeader: {
    marginBottom: 16,
  },
  calendarInfo: {
    gap: 8,
  },
  calendarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  calendarName: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
  },
  calendarUrl: {
    fontSize: 13,
    marginLeft: 40,
  },
  calendarStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginLeft: 40,
    marginTop: 4,
  },
  calendarStat: {
    fontSize: 13,
  },
  calendarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
