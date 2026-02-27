import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  useColorScheme,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  FlatList,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { colors, getColors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useSubscriptionFeatures } from '@/hooks/useSubscriptionFeatures';
import { buildExercisePositionOptions } from '@/utils/exercisePositions';

const clampDifficulty = (value: number) => Math.max(0, Math.min(5, Math.round(value)));
const toOptionTestToken = (value: string | null) =>
  String(value ?? 'none')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

export default function CreateExerciseScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const theme = getColors(colorScheme);
  const roleInfo = useUserRole() as any;
  const roleLoading = roleInfo?.isLoading ?? roleInfo?.loading ?? false;
  const roleRaw = roleInfo?.userRole ?? roleInfo?.role ?? null;
  const roleStr = typeof roleRaw === 'string' ? roleRaw.toLowerCase() : '';
  const isTrainerLike =
    !!roleInfo?.isTrainer ||
    roleStr.includes('trainer') ||
    roleStr.includes('coach');
  const isAdmin =
    !!roleInfo?.isAdmin ||
    roleStr === 'admin' ||
    roleStr.includes('admin');
  const { subscriptionTier } = useSubscriptionFeatures();
  const isTrainerByTier = subscriptionTier?.startsWith('trainer') ?? false;
  const canCreate = isAdmin || isTrainerLike || isTrainerByTier;
  const params = useLocalSearchParams();
  const exerciseId = useMemo(() => {
    const raw = (params as any)?.exerciseId;
    if (raw == null) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const trimmed = String(value ?? '').trim();
    return trimmed.length ? trimmed : null;
  }, [params]);
  const modeParam = useMemo(() => {
    const raw = (params as any)?.mode;
    if (raw == null) return null;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const trimmed = String(value ?? '').trim().toLowerCase();
    return trimmed.length ? trimmed : null;
  }, [params]);
  const isEditMode = useMemo(() => Boolean(exerciseId && (!modeParam || modeParam === 'edit')), [exerciseId, modeParam]);
  const screenTitle = isEditMode ? 'Rediger øvelse' : 'Opret øvelse';

  const [userId, setUserId] = useState<string | null>(null);
  const [fetchingUser, setFetchingUser] = useState(true);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [categoryPath, setCategoryPath] = useState('');
  const [difficulty, setDifficulty] = useState(3);
  const [position, setPosition] = useState<string | null>(null);
  const [positionModalVisible, setPositionModalVisible] = useState(false);

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingExercise, setLoadingExercise] = useState(false);
  const [editLockMessage, setEditLockMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setFetchingUser(true);
        const { data, error } = await supabase.auth.getUser();
        if (cancelled) return;
        if (error) throw error;
        setUserId(data?.user?.id ?? null);
      } catch (err: any) {
        if (!cancelled) {
          setErrorMessage(err?.message ?? 'Kunne ikke hente bruger.');
        }
      } finally {
        if (!cancelled) {
          setFetchingUser(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!exerciseId) {
      setLoadingExercise(false);
      setEditLockMessage(null);
      return;
    }
    if (!userId || fetchingUser) return;
    let cancelled = false;
    setLoadingExercise(true);
    setEditLockMessage(null);
    setErrorMessage(null);
    (async () => {
      try {
        const { data, error } = await supabase
          .from('exercise_library')
          .select('*')
          .eq('id', exerciseId)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        if (!data) throw new Error('Øvelsen blev ikke fundet.');

        const trainerId = (data as any)?.trainer_id ? String((data as any).trainer_id) : null;
        const isSystem = Boolean((data as any)?.is_system);

        if (isSystem || trainerId !== userId) {
          Alert.alert('Ingen adgang', 'Du kan ikke redigere denne øvelse.');
          setEditLockMessage('Du kan ikke redigere denne øvelse.');
          setErrorMessage('Du kan ikke redigere denne øvelse.');
          return;
        }

        setTitle(String((data as any)?.title ?? ''));
        setDescription((data as any)?.description ?? '');
        setVideoUrl((data as any)?.video_url ?? '');
        setCategoryPath((data as any)?.category_path ?? '');
        setPosition((data as any)?.position ?? (data as any)?.player_position ?? null);
        const rawDifficulty = typeof (data as any)?.difficulty === 'number' ? (data as any).difficulty : Number((data as any)?.difficulty);
        const normalizedDifficulty = Number.isFinite(rawDifficulty) ? Number(rawDifficulty) : 3;
        setDifficulty(clampDifficulty(normalizedDifficulty));
      } catch (err: any) {
        if (!cancelled) {
          const message = err?.message ?? 'Kunne ikke hente øvelsen.';
          setErrorMessage(message);
          setEditLockMessage(message);
        }
      } finally {
        if (!cancelled) {
          setLoadingExercise(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exerciseId, fetchingUser, userId]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleAdjustDifficulty = useCallback((delta: number) => {
    setDifficulty(prev => clampDifficulty(prev + delta));
  }, []);

  const trimmedTitle = title.trim();
  const canSave = canCreate && !saving && !loadingExercise && !editLockMessage && trimmedTitle.length > 0;

  const handleSave = useCallback(async () => {
    if (!canCreate) {
      Alert.alert('Kun for trænere', 'Opret øvelse kræver et træner-abonnement.');
      return;
    }
    if (!userId) {
      Alert.alert('Ingen bruger', 'Du skal være logget ind for at oprette eller redigere en øvelse.');
      return;
    }
    if (loadingExercise) return;
    if (editLockMessage) {
      Alert.alert('Kan ikke gemme', editLockMessage);
      return;
    }
    if (!trimmedTitle) {
      setErrorMessage('Tilføj en titel til øvelsen.');
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    const normalizedDescription = description.trim();
    const normalizedVideo = videoUrl.trim();
    const normalizedPosition = typeof position === 'string' && position.trim().length ? position.trim() : null;
    const payload = {
      title: trimmedTitle,
      description: normalizedDescription ? normalizedDescription : null,
      video_url: normalizedVideo ? normalizedVideo : null,
      category_path: isEditMode ? (categoryPath.trim() ? categoryPath.trim() : null) : null,
      difficulty,
      position: normalizedPosition,
    };

    try {
      if (isEditMode && exerciseId) {
        const { error } = await supabase
          .from('exercise_library')
          .update(payload as any)
          .eq('id', exerciseId)
          .eq('trainer_id', userId);
        if (error) throw error;
        router.replace({ pathname: '/exercise-details', params: { exerciseId } } as any);
      } else {
        const insertPayload = { ...payload, trainer_id: userId, is_system: false };
        const { data, error } = await supabase.from('exercise_library').insert(insertPayload as any).select('id').single();
        if (error) throw error;
        const newId = data?.id ? String(data.id) : null;
        if (newId) {
          router.replace({ pathname: '/exercise-details', params: { exerciseId: newId } } as any);
        } else {
          router.back();
        }
      }
    } catch (err: any) {
      const fallbackMessage = isEditMode ? 'Kunne ikke opdatere øvelsen.' : 'Kunne ikke oprette øvelse.';
      setErrorMessage(err?.message || fallbackMessage);
    } finally {
      setSaving(false);
    }
  }, [
    canCreate,
    categoryPath,
    description,
    difficulty,
    editLockMessage,
    exerciseId,
    isEditMode,
    loadingExercise,
    router,
    trimmedTitle,
    userId,
    videoUrl,
    position,
  ]);

  const positionOptions = useMemo(() => buildExercisePositionOptions(), []);
  const selectedPositionLabel = useMemo(() => {
    const fromOptions = positionOptions.find((option) => option.value === position)?.label;
    if (fromOptions) return fromOptions;
    if (position && position.trim().length) return position;
    return 'Ingen';
  }, [position, positionOptions]);

  const renderStars = useMemo(
    () => (
      <View style={styles.starRow}>
        {Array.from({ length: 5 }).map((_, index) => (
          <IconSymbol
            key={`difficulty-${index}`}
            ios_icon_name="star.fill"
            android_material_icon_name="star"
            size={16}
            color={index < difficulty ? colors.warning : theme.highlight}
          />
        ))}
      </View>
    ),
    [difficulty, theme.highlight]
  );

  const renderForm = () => (
    <ScrollView contentContainerStyle={styles.contentPad} showsVerticalScrollIndicator={false}>
      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Titel *</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Eks. Aflevering på førsteberøring"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.highlight }]}
          autoCapitalize="sentences"
          autoCorrect
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Beskrivelse</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Tilføj noter, fokuspunkter og coaching cues"
          placeholderTextColor={theme.textSecondary}
          style={[styles.multilineInput, { backgroundColor: theme.card, color: theme.text, borderColor: theme.highlight }]}
          autoCapitalize="sentences"
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Video-link (valgfri)</Text>
        <TextInput
          value={videoUrl}
          onChangeText={setVideoUrl}
          placeholder="https://"
          placeholderTextColor={theme.textSecondary}
          style={[styles.input, { backgroundColor: theme.card, color: theme.text, borderColor: theme.highlight }]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Position</Text>
        <TouchableOpacity
          testID="exercise-position-select"
          onPress={() => setPositionModalVisible(true)}
          activeOpacity={0.85}
          style={[styles.input, styles.selectInput, { backgroundColor: theme.card, borderColor: theme.highlight }]}
        >
          <Text style={[styles.selectValueText, { color: theme.text }]}>{selectedPositionLabel}</Text>
          <IconSymbol ios_icon_name="chevron.down" android_material_icon_name="arrow_drop_down" size={20} color={theme.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={[styles.label, { color: theme.text }]}>Sværhedsgrad</Text>
        <View style={[styles.difficultyCard, { backgroundColor: theme.card }]}> 
          <View style={styles.difficultyHeader}>
            <Text style={[styles.difficultyValue, { color: theme.text }]}>{difficulty}</Text>
            {renderStars}
          </View>
          <View style={styles.difficultyActions}>
            <TouchableOpacity
              onPress={() => handleAdjustDifficulty(-1)}
              activeOpacity={0.8}
              disabled={difficulty <= 0}
              style={[styles.adjustButton, { borderColor: theme.highlight }, difficulty <= 0 ? { opacity: 0.4 } : null]}
            >
              <IconSymbol ios_icon_name="minus" android_material_icon_name="remove" size={18} color={theme.text} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleAdjustDifficulty(1)}
              activeOpacity={0.8}
              disabled={difficulty >= 5}
              style={[styles.adjustButton, { borderColor: theme.highlight }, difficulty >= 5 ? { opacity: 0.4 } : null]}
            >
              <IconSymbol ios_icon_name="plus" android_material_icon_name="add" size={18} color={theme.text} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={{ height: 80 }} />

      <Modal
        animationType="slide"
        transparent
        visible={positionModalVisible}
        onRequestClose={() => setPositionModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPositionModalVisible(false)}>
          <Pressable style={[styles.modalCard, { backgroundColor: theme.background }]} onPress={(event) => event.stopPropagation()}>
            <View style={[styles.modalHandle, { backgroundColor: theme.highlight }]} />
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTextWrap}>
                <Text style={[styles.modalTitle, { color: theme.text }]}>Vælg position</Text>
                <Text style={[styles.modalSubtitle, { color: theme.textSecondary }]}>Bruges til at kategorisere øvelsen i biblioteket.</Text>
              </View>
              <TouchableOpacity
                onPress={() => setPositionModalVisible(false)}
                activeOpacity={0.85}
                style={[styles.modalCloseButton, { backgroundColor: theme.card, borderColor: theme.highlight }]}
              >
                <IconSymbol ios_icon_name="xmark" android_material_icon_name="close" size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={positionOptions}
              keyExtractor={(item) => String(item.value ?? 'none')}
              contentContainerStyle={styles.modalListContent}
              renderItem={({ item }) => {
                const isSelected = item.value === position;
                return (
                  <TouchableOpacity
                    testID={`exercise-position-option-${toOptionTestToken(item.value)}`}
                    onPress={() => {
                      setPosition(item.value);
                      setPositionModalVisible(false);
                    }}
                    style={[
                      styles.optionRow,
                      {
                        borderColor: isSelected ? theme.primary : theme.highlight,
                        backgroundColor: isSelected ? theme.highlight : theme.card,
                      },
                    ]}
                    activeOpacity={0.8}
                  >
                    <View style={styles.optionLeft}>
                      <Text style={[styles.optionText, { color: theme.text }]}>{item.label}</Text>
                    </View>
                    {isSelected ? (
                      <View style={[styles.optionCheckWrap, { backgroundColor: theme.primary }]}>
                        <IconSymbol ios_icon_name="checkmark" android_material_icon_name="check" size={14} color="#fff" />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );

  const screenHeader = <Stack.Screen options={{ headerShown: false, title: screenTitle }} />;

  if (roleLoading || fetchingUser) {
    return (
      <>
        {screenHeader}
        <View style={[styles.lockedContainer, { backgroundColor: theme.background }]}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.lockedSubtitle, { marginTop: 12 }]}>Indlæser...</Text>
        </View>
      </>
    );
  }

  if (!canCreate) {
    return (
      <>
        {screenHeader}
        <View style={[styles.lockedContainer, { backgroundColor: theme.background }]}>
          <IconSymbol ios_icon_name="lock.fill" android_material_icon_name="lock" size={48} color={colors.textSecondary} />
          <Text style={styles.lockedTitle}>Ingen adgang</Text>
          <Text style={styles.lockedSubtitle}>Opret øvelse kræver et træner-abonnement. Gå til din profil for at opgradere.</Text>
          <TouchableOpacity style={styles.lockedButton} onPress={() => router.push('/(tabs)/profile')}>
            <Text style={styles.lockedButtonText}>Gå til profil</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  return (
    <>
      {screenHeader}
      <KeyboardAvoidingView style={[styles.screen, { backgroundColor: theme.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={styles.iconButton}>
            <IconSymbol ios_icon_name="chevron.left" android_material_icon_name="chevron_left" size={22} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: theme.text }]}>{screenTitle}</Text>
          <TouchableOpacity
            onPress={handleSave}
            activeOpacity={0.9}
            disabled={!canSave}
            style={[styles.saveButton, { backgroundColor: theme.primary }, !canSave ? { opacity: 0.5 } : null]}
          >
            <Text style={styles.saveButtonText}>{saving ? 'Gemmer...' : 'Gem'}</Text>
          </TouchableOpacity>
        </View>

        {errorMessage ? (
          <Text style={[styles.errorText, { color: theme.error }]}>{errorMessage}</Text>
        ) : null}

        {isEditMode && loadingExercise ? (
          <View style={[styles.stateCard, { backgroundColor: theme.card }]}>
            <ActivityIndicator color={theme.primary} />
            <Text style={[styles.stateMessage, { color: theme.textSecondary, marginTop: 10 }]}>Henter øvelse...</Text>
          </View>
        ) : null}

        {renderForm()}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    paddingTop: Platform.OS === 'android' ? 54 : 56,
    paddingHorizontal: 18,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: { padding: 6 },
  title: { fontSize: 20, fontWeight: '900' },
  saveButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
  },
  saveButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  errorText: {
    marginHorizontal: 18,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '600',
  },
  contentPad: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  fieldGroup: { marginBottom: 18 },
  label: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  input: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  multilineInput: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
    minHeight: 140,
  },
  selectInput: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectValueText: {
    fontSize: 14,
    fontWeight: '600',
  },
  helperText: { fontSize: 12, marginTop: 6 },
  difficultyCard: {
    borderRadius: 16,
    padding: 14,
  },
  difficultyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  difficultyValue: { fontSize: 22, fontWeight: '900' },
  difficultyActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 12,
  },
  adjustButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  starRow: { flexDirection: 'row', gap: 4 },
  stateCard: {
    marginHorizontal: 18,
    marginTop: 24,
    padding: 18,
    borderRadius: 16,
  },
  stateTitle: { fontSize: 16, fontWeight: '800' },
  stateMessage: { marginTop: 8, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  primaryButton: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  saveDisabled: { opacity: 0.5 },
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockedTitle: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  lockedSubtitle: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '400',
    color: colors.textSecondary,
    textAlign: 'center',
  },
  lockedButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.primary,
  },
  lockedButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    paddingBottom: 24,
    maxHeight: '70%',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -8 },
    elevation: 18,
  },
  modalHandle: {
    width: 44,
    height: 5,
    borderRadius: 999,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  modalHeaderTextWrap: {
    flex: 1,
  },
  modalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '900',
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalListContent: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  optionRow: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  optionLeft: {
    flex: 1,
    paddingRight: 8,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '700',
  },
  optionCheckWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
