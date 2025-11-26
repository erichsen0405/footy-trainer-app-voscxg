
import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, useColorScheme, Alert } from 'react-native';
import { useFootball } from '@/contexts/FootballContext';
import { colors } from '@/styles/commonStyles';
import { Activity } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';

export default function AdminScreen() {
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
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const enabledExternalCalendarIds = useMemo(() => 
    externalCalendars.filter(cal => cal.enabled).map(cal => cal.id),
    [externalCalendars]
  );

  const visibleExternalActivities = useMemo(() => 
    externalActivities.filter(activity => 
      activity.externalCalendarId && 
      enabledExternalCalendarIds.includes(activity.externalCalendarId) &&
      (selectedExternalCalendars.length === 0 || selectedExternalCalendars.includes(activity.externalCalendarId))
    ),
    [externalActivities, enabledExternalCalendarIds, selectedExternalCalendars]
  );

  const allActivities = useMemo(() => 
    [...activities, ...visibleExternalActivities].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    ),
    [activities, visibleExternalActivities]
  );

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

  const deleteSelectedActivities = () => {
    selectedActivities.forEach(id => {
      const activity = allActivities.find(a => a.id === id);
      if (activity && !activity.isExternal) {
        deleteActivity(id);
      }
    });
    setSelectedActivities([]);
  };

  const handleAddCalendar = () => {
    if (newCalendarUrl && newCalendarName) {
      addExternalCalendar({
        name: newCalendarName,
        icsUrl: newCalendarUrl,
        enabled: true,
      });
      setNewCalendarUrl('');
      setNewCalendarName('');
      setIsCalendarModalVisible(false);
    }
  };

  const handleDeleteCalendar = (calendarId: string) => {
    Alert.alert(
      'Slet kalender',
      'Er du sikker på at du vil slette denne kalender?',
      [
        { text: 'Annuller', style: 'cancel' },
        { 
          text: 'Slet', 
          style: 'destructive',
          onPress: () => deleteExternalCalendar(calendarId)
        }
      ]
    );
  };

  const handleImportActivity = (activityId: string) => {
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
    return new Date(date).toLocaleDateString('da-DK', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const hasActiveFilters = selectedCategories.length > 0 || selectedExternalCalendars.length > 0 || searchQuery.length > 0;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Admin</Text>
        <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
          {activities.length} aktiviteter • {externalCalendars.length} eksterne kalendere
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={textSecondaryColor} />
        <TextInput
          style={[styles.searchInput, { color: textColor }]}
          placeholder="Søg efter aktiviteter..."
          placeholderTextColor={textSecondaryColor}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={20} color={textSecondaryColor} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterHeader}>
        <TouchableOpacity 
          style={[styles.filterToggle, showFilters && styles.filterToggleActive]}
          onPress={() => setShowFilters(!showFilters)}
        >
          <IconSymbol 
            ios_icon_name="line.3.horizontal.decrease.circle" 
            android_material_icon_name="filter_list" 
            size={20} 
            color={showFilters ? colors.primary : textColor} 
          />
          <Text style={[styles.filterToggleText, { color: showFilters ? colors.primary : textColor }]}>
            Filtre {hasActiveFilters && `(${selectedCategories.length + selectedExternalCalendars.length})`}
          </Text>
        </TouchableOpacity>
        
        {hasActiveFilters && (
          <TouchableOpacity onPress={clearAllFilters} style={styles.clearFiltersButton}>
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
                  >
                    <IconSymbol 
                      ios_icon_name="calendar" 
                      android_material_icon_name="event" 
                      size={16} 
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

      {selectedActivities.length > 0 && (
        <View style={[styles.selectionBar, { backgroundColor: colors.primary }]}>
          <Text style={styles.selectionText}>{selectedActivities.length} valgt</Text>
          <View style={styles.selectionActions}>
            {externalFilteredActivities.some(a => selectedActivities.includes(a.id)) && (
              <TouchableOpacity onPress={handleImportSelected} style={styles.selectionButton}>
                <IconSymbol ios_icon_name="square.and.arrow.down" android_material_icon_name="download" size={20} color="#fff" />
                <Text style={styles.selectionButtonText}>Importer</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={deleteSelectedActivities} style={styles.selectionButton}>
              <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color="#fff" />
              <Text style={styles.selectionButtonText}>Slet</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.actionsRow}>
        <TouchableOpacity onPress={selectAllActivities} style={styles.actionButton}>
          <IconSymbol
            ios_icon_name={selectedActivities.length === filteredActivities.length ? "checkmark.square.fill" : "square"}
            android_material_icon_name={selectedActivities.length === filteredActivities.length ? "check_box" : "check_box_outline_blank"}
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.actionButtonText, { color: colors.primary }]}>Vælg alle</Text>
        </TouchableOpacity>

        {externalFilteredActivities.length > 0 && (
          <TouchableOpacity onPress={selectAllExternalActivities} style={styles.actionButton}>
            <IconSymbol
              ios_icon_name="checkmark.square"
              android_material_icon_name="check_box"
              size={20}
              color={colors.secondary}
            />
            <Text style={[styles.actionButtonText, { color: colors.secondary }]}>Marker alle eksterne</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity 
          onPress={() => setIsCalendarDropdownVisible(!isCalendarDropdownVisible)} 
          style={styles.actionButton}
        >
          <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={20} color={colors.secondary} />
          <Text style={[styles.actionButtonText, { color: colors.secondary }]}>Eksterne kalendere</Text>
          <IconSymbol 
            ios_icon_name={isCalendarDropdownVisible ? "chevron.up" : "chevron.down"} 
            android_material_icon_name={isCalendarDropdownVisible ? "expand_less" : "expand_more"} 
            size={16} 
            color={colors.secondary} 
          />
        </TouchableOpacity>
      </View>

      {isCalendarDropdownVisible && (
        <View style={[styles.calendarDropdown, { backgroundColor: cardBgColor }]}>
          <View style={styles.calendarDropdownHeader}>
            <Text style={[styles.calendarDropdownTitle, { color: textColor }]}>Eksterne kalendere</Text>
            <TouchableOpacity onPress={() => setIsCalendarModalVisible(true)}>
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add_circle" size={24} color={colors.primary} />
            </TouchableOpacity>
          </View>
          
          {externalCalendars.length === 0 ? (
            <Text style={[styles.emptyCalendarText, { color: textSecondaryColor }]}>
              Ingen eksterne kalendere tilføjet
            </Text>
          ) : (
            externalCalendars.map((calendar, index) => (
              <View key={index} style={styles.calendarDropdownItem}>
                <TouchableOpacity 
                  style={styles.calendarToggleArea}
                  onPress={() => toggleCalendar(calendar.id)}
                >
                  <View style={[styles.toggle, calendar.enabled && styles.toggleActive]}>
                    <View style={[styles.toggleThumb, calendar.enabled && styles.toggleThumbActive]} />
                  </View>
                  <View style={styles.calendarDropdownInfo}>
                    <Text style={[styles.calendarDropdownName, { color: textColor }]}>{calendar.name}</Text>
                    <Text style={[styles.calendarDropdownMeta, { color: textSecondaryColor }]}>
                      {calendar.eventCount || 0} begivenheder
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeleteCalendar(calendar.id)}>
                  <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>
            Alle aktiviteter ({filteredActivities.length})
          </Text>
          
          {filteredActivities.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
              <IconSymbol ios_icon_name="calendar.badge.exclamationmark" android_material_icon_name="event_busy" size={48} color={textSecondaryColor} />
              <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen aktiviteter fundet</Text>
            </View>
          ) : (
            filteredActivities.map((activity, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.activityCard, 
                  { backgroundColor: cardBgColor },
                  activity.isExternal && styles.externalActivityCard
                ]}
                onPress={() => toggleActivitySelection(activity.id)}
              >
                <View style={styles.activityHeader}>
                  <View style={styles.activityLeft}>
                    <View style={[
                      styles.activityCheckbox,
                      selectedActivities.includes(activity.id) && styles.activityCheckboxSelected
                    ]}>
                      {selectedActivities.includes(activity.id) && (
                        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
                      )}
                    </View>
                    <View style={[styles.activityColorBar, { backgroundColor: activity.category.color }]} />
                    <View style={styles.activityInfo}>
                      <View style={styles.activityTitleRow}>
                        <Text style={styles.activityEmoji}>{activity.category.emoji}</Text>
                        <Text style={[styles.activityTitle, { color: textColor }]}>{activity.title}</Text>
                        {activity.isExternal && (
                          <View style={[styles.externalBadge, { backgroundColor: colors.secondary }]}>
                            <Text style={styles.externalBadgeText}>Ekstern</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.activityDate, { color: textSecondaryColor }]}>
                        {formatDate(activity.date)}
                      </Text>
                      <View style={styles.activityLocationRow}>
                        <IconSymbol ios_icon_name="mappin.circle" android_material_icon_name="location_on" size={14} color={textSecondaryColor} />
                        <Text style={[styles.activityLocation, { color: textSecondaryColor }]}>
                          {activity.location}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.activityActions}>
                    {activity.isExternal ? (
                      <TouchableOpacity 
                        onPress={() => handleImportActivity(activity.id)} 
                        style={styles.activityActionButton}
                      >
                        <IconSymbol ios_icon_name="square.and.arrow.down" android_material_icon_name="download" size={20} color={colors.secondary} />
                      </TouchableOpacity>
                    ) : (
                      <React.Fragment>
                        <TouchableOpacity onPress={() => duplicateActivity(activity.id)} style={styles.activityActionButton}>
                          <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content_copy" size={20} color={colors.secondary} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => deleteActivity(activity.id)} style={styles.activityActionButton}>
                          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
                        </TouchableOpacity>
                      </React.Fragment>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal visible={isCalendarModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>Tilføj ekstern kalender</Text>
              <TouchableOpacity onPress={() => setIsCalendarModalVisible(false)}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={28} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={[styles.label, { color: textColor }]}>Kalender navn</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={newCalendarName}
                onChangeText={setNewCalendarName}
                placeholder="F.eks. Klubkalender"
                placeholderTextColor={textSecondaryColor}
              />

              <Text style={[styles.label, { color: textColor }]}>ICS URL (webcal:// eller https://)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={newCalendarUrl}
                onChangeText={setNewCalendarUrl}
                placeholder="webcal://..."
                placeholderTextColor={textSecondaryColor}
                autoCapitalize="none"
                multiline
              />

              <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
                <IconSymbol ios_icon_name="info.circle" android_material_icon_name="info" size={20} color={colors.secondary} />
                <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
                  Indsæt en iCal URL (webcal:// eller https://) fra din eksterne kalender
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: bgColor }]}
                onPress={() => setIsCalendarModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={handleAddCalendar}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Tilføj</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isImportModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                {activityToImport === 'multiple' ? 'Importer valgte aktiviteter' : 'Importer aktivitet'}
              </Text>
              <TouchableOpacity onPress={() => setIsImportModalVisible(false)}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={28} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
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
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: bgColor }]}
                onPress={() => setIsImportModalVisible(false)}
              >
                <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={activityToImport === 'multiple' ? confirmMultipleImport : confirmImport}
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
  header: {
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  filterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  filterToggleActive: {
    opacity: 1,
  },
  filterToggleText: {
    fontSize: 16,
    fontWeight: '600',
  },
  clearFiltersButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  clearFiltersText: {
    fontSize: 14,
    fontWeight: '600',
  },
  filtersContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  filterChipEmoji: {
    fontSize: 16,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '600',
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
  },
  selectionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  selectionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  selectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  selectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  calendarDropdown: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  calendarDropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calendarDropdownTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  calendarDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  calendarToggleArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  calendarDropdownInfo: {
    flex: 1,
  },
  calendarDropdownName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  calendarDropdownMeta: {
    fontSize: 12,
  },
  emptyCalendarText: {
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 12,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.highlight,
    padding: 2,
  },
  toggleActive: {
    backgroundColor: colors.primary,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  emptyCard: {
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
  },
  activityCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  externalActivityCard: {
    borderWidth: 2,
    borderColor: colors.secondary,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  activityCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityCheckboxSelected: {
    backgroundColor: colors.primary,
  },
  activityColorBar: {
    width: 4,
    height: 60,
    borderRadius: 2,
  },
  activityInfo: {
    flex: 1,
  },
  activityTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  activityEmoji: {
    fontSize: 20,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  externalBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  externalBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  activityDate: {
    fontSize: 14,
    marginBottom: 2,
  },
  activityLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activityLocation: {
    fontSize: 12,
  },
  activityActions: {
    flexDirection: 'row',
    gap: 8,
  },
  activityActionButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    minWidth: '45%',
  },
  categoryOptionEmoji: {
    fontSize: 20,
  },
  categoryOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: colors.highlight,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: colors.highlight,
  },
  saveButton: {},
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
