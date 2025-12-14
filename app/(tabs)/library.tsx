
import React, { useState, useEffect } from 'react';
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
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/app/integrations/supabase/client';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';

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

export default function LibraryScreen() {
  const { teams, players } = useTeamPlayer();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [processing, setProcessing] = useState(false);
  
  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [subtasks, setSubtasks] = useState<string[]>(['']);
  
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const bgColor = isDark ? '#1a1a1a' : colors.background;
  const cardBgColor = isDark ? '#2a2a2a' : colors.card;
  const textColor = isDark ? '#e3e3e3' : colors.text;
  const textSecondaryColor = isDark ? '#999' : colors.textSecondary;

  useEffect(() => {
    fetchExercises();
  }, []);

  const fetchExercises = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch exercises
      const { data: exercisesData, error: exercisesError } = await supabase
        .from('exercise_library')
        .select('*')
        .eq('trainer_id', user.id)
        .order('created_at', { ascending: false });

      if (exercisesError) throw exercisesError;

      // Fetch subtasks for all exercises
      const exerciseIds = exercisesData?.map(e => e.id) || [];
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

      // Combine data
      const exercisesWithDetails: Exercise[] = (exercisesData || []).map(exercise => ({
        ...exercise,
        created_at: new Date(exercise.created_at),
        updated_at: new Date(exercise.updated_at),
        subtasks: (subtasksData || []).filter(s => s.exercise_id === exercise.id),
        assignments: (assignmentsData || []).filter(a => a.exercise_id === exercise.id),
      }));

      setExercises(exercisesWithDetails);
    } catch (error) {
      console.error('Error fetching exercises:', error);
      Alert.alert('Fejl', 'Kunne ikke hente øvelser');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setSelectedExercise(null);
    setIsCreating(true);
    setTitle('');
    setDescription('');
    setVideoUrl('');
    setSubtasks(['']);
    setShowModal(true);
  };

  const openEditModal = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setIsCreating(false);
    setTitle(exercise.title);
    setDescription(exercise.description || '');
    setVideoUrl(exercise.video_url || '');
    setSubtasks(exercise.subtasks.length > 0 ? exercise.subtasks.map(s => s.title) : ['']);
    setShowModal(true);
  };

  const handleSaveExercise = async () => {
    if (!title.trim()) {
      Alert.alert('Fejl', 'Indtast venligst en titel');
      return;
    }

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (isCreating) {
        // Create new exercise
        const { data: newExercise, error: exerciseError } = await supabase
          .from('exercise_library')
          .insert({
            trainer_id: user.id,
            title,
            description: description || null,
            video_url: videoUrl || null,
          })
          .select()
          .single();

        if (exerciseError) throw exerciseError;

        // Create subtasks
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
        // Update existing exercise
        const { error: updateError } = await supabase
          .from('exercise_library')
          .update({
            title,
            description: description || null,
            video_url: videoUrl || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', selectedExercise.id);

        if (updateError) throw updateError;

        // Delete old subtasks
        const { error: deleteError } = await supabase
          .from('exercise_subtasks')
          .delete()
          .eq('exercise_id', selectedExercise.id);

        if (deleteError) throw deleteError;

        // Create new subtasks
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
      await fetchExercises();
    } catch (error: any) {
      console.error('Error saving exercise:', error);
      Alert.alert('Fejl', 'Kunne ikke gemme øvelse: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteExercise = (exercise: Exercise) => {
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
              await fetchExercises();
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
    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create duplicate exercise
      const { data: newExercise, error: exerciseError } = await supabase
        .from('exercise_library')
        .insert({
          trainer_id: user.id,
          title: `${exercise.title} (kopi)`,
          description: exercise.description,
          video_url: exercise.video_url,
        })
        .select()
        .single();

      if (exerciseError) throw exerciseError;

      // Duplicate subtasks
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
      await fetchExercises();
    } catch (error: any) {
      console.error('Error duplicating exercise:', error);
      Alert.alert('Fejl', 'Kunne ikke duplikere øvelse: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const openAssignModal = (exercise: Exercise) => {
    setSelectedExercise(exercise);
    setShowAssignModal(true);
  };

  const handleAssignToPlayer = async (playerId: string) => {
    if (!selectedExercise) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('exercise_assignments')
        .insert({
          exercise_id: selectedExercise.id,
          trainer_id: user.id,
          player_id: playerId,
          team_id: null,
        });

      if (error) {
        if (error.message.includes('duplicate')) {
          Alert.alert('Info', 'Denne øvelse er allerede tildelt denne spiller');
        } else {
          throw error;
        }
      } else {
        Alert.alert('Succes', 'Øvelse tildelt spiller');
        await fetchExercises();
      }
    } catch (error: any) {
      console.error('Error assigning exercise:', error);
      Alert.alert('Fejl', 'Kunne ikke tildele øvelse: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleAssignToTeam = async (teamId: string) => {
    if (!selectedExercise) return;

    setProcessing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('exercise_assignments')
        .insert({
          exercise_id: selectedExercise.id,
          trainer_id: user.id,
          player_id: null,
          team_id: teamId,
        });

      if (error) {
        if (error.message.includes('duplicate')) {
          Alert.alert('Info', 'Denne øvelse er allerede tildelt dette team');
        } else {
          throw error;
        }
      } else {
        Alert.alert('Succes', 'Øvelse tildelt team');
        await fetchExercises();
      }
    } catch (error: any) {
      console.error('Error assigning exercise:', error);
      Alert.alert('Fejl', 'Kunne ikke tildele øvelse: ' + error.message);
    } finally {
      setProcessing(false);
    }
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

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: bgColor }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: textColor }]}>Indlæser bibliotek...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor }]}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.headerTitle, { color: textColor }]}>Øvelsesbibliotek</Text>
          <Text style={[styles.headerSubtitle, { color: textSecondaryColor }]}>
            {exercises.length} øvelser
          </Text>
        </View>
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
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {exercises.length === 0 ? (
          <View style={[styles.emptyState, { backgroundColor: cardBgColor }]}>
            <IconSymbol
              ios_icon_name="book.fill"
              android_material_icon_name="menu_book"
              size={64}
              color={textSecondaryColor}
            />
            <Text style={[styles.emptyTitle, { color: textColor }]}>Ingen øvelser endnu</Text>
            <Text style={[styles.emptyText, { color: textSecondaryColor }]}>
              Opret din første øvelse for at komme i gang
            </Text>
          </View>
        ) : (
          exercises.map((exercise) => (
            <View key={exercise.id} style={[styles.exerciseCard, { backgroundColor: cardBgColor }]}>
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
                    {exercise.assignments.length > 0 && (
                      <Text style={[styles.assignmentCount, { color: textSecondaryColor }]}>
                        Tildelt til {exercise.assignments.length} spiller{exercise.assignments.length !== 1 ? 'e' : ''}/team
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.exerciseActions}>
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
                </View>
              </View>

              {exercise.description && (
                <Text style={[styles.exerciseDescription, { color: textSecondaryColor }]}>
                  {exercise.description}
                </Text>
              )}

              {exercise.video_url && (
                <View style={styles.videoIndicator}>
                  <IconSymbol
                    ios_icon_name="play.rectangle.fill"
                    android_material_icon_name="play_circle"
                    size={16}
                    color={colors.primary}
                  />
                  <Text style={[styles.videoText, { color: colors.primary }]}>Video tilgængelig</Text>
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
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Create/Edit Exercise Modal */}
      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalContainer, { backgroundColor: bgColor }]}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
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

            <Text style={[styles.label, { color: textColor }]}>Video URL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: cardBgColor, color: textColor }]}
              value={videoUrl}
              onChangeText={setVideoUrl}
              placeholder="https://youtube.com/..."
              placeholderTextColor={textSecondaryColor}
              editable={!processing}
              autoCapitalize="none"
            />

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
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={handleSaveExercise}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Gem</Text>
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
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  emptyState: {
    borderRadius: 20,
    padding: 48,
    alignItems: 'center',
    marginTop: 40,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  exerciseCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
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
  assignmentCount: {
    fontSize: 14,
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
  exerciseDescription: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 12,
  },
  videoIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  videoText: {
    fontSize: 14,
    fontWeight: '600',
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
