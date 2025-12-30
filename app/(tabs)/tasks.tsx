
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, Modal, Image, useColorScheme, KeyboardAvoidingView, Platform, RefreshControl, Alert, ActivityIndicator } from 'react-native';
import { useFootball } from '@/contexts/FootballContext';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useAdmin } from '@/contexts/AdminContext';
import { colors, getColors } from '@/styles/commonStyles';
import { Task } from '@/types';
import { IconSymbol } from '@/components/IconSymbol';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import ContextConfirmationDialog from '@/components/ContextConfirmationDialog';
import { AdminContextWrapper } from '@/components/AdminContextWrapper';
import { supabase } from '@/app/integrations/supabase/client';

// Local helper function to validate video URLs
function isValidVideoUrl(url?: string): boolean {
  if (!url) return false;

  return (
    url.includes("youtube.com") ||
    url.includes("youtu.be") ||
    url.includes("vimeo.com")
  );
}
function getYouTubeThumbnail(url: string): string | null {
  try {
    if (url.includes('youtu.be/')) {
      return `https://img.youtube.com/vi/${url.split('youtu.be/')[1].split('?')[0]}/hqdefault.jpg`;
    }

    if (url.includes('watch?v=')) {
      return `https://img.youtube.com/vi/${url.split('watch?v=')[1].split('&')[0]}/hqdefault.jpg`;
    }

    if (url.includes('/shorts/')) {
      return `https://img.youtube.com/vi/${url.split('/shorts/')[1].split('?')[0]}/hqdefault.jpg`;
    }

    if (url.includes('/embed/')) {
      return `https://img.youtube.com/vi/${url.split('/embed/')[1].split('?')[0]}/hqdefault.jpg`;
    }

    return null;
  } catch {
    return null;
  }
}

interface FolderItem {
  id: string;
  name: string;
  type: 'personal' | 'trainer' | 'footballcoach';
  icon: string;
  androidIcon: string;
  tasks: Task[];
  trainerId?: string;
  isExpanded?: boolean;
}

// Pure function to organize tasks into folders
function organizeFolders(templateTasks: Task[]): FolderItem[] {
  const personalTasks: Task[] = [];
  const trainerFolders = new Map<string, FolderItem>();
  const footballCoachTasks: Task[] = [];

  templateTasks.forEach(task => {
    const sourceFolder = (task as any).source_folder;

    if (sourceFolder && sourceFolder.startsWith('Fra træner:')) {
      // Extract trainer name
      const trainerName = sourceFolder.replace('Fra træner:', '').trim();
      const trainerId = `trainer_${trainerName}`;

      if (!trainerFolders.has(trainerId)) {
        trainerFolders.set(trainerId, {
          id: trainerId,
          name: `Fra træner: ${trainerName}`,
          type: 'trainer',
          icon: 'person.crop.circle.fill',
          androidIcon: 'account_circle',
          tasks: [],
        });
      }

      trainerFolders.get(trainerId)!.tasks.push(task);
    } else if (sourceFolder && sourceFolder === 'FootballCoach Inspiration') {
      footballCoachTasks.push(task);
    } else {
      // Personal tasks (no source_folder or other values)
      personalTasks.push(task);
    }
  });

  const newFolders: FolderItem[] = [];

  // Add personal folder
  if (personalTasks.length > 0) {
    newFolders.push({
      id: 'personal',
      name: 'Personligt oprettet',
      type: 'personal',
      icon: 'person.fill',
      androidIcon: 'person',
      tasks: personalTasks,
    });
  }

  // Add trainer folders
  trainerFolders.forEach(folder => {
    newFolders.push(folder);
  });

  // Add FootballCoach folder
  if (footballCoachTasks.length > 0) {
    newFolders.push({
      id: 'footballcoach',
      name: 'FootballCoach Inspiration',
      type: 'footballcoach',
      icon: 'star.circle.fill',
      androidIcon: 'stars',
      tasks: footballCoachTasks,
    });
  }

  return newFolders;
}

