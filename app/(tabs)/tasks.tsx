
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, useColorScheme, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { useFootball } from '@/contexts/FootballContext';
import { colors } from '@/styles/commonStyles';
import { Task } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';

export default function TasksScreen() {
  const { tasks, categories, addTask, updateTask, deleteTask, duplicateTask } = useFootball();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const templateTasks = tasks.filter(task => task.isTemplate);
  const activityTasks = tasks.filter(task => !task.isTemplate);

  const filteredTemplateTasks = templateTasks.filter(task =>
    task.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    // Simulate refresh - in a real app, you would fetch data here
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  }, []);

  const openTaskModal = (task: Task | null, creating: boolean = false) => {
    setSelectedTask(task);
    setIsCreating(creating);
    setIsModalVisible(true);
  };

  const closeTaskModal = () => {
    setSelectedTask(null);
    setIsCreating(false);
    setIsModalVisible(false);
  };

  const handleSaveTask = () => {
    if (selectedTask) {
      if (isCreating) {
        addTask(selectedTask);
      } else {
        updateTask(selectedTask.id, selectedTask);
      }
    }
    closeTaskModal();
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTask(taskId);
    closeTaskModal();
  };

  const handleDuplicateTask = (taskId: string) => {
    duplicateTask(taskId);
  };

  const toggleCategory = (categoryId: string) => {
    if (selectedTask) {
      const categoryIds = selectedTask.categoryIds.includes(categoryId)
        ? selectedTask.categoryIds.filter(id => id !== categoryId)
        : [...selectedTask.categoryIds, categoryId];
      
      setSelectedTask({ ...selectedTask, categoryIds });
    }
  };

  const getCategoryNames = (categoryIds: string[]) => {
    return categoryIds
      .map(id => categories.find(c => c.id === id)?.name.toLowerCase())
      .filter(Boolean)
      .join(', ');
  };

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Opgaver</Text>
        <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
          {templateTasks.length} skabeloner
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <IconSymbol ios_icon_name="magnifyingglass" android_material_icon_name="search" size={20} color={textSecondaryColor} />
        <TextInput
          style={[styles.searchInput, { color: textColor }]}
          placeholder="Søg efter opgaver..."
          placeholderTextColor={textSecondaryColor}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Skabeloner</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => openTaskModal({
                id: '',
                title: '',
                description: '',
                completed: false,
                isTemplate: true,
                categoryIds: [],
                subtasks: [],
              }, true)}
            >
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add_circle" size={28} color={colors.primary} />
              <Text style={[styles.addButtonText, { color: colors.primary }]}>Ny skabelon</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            Rediger skabeloner her for at opdatere alle relaterede opgaver
          </Text>

          {filteredTemplateTasks.map((task, index) => {
            const uniqueKey = task.id ? `template-${task.id}` : `template-index-${index}`;
            return (
              <TouchableOpacity
                key={uniqueKey}
                style={[styles.taskCard, { backgroundColor: cardBgColor }]}
                onPress={() => openTaskModal(task)}
              >
                <View style={styles.taskHeader}>
                  <View style={styles.taskHeaderLeft}>
                    <IconSymbol ios_icon_name="doc.text" android_material_icon_name="description" size={20} color={colors.secondary} />
                    <View style={styles.checkbox} />
                    <Text style={[styles.taskTitle, { color: textColor }]}>{task.title}</Text>
                  </View>
                  <View style={styles.taskActions}>
                    <TouchableOpacity onPress={() => handleDuplicateTask(task.id)} style={styles.actionButton}>
                      <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content_copy" size={20} color={colors.secondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openTaskModal(task)} style={styles.actionButton}>
                      <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteTask(task.id)} style={styles.actionButton}>
                      <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>

                {task.reminder && (
                  <View style={styles.reminderBadge}>
                    <IconSymbol ios_icon_name="bell.fill" android_material_icon_name="notifications" size={14} color={colors.accent} />
                    <Text style={[styles.reminderText, { color: colors.accent }]}>{task.reminder} min før</Text>
                  </View>
                )}

                <View style={styles.categoriesRow}>
                  <IconSymbol ios_icon_name="tag.fill" android_material_icon_name="label" size={14} color={textSecondaryColor} />
                  <Text style={[styles.categoriesText, { color: textSecondaryColor }]}>
                    Vises automatisk på alle {getCategoryNames(task.categoryIds)} aktiviteter
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Aktivitetsopgaver</Text>
            <Text style={[styles.taskCount, { color: textSecondaryColor }]}>{activityTasks.length} opgaver</Text>
          </View>
          
          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            Opgaver der ikke er tilknyttet skabeloner
          </Text>

          {activityTasks.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: cardBgColor }]}>
              <Text style={[styles.emptyText, { color: textSecondaryColor }]}>Ingen aktivitetsopgaver</Text>
            </View>
          ) : (
            activityTasks.map((task, index) => {
              const uniqueKey = task.id ? `activity-${task.id}` : `activity-index-${index}`;
              return (
                <View key={uniqueKey} style={[styles.taskCard, { backgroundColor: cardBgColor }]}>
                  <View style={styles.taskHeader}>
                    <View style={styles.taskHeaderLeft}>
                      <View style={[styles.checkbox, task.completed && styles.checkboxChecked]}>
                        {task.completed && (
                          <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={16} color="#fff" />
                        )}
                      </View>
                      <Text style={[styles.taskTitle, { color: textColor }, task.completed && styles.taskTitleCompleted]}>
                        {task.title}
                      </Text>
                    </View>
                    <View style={styles.taskActions}>
                      <TouchableOpacity onPress={() => openTaskModal(task)} style={styles.actionButton}>
                        <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.accent} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDeleteTask(task.id)} style={styles.actionButton}>
                        <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {task.reminder && (
                    <View style={styles.reminderBadge}>
                      <IconSymbol ios_icon_name="bell.fill" android_material_icon_name="notifications" size={14} color={colors.accent} />
                      <Text style={[styles.reminderText, { color: colors.accent }]}>{task.reminder} min før</Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal visible={isModalVisible} animationType="slide" transparent={true}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={[styles.modalContent, { backgroundColor: cardBgColor }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: textColor }]}>
                {isCreating ? 'Ny opgave' : 'Rediger opgave'}
              </Text>
              <TouchableOpacity onPress={closeTaskModal}>
                <IconSymbol ios_icon_name="xmark.circle.fill" android_material_icon_name="close" size={28} color={textSecondaryColor} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <Text style={[styles.label, { color: textColor }]}>Titel</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={selectedTask?.title}
                onChangeText={(text) => setSelectedTask(selectedTask ? { ...selectedTask, title: text } : null)}
                placeholder="Opgavens titel"
                placeholderTextColor={textSecondaryColor}
              />

              <Text style={[styles.label, { color: textColor }]}>Beskrivelse</Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: bgColor, color: textColor }]}
                value={selectedTask?.description}
                onChangeText={(text) => setSelectedTask(selectedTask ? { ...selectedTask, description: text } : null)}
                placeholder="Beskrivelse af opgaven"
                placeholderTextColor={textSecondaryColor}
                multiline
                numberOfLines={4}
              />

              <Text style={[styles.label, { color: textColor }]}>Påmindelse (minutter før)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={selectedTask?.reminder?.toString() || ''}
                onChangeText={(text) => setSelectedTask(selectedTask ? { ...selectedTask, reminder: parseInt(text) || undefined } : null)}
                placeholder="15"
                placeholderTextColor={textSecondaryColor}
                keyboardType="numeric"
              />

              <Text style={[styles.label, { color: textColor }]}>Aktivitetskategorier</Text>
              <View style={styles.categoriesGrid}>
                {categories.map((category, index) => {
                  const uniqueKey = category.id ? `category-${category.id}` : `category-index-${index}`;
                  return (
                    <TouchableOpacity
                      key={uniqueKey}
                      style={[
                        styles.categoryChip,
                        {
                          backgroundColor: selectedTask?.categoryIds.includes(category.id) ? category.color : bgColor,
                          borderColor: category.color,
                          borderWidth: 2,
                        },
                      ]}
                      onPress={() => toggleCategory(category.id)}
                    >
                      <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                      <Text style={[
                        styles.categoryName,
                        { color: selectedTask?.categoryIds.includes(category.id) ? '#fff' : textColor }
                      ]}>
                        {category.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: bgColor }]}
                onPress={closeTaskModal}
              >
                <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, { backgroundColor: colors.primary }]}
                onPress={handleSaveTask}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>Gem</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 60 : 70,
    paddingHorizontal: 16,
    paddingBottom: 16,
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
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  taskCount: {
    fontSize: 16,
  },
  sectionDescription: {
    fontSize: 14,
    marginBottom: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  taskCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  taskActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 4,
  },
  reminderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  reminderText: {
    fontSize: 12,
    fontWeight: '600',
  },
  categoriesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  categoriesText: {
    fontSize: 12,
    flex: 1,
  },
  emptyCard: {
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
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
    maxHeight: '60%',
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
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  categoryEmoji: {
    fontSize: 16,
  },
  categoryName: {
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
