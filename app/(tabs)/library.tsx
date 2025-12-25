
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  useColorScheme,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';
import { useUserRole } from '@/hooks/useUserRole';
import { useFocusEffect } from '@react-navigation/native';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';

interface Exercise {
  id: string;
  trainer_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  created_at: Date;
  updated_at: Date;
  subtasks: ExerciseSubtask[];
  assignments: ExerciseAssignment[];
  isAssignedByCurrentTrainer?: boolean;
  trainer_name?: string;
  is_system?: boolean;
  category_path?: string;
}

interface ExerciseSubtask {
  id: string;
  exercise_id: string;
  title: string;
  sort_order: number;
}

interface ExerciseAssignment {
  id: string;
  exercise_id: string;
  trainer_id: string;
  player_id: string | null;
  team_id: string | null;
  player_name?: string;
  team_name?: string;
}

interface FolderItem {
  id: string;
  name: string;
  type: 'personal' | 'trainer' | 'footballcoach' | 'category';
  icon: string;
  androidIcon: string;
  exercises?: Exercise[];
  subfolders?: FolderItem[];
  trainerId?: string;
  isExpanded?: boolean;
}

// Predefined FootballCoach focus areas
const FOOTBALLCOACH_STRUCTURE: FolderItem[] = [
  {
    id: 'holdtraening',
    name: 'Holdtræning',
    type: 'category',
    icon: 'person.3.fill',
    androidIcon: 'groups',
    subfolders: [
      { id: 'holdtraening_faelles', name: 'Fælles (alle positioner)', type: 'category', icon: 'star.fill', androidIcon: 'star', exercises: [] },
      { id: 'holdtraening_maalmand', name: 'Målmand', type: 'category', icon: 'hand.raised.fill', androidIcon: 'sports_soccer', exercises: [] },
      { id: 'holdtraening_back', name: 'Back', type: 'category', icon: 'shield.fill', androidIcon: 'shield', exercises: [] },
      { id: 'holdtraening_midterforsvarer', name: 'Midterforsvarer', type: 'category', icon: 'shield.lefthalf.filled', androidIcon: 'security', exercises: [] },
      { id: 'holdtraening_central_midtbane', name: 'Central midtbane', type: 'category', icon: 'circle.grid.cross.fill', androidIcon: 'grid_on', exercises: [] },
      { id: 'holdtraening_offensiv_midtbane', name: 'Offensiv midtbane', type: 'category', icon: 'arrow.up.circle.fill', androidIcon: 'arrow_upward', exercises: [] },
      { id: 'holdtraening_kant', name: 'Kant', type: 'category', icon: 'arrow.left.and.right.circle.fill', androidIcon: 'swap_horiz', exercises: [] },
      { id: 'holdtraening_angriber', name: 'Angriber', type: 'category', icon: 'flame.fill', androidIcon: 'local_fire_department', exercises: [] },
    ],
  },
  {
    id: 'selvtraening',
    name: 'Selvtræning',
    type: 'category',
    icon: 'person.fill',
    androidIcon: 'person',
    subfolders: [
      { id: 'selvtraening_faelles', name: 'Fælles', type: 'category', icon: 'star.fill', androidIcon: 'star', exercises: [] },
      { id: 'selvtraening_maalmand', name: 'Målmand', type: 'category', icon: 'hand.raised.fill', androidIcon: 'sports_soccer', exercises: [] },
      { id: 'selvtraening_back', name: 'Back', type: 'category', icon: 'shield.fill', androidIcon: 'shield', exercises: [] },
      { id: 'selvtraening_midterforsvarer', name: 'Midterforsvarer', type: 'category', icon: 'shield.lefthalf.filled', androidIcon: 'security', exercises: [] },
      { id: 'selvtraening_central_midtbane', name: 'Central midtbane', type: 'category', icon: 'circle.grid.cross.fill', androidIcon: 'grid_on', exercises: [] },
      { id: 'selvtraening_offensiv_midtbane', name: 'Offensiv midtbane', type: 'category', icon: 'arrow.up.circle.fill', androidIcon: 'arrow_upward', exercises: [] },
      { id: 'selvtraening_kant', name: 'Kant', type: 'category', icon: 'arrow.left.and.right.circle.fill', androidIcon: 'swap_horiz', exercises: [] },
      { id: 'selvtraening_angriber', name: 'Angriber', type: 'category', icon: 'flame.fill', androidIcon: 'local_fire_department', exercises: [] },
    ],
  },
];

