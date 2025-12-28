
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
import { useAdmin } from '@/contexts/AdminContext';
import { useFocusEffect } from '@react-navigation/native';
import SmartVideoPlayer from '@/components/SmartVideoPlayer';
import { AdminContextWrapper } from '@/components/AdminContextWrapper';

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
  assignmentSummary?: string;
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
  const { adminMode, adminTargetId, adminTargetType } = useAdmin();
  const [personalExercises, setPersonalExercises] = useState<Exercise[]>([]);
  const [trainerFolders, setTrainerFolders] = useState<FolderItem[]>([]);
  const [footballCoachFolders, setFootballCoachFolders] = useState<FolderItem[]>(FOOTBALLCOACH_STRUCTURE);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['personal', 'trainers', 'footballcoach']));
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showRevokeModal, setShowRevokeModal] = useState(false);
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

  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetType === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  const isPlayer = userRole === 'player';

  const fetchLibraryData = useCallback(async (userId: string) => {
    try {
      setLoading(true);

      // STEP D: Determine effective player ID
      const effectivePlayerId = adminMode !== 'self' ? adminTargetId : userId;

      if (isAdmin && adminMode === 'self') {
        // TRAINERS in SELF mode: Show their own personal templates
        const [exercisesResult, systemExercisesResult] = await Promise.all([
          supabase
            .from('exercise_library')
            .select('*')
            .eq('trainer_id', userId)
            .neq('is_system', true)
            .order('created_at', { ascending: false }),
          supabase
            .from('exercise_library')
            .select('*')
            .eq('is_system', true)
            .order('created_at', { ascending: true })
        ]);

        if (exercisesResult.error) throw exercisesResult.error;
        if (systemExercisesResult.error) throw systemExercisesResult.error;

        const exerciseIds = exercisesResult.data?.map(e => e.id) || [];
        const systemExerciseIds = systemExercisesResult.data?.map(e => e.id) || [];
        const allExerciseIds = [...exerciseIds, ...systemExerciseIds];
        
        const [subtasksResult, assignmentsResult] = await Promise.all([
          supabase
            .from('exercise_subtasks')
            .select('*')
            .in('exercise_id', allExerciseIds)
            .order('sort_order', { ascending: true }),
          supabase
            .from('exercise_assignments')
            .select('*')
            .in('exercise_id', exerciseIds)
        ]);

        if (subtasksResult.error) throw subtasksResult.error;
        if (assignmentsResult.error) throw assignmentsResult.error;

        const playerIds = [...new Set((assignmentsResult.data || [])
          .filter(a => a.player_id)
          .map(a => a.player_id))];

        let playerNamesMap: Record<string, string> = {};
        
        if (playerIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', playerIds);

          if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
          } else {
            playerNamesMap = (profilesData || []).reduce((acc, profile) => {
              acc[profile.id] = profile.full_name;
              return acc;
            }, {} as Record<string, string>);
          }
        }

        const exercisesWithDetails: Exercise[] = (exercisesResult.data || []).map(exercise => {
          const exerciseAssignments = (assignmentsResult.data || []).filter(a => a.exercise_id === exercise.id);
          
          let assignmentSummary = '';
          if (exerciseAssignments.length > 0) {
            const playerAssignments = exerciseAssignments.filter(a => a.player_id);
            const teamAssignments = exerciseAssignments.filter(a => a.team_id);
            
            if (playerAssignments.length > 0) {
              if (playerAssignments.length <= 2) {
                const names = playerAssignments
                  .map(a => playerNamesMap[a.player_id!] || 'Spiller')
                  .join(', ');
                assignmentSummary = `Kopieret til: ${names}`;
              } else {
                assignmentSummary = `Kopieret til ${playerAssignments.length} spillere`;
              }
            }
            
            if (teamAssignments.length > 0) {
              const teamText = teamAssignments.length === 1 ? '1 team' : `${teamAssignments.length} teams`;
              assignmentSummary = assignmentSummary 
                ? `${assignmentSummary} + ${teamText}`
                : `Kopieret til ${teamText}`;
            }
          }

          const assignmentsWithNames = exerciseAssignments.map(assignment => ({
            ...assignment,
            player_name: assignment.player_id ? playerNamesMap[assignment.player_id] || 'Spiller' : undefined,
          }));

          return {
            ...exercise,
            created_at: new Date(exercise.created_at),
            updated_at: new Date(exercise.updated_at),
            subtasks: (subtasksResult.data || []).filter(s => s.exercise_id === exercise.id),
            assignments: assignmentsWithNames,
            isAssignedByCurrentTrainer: true,
            assignmentSummary,
          };
        });

        setPersonalExercises(exercisesWithDetails);
        setTrainerFolders([]);

        const updatedFootballCoachFolders = FOOTBALLCOACH_STRUCTURE.map(mainFolder => {
          const updatedSubfolders = mainFolder.subfolders?.map(subfolder => {
            const categoryExercises = (systemExercisesResult.data || [])
              .filter(ex => ex.category_path === subfolder.id)
              .map(exercise => ({
                ...exercise,
                created_at: new Date(exercise.created_at),
                updated_at: new Date(exercise.updated_at),
                subtasks: (subtasksResult.data || []).filter(s => s.exercise_id === exercise.id),
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

      } else {
        // STEP D: PLAYERS (self mode) OR TRAINERS in ADMIN mode
        // Both use the same data flow with effectivePlayerId
        
        if (!effectivePlayerId) {
          throw new Error('No target player ID');
        }

        const [assignmentsResult, systemExercisesResult] = await Promise.all([
          supabase
            .from('exercise_assignments')
            .select('*')
            .eq('player_id', effectivePlayerId),
          supabase
            .from('exercise_library')
            .select('*')
            .eq('is_system', true)
            .order('created_at', { ascending: true })
        ]);

        if (assignmentsResult.error) throw assignmentsResult.error;
        if (systemExercisesResult.error) throw systemExercisesResult.error;

        const exerciseIds = assignmentsResult.data?.map(a => a.exercise_id) || [];
        const systemExerciseIds = systemExercisesResult.data?.map(e => e.id) || [];
        const allExerciseIds = [...exerciseIds, ...systemExerciseIds];
        
        const trainerIds = [...new Set(assignmentsResult.data?.map(a => a.trainer_id) || [])];
        
        const [exercisesResult, subtasksResult, trainersResult] = await Promise.all([
          supabase
            .from('exercise_library')
            .select('*')
            .in('id', exerciseIds),
          supabase
            .from('exercise_subtasks')
            .select('*')
            .in('exercise_id', allExerciseIds)
            .order('sort_order', { ascending: true }),
          trainerIds.length > 0 
            ? supabase
                .from('profiles')
                .select('user_id, full_name')
                .in('user_id', trainerIds)
            : Promise.resolve({ data: [], error: null })
        ]);

        if (exercisesResult.error) throw exercisesResult.error;
        if (subtasksResult.error) throw subtasksResult.error;
        if (trainersResult.error) throw trainersResult.error;

        const trainerMap = new Map<string, FolderItem>();
        
        (assignmentsResult.data || []).forEach(assignment => {
          const exercise = exercisesResult.data?.find(e => e.id === assignment.exercise_id);
          if (!exercise) return;

          const trainerId = assignment.trainer_id;
          const trainerProfile = trainersResult.data?.find(t => t.user_id === trainerId);
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
            subtasks: (subtasksResult.data || []).filter(s => s.exercise_id === exercise.id),
            assignments: [assignment],
            trainer_name: trainerName,
          };

          folder.exercises!.push(exerciseWithDetails);
        });

        const folders = Array.from(trainerMap.values());
        setTrainerFolders(folders);
        setPersonalExercises([]);

        const updatedFootballCoachFolders = FOOTBALLCOACH_STRUCTURE.map(mainFolder => {
          const updatedSubfolders = mainFolder.subfolders?.map(subfolder => {
            const categoryExercises = (systemExercisesResult.data || [])
              .filter(ex => ex.category_path === subfolder.id)
              .map(exercise => ({
                ...exercise,
                created_at: new Date(exercise.created_at),
                updated_at: new Date(exercise.updated_at),
                subtasks: (subtasksResult.data || []).filter(s => s.exercise_id === exercise.id),
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
      }

    } catch (error) {
      console.error('Error fetching library data:', error);
      Alert.alert('Fejl', 'Kunne ikke hente bibliotek');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  }, [isAdmin, adminMode, adminTargetId, adminTargetType, isAdminMode]);

  useEffect(() => {
    let isMounted = true;

    const getCurrentUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          if (isMounted) {
            setInitialLoad(false);
          }
          return;
        }
        
        if (isMounted) {
          setCurrentUserId(user.id);
        }
      } catch (error) {
        console.error('Error getting user:', error);
        if (isMounted) {
          setInitialLoad(false);
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
      return;
    }

    fetchLibraryData(currentUserId);
  }, [currentUserId, selectedContext, fetchLibraryData]);

  useFocusEffect(
    useCallback(() => {
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
    if (adminMode !== 'self') return;

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
    if (adminMode !== 'self') return;

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

      if (isCreating) {
        const { data: newExercise, error: exerciseError } = await supabase
          .from('exercise_library')
          .insert({
            trainer_id: currentUserId,
            title,
            description: description || null,
            video_url: videoUrl.trim() || null,
            is_system: false,
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
    if (adminMode !== 'self') return;

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
            setProcessing(true);
            try {
              const { error: assignmentsError } = await supabase
                .from('exercise_assignments')
                .delete()
                .eq('exercise_id', exercise.id);

              if (assignmentsError) {
                throw assignmentsError;
              }

              const { error: exerciseError } = await supabase
                .from('exercise_library')
                .delete()
                .eq('id', exercise.id);

              if (exerciseError) {
                throw exerciseError;
              }

              setPersonalExercises(prev => prev.filter(t => t.id !== exercise.id));

              setProcessing(false);
              Alert.alert('Succes', 'Øvelse slettet');
            } catch (error: any) {
              Alert.alert('Fejl', 'Kunne ikke slette øvelse: ' + error.message);
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleDuplicateExercise = async (exercise: Exercise) => {
    if (adminMode !== 'self') return;

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
          is_system: false,
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
    if (adminMode !== 'self') return;

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
    if (adminMode !== 'self') return;

    setProcessing(true);
    try {
      if (!currentUserId) throw new Error('Not authenticated');

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
          console.error('Error copying subtasks:', subtasksError);
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

  const handleRemoveAssignedExercise = (exercise: Exercise) => {
    if (isAdmin) {
      Alert.alert('Fejl', 'Denne funktion er kun for spillere');
      return;
    }

    Alert.alert(
      'Fjern øvelse',
      `Er du sikker på at du vil fjerne "${exercise.title}" fra dit bibliotek?\n\nØvelsen vil stadig være tilgængelig hos din træner.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Fjern',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              if (!currentUserId) throw new Error('Not authenticated');

              const { error: deleteError } = await supabase
                .from('exercise_assignments')
                .delete()
                .eq('exercise_id', exercise.id)
                .eq('player_id', currentUserId);

              if (deleteError) {
                throw deleteError;
              }

              Alert.alert('Succes', 'Øvelse fjernet fra dit bibliotek');

              if (currentUserId) {
                await fetchLibraryData(currentUserId);
              }
            } catch (error: any) {
              console.error('Error removing assigned exercise:', error);
              Alert.alert('Fejl', 'Kunne ikke fjerne øvelse: ' + error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const openRevokeModal = (exercise: Exercise) => {
    if (adminMode !== 'self') return;

    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Kun trænere kan tilbagekalde øvelser');
      return;
    }

    if (!exercise.assignments || exercise.assignments.length === 0) {
      Alert.alert('Info', 'Denne øvelse er ikke tildelt nogen spillere');
      return;
    }

    setSelectedExercise(exercise);
    setShowRevokeModal(true);
  };

  const handleRevokeFromPlayer = async (playerId: string, playerName: string) => {
    if (!selectedExercise || !currentUserId) return;

    const displayName = playerName || 'Spiller';

    Alert.alert(
      'Tilbagekald øvelse',
      `Er du sikker på at du vil tilbagekalde "${selectedExercise.title}" fra ${displayName}?`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Tilbagekald',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const { error: deleteError } = await supabase
                .from('exercise_assignments')
                .delete()
                .eq('exercise_id', selectedExercise.id)
                .eq('player_id', playerId);

              if (deleteError) {
                throw deleteError;
              }

              Alert.alert('Succes', `Øvelse tilbagekaldt fra ${displayName}`);

              if (currentUserId) {
                await fetchLibraryData(currentUserId);
              }

              const remainingAssignments = selectedExercise.assignments.filter(a => a.player_id !== playerId);
              if (remainingAssignments.length === 0) {
                setShowRevokeModal(false);
              }
            } catch (error: any) {
              console.error('Error revoking exercise:', error);
              Alert.alert('Fejl', 'Kunne ikke tilbagekalde øvelse: ' + error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleRevokeFromAll = async () => {
    if (!selectedExercise || !currentUserId) return;

    const assignmentCount = selectedExercise.assignments.length;

    Alert.alert(
      'Tilbagekald fra alle',
      `Er du sikker på at du vil tilbagekalde "${selectedExercise.title}" fra alle ${assignmentCount} spillere?`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Tilbagekald alle',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              const { error: deleteError } = await supabase
                .from('exercise_assignments')
                .delete()
                .eq('exercise_id', selectedExercise.id);

              if (deleteError) {
                throw deleteError;
              }

              Alert.alert('Succes', `Øvelse tilbagekaldt fra alle spillere`);

              if (currentUserId) {
                await fetchLibraryData(currentUserId);
              }

              setShowRevokeModal(false);
            } catch (error: any) {
              console.error('Error revoking exercise from all:', error);
              Alert.alert('Fejl', 'Kunne ikke tilbagekalde øvelse: ' + error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
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

  const getSourceLabel = (exercise: Exercise): string => {
    if (exercise.is_system) {
      return 'Fra: FootballCoach';
    } else if (exercise.trainer_name) {
      return `Fra: ${exercise.trainer_name}`;
    } else {
      return 'Fra: Mig';
    }
  };

  const truncateText = (text: string, maxLines: number): string => {
    const lines = text.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + '...';
    }
    return text;
  };

  const renderExerciseCard = (exercise: Exercise, isReadOnly: boolean = false) => {
    const isSystemExercise = exercise.is_system === true;
    const shouldBeReadOnly = isReadOnly || isSystemExercise || isAdminMode;

    const sourceLabel = getSourceLabel(exercise);

    let displayDescription = '';
    if (exercise.description) {
      if (isSystemExercise) {
        const lines = exercise.description.split('\n').filter(line => line.trim());
        displayDescription = lines.slice(0, 3).join('\n');
        if (lines.length > 3) {
          displayDescription += '\n...';
        }
      } else {
        displayDescription = truncateText(exercise.description, 3);
      }
    }

    return (
      <View 
        key={exercise.id} 
        style={[styles.exerciseCard, { backgroundColor: cardBgColor }]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderContent}>
            <Text 
              style={[styles.cardTitle, { color: textColor }]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {exercise.title}
            </Text>
            <Text style={[styles.cardSource, { color: textSecondaryColor }]}>
              {sourceLabel}
            </Text>
          </View>
          <IconSymbol
            ios_icon_name="book.fill"
            android_material_icon_name="menu_book"
            size={20}
            color={colors.primary}
          />
        </View>

        {displayDescription && (
          <View style={styles.cardBody}>
            {isSystemExercise ? (
              displayDescription.split('\n').map((line, lineIndex) => {
                if (!line.trim()) return null;
                return (
                  <View key={`${exercise.id}-line-${lineIndex}`} style={styles.focusPointItem}>
                    <Text style={[styles.focusPointBullet, { color: colors.primary }]}>•</Text>
                    <Text 
                      style={[styles.focusPointText, { color: textSecondaryColor }]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {line.trim()}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text 
                style={[styles.cardDescription, { color: textSecondaryColor }]}
                numberOfLines={3}
                ellipsizeMode="tail"
              >
                {displayDescription}
              </Text>
            )}
          </View>
        )}

        <View style={styles.cardFooter}>
          {shouldBeReadOnly ? (
            <React.Fragment>
              <TouchableOpacity
                style={[styles.ctaButton, { backgroundColor: colors.primary, flex: exercise.trainer_name ? 0.7 : 1 }]}
                onPress={() => handleCopyToTasks(exercise)}
                disabled={processing || isAdminMode}
              >
                <IconSymbol
                  ios_icon_name="doc.on.doc"
                  android_material_icon_name="content_copy"
                  size={18}
                  color="#fff"
                />
                <Text style={styles.ctaButtonText}>Kopiér til mine skabeloner</Text>
              </TouchableOpacity>
              {exercise.trainer_name && !isSystemExercise && !isAdminMode && (
                <TouchableOpacity
                  style={[styles.deleteAssignmentButton, { backgroundColor: colors.error }]}
                  onPress={() => handleRemoveAssignedExercise(exercise)}
                  disabled={processing}
                >
                  <IconSymbol
                    ios_icon_name="trash.fill"
                    android_material_icon_name="delete"
                    size={18}
                    color="#fff"
                  />
                </TouchableOpacity>
              )}
            </React.Fragment>
          ) : (
            <React.Fragment>
              <View style={styles.footerLeft}>
                {exercise.assignmentSummary ? (
                  <TouchableOpacity onPress={() => openRevokeModal(exercise)} disabled={processing}>
                    <Text style={[styles.statusText, { color: colors.secondary }]}>
                      {exercise.assignmentSummary}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.statusText, { color: textSecondaryColor }]}>
                    Ikke kopieret
                  </Text>
                )}
              </View>
              <View style={styles.footerActions}>
                <TouchableOpacity
                  style={styles.iconButton}
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
                  style={styles.iconButton}
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
                  style={styles.iconButton}
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
                  style={styles.iconButton}
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
              </View>
            </React.Fragment>
          )}
        </View>
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

  if (initialLoad) {
    return (
      <AdminContextWrapper
        isAdmin={isAdminMode}
        contextName={selectedContext?.name}
        contextType={adminTargetType || 'player'}
      >
        <View style={[styles.container, { backgroundColor: bgColor }]}>
          <View style={styles.header}>
            <View>
              <Text style={[styles.headerTitle, { color: textColor }]}>
                Øvelsesbibliotek
              </Text>
              <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
                {isPlayer ? 'Øvelser fra dine trænere og inspiration' : 'Struktureret i mapper'}
              </Text>
            </View>
          </View>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: textColor }]}>Indlæser bibliotek...</Text>
          </View>
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
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={styles.header}>
          <View>
            <Text style={[styles.headerTitle, { color: textColor }]}>
              Øvelsesbibliotek
            </Text>
            <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
              {isPlayer || isAdminMode ? 'Øvelser fra dine trænere og inspiration' : 'Struktureret i mapper'}
            </Text>
          </View>
          {isAdmin && !isAdminMode && (
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

        {(isPlayer || isAdminMode) && (
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

        {/* STEP E: Static inline info-box when adminMode !== 'self' */}
        {adminMode !== 'self' && (
          <View style={[styles.adminInfoBox, { backgroundColor: isDark ? '#3a2a1a' : '#FFF3E0', borderColor: isDark ? '#B8860B' : '#FF9800' }]}>
            <IconSymbol
              ios_icon_name="exclamationmark.triangle.fill"
              android_material_icon_name="warning"
              size={20}
              color={isDark ? '#FFB74D' : '#F57C00'}
            />
            <Text style={[styles.adminInfoText, { color: isDark ? '#FFB74D' : '#E65100' }]}>
              Du kan kun redigere indhold, du selv har oprettet.
            </Text>
          </View>
        )}

        {loading && (
          <View style={styles.refreshingIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          {isAdmin && !isAdminMode && (
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

          {(isPlayer || isAdminMode) && trainerFolders.length > 0 && (
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

        <Modal
          visible={showRevokeModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setShowRevokeModal(false)}
        >
          <View style={[styles.modalContainer, { backgroundColor: bgColor }]}>
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setShowRevokeModal(false)}>
                <IconSymbol
                  ios_icon_name="xmark"
                  android_material_icon_name="close"
                  size={24}
                  color={textColor}
                />
              </TouchableOpacity>
              <Text style={[styles.modalTitle, { color: textColor }]}>Tilbagekald øvelse</Text>
              <View style={{ width: 24 }} />
            </View>

            <ScrollView style={styles.modalContent}>
              {selectedExercise && (
                <>
                  <Text style={[styles.sectionTitle, { color: textColor }]}>
                    {selectedExercise.title}
                  </Text>
                  <Text style={[styles.revokeSubtitle, { color: textSecondaryColor, marginBottom: 20 }]}>
                    Vælg hvem du vil tilbagekalde øvelsen fra
                  </Text>

                  {selectedExercise.assignments.length > 1 && (
                    <TouchableOpacity
                      style={[styles.revokeAllButton, { backgroundColor: colors.error }]}
                      onPress={handleRevokeFromAll}
                      disabled={processing}
                      activeOpacity={0.7}
                    >
                      <IconSymbol
                        ios_icon_name="person.2.slash"
                        android_material_icon_name="group_remove"
                        size={24}
                        color="#fff"
                      />
                      <Text style={styles.revokeAllButtonText}>
                        Tilbagekald fra alle ({selectedExercise.assignments.length} spillere)
                      </Text>
                    </TouchableOpacity>
                  )}

                  <Text style={[styles.sectionTitle, { color: textColor, marginTop: 24 }]}>
                    Tildelt til
                  </Text>

                  {selectedExercise.assignments
                    .filter(a => a.player_id)
                    .map((assignment) => {
                      const displayName = assignment.player_name || 'Spiller';
                      
                      return (
                        <TouchableOpacity
                          key={assignment.id}
                          style={[styles.revokeCard, { backgroundColor: cardBgColor }]}
                          onPress={() => handleRevokeFromPlayer(assignment.player_id!, displayName)}
                          disabled={processing}
                          activeOpacity={0.7}
                        >
                          <View style={styles.revokeCardLeft}>
                            <View style={styles.assignIcon}>
                              <IconSymbol
                                ios_icon_name="person.fill"
                                android_material_icon_name="person"
                                size={24}
                                color={colors.primary}
                              />
                            </View>
                            <Text style={[styles.assignName, { color: textColor }]}>
                              {displayName}
                            </Text>
                          </View>
                          <IconSymbol
                            ios_icon_name="xmark.circle.fill"
                            android_material_icon_name="cancel"
                            size={24}
                            color={colors.error}
                          />
                        </TouchableOpacity>
                      );
                    })}

                  {selectedExercise.assignments
                    .filter(a => a.team_id)
                    .map((assignment) => (
                      <View
                        key={assignment.id}
                        style={[styles.revokeCard, { backgroundColor: cardBgColor }]}
                      >
                        <View style={styles.revokeCardLeft}>
                          <View style={styles.assignIcon}>
                            <IconSymbol
                              ios_icon_name="person.3.fill"
                              android_material_icon_name="groups"
                              size={24}
                              color={colors.primary}
                            />
                          </View>
                          <Text style={[styles.assignName, { color: textColor }]}>
                            Team: {assignment.team_name || 'Ukendt'}
                          </Text>
                        </View>
                        <Text style={[styles.teamNote, { color: textSecondaryColor }]}>
                          (Team-tildelinger kan ikke tilbagekaldes individuelt)
                        </Text>
                      </View>
                    ))}
                </>
              )}
            </ScrollView>
          </View>
        </Modal>

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
              <SmartVideoPlayer url={selectedVideoUrl || undefined} />
            </View>
          </Modal>
        )}
      </View>
    </AdminContextWrapper>
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
  refreshingIndicator: {
    paddingVertical: 8,
    alignItems: 'center',
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
  adminInfoBox: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 20,
    marginBottom: 16,
    borderRadius: 12,
    borderWidth: 2,
  },
  adminInfoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
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
    gap: 12,
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
    padding: 16,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  cardHeaderContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 24,
    marginBottom: 4,
  },
  cardSource: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 2,
  },
  cardBody: {
    marginBottom: 12,
  },
  cardDescription: {
    fontSize: 15,
    lineHeight: 22,
  },
  focusPointItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    paddingLeft: 4,
  },
  focusPointBullet: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
    marginTop: -2,
  },
  focusPointText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.highlight,
  },
  footerLeft: {
    flex: 1,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.highlight,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    flex: 1,
  },
  ctaButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  deleteAssignmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    flex: 0.3,
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
  revokeSubtitle: {
    fontSize: 15,
    lineHeight: 22,
  },
  revokeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  revokeAllButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  revokeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 12,
  },
  revokeCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  teamNote: {
    fontSize: 12,
    fontStyle: 'italic',
  },
});
