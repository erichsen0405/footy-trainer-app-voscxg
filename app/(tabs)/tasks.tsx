
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal, useColorScheme, KeyboardAvoidingView, Platform, RefreshControl, Alert, Image } from 'react-native';
import { useFootball } from '@/contexts/FootballContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { useUserRole } from '@/hooks/useUserRole';
import { colors, getColors } from '@/styles/commonStyles';
import { Task } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import { WebView } from 'react-native-webview';
import ContextConfirmationDialog from '@/components/ContextConfirmationDialog';
import { supabase } from '@/app/integrations/supabase/client';

// Helper function to extract YouTube video ID
const getYouTubeVideoId = (url: string): string | null => {
  if (!url) return null;
  
  // Handle different YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
};

// Helper function to get YouTube thumbnail URL
const getYouTubeThumbnail = (url: string): string | null => {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
};

export default function TasksScreen() {
  const { tasks, categories, addTask, updateTask, deleteTask, duplicateTask, refreshData } = useFootball();
  const { selectedContext } = useTeamPlayer();
  const { isAdmin } = useUserRole();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>(['']);
  const [isSaving, setIsSaving] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getColors(colorScheme);
  
  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'create' | 'edit' | 'delete';
    data?: any;
  } | null>(null);

  const templateTasks = tasks.filter(task => task.isTemplate);

  const filteredTemplateTasks = templateTasks.filter(task =>
    task.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onRefresh = React.useCallback(async () => {
    console.log('Pull to refresh triggered on tasks screen');
    setRefreshing(true);
    
    try {
      // Trigger data refresh from context
      await refreshData();
      console.log('Tasks data refreshed successfully');
    } catch (error) {
      console.error('Error refreshing tasks data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  const openTaskModal = async (task: Task | null, creating: boolean = false) => {
    setSelectedTask(task);
    setIsCreating(creating);
    setVideoUrl(task?.videoUrl || '');
    
    // Load subtasks from database if editing existing task
    if (task && !creating) {
      try {
        const { data: subtasksData, error } = await supabase
          .from('task_template_subtasks')
          .select('*')
          .eq('task_template_id', task.id)
          .order('sort_order', { ascending: true });

        if (error) {
          console.error('Error loading subtasks:', error);
          setSubtasks(['']);
        } else if (subtasksData && subtasksData.length > 0) {
          setSubtasks(subtasksData.map(s => s.title));
        } else {
          setSubtasks(['']);
        }
      } catch (error) {
        console.error('Error loading subtasks:', error);
        setSubtasks(['']);
      }
    } else {
      setSubtasks(['']);
    }
    
    setIsModalVisible(true);
  };

  const closeTaskModal = () => {
    setSelectedTask(null);
    setIsCreating(false);
    setIsModalVisible(false);
    setVideoUrl('');
    setSubtasks(['']);
    setIsSaving(false);
  };

  const handleSaveTask = async () => {
    if (!selectedTask) return;
    
    // Check if we need confirmation (trainer/admin managing player/team data)
    if (isAdmin && selectedContext.type) {
      setPendingAction({
        type: isCreating ? 'create' : 'edit',
        data: { task: selectedTask, videoUrl, subtasks, isCreating },
      });
      setShowConfirmDialog(true);
      return;
    }
    
    await executeSaveTask();
  };

  const executeSaveTask = async () => {
    if (!selectedTask) return;

    setIsSaving(true);

    try {
      console.log('Updating task template:', selectedTask.id);
      console.log('Video URL:', videoUrl);

      const taskToSave = {
        ...selectedTask,
        videoUrl: videoUrl.trim() || undefined,
      };

      if (isCreating) {
        // Create new task template
        console.log('Creating new task template...');
        await addTask(taskToSave);
        Alert.alert('Succes', 'Opgaveskabelon oprettet');
      } else {
        // Update existing task template
        console.log('Updating existing task template...');
        await updateTask(selectedTask.id, taskToSave);
        
        // Save subtasks
        console.log('Saving subtasks...');
        // Delete existing subtasks
        await supabase
          .from('task_template_subtasks')
          .delete()
          .eq('task_template_id', selectedTask.id);

        // Insert new subtasks
        const validSubtasks = subtasks.filter(s => s.trim());
        if (validSubtasks.length > 0) {
          const subtasksToInsert = validSubtasks.map((subtask, index) => ({
            task_template_id: selectedTask.id,
            title: subtask,
            sort_order: index,
          }));

          await supabase
            .from('task_template_subtasks')
            .insert(subtasksToInsert);
        }

        Alert.alert('Succes', 'Opgaveskabelon opdateret');
      }

      console.log('Task saved successfully');
      closeTaskModal();
    } catch (error: any) {
      console.error('Error saving task:', error);
      Alert.alert('Fejl', 'Kunne ikke gemme opgave: ' + (error.message || 'Ukendt fejl'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    // Check if we need confirmation (trainer/admin managing player/team data)
    if (isAdmin && selectedContext.type) {
      setPendingAction({
        type: 'delete',
        data: { taskId },
      });
      setShowConfirmDialog(true);
      return;
    }
    
    deleteTask(taskId);
    closeTaskModal();
  };

  const handleConfirmAction = async () => {
    setShowConfirmDialog(false);
    
    if (!pendingAction) return;
    
    try {
      if (pendingAction.type === 'create' || pendingAction.type === 'edit') {
        await executeSaveTask();
      } else if (pendingAction.type === 'delete') {
        await deleteTask(pendingAction.data.taskId);
        closeTaskModal();
      }
    } catch (error) {
      console.error('Error executing action:', error);
    } finally {
      setPendingAction(null);
    }
  };

  const handleCancelAction = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
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

  const openVideoModal = (url: string) => {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) {
      Alert.alert('Fejl', 'Ugyldig YouTube URL');
      return;
    }
    
    // Use embed URL with proper parameters for mobile playback
    const embedUrl = `https://www.youtube.com/embed/${videoId}?playsinline=1&autoplay=1&rel=0&modestbranding=1&enablejsapi=1`;
    
    setSelectedVideoUrl(embedUrl);
    setShowVideoModal(true);
  };

  const addSubtask = () => {
    setSubtasks([...subtasks, '']);
  };

  const updateSubtask = (index: number, value: string) => {
    const newSubtasks = [...subtasks];
    newSubtasks[index] = value;
    setSubtasks(newSubtasks);
  };

  const removeSubtask = (index: number) => {
    if (subtasks.length > 1) {
      setSubtasks(subtasks.filter((_, i) => i !== index));
    }
  };

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  // Determine if we're in context management mode
  const isManagingContext = isAdmin && selectedContext.type;
  const containerBgColor = isManagingContext ? themeColors.contextWarning : bgColor;

  return (
    <View style={[styles.container, { backgroundColor: containerBgColor }]}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Opgaver</Text>
        <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
          {templateTasks.length} skabeloner
        </Text>
      </View>

      {/* Enhanced Context Banner for Trainers/Admins */}
      {isManagingContext && (
        <View style={[styles.contextBanner, { backgroundColor: '#D4A574' }]}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={28}
            color="#fff"
          />
          <View style={styles.contextBannerText}>
            <Text style={styles.contextBannerTitle}>
              ⚠️ DU ADMINISTRERER OPGAVER FOR {selectedContext.type === 'player' ? 'SPILLER' : 'TEAM'}
            </Text>
            <Text style={styles.contextBannerSubtitle}>
              {selectedContext.name}
            </Text>
            <Text style={styles.contextBannerInfo}>
              Alle ændringer påvirker denne {selectedContext.type === 'player' ? 'spillers' : 'teams'} opgaver
            </Text>
          </View>
        </View>
      )}

      {/* Info for Players */}
      {!isAdmin && (
        <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
          <IconSymbol
            ios_icon_name="info.circle"
            android_material_icon_name="info"
            size={20}
            color={colors.secondary}
          />
          <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
            Her ser du dine egne opgaveskabeloner samt opgaver som din træner har tildelt dig
          </Text>
        </View>
      )}

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
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
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
                videoUrl: undefined,
              }, true)}
            >
              <IconSymbol ios_icon_name="plus.circle.fill" android_material_icon_name="add_circle" size={28} color={colors.primary} />
              <Text style={[styles.addButtonText, { color: colors.primary }]}>Ny skabelon</Text>
            </TouchableOpacity>
          </View>
          
          <Text style={[styles.sectionDescription, { color: textSecondaryColor }]}>
            {isAdmin && selectedContext.type 
              ? `Opgaveskabeloner for ${selectedContext.name}. Disse vil automatisk blive tilføjet til relevante aktiviteter.`
              : 'Rediger skabeloner her for at opdatere alle relaterede opgaver'}
          </Text>

          {filteredTemplateTasks.map((task) => (
            <TouchableOpacity
              key={task.id}
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

              {task.videoUrl && (
                <TouchableOpacity 
                  style={styles.videoPreviewContainer}
                  onPress={() => openVideoModal(task.videoUrl!)}
                >
                  <Image
                    source={{ uri: getYouTubeThumbnail(task.videoUrl) || '' }}
                    style={styles.videoThumbnail}
                    resizeMode="cover"
                  />
                  <View style={styles.playButtonOverlay}>
                    <View style={styles.playButton}>
                      <IconSymbol
                        ios_icon_name="play.fill"
                        android_material_icon_name="play_arrow"
                        size={32}
                        color="#fff"
                      />
                    </View>
                  </View>
                  <Text style={[styles.videoText, { color: colors.primary }]}>Afspil video</Text>
                </TouchableOpacity>
              )}

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
          ))}
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
              <TouchableOpacity onPress={closeTaskModal} disabled={isSaving}>
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
                editable={!isSaving}
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
                editable={!isSaving}
              />

              <Text style={[styles.label, { color: textColor }]}>Video URL</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={videoUrl}
                onChangeText={setVideoUrl}
                placeholder="https://youtube.com/..."
                placeholderTextColor={textSecondaryColor}
                autoCapitalize="none"
                editable={!isSaving}
              />
              {videoUrl.trim() && getYouTubeVideoId(videoUrl) && (
                <View style={styles.videoPreviewSmall}>
                  <Image
                    source={{ uri: getYouTubeThumbnail(videoUrl) || '' }}
                    style={styles.videoThumbnailSmall}
                    resizeMode="cover"
                  />
                  <Text style={[styles.helperText, { color: colors.secondary }]}>
                    ✓ Video URL gemt
                  </Text>
                </View>
              )}
              {videoUrl.trim() && !getYouTubeVideoId(videoUrl) && (
                <Text style={[styles.helperText, { color: colors.error }]}>
                  ⚠ Ugyldig YouTube URL
                </Text>
              )}

              <View style={styles.subtasksSection}>
                <View style={styles.subtasksHeader}>
                  <Text style={[styles.label, { color: textColor }]}>Delopgaver</Text>
                  <TouchableOpacity
                    style={[styles.addSubtaskButton, { backgroundColor: colors.primary }]}
                    onPress={addSubtask}
                    disabled={isSaving}
                  >
                    <IconSymbol
                      ios_icon_name="plus"
                      android_material_icon_name="add"
                      size={16}
                      color="#fff"
                    />
                    <Text style={styles.addSubtaskText}>Tilføj</Text>
                  </TouchableOpacity>
                </View>

                {subtasks.map((subtask, index) => (
                  <View key={index} style={styles.subtaskInputRow}>
                    <TextInput
                      style={[styles.subtaskInput, { backgroundColor: bgColor, color: textColor }]}
                      value={subtask}
                      onChangeText={(value) => updateSubtask(index, value)}
                      placeholder={`Delopgave ${index + 1}`}
                      placeholderTextColor={textSecondaryColor}
                      editable={!isSaving}
                    />
                    {subtasks.length > 1 && (
                      <TouchableOpacity
                        style={styles.removeSubtaskButton}
                        onPress={() => removeSubtask(index)}
                        disabled={isSaving}
                      >
                        <IconSymbol
                          ios_icon_name="minus.circle"
                          android_material_icon_name="remove_circle"
                          size={24}
                          color={colors.error}
                        />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>

              <Text style={[styles.label, { color: textColor }]}>Påmindelse (minutter før)</Text>
              <TextInput
                style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                value={selectedTask?.reminder?.toString() || ''}
                onChangeText={(text) => setSelectedTask(selectedTask ? { ...selectedTask, reminder: parseInt(text) || undefined } : null)}
                placeholder="15"
                placeholderTextColor={textSecondaryColor}
                keyboardType="numeric"
                editable={!isSaving}
              />

              <Text style={[styles.label, { color: textColor }]}>Aktivitetskategorier</Text>
              <View style={styles.categoriesGrid}>
                {categories.map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor: selectedTask?.categoryIds.includes(category.id) ? category.color : bgColor,
                        borderColor: category.color,
                        borderWidth: 2,
                      },
                    ]}
                    onPress={() => toggleCategory(category.id)}
                    disabled={isSaving}
                  >
                    <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                    <Text style={[
                      styles.categoryName,
                      { color: selectedTask?.categoryIds.includes(category.id) ? '#fff' : textColor }
                    ]}>
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { backgroundColor: bgColor }]}
                onPress={closeTaskModal}
                disabled={isSaving}
              >
                <Text style={[styles.modalButtonText, { color: textColor }]}>Annuller</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, { backgroundColor: colors.primary, opacity: isSaving ? 0.6 : 1 }]}
                onPress={handleSaveTask}
                disabled={isSaving}
              >
                <Text style={[styles.modalButtonText, { color: '#fff' }]}>
                  {isSaving ? 'Gemmer...' : 'Gem'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Video Modal */}
      <Modal
        visible={showVideoModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowVideoModal(false)}
      >
        <View style={[styles.videoModalContainer, { backgroundColor: '#000' }]}>
          <View style={[styles.videoModalHeader, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
            <TouchableOpacity 
              onPress={() => setShowVideoModal(false)}
              style={styles.videoCloseButton}
            >
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="close"
                size={32}
                color="#fff"
              />
            </TouchableOpacity>
            <Text style={[styles.videoModalTitle, { color: '#fff' }]}>Video</Text>
            <View style={{ width: 32 }} />
          </View>

          <View style={styles.videoContainer}>
            {selectedVideoUrl && (
              <WebView
                source={{ 
                  uri: selectedVideoUrl,
                }}
                style={styles.webView}
                allowsFullscreenVideo={true}
                allowsInlineMediaPlayback={true}
                mediaPlaybackRequiresUserAction={false}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                startInLoadingState={true}
                scalesPageToFit={true}
                mixedContentMode="always"
                originWhitelist={['*']}
                onError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('WebView error:', nativeEvent);
                }}
                onHttpError={(syntheticEvent) => {
                  const { nativeEvent } = syntheticEvent;
                  console.error('WebView HTTP error:', nativeEvent);
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      <ContextConfirmationDialog
        visible={showConfirmDialog}
        contextType={selectedContext.type}
        contextName={selectedContext.name}
        actionType={pendingAction?.type || 'edit'}
        itemType="opgave"
        onConfirm={handleConfirmAction}
        onCancel={handleCancelAction}
      />
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
  contextBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#B8860B',
  },
  contextBannerText: {
    flex: 1,
  },
  contextBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  contextBannerSubtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  contextBannerInfo: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.95,
    fontStyle: 'italic',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
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
    lineHeight: 20,
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
  videoPreviewContainer: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  videoThumbnail: {
    width: '100%',
    height: 180,
    backgroundColor: '#000',
  },
  playButtonOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 8,
  },
  videoPreviewSmall: {
    marginTop: 8,
    marginBottom: 12,
  },
  videoThumbnailSmall: {
    width: '100%',
    height: 120,
    borderRadius: 8,
    backgroundColor: '#000',
    marginBottom: 8,
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
  helperText: {
    fontSize: 14,
    marginTop: 4,
  },
  subtasksSection: {
    marginBottom: 16,
  },
  subtasksHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addSubtaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  addSubtaskText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  subtaskInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  subtaskInput: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  removeSubtaskButton: {
    padding: 4,
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
  videoModalContainer: {
    flex: 1,
  },
  videoModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'android' ? 48 : 60,
    paddingBottom: 16,
    paddingHorizontal: 20,
  },
  videoCloseButton: {
    padding: 4,
  },
  videoModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  webView: {
    flex: 1,
    backgroundColor: '#000',
  },
});