// Memoized TaskCard component to prevent unnecessary re-renders
const TaskCard = React.memo(({ 
  task, 
  isDark, 
  onPress, 
  onDuplicate, 
  onDelete, 
  onVideoPress,
  getCategoryNames 
}: {
  task: Task;
  isDark: boolean;
  onPress: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onVideoPress: (url: string) => void;
  getCategoryNames: (categoryIds: string[]) => string;
}) => (
  <TouchableOpacity
    style={[styles.taskCard, { backgroundColor: isDark ? '#2a2a2a' : colors.card }]}
    onPress={onPress}
  >
    <View style={styles.taskHeader}>
      <View style={styles.taskHeaderLeft}>
        <IconSymbol ios_icon_name="doc.text" android_material_icon_name="description" size={20} color={colors.secondary} />
        <View style={styles.checkbox} />
        <Text style={[styles.taskTitle, { color: isDark ? '#e3e3e3' : colors.text }]}>{task.title}</Text>
      </View>
      <View style={styles.taskActions}>
        <TouchableOpacity onPress={onDuplicate} style={styles.actionButton}>
          <IconSymbol ios_icon_name="doc.on.doc" android_material_icon_name="content_copy" size={20} color={colors.secondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onPress} style={styles.actionButton}>
          <IconSymbol ios_icon_name="pencil" android_material_icon_name="edit" size={20} color={colors.accent} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.actionButton}>
          <IconSymbol ios_icon_name="trash" android_material_icon_name="delete" size={20} color={colors.error} />
        </TouchableOpacity>
      </View>
    </View>

{task.videoUrl && isValidVideoUrl(task.videoUrl) && (
  <TouchableOpacity
    style={styles.videoThumbnailWrapper}
    onPress={() => onVideoPress(task.videoUrl)}
    activeOpacity={0.85}
  >
    <Image
      source={
        task.videoUrl.includes('youtu')
          ? { uri: getYouTubeThumbnail(task.videoUrl) ?? undefined }
          : undefined
      }
      style={styles.videoThumbnail}
      resizeMode="cover"
    />

    <View style={styles.videoOverlay}>
      <IconSymbol
        ios_icon_name="play.circle.fill"
        android_material_icon_name="play_circle"
        size={56}
        color="#fff"
      />
    </View>
  </TouchableOpacity>
)}



    {task.reminder && (
      <View style={styles.reminderBadge}>
        <IconSymbol ios_icon_name="bell.fill" android_material_icon_name="notifications" size={14} color={colors.accent} />
        <Text style={[styles.reminderText, { color: colors.accent }]}>{task.reminder} min før</Text>
      </View>
    )}

    <View style={styles.categoriesRow}>
      <IconSymbol ios_icon_name="tag.fill" android_material_icon_name="label" size={14} color={isDark ? '#999' : colors.textSecondary} />
      <Text style={[styles.categoriesText, { color: isDark ? '#999' : colors.textSecondary }]}>
        Vises automatisk på alle {getCategoryNames(task.categoryIds)} aktiviteter
      </Text>
    </View>
  </TouchableOpacity>
));

// Memoized FolderItem component
const FolderItemComponent = React.memo(({ 
  folder, 
  isExpanded, 
  onToggle,
  renderTaskCard,
  isDark,
  textColor,
  textSecondaryColor,
  cardBgColor
}: { 
  folder: FolderItem; 
  isExpanded: boolean; 
  onToggle: () => void;
  renderTaskCard: (task: Task) => React.ReactNode;
  isDark: boolean;
  textColor: string;
  textSecondaryColor: string;
  cardBgColor: string;
}) => {
  return (
    <View>
      <TouchableOpacity
        style={[styles.folderHeader, { backgroundColor: cardBgColor }]}
        onPress={onToggle}
      >
        <View style={styles.folderHeaderLeft}>
          <IconSymbol
            ios_icon_name={folder.icon}
            android_material_icon_name={folder.androidIcon}
            size={24}
            color={colors.primary}
          />
          <Text style={[styles.folderName, { color: textColor }]}>
            {folder.name}
          </Text>
          <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.countBadgeText}>{folder.tasks.length}</Text>
          </View>
        </View>
        <IconSymbol
          ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
          android_material_icon_name={isExpanded ? 'expand_more' : 'chevron_right'}
          size={20}
          color={textSecondaryColor}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.folderContent}>
          <FlatList
            data={folder.tasks}
            renderItem={({ item }) => renderTaskCard(item)}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            removeClippedSubviews={Platform.OS !== 'web'}
            initialNumToRender={5}
            maxToRenderPerBatch={5}
            windowSize={5}
          />
        </View>
      )}
    </View>
  );
});