export default function LibraryScreen() {
  const { teams, players, selectedContext } = useTeamPlayer();
  const { isAdmin, userRole } = useUserRole();
  const [personalExercises, setPersonalExercises] = useState<Exercise[]>([]);
  const [trainerFolders, setTrainerFolders] = useState<FolderItem[]>([]);
  const [footballCoachFolders, setFootballCoachFolders] = useState<FolderItem[]>(FOOTBALLCOACH_STRUCTURE);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['personal', 'trainers', 'footballcoach']));
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedVideoUrl, setSelectedVideoUrl] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>(['']);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const themeColors = getColors(colorScheme);
  
  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const isManagingContext = isAdmin && selectedContext.type;
  const containerBgColor = isManagingContext ? themeColors.contextWarning : bgColor;

  const isPlayer = userRole === 'player';

  const fetchLibraryData = useCallback(async (userId: string) => {
    console.log('🔄 Library: Fetching library data for user:', userId);

    try {
      setLoading(true);

      if (isAdmin) {
        // TRAINERS: Fetch their own exercises (personal templates)
        const { data: exercisesData, error: exercisesError } = await supabase
          .from('exercise_library')
          .select('*')
          .eq('trainer_id', userId)
          .eq('is_system', false)
          .order('created_at', { ascending: false });

        if (exercisesError) throw exercisesError;

        const exerciseIds = exercisesData?.map(e => e.id) || [];
        
        // Fetch subtasks
        const { data: subtasksData, error: subtasksError } = await supabase
          .from('exercise_subtasks')
          .select('*')
          .in('exercise_id', exerciseIds)
          .order('sort_order', { ascending: true });

        if (subtasksError) throw subtasksError;

        // Fetch assignments
        const { data: assignmentsData, error: assignmentsError } = await supabase
          .from('exercise_assignments')
          .select('*')
          .in('exercise_id', exerciseIds);

        if (assignmentsError) throw assignmentsError;

        const exercisesWithDetails: Exercise[] = (exercisesData || []).map(exercise => ({
          ...exercise,
          created_at: new Date(exercise.created_at),
          updated_at: new Date(exercise.updated_at),
          subtasks: (subtasksData || []).filter(s => s.exercise_id === exercise.id),
          assignments: (assignmentsData || []).filter(a => a.exercise_id === exercise.id),
          isAssignedByCurrentTrainer: true,
        }));

        console.log('✅ Library: Loaded personal exercises:', exercisesWithDetails.length);
        setPersonalExercises(exercisesWithDetails);
        setTrainerFolders([]); // Trainers don't see trainer folders

      } else {
        // PLAYERS: Fetch exercises assigned to them, grouped by trainer
        const { data: assignmentsData, error: assignmentsError } = await supabase
          .from('exercise_assignments')
          .select('*')
          .eq('player_id', userId);

        if (assignmentsError) throw assignmentsError;

        const exerciseIds = assignmentsData?.map(a => a.exercise_id) || [];
        
        // Fetch exercises separately
        const { data: exercisesData, error: exercisesError } = await supabase
          .from('exercise_library')
          .select('*')
          .in('id', exerciseIds);

        if (exercisesError) throw exercisesError;

        // Fetch subtasks
        const { data: subtasksData, error: subtasksError } = await supabase
          .from('exercise_subtasks')
          .select('*')
          .in('exercise_id', exerciseIds)
          .order('sort_order', { ascending: true });

        if (subtasksError) throw subtasksError;

        // Fetch trainer profiles
        const trainerIds = [...new Set(assignmentsData?.map(a => a.trainer_id) || [])];
        const { data: trainersData, error: trainersError } = await supabase
          .from('profiles')
          .select('user_id, full_name')
          .in('user_id', trainerIds);

        if (trainersError) throw trainersError;

        // Group exercises by trainer
        const trainerMap = new Map<string, FolderItem>();
        
        (assignmentsData || []).forEach(assignment => {
          const exercise = exercisesData?.find(e => e.id === assignment.exercise_id);
          if (!exercise) return;

          const trainerId = assignment.trainer_id;
          const trainerProfile = trainersData?.find(t => t.user_id === trainerId);
          const trainerName = trainerProfile?.full_name || 'Ukendt træner';

          if (!trainerMap.has(trainerId)) {
            trainerMap.set(trainerId, {
              id: `trainer_${trainerId}`,
              name: `Træner: ${trainerName}`,
              type: 'trainer',
              icon: 'person.crop.circle.fill',
              androidIcon: 'account_circle',
              exercises: [],
              trainerId,
            });
          }

          const folder = trainerMap.get(trainerId)!;
          const exerciseWithDetails: Exercise = {
            ...exercise,
            created_at: new Date(exercise.created_at),
            updated_at: new Date(exercise.updated_at),
            subtasks: (subtasksData || []).filter(s => s.exercise_id === exercise.id),
            assignments: [assignment],
            trainer_name: trainerName,
          };

          folder.exercises!.push(exerciseWithDetails);
        });

        const folders = Array.from(trainerMap.values());
        console.log('✅ Library: Loaded trainer folders:', folders.length);
        setTrainerFolders(folders);
        setPersonalExercises([]); // Players don't have personal exercises in this context
      }

      // Fetch FootballCoach system exercises for all users
      const { data: systemExercisesData, error: systemExercisesError } = await supabase
        .from('exercise_library')
        .select('*')
        .eq('is_system', true)
        .order('created_at', { ascending: true });

      if (systemExercisesError) throw systemExercisesError;

      const systemExerciseIds = systemExercisesData?.map(e => e.id) || [];
      
      // Fetch subtasks for system exercises
      const { data: systemSubtasksData, error: systemSubtasksError } = await supabase
        .from('exercise_subtasks')
        .select('*')
        .in('exercise_id', systemExerciseIds)
        .order('sort_order', { ascending: true });

      if (systemSubtasksError) throw systemSubtasksError;

      // Group system exercises by category_path
      const updatedFootballCoachFolders = FOOTBALLCOACH_STRUCTURE.map(mainFolder => {
        const updatedSubfolders = mainFolder.subfolders?.map(subfolder => {
          const categoryExercises = (systemExercisesData || [])
            .filter(ex => ex.category_path === subfolder.id)
            .map(exercise => ({
              ...exercise,
              created_at: new Date(exercise.created_at),
              updated_at: new Date(exercise.updated_at),
              subtasks: (systemSubtasksData || []).filter(s => s.exercise_id === exercise.id),
              assignments: [],
            }));

          return {
            ...subfolder,
            exercises: categoryExercises,
          };
        });

        return {
          ...mainFolder,
          subfolders: updatedSubfolders,
        };
      });

      setFootballCoachFolders(updatedFootballCoachFolders);
      console.log('✅ Library: Loaded FootballCoach exercises');

    } catch (error) {
      console.error('❌ Library: Error fetching library data:', error);
      Alert.alert('Fejl', 'Kunne ikke hente bibliotek');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    let isMounted = true;

    const getCurrentUser = async () => {
      console.log('🔄 Library: Getting current user...');
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          console.log('❌ Library: No user found');
          if (isMounted) {
            setLoading(false);
          }
          return;
        }

        console.log('✅ Library: User found:', user.id);
        
        if (isMounted) {
          setCurrentUserId(user.id);
        }
      } catch (error) {
        console.error('❌ Library: Error getting user:', error);
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    getCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!currentUserId) {
      console.log('⚠️ Library: No user ID yet, waiting...');
      return;
    }

    console.log('🔄 Library: User ID available, fetching library data...');
    fetchLibraryData(currentUserId);
  }, [currentUserId, selectedContext, fetchLibraryData]);

  useFocusEffect(
    useCallback(() => {
      console.log('🔄 Library: Screen focused, refreshing data...');
      if (currentUserId) {
        fetchLibraryData(currentUserId);
      }
    }, [currentUserId, fetchLibraryData])
  );

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(folderId)) {
        newSet.delete(folderId);
      } else {
        newSet.add(folderId);
      }
      return newSet;
    });
  };

  const openCreateModal = () => {
    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Kun trænere kan oprette øvelser');
      return;
    }
    
    setSelectedExercise(null);
    setIsCreating(true);
    setTitle('');
    setDescription('');
    setVideoUrl('');
    setSubtasks(['']);
    setShowModal(true);
  };

  const openEditModal = (exercise: Exercise) => {
    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Du kan ikke redigere denne øvelse');
      return;
    }
    
    setSelectedExercise(exercise);
    setIsCreating(false);
    setTitle(exercise.title);
    setDescription(exercise.description || '');
    setVideoUrl(exercise.video_url || '');
    setSubtasks(exercise.subtasks.length > 0 ? exercise.subtasks.map(s => s.title) : ['']);
    setShowModal(true);
  };

  const handleDeleteVideo = () => {
    Alert.alert(
      'Slet video',
      'Er du sikker på at du vil fjerne videoen fra denne øvelse?',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: () => {
            setVideoUrl('');
            Alert.alert('Video fjernet', 'Husk at gemme øvelsen for at bekræfte ændringen');
          },
        },
      ]
    );
  };

  const handleSaveExercise = async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Indtast venligst en titel');
      return;
    }

    if (!isAdmin) {
      Alert.alert('Fejl', 'Kun trænere kan gemme øvelser');
      return;
    }

    setProcessing(true);
    try {
      if (!currentUserId) throw new Error('Not authenticated');

      console.log('Saving exercise...');

      if (isCreating) {
        const { data: newExercise, error: exerciseError } = await supabase
          .from('exercise_library')
          .insert({
            trainer_id: currentUserId,
            title,
            description: description || null,
            video_url: videoUrl.trim() || null,
          })
          .select()
          .single();

        if (exerciseError) throw exerciseError;

        const validSubtasks = subtasks.filter(s => s.trim());
        if (validSubtasks.length > 0) {
          const subtasksToInsert = validSubtasks.map((subtask, index) => ({
            exercise_id: newExercise.id,
            title: subtask,
            sort_order: index,
          }));

          const { error: subtasksError } = await supabase
            .from('exercise_subtasks')
            .insert(subtasksToInsert);

          if (subtasksError) throw subtasksError;
        }

        Alert.alert('Succes', 'Øvelse oprettet');
      } else if (selectedExercise) {
        const { error: updateError } = await supabase
          .from('exercise_library')
          .update({
            title,
            description: description || null,
            video_url: videoUrl.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedExercise.id);

        if (updateError) throw updateError;

        const { error: deleteError } = await supabase
          .from('exercise_subtasks')
          .delete()
          .eq('exercise_id', selectedExercise.id);

        if (deleteError) throw deleteError;

        const validSubtasks = subtasks.filter(s => s.trim());
        if (validSubtasks.length > 0) {
          const subtasksToInsert = validSubtasks.map((subtask, index) => ({
            exercise_id: selectedExercise.id,
            title: subtask,
            sort_order: index,
          }));

          const { error: subtasksError } = await supabase
            .from('exercise_subtasks')
            .insert(subtasksToInsert);

          if (subtasksError) throw subtasksError;
        }

        Alert.alert('Succes', 'Øvelse opdateret');
      }

      setShowModal(false);
      if (currentUserId) {
        await fetchLibraryData(currentUserId);
      }
    } catch (error: any) {
      console.error('Error saving exercise:', error);
      Alert.alert('Fejl', 'Kunne ikke gemme øvelse: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteExercise = (exercise: Exercise) => {
    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Du kan ikke slette denne øvelse');
      return;
    }
    
    Alert.alert(
      'Slet øvelse',
      `Er du sikker på at du vil slette "${exercise.title}"?\n\nDette vil også fjerne alle tildelinger af denne øvelse.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('exercise_library')
                .delete()
                .eq('id', exercise.id);

              if (error) throw error;

              Alert.alert('Succes', 'Øvelse slettet');
              if (currentUserId) {
                await fetchLibraryData(currentUserId);
              }
            } catch (error: any) {
              console.error('Error deleting exercise:', error);
              Alert.alert('Fejl', 'Kunne ikke slette øvelse: ' + error.message);
            }
          },
        },
      ]
    );
  };

  const handleDuplicateExercise = async (exercise: Exercise) => {
    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Du kan ikke duplikere denne øvelse');
      return;
    }

    setProcessing(true);
    try {
      if (!currentUserId) throw new Error('Not authenticated');

      const { data: newExercise, error: exerciseError } = await supabase
        .from('exercise_library')
        .insert({
          trainer_id: currentUserId,
          title: `${exercise.title} (kopi)`,
          description: exercise.description,
          video_url: exercise.video_url,
        })
        .select()
        .single();

      if (exerciseError) throw exerciseError;

      if (exercise.subtasks.length > 0) {
        const subtasksToInsert = exercise.subtasks.map(subtask => ({
          exercise_id: newExercise.id,
          title: subtask.title,
          sort_order: subtask.sort_order,
        }));

        const { error: subtasksError } = await supabase
          .from('exercise_subtasks')
          .insert(subtasksToInsert);

        if (subtasksError) throw subtasksError;
      }

      Alert.alert('Succes', 'Øvelse duplikeret');
      if (currentUserId) {
        await fetchLibraryData(currentUserId);
      }
    } catch (error: any) {
      console.error('Error duplicating exercise:', error);
      Alert.alert('Fejl', 'Kunne ikke duplikere øvelse: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const openAssignModal = (exercise: Exercise) => {
    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Du kan ikke tildele denne øvelse');
      return;
    }
    
    setSelectedExercise(exercise);
    setShowAssignModal(true);
  };

  const handleAssignToPlayer = async (playerId: string) => {
    if (!selectedExercise || !currentUserId) return;

    setProcessing(true);
    try {
      const { error: assignmentError } = await supabase
        .from('exercise_assignments')
        .insert({
          exercise_id: selectedExercise.id,
          trainer_id: currentUserId,
          player_id: playerId,
          team_id: null,
        });

      if (assignmentError) {
        if (assignmentError.message.includes('duplicate')) {
          Alert.alert('Info', 'Denne øvelse er allerede tildelt denne spiller');
          setProcessing(false);
          return;
        } else {
          throw assignmentError;
        }
      }

      Alert.alert('Succes', `Øvelse "${selectedExercise.title}" er nu tildelt spilleren`);
      
      if (currentUserId) {
        await fetchLibraryData(currentUserId);
      }
      setShowAssignModal(false);
    } catch (error: any) {
      console.error('Error assigning exercise:', error);
      Alert.alert('Fejl', 'Kunne ikke tildele øvelse: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleAssignToTeam = async (teamId: string) => {
    if (!selectedExercise || !currentUserId) return;

    setProcessing(true);
    try {
      const { error: assignmentError } = await supabase
        .from('exercise_assignments')
        .insert({
          exercise_id: selectedExercise.id,
          trainer_id: currentUserId,
          player_id: null,
          team_id: teamId,
        });

      if (assignmentError) {
        if (assignmentError.message.includes('duplicate')) {
          Alert.alert('Info', 'Denne øvelse er allerede tildelt dette team');
          setProcessing(false);
          return;
        } else {
          throw assignmentError;
        }
      }

      Alert.alert('Succes', `Øvelse "${selectedExercise.title}" er nu tildelt teamet`);
      
      if (currentUserId) {
        await fetchLibraryData(currentUserId);
      }
      setShowAssignModal(false);
    } catch (error: any) {
      console.error('Error assigning exercise:', error);
      Alert.alert('Fejl', 'Kunne ikke tildele øvelse: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCopyToTasks = async (exercise: Exercise) => {
    setProcessing(true);
    try {
      if (!currentUserId) throw new Error('Not authenticated');

      console.log('🔄 Copying exercise to task template:', exercise.title);

      // Determine source folder for tracking
      let sourceFolder = null;
      if (exercise.is_system) {
        sourceFolder = 'FootballCoach Inspiration';
      } else if (exercise.trainer_name) {
        sourceFolder = `Fra træner: ${exercise.trainer_name}`;
      }

      const { data: taskTemplate, error: taskTemplateError } = await supabase
        .from('task_templates')
        .insert({
          user_id: currentUserId,
          player_id: currentUserId,
          title: exercise.title,
          description: exercise.description,
          video_url: exercise.video_url,
          reminder_minutes: null,
          source_folder: sourceFolder,
        })
        .select()
        .single();

      if (taskTemplateError) {
        console.error('❌ Error creating task template:', taskTemplateError);
        throw taskTemplateError;
      }

      if (exercise.subtasks.length > 0) {
        const subtasksToInsert = exercise.subtasks.map(subtask => ({
          task_template_id: taskTemplate.id,
          title: subtask.title,
          sort_order: subtask.sort_order,
        }));

        const { error: subtasksError } = await supabase
          .from('task_template_subtasks')
          .insert(subtasksToInsert);

        if (subtasksError) {
          console.error('❌ Error copying subtasks:', subtasksError);
        }
      }

      Alert.alert('Succes', `Øvelse "${exercise.title}" er nu kopieret til dine opgaveskabeloner`);
    } catch (error: any) {
      console.error('Error copying exercise to tasks:', error);
      Alert.alert('Fejl', 'Kunne ikke kopiere øvelse: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const openVideoModal = (url: string) => {
    setSelectedVideoUrl(url);
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

  const renderExerciseCard = (exercise: Exercise, isReadOnly: boolean = false) => {
    // System exercises are always read-only
    const isSystemExercise = exercise.is_system === true;
    const shouldBeReadOnly = isReadOnly || isSystemExercise;

    return (
      <View 
        key={exercise.id} 
        style={[styles.exerciseCard, { backgroundColor: cardBgColor }]}
      >
        <View style={styles.exerciseHeader}>
          <View style={styles.exerciseHeaderLeft}>
            <IconSymbol
              ios_icon_name="book.fill"
              android_material_icon_name="menu_book"
              size={24}
              color={colors.primary}
            />
            <View style={styles.exerciseTitleContainer}>
              <Text style={[styles.exerciseTitle, { color: textColor }]}>
                {exercise.title}
              </Text>
              {exercise.trainer_name && (
                <Text style={[styles.trainerName, { color: textSecondaryColor }]}>
                  Fra: {exercise.trainer_name}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.exerciseActions}>
            {shouldBeReadOnly ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.copyButton, { backgroundColor: colors.primary }]}
                onPress={() => handleCopyToTasks(exercise)}
                disabled={processing}
              >
                <IconSymbol
                  ios_icon_name="doc.on.doc"
                  android_material_icon_name="content_copy"
                  size={20}
                  color="#fff"
                />
                <Text style={styles.copyButtonText}>Kopiér til mine skabeloner</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openAssignModal(exercise)}
                  disabled={processing}
                >
                  <IconSymbol
                    ios_icon_name="person.badge.plus"
                    android_material_icon_name="person_add"
                    size={20}
                    color={colors.secondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleDuplicateExercise(exercise)}
                  disabled={processing}
                >
                  <IconSymbol
                    ios_icon_name="doc.on.doc"
                    android_material_icon_name="content_copy"
                    size={20}
                    color={colors.secondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openEditModal(exercise)}
                  disabled={processing}
                >
                  <IconSymbol
                    ios_icon_name="pencil"
                    android_material_icon_name="edit"
                    size={20}
                    color={colors.accent}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleDeleteExercise(exercise)}
                  disabled={processing}
                >
                  <IconSymbol
                    ios_icon_name="trash"
                    android_material_icon_name="delete"
                    size={20}
                    color={colors.error}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {exercise.description && (
          <View style={styles.descriptionContainer}>
            {isSystemExercise ? (
              // For system exercises, render focus points as bullet list
              exercise.description.split('\n').map((line, lineIndex) => (
                <View key={`${exercise.id}-line-${lineIndex}`} style={styles.focusPointItem}>
                  <Text style={[styles.focusPointBullet, { color: colors.primary }]}>•</Text>
                  <Text style={[styles.focusPointText, { color: textSecondaryColor }]}>
                    {line.trim()}
                  </Text>
                </View>
              ))
            ) : (
              // For regular exercises, render as normal text
              <Text style={[styles.exerciseDescription, { color: textSecondaryColor }]}>
                {exercise.description}
              </Text>
            )}
          </View>
        )}

        {exercise.video_url && (
          <View style={styles.videoPreviewContainer}>
            <SmartVideoPlayer url={exercise.video_url} />
          </View>
        )}

        {exercise.subtasks.length > 0 && (
          <View style={styles.subtasksContainer}>
            <Text style={[styles.subtasksTitle, { color: textColor }]}>Delopgaver:</Text>
            {exercise.subtasks.map((subtask, index) => (
              <View key={subtask.id} style={styles.subtaskItem}>
                <Text style={[styles.subtaskText, { color: textSecondaryColor }]}>
                  {index + 1}. {subtask.title}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  const renderFolder = (folder: FolderItem, level: number = 0) => {
    const isExpanded = expandedFolders.has(folder.id);
    const hasContent = (folder.exercises && folder.exercises.length > 0) || (folder.subfolders && folder.subfolders.length > 0);
    
    return (
      <React.Fragment key={folder.id}>
        <TouchableOpacity
          style={[
            styles.folderHeader,
            { 
              backgroundColor: cardBgColor,
              marginLeft: level * 16,
            }
          ]}
          onPress={() => toggleFolder(folder.id)}
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
            {folder.exercises && folder.exercises.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.countBadgeText}>{folder.exercises.length}</Text>
              </View>
            )}
          </View>
          <IconSymbol
            ios_icon_name={isExpanded ? 'chevron.down' : 'chevron.right'}
            android_material_icon_name={isExpanded ? 'expand_more' : 'chevron_right'}
            size={20}
            color={textSecondaryColor}
          />
        </TouchableOpacity>

        {isExpanded && (
          <View style={[styles.folderContent, { marginLeft: level * 16 }]}>
            {folder.subfolders && folder.subfolders.map(subfolder => renderFolder(subfolder, level + 1))}
            
            {folder.exercises && folder.exercises.length > 0 && (
              <View style={styles.exercisesContainer}>
                {folder.exercises.map(exercise => renderExerciseCard(exercise, folder.type === 'trainer' || folder.type === 'footballcoach'))}
              </View>
            )}

            {folder.exercises && folder.exercises.length === 0 && !folder.subfolders && (
              <View style={[styles.emptyFolder, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' }]}>
                <Text style={[styles.emptyFolderText, { color: textSecondaryColor }]}>
                  {folder.type === 'footballcoach' ? 'Kommer snart...' : 'Ingen øvelser endnu'}
                </Text>
              </View>
            )}
          </View>
        )}
      </React.Fragment>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: containerBgColor }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: textColor }]}>Indlæser bibliotek...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: containerBgColor }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: textColor }]}>
            Øvelsesbibliotek
          </Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            {isPlayer ? 'Øvelser fra dine trænere og inspiration' : 'Struktureret i mapper'}
          </Text>
        </View>
        {isAdmin && (
          <TouchableOpacity
            style={[styles.createButton, { backgroundColor: colors.primary }]}
            onPress={openCreateModal}
            activeOpacity={0.7}
          >
            <IconSymbol
              ios_icon_name="plus.circle.fill"
              android_material_icon_name="add_circle"
              size={24}
              color="#fff"
            />
            <Text style={styles.createButtonText}>Ny øvelse</Text>
          </TouchableOpacity>
        )}
      </View>

      {isPlayer && (
        <View style={[styles.infoBox, { backgroundColor: isDark ? '#2a3a4a' : '#e3f2fd' }]}>
          <IconSymbol
            ios_icon_name="info.circle"
            android_material_icon_name="info"
            size={20}
            color={colors.secondary}
          />
          <Text style={[styles.infoText, { color: isDark ? '#90caf9' : '#1976d2' }]}>
            Her kan du se øvelser fra dine trænere og FootballCoach inspiration. Tryk på &quot;Kopiér til mine skabeloner&quot; for at tilføje dem til dine egne opgaver.
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Personal Templates Folder */}
        {isAdmin && (
          <>
            {renderFolder({
              id: 'personal',
              name: 'Personlige templates',
              type: 'personal',
              icon: 'person.crop.circle.fill',
              androidIcon: 'account_circle',
              exercises: personalExercises,
            })}
          </>
        )}

        {/* Templates from Trainers Folder */}
        {!isAdmin && trainerFolders.length > 0 && (
          <>
            <TouchableOpacity
              style={[styles.folderHeader, { backgroundColor: cardBgColor }]}
              onPress={() => toggleFolder('trainers')}
            >
              <View style={styles.folderHeaderLeft}>
                <IconSymbol
                  ios_icon_name="person.2.fill"
                  android_material_icon_name="groups"
                  size={24}
                  color={colors.secondary}
                />
                <Text style={[styles.folderName, { color: textColor }]}>
                  Templates fra trænere
                </Text>
                <View style={[styles.countBadge, { backgroundColor: colors.secondary }]}>
                  <Text style={styles.countBadgeText}>{trainerFolders.length}</Text>
                </View>
              </View>
              <IconSymbol
                ios_icon_name={expandedFolders.has('trainers') ? 'chevron.down' : 'chevron.right'}
                android_material_icon_name={expandedFolders.has('trainers') ? 'expand_more' : 'chevron_right'}
                size={20}
                color={textSecondaryColor}
              />
            </TouchableOpacity>

            {expandedFolders.has('trainers') && (
              <View style={styles.folderContent}>
                {trainerFolders.map(folder => renderFolder(folder, 1))}
              </View>
            )}
          </>
        )}

        {/* FootballCoach Focus Areas Folder */}
        <TouchableOpacity
          style={[styles.folderHeader, { backgroundColor: cardBgColor }]}
          onPress={() => toggleFolder('footballcoach')}
        >
          <View style={styles.folderHeaderLeft}>
            <IconSymbol
              ios_icon_name="star.circle.fill"
              android_material_icon_name="stars"
              size={24}
              color={colors.accent}
            />
            <Text style={[styles.folderName, { color: textColor }]}>
              FootballCoach – Fokusområder
            </Text>
            <View style={[styles.readOnlyBadge, { backgroundColor: isDark ? '#444' : '#e0e0e0' }]}>
              <Text style={[styles.readOnlyBadgeText, { color: textSecondaryColor }]}>Inspiration</Text>
            </View>
          </View>
          <IconSymbol
            ios_icon_name={expandedFolders.has('footballcoach') ? 'chevron.down' : 'chevron.right'}
            android_material_icon_name={expandedFolders.has('footballcoach') ? 'expand_more' : 'chevron_right'}
            size={20}
            color={textSecondaryColor}
          />
        </TouchableOpacity>

        {expandedFolders.has('footballcoach') && (
          <View style={styles.folderContent}>
            {footballCoachFolders.map(folder => renderFolder(folder, 1))}
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Create/Edit Exercise Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => !processing && setShowModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalContainer, { backgroundColor: bgColor }]}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => !processing && setShowModal(false)} disabled={processing}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={textColor}
              />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: textColor }]}>
              {isCreating ? 'Ny øvelse' : 'Rediger øvelse'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.label, { color: textColor }]}>Titel *</Text>
            <TextInput
              style={[styles.input, { backgroundColor: cardBgColor, color: textColor }]}
              value={title}
              onChangeText={setTitle}
              placeholder="F.eks. Dribling øvelse"
              placeholderTextColor={textSecondaryColor}
              editable={!processing}
            />

            <Text style={[styles.label, { color: textColor }]}>Beskrivelse</Text>
            <TextInput
              style={[styles.input, styles.textArea, { backgroundColor: cardBgColor, color: textColor }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Beskriv øvelsen..."
              placeholderTextColor={textSecondaryColor}
              multiline
              numberOfLines={4}
              editable={!processing}
            />

            <View style={styles.videoSection}>
              <View style={styles.videoLabelRow}>
                <Text style={[styles.label, { color: textColor }]}>Video URL (YouTube eller Vimeo)</Text>
                {videoUrl.trim() && (
                  <TouchableOpacity
                    style={styles.deleteVideoButton}
                    onPress={handleDeleteVideo}
                    disabled={processing}
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
                style={[styles.input, { backgroundColor: cardBgColor, color: textColor }]}
                value={videoUrl}
                onChangeText={setVideoUrl}
                placeholder="https://youtube.com/... eller https://vimeo.com/..."
                placeholderTextColor={textSecondaryColor}
                editable={!processing}
                autoCapitalize="none"
              />
              {videoUrl.trim() && (
                <View style={styles.videoPreviewSmall}>
                  <SmartVideoPlayer url={videoUrl} />
                  <Text style={[styles.helperText, { color: colors.secondary }]}>
                    ✓ Video URL gemt
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.subtasksSection}>
              <View style={styles.subtasksHeader}>
                <Text style={[styles.label, { color: textColor }]}>Delopgaver</Text>
                <TouchableOpacity
                  style={[styles.addSubtaskButton, { backgroundColor: colors.primary }]}
                  onPress={addSubtask}
                  disabled={processing}
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
                    style={[styles.subtaskInput, { backgroundColor: cardBgColor, color: textColor }]}
                    value={subtask}
                    onChangeText={(value) => updateSubtask(index, value)}
                    placeholder={`Delopgave ${index + 1}`}
                    placeholderTextColor={textSecondaryColor}
                    editable={!processing}
                  />
                  {subtasks.length > 1 && (
                    <TouchableOpacity
                      style={styles.removeSubtaskButton}
                      onPress={() => removeSubtask(index)}
                      disabled={processing}
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
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={[styles.cancelButton, { backgroundColor: cardBgColor }]}
              onPress={() => setShowModal(false)}
              disabled={processing}
            >
              <Text style={[styles.cancelButtonText, { color: textColor }]}>Annuller</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary, opacity: processing ? 0.6 : 1 }]}
              onPress={handleSaveExercise}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>{processing ? 'Gemmer...' : 'Gem'}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Assign Exercise Modal */}
      <Modal
        visible={showAssignModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={[styles.modalContainer, { backgroundColor: bgColor }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAssignModal(false)}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={textColor}
              />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: textColor }]}>Tildel øvelse</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={[styles.sectionTitle, { color: textColor }]}>Spillere</Text>
            {players.length === 0 ? (
              <View style={[styles.emptySection, { backgroundColor: cardBgColor }]}>
                <Text style={[styles.emptySectionText, { color: textSecondaryColor }]}>
                  Ingen spillere tilgængelige
                </Text>
              </View>
            ) : (
              players.map((player) => (
                <TouchableOpacity
                  key={player.id}
                  style={[styles.assignCard, { backgroundColor: cardBgColor }]}
                  onPress={() => handleAssignToPlayer(player.id)}
                  disabled={processing}
                  activeOpacity={0.7}
                >
                  <View style={styles.assignIcon}>
                    <IconSymbol
                      ios_icon_name="person.fill"
                      android_material_icon_name="person"
                      size={24}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={[styles.assignName, { color: textColor }]}>{player.full_name}</Text>
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="chevron_right"
                    size={20}
                    color={textSecondaryColor}
                  />
                </TouchableOpacity>
              ))
            )}

            <Text style={[styles.sectionTitle, { color: textColor, marginTop: 24 }]}>Teams</Text>
            {teams.length === 0 ? (
              <View style={[styles.emptySection, { backgroundColor: cardBgColor }]}>
                <Text style={[styles.emptySectionText, { color: textSecondaryColor }]}>
                  Ingen teams tilgængelige
                </Text>
              </View>
            ) : (
              teams.map((team) => (
                <TouchableOpacity
                  key={team.id}
                  style={[styles.assignCard, { backgroundColor: cardBgColor }]}
                  onPress={() => handleAssignToTeam(team.id)}
                  disabled={processing}
                  activeOpacity={0.7}
                >
                  <View style={styles.assignIcon}>
                    <IconSymbol
                      ios_icon_name="person.3.fill"
                      android_material_icon_name="groups"
                      size={24}
                      color={colors.primary}
                    />
                  </View>
                  <Text style={[styles.assignName, { color: textColor }]}>{team.name}</Text>
                  <IconSymbol
                    ios_icon_name="chevron.right"
                    android_material_icon_name="chevron_right"
                    size={20}
                    color={textSecondaryColor}
                  />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* Video Modal */}
      {selectedVideoUrl && (
        <Modal
          visible={showVideoModal}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={() => setShowVideoModal(false)}
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
                onPress={() => setShowVideoModal(false)}
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
                Video
              </Text>
              <View style={{ width: 32 }} />
            </View>
            <SmartVideoPlayer url={selectedVideoUrl} />
          </View>
        </Modal>
      )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 60 : 70,
    paddingHorizontal: 20,
    paddingBottom: 20,
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
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
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
  readOnlyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  readOnlyBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  folderContent: {
    marginBottom: 8,
  },
  exercisesContainer: {
    gap: 8,
  },
  emptyFolder: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  emptyFolderText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  exerciseCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
  },
  exerciseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  exerciseHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  exerciseTitleContainer: {
    flex: 1,
  },
  exerciseTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  trainerName: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  exerciseActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.highlight,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  copyButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  exerciseDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  descriptionContainer: {
    marginBottom: 12,
  },
  focusPointItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingLeft: 4,
  },
  focusPointBullet: {
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 8,
    marginTop: -2,
  },
  focusPointText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  videoPreviewContainer: {
    marginBottom: 12,
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
  subtasksContainer: {
    marginTop: 8,
  },
  subtasksTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtaskItem: {
    paddingVertical: 4,
  },
  subtaskText: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.highlight,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  subtasksSection: {
    marginTop: 8,
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
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.highlight,
  },
  removeSubtaskButton: {
    padding: 4,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: colors.highlight,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  emptySection: {
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptySectionText: {
    fontSize: 15,
    textAlign: 'center',
  },
  assignCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  assignIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
});
