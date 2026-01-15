
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
  Switch,
} from 'react-native';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { PremiumFeatureGate } from '@/components/PremiumFeatureGate';
import { supabase } from '@/app/integrations/supabase/client';
import { triggerManualSync, checkSyncStatus } from '@/utils/calendarAutoSync';
import { deleteExternalActivitiesForCalendar } from '@/utils/deleteExternalActivities';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';

interface ExternalCalendar {
  id: string;
  name: string;
  ics_url: string;
  enabled: boolean;
  last_fetched: string | null;
  event_count: number;
  created_at: string;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
}

interface CategoryMapping {
  id: string;
  external_category: string;
  internal_category_id: string;
  category_name: string;
  category_color: string;
  category_emoji: string;
}

export default function ExternalCalendarManager() {
  const [calendars, setCalendars] = useState<ExternalCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [autoSyncing, setAutoSyncing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCalendarName, setNewCalendarName] = useState('');
  const [newCalendarUrl, setNewCalendarUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [categoryMappings, setCategoryMappings] = useState<CategoryMapping[]>([]);
  const [showMappings, setShowMappings] = useState(false);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const {
    featureAccess,
    isLoading: subscriptionFeaturesLoading,
  } = useSubscriptionFeatures();

  const canUseCalendarSync = featureAccess.calendarSync;

  const showCalendarUpgradeAlert = () => {
    Alert.alert(
      'Premium påkrævet',
      'Kalendersynk er kun tilgængelig for Premium spillere og trænere. Opgrader under Abonnement for at fortsætte.'
    );
  };

  const ensureCalendarAccess = () => {
    if (canUseCalendarSync) {
      return true;
    }
    showCalendarUpgradeAlert();
    return false;
  };

  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;
  const bgColor = isDark ? '#1a1a1a' : colors.background;

  useEffect(() => {
    if (!canUseCalendarSync) {
      setLoading(false);
      setCalendars([]);
      setCategoryMappings([]);
      setShowAddForm(false);
      return;
    }

    fetchCalendars();
    fetchCategoryMappings();
    checkAutoSyncStatus();
  }, [canUseCalendarSync]);

  const checkAutoSyncStatus = async () => {
    const status = await checkSyncStatus();
    setSyncStatus(status);
  };

  const fetchCalendars = async () => {
    if (!canUseCalendarSync) {
      return;
    }
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.log('No user found');
        return;
      }

      // Only fetch calendars for the current logged-in user
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

  const fetchCategoryMappings = async () => {
    if (!canUseCalendarSync) {
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return;
      }

      const { data, error } = await supabase
        .from('category_mappings')
        .select(`
          id,
          external_category,
          internal_category_id,
          activity_categories (
            name,
            color,
            emoji
          )
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching category mappings:', error);
        return;
      }

      const mappings = (data || []).map((mapping: any) => ({
        id: mapping.id,
        external_category: mapping.external_category,
        internal_category_id: mapping.internal_category_id,
        category_name: mapping.activity_categories?.name || 'Unknown',
        category_color: mapping.activity_categories?.color || '#999',
        category_emoji: mapping.activity_categories?.emoji || '📌',
      }));

      setCategoryMappings(mappings);
    } catch (error: any) {
      console.error('Error in fetchCategoryMappings:', error);
    }
  };

  const handleAddCalendar = async () => {
    if (!ensureCalendarAccess()) {
      return;
    }

    if (!newCalendarName.trim() || !newCalendarUrl.trim()) {
      Alert.alert('Fejl', 'Udfyld venligst både navn og URL');
      return;
    }

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

      // Only add calendar for the current user - no team_id or player_id
      const { data, error } = await supabase
        .from('external_calendars')
        .insert({
          user_id: user.id,
          name: newCalendarName.trim(),
          ics_url: newCalendarUrl.trim(),
          enabled: true,
          auto_sync_enabled: true,
          sync_interval_minutes: 60,
        })
        .select()
        .single();

      if (error) {
        console.error('Error adding calendar:', error);
        throw error;
      }

      Alert.alert(
        'Succes',
        'Kalender tilføjet til din profil! Klik på "Synkroniser" for at importere aktiviteter. Aktiviteter tildeles automatisk kategorier baseret på deres navne, eller "Ukendt" hvis ingen match findes. Manuelt tildelte kategorier bevares ved efterfølgende synkroniseringer.'
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
    if (!ensureCalendarAccess()) {
      return;
    }

    try {
      setSyncing(calendarId);
      
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        throw new Error('Ikke logget ind');
      }

      console.log('Syncing calendar:', calendarId);

      const { data, error } = await supabase.functions.invoke('sync-external-calendar-v4', {
        body: { calendarId },
      });

      if (error) {
        console.error('Error syncing calendar:', error);
        throw error;
      }

      console.log('Sync response:', data);

      let message = `${data.eventCount} aktiviteter blev synkroniseret fra "${calendarName}".\n\n`;
      
      if (data.eventsCreated > 0) {
        message += `✨ ${data.eventsCreated} nye aktivitet${data.eventsCreated === 1 ? '' : 'er'} oprettet\n`;
      }
      if (data.eventsUpdated > 0) {
        message += `🔄 ${data.eventsUpdated} aktivitet${data.eventsUpdated === 1 ? '' : 'er'} opdateret\n`;
      }
      if (data.eventsRestored > 0) {
        message += `♻️ ${data.eventsRestored} aktivitet${data.eventsRestored === 1 ? '' : 'er'} gendannet\n`;
      }
      if (data.eventsSoftDeleted > 0) {
        message += `🗑️ ${data.eventsSoftDeleted} aktivitet${data.eventsSoftDeleted === 1 ? '' : 'er'} soft-slettet (mangler i feed)\n`;
      }
      if (data.eventsImmediatelyDeleted > 0) {
        message += `❌ ${data.eventsImmediatelyDeleted} aktivitet${data.eventsImmediatelyDeleted === 1 ? '' : 'er'} slettet (annulleret)\n`;
      }
      
      if (data.eventsFailed && data.eventsFailed > 0) {
        message += `\n⚠️ ADVARSEL: ${data.eventsFailed} aktivitet${data.eventsFailed === 1 ? '' : 'er'} kunne ikke importeres\n`;
        
        if (data.failedEvents && data.failedEvents.length > 0) {
          message += `\nFejlede aktiviteter:\n`;
          data.failedEvents.forEach((failed: any, index: number) => {
            message += `${index + 1}. "${failed.title}": ${failed.error}\n`;
          });
        }
      }
      
      message += `\n📊 Kategori-tildeling:\n`;
      
      if (data.metadataPreserved > 0) {
        message += `• ${data.metadataPreserved} manuelt tildelte kategorier bevaret\n`;
      }
      if (data.metadataCreated > 0) {
        message += `• ${data.metadataCreated} nye kategorier tildelt automatisk\n`;
      }

      Alert.alert(
        data.eventsFailed > 0 ? 'Synkronisering delvist fuldført' : 'Succes',
        message
      );

      await fetchCalendars();
      await fetchCategoryMappings();
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

  const handleAutoSyncAll = async () => {
    if (!ensureCalendarAccess()) {
      return;
    }

    try {
      setAutoSyncing(true);
      
      const result = await triggerManualSync();
      
      Alert.alert(
        'Auto-synkronisering fuldført',
        `${result.syncedCount} kalender(e) blev synkroniseret${result.failedCount > 0 ? `, ${result.failedCount} fejlede` : ''}. Manuelt tildelte kategorier er bevaret.`
      );

      await fetchCalendars();
      await fetchCategoryMappings();
    } catch (error: any) {
      console.error('Error in handleAutoSyncAll:', error);
      Alert.alert('Fejl', 'Kunne ikke auto-synkronisere kalendere');
    } finally {
      setAutoSyncing(false);
    }
  };

  const handleToggleCalendar = async (calendarId: string, currentEnabled: boolean) => {
    if (!ensureCalendarAccess()) {
      return;
    }

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

  const handleToggleAutoSync = async (calendarId: string, currentAutoSync: boolean) => {
    if (!ensureCalendarAccess()) {
      return;
    }

    try {
      const { error } = await supabase
        .from('external_calendars')
        .update({ auto_sync_enabled: !currentAutoSync })
        .eq('id', calendarId);

      if (error) {
        console.error('Error toggling auto-sync:', error);
        throw error;
      }

      await fetchCalendars();
    } catch (error: any) {
      console.error('Error in handleToggleAutoSync:', error);
      Alert.alert('Fejl', 'Kunne ikke opdatere auto-synkronisering');
    }
  };

  const handleDeleteCalendar = async (calendarId: string, calendarName: string) => {
    if (!ensureCalendarAccess()) {
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      Alert.alert('Fejl', 'Ikke logget ind');
      return;
    }

    // Count activities for this calendar
    const { count: activityCount, error: countError } = await supabase
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('external_calendar_id', calendarId);

    if (countError) {
      console.error('Error counting activities:', countError);
      Alert.alert('Fejl', 'Kunne ikke tælle aktiviteter');
      return;
    }

    console.log(`Calendar "${calendarName}" has ${activityCount || 0} activities`);

    if (activityCount && activityCount > 0) {
      // Calendar has activities - ask user what to do
      Alert.alert(
        'Slet kalender',
        `Vil du slette kalenderen "${calendarName}"?\n\nDer er ${activityCount} aktivitet${activityCount === 1 ? '' : 'er'} tilknyttet denne kalender.\n\n⚠️ Hvad vil du gøre med aktiviteterne?`,
        [
          { 
            text: 'Annuller', 
            style: 'cancel' 
          },
          {
            text: 'Behold aktiviteter',
            onPress: async () => {
              await deleteCalendarOnly(calendarId, calendarName, activityCount);
            },
          },
          {
            text: 'Slet alt',
            style: 'destructive',
            onPress: async () => {
              await deleteCalendarWithActivities(calendarId, calendarName);
            },
          },
        ],
        { cancelable: true }
      );
    } else {
      // No activities - just confirm deletion
      Alert.alert(
        'Slet kalender',
        `Er du sikker på at du vil slette kalenderen "${calendarName}"?\n\nDer er ingen aktiviteter tilknyttet denne kalender.`,
        [
          { text: 'Annuller', style: 'cancel' },
          {
            text: 'Slet',
            style: 'destructive',
            onPress: async () => {
              await deleteCalendarOnly(calendarId, calendarName, 0);
            },
          },
        ],
        { cancelable: true }
      );
    }
  };

  const deleteCalendarOnly = async (calendarId: string, calendarName: string, activityCount: number) => {
    if (!ensureCalendarAccess()) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Ikke logget ind');
      }

      console.log(`Deleting calendar "${calendarName}" but keeping ${activityCount} activities`);

      // Update activities to remove calendar reference but keep them as regular activities
      const { error: updateError } = await supabase
        .from('activities')
        .update({ 
          external_calendar_id: null,
          is_external: false,
        })
        .eq('external_calendar_id', calendarId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Error updating activities:', updateError);
        throw updateError;
      }

      console.log(`Updated ${activityCount} activities to remove calendar reference`);

      // Delete the calendar
      const { error: calendarError } = await supabase
        .from('external_calendars')
        .delete()
        .eq('id', calendarId)
        .eq('user_id', user.id);

      if (calendarError) {
        console.error('Error deleting calendar:', calendarError);
        throw calendarError;
      }

      console.log(`Calendar "${calendarName}" deleted successfully`);

      Alert.alert(
        'Succes', 
        activityCount > 0 
          ? `Kalender "${calendarName}" er slettet.\n\n${activityCount} aktivitet${activityCount === 1 ? '' : 'er'} er bevaret i din app som almindelige aktiviteter.`
          : `Kalender "${calendarName}" er slettet.`
      );
      
      await fetchCalendars();
      await fetchCategoryMappings();
    } catch (error: any) {
      console.error('Error in deleteCalendarOnly:', error);
      Alert.alert('Fejl', error.message || 'Kunne ikke slette kalender');
    }
  };

  const deleteCalendarWithActivities = async (calendarId: string, calendarName: string) => {
    if (!ensureCalendarAccess()) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('Ikke logget ind');
      }

      console.log(`Deleting calendar "${calendarName}" and all its activities`);

      // Delete all activities for this calendar
      const deleteResult = await deleteExternalActivitiesForCalendar(calendarId);

      if (!deleteResult.success) {
        throw new Error(deleteResult.error || 'Kunne ikke slette aktiviteter');
      }

      console.log(`Deleted ${deleteResult.count} activities`);

      // Delete the calendar
      const { error: calendarError } = await supabase
        .from('external_calendars')
        .delete()
        .eq('id', calendarId)
        .eq('user_id', user.id);

      if (calendarError) {
        console.error('Error deleting calendar:', calendarError);
        throw calendarError;
      }

      console.log(`Calendar "${calendarName}" deleted successfully`);

      Alert.alert(
        'Succes', 
        `Kalender "${calendarName}" og ${deleteResult.count} aktivitet${deleteResult.count === 1 ? '' : 'er'} er slettet permanent fra din app.`
      );
      
      await fetchCalendars();
      await fetchCategoryMappings();
    } catch (error: any) {
      console.error('Error in deleteCalendarWithActivities:', error);
      Alert.alert('Fejl', error.message || 'Kunne ikke slette kalender og aktiviteter');
    }
  };

  if (subscriptionFeaturesLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: textColor }]}>Kontrollerer abonnement...</Text>
      </View>
    );
  }

  if (!canUseCalendarSync) {
    return (
      <View style={{ paddingVertical: 12 }}>
        <PremiumFeatureGate
          title="Kalendersynk kræver Premium"
          description="Opgrader for at importere eksterne kalendere og holde aktiviteterne automatisk opdateret."
          onPress={showCalendarUpgradeAlert}
          icon={{ ios: 'calendar.badge.plus', android: 'event' }}
          align="left"
        />
      </View>
    );
  }

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
      {calendars.length > 0 && (
        <TouchableOpacity
          style={[styles.autoSyncButton, { backgroundColor: colors.secondary }]}
          onPress={handleAutoSyncAll}
          disabled={autoSyncing}
          activeOpacity={0.7}
        >
          {autoSyncing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <React.Fragment>
              <IconSymbol
                ios_icon_name="arrow.triangle.2.circlepath.circle.fill"
                android_material_icon_name="sync"
                size={24}
                color="#fff"
              />
              <Text style={styles.autoSyncButtonText}>Auto-synkroniser alle</Text>
            </React.Fragment>
          )}
        </TouchableOpacity>
      )}

      {categoryMappings.length > 0 && (
        <TouchableOpacity
          style={[styles.mappingsToggle, { backgroundColor: isDark ? '#2a2a2a' : colors.card }]}
          onPress={() => setShowMappings(!showMappings)}
          activeOpacity={0.7}
        >
          <View style={styles.mappingsToggleContent}>
            <IconSymbol
              ios_icon_name="tag.fill"
              android_material_icon_name="label"
              size={20}
              color={colors.primary}
            />
            <Text style={[styles.mappingsToggleText, { color: textColor }]}>
              Kategori-tildelinger ({categoryMappings.length})
            </Text>
          </View>
          <IconSymbol
            ios_icon_name={showMappings ? 'chevron.up' : 'chevron.down'}
            android_material_icon_name={showMappings ? 'expand_less' : 'expand_more'}
            size={24}
            color={textSecondaryColor}
          />
        </TouchableOpacity>
      )}

      {showMappings && categoryMappings.length > 0 && (
        <View style={[styles.mappingsList, { backgroundColor: isDark ? '#2a2a2a' : colors.card }]}>
          <Text style={[styles.mappingsTitle, { color: textColor }]}>
            Automatiske kategori-tildelinger
          </Text>
          <Text style={[styles.mappingsSubtitle, { color: textSecondaryColor }]}>
            Disse kategorier tildeles automatisk baseret på aktiviteternes navne og nøgleord. Aktiviteter uden match tildeles Ukendt. Manuelt tildelte kategorier bevares ved synkronisering.
          </Text>
          {categoryMappings.map((mapping, index) => (
            <View key={index} style={[styles.mappingItem, { borderBottomColor: isDark ? '#444' : '#e0e0e0' }]}>
              <Text style={[styles.mappingExternal, { color: textSecondaryColor }]}>
                {mapping.external_category}
              </Text>
              <IconSymbol
                ios_icon_name="arrow.right"
                android_material_icon_name="arrow_forward"
                size={16}
                color={textSecondaryColor}
              />
              <View style={styles.mappingInternal}>
                <Text style={{ fontSize: 18 }}>{mapping.category_emoji}</Text>
                <Text style={[styles.mappingInternalText, { color: textColor }]}>
                  {mapping.category_name}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

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
              Kalenderen tilføjes til din egen profil og vil automatisk synkronisere hver time. Aktiviteter tildeles kategorier baseret på deres navne og nøgleord. Manuelt tildelte kategorier bevares ved efterfølgende synkroniseringer.
            </Text>
          </View>
        </View>
      )}

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
            Tilføj en ekstern kalender til din profil for at importere aktiviteter automatisk med intelligent kategori-tildeling. Aktiviteter uden match tildeles Ukendt. Manuelt tildelte kategorier bevares ved synkronisering.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.calendarsList} showsVerticalScrollIndicator={false}>
          {calendars.map((calendar) => (
            <React.Fragment key={calendar.id}>
              <View
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
                          {' • Sidst synkroniseret: '}
                          {new Date(calendar.last_fetched).toLocaleDateString('da-DK')}
                        </Text>
                      )}
                    </View>
                    
                    <View style={styles.autoSyncToggle}>
                      <Text style={[styles.autoSyncLabel, { color: textColor }]}>
                        Auto-synkronisering
                      </Text>
                      <Switch
                        value={calendar.auto_sync_enabled}
                        onValueChange={() => handleToggleAutoSync(calendar.id, calendar.auto_sync_enabled)}
                        trackColor={{ false: '#767577', true: colors.primary }}
                        thumbColor="#fff"
                      />
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
            </React.Fragment>
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
  autoSyncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  autoSyncButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  mappingsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  mappingsToggleContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mappingsToggleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  mappingsList: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  mappingsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  mappingsSubtitle: {
    fontSize: 14,
    marginBottom: 16,
    lineHeight: 20,
  },
  mappingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  mappingExternal: {
    fontSize: 14,
    flex: 1,
  },
  mappingInternal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  mappingInternalText: {
    fontSize: 14,
    fontWeight: '600',
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
  autoSyncToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginLeft: 40,
    marginTop: 8,
  },
  autoSyncLabel: {
    fontSize: 14,
    fontWeight: '500',
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