export default function TasksScreen() {
  const { tasks, categories, addTask, updateTask, deleteTask, duplicateTask, refreshData, isLoading } = useFootball();
  const { selectedContext } = useTeamPlayer();
  const { isAdmin } = useUserRole();
  const { adminMode, adminTargetId, adminTargetType } = useAdmin();
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    type: 'create' | 'edit' | 'delete';
    data?: any;
  } | null>(null);

  const templateTasks = useMemo(() => tasks, [tasks]);

  // Use useMemo to compute folders from tasks - this prevents the render loop
  const folders = useMemo(() => {
    return organizeFolders(templateTasks);
  }, [templateTasks]);

  const filteredFolders = useMemo(() => {
    return folders.map(folder => ({
      ...folder,
      tasks: folder.tasks.filter(task =>
        task.title.toLowerCase().includes(searchQuery.toLowerCase())
      ),
    })).filter(folder => folder.tasks.length > 0);
  }, [folders, searchQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    
    try {
      await refreshData();
    } catch (error) {
      console.error('Error refreshing tasks data:', error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  }, []);

  const openTaskModal = useCallback(async (task: Task | null, creating: boolean = false) => {
    setSelectedTask(task);
    setIsCreating(creating);
    setVideoUrl(task?.videoUrl || '');
    
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
  }, []);

  const closeTaskModal = useCallback(() => {
    setSelectedTask(null);
    setIsCreating(false);
    setIsModalVisible(false);
    setVideoUrl('');
    setSubtasks(['']);
    setIsSaving(false);
  }, []);

  const executeSaveTask = useCallback(async () => {
    if (!selectedTask) return;

    setIsSaving(true);

    try {
      const taskToSave = {
  ...selectedTask,
  id: selectedTask.id || undefined,
  videoUrl: videoUrl.trim() ? videoUrl.trim() : null,
  categoryIds: Array.from(new Set(selectedTask.categoryIds)),
};


      if (isCreating) {
        await addTask(taskToSave);
        Alert.alert('Succes', 'Opgaveskabelon oprettet');
      } else {
        await updateTask(selectedTask.id, taskToSave);
        
        await supabase
          .from('task_template_subtasks')
          .delete()
          .eq('task_template_id', selectedTask.id);

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

      closeTaskModal();
    } catch (error: any) {
      Alert.alert('Fejl', 'Kunne ikke gemme opgave: ' + (error.message || 'Ukendt fejl'));
    } finally {
      setIsSaving(false);
    }
  }, [selectedTask, videoUrl, subtasks, isCreating, addTask, updateTask, closeTaskModal]);

  const handleSaveTask = useCallback(async () => {
    if (!selectedTask) return;
    
    if (isAdmin && selectedContext.type) {
      setPendingAction({
        type: isCreating ? 'create' : 'edit',
        data: { task: selectedTask, videoUrl, subtasks, isCreating },
      });
      setShowConfirmDialog(true);
      return;
    }
    
    await executeSaveTask();
  }, [selectedTask, isAdmin, selectedContext.type, isCreating, videoUrl, subtasks, executeSaveTask]);

  const handleDeleteTask = useCallback((taskId: string) => {
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
  }, [isAdmin, selectedContext.type, deleteTask, closeTaskModal]);

  const handleConfirmAction = useCallback(async () => {
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
  }, [pendingAction, executeSaveTask, deleteTask, closeTaskModal]);

  const handleCancelAction = useCallback(() => {
    setShowConfirmDialog(false);
    setPendingAction(null);
  }, []);

  const handleDuplicateTask = useCallback((taskId: string) => {
    duplicateTask(taskId);
  }, [duplicateTask]);

  const toggleCategory = useCallback((categoryId: string) => {
  if (!selectedTask) return;

  const set = new Set(selectedTask.categoryIds);

  if (set.has(categoryId)) {
    set.delete(categoryId);
  } else {
    set.add(categoryId);
  }

  setSelectedTask({
    ...selectedTask,
    categoryIds: Array.from(set),
  });
}, [selectedTask]);

  const getCategoryNames = useCallback((categoryIds: string[]) => {
  const uniqueIds = Array.from(new Set(categoryIds));

  return uniqueIds
    .map(id => categories.find(c => c.id === id)?.name.toLowerCase())
    .filter(Boolean)
    .join(', ');
}, [categories]);

  const openVideoModal = useCallback((url: string) => {
    if (!isValidVideoUrl(url)) {
      Alert.alert('Fejl', 'Ugyldig video URL. Kun YouTube og Vimeo understøttes.');
      return;
    }
    
    setSelectedVideoUrl(url);
    setShowVideoModal(true);
  }, []);

  const closeVideoModal = useCallback(() => {
    setShowVideoModal(false);
    // Don't clear selectedVideoUrl immediately to prevent unmounting
    setTimeout(() => {
      setSelectedVideoUrl(null);
    }, 300);
  }, []);

  const handleDeleteVideo = useCallback(() => {
    Alert.alert(
      'Slet video',
      'Er du sikker på at du vil fjerne videoen fra denne opgave?',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: () => {
            setVideoUrl('');
            Alert.alert('Video fjernet', 'Husk at gemme opgaven for at bekræfte ændringen');
          },
        },
      ]
    );
  }, []);

  const addSubtask = useCallback(() => {
    setSubtasks([...subtasks, '']);
  }, [subtasks]);

  const updateSubtask = useCallback((index: number, value: string) => {
    const newSubtasks = [...subtasks];
    newSubtasks[index] = value;
    setSubtasks(newSubtasks);
  }, [subtasks]);

  const removeSubtask = useCallback((index: number) => {
    if (subtasks.length > 1) {
      setSubtasks(subtasks.filter((_, i) => i !== index));
    }
  }, [subtasks]);

  // Memoized render functions for FlatList
  const renderTaskCard = useCallback((task: Task) => (
    <TaskCard
      task={task}
      isDark={isDark}
      onPress={() => openTaskModal(task)}
      onDuplicate={() => handleDuplicateTask(task.id)}
      onDelete={() => handleDeleteTask(task.id)}
      onVideoPress={openVideoModal}
      getCategoryNames={getCategoryNames}
    />
  ), [isDark, openTaskModal, handleDuplicateTask, handleDeleteTask, openVideoModal, getCategoryNames]);

  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  // LINT FIX: Include FolderItemComponent in dependency array
  const renderFolder = useCallback(({ item }: { item: FolderItem }) => {
    const isExpanded = expandedFolders.has(item.id);
    return (
      <FolderItemComponent
        folder={item}
        isExpanded={isExpanded}
        onToggle={() => toggleFolder(item.id)}
        renderTaskCard={renderTaskCard}
        isDark={isDark}
        textColor={textColor}
        textSecondaryColor={textSecondaryColor}
        cardBgColor={cardBgColor}
      />
    );
  }, [expandedFolders, toggleFolder, renderTaskCard, isDark, textColor, textSecondaryColor, cardBgColor]);



  
  // CRITICAL FIX: Check for both player AND team admin mode
  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetType === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  // LINT FIX: Remove isManagingContext from dependency array
  const ListHeaderComponent = useMemo(() => (
    <>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: textColor }]}>Opgaver</Text>
        <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
          {templateTasks.length} skabeloner
        </Text>
      </View>

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
            : 'Opgaver organiseret i mapper efter oprindelse'}
        </Text>
      </View>
    </>
  ), [templateTasks.length, isAdmin, selectedContext, isDark, textColor, textSecondaryColor, searchQuery, openTaskModal]);

  const ListEmptyComponent = useMemo(() => (
    <View style={[styles.emptyState, { backgroundColor: cardBgColor }]}>
      <IconSymbol
        ios_icon_name="folder"
        android_material_icon_name="folder_open"
        size={48}
        color={textSecondaryColor}
      />
      <Text style={[styles.emptyStateText, { color: textSecondaryColor }]}>
        {searchQuery ? 'Ingen opgaver matcher din søgning' : 'Ingen opgaveskabeloner endnu'}
      </Text>
    </View>
  ), [searchQuery, cardBgColor, textSecondaryColor]);

  const ListFooterComponent = useMemo(() => (
    <View style={{ height: 100 }} />
  ), []);

  // Show loading spinner when data is being fetched
  if (isLoading) {
    return (
      <AdminContextWrapper
        isAdmin={isAdminMode}
        contextName={selectedContext?.name}
        contextType={adminTargetType || 'player'}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      </AdminContextWrapper>
    );
  }

  return (
    <AdminContextWrapper
      isAdmin={isAdminMode}
      contextName={selectedContext?.name}
      contextType={adminTargetType || 'player'}
    >
      <FlatList
        data={filteredFolders}
        renderItem={renderFolder}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        ListFooterComponent={ListFooterComponent}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        removeClippedSubviews={Platform.OS !== 'web'}
        initialNumToRender={8}
        maxToRenderPerBatch={5}
        windowSize={10}
      />

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

            <FlatList
              data={[{ key: 'form' }]}
              renderItem={() => (
                <View style={styles.modalBody}>
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

                  <View style={styles.videoSection}>
                    <View style={styles.videoLabelRow}>
                      <Text style={[styles.label, { color: textColor }]}>Video URL (YouTube eller Vimeo)</Text>
                      {videoUrl.trim() && (
                        <TouchableOpacity
                          style={styles.deleteVideoButton}
                          onPress={handleDeleteVideo}
                          disabled={isSaving}
                        >
                          <IconSymbol
                            ios_icon_name="trash.fill"
                            android_material_icon_name="delete"
                            size={18}
                            color={colors.error}
                          />
                          <Text style={[styles.deleteVideoText, { color: colors.error }]}>Slet video</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TextInput
                      style={[styles.input, { backgroundColor: bgColor, color: textColor }]}
                      value={videoUrl}
                      onChangeText={setVideoUrl}
                      placeholder="https://youtube.com/... eller https://vimeo.com/..."
                      placeholderTextColor={textSecondaryColor}
                      autoCapitalize="none"
                      editable={!isSaving}
                    />
                    {videoUrl.trim() && isValidVideoUrl(videoUrl) && (
                      <View style={styles.videoPreviewSmall}>
                        <TouchableOpacity
                          style={styles.videoPreviewButton}
                          onPress={() => openVideoModal(videoUrl)}
                          activeOpacity={0.8}
                        >
                          <IconSymbol
                            ios_icon_name="play.circle.fill"
                            android_material_icon_name="play_circle"
                            size={32}
                            color={colors.primary}
                          />
                          <Text style={[styles.videoPreviewText, { color: colors.primary }]}>
                            Forhåndsvisning
                          </Text>
                        </TouchableOpacity>
                        <Text style={[styles.helperText, { color: colors.secondary }]}>
                          ✓ Video URL gemt
                        </Text>
                      </View>
                    )}
                    {videoUrl.trim() && !isValidVideoUrl(videoUrl) && (
                      <Text style={[styles.helperText, { color: colors.error }]}>
                        ⚠ Ugyldig video URL. Kun YouTube og Vimeo understøttes.
                      </Text>
                    )}
                  </View>

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
                      <View key={`${index}-${subtask}`} style={styles.subtaskInputRow}>
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
                </View>
              )}
              keyExtractor={(item) => item.key}
              showsVerticalScrollIndicator={false}
            />

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

      <Modal
        visible={showVideoModal}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeVideoModal}
      >
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <View style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            paddingTop: Platform.OS === 'android' ? 48 : 60,
            paddingBottom: 16,
            paddingHorizontal: 20,
            backgroundColor: 'rgba(0,0,0,0.9)'
          }}>
            <TouchableOpacity 
              onPress={closeVideoModal}
              style={{ padding: 4 }}
            >
              <IconSymbol
                ios_icon_name="xmark.circle.fill"
                android_material_icon_name="close"
                size={32}
                color="#fff"
              />
            </TouchableOpacity>
            <Text style={{ fontSize: 20, fontWeight: 'bold', color: '#fff' }}>
              Opgave video
            </Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
            <SmartVideoPlayer url={selectedVideoUrl || undefined} />
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
    </AdminContextWrapper>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    paddingHorizontal: 16,
  },
  header: {
    paddingTop: Platform.OS === 'android' ? 60 : 70,
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
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
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
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  folderHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  folderName: {
    fontSize: 18,
    fontWeight: '600',
    flex: 1,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },
  folderContent: {
    marginBottom: 8,
  },
  emptyState: {
    padding: 48,
    borderRadius: 12,
    alignItems: 'center',
    gap: 16,
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
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
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
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
    gap: 8,
  },
  videoPreviewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: colors.highlight,
    borderRadius: 12,
  },
  videoPreviewText: {
    fontSize: 16,
    fontWeight: '600',
  },
  videoThumbnailWrapper: {
  height: 180,
  borderRadius: 12,
  overflow: 'hidden',
  marginBottom: 12,
  backgroundColor: '#000',
},

videoThumbnail: {
  width: '100%',
  height: '100%',
},

videoOverlay: {
  ...StyleSheet.absoluteFillObject,
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(0,0,0,0.25)',
},

  videoSection: {
    marginBottom: 16,
  },
  videoLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  deleteVideoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deleteVideoText: {
    fontSize: 14,
    fontWeight: '600',
  },
  videoPreviewSmall: {
    marginTop: 8,
    marginBottom: 12,
  },
  helperText: {
    fontSize: 14,
    marginTop: 4,
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
});
