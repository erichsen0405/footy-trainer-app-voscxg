
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, useColorScheme, Alert, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFootball } from '@/contexts/FootballContext';
import { colors } from '@/styles/commonStyles';
import { Activity } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';

export default function AdminScreen() {
  const router = useRouter();
  const { 
    activities, 
    categories, 
    deleteActivity, 
    duplicateActivity, 
    externalCalendars, 
    externalActivities,
    addExternalCalendar, 
    toggleCalendar,
    deleteExternalCalendar,
    importExternalActivity,
    importMultipleActivities,
    fetchExternalCalendarEvents,
  } = useFootball();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedExternalCalendars, setSelectedExternalCalendars] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);
  const [isCalendarDropdownVisible, setIsCalendarDropdownVisible] = useState(false);
  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [activityToImport, setActivityToImport] = useState<string | null>(null);
  const [selectedImportCategory, setSelectedImportCategory] = useState<string>(categories[0]?.id || '');
  const [newCalendarUrl, setNewCalendarUrl] = useState('');
  const [newCalendarName, setNewCalendarName] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [syncingCalendarId, setSyncingCalendarId] = useState<string | null>(null);
  const [togglingCalendarId, setTogglingCalendarId] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isAddingCalendar, setIsAddingCalendar] = useState(false);
  const [isDeletingActivities, setIsDeletingActivities] = useState(false);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Check authentication status
  React.useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setIsAuthenticated(!!user);
      console.log('Auth status:', !!user);
    };
    checkAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session?.user);
      console.log('Auth changed:', !!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  const enabledExternalCalendarIds = useMemo(() => {
    const ids = externalCalendars.filter(cal => cal.enabled).map(cal => cal.id);
    console.log('Enabled calendar IDs:', ids);
    return ids;
  }, [externalCalendars]);

  const visibleExternalActivities = useMemo(() => {
    console.log('Total external activities:', externalActivities.length);
    console.log('Enabled calendar IDs:', enabledExternalCalendarIds);
    
    const visible = externalActivities.filter(activity => {
      const hasCalendarId = activity.externalCalendarId !== undefined;
      const isEnabled = activity.externalCalendarId && enabledExternalCalendarIds.includes(activity.externalCalendarId);
      const matchesFilter = selectedExternalCalendars.length === 0 || 
        (activity.externalCalendarId && selectedExternalCalendars.includes(activity.externalCalendarId));
      
      return hasCalendarId && isEnabled && matchesFilter;
    });
    
    console.log('Visible external activities:', visible.length);
    return visible;
  }, [externalActivities, enabledExternalCalendarIds, selectedExternalCalendars]);

  const allActivities = useMemo(() => {
    const combined = [...activities, ...visibleExternalActivities].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    console.log('All activities (internal + external):', combined.length);
    return combined;
  }, [activities, visibleExternalActivities]);

  const filteredActivities = useMemo(() => 
    allActivities.filter(activity => {
      const matchesSearch = activity.title.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(activity.category.id);
      return matchesSearch && matchesCategory;
    }),
    [allActivities, searchQuery, selectedCategories]
  );

  const externalFilteredActivities = useMemo(() =>
    filteredActivities.filter(a => a.isExternal),
    [filteredActivities]
  );

  const handleActivityPress = (activityId: string) => {
    console.log('Opening activity details for:', activityId);
    router.push(`/activity-details?id=${activityId}`);
  };

  const toggleCategoryFilter = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
    );
  };

  const toggleExternalCalendarFilter = (calendarId: string) => {
    setSelectedExternalCalendars(prev =>
      prev.includes(calendarId)
        ? prev.filter(id => id !== calendarId)
        : [...prev, calendarId]
    );
  };

  const toggleActivitySelection = (activityId: string) => {
    setSelectedActivities(prev =>
      prev.includes(activityId)
        ? prev.filter(id => id !== activityId)
        : [...prev, activityId]
    );
  };

  const selectAllActivities = () => {
    if (selectedActivities.length === filteredActivities.length) {
      setSelectedActivities([]);
    } else {
      setSelectedActivities(filteredActivities.map(a => a.id));
    }
  };

  const selectAllExternalActivities = () => {
    const externalIds = externalFilteredActivities.map(a => a.id);
    if (externalIds.every(id => selectedActivities.includes(id))) {
      setSelectedActivities(prev => prev.filter(id => !externalIds.includes(id)));
    } else {
      setSelectedActivities(prev => [...new Set([...prev, ...externalIds])]);
    }
  };

  const deleteSelectedActivities = async () => {
    console.log('Deleting selected activities:', selectedActivities.length);
    
    // Filter out external activities - they cannot be deleted
    const internalActivityIds = selectedActivities.filter(id => {
      const activity = allActivities.find(a => a.id === id);
      return activity && !activity.isExternal;
    });

    if (internalActivityIds.length === 0) {
      Alert.alert('Ingen aktiviteter at slette', 'Du kan kun slette interne aktiviteter, ikke eksterne.');
      return;
    }

    Alert.alert(
      'Slet aktiviteter',
      `Er du sikker på at du vil slette ${internalActivityIds.length} aktivitet${internalActivityIds.length !== 1 ? 'er' : ''}?`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingActivities(true);
            let successCount = 0;
            let failCount = 0;

            for (const id of internalActivityIds) {
              try {
                await deleteActivity(id);
                successCount++;
                console.log(`Successfully deleted activity ${id}`);
              } catch (error) {
                failCount++;
                console.error(`Failed to delete activity ${id}:`, error);
              }
            }

            setIsDeletingActivities(false);
            setSelectedActivities([]);

            if (failCount === 0) {
              Alert.alert('Slettet', `${successCount} aktivitet${successCount !== 1 ? 'er' : ''} blev slettet.`);
            } else {
              Alert.alert(
                'Delvist slettet', 
                `${successCount} aktivitet${successCount !== 1 ? 'er' : ''} blev slettet.\n${failCount} aktivitet${failCount !== 1 ? 'er' : ''} kunne ikke slettes.`
              );
            }
          }
        }
      ]
    );
  };

  const handleAddCalendar = async () => {
    console.log('handleAddCalendar called');
    console.log('isAuthenticated:', isAuthenticated);
    console.log('newCalendarName:', newCalendarName);
    console.log('newCalendarUrl:', newCalendarUrl);

    if (!isAuthenticated) {
      console.log('User not authenticated, showing alert');
      Alert.alert(
        'Login påkrævet',
        'Du skal være logget ind for at tilføje eksterne kalendere. Denne funktion kræver en Supabase-konto for at gemme dine data.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!newCalendarUrl || !newCalendarName) {
      console.log('Missing name or URL');
      Alert.alert('Fejl', 'Udfyld venligst både navn og URL');
      return;
    }

    // Validate URL format
    if (!newCalendarUrl.startsWith('webcal://') && !newCalendarUrl.startsWith('https://') && !newCalendarUrl.startsWith('http://')) {
      console.log('Invalid URL format');
      Alert.alert(
        'Ugyldig URL',
        'URL skal starte med webcal://, https:// eller http://'
      );
      return;
    }

    setIsAddingCalendar(true);
    console.log('Starting to add calendar...');

    try {
      console.log('Calling addExternalCalendar with:', { name: newCalendarName, icsUrl: newCalendarUrl });
      
      const result = await addExternalCalendar({
        name: newCalendarName,
        icsUrl: newCalendarUrl,
        enabled: true,
      });
      
      console.log('addExternalCalendar result:', result);
      
      setNewCalendarUrl('');
      setNewCalendarName('');
      setIsCalendarModalVisible(false);
      
      Alert.alert(
        'Kalender tilføjet',
        'Din eksterne kalender er blevet tilføjet og synkroniseres nu.',
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error in handleAddCalendar:', error);
      console.error('Error message:', error?.message);
      console.error('Error stack:', error?.stack);
      
      Alert.alert(
        'Fejl',
        `Der opstod en fejl ved tilføjelse af kalenderen: ${error?.message || 'Ukendt fejl'}. Tjek venligst URL'en og prøv igen.`
      );
    } finally {
      setIsAddingCalendar(false);
      console.log('Finished adding calendar');
    }
  };

  const handleToggleCalendar = async (calendarId: string) => {
    if (!isAuthenticated) {
      Alert.alert('Login påkrævet', 'Du skal være logget ind for at aktivere/deaktivere kalendere.');
      return;
    }

    const calendar = externalCalendars.find(c => c.id === calendarId);
    if (!calendar) {
      console.error('Calendar not found:', calendarId);
      return;
    }

    setTogglingCalendarId(calendarId);
    console.log(`Toggling calendar: ${calendar.name} (${calendar.enabled ? 'enabled' : 'disabled'} -> ${!calendar.enabled ? 'enabled' : 'disabled'})`);

    try {
      await toggleCalendar(calendarId);
      console.log('Calendar toggled successfully');
    } catch (error: any) {
      console.error('Error toggling calendar:', error);
      console.error('Error message:', error?.message);
      console.error('Error details:', JSON.stringify(error, null, 2));
      
      Alert.alert(
        'Fejl',
        `Der opstod en fejl ved aktivering/deaktivering af kalenderen: ${error?.message || 'Netværksfejl'}. Tjek din internetforbindelse og prøv igen.`
      );
    } finally {
      setTogglingCalendarId(null);
    }
  };

  const handleDeleteCalendar = (calendarId: string) => {
    if (!isAuthenticated) {
      Alert.alert('Login påkrævet', 'Du skal være logget ind for at slette kalendere.');
      return;
    }

    const calendar = externalCalendars.find(c => c.id === calendarId);
    if (!calendar) {
      console.error('Calendar not found:', calendarId);
      return;
    }

    Alert.alert(
      'Slet kalender',
      `Er du sikker på at du vil slette kalenderen "${calendar.name}"? Alle tilknyttede aktiviteter vil også blive slettet.`,
      [
        { text: 'Annuller', style: 'cancel' },
        { 
          text: 'Slet', 
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('Deleting calendar:', calendarId);
              await deleteExternalCalendar(calendarId);
              console.log('Calendar deleted successfully');
              Alert.alert('Slettet', 'Kalenderen og dens aktiviteter er blevet slettet.');
            } catch (error: any) {
              console.error('Error deleting calendar:', error);
              Alert.alert('Fejl', `Kunne ikke slette kalenderen: ${error?.message || 'Ukendt fejl'}`);
            }
          }
        }
      ]
    );
  };

  const handleSyncCalendar = async (calendarId: string) => {
    if (!isAuthenticated) {
      Alert.alert('Login påkrævet', 'Du skal være logget ind for at synkronisere kalendere.');
      return;
    }

    const calendar = externalCalendars.find(c => c.id === calendarId);
    if (!calendar) return;

    setSyncingCalendarId(calendarId);
    try {
      await fetchExternalCalendarEvents(calendar);
      Alert.alert('Synkronisering fuldført', `Kalenderen "${calendar.name}" er blevet synkroniseret.`);
    } catch (error) {
      console.error('Sync error:', error);
      Alert.alert('Synkroniseringsfejl', 'Der opstod en fejl under synkronisering af kalenderen.');
    } finally {
      setSyncingCalendarId(null);
    }
  };

  const handleImportActivity = (activityId: string) => {
    if (!isAuthenticated) {
      Alert.alert('Login påkrævet', 'Du skal være logget ind for at importere aktiviteter.');
      return;
    }

    setActivityToImport(activityId);
    setSelectedImportCategory(categories[0]?.id || '');
    setIsImportModalVisible(true);
  };

  const confirmImport = () => {
    if (activityToImport) {
      importExternalActivity(activityToImport, selectedImportCategory);
      setIsImportModalVisible(false);
      setActivityToImport(null);
    }
  };

  const handleImportSelected = () => {
    if (!isAuthenticated) {
      Alert.alert('Login påkrævet', 'Du skal være logget ind for at importere aktiviteter.');
      return;
    }

    const externalIds = selectedActivities.filter(id => 
      externalFilteredActivities.some(a => a.id === id)
    );
    
    if (externalIds.length === 0) {
      Alert.alert('Ingen eksterne aktiviteter valgt', 'Vælg venligst eksterne aktiviteter at importere.');
      return;
    }

    setActivityToImport('multiple');
    setSelectedImportCategory(categories[0]?.id || '');
    setIsImportModalVisible(true);
  };

  const confirmMultipleImport = () => {
    const externalIds = selectedActivities.filter(id => 
      externalFilteredActivities.some(a => a.id === id)
    );
    importMultipleActivities(externalIds, selectedImportCategory);
    setIsImportModalVisible(false);
    setActivityToImport(null);
    setSelectedActivities([]);
  };

  const clearAllFilters = () => {
    setSelectedCategories([]);
    setSelectedExternalCalendars([]);
    setSearchQuery('');
  };

  const formatDate = (date: Date) => {
    const activityDate = new Date(date);
    const dateStr = activityDate.toLocaleDateString('da-DK', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return dateStr;
  };

  const formatTime = (time: string) => {
    // Extract just HH:MM from the time string (removing seconds if present)
    return time.substring(0, 5);
  };

  const formatDateTime = (date: Date, time: string) => {
    return `${formatDate(date)}, ${formatTime(time)}`;
  };

  const formatLastFetched = (date?: Date) => {
    if (!date) return 'Aldrig synkroniseret';
    
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Lige nu';
    if (minutes < 60) return `${minutes} min siden`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} time${hours !== 1 ? 'r' : ''} siden`;
    
    const days = Math.floor(hours / 24);
    return `${days} dag${days !== 1 ? 'e' : ''} siden`;
  };

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const hasActiveFilters = selectedCategories.length > 0 || selectedExternalCalendars.length > 0 || searchQuery.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: textColor }]}>Admin</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            {activities.length} aktiviteter • {externalCalendars.length} eksterne kalendere
          </Text>
          {!isAuthenticated && (
            <View style={[styles.warningBanner, { backgroundColor: isDark ? '#4a3a2a' : '#fff3cd' }]}>
              <IconSymbol 
                ios_icon_name="exclamationmark.triangle.fill" 
                android_material_icon_name="warning" 
                size={24} 
                color={isDark ? '#ffc107' : '#856404'} 
              />
              <Text style={[styles.warningText, { color: isDark ? '#ffc107' : '#856404' }]}>
                Du er ikke logget ind. Log ind for at gemme eksterne kalendere og synkronisere data.
              </Text>
            </View>
          )}
        </View>

        {/* External Calendar Management Section - Mobile Optimized */}
        <View style={[styles.externalCalendarSection, { backgroundColor: cardBgColor }]}>
          <View style={styles.externalCalendarHeader}>
            <View style={styles.externalCalendarHeaderLeft}>
              <IconSymbol 
                ios_icon_name="calendar.badge.plus" 
                android_material_icon_name="event" 
                size={28} 
                color={colors.secondary} 
              />
              <View style={styles.externalCalendarTitleContainer}>
                <Text style={[styles.externalCalendarTitle, { color: textColor }]}>Eksterne kalendere</Text>
                <Text style={[styles.externalCalendarSubtitle, { color: textSecondaryColor }]}>
                  {externalCalendars.length === 0 
                    ? 'Ingen kalendere tilføjet' 
                    : `${externalCalendars.length} kalender${externalCalendars.length !== 1 ? 'e' : ''} • ${externalActivities.length} begivenheder`}
                </Text>
              </View>
            </View>
          </View>
          
          <TouchableOpacity 
            style={[
              styles.addCalendarButton, 
              { backgroundColor: isAuthenticated ? colors.primary : colors.highlight }
            ]}
            onPress={() => {
              console.log('Add calendar button pressed');
              setIsCalendarModalVisible(true);
            }}
            activeOpacity={0.7}
          >
            <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={22} color="#fff" />
            <Text style={styles.addCalendarButtonText}>Tilføj kalender</Text>
          </TouchableOpacity>

          {externalCalendars.length > 0 && (
            <TouchableOpacity 
              style={styles.manageCalendarsButton}
              onPress={() => setIsCalendarDropdownVisible(!isCalendarDropdownVisible)}
              activeOpacity={0.7}
            >
              <IconSymbol 
                ios_icon_name="slider.horizontal.3" 
                android_material_icon_name="tune" 
                size={22} 
                color={colors.secondary} 
              />
              <Text style={[styles.manageCalendarsText, { color: colors.secondary }]}>
                Administrer kalendere ({externalCalendars.filter(c => c.enabled).length} aktive)
              </Text>
              <IconSymbol 
                ios_icon_name={isCalendarDropdownVisible ? "chevron.up" : "chevron.down"} 
                android_material_icon_name={isCalendarDropdownVisible ? "expand_less" : "expand_more"} 
                size={22} 
                color={colors.secondary} 
              />
            </TouchableOpacity>
          )}
        </View>

        {isCalendarDropdownVisible && externalCalendars.length > 0 && (
          <View style={[styles.calendarDropdown, { backgroundColor: cardBgColor }]}>
            {externalCalendars.map((calendar, index) => (
              <View key={index} style={[
                styles.calendarDropdownItem,
                index < externalCalendars.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.highlight }
              ]}>
                <TouchableOpacity 
                  style={styles.calendarToggleArea}
                  onPress={() => handleToggleCalendar(calendar.id)}
                  activeOpacity={0.7}
                  disabled={togglingCalendarId === calendar.id}
                >
                  {togglingCalendarId === calendar.id ? (
                    <View style={styles.toggleLoadingContainer}>
                      <ActivityIndicator size="small" color={colors.primary} />
                    </View>
                  ) : (
                    <View style={[
                      styles.toggle, 
                      calendar.enabled && { backgroundColor: colors.primary }
                    ]}>
                      <View style={[
                        styles.toggleThumb, 
                        calendar.enabled && styles.toggleThumbActive
                      ]} />
                    </View>
                  )}
                  <View style={styles.calendarDropdownInfo}>
                    <Text style={[styles.calendarDropdownName, { color: textColor }]}>{calendar.name}</Text>
                    <Text style={[styles.calendarDropdownMeta, { color: textSecondaryColor }]}>
                      {calendar.eventCount || 0} begivenheder • {calendar.enabled ? 'Aktiv' : 'Inaktiv'}
                    </Text>
                    <Text style={[styles.calendarDropdownSync, { color: textSecondaryColor }]}>
                      {formatLastFetched(calendar.lastFetched)}
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.calendarActions}>
                  <TouchableOpacity 
                    onPress={() => handleSyncCalendar(calendar.id)}
                    style={styles.syncButton}
                    activeOpacity={0.7}
                    disabled={syncingCalendarId === calendar.id}
                  >
                    {syncingCalendarId === calendar.id ? (
                      <ActivityIndicator size="small" color={colors.secondary} />
                    ) : (
                      <IconSymbol ios_icon_name="arrow.clockwise" android_material_icon_name="sync" size={22} color={colors.secondary} />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => handleDeleteCalendar(calendar.id)}
                    style={styles.deleteButton}
                    activeOpacity={0.7}
                  >
                    <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={22} color={colors.error} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Search Bar - Mobile Optimized */}
        <View style={[styles.searchContainer, { backgroundColor: cardBgColor }]}>
          <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={22} color={textSecondaryColor} />
          <TextInput
            style={[styles.searchInput, { color: textColor }]}
            placeholder="Søg efter aktiviteter..."
            placeholderTextColor={textSecondaryColor}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchButton}>
              <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={22} color={textSecondaryColor} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Section - Mobile Optimized */}
        <View style={styles.filterHeader}>
          <TouchableOpacity 
            style={styles.filterToggle}
            onPress={() => setShowFilters(!showFilters)}
            activeOpacity={0.7}
          >
            <IconSymbol 
              ios_icon_name="line.3.horizontal.decrease.circle" 
              android_material_icon_name="filter_list" 
              size={24} 
              color={showFilters ? colors.primary : textColor} 
            />
            <Text style={[styles.filterToggleText, { color: showFilters ? colors.primary : textColor }]}>
              Filtre {hasActiveFilters && `(${selectedCategories.length + selectedExternalCalendars.length})`}
            </Text>
          </TouchableOpacity>
          
          {hasActiveFilters && (
            <TouchableOpacity onPress={clearAllFilters} style={styles.clearFiltersButton} activeOpacity={0.7}>
              <Text style={[styles.clearFiltersText, { color: colors.error }]}>Ryd alle</Text>
            </TouchableOpacity>
          )}
        </View>

        {showFilters && (
          <View style={[styles.filtersContainer, { backgroundColor: cardBgColor }]}>
            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: textColor }]}>Kategorier</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                {categories.map((category, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.filterChip,
                      { 
                        backgroundColor: selectedCategories.includes(category.id) 
                          ? category.color 
                          : isDark ? '#3a3a3a' : '#f0f0f0'
                      }
                    ]}
                    onPress={() => toggleCategoryFilter(category.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.filterChipEmoji}>{category.emoji}</Text>
                    <Text style={[
                      styles.filterChipText,
                      { color: selectedCategories.includes(category.id) ? '#fff' : textColor }
                    ]}>
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {externalCalendars.length > 0 && (
              <View style={styles.filterSection}>
                <Text style={[styles.filterSectionTitle, { color: textColor }]}>Eksterne kalendere</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
                  {externalCalendars.map((calendar, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.filterChip,
                        { 
                          backgroundColor: selectedExternalCalendars.includes(calendar.id) 
                            ? colors.secondary 
                            : isDark ? '#3a3a3a' : '#f0f0f0',
                          opacity: calendar.enabled ? 1 : 0.5
                        }
                      ]}
                      onPress={() => toggleExternalCalendarFilter(calendar.id)}
                      disabled={!calendar.enabled}
                      activeOpacity={0.7}
                    >
                      <IconSymbol 
                        ios_icon_name="calendar" 
                        android_material_icon_name="event" 
                        size={18} 
                        color={selectedExternalCalendars.includes(calendar.id) ? '#fff' : textColor} 
                      />
                      <Text style={[
                        styles.filterChipText,
                        { color: selectedExternalCalendars.includes(calendar.id) ? '#fff' : textColor }
                      ]}>
                        {calendar.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* Selection Bar - Mobile Optimized */}
        {selectedActivities.length > 0 && (
          <View style={[styles.selectionBar, { backgroundColor: colors.primary }]}>
            <Text style={styles.selectionText}>{selectedActivities.length} valgt</Text>
            <View style={styles.selectionActions}>
              {externalFilteredActivities.some(a => selectedActivities.includes(a.id)) && (
                <TouchableOpacity onPress={handleImportSelected} style={styles.selectionButton} activeOpacity={0.7}>
                  <IconSymbol ios_icon_name="square.and.arrow.down" android_material_icon_name="download" size={22} color="#fff" />
                  <Text style={styles.selectionButtonText}>Importer</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                onPress={deleteSelectedActivities} 
                style={styles.selectionButton} 
                activeOpacity={0.7}
                disabled={isDeletingActivities}
              >
                {isDeletingActivities ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <React.Fragment>
                    <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={22} color="#fff" />
                    <Text style={styles.selectionButtonText}>Slet</Text>
                  </React.Fragment>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Action Buttons - Mobile Optimized */}
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={selectAllActivities} style={styles.actionButton} activeOpacity={0.7}>
            <IconSymbol
              ios_icon_name={selectedActivities.length === filteredActivities.length ? "checkmark.square.fill" : "square"}
              android_material_icon_name={selectedActivities.length === filteredActivities.length ? "check_box" : "check_box_outline_blank"}
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.actionButtonText, { color: colors.primary }]}>Vælg alle</Text>
          </TouchableOpacity>

          {externalFilteredActivities.length > 0 && (
            <TouchableOpacity onPress={selectAllExternalActivities} style={styles.actionButton} activeOpacity={0.7}>
              <IconSymbol
                ios_icon_name="checkmark.square"
                android_material_icon_name="check_box"
                size={24}
                color={colors.secondary}
              />
              <Text style={[styles.actionButtonText, { color: colors.secondary }]}>Marker alle eksterne</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Activities List - Mobile Optimized */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>
            Alle aktiviteter ({filteredActivities.length})
          </Text>
          
          {filteredActivities.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
              <IconSymbol 
                ios_icon_name="calendar.badge.exclamationmark" 
                android_material_icon_name="event_busy" 
                size={56} 
                color={textSecondaryColor} 
              />
              <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen aktiviteter fundet</Text>
              {externalCalendars.length === 0 && (
                <Text style={[styles.emptyHint, { color: textSecondaryColor }]}>
                  Tilføj en ekstern kalender for at se aktiviteter
                </Text>
              )}
            </View>
          ) : (
            filteredActivities.map((activity, index) => (
              <View
                key={index}
                style={[
                  styles.activityCard, 
                  { backgroundColor: cardBgColor },
                  activity.isExternal && [styles.externalActivityCard, { borderColor: colors.secondary }]
                ]}
              >
                <TouchableOpacity
                  style={styles.activityContent}
                  onPress={() => handleActivityPress(activity.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.activityLeft}>
                    <TouchableOpacity
                      style={[
                        styles.activityCheckbox,
                        { borderColor: colors.primary },
                        selectedActivities.includes(activity.id) && { backgroundColor: colors.primary }
                      ]}
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleActivitySelection(activity.id);
                      }}
                      activeOpacity={0.7}
                    >
                      {selectedActivities.includes(activity.id) && (
                        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={18} color="#fff" />
                      )}
                    </TouchableOpacity>
                    <View style={[styles.activityColorBar, { backgroundColor: activity.category.color }]} />
                    <View style={styles.activityInfo}>
                      <View style={styles.activityTitleRow}>
                        <Text style={styles.activityEmoji}>{activity.category.emoji}</Text>
                        <Text style={[styles.activityTitle, { color: textColor }]} numberOfLines={1}>
                          {activity.title}
                        </Text>
                      </View>
                      {activity.isExternal && (
                        <View style={[styles.externalBadge, { backgroundColor: colors.secondary }]}>
                          <Text style={styles.externalBadgeText}>Ekstern</Text>
                        </View>
                      )}
                      <Text style={[styles.activityDate, { color: textSecondaryColor }]}>
                        {formatDateTime(activity.date, activity.time)}
                      </Text>
                      <View style={styles.activityLocationRow}>
                        <IconSymbol 
                          ios_icon_name="mappin.circle" 
                          android_material_icon_name="location_on" 
                          size={16} 
                          color={textSecondaryColor} 
                        />
                        <Text style={[styles.activityLocation, { color: textSecondaryColor }]} numberOfLines={1}>
                          {activity.location}
                        </Text>
                      </View>
                    </View>
                    <IconSymbol 
                      ios_icon_name="chevron.right" 
                      android_material_icon_name="chevron_right" 
                      size={24} 
                      color={textSecondaryColor} 
                    />
                  </View>
                </TouchableOpacity>
                <View style={styles.activityActions}>
                  {activity.isExternal ? (
                    <TouchableOpacity 
                      onPress={(e) => {
                        e.stopPropagation();
                        handleImportActivity(activity.id);
                      }} 
                      style={styles.activityActionButton}
                      activeOpacity={0.7}
                    >
                      <IconSymbol 
                        ios_icon_name="square.and.arrow.down" 
                        android_material_icon_name="download" 
                        size={26} 
                        color={colors.secondary} 
                      />
                    </TouchableOpacity>
                  ) : (
                    <React.Fragment>
                      <TouchableOpacity 
                        onPress={(e) => {
                          e.stopPropagation();
                          duplicateActivity(activity.id);
                        }} 
                        style={styles.activityActionButton}
                        activeOpacity={0.7}
                      >
                        <IconSymbol 
                          ios_icon_name="doc.on.doc" 
                          android_material_icon_name="content_copy" 
                          size={24} 
                          color={colors.secondary} 
                        />
                      </TouchableOpacity>
                      <TouchableOpacity 
                        onPress={async (e) => {
                          e.stopPropagation();
                          try {
                            await deleteActivity(activity.id);
                            console.log('Activity deleted successfully');
                          } catch (error: any) {
                            console.error('Error deleting activity:', error);
                            Alert.alert('Fejl', `Kunne ikke slette aktiviteten: ${error?.message || 'Ukendt fejl'}`);
                          }
                        }} 
                        style={styles.activityActionButton}
                        activeOpacity={0.7}
                      >
                        <IconSymbol 
                          ios_icon_name="trash" 
                          android_material_icon_name="delete" 
                          size={24} 
                          color={colors.error} 
                        />
                      </TouchableOpacity>
                    </React.Fragment>
                  )}
                </View>
              </View>
            ))
          )}
        </View>

        {/* Bottom Padding for Tab Bar */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Add Calendar Modal - Mobile Optimized */}
      <Modal visible={isCalendarModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Tilføj ekstern kalender</Text>
              <TouchableOpacity onPress={() => setIsCalendarModalVisible(false)} activeOpacity={0.7}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={32} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {!isAuthenticated && (
                <View style={[styles.authWarningBox, { backgroundColor: isDark ? '#4a3a2a' : '#fff3cd' }]}>
                  <IconSymbol 
                    ios_icon_name="exclamationmark.triangle.fill" 
                    android_material_icon_name="warning" 
                    size={28} 
                    color={isDark ? '#ffc107' : '#856404'} 
                  />
                  <Text style={[styles.authWarningText, { color: isDark ? '#ffc107' : '#856404' }]}>
                    Du skal være logget ind for at gemme eksterne kalendere. Log ind først for at fortsætte.
                  </Text>
                </View>
              )}

              <Text style={[styles.label, { color: textColor }]}>Kalender navn</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={newCalendarName}
                onChangeText={setNewCalendarName}
                placeholder="F.eks. Klubkalender"
                placeholderTextColor={textSecondaryColor}
                editable={isAuthenticated && !isAddingCalendar}
              />

              <Text style={[styles.label, { color: textColor }]}>ICS URL (webcal:// eller https://)</Text>
              <TextInput
                style={[styles.input, styles.multilineInput, { backgroundColor: bgColor, color: textColor }]}
                value={newCalendarUrl}
                onChangeText={setNewCalendarUrl}
                placeholder="webcal://..."
                placeholderTextColor={textSecondaryColor}
                autoCapitalize="none"
                multiline
                numberOfLines={3}
                editable={isAuthenticated && !isAddingCalendar}
              />

              <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
                <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info" size={24} color={colors.secondary} />
                <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
                  Indsæt en iCal URL (webcal:// eller https://) fra din eksterne kalender. Eksempel:{'\n\n'}
                  webcal://ical.dbu.dk/TeamActivities.ashx?userkey=...{'\n\n'}
                  Kalenderen vil automatisk blive synkroniseret når du tilføjer den.
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: bgColor, borderColor: colors.highlight }]}
                onPress={() => setIsCalendarModalVisible(false)}
                activeOpacity={0.7}
                disabled={isAddingCalendar}
              >
                <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton, 
                  styles.saveButton, 
                  { backgroundColor: isAuthenticated && !isAddingCalendar ? colors.primary : colors.highlight }
                ]}
                onPress={handleAddCalendar}
                activeOpacity={0.7}
                disabled={!isAuthenticated || isAddingCalendar}
              >
                {isAddingCalendar ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={[styles.modalButtonText, { color: '#fff' }]}>Tilføj</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import Modal - Mobile Optimized */}
      <Modal visible={isImportModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                {activityToImport === 'multiple' ? 'Importer valgte aktiviteter' : 'Importer aktivitet'}
              </Text>
              <TouchableOpacity onPress={() => setIsImportModalVisible(false)} activeOpacity={0.7}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={32} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: textColor }]}>Vælg kategori</Text>
              <View style={styles.categoryGrid}>
                {categories.map((category, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.categoryOption,
                      { 
                        backgroundColor: selectedImportCategory === category.id 
                          ? category.color 
                          : isDark ? '#3a3a3a' : '#f0f0f0'
                      }
                    ]}
                    onPress={() => setSelectedImportCategory(category.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.categoryOptionEmoji}>{category.emoji}</Text>
                    <Text style={[
                      styles.categoryOptionText,
                      { color: selectedImportCategory === category.id ? '#fff' : textColor }
                    ]}>
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: bgColor, borderColor: colors.highlight }]}
                onPress={() => setIsImportModalVisible(false)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={activityToImport === 'multiple' ? confirmMultipleImport : confirmImport}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Importer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 36,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 16,
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginTop: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  externalCalendarSection: {
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  externalCalendarHeader: {
    marginBottom: 16,
  },
  externalCalendarHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  externalCalendarTitleContainer: {
    flex: 1,
  },
  externalCalendarTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  externalCalendarSubtitle: {
    fontSize: 15,
  },
  addCalendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 8,
  },
  addCalendarButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  manageCalendarsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  manageCalendarsText: {
    fontSize: 16,
    fontWeight: '600',
  },
  calendarDropdown: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
  },
  calendarDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  calendarToggleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  calendarDropdownInfo: {
    flex: 1,
  },
  calendarDropdownName: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  calendarDropdownMeta: {
    fontSize: 14,
    marginBottom: 2,
  },
  calendarDropdownSync: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  toggle: {
    width: 56,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.highlight,
    padding: 2,
  },
  toggleThumb: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    transform: [{ translateX: 24 }],
  },
  toggleLoadingContainer: {
    width: 56,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarActions: {
    flexDirection: 'row',
    gap: 8,
  },
  syncButton: {
    padding: 8,
  },
  deleteButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 17,
  },
  clearSearchButton: {
    padding: 4,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  filterToggleText: {
    fontSize: 18,
    fontWeight: '600',
  },
  clearFiltersButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  clearFiltersText: {
    fontSize: 16,
    fontWeight: '600',
  },
  filtersContainer: {
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 16,
    padding: 16,
  },
  filterSection: {
    marginBottom: 16,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    marginRight: 10,
  },
  filterChipEmoji: {
    fontSize: 18,
  },
  filterChipText: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 14,
  },
  selectionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 16,
  },
  selectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  emptyCard: {
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    gap: 14,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
  },
  emptyHint: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 6,
  },
  activityCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  externalActivityCard: {
    borderWidth: 2,
  },
  activityContent: {
    flex: 1,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  activityCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityColorBar: {
    width: 5,
    height: 70,
    borderRadius: 3,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  activityEmoji: {
    fontSize: 22,
  },
  activityTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  externalBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 6,
  },
  externalBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  activityDate: {
    fontSize: 15,
    marginBottom: 4,
  },
  activityLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityLocation: {
    fontSize: 14,
    flex: 1,
  },
  activityActions: {
    flexDirection: 'row',
    gap: 12,
    marginLeft: 8,
  },
  activityActionButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 24,
  },
  authWarningBox: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  authWarningText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  label: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 10,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 17,
    marginBottom: 20,
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    borderRadius: 12,
    marginTop: 10,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 14,
    minWidth: '47%',
  },
  categoryOptionEmoji: {
    fontSize: 24,
  },
  categoryOptionText: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 14,
    padding: 24,
    borderTopWidth: 1,
    borderTopColor: colors.highlight,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 2,
  },
  saveButton: {},
  modalButtonText: {
    fontSize: 18,
    fontWeight: '600',
  },
});
