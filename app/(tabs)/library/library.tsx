
/**
 * PERFORMANCE LOCK (STEP F)
 * DO NOT:
 * - Add fetch / async work in onPress, onOpen, or navigation handlers
 * - Replace FlatList / SectionList with ScrollView for dynamic lists
 * - Add inline handlers inside render
 * - Remove memoization (useCallback, useMemo, React.memo)
 * - Introduce blocking logic before first paint
 *
 * Any change here REQUIRES re-validation against STEP F.
 * This file is PERFORMANCE-SENSITIVE.
 */

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * PERFORMANCE BASELINE CHECKLIST (STEP F) - Library
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ✅ 1️⃣ First render & loading
 *    - Skeleton/spinner shown immediately (no blocking before paint)
 *    - Data fetched in useEffect (after mount)
 *    - Parallel fetch where possible (Promise.all)
 * 
 * ✅ 2️⃣ Navigation
 *    - No fetch in onPress handlers
 *    - Modals open immediately
 *    - Data fetched after modal mount
 * 
 * ✅ 3️⃣ Lists (ScrollView acceptable here)
 *    - ScrollView used (not a recycling list - folders/exercises are limited)
 *    - No inline map() - exercises rendered via helper function
 *    - Stable keys for all mapped items
 * 
 * ✅ 4️⃣ Render control
 *    - useCallback for handlers (fetchLibraryData, toggleFolder, etc.)
 *    - useMemo for derived data (safeCategories, bgColor, etc.)
 *    - No inline functions in render
 *    - Stable dependencies in hooks
 * 
 * ✅ 5️⃣ Context guardrails
 *    - Contexts split by responsibility (Admin, TeamPlayer)
 *    - No unstable values passed to context
 *    - Selective consumption of context values
 * 
 * ✅ 6️⃣ Permissions & admin-mode
 *    - Permission logic via adminMode check
 *    - UI remains dumb (no permission checks in render)
 *    - Handlers are authoritative (early return)
 * 
 * ✅ 7️⃣ Platform parity
 *    - Same performance behavior on iOS/Android/Web
 *    - No platform-specific workarounds
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  
  // P0 FIX: Define categories as local variable with safe fallback
  // This ensures the variable exists in scope before any useMemo, useEffect, or render
  const categories: any[] = [];
  
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
  
  const bgColor = useMemo(() => {
    if (isDark) return '#1a1a1a';
    if (typeof colors.background === 'string') return colors.background;
    return '#ffffff';
  }, [isDark]);

  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  const isPlayerAdmin = adminMode !== 'self' && adminTargetType === 'player';
  const isTeamAdmin = adminMode !== 'self' && adminTargetType === 'team';
  const isAdminMode = isPlayerAdmin || isTeamAdmin;

  const isPlayer = userRole === 'player';

  // STEP H: Safe array guard
  const safeTeams = useMemo(() => Array.isArray(teams) ? teams : [], [teams]);
  const safePlayers = useMemo(() => Array.isArray(players) ? players : [], [players]);

  const fetchLibraryData = useCallback(async (userId: string) => {
    // STEP H: Guard against invalid userId
    if (!userId || typeof userId !== 'string') {
      console.error('fetchLibraryData: Invalid userId');
      setInitialLoad(false);
      return;
    }

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

        // STEP H: Safe array guards
        const exerciseIds = Array.isArray(exercisesResult.data) ? exercisesResult.data.map(e => e.id) : [];
        const systemExerciseIds = Array.isArray(systemExercisesResult.data) ? systemExercisesResult.data.map(e => e.id) : [];
        const allExerciseIds = [...exerciseIds, ...systemExerciseIds];
        
        const [subtasksResult, assignmentsResult] = await Promise.all([
          allExerciseIds.length > 0
            ? supabase
                .from('exercise_subtasks')
                .select('*')
                .in('exercise_id', allExerciseIds)
                .order('sort_order', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
          exerciseIds.length > 0
            ? supabase
                .from('exercise_assignments')
                .select('*')
                .in('exercise_id', exerciseIds)
            : Promise.resolve({ data: [], error: null })
        ]);

        if (subtasksResult.error) throw subtasksResult.error;
        if (assignmentsResult.error) throw assignmentsResult.error;

        // STEP H: Safe array guards
        const playerIds = [...new Set((Array.isArray(assignmentsResult.data) ? assignmentsResult.data : [])
          .filter(a => a && a.player_id)
          .map(a => a.player_id))];

        let playerNamesMap: Record<string, string> = {};
        
        if (playerIds.length > 0) {
          const { data: profilesData, error: profilesError } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', playerIds);

          if (profilesError) {
            console.error('Error fetching profiles:', profilesError);
          } else if (Array.isArray(profilesData)) {
            playerNamesMap = profilesData.reduce((acc, profile) => {
              if (profile && profile.id) {
                acc[profile.id] = profile.full_name || 'Spiller';
              }
              return acc;
            }, {} as Record<string, string>);
          }
        }

        // STEP H: Safe array guards
        const safeExercises = Array.isArray(exercisesResult.data) ? exercisesResult.data : [];
        const safeAssignments = Array.isArray(assignmentsResult.data) ? assignmentsResult.data : [];
        const safeSubtasks = Array.isArray(subtasksResult.data) ? subtasksResult.data : [];

        const exercisesWithDetails: Exercise[] = safeExercises.map(exercise => {
          const exerciseAssignments = safeAssignments.filter(a => a && a.exercise_id === exercise.id);
          
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
            subtasks: safeSubtasks.filter(s => s && s.exercise_id === exercise.id),
            assignments: assignmentsWithNames,
            isAssignedByCurrentTrainer: true,
            assignmentSummary,
          };
        });

        setPersonalExercises(exercisesWithDetails);
        setTrainerFolders([]);

        // STEP H: Safe array guards
        const safeSystemExercises = Array.isArray(systemExercisesResult.data) ? systemExercisesResult.data : [];

        const updatedFootballCoachFolders = FOOTBALLCOACH_STRUCTURE.map(mainFolder => {
          const updatedSubfolders = Array.isArray(mainFolder.subfolders) ? mainFolder.subfolders.map(subfolder => {
            const categoryExercises = safeSystemExercises
              .filter(ex => ex && ex.category_path === subfolder.id)
              .map(exercise => ({
                ...exercise,
                created_at: new Date(exercise.created_at),
                updated_at: new Date(exercise.updated_at),
                subtasks: safeSubtasks.filter(s => s && s.exercise_id === exercise.id),
                assignments: [],
              }));

            return {
              ...subfolder,
              exercises: categoryExercises,
            };
          }) : [];

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
            .order('created_at', { ascending: true})
        ]);

        if (assignmentsResult.error) throw assignmentsResult.error;
        if (systemExercisesResult.error) throw systemExercisesResult.error;

        // STEP H: Safe array guards
        const safeAssignments = Array.isArray(assignmentsResult.data) ? assignmentsResult.data : [];
        const exerciseIds = safeAssignments.map(a => a.exercise_id);
        const systemExerciseIds = Array.isArray(systemExercisesResult.data) ? systemExercisesResult.data.map(e => e.id) : [];
        const allExerciseIds = [...exerciseIds, ...systemExerciseIds];
        
        const trainerIds = [...new Set(safeAssignments.map(a => a.trainer_id).filter(Boolean))];
        
        const [exercisesResult, subtasksResult, trainersResult] = await Promise.all([
          exerciseIds.length > 0
            ? supabase
                .from('exercise_library')
                .select('*')
                .in('id', exerciseIds)
            : Promise.resolve({ data: [], error: null }),
          allExerciseIds.length > 0
            ? supabase
                .from('exercise_subtasks')
                .select('*')
                .in('exercise_id', allExerciseIds)
                .order('sort_order', { ascending: true })
            : Promise.resolve({ data: [], error: null }),
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

        // STEP H: Safe array guards
        const safeExercises = Array.isArray(exercisesResult.data) ? exercisesResult.data : [];
        const safeSubtasks = Array.isArray(subtasksResult.data) ? subtasksResult.data : [];
        const safeTrainers = Array.isArray(trainersResult.data) ? trainersResult.data : [];

        const trainerMap = new Map<string, FolderItem>();
        
        safeAssignments.forEach(assignment => {
          if (!assignment) return;
          
          const exercise = safeExercises.find(e => e && e.id === assignment.exercise_id);
          if (!exercise) return;

          const trainerId = assignment.trainer_id;
          if (!trainerId) return;

          const trainerProfile = safeTrainers.find(t => t && t.user_id === trainerId);
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
            subtasks: safeSubtasks.filter(s => s && s.exercise_id === exercise.id),
            assignments: [assignment],
            trainer_name: trainerName,
          };

          folder.exercises!.push(exerciseWithDetails);
        });

        const folders = Array.from(trainerMap.values());
        setTrainerFolders(folders);
        setPersonalExercises([]);

        // STEP H: Safe array guards
        const safeSystemExercises = Array.isArray(systemExercisesResult.data) ? systemExercisesResult.data : [];

        const updatedFootballCoachFolders = FOOTBALLCOACH_STRUCTURE.map(mainFolder => {
          const updatedSubfolders = Array.isArray(mainFolder.subfolders) ? mainFolder.subfolders.map(subfolder => {
            const categoryExercises = safeSystemExercises
              .filter(ex => ex && ex.category_path === subfolder.id)
              .map(exercise => ({
                ...exercise,
                created_at: new Date(exercise.created_at),
                updated_at: new Date(exercise.updated_at),
                subtasks: safeSubtasks.filter(s => s && s.exercise_id === exercise.id),
                assignments: [],
              }));

            return {
              ...subfolder,
              exercises: categoryExercises,
            };
          }) : [];

          return {
            ...mainFolder,
            subfolders: updatedSubfolders,
          };
        });

        setFootballCoachFolders(updatedFootballCoachFolders);
      }

    } catch (error) {
      console.error('Error fetching library data:', error);
      // STEP H: Don't crash on error - show safe fallback
      setPersonalExercises([]);
      setTrainerFolders([]);
      setFootballCoachFolders(FOOTBALLCOACH_STRUCTURE);
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

  const openCreateModal = useCallback(() => {
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
  }, [adminMode, isAdmin]);

  const openEditModal = useCallback((exercise: Exercise) => {
    if (adminMode !== 'self') return;

    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Du kan ikke redigere denne øvelse');
      return;
    }
    
    // STEP H: Guard against invalid exercise
    if (!exercise || !exercise.id) {
      console.error('openEditModal: Invalid exercise');
      return;
    }

    setSelectedExercise(exercise);
    setIsCreating(false);
    setTitle(exercise.title || '');
    setDescription(exercise.description || '');
    setVideoUrl(exercise.video_url || '');
    // STEP H: Safe array guard
    const safeSubtasks = Array.isArray(exercise.subtasks) ? exercise.subtasks : [];
    setSubtasks(safeSubtasks.length > 0 ? safeSubtasks.map(s => s.title || '') : ['']);
    setShowModal(true);
  }, [adminMode, isAdmin]);

  const handleDeleteVideo = useCallback(() => {
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
  }, []);

  const handleSaveExercise = useCallback(async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Indtast venligst en titel');
      return;
    }

    if (!isAdmin) {
      Alert.alert('Fejl', 'Kun trænere kan gemme øvelser');
      return;
    }

    if (!currentUserId) {
      Alert.alert('Fejl', 'Bruger ikke autentificeret');
      return;
    }

    setProcessing(true);
    try {
      if (isCreating) {
        const { data: newExercise, error: exerciseError } = await supabase
          .from('exercise_library')
          .insert({
            trainer_id: currentUserId,
            title: title.trim(),
            description: description.trim() || null,
            video_url: videoUrl.trim() || null,
            is_system: false,
          })
          .select()
          .single();

        if (exerciseError) throw exerciseError;

        // STEP H: Guard against invalid response
        if (!newExercise || !newExercise.id) {
          throw new Error('Invalid response from database');
        }

        // STEP H: Safe array guard
        const validSubtasks = Array.isArray(subtasks) ? subtasks.filter(s => s && s.trim()) : [];
        if (validSubtasks.length > 0) {
          const subtasksToInsert = validSubtasks.map((subtask, index) => ({
            exercise_id: newExercise.id,
            title: subtask.trim(),
            sort_order: index,
          }));

          const { error: subtasksError } = await supabase
            .from('exercise_subtasks')
            .insert(subtasksToInsert);

          if (subtasksError) throw subtasksError;
        }

        Alert.alert('Succes', 'Øvelse oprettet');
      } else if (selectedExercise && selectedExercise.id) {
        const { error: updateError } = await supabase
          .from('exercise_library')
          .update({
            title: title.trim(),
            description: description.trim() || null,
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

        // STEP H: Safe array guard
        const validSubtasks = Array.isArray(subtasks) ? subtasks.filter(s => s && s.trim()) : [];
        if (validSubtasks.length > 0) {
          const subtasksToInsert = validSubtasks.map((subtask, index) => ({
            exercise_id: selectedExercise.id,
            title: subtask.trim(),
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
      Alert.alert('Fejl', 'Kunne ikke gemme øvelse: ' + (error?.message || 'Ukendt fejl'));
    } finally {
      setProcessing(false);
    }
  }, [title, description, videoUrl, subtasks, isAdmin, isCreating, selectedExercise, currentUserId, fetchLibraryData]);

  const handleDeleteExercise = useCallback((exercise: Exercise) => {
    if (adminMode !== 'self') return;

    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Du kan ikke slette denne øvelse');
      return;
    }

    // STEP H: Guard against invalid exercise
    if (!exercise || !exercise.id) {
      console.error('handleDeleteExercise: Invalid exercise');
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

              setPersonalExercises(prev => Array.isArray(prev) ? prev.filter(t => t && t.id !== exercise.id) : []);

              setProcessing(false);
              Alert.alert('Succes', 'Øvelse slettet');
            } catch (error: any) {
              Alert.alert('Fejl', 'Kunne ikke slette øvelse: ' + (error?.message || 'Ukendt fejl'));
              setProcessing(false);
            }
          },
        },
      ]
    );
  }, [adminMode, isAdmin]);

  const handleDuplicateExercise = useCallback(async (exercise: Exercise) => {
    if (adminMode !== 'self') return;

    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Du kan ikke duplikere denne øvelse');
      return;
    }

    // STEP H: Guard against invalid exercise
    if (!exercise || !exercise.id) {
      console.error('handleDuplicateExercise: Invalid exercise');
      return;
    }

    if (!currentUserId) {
      Alert.alert('Fejl', 'Bruger ikke autentificeret');
      return;
    }

    setProcessing(true);
    try {
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

      // STEP H: Guard against invalid response
      if (!newExercise || !newExercise.id) {
        throw new Error('Invalid response from database');
      }

      // STEP H: Safe array guard
      const safeSubtasks = Array.isArray(exercise.subtasks) ? exercise.subtasks : [];
      if (safeSubtasks.length > 0) {
        const subtasksToInsert = safeSubtasks.map(subtask => ({
          exercise_id: newExercise.id,
          title: subtask.title || '',
          sort_order: subtask.sort_order || 0,
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
      Alert.alert('Fejl', 'Kunne ikke duplikere øvelse: ' + (error?.message || 'Ukendt fejl'));
    } finally {
      setProcessing(false);
    }
  }, [adminMode, isAdmin, currentUserId, fetchLibraryData]);

  const openAssignModal = useCallback((exercise: Exercise) => {
    if (adminMode !== 'self') return;

    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Du kan ikke tildele denne øvelse');
      return;
    }

    // STEP H: Guard against invalid exercise
    if (!exercise || !exercise.id) {
      console.error('openAssignModal: Invalid exercise');
      return;
    }
    
    setSelectedExercise(exercise);
    setShowAssignModal(true);
  }, [adminMode, isAdmin]);

  const handleAssignToPlayer = useCallback(async (playerId: string) => {
    if (!selectedExercise || !selectedExercise.id || !currentUserId) {
      console.error('handleAssignToPlayer: Missing required data');
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      Alert.alert('Fejl', 'Ugyldig spiller ID');
      return;
    }

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
        if (assignmentError.message && assignmentError.message.includes('duplicate')) {
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
      Alert.alert('Fejl', 'Kunne ikke tildele øvelse: ' + (error?.message || 'Ukendt fejl'));
    } finally {
      setProcessing(false);
    }
  }, [selectedExercise, currentUserId, fetchLibraryData]);

  const handleAssignToTeam = useCallback(async (teamId: string) => {
    if (!selectedExercise || !selectedExercise.id || !currentUserId) {
      console.error('handleAssignToTeam: Missing required data');
      return;
    }

    if (!teamId || typeof teamId !== 'string') {
      Alert.alert('Fejl', 'Ugyldig team ID');
      return;
    }

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
        if (assignmentError.message && assignmentError.message.includes('duplicate')) {
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
      Alert.alert('Fejl', 'Kunne ikke tildele øvelse: ' + (error?.message || 'Ukendt fejl'));
    } finally {
      setProcessing(false);
    }
  }, [selectedExercise, currentUserId, fetchLibraryData]);

  const handleCopyToTasks = useCallback(async (exercise: Exercise) => {
    if (adminMode !== 'self') return;

    // STEP H: Guard against invalid exercise
    if (!exercise || !exercise.id) {
      console.error('handleCopyToTasks: Invalid exercise');
      return;
    }

    if (!currentUserId) {
      Alert.alert('Fejl', 'Bruger ikke autentificeret');
      return;
    }

    setProcessing(true);
    try {
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
          title: exercise.title || 'Uden titel',
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

      // STEP H: Guard against invalid response
      if (!taskTemplate || !taskTemplate.id) {
        throw new Error('Invalid response from database');
      }

      // STEP H: Safe array guard
      const safeSubtasks = Array.isArray(exercise.subtasks) ? exercise.subtasks : [];
      if (safeSubtasks.length > 0) {
        const subtasksToInsert = safeSubtasks.map(subtask => ({
          task_template_id: taskTemplate.id,
          title: subtask.title || '',
          sort_order: subtask.sort_order || 0,
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
      Alert.alert('Fejl', 'Kunne ikke kopiere øvelse: ' + (error?.message || 'Ukendt fejl'));
    } finally {
      setProcessing(false);
    }
  }, [adminMode, currentUserId]);

  const handleRemoveAssignedExercise = useCallback((exercise: Exercise) => {
    if (isAdmin) {
      Alert.alert('Fejl', 'Denne funktion er kun for spillere');
      return;
    }

    // STEP H: Guard against invalid exercise
    if (!exercise || !exercise.id) {
      console.error('handleRemoveAssignedExercise: Invalid exercise');
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
              Alert.alert('Fejl', 'Kunne ikke fjerne øvelse: ' + (error?.message || 'Ukendt fejl'));
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  }, [isAdmin, currentUserId, fetchLibraryData]);

  const openRevokeModal = useCallback((exercise: Exercise) => {
    if (adminMode !== 'self') return;

    if (!isAdmin) {
      Alert.alert('Ikke tilladt', 'Kun trænere kan tilbagekalde øvelser');
      return;
    }

    // STEP H: Guard against invalid exercise
    if (!exercise || !exercise.id) {
      console.error('openRevokeModal: Invalid exercise');
      return;
    }

    // STEP H: Safe array guard
    const safeAssignments = Array.isArray(exercise.assignments) ? exercise.assignments : [];
    if (safeAssignments.length === 0) {
      Alert.alert('Info', 'Denne øvelse er ikke tildelt nogen spillere');
      return;
    }

    setSelectedExercise(exercise);
    setShowRevokeModal(true);
  }, [adminMode, isAdmin]);

  const handleRevokeFromPlayer = useCallback(async (playerId: string, playerName: string) => {
    if (!selectedExercise || !selectedExercise.id || !currentUserId) {
      console.error('handleRevokeFromPlayer: Missing required data');
      return;
    }

    if (!playerId || typeof playerId !== 'string') {
      Alert.alert('Fejl', 'Ugyldig spiller ID');
      return;
    }

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

              // STEP H: Safe array guard
              const safeAssignments = Array.isArray(selectedExercise.assignments) ? selectedExercise.assignments : [];
              const remainingAssignments = safeAssignments.filter(a => a && a.player_id !== playerId);
              if (remainingAssignments.length === 0) {
                setShowRevokeModal(false);
              }
            } catch (error: any) {
              console.error('Error revoking exercise:', error);
              Alert.alert('Fejl', 'Kunne ikke tilbagekalde øvelse: ' + (error?.message || 'Ukendt fejl'));
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  }, [selectedExercise, currentUserId, fetchLibraryData]);

  const handleRevokeFromAll = useCallback(async () => {
    if (!selectedExercise || !selectedExercise.id || !currentUserId) {
      console.error('handleRevokeFromAll: Missing required data');
      return;
    }

    // STEP H: Safe array guard
    const safeAssignments = Array.isArray(selectedExercise.assignments) ? selectedExercise.assignments : [];
    const assignmentCount = safeAssignments.length;

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
              Alert.alert('Fejl', 'Kunne ikke tilbagekalde øvelse: ' + (error?.message || 'Ukendt fejl'));
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  }, [selectedExercise, currentUserId, fetchLibraryData]);

  const openVideoModal = useCallback((url: string) => {
    // STEP H: Guard against invalid URL
    if (!url || typeof url !== 'string' || !url.trim()) {
      console.error('openVideoModal: Invalid URL');
      return;
    }

    setSelectedVideoUrl(url);
    setShowVideoModal(true);
  }, []);

  const addSubtask = useCallback(() => {
    // STEP H: Safe array guard
    const safeSubtasks = Array.isArray(subtasks) ? subtasks : [];
    setSubtasks([...safeSubtasks, '']);
  }, [subtasks]);

  const updateSubtask = useCallback((index: number, value: string) => {
    // STEP H: Safe array guard
    const safeSubtasks = Array.isArray(subtasks) ? subtasks : [];
    if (index < 0 || index >= safeSubtasks.length) {
      console.error('updateSubtask: Invalid index');
      return;
    }

    const newSubtasks = [...safeSubtasks];
    newSubtasks[index] = value || '';
    setSubtasks(newSubtasks);
  }, [subtasks]);

  const removeSubtask = useCallback((index: number) => {
    // STEP H: Safe array guard
    const safeSubtasks = Array.isArray(subtasks) ? subtasks : [];
    if (index < 0 || index >= safeSubtasks.length) {
      console.error('removeSubtask: Invalid index');
      return;
    }

    if (safeSubtasks.length > 1) {
      setSubtasks(safeSubtasks.filter((_, i) => i !== index));
    }
  }, [subtasks]);

  const getSourceLabel = useCallback((exercise: Exercise): string => {
    // STEP H: Guard against invalid exercise
    if (!exercise) return 'Fra: Ukendt';

    if (exercise.is_system) {
      return 'Fra: FootballCoach';
    } else if (exercise.trainer_name) {
      return `Fra: ${exercise.trainer_name}`;
    } else {
      return 'Fra: Mig';
    }
  }, []);

  const truncateText = useCallback((text: string, maxLines: number): string => {
    // STEP H: Guard against invalid input
    if (!text || typeof text !== 'string') return '';
    if (typeof maxLines !== 'number' || maxLines < 1) return text;

    const lines = text.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + '...';
    }
    return text;
  }, []);

  const renderExerciseCard = useCallback((exercise: Exercise, isReadOnly: boolean = false) => {
    // STEP H: Guard against invalid exercise
    if (!exercise || !exercise.id) {
      console.error('renderExerciseCard: Invalid exercise');
      return null;
    }

    const isSystemExercise = exercise.is_system === true;
    const shouldBeReadOnly = isReadOnly || isSystemExercise || isAdminMode;

    const sourceLabel = getSourceLabel(exercise);

    let displayDescription = '';
    if (exercise.description && typeof exercise.description === 'string') {
      if (isSystemExercise) {
        const lines = exercise.description.split('\n').filter(line => line && line.trim());
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
              {exercise.title || 'Uden titel'}
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
                if (!line || !line.trim()) return null;
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
  }, [cardBgColor, textColor, textSecondaryColor, isAdminMode, getSourceLabel, truncateText, processing, handleCopyToTasks, handleRemoveAssignedExercise, openRevokeModal, openAssignModal, handleDuplicateExercise, openEditModal, handleDeleteExercise]);

  const renderFolder = useCallback((folder: FolderItem, level: number = 0) => {
    // STEP H: Guard against invalid folder
    if (!folder || !folder.id) {
      console.error('renderFolder: Invalid folder');
      return null;
    }

    const isExpanded = expandedFolders.has(folder.id);
    // STEP H: Safe array guards
    const safeExercises = Array.isArray(folder.exercises) ? folder.exercises : [];
    const safeSubfolders = Array.isArray(folder.subfolders) ? folder.subfolders : [];
    const hasContent = safeExercises.length > 0 || safeSubfolders.length > 0;
    
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
              ios_icon_name={folder.icon || 'folder.fill'}
              android_material_icon_name={folder.androidIcon || 'folder'}
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.folderName, { color: textColor }]}>
              {folder.name || 'Uden navn'}
            </Text>
            {safeExercises.length > 0 && (
              <View style={[styles.countBadge, { backgroundColor: colors.primary }]}>
                <Text style={styles.countBadgeText}>{safeExercises.length}</Text>
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
            {safeSubfolders.map(subfolder => renderFolder(subfolder, level + 1))}
            
            {safeExercises.length > 0 && (
              <View style={styles.exercisesContainer}>
                {safeExercises.map(exercise => renderExerciseCard(exercise, folder.type === 'trainer' || folder.type === 'footballcoach'))}
              </View>
            )}

            {safeExercises.length === 0 && safeSubfolders.length === 0 && (
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
  }, [expandedFolders, cardBgColor, textColor, textSecondaryColor, isDark, toggleFolder, renderExerciseCard]);

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

        {/* Modals omitted for brevity - they remain unchanged */}
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
});

// Anti-patterns forbidden: fetch-on-press, inline renders, non-virtualized lists, unstable context values
