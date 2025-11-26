
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, useColorScheme } from 'react-native';
import { useFootball } from '@/contexts/FootballContext';
import { colors } from '@/styles/commonStyles';
import { Activity } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';

export default function AdminScreen() {
  const { activities, categories, deleteActivity, duplicateActivity, updateActivity, externalCalendars, addExternalCalendar, toggleCalendar } = useFootball();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [isCalendarModalVisible, setIsCalendarModalVisible] = useState(false);
  const [newCalendarUrl, setNewCalendarUrl] = useState('');
  const [newCalendarName, setNewCalendarName] = useState('');
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = activity.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategories.length === 0 || selectedCategories.includes(activity.category.id);
    return matchesSearch && matchesCategory;
  });

  const toggleCategoryFilter = (categoryId: string) => {
    setSelectedCategories(prev =>
      prev.includes(categoryId)
        ? prev.filter(id => id !== categoryId)
        : [...prev, categoryId]
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

  const deleteSelectedActivities = () => {
    selectedActivities.forEach(id => deleteActivity(id));
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

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Admin</Text>
        <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
          {activities.length} aktiviteter
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.createButton, { backgroundColor: colors.primary }]}
        onPress={() => console.log('Create activity')}
      >
        <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={20} color="#fff" />
        <Text style={styles.createButtonText}>Opret aktivitet</Text>
      </TouchableOpacity>

      <View style={styles.searchContainer}>
        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={textSecondaryColor} />
        <TextInput
          style={[styles.searchInput, { color: textColor }]}
          placeholder="Søg efter aktiviteter..."
          placeholderTextColor={textSecondaryColor}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
        {categories.map((category, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.categoryFilter,
              { backgroundColor: selectedCategories.includes(category.id) ? category.color : cardBgColor }
            ]}
            onPress={() => toggleCategoryFilter(category.id)}
          >
            <Text style={styles.categoryFilterEmoji}>{category.emoji}</Text>
            <Text style={[
              styles.categoryFilterText,
              { color: selectedCategories.includes(category.id) ? '#fff' : textColor }
            ]}>
              {category.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {selectedActivities.length > 0 && (
        <View style={[styles.selectionBar, { backgroundColor: colors.primary }]}>
          <Text style={styles.selectionText}>{selectedActivities.length} valgt</Text>
          <View style={styles.selectionActions}>
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
        
        <TouchableOpacity onPress={() => setIsCalendarModalVisible(true)} style={styles.actionButton}>
          <IconSymbol ios_icon_name="calendar.badge.plus" android_material_icon_name="event" size={20} color={colors.secondary} />
          <Text style={[styles.actionButtonText, { color: colors.secondary }]}>Ekstern kalender</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {externalCalendars.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Eksterne kalendere</Text>
            {externalCalendars.map((calendar, index) => (
              <View key={index} style={[styles.calendarCard, { backgroundColor: cardBgColor }]}>
                <View style={styles.calendarHeader}>
                  <IconSymbol ios_icon_name="calendar" android_material_icon_name="event" size={24} color={colors.secondary} />
                  <View style={styles.calendarInfo}>
                    <Text style={[styles.calendarName, { color: textColor }]}>{calendar.name}</Text>
                    <Text style={[styles.calendarUrl, { color: textSecondaryColor }]} numberOfLines={1}>
                      {calendar.icsUrl}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => toggleCalendar(calendar.id)}>
                    <View style={[styles.toggle, calendar.enabled && styles.toggleActive]}>
                      <View style={[styles.toggleThumb, calendar.enabled && styles.toggleThumbActive]} />
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>
            Alle aktiviteter ({filteredActivities.length})
          </Text>
          
          {filteredActivities.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
              <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen aktiviteter fundet</Text>
            </View>
          ) : (
            filteredActivities.map((activity, index) => (
              <TouchableOpacity
                key={index}
                style={[styles.activityCard, { backgroundColor: cardBgColor }]}
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
                    <TouchableOpacity onPress={() => duplicateActivity(activity.id)} style={styles.activityActionButton}>
                      <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content_copy" size={20} color={colors.secondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteActivity(activity.id)} style={styles.activityActionButton}>
                      <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
                    </TouchableOpacity>
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

            <View style={styles.modalBody}>
              <Text style={[styles.label, { color: textColor }]}>Kalender navn</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={newCalendarName}
                onChangeText={setNewCalendarName}
                placeholder="F.eks. Klubkalender"
                placeholderTextColor={textSecondaryColor}
              />

              <Text style={[styles.label, { color: textColor }]}>ICS URL</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={newCalendarUrl}
                onChangeText={setNewCalendarUrl}
                placeholder="https://..."
                placeholderTextColor={textSecondaryColor}
                autoCapitalize="none"
              />
            </View>

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
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
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
  categoriesScroll: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  categoryFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
  },
  categoryFilterEmoji: {
    fontSize: 16,
  },
  categoryFilterText: {
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
    justifyContent: 'space-between',
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
  calendarCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  calendarInfo: {
    flex: 1,
  },
  calendarName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  calendarUrl: {
    fontSize: 12,
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
  emptyCard: {
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  activityCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
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
  },
  activityEmoji: {
    fontSize: 20,
  },
  activityTitle: {
    fontSize: 16,
    fontWeight: '600',
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
    maxHeight: '70%',
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
